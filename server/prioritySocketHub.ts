import type http from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';

export type PrioritySymbolId = 'BTCUSD' | 'XAUUSD' | 'DXY' | 'ETHUSD';

export interface PrioritySocketQuote {
  id: PrioritySymbolId;
  price: number;
  prevClose: number;
  changeValue: number;
  changePercent: number;
  bid?: number;
  ask?: number;
  dayHigh?: number;
  dayLow?: number;
  marketSessionOpen: boolean;
  sessionStateLabel: string;
  updatedAtEpoch: number;
  sourceLabel: string;
}

interface InternalQuoteState {
  id: PrioritySymbolId;
  decimals: number;
  price: number;
  prevClose: number;
  changeValue: number;
  changePercent: number;
  bid?: number;
  ask?: number;
  dayHigh?: number;
  dayLow?: number;
  updatedAtEpoch: number;
  sourceLabel: string;
}

const UA_STRING =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const quoteStore = new Map<PrioritySymbolId, InternalQuoteState>();
const lastBroadcastAt = new Map<PrioritySymbolId, number>();
// High-frequency WebSocket push to clients is strictly dedicated to XAU/USD and BTC/USD.
// Non-critical symbols (DXY, ETHUSD, indices, stocks) are served via throttled HTTP polling.
const STRICT_WS_BROADCAST_IDS = new Set<PrioritySymbolId>(['XAUUSD', 'BTCUSD']);
type PriorityTickListener = (quote: PrioritySocketQuote) => void;
const tickListeners = new Set<PriorityTickListener>();

export function registerPriorityTickListener(listener: PriorityTickListener): () => void {
  tickListeners.add(listener);
  return () => {
    tickListeners.delete(listener);
  };
}

let wss: WebSocketServer | null = null;
let started = false;
let coinbaseWs: WebSocket | null = null;
let binanceFailoverWs: WebSocket | null = null;
let tvWs: WebSocket | null = null;

let coinbaseConnected = false;
let binanceConnected = false;
let tvConnected = false;
let lastCoinbaseTickAt = 0;
let lastTvXauTickAt = 0;

function getUtcSessionInfo(id: PrioritySymbolId, nowDate: Date): { isOpen: boolean; stateLabel: string } {
  if (id === 'BTCUSD' || id === 'ETHUSD') {
    return { isOpen: true, stateLabel: '24/7 Live' };
  }
  // Metals (XAU/USD) & DXY trade Sun 22:00 UTC -> Fri 22:00 UTC (with brief 21:00-22:00 daily rollover)
  const day = nowDate.getUTCDay();
  const hour = nowDate.getUTCHours();
  if (day === 6) return { isOpen: false, stateLabel: 'Weekend Closed' };
  if (day === 0 && hour < 22) return { isOpen: false, stateLabel: 'Weekend Closed' };
  if (day === 5 && hour >= 22) return { isOpen: false, stateLabel: 'Weekend Closed' };
  return { isOpen: true, stateLabel: 'Session Open' };
}

function roundTo(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

function toPublicQuote(state: InternalQuoteState): PrioritySocketQuote {
  const sess = getUtcSessionInfo(state.id, new Date());
  return {
    id: state.id,
    price: state.price,
    prevClose: state.prevClose,
    changeValue: state.changeValue,
    changePercent: state.changePercent,
    ...(typeof state.bid === 'number' ? { bid: state.bid } : {}),
    ...(typeof state.ask === 'number' ? { ask: state.ask } : {}),
    ...(typeof state.dayHigh === 'number' ? { dayHigh: state.dayHigh } : {}),
    ...(typeof state.dayLow === 'number' ? { dayLow: state.dayLow } : {}),
    marketSessionOpen: sess.isOpen,
    sessionStateLabel: sess.stateLabel,
    updatedAtEpoch: state.updatedAtEpoch,
    sourceLabel: state.sourceLabel,
  };
}

function broadcastJson(payload: unknown): void {
  if (!wss || wss.clients.size === 0) return;
  const serialized = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(serialized);
      } catch {
        // ignore broken client socket
      }
    }
  }
}

