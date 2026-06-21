import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  LineSeries,
} from "lightweight-charts";
import { MousePointer2, Ruler, Slash, Trash2 } from "lucide-react";
import {
  formatIndicator,
  formatPercent,
  formatPrice,
  ALT_CHART_BB_MULTIPLIER,
  ALT_CHART_BB_PERIOD,
  ALT_CHART_INTERVALS,
  ALT_CHART_MA_PERIOD,
  ALT_CHART_SECONDARY_BB_MULTIPLIER,
  ALT_CHART_SECONDARY_BB_PERIOD,
  ALT_CHART_VWMA_PERIOD,
  BTC_RENKO_INTERVALS,
  DEFAULT_ALT_CHART_TIMEFRAME,
  DEFAULT_BTC_RENKO_TIMEFRAME,
  getLatestBollingerStats,
  toChartBollingerBands,
  toChartCandleBollingerBands,
  toChartCandles,
  toChartRenko,
  toChartSma,
  toChartVwma,
} from "./market";

const TOOLS = {
  cursor: "cursor",
  trend: "trend",
  ruler: "ruler",
};
const DRAWINGS_STORAGE_KEY = "ricxz.chartDrawings.v1";
const CHART_MODES = {
  btc: "btc",
  alt: "alt",
};
const CHART_TIME_ZONE = "America/Sao_Paulo";
const CHART_LOCALE = "pt-BR";

