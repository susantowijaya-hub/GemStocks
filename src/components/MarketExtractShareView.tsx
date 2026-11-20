import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Image as ImageIcon,
  MessageSquareText,
  RefreshCw,
  Share2,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import {
  MarketAsset,
  MarketIntelligenceResponse,
  StocksMoversBucket,
} from '../types/market';
import { formatAssetPrice, formatWibClock } from '../utils/formatters';
import { getAssetSignal } from '../utils/marketSignals';

interface MarketExtractShareViewProps {
  assets: MarketAsset[];
  marketIntelligence: MarketIntelligenceResponse | null;
  usBucket: StocksMoversBucket;
  idxBucket: StocksMoversBucket;
  onRefreshIntelligence?: () => void;
}

type TextFormatMode = 'whatsapp' | 'telegram' | 'plain';
type PosterAspect = 'story' | 'portrait' | 'square';
type PosterTheme = 'midnight' | 'editorial' | 'gold';

interface PosterThemePalette {
  id: PosterTheme;
  label: string;
  bgBase: string;
  bgGradientTop: string;
  bgGradientBottom: string;
  glowAccent: string;
  gridLine: string;
  cardBg: string;
  cardBorder: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  gainBg: string;
  gainText: string;
  lossBg: string;
  lossText: string;
  neutralBg: string;
  neutralText: string;
}

const POSTER_THEMES: Record<PosterTheme, PosterThemePalette> = {
  midnight: {
    id: 'midnight',
    label: 'Midnight Terminal',
    bgBase: '#070B13',
    bgGradientTop: '#0E1729',
    bgGradientBottom: '#05080F',
    glowAccent: 'rgba(10, 132, 255, 0.22)',
    gridLine: 'rgba(148, 163, 184, 0.08)',
    cardBg: 'rgba(17, 25, 40, 0.88)',
    cardBorder: 'rgba(148, 163, 184, 0.20)',
    textPrimary: '#F8FAFC',
    textSecondary: '#CBD5E1',
    textMuted: '#94A3B8',
    accent: '#38BDF8',
    gainBg: 'rgba(48, 209, 88, 0.16)',
    gainText: '#4ADE80',
    lossBg: 'rgba(255, 69, 58, 0.16)',
    lossText: '#FB7185',
    neutralBg: 'rgba(148, 163, 184, 0.16)',
    neutralText: '#CBD5E1',
  },
  editorial: {
    id: 'editorial',
    label: 'Swiss Ivory',
    bgBase: '#F6F2E9',
    bgGradientTop: '#FAF7F0',
    bgGradientBottom: '#ECE5D6',
    glowAccent: 'rgba(24, 24, 22, 0.04)',
    gridLine: 'rgba(24, 24, 22, 0.065)',
    cardBg: '#FDFBF6',
    cardBorder: '#D5CEC0',
    textPrimary: '#161614',
    textSecondary: '#3E3C37',
    textMuted: '#6A675F',
    accent: '#0055B8',
    gainBg: 'rgba(22, 128, 60, 0.12)',
    gainText: '#147A38',
    lossBg: 'rgba(215, 38, 28, 0.12)',
    lossText: '#C52219',
    neutralBg: 'rgba(84, 82, 75, 0.12)',
    neutralText: '#4A4842',
  },
  gold: {
    id: 'gold',
    label: 'Obsidian Gold',
    bgBase: '#09090B',
    bgGradientTop: '#16130E',
    bgGradientBottom: '#070709',
    glowAccent: 'rgba(229, 193, 123, 0.16)',
    gridLine: 'rgba(229, 193, 123, 0.075)',
    cardBg: 'rgba(24, 23, 22, 0.92)',
    cardBorder: 'rgba(229, 193, 123, 0.24)',
    textPrimary: '#FAF6EE',
    textSecondary: '#D6D0C4',
    textMuted: '#A1998A',
    accent: '#E5C17B',
    gainBg: 'rgba(48, 209, 88, 0.16)',
    gainText: '#4ADE80',
    lossBg: 'rgba(255, 69, 58, 0.16)',
    lossText: '#FB7185',
    neutralBg: 'rgba(229, 193, 123, 0.14)',
    neutralText: '#E5C17B',
  },
};