function upsertQuoteAndBroadcast(
  id: PrioritySymbolId,
  decimals: number,
  incoming: {
    price: number;
    prevClose?: number;
    changeValue?: number;
    changePercent?: number;
    bid?: number;
    ask?: number;
    dayHigh?: number;
    dayLow?: number;
    sourceLabel: string;
  }
): void {
  if (!Number.isFinite(incoming.price) || incoming.price <= 0) return;

  const existing = quoteStore.get(id);
  const price = roundTo(incoming.price, decimals);

  let prevClose =
    typeof incoming.prevClose === 'number' && Number.isFinite(incoming.prevClose) && incoming.prevClose > 0
      ? roundTo(incoming.prevClose, decimals)
      : existing?.prevClose && existing.prevClose > 0
        ? existing.prevClose
        : price;

  if (
    (!incoming.prevClose || incoming.prevClose <= 0) &&
    typeof incoming.changeValue === 'number' &&
    Number.isFinite(incoming.changeValue)
  ) {
    const derived = price - incoming.changeValue;
    if (derived > 0) prevClose = roundTo(derived, decimals);
  } else if (
    (!incoming.prevClose || incoming.prevClose <= 0) &&
    typeof incoming.changePercent === 'number' &&
    Number.isFinite(incoming.changePercent) &&
    incoming.changePercent !== -100
  ) {
    const derived = price / (1 + incoming.changePercent / 100);
    if (derived > 0) prevClose = roundTo(derived, decimals);
  }

  const changeValue = roundTo(price - prevClose, decimals >= 3 ? decimals : 2);
  const changePercent =
    typeof incoming.changePercent === 'number' && Number.isFinite(incoming.changePercent)
      ? roundTo(incoming.changePercent, 2)
      : prevClose > 0
        ? roundTo(((price - prevClose) / prevClose) * 100, 2)
        : 0;

  const now = Date.now();
  const nextState: InternalQuoteState = {
    id,
    decimals,
    price,
    prevClose,
    changeValue,
    changePercent,
    bid:
      typeof incoming.bid === 'number' && Number.isFinite(incoming.bid) && incoming.bid > 0
        ? roundTo(incoming.bid, decimals)
        : existing?.bid,
    ask:
      typeof incoming.ask === 'number' && Number.isFinite(incoming.ask) && incoming.ask > 0
        ? roundTo(incoming.ask, decimals)
        : existing?.ask,
    dayHigh:
      typeof incoming.dayHigh === 'number' && Number.isFinite(incoming.dayHigh) && incoming.dayHigh > 0
        ? roundTo(incoming.dayHigh, decimals)
        : existing?.dayHigh
          ? Math.max(existing.dayHigh, price)
          : undefined,
    dayLow:
      typeof incoming.dayLow === 'number' && Number.isFinite(incoming.dayLow) && incoming.dayLow > 0
        ? roundTo(incoming.dayLow, decimals)
        : existing?.dayLow
          ? Math.min(existing.dayLow, price)
          : undefined,
    updatedAtEpoch: now,
    sourceLabel: incoming.sourceLabel,
  };

  const priceChanged = !existing || existing.price !== nextState.price;
  quoteStore.set(id, nextState);

  const publicQuote = toPublicQuote(nextState);

  // Notify server-side listeners (e.g., 24/7 Cloud Signal Zone-Fill Validator) on every XAU/BTC tick
  if (STRICT_WS_BROADCAST_IDS.has(id) && tickListeners.size > 0) {
    for (const listener of tickListeners) {
      try {
        listener(publicQuote);
      } catch {
        // isolate listener exceptions
      }
    }
  }

  // High-frequency WebSocket client broadcasts are strictly scoped to XAU/USD & BTC/USD
  if (!STRICT_WS_BROADCAST_IDS.has(id)) {
    return;
  }

  // Coalesce broadcasts per symbol to <= 150ms so burst ticks stay smooth and sub-second accurate
  const lastSent = lastBroadcastAt.get(id) ?? 0;
  if (priceChanged || now - lastSent >= 1000) {
    if (now - lastSent >= 150 || !existing) {
      lastBroadcastAt.set(id, now);
      broadcastJson({
        type: 'tick',
        quote: publicQuote,
        serverTime: now,
      });
    }
  }
}

