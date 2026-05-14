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

export default function CryptoChart({ symbol, candles, liveStatus, error, theme }) {
  const containerRef = useRef(null);
  const overlayRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const emaSeriesRef = useRef(null);
  const dpoSeriesRef = useRef(null);
  const lastCenteredSymbolRef = useRef("");
  const [activeTool, setActiveTool] = useState(TOOLS.cursor);
  const [drawings, setDrawings] = useState([]);
  const [draftDrawing, setDraftDrawing] = useState(null);
  const [drawingContext, setDrawingContext] = useState({ chart: null, series: null });
  const [pricePaneHeight, setPricePaneHeight] = useState(null);
  const [, forceOverlayUpdate] = useState(0);
  const chartPalette = useMemo(() => getChartPalette(theme), [theme]);

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
      setPricePaneHeight(chart.paneSize(0).height);
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
    window.requestAnimationFrame(syncPaneHeight);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      emaSeriesRef.current = null;
      dpoSeriesRef.current = null;
    };
  }, [chartPalette]);

  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return;

    const chartCandles = toChartCandles(candles);
    const emaData = toChartEma(candles);
    const dpoData = toChartDpo(candles);

    candleSeriesRef.current.setData(chartCandles);
    emaSeriesRef.current.setData(emaData);
    dpoSeriesRef.current.setData(dpoData);
    setPricePaneHeight(chartRef.current?.paneSize(0).height ?? null);

    if (lastCenteredSymbolRef.current !== symbol) {
      showRecentCandles(chartRef.current, 220, chartCandles.length);
      lastCenteredSymbolRef.current = symbol;
    }
  }, [candles, symbol]);

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
    const point = readChartPoint(event, overlayRef.current, chartRef.current, candleSeriesRef.current);
    if (!point) return;

    event.preventDefault();

    if (!draftDrawing || draftDrawing.type !== activeTool) {
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
    }
    setDraftDrawing(null);
  };

  const handleToolPointerMove = (event) => {
    if (!draftDrawing) return;
    const point = readChartPoint(event, overlayRef.current, chartRef.current, candleSeriesRef.current);
    if (!point) return;

    setDraftDrawing((current) => (current ? { ...current, end: point } : current));
  };

  const renderedDrawings = [...drawings, draftDrawing].filter(Boolean);

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
              }}
            >
              <Ruler size={15} />
            </ToolButton>
            <ToolButton
              label="Limpar desenhos"
              onClick={() => {
                setDrawings([]);
                setDraftDrawing(null);
              }}
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
          className={activeTool === TOOLS.cursor ? "drawing-overlay idle" : "drawing-overlay active"}
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
              draft={drawing.id.startsWith("draft")}
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

function DrawingLayer({ drawing, chart, series, draft }) {
  const start = toScreenPoint(drawing.start, chart, series);
  const end = toScreenPoint(drawing.end, chart, series);
  if (!start || !end) return null;

  const color = drawing.type === TOOLS.ruler ? "#6bb4ff" : "#f6c85f";
  const label = drawing.type === TOOLS.ruler ? buildRulerLabel(drawing.start, drawing.end) : null;
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  return (
    <g opacity={draft ? 0.72 : 1}>
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke={color}
        strokeWidth={2}
        strokeDasharray={drawing.type === TOOLS.ruler ? "6 5" : "0"}
      />
      <circle cx={start.x} cy={start.y} r={4} fill={color} />
      <circle cx={end.x} cy={end.y} r={4} fill={color} />
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

function readChartPoint(event, overlay, chart, series) {
  if (!overlay || !chart || !series) return null;

  const rect = overlay.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const logical = chart.timeScale().coordinateToLogical(x);
  const price = series.coordinateToPrice(y);

  if (logical == null || !Number.isFinite(price)) return null;
  return { x, y, logical, price };
}

function toScreenPoint(point, chart, series) {
  if (!point || !chart || !series) return null;

  const x = chart.timeScale().logicalToCoordinate(point.logical);
  const y = series.priceToCoordinate(point.price);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  return { x, y };
}

function getPointDistance(start, end) {
  return Math.hypot((end?.x || 0) - (start?.x || 0), (end?.y || 0) - (start?.y || 0));
}

function buildRulerLabel(start, end) {
  const priceChange = end.price - start.price;
  const percent = start.price ? (priceChange / start.price) * 100 : 0;
  const hours = Math.round(Number(end.logical) - Number(start.logical));
  const direction = priceChange >= 0 ? "+" : "";

  return `${direction}${percent.toFixed(2)}% | ${direction}${formatIndicator(priceChange)} | ${hours}h`;
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
