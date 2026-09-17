export type ViewMode = 'candles' | 'footprint';

export type Level = { price: number; bid: number; ask: number };

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  levels: Level[];
  realFootprint: boolean;
};

export type HoverInfo = { x: number; y: number; candle: Candle; level: Level } | null;

export type AggTrade = { price: number; qty: number; isBuyerMaker: boolean; time: number };

export type CoinSearchResult = { id: string; name: string; symbol: string; thumb: string };

export type ProfileRow = { price: number; volume: number; bidVol: number; askVol: number };

export type FootprintProps = {
  /** Full trading pair, e.g. "BTCUSDT". Overrides `coin` if both are given. */
  symbol?: string;
  /** Short coin name, e.g. "btc" or "BTC" — converted to "BTCUSDT" automatically. */
  coin?: string;
  timeframe?: string;
  dark?: boolean;
  mode?: ViewMode;
  showProfile?: boolean;
  showImbalance?: boolean;
  candleLimit?: number;
  autoRefresh?: boolean;
  className?: string;
  onCandleSelect?: (candle: Candle | null) => void;
  onHover?: (info: HoverInfo) => void;
};

/** Convert a short coin name like "btc" to a Binance USDT pair like "BTCUSDT". */
export function toSymbol(coin: string): string {
  const clean = coin.trim().toUpperCase().replace(/USDT$/, '').replace(/[-/]/g, '');
  return `${clean}USDT`;
}

export type ImbalanceSide = 'bid' | 'ask' | null;

export const IMBALANCE_RATIO = 3.0;

export const TF_MAP: Record<string, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1D': '1d', '1W': '1w',
};

export const TF_MS: Record<string, number> = {
  '1m': 60_000, '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000, '1D': 86_400_000, '1W': 604_800_000,
};

export const COLORS = {
  up: '#16b89a',
  down: '#f04f5f',
  pocDark: '#3a4a5c',
  pocLight: '#cdd8e3',
  imbalanceBid: '#e34e5c',
  imbalanceAsk: '#21a88f',
  profile: '#3b82f6',
};

export const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1D', '1W'] as const;