// ============================================================================
// Upstream WS #1: Coinbase Exchange Direct Ticker (BTC/USD & ETH/USD)
// ============================================================================
function connectCoinbaseWs(attempt = 0): void {
  if (coinbaseWs && (coinbaseWs.readyState === WebSocket.OPEN || coinbaseWs.readyState === WebSocket.CONNECTING)) {
    return;
  }
  try {
    const ws = new WebSocket('wss://ws-feed.exchange.coinbase.com', {
      headers: { 'User-Agent': UA_STRING },
      handshakeTimeout: 8000,
    });
    coinbaseWs = ws;

    ws.on('open', () => {
      coinbaseConnected = true;
      attempt = 0;
      try {
        ws.send(
          JSON.stringify({
            type: 'subscribe',
            product_ids: ['BTC-USD', 'ETH-USD'],
            channels: ['ticker'],
          })
        );
      } catch {
        // ignore send errors
      }
      // Close Binance failover if Coinbase recovered
      if (binanceFailoverWs) {
        try {
          binanceFailoverWs.close();
        } catch {
          // ignore
        }
        binanceFailoverWs = null;
        binanceConnected = false;
      }
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string;
          product_id?: string;
          price?: string;
          open_24h?: string;
          high_24h?: string;
          low_24h?: string;
          best_bid?: string;
          best_ask?: string;
        };
        if (msg.type !== 'ticker' || !msg.product_id || !msg.price) return;
        const id: PrioritySymbolId | null =
          msg.product_id === 'BTC-USD'
            ? 'BTCUSD'
            : msg.product_id === 'ETH-USD'
              ? 'ETHUSD'
              : null;
        if (!id) return;

        const price = Number(msg.price);
        const open24 = Number(msg.open_24h);
        const hi24 = Number(msg.high_24h);
        const lo24 = Number(msg.low_24h);
        const bid = Number(msg.best_bid);
        const ask = Number(msg.best_ask);
        if (!Number.isFinite(price) || price <= 0) return;

        lastCoinbaseTickAt = Date.now();
        upsertQuoteAndBroadcast(id, 2, {
          price,
          prevClose: Number.isFinite(open24) && open24 > 0 ? open24 : undefined,
          dayHigh: Number.isFinite(hi24) && hi24 > 0 ? hi24 : undefined,
          dayLow: Number.isFinite(lo24) && lo24 > 0 ? lo24 : undefined,
          bid: Number.isFinite(bid) && bid > 0 ? bid : undefined,
          ask: Number.isFinite(ask) && ask > 0 ? ask : undefined,
          sourceLabel: 'Coinbase WS',
        });
      } catch {
        // ignore malformed frame
      }
    });

    ws.on('close', () => {
      coinbaseConnected = false;
      if (coinbaseWs === ws) coinbaseWs = null;
      connectBinanceFailoverWs();
      const delay = Math.min(15_000, 1500 * Math.pow(2, Math.min(4, attempt)));
      setTimeout(() => connectCoinbaseWs(attempt + 1), delay);
    });

    ws.on('error', () => {
      coinbaseConnected = false;
      try {
        ws.terminate();
      } catch {
        // ignore
      }
    });
  } catch {
    coinbaseConnected = false;
    connectBinanceFailoverWs();
    setTimeout(() => connectCoinbaseWs(attempt + 1), 4000);
  }
}

function connectBinanceFailoverWs(): void {
  if (coinbaseConnected) return;
  if (
    binanceFailoverWs &&
    (binanceFailoverWs.readyState === WebSocket.OPEN ||
      binanceFailoverWs.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }
  try {
    const ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@ticker', {
      headers: { 'User-Agent': UA_STRING },
      handshakeTimeout: 8000,
    });
    binanceFailoverWs = ws;

    ws.on('open', () => {
      binanceConnected = true;
    });

    ws.on('message', (raw) => {
      if (coinbaseConnected && Date.now() - lastCoinbaseTickAt < 6000) return;
      try {
        const msg = JSON.parse(raw.toString()) as {
          c?: string;
          o?: string;
          h?: string;
          l?: string;
          b?: string;
          a?: string;
          P?: string;
        };
        const price = Number(msg.c);
        if (!Number.isFinite(price) || price <= 0) return;
        upsertQuoteAndBroadcast('BTCUSD', 2, {
          price,
          prevClose: Number(msg.o),
          dayHigh: Number(msg.h),
          dayLow: Number(msg.l),
          bid: Number(msg.b),
          ask: Number(msg.a),
          changePercent: Number(msg.P),
          sourceLabel: 'Binance WS',
        });
      } catch {
        // ignore malformed frame
      }
    });

    ws.on('close', () => {
      binanceConnected = false;
      if (binanceFailoverWs === ws) binanceFailoverWs = null;
    });

    ws.on('error', () => {
      binanceConnected = false;
      try {
        ws.terminate();
      } catch {
        // ignore
      }
    });
  } catch {
    binanceConnected = false;
  }
}

// ============================================================================
// Upstream WS #2: TradingView Direct Quote Stream (OANDA:XAUUSD & TVC:DXY)
// ============================================================================
function packTvFrame(payload: string): string {
  return `~m~${payload.length}~m~${payload}`;
}

function packTvMessage(method: string, params: unknown[]): string {
  return packTvFrame(JSON.stringify({ m: method, p: params }));
}