export default function CryptoChart({ symbol, candles, liveStatus, error, theme, mode = CHART_MODES.btc, timeframe = DEFAULT_BTC_RENKO_TIMEFRAME }) {
  const storageSymbol = `${symbol || "default"}:${mode}:${timeframe}`;
  const containerRef = useRef(null);
  const overlayRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const upperBandSeriesRef = useRef(null);
  const middleBandSeriesRef = useRef(null);
  const lowerBandSeriesRef = useRef(null);
  const secondaryUpperBandSeriesRef = useRef(null);
  const secondaryLowerBandSeriesRef = useRef(null);
  const altMaSeriesRef = useRef(null);
  const altVwmaSeriesRef = useRef(null);
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
  const isCompact = useMediaQuery("(max-width: 820px)");
  const isAltChart = mode === CHART_MODES.alt;
  const timeframeLabel = formatTimeframeLabel(timeframe);
  const btcTimeframeConfig = BTC_RENKO_INTERVALS[timeframe] || BTC_RENKO_INTERVALS[DEFAULT_BTC_RENKO_TIMEFRAME];
  const altTimeframeConfig = ALT_CHART_INTERVALS[timeframe] || ALT_CHART_INTERVALS[DEFAULT_ALT_CHART_TIMEFRAME];
  const btcBoxSize = btcTimeframeConfig.boxSize;
  const chartData = useMemo(() => (isAltChart ? toChartCandles(candles) : toChartRenko(candles, btcBoxSize)), [btcBoxSize, candles, isAltChart]);
  const chartMeta = useMemo(
    () => buildChartMeta(chartData, isAltChart ? altTimeframeConfig.fallbackSeconds : btcTimeframeConfig.fallbackSeconds, isAltChart),
    [altTimeframeConfig.fallbackSeconds, btcTimeframeConfig.fallbackSeconds, chartData, isAltChart]
  );
  const altPrimaryBands = useMemo(
    () => isAltChart ? toChartCandleBollingerBands(candles, ALT_CHART_BB_PERIOD, ALT_CHART_BB_MULTIPLIER) : null,
    [candles, isAltChart]
  );
  const altSecondaryBands = useMemo(
    () => isAltChart ? toChartCandleBollingerBands(candles, ALT_CHART_SECONDARY_BB_PERIOD, ALT_CHART_SECONDARY_BB_MULTIPLIER) : null,
    [candles, isAltChart]
  );
  const altMa = useMemo(() => isAltChart ? toChartSma(candles, ALT_CHART_MA_PERIOD) : [], [candles, isAltChart]);
  const altVwma = useMemo(() => isAltChart ? toChartVwma(candles, ALT_CHART_VWMA_PERIOD) : [], [candles, isAltChart]);

  const stats = useMemo(() => {
    if (!isAltChart) return getLatestBollingerStats(candles, btcBoxSize);
    const last = candles.at(-1);
    const previous = candles.at(-2);
    return {
      price: last?.close,
      primaryUpper: altPrimaryBands?.upper.at(-1)?.value,
      primaryLower: altPrimaryBands?.lower.at(-1)?.value,
      secondaryUpper: altSecondaryBands?.upper.at(-1)?.value,
      secondaryLower: altSecondaryBands?.lower.at(-1)?.value,
      ma: altMa.at(-1)?.value,
      vwma: altVwma.at(-1)?.value,
      change: last && previous ? ((last.close - previous.close) / previous.close) * 100 : null,
    };
  }, [altMa, altPrimaryBands, altSecondaryBands, altVwma, btcBoxSize, candles, isAltChart]);

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
      localization: {
        locale: CHART_LOCALE,
        timeFormatter: formatChartCrosshairTime,
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
        tickMarkFormatter: formatChartTickTime,
      },
      crosshair: {
        mode: 0,
      },
      handleScale: {
        axisDoubleClickReset: {
          price: true,
          time: true,
        },
        axisPressedMouseMove: {
          price: true,
          time: true,
        },
        pinch: true,
      },
      handleScroll: {
        horzTouchDrag: true,
        vertTouchDrag: true,
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

    const upperBandSeries = chart.addSeries(LineSeries, {
      color: isAltChart ? chartPalette.altPrimaryBand : chartPalette.upperBand,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: isAltChart ? (isCompact ? "" : "BB 8000 Sup") : "BB Superior",
    });

    const middleBandSeries = chart.addSeries(LineSeries, {
      color: chartPalette.middleBand,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      title: "BB Media",
    });

    const lowerBandSeries = chart.addSeries(LineSeries, {
      color: isAltChart ? chartPalette.altPrimaryBand : chartPalette.lowerBand,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: isAltChart ? (isCompact ? "" : "BB 8000 Inf") : "BB Inferior",
    });

    const secondaryUpperBandSeries = chart.addSeries(LineSeries, {
      color: chartPalette.altSecondaryBand,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: isAltChart,
      title: isCompact ? "" : "BB 5000 Sup",
    });

    const secondaryLowerBandSeries = chart.addSeries(LineSeries, {
      color: chartPalette.altSecondaryBand,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: isAltChart,
      title: isCompact ? "" : "BB 5000 Inf",
    });

    const altMaSeries = chart.addSeries(LineSeries, {
      color: chartPalette.altMa,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: isAltChart,
      title: isCompact ? "" : "MA 800",
    });

    const altVwmaSeries = chart.addSeries(LineSeries, {
      color: chartPalette.altVwma,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: isAltChart && isCompact ? "" : "VWMA 7000",
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    upperBandSeriesRef.current = upperBandSeries;
    middleBandSeriesRef.current = middleBandSeries;
    lowerBandSeriesRef.current = lowerBandSeries;
    secondaryUpperBandSeriesRef.current = secondaryUpperBandSeries;
    secondaryLowerBandSeriesRef.current = secondaryLowerBandSeries;
    altMaSeriesRef.current = altMaSeries;
    altVwmaSeriesRef.current = altVwmaSeries;
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
      upperBandSeriesRef.current = null;
      middleBandSeriesRef.current = null;
      lowerBandSeriesRef.current = null;
      secondaryUpperBandSeriesRef.current = null;
      secondaryLowerBandSeriesRef.current = null;
      altMaSeriesRef.current = null;
      altVwmaSeriesRef.current = null;
    };
  }, [chartPalette, isAltChart, isCompact, timeframe]);

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

    const bands = isAltChart ? altPrimaryBands : toChartBollingerBands(candles, btcBoxSize);

    candleSeriesRef.current.setData(chartData);
    upperBandSeriesRef.current.setData(bands.upper);
    middleBandSeriesRef.current.setData(isAltChart ? [] : bands.middle);
    lowerBandSeriesRef.current.setData(bands.lower);
    secondaryUpperBandSeriesRef.current?.setData(isAltChart ? altSecondaryBands.upper : []);
    secondaryLowerBandSeriesRef.current?.setData(isAltChart ? altSecondaryBands.lower : []);
    altMaSeriesRef.current?.setData(altMa);
    altVwmaSeriesRef.current?.setData(altVwma);
    setPricePaneHeight(getPricePaneHeight(chartRef.current));

    if (lastCenteredSymbolRef.current !== symbol) {
      showRecentCandles(chartRef.current, isAltChart ? 220 : 180, chartData.length);
      lastCenteredSymbolRef.current = symbol;
    }
  }, [altMa, altPrimaryBands, altSecondaryBands, altVwma, btcBoxSize, candles, chartData, isAltChart, symbol]);

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
          <p className="eyebrow">{isAltChart ? `Altcoin ${timeframeLabel}` : `Renko ${timeframeLabel}`}</p>
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
        {isAltChart ? (
          <>
            <Metric label="Preco" value={formatPrice(stats.price)} />
            <Metric label="BB 8000 Sup" value={formatPrice(stats.primaryUpper)} />
            <Metric label="BB 8000 Inf" value={formatPrice(stats.primaryLower)} />
            <Metric label="BB 5000 Sup" value={formatPrice(stats.secondaryUpper)} />
            <Metric label="BB 5000 Inf" value={formatPrice(stats.secondaryLower)} />
            <Metric label="MA 800" value={formatPrice(stats.ma)} />
            <Metric label="VWMA 7000" value={formatPrice(stats.vwma)} />
            <Metric label="Candle atual" value={formatPercent(stats.change)} intent={stats.change < 0 ? "danger" : "success"} />
          </>
        ) : (
          <>
            <Metric label="Preco" value={formatPrice(stats.price)} />
            <Metric label="BB Sup" value={formatPrice(stats.upperBand)} />
            <Metric label="BB Media" value={formatPrice(stats.middleBand)} />
            <Metric label="BB Inf" value={formatPrice(stats.lowerBand)} />
            <Metric label="Distancia" value={formatPercent(stats.distance)} intent={stats.distance < 0 ? "danger" : "success"} />
          </>
        )}
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

