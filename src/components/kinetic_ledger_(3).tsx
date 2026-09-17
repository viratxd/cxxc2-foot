import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Settings, Fullscreen, Bell, Clock, Zap, Loader2, Search, X, Star,
  Crosshair, TrendingUp, AlignJustify, Waypoints, SlidersHorizontal,
  Brush, Type, Smile, Ruler, ZoomIn, Magnet, PenTool, Lock, Eye, EyeOff,
  ChevronRight, ChevronLeft, Volume2, Trash2, BarChart2, AlignLeft,
  CornerDownRight, Pen, Activity, Check, Camera, Copy, Download,
  Moon, Sun, Plus, GitBranch, List, Sliders, Network, GitPullRequest,
  Minus, ArrowRight, ArrowUpRight, Info, Maximize2, Sparkles, BrainCircuit
} from 'lucide-react';

/**
 * Kinetic Ledger - Custom High-Performance Canvas Engine
 * Features: Native HTML5 Canvas drawing, Drag-to-pan, Wheel-to-zoom, 
 * Dynamic Auto-Scaling Y-Axis, Interactive Crosshair, Real-Time Polling, Alerts, Theme Support, RSI, UT Bot, and Fib Structure.
 * New: Auto-fetching historical data on pan left.
 */

const CustomCanvasChart = ({ data, currentPrice, alerts, isDarkMode, activeIndicators, srZones, fibStructData, onLoadHistory }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  
  // Interaction State (Using refs to prevent React re-renders on every frame)
  const stateRef = useRef({
    panX: 0,
    zoom: 1,
    isDragging: false,
    startX: 0,
    startPanX: 0,
    crosshair: { x: null, y: null, active: false },
    isFetchingHistory: false
  });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !containerRef.current || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    const rect = containerRef.current.getBoundingClientRect();
    
    // Theme Colors
    const themeColors = isDarkMode ? {
      bg: '#121316', grid: 'rgba(59, 74, 61, 0.15)', axisBg: '#1b1b1f',
      axisBorder: 'rgba(59, 74, 61, 0.3)', text: '#bacbb9', labelBg: '#292a2d',
      labelText: '#e3e2e6', rsiBg: 'rgba(153, 102, 255, 0.1)'
    } : {
      bg: '#ffffff', grid: 'rgba(42, 46, 57, 0.06)', axisBg: '#f8f9fa',
      axisBorder: 'rgba(42, 46, 57, 0.1)', text: '#787b86', labelBg: '#f0f3fa',
      labelText: '#131722', rsiBg: 'rgba(153, 102, 255, 0.05)'
    };
    
    // Setup high-DPI canvas
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const width = rect.width;
    const height = rect.height;
    const priceAxisWidth = 60;
    const timeAxisHeight = 30;
    const chartWidth = width - priceAxisWidth;
    const totalChartHeight = height - timeAxisHeight;

    // Determine Layout (Check if RSI is installed and visible)
    const activeRSI = activeIndicators.find(ind => ind.id === 'RSI' && ind.visible);
    const hasRSI = !!activeRSI;
    const rsiColor = activeRSI?.config?.color || '#9966FF';
    
    // Partition Canvas Area
    const rsiPaneHeight = hasRSI ? Math.min(100, totalChartHeight * 0.25) : 0;
    const mainChartHeight = totalChartHeight - rsiPaneHeight;

    const s = stateRef.current;
    const baseCandleWidth = 6;
    const baseSpacing = 10;
    const candleWidth = Math.max(1, baseCandleWidth * s.zoom);
    const spacing = Math.max(2, baseSpacing * s.zoom);

    // Calculate visible range
    const rightOffset = 50; 
    
    // Auto Fetch Historical Data when panning near the left edge
    const oldestCandleX = chartWidth - rightOffset - ((data.length - 1) * spacing) + s.panX;
    if (oldestCandleX > -width * 1.5 && !s.isFetchingHistory && onLoadHistory) {
      s.isFetchingHistory = true;
      onLoadHistory(data[0].t - 1).finally(() => {
        s.isFetchingHistory = false;
      });
    }

    let minVisiblePrice = Infinity;
    let maxVisiblePrice = -Infinity;
    const visibleCandles = [];

    for (let i = 0; i < data.length; i++) {
      const reversedIndex = data.length - 1 - i;
      const x = chartWidth - rightOffset - (reversedIndex * spacing) + s.panX;
      
      if (x > -spacing && x < chartWidth + spacing) {
        visibleCandles.push({ ...data[i], x });
        if (data[i].l < minVisiblePrice) minVisiblePrice = data[i].l;
        if (data[i].h > maxVisiblePrice) maxVisiblePrice = data[i].h;
      }
    }

    if (visibleCandles.length === 0) return;

    // Add padding to Y axis (10% top/bottom)
    const priceRange = maxVisiblePrice - minVisiblePrice;
    const padding = priceRange * 0.1 || maxVisiblePrice * 0.001;
    const minP = minVisiblePrice - padding;
    const maxP = maxVisiblePrice + padding;
    const activeRange = maxP - minP;

    // Mappers
    const mapY = (price) => mainChartHeight - ((price - minP) / activeRange) * mainChartHeight;
    const mapRsiY = (val) => mainChartHeight + ((100 - val) / 100) * rsiPaneHeight;
    const getX = (idx) => chartWidth - rightOffset - ((data.length - 1 - idx) * spacing) + s.panX;

    // 1. Background Grid (Main Chart)
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = themeColors.grid;
    ctx.lineWidth = 1;

    // Horizontal Grid Lines
    const ySteps = 8;
    for (let i = 0; i <= ySteps; i++) {
      const y = (mainChartHeight / ySteps) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();
    }

    // Vertical Grid Lines & Record Time Labels
    const minLabelSpacing = 80;
    let lastLabelX = -minLabelSpacing;
    const timeLabels = [];

    visibleCandles.forEach(c => {
      if (c.x - lastLabelX >= minLabelSpacing) {
        ctx.beginPath();
        ctx.moveTo(c.x, 0);
        ctx.lineTo(c.x, totalChartHeight);
        ctx.stroke();

        const date = new Date(c.t);
        const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        timeLabels.push({ x: c.x, text: timeStr });
        lastLabelX = c.x;
      }
    });

    // 1.5 Draw LuxAlgo Support & Resistance Zones
    if (srZones && srZones.length > 0) {
      srZones.forEach(zone => {
        const dataIndex = zone.startBar;
        if (dataIndex === null || dataIndex === undefined) return;
        
        const startX = getX(dataIndex);
        const endX = chartWidth;

        if (startX > width) return;

        const topY = mapY(zone.top);
        const btmY = mapY(zone.btm);
        const heightY = btmY - topY;

        const hexToRgba = (hex, op) => {
           let r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
           return `rgba(${r},${g},${b},${op})`;
        };

        // Zone Background
        ctx.fillStyle = hexToRgba(zone.color, 0.15);
        ctx.fillRect(startX, topY, endX - startX, heightY);
        
        // Base Line
        ctx.strokeStyle = zone.color;
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(startX, mapY(zone.base));
        ctx.lineTo(endX, mapY(zone.base));
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }

    // 1.8 Draw UT Bot - Dual ATR Overlay
    const activeUT = activeIndicators.find(ind => ind.id === 'UT_BOT' && ind.visible);
    if (activeUT) {
      const { buyColor, sellColor } = activeUT.config;
      
      // Draw Buy Trailing Stop Line
      ctx.beginPath();
      let firstBuy = true;
      visibleCandles.forEach(c => {
        if (c.utStopBuy !== undefined && c.utStopBuy !== 0) {
          if (firstBuy) { ctx.moveTo(c.x, mapY(c.utStopBuy)); firstBuy = false; }
          else { ctx.lineTo(c.x, mapY(c.utStopBuy)); }
        }
      });
      ctx.strokeStyle = buyColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Draw Sell Trailing Stop Line
      ctx.beginPath();
      let firstSell = true;
      visibleCandles.forEach(c => {
        if (c.utStopSell !== undefined && c.utStopSell !== 0) {
          if (firstSell) { ctx.moveTo(c.x, mapY(c.utStopSell)); firstSell = false; }
          else { ctx.lineTo(c.x, mapY(c.utStopSell)); }
        }
      });
      ctx.strokeStyle = sellColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Draw Signals
      visibleCandles.forEach(c => {
        if (c.utBuy) {
          const y = mapY(c.l) + 18;
          ctx.fillStyle = buyColor;
          ctx.beginPath();
          ctx.roundRect(c.x - 14, y - 7, 28, 14, 3);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px Inter';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('Buy', c.x, y + 1);
        }
        if (c.utSell) {
          const y = mapY(c.h) - 18;
          ctx.fillStyle = sellColor;
          ctx.beginPath();
          ctx.roundRect(c.x - 14, y - 7, 28, 14, 3);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px Inter';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('Sell', c.x, y + 1);
        }
      });
    }

    // 1.9 Draw Fibonacci Structure Engine Overlay
    if (fibStructData) {
      // Draw Lines (BOS/CHoCH/EQH)
      fibStructData.lines.forEach(line => {
          const x1 = getX(line.startIdx);
          const x2 = getX(line.endIdx);
          const y = mapY(line.val);
          if (x2 < 0 || x1 > width) return;

          ctx.beginPath();
          ctx.moveTo(x1, y);
          ctx.lineTo(x2, y);
          
          if (line.type.includes('bull')) { ctx.strokeStyle = '#32CD32'; ctx.setLineDash([]); }
          else if (line.type.includes('bear')) { ctx.strokeStyle = '#f23645'; ctx.setLineDash([]); }
          else if (line.type.includes('eq')) { ctx.strokeStyle = '#B388FF'; ctx.setLineDash([4, 4]); }
          
          ctx.lineWidth = line.type.includes('choch') ? 2 : 1;
          ctx.stroke();
          ctx.setLineDash([]);
      });

      // Draw Live Fibs
      if (fibStructData.liveFibs) {
          const fibs = fibStructData.liveFibs;
          const x1 = getX(fibs.sl.idx);
          const x2 = getX(fibs.sh.idx);
          const endX = chartWidth;
          
          // Base Ref Line
          ctx.beginPath();
          ctx.moveTo(x1, mapY(fibs.sl.val));
          ctx.lineTo(x2, mapY(fibs.sh.val));
          ctx.strokeStyle = '#42A5F5';
          ctx.setLineDash([2, 4]);
          ctx.stroke();
          ctx.setLineDash([]);

          // Zones
          const y500 = mapY(fibs.levels['0.500']);
          const y786 = mapY(fibs.levels['0.786']);
          
          ctx.fillStyle = 'rgba(255, 214, 0, 0.15)';
          ctx.fillRect(0, Math.min(y500, y786), endX, Math.abs(y500 - y786));

          // Draw levels
          Object.entries(fibs.levels).forEach(([name, val]) => {
              const y = mapY(val);
              ctx.beginPath();
              ctx.moveTo(Math.max(x1, x2), y); // Start from the latest swing anchor
              ctx.lineTo(endX, y);
              ctx.strokeStyle = name.includes('-') ? (fibs.dir === 1 ? '#32CD32' : '#f23645') : '#42A5F5';
              ctx.lineWidth = name === '0.618' ? 2 : 1;
              ctx.stroke();

              ctx.fillStyle = ctx.strokeStyle;
              ctx.font = 'bold 9px Inter';
              ctx.textAlign = 'right';
              ctx.fillText(name, endX - 5, y - 4);
          });
      }

      // Draw Labels (HH/LL/Swings/BOS)
      fibStructData.labels.forEach(lbl => {
          const x = getX(lbl.idx);
          if (x < 0 || x > width) return;

          ctx.font = 'bold 9px Inter';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          let y = mapY(lbl.val);
          if (lbl.type === 'swingH' || lbl.type === 'eqhLbl' || lbl.type === 'sweepH') {
              y -= 12; ctx.fillStyle = '#f23645'; 
          } else if (lbl.type === 'swingL' || lbl.type === 'eqlLbl' || lbl.type === 'sweepL') {
              y += 12; ctx.fillStyle = '#32CD32';
          } else if (lbl.type === 'struct_bull') {
              y += 8; ctx.fillStyle = '#32CD32';
          } else if (lbl.type === 'struct_bear') {
              y -= 8; ctx.fillStyle = '#f23645';
          }
          
          ctx.fillText(lbl.text, x, y);
      });
    }

    // 2. Draw Alert Lines (Behind candles)
    alerts.forEach(alert => {
      if (!alert.triggered) {
        const alertY = mapY(alert.targetPrice);
        if (alertY > 0 && alertY < mainChartHeight) {
          ctx.strokeStyle = '#eab308'; // Yellow for alerts
          ctx.setLineDash([6, 4]);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, alertY);
          ctx.lineTo(chartWidth, alertY);
          ctx.stroke();
          ctx.setLineDash([]);
          
          // Alert Label
          ctx.fillStyle = '#eab308';
          ctx.font = 'bold 9px Inter';
          ctx.textAlign = 'left';
          ctx.fillText('ALERT', 10, alertY - 6);
        }
      }
    });

    // 3. Draw Candles
    visibleCandles.forEach(c => {
      const isGreen = c.c >= c.o;
      const color = isGreen ? '#32CD32' : '#ffb3ae';
      const bodyColor = isGreen ? '#003918' : '#a00118';
      
      const top = mapY(Math.max(c.o, c.c));
      const bottom = mapY(Math.min(c.o, c.c));
      const highY = mapY(c.h);
      const lowY = mapY(c.l);
      
      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(c.x, highY);
      ctx.lineTo(c.x, lowY);
      ctx.stroke();

      // Body
      const bodyHeight = Math.max(1, bottom - top);
      ctx.fillStyle = bodyColor;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      
      ctx.fillRect(c.x - candleWidth / 2, top, candleWidth, bodyHeight);
      if (isGreen) ctx.strokeRect(c.x - candleWidth / 2, top, candleWidth, bodyHeight);
    });

    // 4. Current Price Line
    if (currentPrice) {
      const currentY = mapY(currentPrice);
      const isPositive = data.length > 1 && currentPrice >= data[0].o;
      const lineColor = isPositive ? '#32CD32' : '#ffb3ae';
      
      ctx.strokeStyle = lineColor;
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, currentY);
      ctx.lineTo(chartWidth, currentY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // --- SUB-PANE: DRAW RSI ---
    if (hasRSI) {
      // Background separator
      ctx.beginPath();
      ctx.moveTo(0, mainChartHeight);
      ctx.lineTo(width, mainChartHeight);
      ctx.strokeStyle = themeColors.axisBorder;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineWidth = 1;

      // Draw 30/70 Band Background
      ctx.fillStyle = themeColors.rsiBg;
      ctx.fillRect(0, mapRsiY(70), chartWidth, mapRsiY(30) - mapRsiY(70));

      // Draw 70 & 30 Lines
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = themeColors.text;
      ctx.beginPath(); ctx.moveTo(0, mapRsiY(70)); ctx.lineTo(chartWidth, mapRsiY(70)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, mapRsiY(30)); ctx.lineTo(chartWidth, mapRsiY(30)); ctx.stroke();
      ctx.setLineDash([]);

      // Draw RSI Plot Line
      ctx.beginPath();
      let firstRSI = true;
      visibleCandles.forEach(c => {
        if (c.rsi !== null && c.rsi !== undefined && !isNaN(c.rsi)) {
          if (firstRSI) {
            ctx.moveTo(c.x, mapRsiY(c.rsi));
            firstRSI = false;
          } else {
            ctx.lineTo(c.x, mapRsiY(c.rsi));
          }
        }
      });
      ctx.strokeStyle = rsiColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // 5. Axes Backgrounds
    // Price Axis (Right)
    ctx.fillStyle = themeColors.axisBg;
    ctx.fillRect(chartWidth, 0, priceAxisWidth, height);
    ctx.strokeStyle = themeColors.axisBorder;
    ctx.beginPath();
    ctx.moveTo(chartWidth, 0);
    ctx.lineTo(chartWidth, height);
    ctx.stroke();

    // Time Axis (Bottom)
    ctx.fillStyle = themeColors.axisBg;
    ctx.fillRect(0, totalChartHeight, chartWidth, timeAxisHeight);
    ctx.beginPath();
    ctx.moveTo(0, totalChartHeight);
    ctx.lineTo(chartWidth, totalChartHeight);
    ctx.stroke();

    // 6. Axes Labels
    ctx.fillStyle = themeColors.text;
    ctx.font = '10px Inter, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    
    // Y-Axis Price Ticks
    for (let i = 0; i <= ySteps; i++) {
      const y = (mainChartHeight / ySteps) * i;
      const priceVal = maxP - (activeRange * (i / ySteps));
      ctx.fillText(priceVal.toFixed(2), chartWidth + 6, y);
    }
    
    // Y-Axis RSI Ticks
    if (hasRSI) {
      ctx.fillStyle = themeColors.text;
      ctx.fillText('70', chartWidth + 6, mapRsiY(70));
      ctx.fillText('30', chartWidth + 6, mapRsiY(30));
    }

    // Time Labels
    ctx.textAlign = 'center';
    timeLabels.forEach(label => {
      ctx.fillText(label.text, label.x, totalChartHeight + (timeAxisHeight / 2));
    });

    // 6.5 Draw Axis Badges (Must be drawn over the axis backgrounds)
    if (currentPrice) {
      const currentY = mapY(currentPrice);
      const isPositive = data.length > 1 && currentPrice >= data[0].o;
      ctx.fillStyle = isPositive ? '#32CD32' : '#ffb3ae';
      ctx.fillRect(chartWidth, currentY - 10, priceAxisWidth, 20);
      ctx.fillStyle = isPositive ? '#003918' : '#68000c';
      ctx.font = 'bold 10px Inter, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(currentPrice.toFixed(2), chartWidth + priceAxisWidth / 2, currentY);
    }

    if (hasRSI) {
      const latestRsi = data[data.length - 1]?.rsi;
      if (latestRsi !== undefined && latestRsi !== null && !isNaN(latestRsi)) {
         const rsiBadgeY = mapRsiY(latestRsi);
         ctx.fillStyle = rsiColor;
         ctx.fillRect(chartWidth, rsiBadgeY - 10, priceAxisWidth, 20);
         ctx.fillStyle = '#ffffff';
         ctx.font = 'bold 10px Inter, monospace';
         ctx.textAlign = 'center';
         ctx.textBaseline = 'middle';
         ctx.fillText(latestRsi.toFixed(2), chartWidth + priceAxisWidth / 2, rsiBadgeY);
      }
    }

    // 7. Crosshair
    if (s.crosshair.active && s.crosshair.x < chartWidth && s.crosshair.y < totalChartHeight) {
      let closestCandle = null;
      let minDiff = Infinity;
      for (let i = 0; i < visibleCandles.length; i++) {
        const diff = Math.abs(visibleCandles[i].x - s.crosshair.x);
        if (diff < minDiff) {
          minDiff = diff;
          closestCandle = visibleCandles[i];
        }
      }

      const crossX = closestCandle ? closestCandle.x : s.crosshair.x;
      const crossY = s.crosshair.y;

      ctx.strokeStyle = themeColors.text;
      ctx.setLineDash([2, 2]);
      ctx.lineWidth = 0.5;

      ctx.beginPath();
      ctx.moveTo(crossX, 0);
      ctx.lineTo(crossX, totalChartHeight);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, crossY);
      ctx.lineTo(chartWidth, crossY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Crosshair Label (Price vs RSI)
      ctx.fillStyle = themeColors.labelBg;
      ctx.fillRect(chartWidth, crossY - 10, priceAxisWidth, 20);
      ctx.fillStyle = themeColors.labelText;
      ctx.textAlign = 'left';
      
      let crossValue;
      if (crossY <= mainChartHeight) {
        crossValue = maxP - (activeRange * (crossY / mainChartHeight));
      } else if (hasRSI) {
        crossValue = 100 - (((crossY - mainChartHeight) / rsiPaneHeight) * 100);
      }
      if(crossValue !== undefined) ctx.fillText(crossValue.toFixed(2), chartWidth + 6, crossY);

      if (closestCandle) {
        const date = new Date(closestCandle.t);
        const timeStr = `${date.getDate()} ${date.toLocaleString('en-US', { month: 'short' })} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        
        ctx.font = '10px Inter, monospace';
        const labelWidth = ctx.measureText(timeStr).width + 16;
        
        ctx.fillStyle = themeColors.labelBg;
        ctx.fillRect(crossX - labelWidth / 2, totalChartHeight, labelWidth, timeAxisHeight);
        ctx.fillStyle = themeColors.labelText;
        ctx.textAlign = 'center';
        ctx.fillText(timeStr, crossX, totalChartHeight + (timeAxisHeight / 2));
      }
    }
  }, [data, currentPrice, alerts, isDarkMode, activeIndicators, srZones, fibStructData, onLoadHistory]);

  // Handle Resize
  useEffect(() => {
    const observer = new ResizeObserver(() => requestAnimationFrame(draw));
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [draw]);

  // Initial Draw
  useEffect(() => {
    requestAnimationFrame(draw);
  }, [draw]);

  // Events
  const handleWheel = (e) => {
    e.preventDefault();
    const zoomSensitivity = 0.001;
    let newZoom = stateRef.current.zoom - (e.deltaY * zoomSensitivity);
    newZoom = Math.max(0.1, Math.min(newZoom, 10));
    stateRef.current.zoom = newZoom;
    requestAnimationFrame(draw);
  };

  const handlePointerDown = (e) => {
    stateRef.current.isDragging = true;
    stateRef.current.startX = e.clientX;
    stateRef.current.startPanX = stateRef.current.panX;
    canvasRef.current.style.cursor = 'grabbing';
  };

  const handlePointerMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    stateRef.current.crosshair = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      active: true
    };

    if (stateRef.current.isDragging) {
      const deltaX = e.clientX - stateRef.current.startX;
      stateRef.current.panX = stateRef.current.startPanX + deltaX;
    }
    requestAnimationFrame(draw);
  };

  const handlePointerUp = () => {
    stateRef.current.isDragging = false;
    canvasRef.current.style.cursor = 'crosshair';
  };

  const handlePointerLeave = () => {
    stateRef.current.isDragging = false;
    stateRef.current.crosshair.active = false;
    canvasRef.current.style.cursor = 'crosshair';
    requestAnimationFrame(draw);
  };

  return (
    <div ref={containerRef} className="absolute inset-0 w-full h-full overflow-hidden outline-none" style={{ cursor: 'crosshair' }}>
      <canvas
        id="main-chart-canvas"
        ref={canvasRef}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        className="block touch-none"
      />
    </div>
  );
};

// --- HELPER: TOOLBAR ICON ---
const ToolbarIcon = ({ icon: Icon, active = false, hasArrow = false, onClick }) => {
  return (
    <div 
      onClick={onClick}
      className={`relative flex items-center justify-center w-10 h-10 rounded hover:bg-[#f0f3fa] dark:hover:bg-[#292a2d] cursor-pointer group transition-colors ${
        active ? 'text-[#3b82f6]' : 'text-[#787b86] dark:text-[#bacbb9] opacity-80 hover:opacity-100 hover:text-[#131722] dark:hover:text-[#e3e2e6]'
      }`}
    >
      <Icon size={20} strokeWidth={active ? 1.5 : 1.25} />
      {hasArrow && (
        <ChevronRight size={12} strokeWidth={2.5} className="absolute right-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </div>
  );
};

// --- HELPER: TOOLBAR MENU ITEM ---
const ToolbarMenuItem = ({ icon: Icon, label, shortcut, iconClassName = "" }) => (
  <button className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-[#131722] dark:text-[#d1d4dc] hover:bg-[#f0f3fa] dark:hover:bg-[#2a2e39] transition-colors outline-none text-left">
    <div className="flex items-center space-x-3">
      <Icon size={16} className={`text-[#787b86] dark:text-[#bacbb9] ${iconClassName}`} />
      <span>{label}</span>
    </div>
    {shortcut && <span className="text-xs text-[#787b86] dark:text-[#787b86]">{shortcut}</span>}
  </button>
);


// --- ALARM SYNTHESIZER ---
const triggerAlarm = () => {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const playBeep = (time) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square'; 
      osc.frequency.setValueAtTime(880, time); 
      gain.gain.setValueAtTime(0.05, time); 
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(time);
      osc.stop(time + 0.2); 
    };
    
    for(let i=0; i<10; i++) {
      playBeep(audioCtx.currentTime + i * 0.5);
    }
    
    setTimeout(() => {
      if(audioCtx.state !== 'closed') audioCtx.close();
    }, 6000);
  } catch (e) {
    console.warn("AudioContext not supported or blocked by browser.");
  }
};

// --- INDICATOR SPECIFIC AUDIO SYNTHESIZERS ---
const playIndicatorSound = (soundProfile) => {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const playTone = (freq, time, duration, type = 'sine', volume = 0.1) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(volume, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(time);
      osc.stop(time + duration);
    };

    const now = audioCtx.currentTime;

    switch (soundProfile) {
      case 'Buy Chime':
        playTone(523.25, now, 0.2, 'sine'); // C5
        playTone(659.25, now + 0.15, 0.2, 'sine'); // E5
        playTone(783.99, now + 0.3, 0.4, 'sine'); // G5
        break;
      case 'Buy Bell':
        playTone(880, now, 0.5, 'triangle');
        playTone(1760, now + 0.1, 0.5, 'triangle');
        break;
      case 'Sell Buzzer':
        playTone(150, now, 0.3, 'sawtooth', 0.15);
        playTone(100, now + 0.3, 0.4, 'sawtooth', 0.15);
        break;
      case 'Sell Drop':
        playTone(600, now, 0.2, 'square');
        playTone(400, now + 0.2, 0.2, 'square');
        playTone(200, now + 0.4, 0.4, 'square');
        break;
      default:
        playTone(440, now, 0.2);
    }

    setTimeout(() => {
      if(audioCtx.state !== 'closed') audioCtx.close();
    }, 2000);
  } catch (e) {
    console.warn("AudioContext not supported or blocked by browser.");
  }
};

// --- MAIN APP COMPONENT ---
const App = () => {
  // Theme State
  const [isDarkMode, setIsDarkMode] = useState(true);

  const [activeInterval, setActiveInterval] = useState('1m'); 
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
  const [rawCandleData, setRawCandleData] = useState([]);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [priceChange, setPriceChange] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentSymbol, setCurrentSymbol] = useState('BTCUSDT');
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  
  // Toolbar State
  const [isToolbarOpen, setIsToolbarOpen] = useState(true);
  const [activeToolbarMenu, setActiveToolbarMenu] = useState({ id: null, top: 0 });

  // Indicator Bottom Sheet & State
  const [isIndicatorSheetOpen, setIsIndicatorSheetOpen] = useState(false);
  const [indicatorSearchQuery, setIndicatorSearchQuery] = useState('');
  const [activeIndicatorTab, setActiveIndicatorTab] = useState('Technicals');
  const [activeIndicators, setActiveIndicators] = useState([]);
  const [indicatorSettingsModal, setIndicatorSettingsModal] = useState(null);
  const [indSettingsTab, setIndSettingsTab] = useState('Inputs');

  // Market Bottom Sheet State
  const [isMarketSheetOpen, setIsMarketSheetOpen] = useState(false);
  const [marketSearchQuery, setMarketSearchQuery] = useState('');

  // Alerts Bottom Sheet State
  const [isAlertSheetOpen, setIsAlertSheetOpen] = useState(false);
  const [activeAlertTab, setActiveAlertTab] = useState('Set Alerts');
  const [alertTargetPrice, setAlertTargetPrice] = useState('');
  const [alertSound, setAlertSound] = useState('Beep (5 Sec)');
  const [alerts, setAlerts] = useState([]);
  const alertsRef = useRef([]);

  // Settings Dialog State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('Symbol');
  
  // Settings Form
  const [settingsForm, setSettingsForm] = useState({
    colorBarsBasedOnPrevClose: false,
    body: true,
    borders: false,
    wick: true,
    precision: 'Default',
    timezone: '(UTC+5:30) K...',
    headerVisibility: {
      title: true,
      symbol: true,
      indicator: true,
      alerts: true,
      ohlc: true,
      execute: true,
      market: true,
      tools: true
    }
  });

  // Screenshot Menu State
  const [isScreenshotMenuOpen, setIsScreenshotMenuOpen] = useState(false);
  const [fallbackImage, setFallbackImage] = useState(null);

  // AI Insights State
  const [isAiSheetOpen, setIsAiSheetOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiError, setAiError] = useState(null);

  const callGeminiAPI = async (userPrompt, systemInstruction) => {
    const apiKey = ""; // Set by environment
    if(!apiKey) return "AI Insights are offline (API Key Missing).";
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{ parts: [{ text: userPrompt }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] }
    };

    const retries = [1000, 2000, 4000, 8000, 16000];
    for (let i = 0; i <= retries.length; i++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const result = await response.json();
        return result.candidates?.[0]?.content?.parts?.[0]?.text || "No insights generated.";
      } catch (error) {
        if (i === retries.length) throw new Error("Failed to generate insights after multiple attempts.");
        await new Promise(resolve => setTimeout(resolve, retries[i]));
      }
    }
  };

  const handleGenerateInsights = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const recentCandles = chartData.slice(-10).map(c => `O: ${c.o.toFixed(2)} | H: ${c.h.toFixed(2)} | L: ${c.l.toFixed(2)} | C: ${c.c.toFixed(2)}`).join('\n');
      const activeRsi = activeIndicators.find(ind => ind.id === 'RSI' && ind.visible);
      const currentRsi = activeRsi && chartData.length > 0 ? chartData[chartData.length - 1].rsi : 'Not Active';
      
      const systemInstruction = "You are Kinetic AI, an elite institutional technical analysis assistant. Analyze the market data provided and output 3-4 highly concise bullet points focusing on price action, momentum, and immediate trend bias. Format with clean text and bullet points. Do not include disclaimers about financial advice.";
      
      const userPrompt = `Symbol: ${currentSymbol.replace('USDT', '/USDT')}\nTimeframe: ${activeInterval}\nCurrent Price: ${currentPrice}\nCurrent RSI (14): ${currentRsi !== null && !isNaN(currentRsi) ? Number(currentRsi).toFixed(2) : 'N/A'}\n\nLast 10 Candles:\n${recentCandles}\n\nProvide a crisp technical analysis summary.`;

      const response = await callGeminiAPI(userPrompt, systemInstruction);
      setAiAnalysis(response);
    } catch (err) {
      setAiError("Kinetic AI is currently unavailable. Please check your API configuration or try again later.");
      console.error(err);
    } finally {
      setAiLoading(false);
    }
  };

  const rsiPeriod = useMemo(() => {
    return activeIndicators.find(ind => ind.id === 'RSI')?.config?.length || 14;
  }, [activeIndicators]);

  // LuxAlgo Support & Resistance Calculation Layer
  const srZones = useMemo(() => {
    const activeSR = activeIndicators.find(ind => ind.id === 'LUX_SR' && ind.visible);
    if (!activeSR || rawCandleData.length === 0) return [];
    
    const { sensitivity, atrPeriod, atrMult, supColor, resColor } = activeSR.config;
    const data = rawCandleData;
    let levels = [];
    
    // 1. Calculate ATR
    let atrArray = [];
    let cumRange = 0;
    let trArray = [];
    
    for (let i = 0; i < data.length; i++) {
        const prevC = i > 0 ? data[i-1].c : data[i].o;
        const tr = Math.max(data[i].h - data[i].l, Math.abs(data[i].h - prevC), Math.abs(data[i].l - prevC));
        trArray.push(tr);
        cumRange += tr;
        
        if (i >= atrPeriod) {
            let sumTr = 0;
            for(let j=i-atrPeriod+1; j<=i; j++) sumTr += trArray[j];
            atrArray.push(sumTr / atrPeriod);
        } else {
            atrArray.push(cumRange / (i + 1));
        }
    }
    
    // 2. Highest Highs / Lowest Lows (Donchian Channels)
    let dhArray = new Array(data.length).fill(0);
    let dlArray = new Array(data.length).fill(0);
    
    for (let i = 0; i < data.length; i++) {
        let dh = -Infinity;
        let dl = Infinity;
        let lookbackStart = Math.max(0, i - sensitivity + 1);
        for (let j = lookbackStart; j <= i; j++) {
            if (data[j].h > dh) dh = data[j].h;
            if (data[j].l < dl) dl = data[j].l;
        }
        dhArray[i] = dh;
        dlArray[i] = dl;
    }
    
    // 3. Identify Swings & Levels
    let donchOs = 0;
    let donchVal = null;
    let donchValLoc = null;
    
    for (let i = 1; i < data.length; i++) {
        let currentOs = donchOs;
        if (dhArray[i] > dhArray[i-1]) currentOs = 1;
        else if (dlArray[i] < dlArray[i-1]) currentOs = -1;
        
        let ph = null, phBar = null, pl = null, plBar = null;
        
        if (currentOs !== donchOs) {
            if (currentOs === 1) {
                pl = donchVal; plBar = donchValLoc;
                donchVal = data[i].h; donchValLoc = i;
            } else {
                ph = donchVal; phBar = donchValLoc;
                donchVal = data[i].l; donchValLoc = i;
            }
        } else {
            if (currentOs === 1 && data[i].h >= (donchVal !== null ? donchVal : -Infinity)) {
                donchVal = data[i].h; donchValLoc = i;
            } else if (currentOs === -1 && data[i].l <= (donchVal !== null ? donchVal : Infinity)) {
                donchVal = data[i].l; donchValLoc = i;
            }
        }
        
        donchOs = currentOs;
        const currentAtr = atrArray[i];
        
        // Add active levels to array
        if (ph !== null) {
            levels.unshift({ top: ph, btm: ph - currentAtr * atrMult, base: ph, startBar: phBar, isSup: false, mitigated: false, color: resColor });
        }
        if (pl !== null) {
            levels.unshift({ top: pl + currentAtr * atrMult, btm: pl, base: pl, startBar: plBar, isSup: true, mitigated: false, color: supColor });
        }
        
        // Handle Breakouts/Mitigations
        for (let l of levels) {
            if (!l.mitigated) {
                if (l.isSup && data[i].c < l.btm) { l.mitigated = true; l.endBar = i; }
                if (!l.isSup && data[i].c > l.top) { l.mitigated = true; l.endBar = i; }
            }
        }
    }
    
    // Return max 5 unmitigated active levels
    return levels.filter(l => !l.mitigated).slice(0, 5); 
  }, [rawCandleData, activeIndicators]);

  // Fibonacci Structure Engine Calculation Layer
  const fibStructData = useMemo(() => {
    const activeFib = activeIndicators.find(ind => ind.id === 'FIB_STRUCT' && ind.visible);
    if (!activeFib || rawCandleData.length === 0) return null;

    const { swingLen, atrMult } = activeFib.config;
    const data = rawCandleData;
    
    // Calculate ATR(14)
    let atr = new Array(data.length).fill(0);
    let sumTr = 0;
    for (let i = 0; i < data.length; i++) {
      let prevC = i > 0 ? data[i-1].c : data[i].o;
      let tr = Math.max(data[i].h - data[i].l, Math.abs(data[i].h - prevC), Math.abs(data[i].l - prevC));
      if (i < 14) {
        sumTr += tr;
        if (i === 13) atr[i] = sumTr / 14;
      } else {
        atr[i] = (tr + 13 * atr[i-1]) / 14;
      }
    }

    let lines = [];
    let labels = [];
    
    let swHigh1 = null, swHigh2 = null;
    let swLow1 = null, swLow2 = null;
    
    let eqhActive = false, eqhPrice = null;
    let eqlActive = false, eqlPrice = null;
    
    let structureBias = 0;
    let lastBrokenHighIdx = null;
    let lastBrokenLowIdx = null;
    
    let fibDirection = 0;
    let fibSwingHigh = null, fibSwingLow = null;
    let fibHighIsLive = false, fibLowIsLive = false;

    for (let i = swingLen; i < data.length; i++) {
        // 1. Pivot Detection
        let pivotIdx = i - swingLen;
        if (pivotIdx < 0 || !data[pivotIdx]) continue;

        let isPH = true, isPL = true;
        for (let j = 1; j <= swingLen; j++) {
            if (data[pivotIdx].h <= (data[pivotIdx-j]?.h ?? -Infinity) || data[pivotIdx].h <= (data[pivotIdx+j]?.h ?? -Infinity)) isPH = false;
            if (data[pivotIdx].l >= (data[pivotIdx-j]?.l ?? Infinity) || data[pivotIdx].l >= (data[pivotIdx+j]?.l ?? Infinity)) isPL = false;
        }

        let atrMinSize = atr[i] * atrMult;

        if (isPH) {
            if (swLow1 === null || (data[pivotIdx].h - swLow1.val) >= atrMinSize) {
                swHigh2 = swHigh1;
                swHigh1 = { idx: pivotIdx, val: data[pivotIdx].h };
                
                let text = (swHigh2 && swHigh1.val > swHigh2.val) ? "HH" : "LH";
                labels.push({ idx: pivotIdx, val: swHigh1.val, text, type: 'swingH' });

                if (swHigh2 && Math.abs(swHigh1.val - swHigh2.val) <= atr[i] * 0.1) {
                    eqhActive = true;
                    eqhPrice = (swHigh1.val + swHigh2.val) / 2;
                    lines.push({ startIdx: swHigh2.idx, endIdx: pivotIdx + 50, val: eqhPrice, type: 'eq' });
                    labels.push({ idx: pivotIdx, val: eqhPrice, text: "EQH", type: 'eqhLbl' });
                }

                if (fibHighIsLive) { fibSwingHigh = swHigh1; fibHighIsLive = false; }
                else if (swHigh1.val !== fibSwingHigh?.val) { fibSwingHigh = swHigh1; }
            }
        }

        if (isPL) {
            if (swHigh1 === null || (swHigh1.val - data[pivotIdx].l) >= atrMinSize) {
                swLow2 = swLow1;
                swLow1 = { idx: pivotIdx, val: data[pivotIdx].l };
                
                let text = (swLow2 && swLow1.val > swLow2.val) ? "HL" : "LL";
                labels.push({ idx: pivotIdx, val: swLow1.val, text, type: 'swingL' });

                if (swLow2 && Math.abs(swLow1.val - swLow2.val) <= atr[i] * 0.1) {
                    eqlActive = true;
                    eqlPrice = (swLow1.val + swLow2.val) / 2;
                    lines.push({ startIdx: swLow2.idx, endIdx: pivotIdx + 50, val: eqlPrice, type: 'eq' });
                    labels.push({ idx: pivotIdx, val: eqlPrice, text: "EQL", type: 'eqlLbl' });
                }

                if (fibLowIsLive) { fibSwingLow = swLow1; fibLowIsLive = false; }
                else if (swLow1.val !== fibSwingLow?.val) { fibSwingLow = swLow1; }
            }
        }

        // 2. Sweeps
        let refHigh = eqhActive ? eqhPrice : swHigh1?.val;
        let refLow = eqlActive ? eqlPrice : swLow1?.val;

        if (refHigh && data[i].h > refHigh && data[i].c < refHigh && data[i].o < refHigh) {
            labels.push({ idx: i, val: data[i].h, text: "✗", type: 'sweepH' });
            if (eqhActive) eqhActive = false; 
        }
        if (refLow && data[i].l < refLow && data[i].c > refLow && data[i].o > refLow) {
            labels.push({ idx: i, val: data[i].l, text: "✗", type: 'sweepL' });
            if (eqlActive) eqlActive = false;
        }

        // 3. Structure Break (BOS / CHoCH)
        let isBullBreak = false;
        let isBearBreak = false;
        
        let bullCond = swHigh1 && data[i].c > swHigh1.val && swHigh1.idx !== lastBrokenHighIdx;
        let bearCond = swLow1 && data[i].c < swLow1.val && swLow1.idx !== lastBrokenLowIdx;

        if (bullCond && bearCond) {
            if (structureBias <= 0) bearCond = false; else bullCond = false;
        }

        if (bullCond) {
            let isCHoCH = structureBias <= 0;
            structureBias = 1;
            isBullBreak = true;
            lastBrokenHighIdx = swHigh1.idx;
            lines.push({ startIdx: swHigh1.idx, endIdx: i, val: swHigh1.val, type: isCHoCH ? 'choch_bull' : 'bos_bull' });
            labels.push({ idx: Math.floor((swHigh1.idx + i) / 2), val: swHigh1.val, text: isCHoCH ? "CHoCH" : "BOS", type: 'struct_bull' });

            // Fib Anchor Logic
            fibDirection = 1;
            fibSwingHigh = { idx: i, val: data[i].h };
            fibSwingLow = swLow1;
            fibHighIsLive = true; fibLowIsLive = false;
        }

        if (bearCond) {
            let isCHoCH = structureBias >= 0;
            structureBias = -1;
            isBearBreak = true;
            lastBrokenLowIdx = swLow1.idx;
            lines.push({ startIdx: swLow1.idx, endIdx: i, val: swLow1.val, type: isCHoCH ? 'choch_bear' : 'bos_bear' });
            labels.push({ idx: Math.floor((swLow1.idx + i) / 2), val: swLow1.val, text: isCHoCH ? "CHoCH" : "BOS", type: 'struct_bear' });

            // Fib Anchor Logic
            fibDirection = -1;
            fibSwingLow = { idx: i, val: data[i].l };
            fibSwingHigh = swHigh1;
            fibLowIsLive = true; fibHighIsLive = false;
        }

        // Live trailing edge
        if (!isBullBreak && !isBearBreak) {
            if (fibHighIsLive && fibSwingHigh && data[i].h > fibSwingHigh.val) {
                fibSwingHigh = { idx: i, val: data[i].h };
            }
            if (fibLowIsLive && fibSwingLow && data[i].l < fibSwingLow.val) {
                fibSwingLow = { idx: i, val: data[i].l };
            }
        }
    }

    // Build Live Fibs payload
    let liveFibs = null;
    if (fibSwingHigh && fibSwingLow && fibDirection !== 0) {
        let fibLevels = {};
        if (fibDirection === 1) { // Bullish targets above
            const diff = fibSwingHigh.val - fibSwingLow.val;
            fibLevels = {
                '0.236': fibSwingHigh.val - diff * 0.236,
                '0.382': fibSwingHigh.val - diff * 0.382,
                '0.500': fibSwingHigh.val - diff * 0.500,
                '0.618': fibSwingHigh.val - diff * 0.618,
                '0.786': fibSwingHigh.val - diff * 0.786,
                '-0.500': fibSwingHigh.val - diff * -0.500,
                '-0.618': fibSwingHigh.val - diff * -0.618,
            };
        } else { // Bearish targets below
            const diff = fibSwingHigh.val - fibSwingLow.val;
            fibLevels = {
                '0.236': fibSwingLow.val + diff * 0.236,
                '0.382': fibSwingLow.val + diff * 0.382,
                '0.500': fibSwingLow.val + diff * 0.500,
                '0.618': fibSwingLow.val + diff * 0.618,
                '0.786': fibSwingLow.val + diff * 0.786,
                '-0.500': fibSwingLow.val - diff * 0.500,
                '-0.618': fibSwingLow.val - diff * 0.618,
            };
        }
        liveFibs = {
            dir: fibDirection,
            sh: fibSwingHigh,
            sl: fibSwingLow,
            levels: fibLevels
        };
    }

    return { lines, labels, liveFibs };
  }, [rawCandleData, activeIndicators]);

  // Combined Indicator Calculation Layer (RSI, UT Bot)
  const chartData = useMemo(() => {
    let data = [...rawCandleData];
    
    // --- 1. RSI CALCULATION ---
    let gains = 0, losses = 0;
    let avgGain = 0, avgLoss = 0;

    for (let i = 0; i < data.length; i++) {
      if (i > 0) {
        const change = data[i].c - data[i - 1].c;
        if (i <= rsiPeriod) {
          if (change >= 0) gains += change;
          else losses -= change;

          if (i === rsiPeriod) {
            avgGain = gains / rsiPeriod;
            avgLoss = losses / rsiPeriod;
            data[i].rsi = 100 - (100 / (1 + avgGain / (avgLoss || 1e-10)));
          } else {
            data[i].rsi = null;
          }
        } else {
          const gain = change >= 0 ? change : 0;
          const loss = change < 0 ? -change : 0;
          avgGain = ((avgGain * (rsiPeriod - 1)) + gain) / rsiPeriod;
          avgLoss = ((avgLoss * (rsiPeriod - 1)) + loss) / rsiPeriod;
          data[i].rsi = 100 - (100 / (1 + avgGain / (avgLoss || 1e-10)));
        }
      } else {
        data[i].rsi = null;
      }
    }

    // --- 2. UT BOT (DUAL ATR) CALCULATION ---
    const activeUT = activeIndicators.find(ind => ind.id === 'UT_BOT' && ind.visible);
    if (activeUT) {
      const { buyKeyValue, buyAtrPeriod, sellKeyValue, sellAtrPeriod } = activeUT.config;
      
      const calcRMA_ATR = (period) => {
        let atrArr = new Array(data.length).fill(0);
        let sumTr = 0;
        for (let i = 0; i < data.length; i++) {
          let prevC = i > 0 ? data[i-1].c : data[i].o;
          let tr = Math.max(data[i].h - data[i].l, Math.abs(data[i].h - prevC), Math.abs(data[i].l - prevC));
          if (i < period) {
            sumTr += tr;
            if (i === period - 1) atrArr[i] = sumTr / period; // Initial SMA
          } else {
            atrArr[i] = (tr + (period - 1) * atrArr[i-1]) / period; // RMA formulation
          }
        }
        return atrArr;
      };

      let atrBuy = calcRMA_ATR(buyAtrPeriod);
      let atrSell = calcRMA_ATR(sellAtrPeriod);
      
      let stopBuy = new Array(data.length).fill(0);
      let stopSell = new Array(data.length).fill(0);

      for (let i = 1; i < data.length; i++) {
        let src = data[i].c;
        let prevSrc = data[i-1].c;

        // Buy Trailing Stop Iteration
        let nLossBuy = buyKeyValue * atrBuy[i];
        let prevStopBuy = stopBuy[i-1];
        if (src > prevStopBuy && prevSrc > prevStopBuy) {
          stopBuy[i] = Math.max(prevStopBuy, src - nLossBuy);
        } else if (src < prevStopBuy && prevSrc < prevStopBuy) {
          stopBuy[i] = Math.min(prevStopBuy, src + nLossBuy);
        } else if (src > prevStopBuy) {
          stopBuy[i] = src - nLossBuy;
        } else {
          stopBuy[i] = src + nLossBuy;
        }

        // Sell Trailing Stop Iteration
        let nLossSell = sellKeyValue * atrSell[i];
        let prevStopSell = stopSell[i-1];
        if (src > prevStopSell && prevSrc > prevStopSell) {
          stopSell[i] = Math.max(prevStopSell, src - nLossSell);
        } else if (src < prevStopSell && prevSrc < prevStopSell) {
          stopSell[i] = Math.min(prevStopSell, src + nLossSell);
        } else if (src > prevStopSell) {
          stopSell[i] = src - nLossSell;
        } else {
          stopSell[i] = src + nLossSell;
        }

        data[i].utStopBuy = stopBuy[i];
        data[i].utStopSell = stopSell[i];
        data[i].utBuy = src > stopBuy[i] && prevSrc <= stopBuy[i-1];
        data[i].utSell = src < stopSell[i] && prevSrc >= stopSell[i-1];
      }
    }

    return data;
  }, [rawCandleData, rsiPeriod, activeIndicators]);

  // Indicator Signal Alert Listener
  const utBotAlertsRef = useRef({ buy: null, sell: null });
  
  useEffect(() => {
    const activeUT = activeIndicators.find(ind => ind.id === 'UT_BOT' && ind.visible);
    if (!activeUT || chartData.length === 0) return;

    const latestCandle = chartData[chartData.length - 1];

    if (activeUT.config.buyAlert && latestCandle.utBuy && utBotAlertsRef.current.buy !== latestCandle.t) {
      playIndicatorSound(activeUT.config.buySound);
      utBotAlertsRef.current.buy = latestCandle.t;
    }

    if (activeUT.config.sellAlert && latestCandle.utSell && utBotAlertsRef.current.sell !== latestCandle.t) {
      playIndicatorSound(activeUT.config.sellSound);
      utBotAlertsRef.current.sell = latestCandle.t;
    }
  }, [chartData, activeIndicators]);

  const handleCopyImage = async () => {
    const canvas = document.getElementById('main-chart-canvas');
    if (canvas) {
      try {
        canvas.toBlob(async (blob) => {
          try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          } catch (err) {
            console.error('Failed to copy to clipboard:', err);
            setFallbackImage(canvas.toDataURL('image/png'));
          }
        });
      } catch (err) {
        console.error('Failed to create image blob:', err);
      }
    }
    setIsScreenshotMenuOpen(false);
  };

  const handleDownloadImage = () => {
    const canvas = document.getElementById('main-chart-canvas');
    if (canvas) {
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentSymbol.replace('USDT', '')}_Chart.png`;
      a.click();
    }
    setIsScreenshotMenuOpen(false);
  };

  // Sync alerts
  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  const intervals = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];
  
  const indicatorTabs = ['Favorites', 'Technicals', 'Financials', 'Community Scripts'];
  const availableIndicators = [
    { id: 'FIB_STRUCT', name: 'Fibonacci Structure Engine', abbr: 'FibStruct', desc: 'Auto BOS/CHoCH, Liquidity EQH/EQL, and Fibonacci zones.', config: { swingLen: 10, atrMult: 0.5 } },
    { id: 'UT_BOT', name: 'UT Bot - Dual ATR', abbr: 'UT_BOT', desc: 'Dual ATR Trailing Stop Bot with accurate Buy/Sell crossover signals.', config: { buyKeyValue: 2, buyAtrPeriod: 103, sellKeyValue: 2, sellAtrPeriod: 8, buyColor: '#32CD32', sellColor: '#f23645', buyAlert: true, sellAlert: true, buySound: 'Buy Chime', sellSound: 'Sell Drop' } },
    { id: 'LUX_SR', name: 'Support & Resistance Pro [LuxAlgo]', abbr: 'S&R Pro', desc: 'Dynamically maps support & resistance zones based on price action structure.', config: { sensitivity: 10, atrPeriod: 200, atrMult: 0.5, supColor: '#089981', resColor: '#f23645' } },
    { id: 'RSI', name: 'Relative Strength Index', abbr: 'RSI', desc: 'Momentum oscillator that measures the speed and change of price movements.', config: { length: 14, color: '#9966FF' } },
    { id: 'MACD', name: 'Moving Average Convergence Divergence', abbr: 'MACD', desc: 'Trend-following momentum indicator that shows the relationship between two moving averages.', config: { fast: 12, slow: 26, signal: 9, color: '#2962ff' } },
    { id: 'BB', name: 'Bollinger Bands', abbr: 'BB', desc: 'A volatility indicator consisting of a simple moving average and two standard deviation bands.', config: { length: 20, mult: 2, color: '#089981' } },
  ];

  const topCoins = [
    { symbol: 'BTC/USDT', apiSymbol: 'BTCUSDT', name: 'Bitcoin', price: 64230.50, change: 2.45, vol: '2.1B' },
    { symbol: 'ETH/USDT', apiSymbol: 'ETHUSDT', name: 'Ethereum', price: 3450.20, change: 1.20, vol: '1.2B' },
    { symbol: 'SOL/USDT', apiSymbol: 'SOLUSDT', name: 'Solana', price: 145.80, change: -4.30, vol: '850M' },
    { symbol: 'BNB/USDT', apiSymbol: 'BNBUSDT', name: 'BNB', price: 590.10, change: 0.50, vol: '320M' },
  ];

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load Historical Data for auto-sync infinite scroll
  const handleLoadHistory = useCallback(async (endTime) => {
    if (!hasMoreHistory) return;
    try {
      const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${currentSymbol}&interval=${activeInterval}&limit=500&endTime=${endTime}`);
      const histData = await res.json();
      
      if (histData.length === 0) {
        setHasMoreHistory(false);
        return;
      }

      let formattedData = histData.map(k => ({
        t: k[0],
        o: parseFloat(k[1]),
        h: parseFloat(k[2]),
        l: parseFloat(k[3]),
        c: parseFloat(k[4]),
        v: parseFloat(k[5])
      }));

      setRawCandleData(prev => {
        // Safe check to avoid duplicate inserts on boundaries
        const newCandles = formattedData.filter(nc => !prev.some(pc => pc.t === nc.t));
        return [...newCandles, ...prev];
      });
    } catch (error) {
      console.error("Failed to fetch historical data:", error);
    }
  }, [currentSymbol, activeInterval, hasMoreHistory]);


  useEffect(() => {
    setLoading(true);
    setRawCandleData([]); 
    setHasMoreHistory(true);

    let pollIntervalId;

    const fetchHistoryAndPoll = async () => {
      try {
        const histRes = await fetch(`https://api.binance.com/api/v3/klines?symbol=${currentSymbol}&interval=${activeInterval}&limit=300`);
        const histData = await histRes.json();
        
        let formattedData = histData.map(k => ({
          t: k[0],
          o: parseFloat(k[1]),
          h: parseFloat(k[2]),
          l: parseFloat(k[3]),
          c: parseFloat(k[4]),
          v: parseFloat(k[5])
        }));

        setRawCandleData(formattedData);
        if(formattedData.length > 0) {
          setCurrentPrice(formattedData[formattedData.length - 1].c);
          const earliestOpen = formattedData[0].o;
          const latestClose = formattedData[formattedData.length - 1].c;
          setPriceChange(((latestClose - earliestOpen) / earliestOpen) * 100);
        }
        setLoading(false);

        // Polling loop
        pollIntervalId = setInterval(async () => {
          try {
            const pollRes = await fetch(`https://api.binance.com/api/v3/klines?symbol=${currentSymbol}&interval=${activeInterval}&limit=1`);
            const pollKlines = await pollRes.json();
            const latestK = pollKlines[0];
            
            const newCandle = {
              t: latestK[0],
              o: parseFloat(latestK[1]),
              h: parseFloat(latestK[2]),
              l: parseFloat(latestK[3]),
              c: parseFloat(latestK[4]),
              v: parseFloat(latestK[5])
            };

            setCurrentPrice(newCandle.c);

            let triggeredAny = false;
            const updatedAlerts = alertsRef.current.map(alert => {
              if (!alert.triggered && alert.symbol === currentSymbol) {
                const isHit = alert.direction === 'up' ? newCandle.c >= alert.targetPrice : newCandle.c <= alert.targetPrice;
                if (isHit) {
                  triggeredAny = true;
                  return { ...alert, triggered: true };
                }
              }
              return alert;
            });

            if (triggeredAny) {
              setAlerts(updatedAlerts);
              triggerAlarm();
            }

            setRawCandleData(prev => {
              if (prev.length === 0) return [newCandle];
              const last = prev[prev.length - 1];
              
              const updatedData = [...prev];
              if (last.t === newCandle.t) {
                updatedData[updatedData.length - 1] = newCandle;
              } else {
                updatedData.push(newCandle);
                if (updatedData.length > 2000) updatedData.shift(); // keep memory tight
              }
              return updatedData;
            });
          } catch(e) {
            console.error("Polling error:", e);
          }
        }, 2000); 

      } catch (err) {
        console.error("Failed to fetch initial chart data:", err);
        setLoading(false);
      }
    };

    fetchHistoryAndPoll();

    return () => clearInterval(pollIntervalId);
  }, [activeInterval, currentSymbol]);

  // Indicator Handlers
  const handleToggleIndicator = (ind) => {
    const exists = activeIndicators.find(a => a.id === ind.id);
    if (exists) {
      // If adding it again from menu, ensure it is visible
      setActiveIndicators(activeIndicators.map(a => a.id === ind.id ? { ...a, visible: true } : a));
    } else {
      setActiveIndicators([...activeIndicators, { ...ind, visible: true, config: { ...ind.config } }]);
    }
  };

  const removeIndicator = (id) => {
    setActiveIndicators(activeIndicators.filter(a => a.id !== id));
  };

  const toggleIndicatorVisibility = (id) => {
    setActiveIndicators(activeIndicators.map(a => a.id === id ? { ...a, visible: !a.visible } : a));
  };

  const updateIndicatorConfig = (id, newConfig) => {
    setActiveIndicators(activeIndicators.map(a => a.id === id ? { ...a, config: newConfig } : a));
    if (indicatorSettingsModal && indicatorSettingsModal.id === id) {
      setIndicatorSettingsModal({ ...indicatorSettingsModal, config: newConfig });
    }
  };

  // Alert Handlers
  const handleCreateAlert = () => {
    const target = parseFloat(alertTargetPrice);
    if (isNaN(target) || target <= 0) return;

    const newAlert = {
      id: Date.now(),
      symbol: currentSymbol,
      targetPrice: target,
      direction: target > currentPrice ? 'up' : 'down',
      triggered: false,
      sound: alertSound
    };

    setAlerts([...alerts, newAlert]);
    setAlertTargetPrice('');
  };

  const removeAlert = (id) => {
    setAlerts(alerts.filter(a => a.id !== id));
  };

  const formatPrice = (price) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price);
  const isPositiveChange = priceChange >= 0;
  const latestC = chartData.length > 0 ? chartData[chartData.length - 1] : { o:0, h:0, l:0, c:0 };

  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <div className="flex flex-col h-screen w-full bg-white dark:bg-[#121316] text-[#131722] dark:text-[#e3e2e6] font-['Inter'] overflow-hidden select-none transition-colors duration-300">
        {/* Top Navigation Bar */}
        <header className="h-14 w-full flex items-center justify-between px-4 border-b border-[#d1d4dc] dark:border-[#3b4a3d]/20 bg-white dark:bg-[#121316] z-50">
          <div className="flex items-center gap-8">
            {settingsForm.headerVisibility.title && (
              <div className="text-xl font-black tracking-tighter text-[#131722] dark:text-[#e3e2e6] uppercase">
                KINETIC_LEDGER
              </div>
            )}
            <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
              {settingsForm.headerVisibility.symbol && (
                <button className="text-[#32CD32] border-b-2 border-[#32CD32] pb-1 transition-all flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" title="Live Connection Active" />
                  {currentSymbol.replace('USDT', '/USDT')}
                </button>
              )}
              {settingsForm.headerVisibility.indicator && (
                <button 
                  onClick={() => setIsIndicatorSheetOpen(true)}
                  className="text-[#787b86] dark:text-[#bacbb9] hover:text-[#131722] dark:hover:text-[#e3e2e6] transition-colors"
                >
                  Indicator
                </button>
              )}
              {settingsForm.headerVisibility.alerts && (
                <button 
                  onClick={() => {
                    setAlertTargetPrice(currentPrice.toString());
                    setIsAlertSheetOpen(true);
                  }}
                  className="text-[#787b86] dark:text-[#bacbb9] hover:text-[#131722] dark:hover:text-[#e3e2e6] transition-colors relative"
                >
                  Alerts
                  {alerts.filter(a => !a.triggered).length > 0 && (
                    <span className="absolute -top-1 -right-3 w-4 h-4 bg-[#eab308] text-white dark:text-[#121316] text-[9px] font-bold rounded-full flex items-center justify-center">
                      {alerts.filter(a => !a.triggered).length}
                    </span>
                  )}
                </button>
              )}
              <button 
                onClick={() => {
                  setIsAiSheetOpen(true);
                  if (!aiAnalysis && !aiLoading) handleGenerateInsights();
                }}
                className="flex items-center space-x-1 px-3 py-1 rounded bg-[#eab308]/10 text-[#eab308] hover:bg-[#eab308]/20 transition-all font-bold border border-[#eab308]/30"
              >
                <Sparkles size={14} />
                <span>AI Insights</span>
              </button>
            </nav>
          </div>

          <div className="flex items-center space-x-4">
            {settingsForm.headerVisibility.ohlc && (
              <div className="hidden lg:flex items-center space-x-3 text-[11px] font-mono bg-[#f8f9fa] dark:bg-[#1b1b1f] px-3 py-1.5 rounded-sm border border-[#d1d4dc] dark:border-[#3b4a3d]/10">
                <span className="text-[#787b86] dark:text-[#bacbb9]">O:</span> <span className="text-[#32CD32]">{formatPrice(latestC.o)}</span>
                <span className="text-[#787b86] dark:text-[#bacbb9]">H:</span> <span className="text-[#32CD32]">{formatPrice(latestC.h)}</span>
                <span className="text-[#787b86] dark:text-[#bacbb9]">L:</span> <span className="text-[#32CD32]">{formatPrice(latestC.l)}</span>
                <span className="text-[#787b86] dark:text-[#bacbb9]">C:</span> <span className="text-[#32CD32]">{formatPrice(latestC.c)}</span>
              </div>
            )}
            <div className="flex items-center space-x-2">
              {settingsForm.headerVisibility.execute && (
                <button className="bg-[#32CD32] text-white dark:text-[#003918] px-4 py-1.5 text-[10px] font-bold uppercase rounded-sm active:scale-95 transition-transform hover:bg-[#3ce53c]">
                  Execute
                </button>
              )}
              {settingsForm.headerVisibility.market && (
                <button 
                  onClick={() => setIsMarketSheetOpen(true)}
                  className="text-[#131722] dark:text-[#e3e2e6] border border-[#d1d4dc] dark:border-[#3b4a3d] px-4 py-1.5 text-[10px] font-bold uppercase rounded-sm hover:bg-[#f0f3fa] dark:hover:bg-[#292a2d] transition-colors"
                >
                  Market
                </button>
              )}
            </div>
            
            <div className="flex items-center space-x-3 text-[#787b86] dark:text-[#bacbb9] border-l border-[#d1d4dc] dark:border-[#3b4a3d]/30 pl-4 ml-2">
              <Settings size={18} className="cursor-pointer hover:text-[#131722] dark:hover:text-[#e3e2e6]" onClick={() => setIsSettingsOpen(true)} />
              
              {settingsForm.headerVisibility.tools && (
                <>
                  <Fullscreen size={18} className="cursor-pointer hover:text-[#131722] dark:hover:text-[#e3e2e6]" />
                  <Bell size={18} className="cursor-pointer hover:text-[#131722] dark:hover:text-[#e3e2e6]" />
                  
                  {/* Screenshot Tool */}
                  <div className="relative flex items-center ml-2">
                    <Camera 
                      size={18} 
                      className="cursor-pointer hover:text-[#131722] dark:hover:text-[#e3e2e6] transition-all" 
                      onClick={() => setIsScreenshotMenuOpen(!isScreenshotMenuOpen)} 
                    />
                    {isScreenshotMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-[199]" onClick={() => setIsScreenshotMenuOpen(false)} />
                        <div className="absolute top-full right-0 mt-4 w-48 bg-white dark:bg-[#1e222d] border border-[#d1d4dc] dark:border-[#434651]/50 rounded-md shadow-xl py-1 z-[200]">
                          <button onClick={handleCopyImage} className="w-full flex items-center px-4 py-2 text-sm text-[#131722] dark:text-[#d1d4dc] hover:bg-[#f0f3fa] dark:hover:bg-[#2a2e39] transition-colors">
                            <Copy size={14} className="mr-3" /> Copy image
                          </button>
                          <button onClick={handleDownloadImage} className="w-full flex items-center px-4 py-2 text-sm text-[#131722] dark:text-[#d1d4dc] hover:bg-[#f0f3fa] dark:hover:bg-[#2a2e39] transition-colors">
                            <Download size={14} className="mr-3" /> Download image
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="flex flex-1 relative overflow-hidden">
          {/* Left Toolbar Sidebar */}
          <aside className={`shrink-0 bg-white dark:bg-[#121316] border-[#d1d4dc] dark:border-[#3b4a3d]/20 flex flex-col items-center py-3 z-40 relative select-none transition-all duration-300 ${isToolbarOpen ? 'w-[52px] border-r opacity-100' : 'w-0 border-r-0 opacity-0 overflow-hidden pointer-events-none'}`}>
            <div className="flex flex-col space-y-0.5 w-[52px] items-center flex-1 overflow-y-auto hide-scrollbar pb-4 relative">
              <ToolbarIcon icon={Crosshair} active />
              
              {/* Lines Tools (2nd Icon) */}
              <ToolbarIcon 
                icon={TrendingUp} 
                hasArrow 
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setActiveToolbarMenu({ 
                    id: activeToolbarMenu.id === 'lines' ? null : 'lines', 
                    top: rect.top 
                  });
                }} 
              />
              
              {/* Fibonacci Tools (3rd Icon) */}
              <ToolbarIcon 
                icon={AlignJustify} 
                hasArrow 
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setActiveToolbarMenu({ 
                    id: activeToolbarMenu.id === 'fib' ? null : 'fib', 
                    top: rect.top 
                  });
                }} 
              />
              
              <ToolbarIcon icon={Waypoints} hasArrow />
              <ToolbarIcon icon={SlidersHorizontal} hasArrow />
              <ToolbarIcon icon={Brush} hasArrow />
              <ToolbarIcon icon={Type} hasArrow />
              <ToolbarIcon icon={Smile} hasArrow />
              <div className="w-6 h-[1px] bg-[#d1d4dc] dark:bg-[#3b4a3d]/40 my-1.5" />
              <ToolbarIcon icon={Ruler} />
              <ToolbarIcon icon={ZoomIn} />
              <div className="w-6 h-[1px] bg-[#d1d4dc] dark:bg-[#3b4a3d]/40 my-1.5" />
              <ToolbarIcon icon={Magnet} hasArrow />
              <ToolbarIcon icon={PenTool} />
              <ToolbarIcon icon={Lock} />
              <ToolbarIcon icon={Eye} hasArrow />
            </div>
          </aside>

          {/* Lines Toolbar Dropdown */}
          {activeToolbarMenu.id === 'lines' && (
            <>
              <div className="fixed inset-0 z-[199]" onClick={() => setActiveToolbarMenu({ id: null, top: 0 })} />
              <div 
                className="fixed z-[200] w-72 bg-white dark:bg-[#1e222d] border border-[#d1d4dc] dark:border-[#434651]/50 rounded-md shadow-xl py-2 flex flex-col"
                style={{ top: Math.max(0, activeToolbarMenu.top), left: isToolbarOpen ? 52 : 0 }}
              >
                <div className="px-4 py-2 text-[10px] font-bold text-[#787b86] dark:text-[#a3a6af] uppercase tracking-wider mb-1">
                  Lines
                </div>
                <ToolbarMenuItem icon={TrendingUp} label="Trend Line" shortcut="Alt + T" />
                <ToolbarMenuItem icon={ArrowUpRight} label="Ray" />
                <ToolbarMenuItem icon={Info} label="Info Line" />
                <ToolbarMenuItem icon={Maximize2} label="Extended Line" />
                <ToolbarMenuItem icon={Ruler} label="Trend Angle" />
                <ToolbarMenuItem icon={Minus} label="Horizontal Line" shortcut="Alt + H" />
                <ToolbarMenuItem icon={ArrowRight} label="Horizontal Ray" shortcut="Alt + J" />
                <ToolbarMenuItem icon={Minus} label="Vertical Line" shortcut="Alt + V" iconClassName="rotate-90" />
                <ToolbarMenuItem icon={Plus} label="Cross Line" shortcut="Alt + C" />
              </div>
            </>
          )}

          {/* Fibonacci Toolbar Dropdown */}
          {activeToolbarMenu.id === 'fib' && (
            <>
              <div className="fixed inset-0 z-[199]" onClick={() => setActiveToolbarMenu({ id: null, top: 0 })} />
              <div 
                className="fixed z-[200] w-72 bg-white dark:bg-[#1e222d] border border-[#d1d4dc] dark:border-[#434651]/50 rounded-md shadow-xl py-2 flex flex-col"
                style={{ top: Math.max(0, activeToolbarMenu.top), left: isToolbarOpen ? 52 : 0 }}
              >
                <div className="px-4 py-2 text-[10px] font-bold text-[#787b86] dark:text-[#a3a6af] uppercase tracking-wider mb-1">
                  Fibonacci
                </div>
                <ToolbarMenuItem icon={AlignJustify} label="Fib Retracement" shortcut="Alt + F" />
                <ToolbarMenuItem icon={GitBranch} label="Trend-Based Fib Extension" />
                <ToolbarMenuItem icon={List} label="Fib Channel" />
                <ToolbarMenuItem icon={Sliders} label="Fib Time Zone" />
                <ToolbarMenuItem icon={Network} label="Fib Speed Resistance Fan" />
                <ToolbarMenuItem icon={GitPullRequest} label="Trend-Based Fib Time" />
              </div>
            </>
          )}

          {/* Toolbar Toggle Button */}
          <div className={`absolute top-1/2 -translate-y-1/2 z-50 transition-all duration-300 ${isToolbarOpen ? 'left-[52px]' : 'left-0'}`}>
            <button 
              onClick={() => setIsToolbarOpen(!isToolbarOpen)}
              className="w-4 h-12 bg-[#f8f9fa] dark:bg-[#1b1b1f] border border-[#d1d4dc] dark:border-[#3b4a3d]/50 border-l-0 rounded-r-md flex items-center justify-center text-[#787b86] dark:text-[#bacbb9] hover:text-[#131722] dark:hover:text-[#e3e2e6] hover:bg-[#f0f3fa] dark:hover:bg-[#292a2d] shadow-md outline-none"
              title={isToolbarOpen ? "Hide Toolbar" : "Show Toolbar"}
            >
              {isToolbarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
            </button>
          </div>

          {/* Main Chart Area */}
          <main className="flex-1 relative bg-white dark:bg-[#121316] overflow-hidden cursor-crosshair">
            
            {/* Active Indicators Legend HUD */}
            <div className="absolute top-16 left-4 z-20 flex flex-col space-y-1 pointer-events-none">
              {activeIndicators.map(ind => {
                const latestRsiValue = chartData.length > 0 ? chartData[chartData.length - 1].rsi : null;
                const rsiDisplay = (ind.id === 'RSI' && latestRsiValue !== null && !isNaN(latestRsiValue)) ? latestRsiValue.toFixed(2) : '';
                const indLength = ind.config?.length ? `(${ind.config.length})` : '';
                const indColor = ind.config?.color || '#9966FF';

                return (
                  <div key={ind.id} className="bg-[#f8f9fa]/90 dark:bg-[#1b1b1f]/90 backdrop-blur-md px-3 py-1.5 rounded-sm border border-[#d1d4dc] dark:border-[#3b4a3d]/50 flex items-center space-x-3 shadow-sm pointer-events-auto">
                    <span className="text-[11px] font-bold text-[#131722] dark:text-[#e3e2e6]">
                      {ind.name} {indLength} <span style={{ color: indColor }} className="ml-1">{rsiDisplay}</span>
                    </span>
                    <div className="flex space-x-2 border-l border-[#d1d4dc] dark:border-[#3b4a3d]/50 pl-2 ml-2">
                      <button 
                        onClick={() => toggleIndicatorVisibility(ind.id)} 
                        className="text-[#787b86] dark:text-[#bacbb9] hover:text-[#3b82f6] transition-colors"
                        title={ind.visible ? "Hide Indicator" : "Show Indicator"}
                      >
                        {ind.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                      <button 
                        onClick={() => {
                          setIndicatorSettingsModal(ind);
                          setIndSettingsTab('Inputs');
                        }} 
                        className="text-[#787b86] dark:text-[#bacbb9] hover:text-[#3b82f6] transition-colors"
                        title="Settings"
                      >
                        <Settings size={14} />
                      </button>
                      <button 
                        onClick={() => removeIndicator(ind.id)} 
                        className="text-[#787b86] dark:text-[#bacbb9] hover:text-[#f23645] transition-colors"
                        title="Remove Indicator"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* General Floating HUD */}
            <div className="absolute top-4 left-4 z-20 pointer-events-none">
              <div className="bg-[#f8f9fa]/90 dark:bg-[#1b1b1f]/90 backdrop-blur-md px-3 py-2 rounded-sm border border-[#d1d4dc] dark:border-[#3b4a3d]/50 flex items-center space-x-3 shadow-xl pointer-events-auto">
                <span className="text-[10px] font-bold text-[#787b86] dark:text-[#bacbb9] uppercase tracking-widest">{currentSymbol.replace('USDT', '/USDT')}</span>
                <span className={`text-xs font-mono font-bold transition-colors ${isPositiveChange ? 'text-[#32CD32]' : 'text-[#ffb3ae]'}`}>
                  {formatPrice(currentPrice)}
                </span>
                <span className={`text-[10px] px-1 rounded-sm ${isPositiveChange ? 'text-[#32CD32] bg-[#32CD32]/10' : 'text-[#ffb3ae] bg-[#a00118]/20'}`}>
                  {isPositiveChange ? '+' : ''}{priceChange.toFixed(2)}%
                </span>
              </div>
            </div>

            {loading ? (
               <div className="absolute inset-0 flex items-center justify-center z-10 bg-white dark:bg-[#121316]">
                 <div className="flex flex-col items-center text-[#32CD32]">
                   <Loader2 className="w-8 h-8 animate-spin mb-4" />
                   <span className="text-xs font-mono font-bold tracking-widest uppercase text-[#131722] dark:text-[#e3e2e6]">Initializing Canvas Engine...</span>
                 </div>
               </div>
            ) : (
              <CustomCanvasChart 
                data={chartData} 
                currentPrice={currentPrice} 
                alerts={alerts.filter(a => a.symbol === currentSymbol)} 
                isDarkMode={isDarkMode} 
                activeIndicators={activeIndicators}
                srZones={srZones}
                fibStructData={fibStructData}
                onLoadHistory={handleLoadHistory}
              />
            )}
          </main>
        </div>

        {/* Footer / Interval Bar */}
        <footer className="h-10 w-full bg-[#f8f9fa] dark:bg-[#1b1b1f] border-t border-[#d1d4dc] dark:border-[#3b4a3d]/20 flex items-center justify-between px-4 z-50 relative">
          <div className="flex items-center space-x-1 pl-16">
            {intervals.map((interval) => (
              <button
                key={interval}
                onClick={() => setActiveInterval(interval)}
                className={`text-[10px] font-bold px-3 py-1 rounded-sm transition-all duration-200 ${
                  activeInterval === interval 
                    ? 'bg-[#f0f3fa] dark:bg-[#292a2d] text-[#32CD32] border border-[#d1d4dc] dark:border-[#3b4a3d]/50' 
                    : 'text-[#787b86] dark:text-[#bacbb9] hover:text-[#131722] dark:hover:text-[#e3e2e6]'
                }`}
              >
                {interval}
              </button>
            ))}
          </div>
          
          <div className="flex items-center space-x-6 text-[10px] font-bold text-[#787b86] dark:text-[#bacbb9]">
            <div className="flex items-center space-x-2">
              <Clock size={12} />
              <span className="tabular-nums">{currentTime} (UTC+5:30)</span>
            </div>
          </div>
        </footer>

        {/* Floating Action Button */}
        <div className="fixed bottom-16 right-6 md:right-10 lg:right-20 w-12 h-12 md:w-14 md:h-14 z-50 group flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer">
          {/* Animated Rotating Yellow Border */}
          <div className="absolute inset-[-3px] md:inset-[-4px] rounded-full border-[2px] md:border-[3px] border-transparent border-t-[#eab308] border-r-[#eab308] animate-[spin_2s_linear_infinite] shadow-[0_0_15px_rgba(234,179,8,0.4)] opacity-80 group-hover:opacity-100 transition-opacity"></div>
          
          {/* Inner Button */}
          <button className="relative w-full h-full bg-[#ffffff] dark:bg-[#1b1b1f] rounded-full flex items-center justify-center text-[#eab308] border border-[#eab308]/30 z-10 shadow-xl bg-clip-padding">
            <Zap className="w-5 h-5 md:w-6 md:h-6" fill="currentColor" />
          </button>
        </div>

        {/* --- SETTINGS DIALOG --- */}
        {isSettingsOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsSettingsOpen(false)} />
            <div className="relative w-[520px] h-[480px] bg-white dark:bg-[#1e222d] rounded-lg shadow-2xl flex flex-col text-[#131722] dark:text-[#d1d4dc] font-sans text-[13px] border border-[#d1d4dc] dark:border-[#434651]/50 overflow-hidden transition-colors">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#d1d4dc] dark:border-[#434651]/30">
                <h2 className="text-lg font-semibold">Settings</h2>
                <button onClick={() => setIsSettingsOpen(false)} className="text-[#787b86] dark:text-[#a3a6af] hover:text-[#131722] dark:hover:text-[#d1d4dc] transition-colors">
                  <X size={20} />
                </button>
              </div>

              {/* Body */}
              <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                <div className="w-[160px] border-r border-[#d1d4dc] dark:border-[#434651]/30 py-2 flex flex-col">
                  <button 
                    onClick={() => setSettingsTab('Symbol')}
                    className={`flex items-center space-x-3 px-4 py-2.5 transition-colors ${settingsTab === 'Symbol' ? 'bg-[#f0f3fa] dark:bg-[#2a2e39] text-[#131722] dark:text-[#d1d4dc]' : 'text-[#787b86] dark:text-[#a3a6af] hover:bg-[#f0f3fa]/50 dark:hover:bg-[#2a2e39]/50'}`}
                  >
                    <BarChart2 size={18} /> <span>Symbol</span>
                  </button>
                  <button 
                    onClick={() => setSettingsTab('Status line')}
                    className={`flex items-center space-x-3 px-4 py-2.5 transition-colors ${settingsTab === 'Status line' ? 'bg-[#f0f3fa] dark:bg-[#2a2e39] text-[#131722] dark:text-[#d1d4dc]' : 'text-[#787b86] dark:text-[#a3a6af] hover:bg-[#f0f3fa]/50 dark:hover:bg-[#2a2e39]/50'}`}
                  >
                    <AlignLeft size={18} /> <span>Status line</span>
                  </button>
                  <button 
                    onClick={() => setSettingsTab('Scales and lines')}
                    className={`flex items-center space-x-3 px-4 py-2.5 transition-colors ${settingsTab === 'Scales and lines' ? 'bg-[#f0f3fa] dark:bg-[#2a2e39] text-[#131722] dark:text-[#d1d4dc]' : 'text-[#787b86] dark:text-[#a3a6af] hover:bg-[#f0f3fa]/50 dark:hover:bg-[#2a2e39]/50'}`}
                  >
                    <CornerDownRight size={18} /> <span>Scales and lines</span>
                  </button>
                  <button 
                    onClick={() => setSettingsTab('Appearance')}
                    className={`flex items-center space-x-3 px-4 py-2.5 transition-colors ${settingsTab === 'Appearance' ? 'bg-[#f0f3fa] dark:bg-[#2a2e39] text-[#131722] dark:text-[#d1d4dc]' : 'text-[#787b86] dark:text-[#a3a6af] hover:bg-[#f0f3fa]/50 dark:hover:bg-[#2a2e39]/50'}`}
                  >
                    <Brush size={18} /> <span>Appearance</span>
                  </button>
                  <button 
                    onClick={() => setSettingsTab('Trading')}
                    className={`flex items-center space-x-3 px-4 py-2.5 transition-colors ${settingsTab === 'Trading' ? 'bg-[#f0f3fa] dark:bg-[#2a2e39] text-[#131722] dark:text-[#d1d4dc]' : 'text-[#787b86] dark:text-[#a3a6af] hover:bg-[#f0f3fa]/50 dark:hover:bg-[#2a2e39]/50'}`}
                  >
                    <Activity size={18} /> <span>Trading</span>
                  </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 p-6 overflow-y-auto">
                  {settingsTab === 'Symbol' && (
                    <div className="flex flex-col space-y-6">
                      {/* Candles Section */}
                      <div>
                        <h3 className="text-[11px] text-[#787b86] mb-4 uppercase tracking-wider">Candles</h3>
                        
                        <label className="flex items-center cursor-pointer mb-4 group">
                          <div className={`w-4 h-4 rounded-sm border flex items-center justify-center mr-3 transition-colors ${settingsForm.colorBarsBasedOnPrevClose ? 'bg-[#2962ff] border-[#2962ff]' : 'border-[#d1d4dc] dark:border-[#434651] group-hover:border-[#787b86]'}`}>
                            {settingsForm.colorBarsBasedOnPrevClose && <Check size={12} className="text-white" strokeWidth={3} />}
                          </div>
                          <input type="checkbox" className="hidden" checked={settingsForm.colorBarsBasedOnPrevClose} onChange={(e) => setSettingsForm({...settingsForm, colorBarsBasedOnPrevClose: e.target.checked})} />
                          <span>Color bars based on previous close</span>
                        </label>

                        <div className="flex items-center justify-between mb-4">
                          <label className="flex items-center cursor-pointer group">
                            <div className={`w-4 h-4 rounded-sm border flex items-center justify-center mr-3 transition-colors ${settingsForm.body ? 'bg-[#2962ff] border-[#2962ff]' : 'border-[#d1d4dc] dark:border-[#434651] group-hover:border-[#787b86]'}`}>
                              {settingsForm.body && <Check size={12} className="text-white" strokeWidth={3} />}
                            </div>
                            <input type="checkbox" className="hidden" checked={settingsForm.body} onChange={(e) => setSettingsForm({...settingsForm, body: e.target.checked})} />
                            <span>Body</span>
                          </label>
                          <div className="flex space-x-2">
                            <div className="w-6 h-6 bg-[#089981] border border-[#d1d4dc] dark:border-[#2a2e39] rounded-sm cursor-pointer hover:opacity-80 transition-opacity" />
                            <div className="w-6 h-6 bg-[#f23645] border border-[#d1d4dc] dark:border-[#2a2e39] rounded-sm cursor-pointer hover:opacity-80 transition-opacity" />
                          </div>
                        </div>

                        <div className="flex items-center justify-between mb-4">
                          <label className="flex items-center cursor-pointer group">
                            <div className={`w-4 h-4 rounded-sm border flex items-center justify-center mr-3 transition-colors ${settingsForm.borders ? 'bg-[#2962ff] border-[#2962ff]' : 'border-[#d1d4dc] dark:border-[#434651] group-hover:border-[#787b86]'}`}>
                              {settingsForm.borders && <Check size={12} className="text-white" strokeWidth={3} />}
                            </div>
                            <input type="checkbox" className="hidden" checked={settingsForm.borders} onChange={(e) => setSettingsForm({...settingsForm, borders: e.target.checked})} />
                            <span>Borders</span>
                          </label>
                          <div className="flex space-x-2">
                            <div className="w-6 h-6 bg-[#056656] border border-[#d1d4dc] dark:border-[#2a2e39] rounded-sm cursor-pointer hover:opacity-80 transition-opacity" />
                            <div className="w-6 h-6 bg-[#9f242e] border border-[#d1d4dc] dark:border-[#2a2e39] rounded-sm cursor-pointer hover:opacity-80 transition-opacity" />
                          </div>
                        </div>

                        <div className="flex items-center justify-between mb-4">
                          <label className="flex items-center cursor-pointer group">
                            <div className={`w-4 h-4 rounded-sm border flex items-center justify-center mr-3 transition-colors ${settingsForm.wick ? 'bg-[#2962ff] border-[#2962ff]' : 'border-[#d1d4dc] dark:border-[#434651] group-hover:border-[#787b86]'}`}>
                              {settingsForm.wick && <Check size={12} className="text-white" strokeWidth={3} />}
                            </div>
                            <input type="checkbox" className="hidden" checked={settingsForm.wick} onChange={(e) => setSettingsForm({...settingsForm, wick: e.target.checked})} />
                            <span>Wick</span>
                          </label>
                          <div className="flex space-x-2">
                            <div className="w-6 h-6 bg-[#089981] border border-[#d1d4dc] dark:border-[#2a2e39] rounded-sm cursor-pointer hover:opacity-80 transition-opacity" />
                            <div className="w-6 h-6 bg-[#f23645] border border-[#d1d4dc] dark:border-[#2a2e39] rounded-sm cursor-pointer hover:opacity-80 transition-opacity" />
                          </div>
                        </div>
                      </div>

                      {/* Data Modification Section */}
                      <div>
                        <h3 className="text-[11px] text-[#787b86] mb-4 uppercase tracking-wider">Data Modification</h3>
                        
                        <div className="flex items-center justify-between mb-4">
                          <span>Precision</span>
                          <select 
                            className="bg-[#f0f3fa] dark:bg-[#2a2e39] border border-[#d1d4dc] dark:border-[#434651]/50 rounded px-3 py-1.5 w-40 outline-none hover:border-[#787b86] transition-colors cursor-pointer text-[#131722] dark:text-[#e3e2e6]"
                            value={settingsForm.precision}
                            onChange={(e) => setSettingsForm({...settingsForm, precision: e.target.value})}
                          >
                            <option value="Default">Default</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                          </select>
                        </div>

                        <div className="flex items-center justify-between mb-4">
                          <span>Timezone</span>
                          <select 
                            className="bg-[#f0f3fa] dark:bg-[#2a2e39] border border-[#d1d4dc] dark:border-[#434651]/50 rounded px-3 py-1.5 w-40 outline-none hover:border-[#787b86] transition-colors cursor-pointer text-[#131722] dark:text-[#e3e2e6] text-ellipsis overflow-hidden whitespace-nowrap"
                            value={settingsForm.timezone}
                            onChange={(e) => setSettingsForm({...settingsForm, timezone: e.target.value})}
                          >
                            <option value="(UTC+5:30) K...">(UTC+5:30) K...</option>
                            <option value="(UTC+0:00)">(UTC+0:00) London</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {settingsTab === 'Appearance' && (
                    <div className="flex flex-col space-y-6">
                      <div>
                        <h3 className="text-[11px] text-[#787b86] mb-4 uppercase tracking-wider">Interface</h3>
                        <div className="flex items-center justify-between mb-6 p-4 border border-[#d1d4dc] dark:border-[#434651]/50 rounded-lg bg-[#f8f9fa] dark:bg-[#2a2e39]">
                          <div className="flex items-center space-x-3">
                            {isDarkMode ? <Moon size={20} className="text-[#32CD32]" /> : <Sun size={20} className="text-[#32CD32]" />}
                            <span className="font-semibold">Color Theme</span>
                          </div>
                          <select 
                            className="bg-white dark:bg-[#1b1b1f] border border-[#d1d4dc] dark:border-[#434651]/50 rounded px-4 py-2 outline-none hover:border-[#787b86] transition-colors cursor-pointer font-medium"
                            value={isDarkMode ? 'dark' : 'light'}
                            onChange={(e) => setIsDarkMode(e.target.value === 'dark')}
                          >
                            <option value="dark">Dark Mode</option>
                            <option value="light">Light Mode</option>
                          </select>
                        </div>
                        
                        <h3 className="text-[11px] text-[#787b86] mb-4 uppercase tracking-wider">Header Visibility</h3>
                        <div className="grid grid-cols-2 gap-4">
                          {[
                            { key: 'title', label: 'Logo / Title' },
                            { key: 'symbol', label: 'Symbol Pair' },
                            { key: 'indicator', label: 'Indicators' },
                            { key: 'alerts', label: 'Alerts' },
                            { key: 'ohlc', label: 'OHLC Values' },
                            { key: 'execute', label: 'Execute Button' },
                            { key: 'market', label: 'Market Select' },
                            { key: 'tools', label: 'Right Tools' }
                          ].map(item => (
                            <label key={item.key} className="flex items-center cursor-pointer group">
                              <div className={`w-4 h-4 rounded-sm border flex items-center justify-center mr-3 transition-colors ${settingsForm.headerVisibility[item.key] ? 'bg-[#2962ff] border-[#2962ff]' : 'border-[#d1d4dc] dark:border-[#434651] group-hover:border-[#787b86]'}`}>
                                {settingsForm.headerVisibility[item.key] && <Check size={12} className="text-white" strokeWidth={3} />}
                              </div>
                              <input 
                                type="checkbox" 
                                className="hidden" 
                                checked={settingsForm.headerVisibility[item.key]} 
                                onChange={(e) => setSettingsForm({
                                  ...settingsForm,
                                  headerVisibility: {
                                    ...settingsForm.headerVisibility,
                                    [item.key]: e.target.checked
                                  }
                                })} 
                              />
                              <span className="text-[13px]">{item.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-[#d1d4dc] dark:border-[#434651]/30 bg-white dark:bg-[#1e222d]">
                <select className="bg-transparent border border-[#d1d4dc] dark:border-[#434651]/50 rounded px-3 py-1.5 text-sm outline-none hover:border-[#787b86] transition-colors cursor-pointer text-[#131722] dark:text-[#d1d4dc]">
                  <option>Template</option>
                </select>
                <div className="flex space-x-3">
                  <button onClick={() => setIsSettingsOpen(false)} className="px-5 py-1.5 rounded border border-[#d1d4dc] dark:border-[#434651]/50 hover:border-[#787b86] hover:bg-[#f0f3fa] dark:hover:bg-[#2a2e39]/50 transition-all font-medium text-[#131722] dark:text-[#d1d4dc]">Cancel</button>
                  <button onClick={() => setIsSettingsOpen(false)} className="px-6 py-1.5 rounded bg-[#2962ff] text-white hover:bg-[#1e53e5] transition-all font-medium">Ok</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- INDICATOR SETTINGS DIALOG --- */}
        {indicatorSettingsModal && (
          <div className="fixed inset-0 z-[205] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIndicatorSettingsModal(null)} />
            <div className="relative w-[480px] bg-white dark:bg-[#1e222d] rounded-lg shadow-2xl flex flex-col text-[#131722] dark:text-[#d1d4dc] font-sans text-[13px] border border-[#d1d4dc] dark:border-[#434651]/50 overflow-hidden transition-colors">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#d1d4dc] dark:border-[#434651]/30">
                <h2 className="text-lg font-semibold">{indicatorSettingsModal.name} Settings</h2>
                <button onClick={() => setIndicatorSettingsModal(null)} className="text-[#787b86] hover:text-[#131722] dark:hover:text-[#d1d4dc] transition-colors">
                  <X size={20} />
                </button>
              </div>

              {/* Body */}
              <div className="p-6">
                <p className="text-sm text-[#787b86] dark:text-[#a3a6af] mb-4">{indicatorSettingsModal.desc}</p>
                <div className="flex flex-col space-y-4 text-center mt-8">
                  <span className="text-[#787b86] italic text-xs">Indicator configuration is dynamic and bound to the engine via UI parameters...</span>
                </div>
              </div>
              
              <div className="flex items-center justify-end px-6 py-4 border-t border-[#d1d4dc] dark:border-[#434651]/30 bg-[#f8f9fa] dark:bg-[#1b1b1f]">
                <button onClick={() => setIndicatorSettingsModal(null)} className="px-6 py-1.5 rounded bg-[#2962ff] text-white hover:bg-[#1e53e5] transition-all font-medium">Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;