function parseTvFrames(raw: string): string[] {
  const frames: string[] = [];
  let idx = 0;
  while (idx < raw.length) {
    if (!raw.startsWith('~m~', idx)) break;
    const lenStart = idx + 3;
    const lenEnd = raw.indexOf('~m~', lenStart);
    if (lenEnd === -1) break;
    const len = Number(raw.slice(lenStart, lenEnd));
    if (!Number.isFinite(len) || len < 0) break;
    const bodyStart = lenEnd + 3;
    const bodyEnd = bodyStart + len;
    frames.push(raw.slice(bodyStart, bodyEnd));
    idx = bodyEnd;
  }
  return frames;
}

function connectTradingViewWs(attempt = 0): void {
  if (tvWs && (tvWs.readyState === WebSocket.OPEN || tvWs.readyState === WebSocket.CONNECTING)) {
    return;
  }
  try {
    const ws = new WebSocket('wss://data.tradingview.com/socket.io/websocket', {
      headers: {
        Origin: 'https://www.tradingview.com',
        'User-Agent': UA_STRING,
      },
      handshakeTimeout: 8000,
    });
    tvWs = ws;

    const sessionId = `qs_${Math.random().toString(36).slice(2, 12)}`;

    ws.on('open', () => {
      tvConnected = true;
      attempt = 0;
      try {
        ws.send(packTvMessage('set_auth_token', ['unauthorized_user_token']));
        ws.send(packTvMessage('quote_create_session', [sessionId]));
        ws.send(
          packTvMessage('quote_set_fields', [
            sessionId,
            'lp',
            'ch',
            'chp',
            'open_price',
            'high_price',
            'low_price',
            'prev_close_price',
            'bid',
            'ask',
          ])
        );
        ws.send(packTvMessage('quote_add_symbols', [sessionId, 'OANDA:XAUUSD', 'TVC:DXY']));
      } catch {
        // ignore send errors
      }
    });

    ws.on('message', (rawBuf) => {
      const text = rawBuf.toString();
      const frames = parseTvFrames(text);
      for (const frame of frames) {
        // Echo TradingView keep-alive heartbeat frames verbatim
        if (frame.startsWith('~h~')) {
          try {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(packTvFrame(frame));
            }
          } catch {
            // ignore
          }
          continue;
        }
        if (!frame.startsWith('{')) continue;
        try {
          const parsed = JSON.parse(frame) as {
            m?: string;
            p?: [
              string,
              {
                n?: string;
                s?: string;
                v?: {
                  lp?: number;
                  ch?: number;
                  chp?: number;
                  open_price?: number;
                  high_price?: number;
                  low_price?: number;
                  prev_close_price?: number;
                  bid?: number;
                  ask?: number;
                };
              },
            ];
          };
          if (parsed.m !== 'qsd' || !Array.isArray(parsed.p) || !parsed.p[1]) continue;
          const entry = parsed.p[1];
          const sym = entry.n;
          const v = entry.v;
          if (!sym || !v) continue;

          const id: PrioritySymbolId | null =
            sym === 'OANDA:XAUUSD' ? 'XAUUSD' : sym === 'TVC:DXY' ? 'DXY' : null;
          if (!id) continue;

          const decimals = id === 'DXY' ? 3 : 2;
          const existing = quoteStore.get(id);
          const price =
            typeof v.lp === 'number' && Number.isFinite(v.lp) && v.lp > 0
              ? v.lp
              : typeof v.bid === 'number' && typeof v.ask === 'number' && v.bid > 0 && v.ask > 0
                ? (v.bid + v.ask) / 2
                : existing?.price ?? 0;

          if (!Number.isFinite(price) || price <= 0) continue;

          if (id === 'XAUUSD') {
            lastTvXauTickAt = Date.now();
          }

          upsertQuoteAndBroadcast(id, decimals, {
            price,
            prevClose: v.prev_close_price,
            changeValue: v.ch,
            changePercent: v.chp,
            bid: v.bid,
            ask: v.ask,
            dayHigh: v.high_price,
            dayLow: v.low_price,
            sourceLabel: id === 'XAUUSD' ? 'OANDA WS' : 'TVC WS',
          });
        } catch {
          // ignore non-quote JSON packet
        }
      }
    });

    ws.on('close', () => {
      tvConnected = false;
      if (tvWs === ws) tvWs = null;
      const delay = Math.min(15_000, 1500 * Math.pow(2, Math.min(4, attempt)));
      setTimeout(() => connectTradingViewWs(attempt + 1), delay);
    });

    ws.on('error', () => {
      tvConnected = false;
      try {
        ws.terminate();
      } catch {
        // ignore
      }
    });
  } catch {
    tvConnected = false;
    setTimeout(() => connectTradingViewWs(attempt + 1), 4000);
  }
}

