import 'dotenv/config';
if (!process.env.DISABLE_HMR) {
  process.env.DISABLE_HMR = 'true';
}
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchCorrelationMatrix,
  fetchDailyMarketSummary,
  fetchLiveCalendar,
  fetchLiveChart,
  fetchLiveFxRates,
  fetchLiveNews,
  fetchLiveQuotes,
  fetchMarketDepth,
  fetchMarketHeatmap,
  fetchMarketIntelligence,
  fetchPortfolioMoversBrief,
  fetchPortfolioQuotes,
  fetchPortfolioSymbolSeries,
  fetchScheduledShareSnapshot,
  fetchSymbolDetail,
  fetchTopStockMovers,
  getServerFeedDiagnostics,
  searchMarketSymbols,
  warmServerCaches,
  type ShareScheduleSlot,
} from './server/liveFeeds.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const MODEL_NAME = 'gemini-4-hydrogen';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add it in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface GroundedSource {
  title: string;
  uri: string;
}

interface ResearchRequestBody {
  query?: string;
  assetSymbol?: string;
  assetName?: string;
  assetPrice?: string;
  assetChange?: string;
  mode?: 'asset-brief' | 'news-pulse' | 'macro-qa';
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Health endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      model: MODEL_NAME,
      grounding: 'googleSearch',
      timestamp: new Date().toISOString(),
    });
  });

  // Live Market Quotes (all 18 tracked global tickers + provider diagnostics)
  app.get('/api/market/quotes', async (_req: Request, res: Response) => {
    try {
      const payload = await fetchLiveQuotes();
      res.json(payload);
    } catch (err) {
      console.error('Failed to fetch live quotes:', err);
      res.status(502).json({ error: 'Unable to fetch live market quotes.' });
    }
  });

  // Real-Time Multi-Provider Feed Latency, Failover & Cache Fallback Diagnostics
  app.get('/api/market/diagnostics', (_req: Request, res: Response) => {
    res.json(getServerFeedDiagnostics());
  });

  // 24-Hour Daily Market Summary JSON (Top Performers, Decliners & Economic Events)
  app.get('/api/market/daily-summary', async (_req: Request, res: Response) => {
    try {
      const summary = await fetchDailyMarketSummary();
      res.json(summary);
    } catch (err) {
      console.error('Failed to fetch daily market summary:', err);
      res.status(502).json({ error: 'Unable to fetch daily market summary.' });
    }
  });

  // Compiled Multi-Source Market & Stocks Intelligence + 3-Phase Index Session Summaries
  app.get('/api/market/intelligence', async (_req: Request, res: Response) => {
    try {
      const intel = await fetchMarketIntelligence();
      res.json(intel);
    } catch (err) {
      console.error('Failed to fetch market intelligence:', err);
      res.status(502).json({ error: 'Unable to fetch market intelligence.' });
    }
  });

  // Market Cap & Sector Heatmap Data (US & Indonesia IDX)
  app.get('/api/market/heatmap', async (_req: Request, res: Response) => {
    try {
      const heatmap = await fetchMarketHeatmap();
      res.json(heatmap);
    } catch (err) {
      console.error('Failed to fetch market heatmap:', err);
      res.status(502).json({ error: 'Unable to fetch market heatmap.' });
    }
  });

  // Timestamp-Anchored Static Share Snapshots (05:30 WIB Morning & 16:30 WIB Afternoon)
  app.get('/api/market/share-snapshot', async (req: Request, res: Response) => {
    try {
      const rawSlot = typeof req.query.slot === 'string' ? req.query.slot : 'morning_0530';
      const slot: ShareScheduleSlot =
        rawSlot === 'afternoon_1630' ? 'afternoon_1630' : 'morning_0530';
      const force = req.query.force === '1' || req.query.force === 'true';
      const snapshot = await fetchScheduledShareSnapshot(slot, force);
      res.json(snapshot);
    } catch (err) {
      console.error('Failed to fetch scheduled share snapshot:', err);
      res.status(502).json({ error: 'Unable to fetch scheduled market share snapshot.' });
    }
  });

  // Live Historical Chart Series per ticker & timeframe
  app.get('/api/market/chart', async (req: Request, res: Response) => {
    try {
      const id = typeof req.query.id === 'string' ? req.query.id : '';
      const timeframe = typeof req.query.timeframe === 'string' ? req.query.timeframe : '1D';
      if (!id) {
        return res.status(400).json({ error: 'Missing asset id' });
      }
      const chart = await fetchLiveChart(id, timeframe);
      if (!chart) {
        return res.status(404).json({ error: 'Chart series unavailable for asset' });
      }
      return res.json(chart);
    } catch (err) {
      console.error('Failed to fetch live chart:', err);
      return res.status(502).json({ error: 'Unable to fetch chart series.' });
    }
  });

  // Live Market Depth / Order Book per instrument
  app.get('/api/market/depth', async (req: Request, res: Response) => {
    try {
      const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
      if (!id) {
        return res.status(400).json({ error: 'Missing asset id' });
      }
      const depth = await fetchMarketDepth(id);
      if (!depth) {
        return res.status(404).json({ error: 'Market depth unavailable for asset' });
      }
      return res.json(depth);
    } catch (err) {
      console.error('Failed to fetch market depth:', err);
      return res.status(502).json({ error: 'Unable to fetch market depth.' });
    }
  });

  // Watchlist Cross-Asset Correlation Matrix
  app.get('/api/market/correlations', async (req: Request, res: Response) => {
    try {
      const rawTf = typeof req.query.timeframe === 'string' ? req.query.timeframe.toUpperCase() : '1M';
      const timeframe: '1M' | '3M' = rawTf === '3M' ? '3M' : '1M';
      const payload = await fetchCorrelationMatrix(timeframe);
      return res.json(payload);
    } catch (err) {
      console.error('Failed to fetch correlation matrix:', err);
      return res.status(502).json({ error: 'Unable to fetch correlation matrix.' });
    }
  });

  // Live FX Rates & Major Pairs
  app.get('/api/fx/rates', async (_req: Request, res: Response) => {
    try {
      const fx = await fetchLiveFxRates();
      res.json(fx);
    } catch (err) {
      console.error('Failed to fetch live FX rates:', err);
      res.status(502).json({ error: 'Unable to fetch live FX rates.' });
    }
  });

  // Live Breaking Financial News RSS Aggregator
  app.get('/api/news/feed', async (_req: Request, res: Response) => {
    try {
      const news = await fetchLiveNews();
      res.json(news);
    } catch (err) {
      console.error('Failed to fetch live news:', err);
      res.status(502).json({ error: 'Unable to fetch live news feed.' });
    }
  });

  // Live Macroeconomic Calendar
  app.get('/api/calendar/events', async (req: Request, res: Response) => {
    try {
      const range =
        typeof req.query.range === 'string'
          ? (req.query.range as 'this_week' | 'next_week' | 'this_month' | 'next_month' | 'custom')
          : undefined;
      const from = typeof req.query.from === 'string' ? req.query.from : undefined;
      const to = typeof req.query.to === 'string' ? req.query.to : undefined;
      const force = req.query.refresh === '1' || req.query.force === '1';
      const cal = await fetchLiveCalendar({ range, from, to, force });
      res.json(cal);
    } catch (err) {
      console.error('Failed to fetch live calendar:', err);
      res.status(502).json({ error: 'Unable to fetch live economic calendar.' });
    }
  });

  // Top 10 High-Impact Stock Movers (US & Indonesia IDX)
  app.get('/api/stocks/movers', async (_req: Request, res: Response) => {
    try {
      const movers = await fetchTopStockMovers();
      res.json(movers);
    } catch (err) {
      console.error('Failed to fetch top stock movers:', err);
      res.status(502).json({ error: 'Unable to fetch top stock movers.' });
    }
  });

  // Live Symbol Search (IDX .JK, US Equities, Indices, ETFs, Crypto, Commodities)
  app.get('/api/stocks/search', async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const includeQuotes = req.query.quotes === '1' || req.query.quotes === 'true';
      const results = await searchMarketSymbols(q, includeQuotes);
      res.json({ results });
    } catch (err) {
      console.error('Failed to search market symbols:', err);
      res.status(502).json({ error: 'Unable to search market symbols.' });
    }
  });

  // Universal Full Quote + Chart Series for any searched US or IDX Stock/Index
  app.get('/api/symbol/detail', async (req: Request, res: Response) => {
    try {
      const symbol = typeof req.query.symbol === 'string' ? req.query.symbol : '';
      const timeframe = typeof req.query.timeframe === 'string' ? req.query.timeframe : '1D';
      if (!symbol) {
        return res.status(400).json({ error: 'Missing symbol parameter' });
      }
      const detail = await fetchSymbolDetail(symbol, timeframe);
      if (!detail) {
        return res.status(404).json({ error: 'Symbol quote or chart unavailable' });
      }
      return res.json(detail);
    } catch (err) {
      console.error('Failed to fetch symbol detail:', err);
      return res.status(502).json({ error: 'Unable to fetch symbol detail.' });
    }
  });

  // Portfolio Holdings Daily Movers Analysis & Live Headlines
  app.get('/api/portfolio/movers-brief', async (req: Request, res: Response) => {
    try {
      const symbolsParam = typeof req.query.symbols === 'string' ? req.query.symbols : '';
      const symbols = symbolsParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const brief = await fetchPortfolioMoversBrief(symbols);
      return res.json(brief);
    } catch (err) {
      console.error('Failed to fetch portfolio movers brief:', err);
      return res.status(502).json({ error: 'Unable to fetch portfolio movers brief.' });
    }
  });

  // Portfolio Holdings Live Quotes (1s refresh during open session, last settle when closed)
  app.get('/api/portfolio/quotes', async (req: Request, res: Response) => {
    try {
      const symbolsParam = typeof req.query.symbols === 'string' ? req.query.symbols : '';
      const symbols = symbolsParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (symbols.length === 0) {
        return res.json({ quotes: [], updatedAt: new Date().toISOString() });
      }
      const payload = await fetchPortfolioQuotes(symbols);
      return res.json(payload);
    } catch (err) {
      console.error('Failed to fetch portfolio quotes:', err);
      return res.status(502).json({ error: 'Unable to fetch portfolio quotes.' });
    }
  });

  // Portfolio Symbol Historical Chart Series
  app.get('/api/portfolio/chart', async (req: Request, res: Response) => {
    try {
      const yahooSymbol = typeof req.query.symbol === 'string' ? req.query.symbol : '';
      const timeframe = typeof req.query.timeframe === 'string' ? req.query.timeframe : '1D';
      if (!yahooSymbol) {
        return res.status(400).json({ error: 'Missing symbol parameter' });
      }
      const data = await fetchPortfolioSymbolSeries(yahooSymbol, timeframe);
      if (!data) {
        return res.status(404).json({ error: 'Chart series unavailable' });
      }
      return res.json(data);
    } catch (err) {
      console.error('Failed to fetch portfolio symbol chart:', err);
      return res.status(502).json({ error: 'Unable to fetch portfolio symbol chart.' });
    }
  });

  // Grounded AI Market Research Endpoint (Gemini 4 Hydrogen + Google Search)
  app.post('/api/ai/research', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as ResearchRequestBody;
      const rawQuery = typeof body.query === 'string' ? body.query.trim() : '';
      const assetSymbol =
        typeof body.assetSymbol === 'string' ? body.assetSymbol.trim().slice(0, 24) : '';
      const assetName =
        typeof body.assetName === 'string' ? body.assetName.trim().slice(0, 120) : '';
      const assetPrice =
        typeof body.assetPrice === 'string' ? body.assetPrice.trim().slice(0, 40) : '';
      const assetChange =
        typeof body.assetChange === 'string' ? body.assetChange.trim().slice(0, 40) : '';
      const mode = body.mode || 'macro-qa';

      if (!rawQuery && !assetSymbol) {
        return res.status(400).json({
          error: 'Please enter a market question or select an asset to analyze.',
        });
      }

      const safeQuery = rawQuery.slice(0, 500);
      const contextLines: string[] = [];
      if (assetSymbol || assetName) {
        contextLines.push(
          `Active Terminal Instrument: ${assetName || assetSymbol} (${assetSymbol || 'N/A'})`
        );
      }
      if (assetPrice) {
        contextLines.push(`Terminal Snapshot Price: ${assetPrice} (${assetChange || '0.00%'})`);
      }

      let userPrompt = safeQuery;
      if (mode === 'asset-brief' && (assetSymbol || assetName)) {
        userPrompt = `${contextLines.join('\n')}\n\nProvide an institutional-grade, up-to-date market briefing on ${
          assetName || assetSymbol
        } (${assetSymbol}). Focus on latest price catalysts, macro drivers, central bank/yield implications, key technical levels, and near-term risks based on current web search data.${
          safeQuery ? ` Specific user focus: ${safeQuery}` : ''
        }`;
      } else if (mode === 'news-pulse') {
        userPrompt = `${
          safeQuery ||
          'Latest breaking global financial market headlines today across US equities, Federal Reserve rates, Bank Indonesia Rupiah/IDX, gold, crude oil, and Bitcoin.'
        }\n\nSummarize the most impactful real-time market developments in concise institutional bullet points with key data figures.`;
      } else if (contextLines.length > 0) {
        userPrompt = `${contextLines.join('\n')}\n\nUser Question: ${safeQuery}`;
      }

      const ai = getGeminiClient();

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: userPrompt,
        config: {
          systemInstruction:
            'You are a senior institutional cross-asset market strategist inside a global financial terminal (Stocks). ' +
            'Use Google Search grounding to retrieve verified, up-to-date market facts, prices, policy decisions, and macro data. ' +
            'Structure your response concisely with clear headings or bullet points: Key Catalysts, Macro & Rates Context, and Technical / Risk Watch. ' +
            'Keep responses crisp, scannable (under 350 words unless deeper analysis is requested), objective, and free of financial advice disclaimers that clutter the terminal.',
          tools: [{ googleSearch: {} }],
        },
      });

      const answer = (response.text ?? '').trim();
      if (!answer) {
        return res.status(502).json({
          error: 'Gemini returned an empty response. Please try refining your market query.',
        });
      }

      const groundingMeta = response.candidates?.[0]?.groundingMetadata;
      const rawChunks = groundingMeta?.groundingChunks ?? [];
      const seenUris = new Set<string>();
      const sources: GroundedSource[] = [];

      for (const chunk of rawChunks) {
        const uri = chunk.web?.uri;
        const title = chunk.web?.title;
        if (uri && !seenUris.has(uri) && sources.length < 10) {
          seenUris.add(uri);
          sources.push({
            title: (title || new URL(uri).hostname).slice(0, 200),
            uri: uri.slice(0, 1024),
          });
        }
      }

      const searchQueries = Array.isArray(groundingMeta?.webSearchQueries)
        ? groundingMeta.webSearchQueries.slice(0, 6)
        : [];

      return res.json({
        answer,
        sources,
        searchQueries,
        model: MODEL_NAME,
        generatedAt: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const errObj = error as { status?: number; message?: string };
      console.error('Gemini grounded research error:', errObj?.message || error);
      const statusCode =
        typeof errObj?.status === 'number' && errObj.status >= 400 && errObj.status < 600
          ? errObj.status
          : 500;
      return res.status(statusCode).json({
        error:
          errObj?.message ||
          'Failed to fetch grounded AI market intelligence. Check your Gemini API key in Settings > Secrets.',
      });
    }
  });

  // AI-Generated Daily Digest Modal Endpoint (Top Session Movers + News Impact via Gemini 4 Hydrogen)
  const digestCache = new Map<string, { expiresAt: number; payload: unknown }>();
  const TOPIC_LABELS: Record<string, string> = {
    all: 'All Global Markets',
    rates: 'US Rates & Fed',
    idx: 'IDX & Rupiah',
    commodities: 'Commodities',
    crypto: 'Crypto',
  };

  app.post('/api/news/daily-digest', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as { topic?: string; force?: boolean };
      const rawTopic = typeof body.topic === 'string' ? body.topic : 'all';
      const topic = Object.prototype.hasOwnProperty.call(TOPIC_LABELS, rawTopic)
        ? rawTopic
        : 'all';
      const force = Boolean(body.force);
      const topicLabel = TOPIC_LABELS[topic];

      const cached = digestCache.get(topic);
      if (!force && cached && cached.expiresAt > Date.now()) {
        return res.json(cached.payload);
      }

      const [quotesRes, moversRes, newsRes] = await Promise.allSettled([
        fetchLiveQuotes(),
        fetchTopStockMovers(),
        fetchLiveNews(),
      ]);

      const quoteAssets =
        quotesRes.status === 'fulfilled' && Array.isArray(quotesRes.value?.quotes)
          ? quotesRes.value.quotes
          : [];
      const usMovers =
        moversRes.status === 'fulfilled' && Array.isArray(moversRes.value?.us?.impact)
          ? moversRes.value.us.impact
          : [];
      const idxMovers =
        moversRes.status === 'fulfilled' && Array.isArray(moversRes.value?.indonesia?.impact)
          ? moversRes.value.indonesia.impact
          : [];
      const allStories =
        newsRes.status === 'fulfilled' && Array.isArray(newsRes.value?.stories)
          ? newsRes.value.stories
          : [];

      const scopedStories =
        topic === 'all'
          ? allStories
          : [
              ...allStories.filter((s) => s.topic === topic),
              ...allStories.filter((s) => s.topic !== topic && s.isBreaking),
            ];

      const topStories = scopedStories.slice(0, 18);
      const topMacroMovers = [...quoteAssets]
        .filter((a) => Number.isFinite(a.changePercent))
        .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
        .slice(0, 6);
      const topUs = usMovers.slice(0, 6);
      const topIdx = idxMovers.slice(0, 6);

      const moverYahooLookup = new Map<string, string>();
      for (const a of quoteAssets) {
        moverYahooLookup.set(a.id.toUpperCase(), a.id);
      }
      for (const s of [...topUs, ...topIdx]) {
        const clean = s.symbol.replace(/\.JK$/i, '').toUpperCase();
        const yahooSym = s.market === 'ID' && !s.symbol.toUpperCase().endsWith('.JK')
          ? `${clean}.JK`
          : s.symbol.toUpperCase();
        moverYahooLookup.set(clean, yahooSym);
        moverYahooLookup.set(s.symbol.toUpperCase(), yahooSym);
      }

      const promptLines: string[] = [
        `Focus Scope: ${topicLabel}`,
        `Session Timestamp (UTC): ${new Date().toISOString()}`,
        '',
        '=== TOP US EQUITY MOVERS ===',
        ...topUs.map(
          (s) =>
            `- ${s.symbol} (${s.name}): ${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(
              2
            )}% | Price: $${s.price.toFixed(2)} | Volume: ${s.volume}`
        ),
        '',
        '=== TOP INDONESIA (IDX) EQUITY MOVERS ===',
        ...topIdx.map(
          (s) =>
            `- ${s.symbol} (${s.name}): ${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(
              2
            )}% | Price: Rp ${Math.round(s.price).toLocaleString('en-US')}${
              s.bandarmology ? ` | Bandarmology: ${s.bandarmology.phase} (Score ${s.bandarmology.score})` : ''
            }`
        ),
        '',
        '=== TOP MACRO / FX / CRYPTO BENCHMARK MOVERS ===',
        ...topMacroMovers.map(
          (a) =>
            `- ${a.id} (${a.sentiment}, ${a.sessionStateLabel}): ${
              a.changePercent >= 0 ? '+' : ''
            }${a.changePercent.toFixed(2)}% | Last: ${a.price}`
        ),
        '',
        '=== CURRENT SESSION NEWS DISPATCHES ===',
        ...topStories.map(
          (st, idx) =>
            `${idx + 1}. [${st.isBreaking ? 'BREAKING' : st.topic.toUpperCase()}] (${st.publisher}, ${
              st.timeAgo
            }) ${st.headline} — ${st.summary.slice(0, 180)}`
        ),
      ];

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: promptLines.join('\n'),
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'You are a senior institutional cross-asset market strategist summarizing the current trading session. ' +
            'Produce a concise, data-grounded Daily Digest linking top market movers (from US equities, Indonesia IDX equities, macro indices, FX, commodities, or crypto) to the session headlines driving them. ' +
            'Include 4 to 6 high-impact moverImpacts using exact symbols and percentage moves from the provided snapshot. ' +
            'Keep executiveBrief to 2-3 crisp sentences, each impactAnalysis to 1-2 tight sentences citing the concrete catalyst, and sessionWatchpoints to 3 concise bullets.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              sessionHeadline: {
                type: Type.STRING,
                description: 'One concise headline summarizing the overarching theme of the current session.',
              },
              marketMood: {
                type: Type.STRING,
                description: 'Short 2-3 word regime label such as Risk-On Rally, Selective Rotation, or Risk-Off Defensive.',
              },
              executiveBrief: {
                type: Type.STRING,
                description: '2-3 sentence synthesis of the top market movers and news catalysts for the current session.',
              },
              moverImpacts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    symbol: { type: Type.STRING },
                    name: { type: Type.STRING },
                    market: { type: Type.STRING },
                    movePercent: { type: Type.STRING },
                    direction: {
                      type: Type.STRING,
                      enum: ['up', 'down', 'flat'],
                    },
                    associatedHeadline: { type: Type.STRING },
                    impactAnalysis: { type: Type.STRING },
                  },
                  required: [
                    'symbol',
                    'name',
                    'market',
                    'movePercent',
                    'direction',
                    'associatedHeadline',
                    'impactAnalysis',
                  ],
                },
              },
              sessionWatchpoints: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: [
              'sessionHeadline',
              'marketMood',
              'executiveBrief',
              'moverImpacts',
              'sessionWatchpoints',
            ],
          },
        },
      });

      const rawJson = (response.text ?? '').trim();
      if (!rawJson) {
        return res.status(502).json({
          error: 'Gemini returned an empty Daily Digest response. Please try regenerating.',
        });
      }

      const parsed = JSON.parse(rawJson) as {
        sessionHeadline: string;
        marketMood: string;
        executiveBrief: string;
        moverImpacts: Array<{
          symbol: string;
          name: string;
          market: string;
          movePercent: string;
          direction: 'up' | 'down' | 'flat';
          associatedHeadline: string;
          impactAnalysis: string;
        }>;
        sessionWatchpoints: string[];
      };

      const enrichedImpacts = (Array.isArray(parsed.moverImpacts) ? parsed.moverImpacts : [])
        .slice(0, 6)
        .map((item) => {
          const cleanSym = (item.symbol || '').trim().toUpperCase();
          return {
            ...item,
            yahooSymbol: moverYahooLookup.get(cleanSym),
          };
        });

      const payload = {
        sessionHeadline: parsed.sessionHeadline || 'Global Session Daily Digest',
        marketMood: parsed.marketMood || 'Active Session',
        executiveBrief: parsed.executiveBrief || '',
        topicLabel,
        moverImpacts: enrichedImpacts,
        sessionWatchpoints: (Array.isArray(parsed.sessionWatchpoints)
          ? parsed.sessionWatchpoints
          : []
        ).slice(0, 4),
        model: MODEL_NAME,
        generatedAt: new Date().toISOString(),
      };

      digestCache.set(topic, {
        expiresAt: Date.now() + 2 * 60_000,
        payload,
      });

      return res.json(payload);
    } catch (error: unknown) {
      const errObj = error as { status?: number; message?: string };
      console.error('Gemini daily digest error:', errObj?.message || error);
      const statusCode =
        typeof errObj?.status === 'number' && errObj.status >= 400 && errObj.status < 600
          ? errObj.status
          : 500;
      return res.status(statusCode).json({
        error:
          errObj?.message ||
          'Failed to generate AI Daily Digest. Please verify your Gemini API key in Settings > Secrets.',
      });
    }
  });

  // Vite middleware in development (or if dist/ is missing), static dist serving in production
  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(__dirname, 'dist');

  if (isProd && fs.existsSync(distDir)) {
    app.use((req: Request, res: Response, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
      const acceptEnc = String(req.headers['accept-encoding'] || '');
      if (!acceptEnc.includes('br')) return next();

      const relPath = req.path === '/' ? '/index.html' : req.path;
      const safePath = path.normalize(relPath).replace(/^(\.\.[/\\])+/, '');
      const fullPath = path.join(distDir, safePath);
      const brPath = `${fullPath}.br`;
      if (fullPath.startsWith(distDir) && fs.existsSync(brPath) && fs.statSync(brPath).isFile()) {
        res.setHeader('Content-Encoding', 'br');
        res.setHeader('Vary', 'Accept-Encoding');
        res.type(fullPath);
        return res.sendFile(brPath);
      }
      return next();
    });
    app.use(express.static(distDir, { maxAge: '1h' }));
    app.get('*', (req: Request, res: Response) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
      }
      return res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    // HMR is disabled in AI Studio; serve a clean /@vite/client ESM shim so CSS style injection works with zero failed WebSocket connections
    app.get('/@vite/client', (_req: Request, res: Response) => {
      res.type('application/javascript').send(`
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
  } else {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    if (style.parentNode) style.parentNode.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url) { return url; }
export class ErrorOverlay {}
`);
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Stocks Global Market Terminal running at http://0.0.0.0:${PORT}`);
    warmServerCaches();
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
