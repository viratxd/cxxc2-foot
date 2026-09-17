import { useEffect, useState } from 'react';
import { BarChart3, Crosshair, Loader2, Maximize2, Minus, MousePointer2, PanelRight, Play, RotateCcw, Settings2, SlidersHorizontal, Sparkles, Wifi, WifiOff, X, Zap, ZoomIn } from 'lucide-react';
import { COLORS, TIMEFRAMES, toSymbol, type Candle, type FootprintProps, type HoverInfo, type ViewMode } from '../types';
import { compact, fmtPrice } from '../utils/format';
import { getImbalance } from '../utils/footprint';
import { useFootprintData } from '../hooks/useFootprintData';
import { FootprintCanvas } from './FootprintCanvas';
import { CoinSearch } from './CoinSearch';

export function Footprint({
  symbol,
  coin,
  timeframe = '1h',
  dark = true,
  mode: initialMode = 'footprint',
  showProfile: initialProfile = true,
  showImbalance: initialImbalance = true,
  candleLimit = 150,
  className,
  onCandleSelect,
  onHover: onHoverProp,
}: FootprintProps) {
  const [mode, setMode] = useState<ViewMode>(initialMode);
  const [darkState, setDark] = useState(dark);
  const [showProfile, setShowProfile] = useState(initialProfile);
  const [showImbalance, setShowImbalance] = useState(initialImbalance);
  const [hover, setHover] = useState<HoverInfo>(null);

  const resolvedSymbol = symbol ?? toSymbol(coin ?? 'BTC');
  const [symbolState, setSymbol] = useState(resolvedSymbol);
  const [timeframeState, setTimeframe] = useState(timeframe);

  useEffect(() => { setSymbol(symbol ?? toSymbol(coin ?? 'BTC')); }, [symbol, coin]);
  useEffect(() => { setTimeframe(timeframe); }, [timeframe]);

  const { data, loading, dataSource, lastUpdate, fetchingTicks, selectedCandle, setSelectedCandle } =
    useFootprintData(symbolState, timeframeState, candleLimit);

  const handleHover = (info: HoverInfo) => {
    setHover(info);
    onHoverProp?.(info);
  };

  const handleSelectCandle = (index: number) => {
    setSelectedCandle(index);
    onCandleSelect?.(index >= 0 && index < data.length ? data[index] : null);
  };

  const latest = data[data.length - 1];
  const change = latest ? ((latest.close - latest.open) / latest.open) * 100 : 0;
  const selectedCandleData = selectedCandle >= 0 && selectedCandle < data.length ? data[selectedCandle] : null;
  const selectedDelta = selectedCandleData ? selectedCandleData.levels.reduce((s, l) => s + l.ask - l.bid, 0) : 0;
  const selectedTotal = selectedCandleData ? selectedCandleData.levels.reduce((s, l) => s + l.bid + l.ask, 0) : 0;
  const selectedImbalances = selectedCandleData ? selectedCandleData.levels.filter((l) => getImbalance(l) !== null).length : 0;

  return (
    <main className={darkState ? 'app dark' : 'app'}>
      <section className="terminal">
        <header className="topbar">
          <div className="brand"><div className="brand-mark"><Crosshair size={17} /></div><span>MARKET<span className="brand-accent">FLOW</span></span></div>
          <CoinSearch symbol={symbolState} onSelect={setSymbol} />
          <div className="toolbar-divider" />
          <div className="timeframes">
            {TIMEFRAMES.map((item) => (
              <button className={timeframeState === item ? 'selected' : ''} onClick={() => setTimeframe(item)} key={item}>{item}</button>
            ))}
          </div>
          <div className="top-actions">
            <button className={showProfile ? 'active-toggle' : ''} onClick={() => setShowProfile(!showProfile)}><BarChart3 size={16} /> Profile</button>
            <button className={showImbalance ? 'active-toggle' : ''} onClick={() => setShowImbalance(!showImbalance)}><Zap size={16} /> Imbalance</button>
            <button><SlidersHorizontal size={16} /> Chart</button>
            <button className="icon-button" onClick={() => setDark(!darkState)}><Settings2 size={17} /></button>
            <button className="icon-button"><Maximize2 size={17} /></button>
          </div>
        </header>

        <div className="chart-header">
          <div className="instrument">
            <span className="live-dot" />
            <strong>{symbolState}</strong>
            <span className="muted">·</span>
            <span>{timeframeState}</span>
            {dataSource === 'binance'
              ? <span className="binance-pill"><Wifi size={10} /> BINANCE LIVE</span>
              : <span className="demo-pill"><WifiOff size={10} /> SIMULATED</span>}
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
                dark={darkState}
                showProfile={showProfile}
                showImbalance={showImbalance}
                selectedCandle={selectedCandle}
                onHover={handleHover}
                onSelectCandle={handleSelectCandle}
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
            <span className="status-live"><i /> {dataSource === 'binance' ? 'Binance API' : 'Simulated data'} · {symbolState}</span>
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
