import { TF_MAP, type Candle, type Level, type AggTrade, type CoinSearchResult } from '../types';

export async function searchCoinGecko(query: string): Promise<CoinSearchResult[]> {
  const response = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error(`CoinGecko search error: ${response.status}`);
  const payload: { coins?: CoinSearchResult[] } = await response.json();
  return (payload.coins ?? []).slice(0, 8);
}

export async function fetchBinanceCandles(symbol: string, interval: string, limit = 200): Promise<Candle[]> {
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

export async function fetchAggTrades(symbol: string, startTime: number, endTime: number): Promise<AggTrade[]> {
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