function formatChartCrosshairTime(time) {
  return formatChartTime(time, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatChartTickTime(time) {
  return formatChartTime(time, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatChartTime(time, options) {
  const timestamp = normalizeChartTime(time);
  if (!Number.isFinite(timestamp)) return "";

  return new Intl.DateTimeFormat(CHART_LOCALE, {
    timeZone: CHART_TIME_ZONE,
    ...options,
  }).format(new Date(timestamp * 1000));
}

function formatTimeframeLabel(timeframe) {
  const value = String(timeframe || "");
  if (value.endsWith("m")) return value;
  return value.toUpperCase();
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
  const timeScale = chart.timeScale();
  const logical = timeScale.coordinateToLogical(x);
  const rawTime = typeof timeScale.coordinateToTime === "function" ? normalizeChartTime(timeScale.coordinateToTime(x)) : null;
  const price = series.coordinateToPrice(y);

  if (logical == null || !Number.isFinite(price)) return null;
  return { x, y, logical, time: resolveDrawingPointTime(logical, rawTime, chartMeta), price };
}

function toScreenPoint(point, chart, series, chartMeta) {
  if (!point || !chart || !series) return null;

  const x = pointToCoordinate(point, chart, chartMeta);
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
  const bars = Math.round(pointToLogical(end, chartMeta) - pointToLogical(start, chartMeta));
  const direction = priceChange >= 0 ? "+" : "";

  const unit = chartMeta?.unit || "barras";
  return `${direction}${percent.toFixed(2)}% | ${direction}${formatIndicator(priceChange)} | ${bars} ${unit}`;
}

function buildChartMeta(data, fallbackIntervalSeconds, isAltChart) {
  const first = data?.[0];
  const second = data?.[1];
  if (!first?.time) return null;

  const firstTime = first.time;
  const secondTime = second?.time || null;
  const intervalSeconds = secondTime && secondTime > firstTime ? secondTime - firstTime : fallbackIntervalSeconds;
  const unit = isAltChart ? "candles" : "bricks";
  const dataTimes = data.map((item) => item.time).filter(Number.isFinite);

  return { firstTime, intervalSeconds, unit, dataTimes };
}

function logicalToTime(logical, chartMeta) {
  if (!chartMeta || !Number.isFinite(logical)) return null;
  return chartMeta.firstTime + logical * chartMeta.intervalSeconds;
}

function resolveDrawingPointTime(logical, rawTime, chartMeta) {
  if (Array.isArray(chartMeta?.dataTimes) && chartMeta.dataTimes.length > 0 && Number.isFinite(logical)) {
    const lastLogical = chartMeta.dataTimes.length - 1;
    if (logical < 0 || logical > lastLogical) {
      return logicalToTime(logical, chartMeta);
    }
  }

  return Number.isFinite(rawTime) ? rawTime : logicalToTime(logical, chartMeta);
}

function pointToLogical(point, chartMeta) {
  const logical = Number.isFinite(point?.logical) ? Number(point.logical) : null;

  if (Number.isFinite(point?.time) && Array.isArray(chartMeta?.dataTimes) && chartMeta.dataTimes.length > 0) {
    if ((logical < 0 || logical > chartMeta.dataTimes.length - 1) && Number.isFinite(logical)) return logical;

    const firstTime = chartMeta.dataTimes[0];
    const lastTime = chartMeta.dataTimes.at(-1);
    if ((point.time < firstTime || point.time > lastTime) && Number.isFinite(logical)) return logical;
    return timeToNearestLogical(point.time, chartMeta.dataTimes);
  }

  if (Number.isFinite(point?.time) && chartMeta?.intervalSeconds) {
    return (point.time - chartMeta.firstTime) / chartMeta.intervalSeconds;
  }

  return logical;
}

function pointToCoordinate(point, chart, chartMeta) {
  const logical = pointToLogical(point, chartMeta);
  if (Array.isArray(chartMeta?.dataTimes) && Number.isFinite(logical) && (logical < 0 || logical > chartMeta.dataTimes.length - 1)) {
    return chart.timeScale().logicalToCoordinate(logical);
  }

  if (Number.isFinite(point?.time)) {
    const timeScale = chart.timeScale();
    const timeCoordinate = typeof timeScale.timeToCoordinate === "function" ? timeScale.timeToCoordinate(point.time) : null;
    if (Number.isFinite(timeCoordinate)) return timeCoordinate;
  }

  if (!Number.isFinite(logical)) return null;
  return chart.timeScale().logicalToCoordinate(logical);
}

function normalizeChartTime(time) {
  if (typeof time === "number") return time;
  if (time && typeof time === "object" && Number.isFinite(time.year) && Number.isFinite(time.month) && Number.isFinite(time.day)) {
    return Date.UTC(time.year, time.month - 1, time.day) / 1000;
  }
  return null;
}

function timeToNearestLogical(time, dataTimes) {
  if (!Number.isFinite(time)) return null;
  if (time <= dataTimes[0]) return 0;
  if (time >= dataTimes.at(-1)) return dataTimes.length - 1;

  let low = 0;
  let high = dataTimes.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const current = dataTimes[mid];
    if (current === time) return mid;
    if (current < time) low = mid + 1;
    else high = mid - 1;
  }

  const before = Math.max(0, low - 1);
  const after = Math.min(dataTimes.length - 1, low);
  return Math.abs(dataTimes[before] - time) <= Math.abs(dataTimes[after] - time) ? before : after;
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
      upperBand: "#d8902d",
      middleBand: "rgba(81, 103, 135, 0.62)",
      lowerBand: "#268f6c",
      altPrimaryBand: "#6d28d9",
      altSecondaryBand: "#0284c7",
      altMa: "#b7791f",
      altVwma: "#334155",
    };
  }

  return {
    background: "#101319",
    text: "#a8b3c7",
    grid: "rgba(255, 255, 255, 0.055)",
    border: "rgba(255, 255, 255, 0.12)",
    upperBand: "#f6c85f",
    middleBand: "rgba(168, 179, 199, 0.52)",
    lowerBand: "#62d992",
    altPrimaryBand: "#7c3aed",
    altSecondaryBand: "#38bdf8",
    altMa: "#f6c85f",
    altVwma: "#f8fafc",
  };
}

function useMediaQuery(query) {
  const readMatch = () => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  };

  const [matches, setMatches] = useState(readMatch);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const handleChange = () => setMatches(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener?.("change", handleChange);
    return () => mediaQuery.removeEventListener?.("change", handleChange);
  }, [query]);

  return matches;
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
  }

  if (Number.isFinite(point.logical)) {
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

