import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
} from "lightweight-charts";
import { MousePointer2, Ruler, Slash, Trash2 } from "lucide-react";
import { formatIndicator, formatPercent, formatPrice, toChartCandles, toChartDpo, toChartEma } from "./market";

const TOOLS = {
  cursor: "cursor",
  trend: "trend",
  ruler: "ruler",
};
const DRAWINGS_STORAGE_KEY = "ricxz.chartDrawings.v1";

export default function CryptoChart({ symbol, candles, liveStatus, error, theme }) {
  const storageSymbol = symbol || "default";
  const containerRef = useRef(null);
  const overlayRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const emaSeriesRef = useRef(null);
  const dpoSeriesRef = useRef(null);
  const lastCenteredSymbolRef = useRef("");
  const migratedStoredDrawingsRef = useRef(false);
  const activeToolRef = useRef(TOOLS.cursor);
  const drawingsRef = useRef([]);
  const chartMetaRef = useRef(null);
  const [activeTool, setActiveTool] = useState(TOOLS.cursor);
  const [selectedDrawingId, setSelectedDrawingId] = useState(null);
  const [drawings, setDrawings] = useState(() => readStoredDrawings(storageSymbol));
  const [draftDrawing, setDraftDrawing] = useState(null);
  const [drawingContext, setDrawingContext] = useState({ chart: null, series: null });
  const [pricePaneHeight, setPricePaneHeight] = useState(null);
  const [, forceOverlayUpdate] = useState(0);
  const chartPalette = useMemo(() => getChartPalette(theme), [theme]);
  const chartMeta = useMemo(() => buildChartMeta(candles), [candles]);

  const stats = useMemo(() => {
    const last = candles.at(-1);
    const previous = candles.at(-2);
    const ema = toChartEma(candles).at(-1)?.value;
    const dpo = toChartDpo(candles).at(-1)?.value;
    const distance = last && ema ? ((last.close - ema) / ema) * 100 : null;
    const change = last && previous ? ((last.close - previous.close) / previous.close) * 100 : null;

    return {
      price: last?.close,
      ema,
      dpo,
      distance,
      change,
    };
  }, [candles]);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      height: 480,
      layout: {
        background: { type: ColorType.Solid, color: chartPalette.background },
        textColor: chartPalette.text,
        fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      },
      grid: {
        vertLines: { color: chartPalette.grid },
        horzLines: { color: chartPalette.grid },
      },
      rightPriceScale: {
        borderColor: chartPalette.border,
      },
      timeScale: {
        borderColor: chartPalette.border,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 0,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#1fbf75",
      downColor: "#ef5b5b",
      borderUpColor: "#1fbf75",
      borderDownColor: "#ef5b5b",
      wickUpColor: "#1fbf75",
      wickDownColor: "#ef5b5b",
    });
    candleSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.14,
        bottom: 0.16,
      },
    });

    const emaSeries = chart.addSeries(LineSeries, {
      color: chartPalette.ema,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "EMA 450",
    });

    const dpoPane = chart.addPane();
    const dpoSeries = chart.addSeries(HistogramSeries, {
      color: "rgba(98, 217, 146, 0.45)",
      priceFormat: {
        type: "price",
        precision: 6,
        minMove: 0.000001,
      },
      title: "DPO 120",
    }, dpoPane.paneIndex());

    dpoSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.12,
        bottom: 0.12,
      },
    });

    chart.panes()[0]?.setStretchFactor(5);
    dpoPane.setStretchFactor(1);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    emaSeriesRef.current = emaSeries;
    dpoSeriesRef.current = dpoSeries;
    setDrawingContext({ chart, series: candleSeries });
    lastCenteredSymbolRef.current = "";

    const syncPaneHeight = () => {
      const height = getPricePaneHeight(chart);
      if (height) setPricePaneHeight(height);
      forceOverlayUpdate((value) => value + 1);
    };

    const observer = new ResizeObserver(() => {
      chart.applyOptions({ autoSize: true });
      window.requestAnimationFrame(syncPaneHeight);
    });
    observer.observe(containerRef.current);

    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      forceOverlayUpdate((value) => value + 1);
    });

    const handleChartClick = (param) => {
      if (activeToolRef.current !== TOOLS.cursor || !param?.point) return;

      const drawing = findNearestDrawing(
        param.point,
        drawingsRef.current,
        chartRef.current,
        candleSeriesRef.current,
        chartMetaRef.current
      );
      setSelectedDrawingId(drawing?.id || null);
    };

    chart.subscribeClick(handleChartClick);
    window.requestAnimationFrame(syncPaneHeight);

    return () => {
      observer.disconnect();
      chart.unsubscribeClick(handleChartClick);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      emaSeriesRef.current = null;
      dpoSeriesRef.current = null;
    };
  }, [chartPalette]);

  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  useEffect(() => {
    drawingsRef.current = drawings;
  }, [drawings]);

  useEffect(() => {
    chartMetaRef.current = chartMeta;
  }, [chartMeta]);

  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return;

    const chartCandles = toChartCandles(candles);
    const emaData = toChartEma(candles);
    const dpoData = toChartDpo(candles);

    candleSeriesRef.current.setData(chartCandles);
    emaSeriesRef.current.setData(emaData);
    dpoSeriesRef.current.setData(dpoData);
    setPricePaneHeight(getPricePaneHeight(chartRef.current));

    if (lastCenteredSymbolRef.current !== symbol) {
      showRecentCandles(chartRef.current, 220, chartCandles.length);
      lastCenteredSymbolRef.current = symbol;
    }
  }, [candles, symbol]);

  useEffect(() => {
    writeStoredDrawings(storageSymbol, drawings);
  }, [drawings, storageSymbol]);

  useEffect(() => {
    if (!chartMeta || migratedStoredDrawingsRef.current) return undefined;
    migratedStoredDrawingsRef.current = true;

    queueMicrotask(() => {
      setDrawings((current) => migrateDrawingsToTime(current, chartMeta));
    });

    return undefined;
  }, [chartMeta]);

  useEffect(() => {
    if (!draftDrawing) return undefined;

    const cancelDraft = (event) => {
      if (event.key === "Escape") {
        setDraftDrawing(null);
      }
    };

    window.addEventListener("keydown", cancelDraft);
    return () => window.removeEventListener("keydown", cancelDraft);
  }, [draftDrawing]);

  const handleToolClick = (event) => {
    if (activeTool === TOOLS.cursor) return;
    const point = readChartPoint(event, overlayRef.current, chartRef.current, candleSeriesRef.current, chartMeta);
    if (!point) return;

    event.preventDefault();

    if (!draftDrawing || draftDrawing.type !== activeTool) {
      setSelectedDrawingId(null);
      setDraftDrawing({
        id: `draft-${Date.now()}`,
        type: activeTool,
        start: point,
        end: point,
      });
      return;
    }

    const completed = {
      ...draftDrawing,
      id: `${draftDrawing.type}-${Date.now()}`,
      end: point,
    };

    if (getPointDistance(completed.start, completed.end) > 4) {
      setDrawings((current) => [...current, completed]);
      setSelectedDrawingId(completed.id);
    }
    setDraftDrawing(null);
  };

  const handleToolPointerMove = (event) => {
    if (!draftDrawing) return;
    const point = readChartPoint(event, overlayRef.current, chartRef.current, candleSeriesRef.current, chartMeta);
    if (!point) return;

    setDraftDrawing((current) => (current ? { ...current, end: point } : current));
  };

  const renderedDrawings = [...drawings, draftDrawing].filter(Boolean);
  const hasSelectedDrawing = drawings.some((drawing) => drawing.id === selectedDrawingId);
  const overlayMode = activeTool === TOOLS.cursor ? "drawing-overlay idle" : "drawing-overlay active";
  const handleTrashClick = () => {
    setDraftDrawing(null);

    if (hasSelectedDrawing) {
      setDrawings((current) => current.filter((drawing) => drawing.id !== selectedDrawingId));
      setSelectedDrawingId(null);
      return;
    }

    setDrawings([]);
    setSelectedDrawingId(null);
  };

  return (
    <section className="chart-shell" aria-label={`Grafico de ${symbol}`}>
      <div className="chart-header">
        <div>
          <p className="eyebrow">Grafico 1h</p>
          <h2>{symbol || "Selecione uma moeda"}</h2>
        </div>
        <div className="chart-controls">
          <div className="drawing-tools" aria-label="Ferramentas do grafico">
            <ToolButton
              label="Cursor"
              active={activeTool === TOOLS.cursor}
              onClick={() => {
                setActiveTool(TOOLS.cursor);
                setDraftDrawing(null);
              }}
            >
              <MousePointer2 size={15} />
            </ToolButton>
            <ToolButton
              label="Linha de tendencia"
              active={activeTool === TOOLS.trend}
              onClick={() => {
                setActiveTool(TOOLS.trend);
                setDraftDrawing(null);
                setSelectedDrawingId(null);
              }}
            >
              <Slash size={15} />
            </ToolButton>
            <ToolButton
              label="Regua"
              active={activeTool === TOOLS.ruler}
              onClick={() => {
                setActiveTool(TOOLS.ruler);
                setDraftDrawing(null);
                setSelectedDrawingId(null);
              }}
            >
              <Ruler size={15} />
            </ToolButton>
            <ToolButton
              label={hasSelectedDrawing ? "Apagar desenho selecionado" : "Limpar desenhos"}
              onClick={handleTrashClick}
            >
              <Trash2 size={15} />
            </ToolButton>
          </div>
          <div className="chart-live">
            <span className={liveStatus === "online" ? "dot online" : "dot"} />
            {liveStatus === "online" ? "Tempo real" : "Conectando"}
          </div>
        </div>
      </div>

      <div className="chart-metrics">
        <Metric label="Preco" value={formatPrice(stats.price)} />
        <Metric label="EMA 450" value={formatPrice(stats.ema)} />
        <Metric label="Distancia" value={formatPercent(stats.distance)} intent={stats.distance < 0 ? "danger" : "success"} />
        <Metric label="DPO 120" value={formatIndicator(stats.dpo)} intent={stats.dpo < 0 ? "danger" : "success"} />
        <Metric label="Candle atual" value={formatPercent(stats.change)} intent={stats.change < 0 ? "danger" : "success"} />
      </div>

      <div className="chart-area">
        <div ref={containerRef} className="chart-canvas" />
        {error ? <div className="chart-error">{error}</div> : null}
        <svg
          ref={overlayRef}
          className={overlayMode}
          style={pricePaneHeight ? { height: `${pricePaneHeight}px` } : undefined}
          onClick={handleToolClick}
          onPointerMove={handleToolPointerMove}
          onPointerCancel={() => setDraftDrawing(null)}
        >
          {renderedDrawings.map((drawing) => (
            <DrawingLayer
              key={drawing.id}
              drawing={drawing}
              chart={drawingContext.chart}
              series={drawingContext.series}
              chartMeta={chartMeta}
              draft={drawing.id.startsWith("draft")}
              selected={drawing.id === selectedDrawingId}
            />
          ))}
        </svg>
      </div>
    </section>
  );
}

