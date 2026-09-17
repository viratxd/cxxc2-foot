import { useCallback, useEffect, useRef, useState } from 'react';
import { TF_MS, type Candle } from '../types';
import { fetchBinanceCandles, fetchAggTrades } from '../api/binance';
import { generateDemoCandles, generateFootprintLevels, buildFootprintFromTrades } from '../api/demo';

type DataSource = 'binance' | 'demo';

export function useFootprintData(symbol: string, timeframe: string, candleLimit = 150) {
  const [data, setData] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<DataSource>('binance');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [fetchingTicks, setFetchingTicks] = useState(false);
  const [selectedCandle, setSelectedCandle] = useState(-1);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    setLoading(true);
    setSelectedCandle(-1);

    fetchBinanceCandles(symbol, timeframe, candleLimit)
      .then((candles) => {
        if (cancelledRef.current) return;
        setData(candles.map((c) => ({ ...c, levels: generateFootprintLevels(c) })));
        setDataSource('binance');
        setLastUpdate(new Date());
        setLoading(false);
      })
      .catch(() => {
        if (cancelledRef.current) return;
        setData(generateDemoCandles(symbol, timeframe, candleLimit));
        setDataSource('demo');
        setLastUpdate(new Date());
        setLoading(false);
      });

    return () => { cancelledRef.current = true; };
  }, [symbol, timeframe, candleLimit]);

  const fetchRealFootprint = useCallback(async (candleIndex: number) => {
    if (dataSource !== 'binance' || candleIndex < 0) return;
    let candle: Candle | undefined;
    setData((prev) => { candle = prev[candleIndex]; return prev; });
    if (!candle || candle.realFootprint) return;
    setFetchingTicks(true);
    try {
      const tfMs = TF_MS[timeframe] || 3_600_000;
      const trades = await fetchAggTrades(symbol, candle.time, candle.time + tfMs);
      const realLevels = buildFootprintFromTrades(candle, trades);
      setData((prev) => {
        const updated = [...prev];
        if (updated[candleIndex]) {
          updated[candleIndex] = { ...updated[candleIndex], levels: realLevels, realFootprint: true };
        }
        return updated;
      });
    } catch {
      // keep estimated footprint
    }
    setFetchingTicks(false);
  }, [dataSource, symbol, timeframe]);

  useEffect(() => {
    if (selectedCandle >= 0) fetchRealFootprint(selectedCandle);
  }, [selectedCandle, fetchRealFootprint]);

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

  return {
    data, loading, dataSource, lastUpdate, fetchingTicks,
    selectedCandle, setSelectedCandle,
  };
}
