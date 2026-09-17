import { TF_MS, type Candle, type Level, type AggTrade } from '../types';

export function generateDemoCandles(symbol: string, interval: string, count = 150): Candle[] {
  const tfMs = TF_MS[interval] || 3_600_000;
  const now = Date.now();
  const basePrice: Record<string, number> = {
    BTCUSDT: 95000, ETHUSDT: 3200, SOLUSDT: 180, BNBUSDT: 600, XRPUSDT: 2.3, DOGEUSDT: 0.38,
  };
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
    const levels = generateDemoLevels(high, low, close, open, volume);
    price = close;
    return { time, open, high, low, close, volume, levels, realFootprint: false };
  });
}

function generateDemoLevels(high: number, low: number, close: number, open: number, volume: number): Level[] {
  const numLevels = 12;
  const step = (high - low) / (numLevels - 1);
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
  return levels;
}

export function generateFootprintLevels(candle: Candle): Level[] {
  const { high, low, close, volume, open } = candle;
  const numLevels = 12;
  const step = (high - low) / (numLevels - 1);
  const positive = close >= open;
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

export function buildFootprintFromTrades(candle: Candle, trades: AggTrade[], numLevels = 12): Level[] {
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
