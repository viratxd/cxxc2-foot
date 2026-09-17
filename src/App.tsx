import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, ChevronDown, Crosshair, Layers3, Maximize2, Minus, MousePointer2, PanelRight, Play, RotateCcw, Search, Settings2, SlidersHorizontal, Sparkles, ZoomIn, Loader2, Wifi, WifiOff, Zap, BarChart3, X } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────
type ViewMode = 'candles' | 'footprint';
type Level = { price: number; bid: number; ask: number };
type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number; levels: Level[]; realFootprint: boolean };
type HoverInfo = { x: number; y: number; candle: Candle; level: Level } | null;
type AggTrade = { price: number; qty: number; isBuyerMaker: boolean; time: number };
type CoinSearchResult = { id: string; name: string; symbol: string; thumb: string };

// ─── Constants ───────────────────────────────────────────
const COLORS = { up: '#16b89a', down: '#f04f5f', pocDark: '#3a4a5c', pocLight: '#cdd8e3', imbalanceBid: '#e34e5c', imbalanceAsk: '#21a88f', profile: '#3b82f6' };
const IMBALANCE_RATIO = 3.0; // 300% threshold

const TF_MAP: Record<string, string> = { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1D': '1d', '1W': '1w' };
const TF_MS: Record<string, number> = { '1m': 60_000, '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000, '1D': 86_400_000, '1W': 604_800_000 };

// ─── Helpers ─────────────────────────────────────────────
function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1000) return `${(value / 1000).toFixed(abs >= 10000 ? 1 : 2)}K`;
  return value.toFixed(abs < 1 ? 4 : abs < 100 ? 2 : 0);
}

