import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { searchCoinGecko } from '../api/binance';
import type { CoinSearchResult } from '../types';

type Props = {
  symbol: string;
  onSelect: (symbol: string) => void;
};

export function CoinSearch({ symbol, onSelect }: Props) {
  const [query, setQuery] = useState(symbol.replace('USDT', ''));
  const [suggestions, setSuggestions] = useState<CoinSearchResult[]>([]);
  const [show, setShow] = useState(false);
  const lastSymbolRef = useRef(symbol);

  useEffect(() => {
    if (lastSymbolRef.current !== symbol) {
      lastSymbolRef.current = symbol;
      setQuery(symbol.replace('USDT', ''));
    }
  }, [symbol]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || q.toUpperCase() === symbol.replace('USDT', '')) { setSuggestions([]); return; }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      searchCoinGecko(q)
        .then((results) => { if (!controller.signal.aborted) setSuggestions(results); })
        .catch(() => { if (!controller.signal.aborted) setSuggestions([]); });
    }, 300);
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [query, symbol]);

  return (
    <div className="symbol-picker">
      <Search size={15} />
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setShow(true); }}
        onFocus={() => setShow(true)}
        onBlur={() => window.setTimeout(() => setShow(false), 150)}
        className="symbol-select symbol-search-input"
        aria-label="Search coins"
        placeholder="Search coins"
      />
      <ChevronDown size={14} className="muted" />
      {show && suggestions.length > 0 && (
        <div className="coin-suggestions">
          {suggestions.map((coin) => (
            <button
              key={coin.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelect(`${coin.symbol.toUpperCase()}USDT`);
                setQuery(coin.symbol.toUpperCase());
                setShow(false);
              }}
            >
              <img src={coin.thumb} alt="" />
              <span><strong>{coin.name}</strong><small>{coin.symbol.toUpperCase()} / USDT</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