function Metric({ label, value, intent }) {
  return (
    <div className={`chart-metric ${intent || ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ToolButton({ active = false, children, label, onClick }) {
  return (
    <button
      type="button"
      className={active ? "tool-button active" : "tool-button"}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function DrawingLayer({ drawing, chart, series, chartMeta, draft, selected }) {
  const start = toScreenPoint(drawing.start, chart, series, chartMeta);
  const end = toScreenPoint(drawing.end, chart, series, chartMeta);
  if (!start || !end) return null;

  const color = drawing.type === TOOLS.ruler ? "#6bb4ff" : "#f6c85f";
  const label = drawing.type === TOOLS.ruler ? buildRulerLabel(drawing.start, drawing.end, chartMeta) : null;
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  return (
    <g opacity={draft ? 0.72 : 1} className={selected ? "drawing-layer selected" : "drawing-layer"}>
      {selected ? (
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
          strokeOpacity={0.18}
        />
      ) : null}
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke={color}
        strokeWidth={selected ? 3 : 2}
        strokeDasharray={drawing.type === TOOLS.ruler ? "6 5" : "0"}
        strokeLinecap="round"
      />
      <circle
        cx={start.x}
        cy={start.y}
        r={selected ? 5 : 4}
        fill={color}
        stroke={selected ? "#ffffff" : "transparent"}
        strokeWidth={selected ? 1.5 : 0}
      />
      <circle
        cx={end.x}
        cy={end.y}
        r={selected ? 5 : 4}
        fill={color}
        stroke={selected ? "#ffffff" : "transparent"}
        strokeWidth={selected ? 1.5 : 0}
      />
      {drawing.type === TOOLS.ruler ? (
        <>
          <line x1={start.x} y1={start.y} x2={end.x} y2={start.y} stroke={color} strokeWidth={1} opacity={0.45} />
          <line x1={end.x} y1={start.y} x2={end.x} y2={end.y} stroke={color} strokeWidth={1} opacity={0.45} />
          <foreignObject x={Math.min(Math.max(midX - 80, 8), 9999)} y={Math.max(midY - 28, 8)} width="160" height="54">
            <div className="ruler-label">{label}</div>
          </foreignObject>
        </>
      ) : null}
    </g>
  );
}

function readChartPoint(event, overlay, chart, series, chartMeta) {
  if (!overlay || !chart || !series) return null;

  const rect = overlay.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const logical = chart.timeScale().coordinateToLogical(x);
  const price = series.coordinateToPrice(y);

  if (logical == null || !Number.isFinite(price)) return null;
  return { x, y, logical, time: logicalToTime(logical, chartMeta), price };
}

function toScreenPoint(point, chart, series, chartMeta) {
  if (!point || !chart || !series) return null;

  const logical = pointToLogical(point, chartMeta);
  if (!Number.isFinite(logical)) return null;

  const x = chart.timeScale().logicalToCoordinate(logical);
  const y = series.priceToCoordinate(point.price);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  return { x, y };
}

function getPointDistance(start, end) {
  return Math.hypot((end?.x || 0) - (start?.x || 0), (end?.y || 0) - (start?.y || 0));
}

function findNearestDrawing(point, drawings, chart, series, chartMeta) {
  if (!point || !drawings.length || !chart || !series) return null;

  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  const hitRadius = 14;

  for (const drawing of drawings) {
    const start = toScreenPoint(drawing.start, chart, series, chartMeta);
    const end = toScreenPoint(drawing.end, chart, series, chartMeta);
    if (!start || !end) continue;

    const distance = getDistanceToSegment(point, start, end);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = drawing;
    }
  }

  return nearestDistance <= hitRadius ? nearest : null;
}

function getDistanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);

  const rawT = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const t = Math.max(0, Math.min(1, rawT));
  const projection = {
    x: start.x + t * dx,
    y: start.y + t * dy,
  };

  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

function buildRulerLabel(start, end, chartMeta) {
  const priceChange = end.price - start.price;
  const percent = start.price ? (priceChange / start.price) * 100 : 0;
  const hours = Math.round(pointToLogical(end, chartMeta) - pointToLogical(start, chartMeta));
  const direction = priceChange >= 0 ? "+" : "";

  return `${direction}${percent.toFixed(2)}% | ${direction}${formatIndicator(priceChange)} | ${hours}h`;
}

function buildChartMeta(candles) {
  const first = candles?.[0];
  const second = candles?.[1];
  if (!first?.openTime) return null;

  const firstTime = Math.floor(first.openTime / 1000);
  const secondTime = second?.openTime ? Math.floor(second.openTime / 1000) : null;
  const intervalSeconds = secondTime && secondTime > firstTime ? secondTime - firstTime : 3600;

  return { firstTime, intervalSeconds };
}

function logicalToTime(logical, chartMeta) {
  if (!chartMeta || !Number.isFinite(logical)) return null;
  return chartMeta.firstTime + logical * chartMeta.intervalSeconds;
}

function pointToLogical(point, chartMeta) {
  if (Number.isFinite(point?.time) && chartMeta?.intervalSeconds) {
    return (point.time - chartMeta.firstTime) / chartMeta.intervalSeconds;
  }

  return Number.isFinite(point?.logical) ? Number(point.logical) : null;
}

function showRecentCandles(chart, visibleCandles, totalDataPoints) {
  if (!chart) return;

  const timeScale = chart.timeScale();
  const range = timeScale.getVisibleLogicalRange();
  const right = totalDataPoints ? totalDataPoints + 5 : range?.to ?? visibleCandles;
  timeScale.setVisibleLogicalRange({
    from: Math.max(0, right - visibleCandles),
    to: right,
  });
}

function getPricePaneHeight(chart) {
  try {
    return chart?.paneSize(0)?.height ?? null;
  } catch {
    return null;
  }
}

function getChartPalette(theme) {
  if (theme === "light") {
    return {
      background: "#f1f4f0",
      text: "#617086",
      grid: "rgba(24, 35, 54, 0.08)",
      border: "rgba(24, 35, 54, 0.14)",
      ema: "#c28a18",
    };
  }

  return {
    background: "#101319",
    text: "#a8b3c7",
    grid: "rgba(255, 255, 255, 0.055)",
    border: "rgba(255, 255, 255, 0.12)",
    ema: "#f6c85f",
  };
}

function readStoredDrawings(symbol) {
  try {
    const raw = window.localStorage.getItem(DRAWINGS_STORAGE_KEY);
    const parsed = JSON.parse(raw || "{}");
    const symbolDrawings = parsed?.[symbol];
    if (!Array.isArray(symbolDrawings)) return [];
    return symbolDrawings.filter(isValidDrawing);
  } catch {
    return [];
  }
}

function writeStoredDrawings(symbol, drawings) {
  try {
    const raw = window.localStorage.getItem(DRAWINGS_STORAGE_KEY);
    const parsed = JSON.parse(raw || "{}");
    const next = { ...parsed };

    const cleanDrawings = drawings.map(sanitizeDrawing).filter(Boolean);

    if (cleanDrawings.length > 0) {
      next[symbol] = cleanDrawings;
    } else {
      delete next[symbol];
    }

    window.localStorage.setItem(DRAWINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage can fail in private modes; drawing still works for the open session.
  }
}

function isValidDrawing(drawing) {
  return (
    drawing &&
    (drawing.type === TOOLS.trend || drawing.type === TOOLS.ruler) &&
    isValidDrawingPoint(drawing.start) &&
    isValidDrawingPoint(drawing.end)
  );
}

function isValidDrawingPoint(point) {
  return point && (Number.isFinite(point.time) || Number.isFinite(point.logical)) && Number.isFinite(point.price);
}

function sanitizeDrawing(drawing) {
  if (!isValidDrawing(drawing)) return null;

  return {
    id: typeof drawing.id === "string" ? drawing.id : `${drawing.type}-${Date.now()}`,
    type: drawing.type,
    start: sanitizeDrawingPoint(drawing.start),
    end: sanitizeDrawingPoint(drawing.end),
  };
}

function sanitizeDrawingPoint(point) {
  const cleanPoint = {
    price: Number(point.price),
  };

  if (Number.isFinite(point.time)) {
    cleanPoint.time = Number(point.time);
  } else if (Number.isFinite(point.logical)) {
    cleanPoint.logical = Number(point.logical);
  }

  return cleanPoint;
}

function migrateDrawingsToTime(drawings, chartMeta) {
  let changed = false;

  const nextDrawings = drawings.map((drawing) => {
    const start = migratePointToTime(drawing.start, chartMeta);
    const end = migratePointToTime(drawing.end, chartMeta);

    if (start !== drawing.start || end !== drawing.end) {
      changed = true;
      return { ...drawing, start, end };
    }

    return drawing;
  });

  return changed ? nextDrawings : drawings;
}

function migratePointToTime(point, chartMeta) {
  if (Number.isFinite(point?.time) || !Number.isFinite(point?.logical)) return point;
  const time = logicalToTime(point.logical, chartMeta);
  if (!Number.isFinite(time)) return point;
  return { ...point, time };
}