const ASPECT_SPECS: Record<PosterAspect, { label: string; width: number; height: number; tag: string }> = {
  story: { label: 'IG Story (9:16)', width: 1080, height: 1920, tag: '1080×1920' },
  portrait: { label: 'IG Feed (4:5)', width: 1080, height: 1350, tag: '1080×1350' },
  square: { label: 'Square (1:1)', width: 1080, height: 1080, tag: '1080×1080' },
};

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const words = clean.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) {
        lines.push(current);
        current = word;
      } else {
        lines.push(word);
        current = '';
      }
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  if (lines.length === maxLines && words.length > 0) {
    const joined = lines.join(' ');
    if (joined.length < clean.length - 3) {
      let last = lines[maxLines - 1];
      while (last.length > 4 && ctx.measureText(`${last}…`).width > maxWidth) {
        last = last.slice(0, -1).trimEnd();
      }
      lines[maxLines - 1] = `${last}…`;
    }
  }
  return lines;
}

function fitTextToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (ctx.measureText(clean).width <= maxWidth) return clean;
  let clipped = clean;
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1).trimEnd();
  }
  return `${clipped}…`;
}

function formatPct(pct: number): string {
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

export const MarketExtractShareView: React.FC<MarketExtractShareViewProps> = ({
  assets,
  marketIntelligence,
  usBucket,
  idxBucket,
  onRefreshIntelligence,
}) => {
  const [textFormat, setTextFormat] = useState<TextFormatMode>('whatsapp');
  const [includeLevels, setIncludeLevels] = useState<boolean>(true);
  const [includePrediction, setIncludePrediction] = useState<boolean>(true);
  const [includeMovers, setIncludeMovers] = useState<boolean>(true);
  const [deskTitle, setDeskTitle] = useState<string>('GLOBAL & IDX MARKET BRIEF');
  const [deskHandle, setDeskHandle] = useState<string>('Market Desk Brief');
  const [copiedText, setCopiedText] = useState<boolean>(false);

  const [posterAspect, setPosterAspect] = useState<PosterAspect>('story');
  const [posterTheme, setPosterTheme] = useState<PosterTheme>('midnight');
  const [copiedImage, setCopiedImage] = useState<'idle' | 'copied' | 'unsupported'>('idle');
  const [customNote, setCustomNote] = useState<string>('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const byId = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  const extracted = useMemo(() => {
    const spx = byId.get('SPX');
    const ixic = byId.get('IXIC');
    const dji = byId.get('DJI');
    const ihsg = byId.get('IHSG');
    const eido = byId.get('EIDO');
    const dxy = byId.get('DXY');
    const usdidr = byId.get('USDIDR');
    const xauusd = byId.get('XAUUSD');

    const wibStamp = `${formatWibClock(new Date())} WIB`;
    const sentiment = marketIntelligence?.compositeSentiment ?? 'Neutral';
    const fallbackTally = assets.reduce(
      (acc, a) => {
        const dir = getAssetSignal(a).direction;
        if (dir === 'bull') acc.bullCount += 1;
        else if (dir === 'bear') acc.bearCount += 1;
        else acc.neutralCount += 1;
        return acc;
      },
      { bullCount: 0, bearCount: 0, neutralCount: 0 }
    );
    const tally =
      marketIntelligence?.signalTally &&
      marketIntelligence.signalTally.bullCount + marketIntelligence.signalTally.bearCount > 0
        ? marketIntelligence.signalTally
        : fallbackTally;

    const headline =
      marketIntelligence?.headline ??
      `Cross-Asset Snapshot: S&P 500 ${spx ? formatPct(spx.changePercent) : '—'}, IHSG ${ihsg ? formatPct(ihsg.changePercent) : '—'}, DXY at ${dxy ? formatAssetPrice(dxy) : '—'} and Gold Spot at ${xauusd ? formatAssetPrice(xauusd) : '—'}.`;

    const bullets =
      marketIntelligence?.commentaryPoints && marketIntelligence.commentaryPoints.length > 0
        ? marketIntelligence.commentaryPoints
        : [
            spx?.commentary ?? 'US equity benchmarks track Treasury yields and mega-cap earnings dispersion.',
            ihsg?.commentary ?? 'IDX Composite (IHSG) and EIDO reflect domestic banking flows and Rupiah sensitivity.',
            xauusd?.commentary ?? 'Gold Spot & DXY drive global FX risk-on/risk-off positioning.',
          ];

    const forwardThesis =
      marketIntelligence?.forwardPrediction ??
      `Watch SPX ${spx?.support ?? 'support'}/${spx?.resistance ?? 'resistance'} and IHSG ${ihsg?.support ?? 'support'}/${ihsg?.resistance ?? 'resistance'} alongside USD/IDR near ${usdidr ? formatAssetPrice(usdidr) : '—'} for directional confirmation.`;

    const usTop = usBucket.impact.slice(0, 2).map((s) => `${s.symbol} (${formatPct(s.changePercent)})`).join(', ');
    const idxTop = idxBucket.impact.slice(0, 2).map((s) => `${s.symbol} (${formatPct(s.changePercent)})`).join(', ');
    const flowLine =
      customNote.trim() ||
      marketIntelligence?.stocksAndFlowSummary ||
      [usTop ? `US Leaders: ${usTop}` : '', idxTop ? `IDX Heavyweights: ${idxTop}` : '']
        .filter(Boolean)
        .join(' · ');

    return {
      spx,
      ixic,
      dji,
      ihsg,
      eido,
      dxy,
      usdidr,
      xauusd,
      wibStamp,
      sentiment,
      tally,
      headline,
      bullets,
      forwardThesis,
      flowLine,
    };
  }, [byId, marketIntelligence, usBucket.impact, idxBucket.impact, customNote]);

  // Formatted Copy-Paste Text Brief (WhatsApp / Telegram / Plain)
  const formattedBriefText = useMemo(() => {
    const {
      spx,
      ixic,
      dji,
      ihsg,
      eido,
      dxy,
      usdidr,
      xauusd,
      wibStamp,
      sentiment,
      headline,
      bullets,
      forwardThesis,
      flowLine,
    } = extracted;

    const bold = (s: string) =>
      textFormat === 'whatsapp' ? `*${s}*` : textFormat === 'telegram' ? `**${s}**` : s.toUpperCase();
    const code = (s: string) => (textFormat === 'plain' ? s : `\`${s}\``);

    const fmtRow = (label: string, asset?: MarketAsset) => {
      if (!asset) return `• ${label}: —`;
      const sig = getAssetSignal(asset).shortLabel;
      const lvl = includeLevels ? ` | S ${asset.support} · R ${asset.resistance}` : '';
      return `• ${bold(label)}: ${code(formatAssetPrice(asset))} (${formatPct(asset.changePercent)}) · ${sig}${lvl}`;
    };

    const lines: string[] = [
      `${bold(deskTitle.trim() || 'GLOBAL & IDX MARKET BRIEF')}`,
      `🕒 ${wibStamp} · Bias: ${bold(sentiment)}`,
      `────────────────────`,
      `${bold('US INDICES')}`,
      fmtRow('S&P 500 (SPX)', spx),
      fmtRow('NASDAQ (IXIC)', ixic),
      fmtRow('Dow Jones (DJI)', dji),
      ``,
      `${bold('INDONESIA MARKET')}`,
      fmtRow('IHSG (IDX)', ihsg),
      fmtRow('EIDO (MSCI Indo ETF)', eido),
      ``,
      `${bold('FX & GOLD')}`,
      fmtRow('DXY (Dollar Index)', dxy),
      fmtRow('USD/IDR', usdidr),
      fmtRow('XAU/USD (Gold Spot)', xauusd),
      `────────────────────`,
      `${bold('MARKET COMMENTARY & ANALYSIS')}`,
      headline,
      ``,
      ...bullets.slice(0, 3).map((b) => `▸ ${b}`),
    ];

    if (includeMovers && flowLine) {
      lines.push(``, `${bold('EQUITY FLOWS')}`, flowLine);
    }
    if (includePrediction && forwardThesis) {
      lines.push(``, `${bold('FORWARD OUTLOOK')}`, forwardThesis);
    }
    if (deskHandle.trim()) {
      lines.push(``, `— ${deskHandle.trim()}`);
    }

    return lines.join('\n');
  }, [extracted, textFormat, includeLevels, includePrediction, includeMovers, deskTitle, deskHandle]);

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(formattedBriefText);
      setCopiedText(true);
      window.setTimeout(() => setCopiedText(false), 2000);
    } catch {
      // Fallback ignored if clipboard permissions are restricted
    }
  };

  // Draw High-DPI Institutional Social Media Poster on <canvas>
  const renderPosterCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const spec = ASPECT_SPECS[posterAspect];
    const palette = POSTER_THEMES[posterTheme];
    canvas.width = spec.width;
    canvas.height = spec.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = spec.width;
    const H = spec.height;
    const padX = 64;
    const innerW = W - padX * 2;
    const isStory = posterAspect === 'story';
    const isSquare = posterAspect === 'square';

    // 1. Background gradient + subtle radial glow + architectural grid
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, palette.bgGradientTop);
    grad.addColorStop(1, palette.bgGradientBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const radial = ctx.createRadialGradient(W * 0.82, H * 0.12, 20, W * 0.82, H * 0.12, W * 0.72);
    radial.addColorStop(0, palette.glowAccent);
    radial.addColorStop(1, 'transparent');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = palette.gridLine;
    ctx.lineWidth = 1;
    for (let x = padX; x <= W - padX; x += 90) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 72; y <= H - 72; y += 90) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Top accent bar
    ctx.fillStyle = palette.accent;
    ctx.fillRect(padX, isStory ? 64 : 44, 88, 5);

    // 2. Masthead
    let cursorY = isStory ? 104 : isSquare ? 74 : 84;
    ctx.font = '700 20px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = palette.accent;
    ctx.fillText('CROSS-ASSET TERMINAL SNAPSHOT', padX, cursorY);

    const sentimentText = `${extracted.sentiment.toUpperCase()} BIAS`;
    ctx.font = '700 20px "JetBrains Mono", ui-monospace, monospace';
    const badgeW = ctx.measureText(sentimentText).width + 36;
    const badgeBg =
      extracted.sentiment === 'Bullish'
        ? palette.gainBg
        : extracted.sentiment === 'Bearish'
          ? palette.lossBg
          : palette.neutralBg;
    const badgeCol =
      extracted.sentiment === 'Bullish'
        ? palette.gainText
        : extracted.sentiment === 'Bearish'
          ? palette.lossText
          : palette.neutralText;
    roundRectPath(ctx, W - padX - badgeW, cursorY - 24, badgeW, 34, 8);
    ctx.fillStyle = badgeBg;
    ctx.fill();
    ctx.fillStyle = badgeCol;
    ctx.fillText(sentimentText, W - padX - badgeW + 18, cursorY - 1);

    cursorY += isSquare ? 48 : 56;
    ctx.font = `800 ${isSquare ? 42 : 48}px -apple-system, BlinkMacSystemFont, "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = palette.textPrimary;
    ctx.fillText((deskTitle.trim() || 'GLOBAL & IDX MARKET BRIEF').slice(0, 30), padX, cursorY);

    cursorY += 34;
    ctx.font = '500 21px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = palette.textMuted;
    const bull = extracted.tally.bullCount;
    const bear = extracted.tally.bearCount;
    ctx.fillText(
      `${extracted.wibStamp}   ·   Signals ${bull} Bull / ${bear} Bear`,
      padX,
      cursorY
    );

    // Divider line
    cursorY += isSquare ? 22 : 28;
    ctx.strokeStyle = palette.cardBorder;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padX, cursorY);
    ctx.lineTo(W - padX, cursorY);
    ctx.stroke();

    // Helper to draw clean metric card with zero overlap or overflow
    const drawAssetCard = (
      x: number,
      y: number,
      w: number,
      h: number,
      tag: string,
      asset?: MarketAsset
    ) => {
      roundRectPath(ctx, x, y, w, h, 18);
      ctx.fillStyle = palette.cardBg;
      ctx.fill();
      ctx.strokeStyle = palette.cardBorder;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const innerPad = 20;
      const contentW = w - innerPad * 2;

      if (!asset) {
        ctx.font = '700 17px "JetBrains Mono", ui-monospace, monospace';
        ctx.fillStyle = palette.textMuted;
        ctx.fillText(fitTextToWidth(ctx, tag, contentW), x + innerPad, y + 34);
        ctx.font = '700 30px "JetBrains Mono", ui-monospace, monospace';
        ctx.fillStyle = palette.textPrimary;
        ctx.fillText('—', x + innerPad, y + 82);
        return;
      }

      const isGain = asset.changePercent >= 0;
      const pctStr = formatPct(asset.changePercent);
      ctx.font = '700 18px "JetBrains Mono", ui-monospace, monospace';
      const pillW = ctx.measureText(pctStr).width + 22;
      roundRectPath(ctx, x + w - innerPad - pillW, y + 14, pillW, 28, 8);
      ctx.fillStyle = isGain ? palette.gainBg : palette.lossBg;
      ctx.fill();
      ctx.fillStyle = isGain ? palette.gainText : palette.lossText;
      ctx.fillText(pctStr, x + w - innerPad - pillW + 11, y + 34);

      // Left-aligned status dot + pixel-clipped tag guaranteeing >=12px gap before % pill
      ctx.beginPath();
      ctx.arc(x + innerPad + 4, y + 28, 4, 0, Math.PI * 2);
      ctx.fillStyle = isGain ? palette.gainText : palette.lossText;
      ctx.fill();

      const maxTagW = Math.max(48, contentW - pillW - 22);
      ctx.font = '700 16px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillStyle = palette.textMuted;
      ctx.fillText(fitTextToWidth(ctx, tag, maxTagW), x + innerPad + 14, y + 34);

      const priceStr = formatAssetPrice(asset);
      const priceFontSize = w < 330 && priceStr.length > 9 ? 26 : priceStr.length > 11 ? 28 : 33;
      ctx.font = `700 ${priceFontSize}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.fillStyle = palette.textPrimary;
      ctx.fillText(fitTextToWidth(ctx, priceStr, contentW), x + innerPad, y + (h > 130 ? 88 : 80));

      ctx.font = '500 15px -apple-system, BlinkMacSystemFont, "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = palette.textSecondary;
      const sigLabel = getAssetSignal(asset).shortLabel;
      const subLine =
        h > 130
          ? `${sigLabel} · S ${asset.support} / R ${asset.resistance}`
          : `${asset.shortName} · ${sigLabel}`;
      ctx.fillText(fitTextToWidth(ctx, subLine, contentW), x + innerPad, y + h - 18);
    };

    // 3. US Indices Section (3 columns)
    cursorY += isSquare ? 26 : 36;
    ctx.font = '700 18px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = palette.accent;
    ctx.fillText('01 / UNITED STATES BENCHMARKS', padX, cursorY);

    cursorY += 16;
    const gap = 18;
    const usCardW = (innerW - gap * 2) / 3;
    const cardH = isStory ? 148 : isSquare ? 114 : 128;
    drawAssetCard(padX, cursorY, usCardW, cardH, 'SPX · S&P 500', extracted.spx);
    drawAssetCard(padX + usCardW + gap, cursorY, usCardW, cardH, 'IXIC · NASDAQ', extracted.ixic);
    drawAssetCard(padX + (usCardW + gap) * 2, cursorY, usCardW, cardH, 'DJI · DOW', extracted.dji);

    // 4. Indonesia Section (2 columns: IHSG + EIDO)
    cursorY += cardH + (isSquare ? 24 : 34);
    ctx.font = '700 18px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = palette.accent;
    ctx.fillText('02 / INDONESIA & OFFSHORE ETF PROXY', padX, cursorY);

    cursorY += 16;
    const idCardW = (innerW - gap) / 2;
    drawAssetCard(padX, cursorY, idCardW, cardH, 'IDX COMPOSITE · IHSG', extracted.ihsg);
    drawAssetCard(padX + idCardW + gap, cursorY, idCardW, cardH, 'MSCI INDO ETF · EIDO', extracted.eido);

    // 5. FX & Gold Strip (3 columns: DXY, USD/IDR, XAU/USD)
    cursorY += cardH + (isSquare ? 24 : 34);
    ctx.font = '700 18px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = palette.accent;
    ctx.fillText('03 / DOLLAR, RUPIAH & GOLD', padX, cursorY);

    cursorY += 16;
    drawAssetCard(padX, cursorY, usCardW, cardH, 'DXY · DOLLAR', extracted.dxy);
    drawAssetCard(padX + usCardW + gap, cursorY, usCardW, cardH, 'USD / IDR', extracted.usdidr);
    drawAssetCard(padX + (usCardW + gap) * 2, cursorY, usCardW, cardH, 'XAU/USD · GOLD', extracted.xauusd);

    // 6. Commentary & Analysis Box
    cursorY += cardH + (isSquare ? 24 : 34);
    const footerReserve = isStory ? 90 : 72;
    const boxH = Math.max(210, H - cursorY - footerReserve);

    roundRectPath(ctx, padX, cursorY, innerW, boxH, 20);
    ctx.fillStyle = palette.cardBg;
    ctx.fill();
    ctx.strokeStyle = palette.cardBorder;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Left vertical accent inside commentary card
    roundRectPath(ctx, padX + 24, cursorY + 26, 5, boxH - 52, 3);
    ctx.fillStyle = palette.accent;
    ctx.fill();

    let textY = cursorY + 46;
    const textX = padX + 48;
    const textMaxW = innerW - 76;

    ctx.font = '700 17px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = palette.accent;
    ctx.fillText('04 / MARKET COMMENTARY & FORWARD ANALYSIS', textX, textY);

    textY += 36;
    ctx.font = `700 ${isSquare ? 23 : 26}px -apple-system, BlinkMacSystemFont, "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = palette.textPrimary;
    const headLines = wrapTextLines(ctx, extracted.headline, textMaxW, isSquare ? 2 : 3);
    for (const line of headLines) {
      ctx.fillText(line, textX, textY);
      textY += isSquare ? 30 : 34;
    }

    textY += 10;
    ctx.font = `400 ${isSquare ? 19 : 21}px -apple-system, BlinkMacSystemFont, "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = palette.textSecondary;

    const bulletCount = isStory ? 3 : isSquare ? 1 : 2;
    for (const bullet of extracted.bullets.slice(0, bulletCount)) {
      const wrapped = wrapTextLines(ctx, `• ${bullet}`, textMaxW, isStory ? 3 : 2);
      for (const l of wrapped) {
        if (textY > cursorY + boxH - 64) break;
        ctx.fillText(l, textX, textY);
        textY += isSquare ? 25 : 28;
      }
      textY += 8;
    }

    if (includePrediction && textY <= cursorY + boxH - 46) {
      textY += 4;
      ctx.font = `600 ${isSquare ? 18 : 20}px -apple-system, BlinkMacSystemFont, "Plus Jakarta Sans", sans-serif`;
      ctx.fillStyle = palette.accent;
      const outlookLines = wrapTextLines(
        ctx,
        extracted.forwardThesis,
        textMaxW,
        isStory ? 3 : 2
      );
      for (const l of outlookLines) {
        if (textY > cursorY + boxH - 18) break;
        ctx.fillText(l, textX, textY);
        textY += isSquare ? 24 : 27;
      }
    }

    // 7. Footer Signature
    const footerY = H - (isStory ? 44 : 32);
    ctx.font = '600 18px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = palette.textMuted;
    ctx.fillText(deskHandle.trim() || 'Market Desk Brief', padX, footerY);

    const rightSig = `LIVE FEEDS · ${posterAspect.toUpperCase()}`;
    const rightW = ctx.measureText(rightSig).width;
    ctx.fillText(rightSig, W - padX - rightW, footerY);
  }, [extracted, posterAspect, posterTheme, deskTitle, deskHandle, includePrediction]);

  useEffect(() => {
    renderPosterCanvas();
  }, [renderPosterCanvas]);

  const handleDownloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `market-brief-${posterAspect}-${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const handleCopyPng = async () => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
      setCopiedImage('unsupported');
      window.setTimeout(() => setCopiedImage('idle'), 2600);
      return;
    }
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setCopiedImage('copied');
        window.setTimeout(() => setCopiedImage('idle'), 2200);
      } catch {
        setCopiedImage('unsupported');
        window.setTimeout(() => setCopiedImage('idle'), 2600);
      }
    }, 'image/png');
  };

  const quickChips: Array<{ label: string; asset?: MarketAsset }> = [
    { label: 'SPX', asset: extracted.spx },
    { label: 'IXIC', asset: extracted.ixic },
    { label: 'DJI', asset: extracted.dji },
    { label: 'IHSG', asset: extracted.ihsg },
    { label: 'EIDO', asset: extracted.eido },
    { label: 'DXY', asset: extracted.dxy },
    { label: 'USD/IDR', asset: extracted.usdidr },
    { label: 'XAU/USD', asset: extracted.xauusd },
  ];

  return (
    <div className="max-w-[1440px] mx-auto w-full px-4 lg:px-6 pt-4 pb-28 sm:pb-32 space-y-5">
      {/* Header & Live Extracted Telemetry Strip */}
      <section className="liquid-glass-card rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Share2 className="w-4 h-4 text-[#0071E3] dark:text-[#0A84FF]" />
              <h1 className="text-lg sm:text-xl font-bold text-[#1C1C1E] dark:text-white tracking-tight">
                Data Extract &amp; Social Brief Studio
              </h1>
            </div>
            <p className="text-xs text-[#6C6C70] dark:text-[#8E8E93] mt-0.5">
              Extract live US, Indonesia (IHSG &amp; EIDO), DXY, USD/IDR, Gold &amp; Market Analysis for Telegram, WhatsApp, and Instagram Stories/Feeds
            </p>
          </div>

          {onRefreshIntelligence && (
            <button
              type="button"
              onClick={onRefreshIntelligence}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#F2F2F7] dark:bg-[#2C2C2E]/80 hover:bg-[#E5E5EA] dark:hover:bg-[#3A3A3C] border border-[#E5E5EA] dark:border-[#38383A] text-xs font-semibold text-[#1C1C1E] dark:text-white whitespace-nowrap shrink-0 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Sync Latest Analysis</span>
            </button>
          )}
        </div>

        {/* 8 Extracted Core Instruments */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {quickChips.map(({ label, asset }) => {
            const isGain = (asset?.changePercent ?? 0) >= 0;
            return (
              <div
                key={label}
                className="rounded-xl bg-[#F2F2F7]/80 dark:bg-[#141416] border border-[#E5E5EA] dark:border-[#2C2C2E] px-3 py-2"
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#8E8E93]">
                  {label}
                </div>
                <div className="text-xs sm:text-sm font-mono font-bold tabular-nums text-[#1C1C1E] dark:text-white mt-0.5 truncate">
                  {asset ? formatAssetPrice(asset) : '—'}
                </div>
                <div
                  className={`text-[11px] font-mono font-bold tabular-nums ${
                    isGain
                      ? 'text-[#16803C] dark:text-[#30D158]'
                      : 'text-[#D7261C] dark:text-[#FF453A]'
                  }`}
                >
                  {asset ? formatPct(asset.changePercent) : '—'}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Main Split Workspace: Left = Telegram/WhatsApp Text Extractor, Right = Instagram Visual Poster Studio */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: Text Format Extractor */}
        <section className="lg:col-span-6 liquid-glass-card rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MessageSquareText className="w-4 h-4 text-[#0071E3] dark:text-[#0A84FF]" />
              <h2 className="text-base font-bold text-[#1C1C1E] dark:text-white">
                Telegram &amp; WhatsApp Text Brief
              </h2>
            </div>

            {/* Format Switcher */}
            <div className="inline-flex items-center p-1 rounded-xl bg-[#F2F2F7] dark:bg-black/40 border border-[#E5E5EA] dark:border-[#2C2C2E]">
              {(
                [
                  { id: 'whatsapp', label: 'WhatsApp' },
                  { id: 'telegram', label: 'Telegram' },
                  { id: 'plain', label: 'Plain' },
                ] as { id: TextFormatMode; label: string }[]
              ).map((fmt) => (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => setTextFormat(fmt.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    textFormat === fmt.id
                      ? 'bg-[#0071E3] dark:bg-[#0A84FF] text-white shadow-sm'
                      : 'text-[#6C6C70] dark:text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-white'
                  }`}
                >
                  {fmt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Customization Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#8E8E93] mb-1">
                Brief Header Title
              </label>
              <input
                type="text"
                value={deskTitle}
                onChange={(e) => setDeskTitle(e.target.value)}
                maxLength={44}
                className="w-full rounded-xl bg-[#F2F2F7] dark:bg-[#141416] border border-[#E5E5EA] dark:border-[#2C2C2E] px-3 py-2 text-xs font-semibold text-[#1C1C1E] dark:text-white focus:outline-none focus:border-[#0071E3]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#8E8E93] mb-1">
                Signature / Channel Handle
              </label>
              <input
                type="text"
                value={deskHandle}
                onChange={(e) => setDeskHandle(e.target.value)}
                maxLength={36}
                placeholder="@yourdesk"
                className="w-full rounded-xl bg-[#F2F2F7] dark:bg-[#141416] border border-[#E5E5EA] dark:border-[#2C2C2E] px-3 py-2 text-xs font-semibold text-[#1C1C1E] dark:text-white focus:outline-none focus:border-[#0071E3]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#8E8E93] mb-1">
              Optional Custom Analyst Note (Overrides Flow Line)
            </label>
            <input
              type="text"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="e.g., Foreign inflows rotating back into BBCA & BBRI ahead of BI decision..."
              className="w-full rounded-xl bg-[#F2F2F7] dark:bg-[#141416] border border-[#E5E5EA] dark:border-[#2C2C2E] px-3 py-2 text-xs text-[#1C1C1E] dark:text-white placeholder:text-[#8E8E93] focus:outline-none focus:border-[#0071E3]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#6C6C70] dark:text-[#8E8E93]">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Sections:
            </span>
            {[
              { label: 'Support & Resistance', active: includeLevels, toggle: () => setIncludeLevels((v) => !v) },
              { label: 'Equity Flows', active: includeMovers, toggle: () => setIncludeMovers((v) => !v) },
              { label: 'Forward Outlook', active: includePrediction, toggle: () => setIncludePrediction((v) => !v) },
            ].map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={opt.toggle}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border whitespace-nowrap shrink-0 transition-colors ${
                  opt.active
                    ? 'bg-[#0071E3]/10 dark:bg-[#0A84FF]/15 border-[#0071E3]/40 text-[#0071E3] dark:text-[#0A84FF]'
                    : 'bg-[#F2F2F7] dark:bg-[#141416] border-[#E5E5EA] dark:border-[#2C2C2E] text-[#6C6C70] dark:text-[#8E8E93]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Read-only Copy Preview Box */}
          <div className="relative">
            <textarea
              readOnly
              value={formattedBriefText}
              rows={18}
              aria-label="Formatted brief for Telegram or WhatsApp"
              className="w-full rounded-xl bg-[#F2F2F7]/80 dark:bg-[#0D0E12] border border-[#E5E5EA] dark:border-[#2C2C2E] p-3.5 font-mono text-xs leading-relaxed text-[#1C1C1E] dark:text-[#E5E5EA] focus:outline-none resize-y"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-[#6C6C70] dark:text-[#8E8E93]">
              Ready to paste directly into {textFormat === 'whatsapp' ? 'WhatsApp' : textFormat === 'telegram' ? 'Telegram' : 'Email / Notes'}.
            </span>
            <button
              type="button"
              onClick={handleCopyText}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0071E3] dark:bg-[#0A84FF] hover:opacity-95 text-white text-xs font-bold whitespace-nowrap shrink-0 shadow-sm transition-opacity"
            >
              {copiedText ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedText ? 'Copied to Clipboard' : 'Copy Text Brief'}</span>
            </button>
          </div>
        </section>

        {/* RIGHT COLUMN: Social Media Picture Studio (IG Story & Feed Canvas PNG) */}
        <section className="lg:col-span-6 liquid-glass-card rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-[#0071E3] dark:text-[#0A84FF]" />
              <h2 className="text-base font-bold text-[#1C1C1E] dark:text-white">
                Social Media Poster Studio
              </h2>
            </div>

            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[#6C6C70] dark:text-[#8E8E93]">
              <Sparkles className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#0A84FF]" />
              {ASPECT_SPECS[posterAspect].tag} PNG
            </span>
          </div>

          {/* Aspect Ratio + Theme Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="inline-flex items-center p-1 rounded-xl bg-[#F2F2F7] dark:bg-black/40 border border-[#E5E5EA] dark:border-[#2C2C2E]">
              {(Object.keys(ASPECT_SPECS) as PosterAspect[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPosterAspect(key)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    posterAspect === key
                      ? 'bg-[#0071E3] dark:bg-[#0A84FF] text-white shadow-sm'
                      : 'text-[#6C6C70] dark:text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-white'
                  }`}
                >
                  {ASPECT_SPECS[key].label}
                </button>
              ))}
            </div>

            <div className="inline-flex items-center p-1 rounded-xl bg-[#F2F2F7] dark:bg-black/40 border border-[#E5E5EA] dark:border-[#2C2C2E]">
              {(Object.keys(POSTER_THEMES) as PosterTheme[]).map((themeKey) => (
                <button
                  key={themeKey}
                  type="button"
                  onClick={() => setPosterTheme(themeKey)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    posterTheme === themeKey
                      ? 'bg-[#1C1C1E] dark:bg-white text-white dark:text-[#1C1C1E] shadow-sm'
                      : 'text-[#6C6C70] dark:text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-white'
                  }`}
                >
                  {POSTER_THEMES[themeKey].label}
                </button>
              ))}
            </div>
          </div>

          {/* Live High-DPI Canvas Preview */}
          <div className="rounded-2xl bg-[#E5E5EA]/60 dark:bg-[#0B0C10] border border-[#E5E5EA] dark:border-[#2C2C2E] p-3 flex justify-center items-center">
            <canvas
              ref={canvasRef}
              className="max-w-full max-h-[560px] w-auto h-auto rounded-xl shadow-xl border border-black/10 dark:border-white/10"
            />
          </div>

          {/* Export Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <span className="text-[11px] text-[#6C6C70] dark:text-[#8E8E93]">
              {copiedImage === 'unsupported'
                ? 'Direct image copy unavailable in this browser — use Download PNG.'
                : 'Exports crisp Retina PNG for Instagram Story, Carousel, or LinkedIn.'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyPng}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#F2F2F7] dark:bg-[#2C2C2E] hover:bg-[#E5E5EA] dark:hover:bg-[#3A3A3C] border border-[#E5E5EA] dark:border-[#38383A] text-xs font-bold text-[#1C1C1E] dark:text-white whitespace-nowrap shrink-0 transition-colors"
              >
                {copiedImage === 'copied' ? (
                  <Check className="w-4 h-4 text-[#16803C] dark:text-[#30D158]" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                <span>{copiedImage === 'copied' ? 'Image Copied' : 'Copy Image'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPng}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#16803C] dark:bg-[#30D158] hover:opacity-95 text-white dark:text-[#09120B] text-xs font-bold whitespace-nowrap shrink-0 shadow-sm transition-opacity"
              >
                <Download className="w-4 h-4" />
                <span>Download PNG</span>
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
