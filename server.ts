import 'dotenv/config';
if (!process.env.DISABLE_HMR) {
  process.env.DISABLE_HMR = 'true';
}
import { GoogleGenAI } from '@google/genai';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchDailyMarketSummary,
  fetchLiveCalendar,
  fetchLiveChart,
  fetchLiveFxRates,
  fetchLiveNews,
  fetchLiveQuotes,
  fetchMarketHeatmap,
  fetchMarketIntelligence,
  fetchPortfolioMoversBrief,
  fetchPortfolioQuotes,
  fetchPortfolioSymbolSeries,
  fetchSymbolDetail,
  fetchTopStockMovers,
  searchMarketSymbols,
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

  // Live Market Quotes (all 18 tracked global tickers)
  app.get('/api/market/quotes', async (_req: Request, res: Response) => {
    try {
      const payload = await fetchLiveQuotes();
      res.json(payload);
    } catch (err) {
      console.error('Failed to fetch live quotes:', err);
      res.status(502).json({ error: 'Unable to fetch live market quotes.' });
    }
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
  app.get('/api/calendar/events', async (_req: Request, res: Response) => {
    try {
      const cal = await fetchLiveCalendar();
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

  // Vite middleware in development (or if dist/ is missing), static dist serving in production
  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(__dirname, 'dist');

  if (isProd && fs.existsSync(distDir)) {
    app.use(express.static(distDir));
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
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
