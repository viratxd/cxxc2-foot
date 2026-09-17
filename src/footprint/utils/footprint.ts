import { IMBALANCE_RATIO, type ImbalanceSide, type Level, type ProfileRow, type Candle } from '../types';

export function getImbalance(level: Level): ImbalanceSide {
  if (level.ask > 0 && level.bid / level.ask >= IMBALANCE_RATIO) return 'bid';
  if (level.bid > 0 && level.ask / level.bid >= IMBALANCE_RATIO) return 'ask';
  return null;
}

export function computeVolumeProfile(candles: Candle[], numBins = 50): ProfileRow[] {
  if (candles.length === 0) return [];
  const minP = Math.min(...candles.map((c) => c.low));
  const maxP = Math.max(...candles.map((c) => c.high));
  const step = (maxP - minP) / numBins || 1;
  const bins = Array.from({ length: numBins }, (_, i) => ({
    price: minP + step * (i + 0.5), volume: 0, bidVol: 0, askVol: 0,
  }));
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