// ============================================================================
// Swissquote Institutional BBO Failover for XAU/USD (Active ONLY when TV WS stalls)
// ============================================================================
async function pollSwissquoteXauFailover(): Promise<void> {
  const now = Date.now();
  if (tvConnected && now - lastTvXauTickAt < 12_000) return;

  try {
    const res = await fetch(
      'https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/XAU/USD',
      {
        headers: { 'User-Agent': UA_STRING },
        signal: AbortSignal.timeout(2500),
      }
    );
    if (!res.ok) return;
    const data = (await res.json()) as Array<{
      spreadProfilePrices?: Array<{ bid?: number; ask?: number }>;
    }>;
    const first = data?.[0]?.spreadProfilePrices?.[0];
    if (!first || typeof first.bid !== 'number' || typeof first.ask !== 'number') return;
    const mid = (first.bid + first.ask) / 2;
    if (!Number.isFinite(mid) || mid <= 0) return;

    upsertQuoteAndBroadcast('XAUUSD', 2, {
      price: mid,
      bid: first.bid,
      ask: first.ask,
      sourceLabel: 'Swissquote BBO',
    });
  } catch {
    // ignore transient network error
  }
}

function startUpstreamStreams(): void {
  if (started) return;
  started = true;

  connectCoinbaseWs(0);
  connectTradingViewWs(0);

  // Failover watchdog: only hits Swissquote BBO if TV WS hasn't ticked in 12s
  setInterval(() => {
    void pollSwissquoteXauFailover();
  }, 3000);

  // Keep client sockets healthy and prune dead clients
  setInterval(() => {
    if (!wss) return;
    for (const client of wss.clients) {
      const wsClient = client as WebSocket & { isAlive?: boolean };
      if (wsClient.isAlive === false) {
        try {
          wsClient.terminate();
        } catch {
          // ignore
        }
        continue;
      }
      wsClient.isAlive = false;
      try {
        wsClient.ping();
      } catch {
        // ignore
      }
    }
  }, 25_000);
}

export function attachPriorityRadarSocket(httpServer: http.Server): void {
  startUpstreamStreams();

  if (wss) return;
  wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (socket) => {
    const wsClient = socket as WebSocket & { isAlive?: boolean };
    wsClient.isAlive = true;
    wsClient.on('pong', () => {
      wsClient.isAlive = true;
    });

    // Send immediate 0ms snapshot strictly for XAU/USD and BTC/USD high-frequency streams
    const snapshotQuotes = getPrioritySocketQuotes().filter((q) => STRICT_WS_BROADCAST_IDS.has(q.id));
    try {
      wsClient.send(
        JSON.stringify({
          type: 'snapshot',
          quotes: snapshotQuotes,
          status: getPrioritySocketStatus(),
          serverTime: Date.now(),
        })
      );
    } catch {
      // ignore closed socket
    }
  });

  httpServer.on('upgrade', (request, socket, head) => {
    const urlPath = (request.url || '').split('?')[0];
    if (urlPath !== '/ws/priority-radar') {
      return;
    }
    wss?.handleUpgrade(request, socket, head, (ws) => {
      wss?.emit('connection', ws, request);
    });
  });
}

export function getPrioritySocketQuotes(): PrioritySocketQuote[] {
  const ordered: PrioritySymbolId[] = ['BTCUSD', 'XAUUSD', 'DXY', 'ETHUSD'];
  const out: PrioritySocketQuote[] = [];
  for (const id of ordered) {
    const st = quoteStore.get(id);
    if (st && st.price > 0) {
      out.push(toPublicQuote(st));
    }
  }
  return out;
}

export function getPrioritySocketStatus(): {
  btcConnected: boolean;
  tvConnected: boolean;
  clientCount: number;
  quotesFresh: boolean;
} {
  const now = Date.now();
  const btc = quoteStore.get('BTCUSD');
  const xau = quoteStore.get('XAUUSD');
  const quotesFresh = Boolean(
    (btc && now - btc.updatedAtEpoch < 20_000) || (xau && now - xau.updatedAtEpoch < 20_000)
  );
  return {
    btcConnected: coinbaseConnected || binanceConnected,
    tvConnected,
    clientCount: wss?.clients.size ?? 0,
    quotesFresh,
  };
}