function fmtPrice(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Binance API ─────────────────────────────────────────
async function searchCoinGecko(query: string): Promise<CoinSearchResult[]> {
  const response = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error(`CoinGecko search error: ${response.status}`);
  const payload: { coins?: CoinSearchResult[] } = await response.json();
  return (payload.coins ?? []).slice(0, 8);
}

async function fetchBinanceCandles(symbol: string, interval: string, limit = 200): Promise<Candle[]> {
  const bi = TF_MAP[interval] || '1h';
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${bi}&limit=${limit}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Binance API error: ${response.status}`);
  const rows: unknown[][] = await response.json();
  return rows.map((row) => ({
    time: row[0] as number,
    open: parseFloat(row[1] as string),
    high: parseFloat(row[2] as string),
    low: parseFloat(row[3] as string),
    close: parseFloat(row[4] as string),
    volume: parseFloat(row[5] as string),
    levels: [] as Level[],
    realFootprint: false,
  }));
}

async function fetchAggTrades(symbol: string, startTime: number, endTime: number): Promise<AggTrade[]> {
  const url = `https://api.binance.com/api/v3/aggTrades?symbol=${symbol}&startTime=${startTime}&endTime=${endTime}&limit=1000`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`aggTrades error: ${response.status}`);
  const rows: unknown[][] = await response.json();
  return rows.map((row) => ({
    price: parseFloat(row[1] as string),
    qty: parseFloat(row[2] as string),
    isBuyerMaker: row[4] as boolean,
    time: row[0] as number,
  }));
}

// Build footprint from real tick data: each trade is classified as bid (seller is market maker) or ask (buyer is market maker)
function buildFootprintFromTrades(candle: Candle, trades: AggTrade[], numLevels = 12): Level[] {
  if (trades.length === 0) return generateFootprintLevels(candle);
  const step = (candle.high - candle.low) / (numLevels - 1);
  const buckets = new Map<number, { bid: number; ask: number }>();
  for (let i = 0; i < numLevels; i++) buckets.set(i, { bid: 0, ask: 0 });
  for (const trade of trades) {
    const idx = Math.min(numLevels - 1, Math.max(0, Math.round((candle.high - trade.price) / step)));
    const bucket = buckets.get(idx)!;
    if (trade.isBuyerMaker) bucket.bid += trade.qty;
    else bucket.ask += trade.qty;
  }
  const levels: Level[] = [];
  for (let i = 0; i < numLevels; i++) {
    const b = buckets.get(i)!;
    levels.push({ price: candle.high - step * i, bid: b.bid, ask: b.ask });
  }
  return levels;
}

// ─── Demo data (fallback) ────────────────────────────────
function generateDemoCandles(symbol: string, interval: string, count = 150): Candle[] {
  const tfMs = TF_MS[interval] || 3_600_000;
  const now = Date.now();
  const basePrice: Record<string, number> = { BTCUSDT: 95000, ETHUSDT: 3200, SOLUSDT: 180, BNBUSDT: 600, XRPUSDT: 2.3, DOGEUSDT: 0.38 };
  let price = basePrice[symbol] || 95000;
  const volatility = basePrice[symbol] ? basePrice[symbol] * 0.012 : 100;
  return Array.from({ length: count }, (_, index) => {
    const time = now - (count - 1 - index) * tfMs;
    const trend = Math.sin(index * 0.15) * volatility * 2 + Math.sin(index * 0.04) * volatility * 4;
    const noise = (Math.random() - 0.5) * volatility * 1.5;
    const open = price;
    const close = price + trend * 0.3 + noise;
    const high = Math.max(open, close) + Math.random() * volatility * 0.8;
    const low = Math.min(open, close) - Math.random() * volatility * 0.8;
    const range = high - low;
    const bodySize = Math.abs(close - open);
    const volume = (bodySize / volatility) * 500 + Math.random() * 300 + 200;
    const numLevels = 12;
    const step = range / (numLevels - 1);
    const positive = close >= open;
    const levels: Level[] = [];
    let remaining = volume;
    for (let li = 0; li < numLevels; li++) {
      const levelPrice = high - step * li;
      const centerDist = Math.abs(li - (numLevels - 1) / 2) / ((numLevels - 1) / 2);
      const weight = (1 - centerDist * 0.5) * (0.6 + Math.random() * 0.8);
      const levelVol = li === numLevels - 1 ? remaining : remaining * weight * 0.25;
      remaining -= levelVol;
      const bidRatio = positive ? 0.40 + Math.random() * 0.18 : 0.50 + Math.random() * 0.16;
      levels.push({ price: levelPrice, bid: levelVol * bidRatio, ask: levelVol * (1 - bidRatio) });
    }
    price = close;
    return { time, open, high, low, close, volume, levels, realFootprint: false };
  });
}

function generateFootprintLevels(candle: Candle): Level[] {
  const { high, low, close, volume } = candle;
  const numLevels = 12;
  const step = (high - low) / (numLevels - 1);
  const positive = close >= candle.open;
  const levels: Level[] = [];
  let remaining = volume;
  for (let index = 0; index < numLevels; index++) {
    const levelPrice = high - step * index;
    const centerDist = Math.abs(index - (numLevels - 1) / 2) / ((numLevels - 1) / 2);
    const weight = (1 - centerDist * 0.55) * (0.7 + Math.random() * 0.6);
    const levelVol = index === numLevels - 1 ? remaining : remaining * weight * 0.28;
    remaining -= levelVol;
    const bidRatio = positive ? 0.42 + Math.random() * 0.16 : 0.50 + Math.random() * 0.14;
    levels.push({ price: levelPrice, bid: levelVol * bidRatio, ask: levelVol * (1 - bidRatio) });
  }
  return levels;
}

// ─── Imbalance detection ─────────────────────────────────
function getImbalance(level: Level): 'bid' | 'ask' | null {
  if (level.ask > 0 && level.bid / level.ask >= IMBALANCE_RATIO) return 'bid';
  if (level.bid > 0 && level.ask / level.bid >= IMBALANCE_RATIO) return 'ask';
  return null;
}

// ─── Volume Profile computation ──────────────────────────
type ProfileRow = { price: number; volume: number; bidVol: number; askVol: number };

function computeVolumeProfile(candles: Candle[], numBins = 50): ProfileRow[] {
  if (candles.length === 0) return [];
  const minP = Math.min(...candles.map((c) => c.low));
  const maxP = Math.max(...candles.map((c) => c.high));
  const step = (maxP - minP) / numBins || 1;
  const bins = Array.from({ length: numBins }, (_, i) => ({ price: minP + step * (i + 0.5), volume: 0, bidVol: 0, askVol: 0 }));
  for (const candle of candles) {
    for (const level of candle.levels) {
      const idx = Math.min(numBins - 1, Math.max(0, Math.floor((level.price - minP) / step)));
      bins[idx].volume += level.bid + level.ask;
      bins[idx].bidVol += level.bid;
      bins[idx].askVol += level.ask;
    }
  }
  return bins;
}

// ─── Canvas Component ───────────────────────────────────
function FootprintCanvas({ data, mode, dark, showProfile, showImbalance, selectedCandle, onHover, onSelectCandle }: {
  data: Candle[]; mode: ViewMode; dark: boolean; showProfile: boolean; showImbalance: boolean;
  selectedCandle: number; onHover: (info: HoverInfo) => void; onSelectCandle: (index: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ pan: 0, zoom: 1, drag: false, startX: 0, startPan: 0, crossX: -1, crossY: -1, hoverCandle: -1, hoverLevel: -1, hasMoved: false });
  const drawRef = useRef<() => void>(() => {});

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(() => drawRef.current());
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || data.length === 0) return;
    const rect = wrap.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (width < 10 || height < 10) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const profileW = showProfile ? 120 : 0;
    const axis = 80;
    const bottom = 38;
    const chartWidth = width - axis - profileW;
    const chartHeight = height - bottom;
    const s = stateRef.current;

    const candleW = Math.max(6, 70 * s.zoom);
    const spacing = candleW + Math.max(3, candleW * 0.20);
    const rightEdge = chartWidth - 16;
    const x = (index: number) => rightEdge - (data.length - 1 - index) * spacing + s.pan;

    let firstVis = 0;
    let lastVis = data.length - 1;
    for (let i = 0; i < data.length; i++) { if (x(i) >= -spacing) { firstVis = i; break; } }
    for (let i = data.length - 1; i >= 0; i--) { if (x(i) <= chartWidth + spacing) { lastVis = i; break; } }
    const visible = data.slice(firstVis, lastVis + 1);
    if (visible.length === 0) return;

    const minPrice = Math.min(...visible.map((c) => c.low));
    const maxPrice = Math.max(...visible.map((c) => c.high));
    const pad = (maxPrice - minPrice) * 0.08 || 10;
    const yMax = maxPrice + pad;
    const yMin = minPrice - pad;
    const range = yMax - yMin;
    const y = (price: number) => ((yMax - price) / range) * chartHeight;

    // Background
    ctx.fillStyle = dark ? '#0e1319' : '#f8fafc';
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    const gridN = 10;
    for (let gi = 0; gi <= gridN; gi++) {
      const gy = (chartHeight / gridN) * gi;
      ctx.strokeStyle = dark ? 'rgba(132, 149, 173, .07)' : 'rgba(38, 58, 79, .05)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(chartWidth, gy); ctx.stroke();
    }

    // Vertical time grid
    const tEvery = Math.max(1, Math.round(130 / spacing));
    for (let index = firstVis; index <= lastVis; index++) {
      if (index % tEvery === 0) {
        const px = x(index);
        ctx.strokeStyle = dark ? 'rgba(132, 149, 173, .05)' : 'rgba(38, 58, 79, .03)';
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, chartHeight); ctx.stroke();
      }
    }

    // Selected candle highlight
    if (selectedCandle >= 0 && selectedCandle < data.length) {
      const px = x(selectedCandle);
      ctx.fillStyle = dark ? 'rgba(68, 199, 216, .08)' : 'rgba(68, 199, 216, .06)';
      ctx.fillRect(px - spacing / 2, 0, spacing, chartHeight);
      ctx.strokeStyle = dark ? 'rgba(68, 199, 216, .4)' : 'rgba(68, 199, 216, .3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, chartHeight); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw candles
    for (let index = firstVis; index <= lastVis; index++) {
      const px = x(index);
      if (px < -spacing || px > chartWidth + spacing) continue;
      const candle = data[index];
      const positive = candle.close >= candle.open;
      const color = positive ? COLORS.up : COLORS.down;

      if (mode === 'candles' || (mode === 'footprint' && selectedCandle >= 0 && index !== selectedCandle)) {
        // Normal candlestick (or context candle in overlay mode)
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(px, y(candle.high)); ctx.lineTo(px, y(candle.low)); ctx.stroke();
        const bodyTop = y(Math.max(candle.open, candle.close));
        const bodyBot = y(Math.min(candle.open, candle.close));
        ctx.fillStyle = color;
        ctx.fillRect(px - candleW / 2, bodyTop, candleW, Math.max(2, bodyBot - bodyTop));
      }

      if (mode === 'footprint') {
        const showFullFootprint = selectedCandle < 0 || index === selectedCandle;
        if (!showFullFootprint) continue;

        const levels = candle.levels;
        if (levels.length === 0) continue;
        const maxVol = Math.max(...levels.map((l) => Math.max(l.bid, l.ask)));
        const pocIdx = levels.reduce((bi, l, li) => (l.bid + l.ask > levels[bi].bid + levels[bi].ask ? li : bi), 0);

        // Expanded width for selected candle, normal for others
        const colHalf = selectedCandle === index
          ? Math.min(80, spacing * 0.45)
          : Math.min(44, spacing * 0.38);
        const cellW = colHalf - 3;

        // Wick
        ctx.strokeStyle = positive ? 'rgba(22,184,154,0.35)' : 'rgba(240,79,95,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px, y(candle.high)); ctx.lineTo(px, y(candle.low)); ctx.stroke();

        // Faint body
        const bodyTop = y(Math.max(candle.open, candle.close));
        const bodyBot = y(Math.min(candle.open, candle.close));
        ctx.fillStyle = positive ? 'rgba(22,184,154,0.06)' : 'rgba(240,79,95,0.06)';
        ctx.fillRect(px - colHalf, bodyTop, colHalf * 2, Math.max(3, bodyBot - bodyTop));

        const priceStep = (candle.high - candle.low) / (levels.length - 1);
        const rowH = Math.max(9, Math.min(22, (y(0) - y(priceStep)) - 1));

        levels.forEach((level, li) => {
          const rowY = y(level.price) - rowH / 2;
          const isPoc = li === pocIdx;
          const isHover = s.hoverCandle === index && s.hoverLevel === li;
          const imbalance = showImbalance ? getImbalance(level) : null;
          const isImbalanced = imbalance !== null;

          // Bid cell
          if (isPoc) {
            ctx.fillStyle = dark ? COLORS.pocDark : COLORS.pocLight;
          } else if (isImbalanced && imbalance === 'bid') {
            ctx.fillStyle = dark ? 'rgba(227, 78, 92, 0.85)' : 'rgba(192, 57, 43, 0.85)';
          } else {
            ctx.fillStyle = `rgba(240, 79, 95, ${0.10 + (level.bid / maxVol) * 0.72})`;
          }
          ctx.fillRect(px - colHalf, rowY, cellW, rowH - 1.5);

          // Ask cell
          if (isPoc) {
            ctx.fillStyle = dark ? COLORS.pocDark : COLORS.pocLight;
          } else if (isImbalanced && imbalance === 'ask') {
            ctx.fillStyle = dark ? 'rgba(33, 168, 143, 0.85)' : 'rgba(13, 124, 106, 0.85)';
          } else {
            ctx.fillStyle = `rgba(22, 184, 154, ${0.10 + (level.ask / maxVol) * 0.72})`;
          }
          ctx.fillRect(px + 3, rowY, cellW, rowH - 1.5);

          if (isHover) {
            ctx.strokeStyle = dark ? '#7dd3fc' : '#0284c7';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(px - colHalf - 0.5, rowY - 0.5, colHalf * 2 + 1, rowH);
          }
          if (isPoc) {
            ctx.strokeStyle = dark ? '#8a9bae' : '#94a3b8';
            ctx.lineWidth = 1;
            ctx.strokeRect(px - colHalf, rowY, colHalf * 2, rowH - 1.5);
          }
          if (isImbalanced) {
            ctx.strokeStyle = dark ? '#fbbf24' : '#f59e0b';
            ctx.lineWidth = 1;
            ctx.strokeRect(px - colHalf - 0.5, rowY - 0.5, colHalf * 2 + 1, rowH);
          }

          // Numbers
          if (colHalf > 18) {
            const fontSize = selectedCandle === index ? (rowH > 14 ? 10 : 9) : (rowH > 14 ? 9 : 8);
            ctx.font = `${isPoc || isHover || isImbalanced ? '700' : '500'} ${fontSize}px ui-monospace, SFMono-Regular, monospace`;
            ctx.fillStyle = isPoc ? (dark ? '#e8eef5' : '#1a2532') : dark ? '#f0a8b0' : '#c0392b';
            ctx.textAlign = 'right';
            ctx.fillText(compact(level.bid), px - 5, rowY + rowH - 4);
            ctx.fillStyle = isPoc ? (dark ? '#e8eef5' : '#1a2532') : dark ? '#9ad6c6' : '#0d7c6a';
            ctx.textAlign = 'left';
            ctx.fillText(compact(level.ask), px + 8, rowY + rowH - 4);
          }
        });

        // Price labels
        if (colHalf > 24) {
          ctx.font = '9px ui-monospace, SFMono-Regular, monospace';
          ctx.fillStyle = dark ? '#6a7a8c' : '#8a9bae';
          ctx.textAlign = 'left';
          ctx.fillText(fmtPrice(candle.high), px + colHalf + 4, y(candle.high) + 3);
          ctx.fillText(fmtPrice(candle.low), px + colHalf + 4, y(candle.low) + 3);
        }

        // Real footprint indicator
        if (candle.realFootprint) {
          ctx.fillStyle = dark ? '#44c7d8' : '#0284c7';
          ctx.font = '8px ui-monospace, SFMono-Regular, monospace';
          ctx.textAlign = 'center';
          ctx.fillText('●', px, y(candle.high) - 4);
        }

        // Delta + Total
        const total = levels.reduce((sum, l) => sum + l.bid + l.ask, 0);
        const delta = levels.reduce((sum, l) => sum + l.ask - l.bid, 0);
        const sumY = Math.min(chartHeight - 8, y(candle.low) + 20);
        if (sumY < chartHeight - 2) {
          ctx.font = '9px ui-monospace, SFMono-Regular, monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = delta >= 0 ? COLORS.up : COLORS.down;
          ctx.fillText(`Δ${delta >= 0 ? '+' : ''}${compact(delta)}`, px, sumY);
          ctx.fillStyle = dark ? '#7a8a9c' : '#7a8a9c';
          ctx.fillText(`Σ${compact(total)}`, px, sumY + 12);
        }
      }

      // Time labels
      if (index % tEvery === 0) {
        ctx.fillStyle = dark ? '#6a7a8c' : '#8a9bae';
        ctx.font = '10px ui-monospace, SFMono-Regular, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(new Date(data[index].time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), px, chartHeight + 22);
      }
    }

    // ─── Volume Profile sidebar ─────────
    if (showProfile) {
      const profileX = chartWidth;
      const profileInnerW = profileW - 6;
      const profileBins = computeVolumeProfile(visible, 40);
      const maxProfileVol = Math.max(...profileBins.map((b) => b.volume), 1);
      const pocProfileIdx = profileBins.reduce((bi, b, i) => (b.volume > profileBins[bi].volume ? i : bi), 0);
      const profileRowH = chartHeight / profileBins.length;

      ctx.fillStyle = dark ? '#111820' : '#eef2f6';
      ctx.fillRect(profileX, 0, profileW, height);

      profileBins.forEach((bin, bi) => {
        const by = bi * profileRowH;
        const barW = (bin.volume / maxProfileVol) * profileInnerW;
        const isPoc = bi === pocProfileIdx;
        // Horizontal bar from right to left
        const barX = profileX + profileInnerW - barW;
        const delta = bin.askVol - bin.bidVol;
        ctx.fillStyle = isPoc
          ? (dark ? COLORS.pocDark : COLORS.pocLight)
          : delta >= 0
            ? `rgba(22, 184, 154, ${0.25 + (bin.volume / maxProfileVol) * 0.45})`
            : `rgba(240, 79, 95, ${0.25 + (bin.volume / maxProfileVol) * 0.45})`;
        ctx.fillRect(barX, by, barW, profileRowH - 1);
        if (isPoc) {
          ctx.strokeStyle = dark ? '#8a9bae' : '#94a3b8';
          ctx.lineWidth = 1;
          ctx.strokeRect(barX, by, barW, profileRowH - 1);
        }
      });

      // Profile label
      ctx.fillStyle = dark ? '#7a8a9c' : '#7a8a9c';
      ctx.font = '9px ui-monospace, SFMono-Regular, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('VOL PROFILE', profileX + profileW / 2, 14);
    }

    // Price axis
    ctx.fillStyle = dark ? '#111820' : '#eef2f6';
    ctx.fillRect(width - axis, 0, axis, height);
    ctx.strokeStyle = dark ? '#293440' : '#d7e0e8';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(width - axis, 0); ctx.lineTo(width - axis, height); ctx.stroke();

    ctx.font = '11px ui-monospace, SFMono-Regular, monospace';
    for (let gi = 0; gi <= gridN; gi++) {
      const gy = (chartHeight / gridN) * gi;
      const gp = yMax - (range / gridN) * gi;
      ctx.fillStyle = dark ? '#7a8a9c' : '#7a8a9c';
      ctx.textAlign = 'left';
      ctx.fillText(fmtPrice(gp), width - axis + 8, gy + 4);
    }

    // Crosshair
    if (s.crossX >= 0 && s.crossX < chartWidth && s.crossY >= 0 && s.crossY < chartHeight) {
      ctx.strokeStyle = dark ? 'rgba(233, 240, 246, .40)' : 'rgba(28, 44, 60, .30)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(s.crossX, 0); ctx.lineTo(s.crossX, chartHeight); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, s.crossY); ctx.lineTo(chartWidth, s.crossY); ctx.stroke();
      ctx.setLineDash([]);

      const crossPrice = yMax - (s.crossY / chartHeight) * range;
      ctx.fillStyle = dark ? '#23303c' : '#dce4eb';
      ctx.fillRect(width - axis, s.crossY - 11, axis, 22);
      ctx.fillStyle = dark ? '#e8eef5' : '#1a2532';
      ctx.font = 'bold 11px ui-monospace, SFMono-Regular, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(fmtPrice(crossPrice), width - axis + 8, s.crossY + 4);

      if (s.hoverCandle >= 0 && s.hoverCandle < data.length) {
        const px = x(s.hoverCandle);
        const ts = new Date(data[s.hoverCandle].time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        ctx.fillStyle = dark ? '#23303c' : '#dce4eb';
        const bw = ctx.measureText(ts).width + 16;
        ctx.fillRect(px - bw / 2, chartHeight + 4, bw, 22);
        ctx.fillStyle = dark ? '#e8eef5' : '#1a2532';
        ctx.font = '10px ui-monospace, SFMono-Regular, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(ts, px, chartHeight + 18);
      }
    }

    // Current price line
    const lastCandle = data[data.length - 1];
    if (lastCandle) {
      const lastY = y(lastCandle.close);
      const up = lastCandle.close >= lastCandle.open;
      ctx.strokeStyle = up ? COLORS.up : COLORS.down;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(0, lastY); ctx.lineTo(chartWidth, lastY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = up ? COLORS.up : COLORS.down;
      ctx.fillRect(width - axis, lastY - 11, axis, 22);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px ui-monospace, SFMono-Regular, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(fmtPrice(lastCandle.close), width - axis + 8, lastY + 4);
    }
  }, [data, dark, mode, showProfile, showImbalance, selectedCandle]);

  drawRef.current = draw;
  useEffect(() => { draw(); }, [draw]);

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const s = stateRef.current;
    s.crossX = px;
    s.crossY = py;
    if (s.drag) {
      s.pan = s.startPan + event.clientX - s.startX;
      s.hasMoved = true;
    }
    const profileW = showProfile ? 120 : 0;
    const chartWidth = rect.width - 80 - profileW;
    const chartHeight = rect.height - 38;

    if (px < chartWidth && py < chartHeight && data.length > 0 && !s.drag) {
      const candleW = Math.max(6, 70 * s.zoom);
      const spacing = candleW + Math.max(3, candleW * 0.20);
      const rightEdge = chartWidth - 16;
      const xPos = (index: number) => rightEdge - (data.length - 1 - index) * spacing + s.pan;
      const colHalf = Math.min(44, spacing * 0.38);

      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < data.length; i++) {
        const dist = Math.abs(xPos(i) - px);
        if (dist < bestDist) { bestDist = dist; bestIdx = i; }
      }
      if (bestIdx >= 0 && bestDist < colHalf + 12) {
        const candle = data[bestIdx];
        if (candle.levels.length > 0) {
          let fV = 0, lV = data.length - 1;
          for (let i = 0; i < data.length; i++) { if (xPos(i) >= -spacing) { fV = i; break; } }
          for (let i = data.length - 1; i >= 0; i--) { if (xPos(i) <= chartWidth + spacing) { lV = i; break; } }
          const vis = data.slice(fV, lV + 1);
          const minP = Math.min(...vis.map((c) => c.low));
          const maxP = Math.max(...vis.map((c) => c.high));
          const p = (maxP - minP) * 0.08 || 10;
          const yMx = maxP + p;
          const yRng = (maxP - minP) + p * 2;
          const hoverPrice = yMx - (py / chartHeight) * yRng;
          let bestLvl = 0, bestLvlDist = Infinity;
          candle.levels.forEach((lvl, li) => {
            const d = Math.abs(lvl.price - hoverPrice);
            if (d < bestLvlDist) { bestLvlDist = d; bestLvl = li; }
          });
          s.hoverCandle = bestIdx;
          s.hoverLevel = bestLvl;
          onHover({ x: px, y: py, candle, level: candle.levels[bestLvl] });
        }
      } else {
        s.hoverCandle = -1;
        s.hoverLevel = -1;
        onHover(null);
      }
    } else if (!s.drag) {
      s.hoverCandle = -1;
      s.hoverLevel = -1;
      onHover(null);
    }
    draw();
  };

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none"
        onPointerMove={handlePointerMove}
        onPointerDown={(e) => {
          stateRef.current.drag = true;
          stateRef.current.startX = e.clientX;
          stateRef.current.startPan = stateRef.current.pan;
          stateRef.current.hasMoved = false;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerUp={() => {
          const s = stateRef.current;
          if (!s.hasMoved && s.hoverCandle >= 0) {
            onSelectCandle(s.hoverCandle === selectedCandle ? -1 : s.hoverCandle);
          }
          s.drag = false;
        }}
        onPointerLeave={() => {
          stateRef.current.crossX = -1;
          stateRef.current.crossY = -1;
          stateRef.current.hoverCandle = -1;
          stateRef.current.hoverLevel = -1;
          onHover(null);
          draw();
        }}
        onWheel={(e) => {
          e.preventDefault();
          stateRef.current.zoom = Math.max(0.35, Math.min(5, stateRef.current.zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
          draw();
        }}
      />
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────
export default function App() {
  const [mode, setMode] = useState<ViewMode>('footprint');
  const [timeframe, setTimeframe] = useState('1h');
  const [dark, setDark] = useState(true);
  const [hover, setHover] = useState<HoverInfo>(null);
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [coinQuery, setCoinQuery] = useState('BTC');
  const [coinSuggestions, setCoinSuggestions] = useState<CoinSearchResult[]>([]);
  const [showCoinSuggestions, setShowCoinSuggestions] = useState(false);
  const [data, setData] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<'binance' | 'demo'>('binance');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [showProfile, setShowProfile] = useState(true);
  const [showImbalance, setShowImbalance] = useState(true);
  const [selectedCandle, setSelectedCandle] = useState(-1);
  const [fetchingTicks, setFetchingTicks] = useState(false);

  useEffect(() => {
    const query = coinQuery.trim();
    if (query.length < 2 || query.toUpperCase() === symbol.replace('USDT', '')) {
      setCoinSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      searchCoinGecko(query)
        .then((results) => {
          if (!controller.signal.aborted) setCoinSuggestions(results);
        })
        .catch(() => {
          if (!controller.signal.aborted) setCoinSuggestions([]);
        });
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [coinQuery, symbol]);

  // Fetch candles
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setHover(null);
    setSelectedCandle(-1);

    fetchBinanceCandles(symbol, timeframe, 150)
      .then((candles) => {
        if (cancelled) return;
        setData(candles.map((c) => ({ ...c, levels: generateFootprintLevels(c) })));
        setDataSource('binance');
        setLastUpdate(new Date());
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setData(generateDemoCandles(symbol, timeframe, 150));
        setDataSource('demo');
        setLastUpdate(new Date());
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [symbol, timeframe]);

  // Fetch real tick data for a selected candle
  const fetchRealFootprint = useCallback(async (candleIndex: number) => {
    if (dataSource !== 'binance' || candleIndex < 0 || candleIndex >= data.length) return;
    const candle = data[candleIndex];
    if (candle.realFootprint) return;
    setFetchingTicks(true);
    try {
      const tfMs = TF_MS[timeframe] || 3_600_000;
      const trades = await fetchAggTrades(symbol, candle.time, candle.time + tfMs);
      const realLevels = buildFootprintFromTrades(candle, trades);
      setData((prev) => {
        const updated = [...prev];
        updated[candleIndex] = { ...candle, levels: realLevels, realFootprint: true };
        return updated;
      });
    } catch {
      // If tick fetch fails, keep the estimated footprint
    }
    setFetchingTicks(false);
  }, [dataSource, data, symbol, timeframe]);

  // When a candle is selected, fetch real tick data for it
  useEffect(() => {
    if (selectedCandle >= 0) {
      fetchRealFootprint(selectedCandle);
    }
  }, [selectedCandle, fetchRealFootprint]);

  // Auto-refresh
  useEffect(() => {
    if (data.length === 0) return;
    const interval = setInterval(() => {
      if (dataSource === 'binance') {
        fetchBinanceCandles(symbol, timeframe, 2)
          .then((latest) => {
            if (latest.length === 0) return;
            const newC = { ...latest[0], levels: generateFootprintLevels(latest[0]), realFootprint: false };
            setData((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.time === newC.time) {
                const updated = [...prev];
                updated[updated.length - 1] = newC;
                return updated;
              }
              return [...prev.slice(-199), newC];
            });
            setLastUpdate(new Date());
          })
          .catch(() => {});
      } else {
        setData((prev) => {
          const last = prev[prev.length - 1];
          const tfMs = TF_MS[timeframe] || 3_600_000;
          const newClose = last.close * (1 + (Math.random() - 0.5) * 0.008);
          const newCandle: Candle = {
            time: last.time + tfMs, open: last.close,
            high: Math.max(last.close, newClose) + Math.random() * 50,
            low: Math.min(last.close, newClose) - Math.random() * 50,
            close: newClose, volume: last.volume * (0.85 + Math.random() * 0.3),
            levels: [], realFootprint: false,
          };
          newCandle.levels = generateFootprintLevels(newCandle);
          return [...prev.slice(-199), newCandle];
        });
        setLastUpdate(new Date());
      }
    }, dataSource === 'binance' ? 10000 : 30000);
    return () => clearInterval(interval);
  }, [symbol, timeframe, dataSource, data.length]);

  const latest = data[data.length - 1];
  const change = latest ? ((latest.close - latest.open) / latest.open) * 100 : 0;
  const selectedCandleData = selectedCandle >= 0 && selectedCandle < data.length ? data[selectedCandle] : null;
  const selectedDelta = selectedCandleData ? selectedCandleData.levels.reduce((s, l) => s + l.ask - l.bid, 0) : 0;
  const selectedTotal = selectedCandleData ? selectedCandleData.levels.reduce((s, l) => s + l.bid + l.ask, 0) : 0;
  const selectedImbalances = selectedCandleData ? selectedCandleData.levels.filter((l) => getImbalance(l) !== null).length : 0;

  return (
    <main className={dark ? 'app dark' : 'app'}>
      <section className="terminal">
        <header className="topbar">
          <div className="brand"><div className="brand-mark"><Activity size={17} /></div><span>MARKET<span className="brand-accent">FLOW</span></span></div>
          <div className="symbol-picker">
            <Search size={15} />
            <input
              value={coinQuery}
              onChange={(event) => {
                setCoinQuery(event.target.value);
                setShowCoinSuggestions(true);
              }}
              onFocus={() => setShowCoinSuggestions(true)}
              onBlur={() => window.setTimeout(() => setShowCoinSuggestions(false), 150)}
              className="symbol-select symbol-search-input"
              aria-label="Search coins"
              placeholder="Search coins"
            />
            <ChevronDown size={14} className="muted" />
            {showCoinSuggestions && coinSuggestions.length > 0 && (
              <div className="coin-suggestions">
                {coinSuggestions.map((coin) => (
                  <button
                    key={coin.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setSymbol(`${coin.symbol.toUpperCase()}USDT`);
                      setCoinQuery(coin.symbol.toUpperCase());
                      setShowCoinSuggestions(false);
                    }}
                  >
                    <img src={coin.thumb} alt="" />
                    <span><strong>{coin.name}</strong><small>{coin.symbol.toUpperCase()} / USDT</small></span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="toolbar-divider" />
          <div className="timeframes">
            {['1m', '5m', '15m', '1h', '4h', '1D', '1W'].map((item) => (
              <button className={timeframe === item ? 'selected' : ''} onClick={() => setTimeframe(item)} key={item}>{item}</button>
            ))}
          </div>
          <div className="top-actions">
            <button className={showProfile ? 'active-toggle' : ''} onClick={() => setShowProfile(!showProfile)}><BarChart3 size={16} /> Profile</button>
            <button className={showImbalance ? 'active-toggle' : ''} onClick={() => setShowImbalance(!showImbalance)}><Zap size={16} /> Imbalance</button>
            <button><SlidersHorizontal size={16} /> Chart</button>
            <button className="icon-button" onClick={() => setDark(!dark)}><Settings2 size={17} /></button>
            <button className="icon-button"><Maximize2 size={17} /></button>
          </div>
        </header>

        <div className="chart-header">
          <div className="instrument">
            <span className="live-dot" />
            <strong>{symbol}</strong>
            <span className="muted">·</span>
            <span>{timeframe}</span>
            {dataSource === 'binance'
              ? <span className="binance-pill"><Wifi size={10} /> BINANCE LIVE</span>
              : <span className="demo-pill"><WifiOff size={10} /> SIMULATED</span>
            }
            {fetchingTicks && <span className="muted fetching-ticks"><Loader2 size={11} className="spin" /> Fetching tick data…</span>}
          </div>
          {latest && (
            <div className="ohlc">
              <span>O <b>{fmtPrice(latest.open)}</b></span>
              <span className="up-text">H <b>{fmtPrice(latest.high)}</b></span>
              <span className="down-text">L <b>{fmtPrice(latest.low)}</b></span>
              <span className={change >= 0 ? 'up-text' : 'down-text'}>C <b>{fmtPrice(latest.close)}</b></span>
              <span className={change >= 0 ? 'up-text' : 'down-text'}>{change >= 0 ? '+' : ''}{change.toFixed(2)}%</span>
              <span className="muted">Vol <b>{compact(latest.volume)}</b></span>
            </div>
          )}
        </div>

        <div className="workspace">
          <aside className="left-rail">
            <button className="rail-active"><Crosshair size={18} /></button>
            <button><MousePointer2 size={18} /></button>
            <button><Minus size={18} /></button>
            <button><ZoomIn size={18} /></button>
            <button><PanelRight size={18} /></button>
            <div className="rail-spacer" />
            <button><RotateCcw size={18} /></button>
            <button><Settings2 size={18} /></button>
          </aside>

          <div className="chart-shell">
            <div className="mode-switch">
              <button className={mode === 'candles' ? 'active' : ''} onClick={() => { setMode('candles'); setSelectedCandle(-1); }}>Candles</button>
              <button className={mode === 'footprint' ? 'active' : ''} onClick={() => setMode('footprint')}>Footprint <Sparkles size={13} /></button>
            </div>
            <div className="chart-legend">
              <span className="legend-title">Volume Footprint</span>
              <span className="legend-item"><i className="swatch bid" /> Bid</span>
              <span className="legend-item"><i className="swatch ask" /> Ask</span>
              <span className="legend-item"><i className="swatch poc" /> POC</span>
              {showImbalance && <span className="legend-item"><i className="swatch imbalance" /> Imbalance</span>}
            </div>

            {loading && (
              <div className="loading-overlay">
                <Loader2 size={28} className="spin" />
                <span>Loading market data…</span>
              </div>
            )}

            {!loading && data.length > 0 && (
              <FootprintCanvas
                data={data}
                mode={mode}
                dark={dark}
                showProfile={showProfile}
                showImbalance={showImbalance}
                selectedCandle={selectedCandle}
                onHover={setHover}
                onSelectCandle={setSelectedCandle}
              />
            )}

            {hover && (
              <div className="data-tooltip" style={{ left: Math.min(hover.x + 18, 480), top: Math.min(hover.y + 18, 400) }}>
                <div className="tooltip-heading">
                  <span>{new Date(hover.candle.time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="price-highlight">{fmtPrice(hover.level.price)}</span>
                </div>
                <div className="tooltip-grid">
                  <span>Bid <b className="down-text">{compact(hover.level.bid)}</b></span>
                  <span>Ask <b className="up-text">{compact(hover.level.ask)}</b></span>
                  <span>Total <b>{compact(hover.level.bid + hover.level.ask)}</b></span>
                  <span>Delta <b className={hover.level.ask >= hover.level.bid ? 'up-text' : 'down-text'}>{hover.level.ask >= hover.level.bid ? '+' : ''}{compact(hover.level.ask - hover.level.bid)}</b></span>
                </div>
                {getImbalance(hover.level) && (
                  <div className="imbalance-flag">
                    <Zap size={11} /> {getImbalance(hover.level) === 'bid' ? 'Bid imbalance' : 'Ask imbalance'} ({(Math.max(hover.level.bid, hover.level.ask) / Math.min(hover.level.bid, hover.level.ask)).toFixed(1)}x)
                  </div>
                )}
              </div>
            )}

            {/* Selected candle detail panel */}
            {selectedCandle >= 0 && selectedCandleData && (
              <div className="candle-detail-panel">
                <div className="detail-header">
                  <span>{new Date(selectedCandleData.time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  <button className="close-btn" onClick={() => setSelectedCandle(-1)}><X size={16} /></button>
                </div>
                <div className="detail-stats">
                  <div className="stat-row"><span>O</span><b>{fmtPrice(selectedCandleData.open)}</b></div>
                  <div className="stat-row"><span>H</span><b className="up-text">{fmtPrice(selectedCandleData.high)}</b></div>
                  <div className="stat-row"><span>L</span><b className="down-text">{fmtPrice(selectedCandleData.low)}</b></div>
                  <div className="stat-row"><span>C</span><b>{fmtPrice(selectedCandleData.close)}</b></div>
                  <div className="stat-divider" />
                  <div className="stat-row"><span>Delta</span><b className={selectedDelta >= 0 ? 'up-text' : 'down-text'}>{selectedDelta >= 0 ? '+' : ''}{compact(selectedDelta)}</b></div>
                  <div className="stat-row"><span>Total Vol</span><b>{compact(selectedTotal)}</b></div>
                  <div className="stat-row"><span>Imbalances</span><b>{selectedImbalances} levels</b></div>
                  <div className="stat-row"><span>Footprint</span><b className={selectedCandleData.realFootprint ? 'up-text' : 'muted'}>{selectedCandleData.realFootprint ? 'Real tick data' : 'Estimated'}</b></div>
                </div>
                <div className="detail-hint">Click candle again or press X to close</div>
              </div>
            )}
          </div>
        </div>

        <footer className="statusbar">
          <div className="status-left">
            <span className="status-live"><i /> {dataSource === 'binance' ? 'Binance API' : 'Simulated data'} · {symbol}</span>
            <span className="muted">Drag to pan</span>
            <span className="muted">Scroll to zoom</span>
            <span className="muted">Click candle to expand footprint</span>
            {lastUpdate && <span className="muted">Updated {lastUpdate.toLocaleTimeString()}</span>}
          </div>
          <div className="status-right">
            <span>{data.length} candles</span>
            {selectedCandle >= 0 && <span className="muted">Candle #{selectedCandle + 1} selected</span>}
            <button><Play size={13} /> Replay</button>
          </div>
        </footer>
      </section>
    </main>
  );
}
