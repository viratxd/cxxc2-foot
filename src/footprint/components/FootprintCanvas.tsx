import { useCallback, useEffect, useRef } from 'react';
import { COLORS, type Candle, type HoverInfo, type ViewMode } from '../types';
import { compact, fmtPrice } from '../utils/format';
import { getImbalance, computeVolumeProfile } from '../utils/footprint';

type Props = {
  data: Candle[];
  mode: ViewMode;
  dark: boolean;
  showProfile: boolean;
  showImbalance: boolean;
  selectedCandle: number;
  onHover: (info: HoverInfo) => void;
  onSelectCandle: (index: number) => void;
};

export function FootprintCanvas({ data, mode, dark, showProfile, showImbalance, selectedCandle, onHover, onSelectCandle }: Props) {
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

    let firstVis = 0, lastVis = data.length - 1;
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

    ctx.fillStyle = dark ? '#0e1319' : '#f8fafc';
    ctx.fillRect(0, 0, width, height);

    const gridN = 10;
    for (let gi = 0; gi <= gridN; gi++) {
      const gy = (chartHeight / gridN) * gi;
      ctx.strokeStyle = dark ? 'rgba(132, 149, 173, .07)' : 'rgba(38, 58, 79, .05)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(chartWidth, gy); ctx.stroke();
    }

    const tEvery = Math.max(1, Math.round(130 / spacing));
    for (let index = firstVis; index <= lastVis; index++) {
      if (index % tEvery === 0) {
        const px = x(index);
        ctx.strokeStyle = dark ? 'rgba(132, 149, 173, .05)' : 'rgba(38, 58, 79, .03)';
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, chartHeight); ctx.stroke();
      }
    }

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

    for (let index = firstVis; index <= lastVis; index++) {
      const px = x(index);
      if (px < -spacing || px > chartWidth + spacing) continue;
      const candle = data[index];
      const positive = candle.close >= candle.open;
      const color = positive ? COLORS.up : COLORS.down;

      if (mode === 'candles' || (mode === 'footprint' && selectedCandle >= 0 && index !== selectedCandle)) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(px, y(candle.high)); ctx.lineTo(px, y(candle.low)); ctx.stroke();
        const bodyTop = y(Math.max(candle.open, candle.close));
        const bodyBot = y(Math.min(candle.open, candle.close));
        ctx.fillStyle = color;
        ctx.fillRect(px - candleW / 2, bodyTop, candleW, Math.max(2, bodyBot - bodyTop));
      }

      if (mode === 'footprint') {
        const showFull = selectedCandle < 0 || index === selectedCandle;
        if (!showFull) continue;
        const levels = candle.levels;
        if (levels.length === 0) continue;
        const maxVol = Math.max(...levels.map((l) => Math.max(l.bid, l.ask)));
        const pocIdx = levels.reduce((bi, l, li) => (l.bid + l.ask > levels[bi].bid + levels[bi].ask ? li : bi), 0);
        const colHalf = selectedCandle === index ? Math.min(80, spacing * 0.45) : Math.min(44, spacing * 0.38);
        const cellW = colHalf - 3;

        ctx.strokeStyle = positive ? 'rgba(22,184,154,0.35)' : 'rgba(240,79,95,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px, y(candle.high)); ctx.lineTo(px, y(candle.low)); ctx.stroke();

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

          if (isPoc) {
            ctx.fillStyle = dark ? COLORS.pocDark : COLORS.pocLight;
          } else if (isImbalanced && imbalance === 'bid') {
            ctx.fillStyle = dark ? 'rgba(227, 78, 92, 0.85)' : 'rgba(192, 57, 43, 0.85)';
          } else {
            ctx.fillStyle = `rgba(240, 79, 95, ${0.10 + (level.bid / maxVol) * 0.72})`;
          }
          ctx.fillRect(px - colHalf, rowY, cellW, rowH - 1.5);

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

        if (colHalf > 24) {
          ctx.font = '9px ui-monospace, SFMono-Regular, monospace';
          ctx.fillStyle = dark ? '#6a7a8c' : '#8a9bae';
          ctx.textAlign = 'left';
          ctx.fillText(fmtPrice(candle.high), px + colHalf + 4, y(candle.high) + 3);
          ctx.fillText(fmtPrice(candle.low), px + colHalf + 4, y(candle.low) + 3);
        }

        if (candle.realFootprint) {
          ctx.fillStyle = dark ? '#44c7d8' : '#0284c7';
          ctx.font = '8px ui-monospace, SFMono-Regular, monospace';
          ctx.textAlign = 'center';
          ctx.fillText('●', px, y(candle.high) - 4);
        }

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

      if (index % tEvery === 0) {
        ctx.fillStyle = dark ? '#6a7a8c' : '#8a9bae';
        ctx.font = '10px ui-monospace, SFMono-Regular, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(new Date(data[index].time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), px, chartHeight + 22);
      }
    }

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

      ctx.fillStyle = dark ? '#7a8a9c' : '#7a8a9c';
      ctx.font = '9px ui-monospace, SFMono-Regular, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('VOL PROFILE', profileX + profileW / 2, 14);
    }

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
    if (s.drag) { s.pan = s.startPan + event.clientX - s.startX; s.hasMoved = true; }
    const profileW = showProfile ? 120 : 0;
    const chartWidth = rect.width - 80 - profileW;
    const chartHeight = rect.height - 38;

    if (px < chartWidth && py < chartHeight && data.length > 0 && !s.drag) {
      const candleW = Math.max(6, 70 * s.zoom);
      const spacing = candleW + Math.max(3, candleW * 0.20);
      const rightEdge = chartWidth - 16;
      const xPos = (index: number) => rightEdge - (data.length - 1 - index) * spacing + s.pan;
      const colHalf = Math.min(44, spacing * 0.38);
      let bestIdx = -1, bestDist = Infinity;
      for (let i = 0; i < data.length; i++) { const dist = Math.abs(xPos(i) - px); if (dist < bestDist) { bestDist = dist; bestIdx = i; } }
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
          candle.levels.forEach((lvl, li) => { const d = Math.abs(lvl.price - hoverPrice); if (d < bestLvlDist) { bestLvlDist = d; bestLvl = li; } });
          s.hoverCandle = bestIdx; s.hoverLevel = bestLvl;
          onHover({ x: px, y: py, candle, level: candle.levels[bestLvl] });
        }
      } else { s.hoverCandle = -1; s.hoverLevel = -1; onHover(null); }
    } else if (!s.drag) { s.hoverCandle = -1; s.hoverLevel = -1; onHover(null); }
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
          if (!s.hasMoved && s.hoverCandle >= 0) onSelectCandle(s.hoverCandle === selectedCandle ? -1 : s.hoverCandle);
          s.drag = false;
        }}
        onPointerLeave={() => {
          stateRef.current.crossX = -1; stateRef.current.crossY = -1;
          stateRef.current.hoverCandle = -1; stateRef.current.hoverLevel = -1;
          onHover(null); draw();
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
