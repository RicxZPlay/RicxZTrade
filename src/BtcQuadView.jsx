import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  LineSeries,
  LineStyle,
} from "lightweight-charts";
import { Maximize2, MousePointer2, Ruler, Slash, Trash2, X } from "lucide-react";
import {
  BB_PERIOD,
  BTC_DPO_PERIOD,
  BTC_QUAD_CHARTS,
  BTC_QUAD_DPO_PERIOD,
  BTC_QUAD_EMA_PERIOD,
  BTC_QUAD_VWMA_PERIOD,
  RENKO_BOX_SIZE,
  buildSocketUrl,
  fetchCandles,
  formatIndicator,
  formatPrice,
  mergeLiveCandle,
  toChartBollingerBands,
  toChartCandles,
  toChartDpoFromBars,
  toChartEma,
  toChartRenko,
  toChartVwma,
} from "./market";

const BTC_SYMBOL = "BTCUSDT";
const QUAD_DRAWINGS_STORAGE_KEY = "ricxz.btcQuadDrawings.v1";
const TOOLS = {
  cursor: "cursor",
  trend: "trend",
  ruler: "ruler",
};

export default function BtcQuadView({ embedded = false, onClose, onFullscreen, theme }) {
  const [chartCandles, setChartCandles] = useState(() => ({}));
  const [errors, setErrors] = useState(() => ({}));
  const [activeTool, setActiveTool] = useState(TOOLS.cursor);
  const [clearSignal, setClearSignal] = useState(0);
  const isCompact = useMediaQuery("(max-width: 820px)");
  const btcPrice = useMemo(() => {
    const sourceCandles = [
      chartCandles["candles-30m"],
      chartCandles["renko-15m"],
      chartCandles["candles-1h"],
      chartCandles["candles-4h"],
    ].find((candles) => candles?.length > 0);
    return sourceCandles?.at(-1)?.close ?? null;
  }, [chartCandles]);

  useEffect(() => {
    const controller = new AbortController();
    const sockets = [];

    BTC_QUAD_CHARTS.forEach((config) => {
      fetchCandles(BTC_SYMBOL, config.historyLimit, controller.signal, config.interval)
        .then((candles) => {
          if (controller.signal.aborted) return;
          setChartCandles((current) => ({ ...current, [config.id]: candles }));
          setErrors((current) => ({ ...current, [config.id]: "" }));

          const socket = new WebSocket(buildSocketUrl(BTC_SYMBOL, config.interval));
          sockets.push(socket);
          socket.onmessage = (event) => {
            try {
              const payload = JSON.parse(event.data);
              if (controller.signal.aborted || payload?.s !== BTC_SYMBOL) return;
              setChartCandles((current) => ({
                ...current,
                [config.id]: mergeLiveCandle(current[config.id] || candles, payload, config.historyLimit),
              }));
            } catch {
              setErrors((current) => ({ ...current, [config.id]: "Falha no tempo real." }));
            }
          };
          socket.onerror = () => {
            if (!controller.signal.aborted) {
              setErrors((current) => ({ ...current, [config.id]: "Tempo real desconectado." }));
            }
          };
        })
        .catch((error) => {
          if (!controller.signal.aborted) {
            setErrors((current) => ({
              ...current,
              [config.id]: error?.message || "Nao foi possivel carregar este grafico.",
            }));
          }
        });
    });

    return () => {
      controller.abort();
      sockets.forEach((socket) => socket.close());
    };
  }, []);

  return (
    <section className={embedded ? "btc-quad-panel" : "btc-quad-overlay"} aria-label="Quatro graficos do BTC">
      <header className="btc-quad-topbar">
        <div>
          <p className="eyebrow">BTC 4 Graf.</p>
          <h2>BTCUSDT</h2>
        </div>
        <div className="btc-quad-actions">
          <div className="drawing-tools" aria-label="Ferramentas dos graficos BTC">
            <ToolButton
              label="Cursor"
              active={activeTool === TOOLS.cursor}
              onClick={() => setActiveTool(TOOLS.cursor)}
            >
              <MousePointer2 size={15} />
            </ToolButton>
            <ToolButton
              label="Linha de tendencia"
              active={activeTool === TOOLS.trend}
              onClick={() => setActiveTool(TOOLS.trend)}
            >
              <Slash size={15} />
            </ToolButton>
            <ToolButton
              label="Regua"
              active={activeTool === TOOLS.ruler}
              onClick={() => setActiveTool(TOOLS.ruler)}
            >
              <Ruler size={15} />
            </ToolButton>
            <ToolButton
              label="Limpar desenhos"
              onClick={() => setClearSignal((value) => value + 1)}
            >
              <Trash2 size={15} />
            </ToolButton>
          </div>
          <span className="btc-quad-price">{formatPrice(btcPrice)}</span>
          {embedded ? (
            <button className="btc-quad-fullscreen" type="button" onClick={onFullscreen}>
              <Maximize2 size={15} />
              Graficos em tela cheia
            </button>
          ) : (
            <button className="btc-quad-close" type="button" onClick={onClose} aria-label="Fechar BTC 4 Graf.">
              <X size={18} />
            </button>
          )}
        </div>
      </header>

      <div className="btc-quad-grid">
        {BTC_QUAD_CHARTS.map((config) => (
          <BtcQuadChart
            key={config.id}
            candles={chartCandles[config.id] || []}
            config={config}
            error={errors[config.id]}
            activeTool={activeTool}
            clearSignal={clearSignal}
            isCompact={isCompact}
            theme={theme}
          />
        ))}
      </div>
    </section>
  );
}

function BtcQuadChart({ activeTool, candles, clearSignal, config, error, isCompact, theme }) {
  const containerRef = useRef(null);
  const overlayRef = useRef(null);
  const chartRef = useRef(null);
  const priceSeriesRef = useRef(null);
  const fastLineRef = useRef(null);
  const slowLineRef = useRef(null);
  const dpoSeriesRef = useRef(null);
  const centeredOnceRef = useRef(false);
  const [drawings, setDrawings] = useState(() => readStoredQuadDrawings(config.id));
  const [draftDrawing, setDraftDrawing] = useState(null);
  const [drawingContext, setDrawingContext] = useState({ chart: null, series: null });
  const [pricePaneHeight, setPricePaneHeight] = useState(null);
  const [, forceOverlayUpdate] = useState(0);
  const palette = useMemo(() => getPalette(theme), [theme]);
  const isRenko = config.type === "renko";
  const chartData = useMemo(() => (isRenko ? toChartRenko(candles, RENKO_BOX_SIZE) : toChartCandles(candles)), [candles, isRenko]);
  const chartMeta = useMemo(() => buildChartMeta(chartData, config.fallbackSeconds, isRenko ? "bricks" : "candles"), [chartData, config.fallbackSeconds, isRenko]);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      height: 300,
      layout: {
        background: { type: ColorType.Solid, color: palette.background },
        textColor: palette.text,
        fontSize: isCompact ? 9 : 12,
        fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      },
      localization: {
        priceFormatter: isCompact ? formatCompactPriceScale : undefined,
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      rightPriceScale: {
        entireTextOnly: true,
        borderColor: palette.border,
        minimumWidth: 0,
        ticksVisible: false,
        visible: !isCompact,
      },
      timeScale: {
        borderColor: palette.border,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: formatTickTime,
      },
      crosshair: {
        mode: 0,
      },
    });

    const priceSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#1fbf75",
      downColor: "#ef5b5b",
      borderUpColor: "#1fbf75",
      borderDownColor: "#ef5b5b",
      wickUpColor: "#1fbf75",
      wickDownColor: "#ef5b5b",
      priceFormat: {
        type: "price",
        precision: 0,
        minMove: 1,
      },
      lastValueVisible: !isCompact,
    });
    priceSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.12,
        bottom: 0.14,
      },
    });

    const fastLine = chart.addSeries(LineSeries, {
      color: isRenko ? palette.upperBand : palette.ema,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: !isCompact,
      title: isCompact ? "" : isRenko ? "BB Superior" : `EMA ${BTC_QUAD_EMA_PERIOD}`,
    });

    const slowLine = chart.addSeries(LineSeries, {
      color: isRenko ? palette.lowerBand : palette.vwma,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: !isCompact,
      title: isCompact ? "" : isRenko ? "BB Inferior" : `VWMA ${BTC_QUAD_VWMA_PERIOD}`,
    });

    const middleLine = isRenko
      ? chart.addSeries(LineSeries, {
          color: palette.middleBand,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          title: isCompact ? "" : "BB Media",
        })
      : null;

    const dpoSeries = chart.addSeries(
      LineSeries,
      {
        title: isCompact ? "" : `DPO ${isRenko ? BTC_DPO_PERIOD : BTC_QUAD_DPO_PERIOD}`,
        color: "#38b24d",
        lineWidth: 2,
        priceFormat: {
          type: "price",
          precision: 2,
          minMove: 0.01,
        },
        priceLineVisible: false,
        lastValueVisible: !isCompact,
        autoscaleInfoProvider: centerZeroAutoscale,
      },
      1
    );
    dpoSeries.createPriceLine({
      price: 0,
      color: "rgba(168, 179, 199, 0.55)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: false,
      title: "",
    });
    chart.panes()[0]?.setStretchFactor(4);
    chart.panes()[1]?.setStretchFactor(1);

    chartRef.current = chart;
    priceSeriesRef.current = priceSeries;
    fastLineRef.current = fastLine;
    slowLineRef.current = slowLine;
    dpoSeriesRef.current = dpoSeries;
    setDrawingContext({ chart, series: priceSeries });
    chart.middleLine = middleLine;

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
    window.requestAnimationFrame(syncPaneHeight);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      priceSeriesRef.current = null;
      fastLineRef.current = null;
      slowLineRef.current = null;
      dpoSeriesRef.current = null;
      setDrawingContext({ chart: null, series: null });
      centeredOnceRef.current = false;
    };
  }, [isCompact, isRenko, palette]);

  useEffect(() => {
    writeStoredQuadDrawings(config.id, drawings);
  }, [config.id, drawings]);

  useEffect(() => {
    if (clearSignal === 0) return;
    queueMicrotask(() => {
      setDrawings([]);
      setDraftDrawing(null);
    });
  }, [clearSignal]);

  useEffect(() => {
    if (activeTool === TOOLS.cursor) {
      queueMicrotask(() => setDraftDrawing(null));
    }
  }, [activeTool]);

  useEffect(() => {
    if (!chartRef.current || !priceSeriesRef.current) return;

    priceSeriesRef.current.setData(chartData);

    if (isRenko) {
      const bands = toChartBollingerBands(candles, RENKO_BOX_SIZE);
      fastLineRef.current?.setData(bands.upper);
      slowLineRef.current?.setData(bands.lower);
      chartRef.current.middleLine?.setData(bands.middle);
      dpoSeriesRef.current?.setData(toChartDpoFromBars(chartData, BTC_DPO_PERIOD));
    } else {
      fastLineRef.current?.setData(toChartEma(candles, BTC_QUAD_EMA_PERIOD));
      slowLineRef.current?.setData(toChartVwma(candles, BTC_QUAD_VWMA_PERIOD));
      dpoSeriesRef.current?.setData(toChartDpoFromBars(chartData, BTC_QUAD_DPO_PERIOD));
    }

    if (chartData.length > 0 && !centeredOnceRef.current) {
      showRecentBars(chartRef.current, isRenko ? 170 : 150, chartData.length);
      centeredOnceRef.current = true;
    }
  }, [candles, chartData, isRenko]);

  const handleToolClick = (event) => {
    if (activeTool === TOOLS.cursor) return;
    const point = readChartPoint(event, overlayRef.current, chartRef.current, priceSeriesRef.current, chartMeta);
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
      id: `${config.id}-${draftDrawing.type}-${Date.now()}`,
      end: point,
    };

    if (getPointDistance(completed.start, completed.end) > 4) {
      setDrawings((current) => [...current, completed]);
    }
    setDraftDrawing(null);
  };

  const handleToolPointerMove = (event) => {
    if (!draftDrawing) return;
    const point = readChartPoint(event, overlayRef.current, chartRef.current, priceSeriesRef.current, chartMeta);
    if (!point) return;
    setDraftDrawing((current) => (current ? { ...current, end: point } : current));
  };

  const legends = isRenko
    ? [`BB ${BB_PERIOD}`, `DPO ${BTC_DPO_PERIOD}`]
    : [`EMA ${BTC_QUAD_EMA_PERIOD}`, `VWMA ${BTC_QUAD_VWMA_PERIOD}`, `DPO ${BTC_QUAD_DPO_PERIOD}`];

  return (
    <article className="btc-quad-card">
      <div className="btc-quad-card-header">
        <strong>{config.title}</strong>
        <span>{legends.join(" / ")}</span>
      </div>
      <div className="btc-quad-chart-area">
        <div className="btc-quad-canvas" ref={containerRef} />
        <svg
          ref={overlayRef}
          className={activeTool === TOOLS.cursor ? "drawing-overlay idle" : "drawing-overlay active"}
          style={pricePaneHeight ? { height: `${pricePaneHeight}px` } : undefined}
          onClick={handleToolClick}
          onPointerMove={handleToolPointerMove}
          onPointerCancel={() => setDraftDrawing(null)}
        >
          {[...drawings, draftDrawing].filter(Boolean).map((drawing) => (
            <DrawingLayer
              key={drawing.id}
              drawing={drawing}
              chart={drawingContext.chart}
              series={drawingContext.series}
              chartMeta={chartMeta}
              draft={drawing.id.startsWith("draft")}
            />
          ))}
        </svg>
      </div>
      {error ? <div className="btc-quad-error">{error}</div> : null}
      {!error && candles.length === 0 ? <div className="btc-quad-loading">Carregando...</div> : null}
    </article>
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

function DrawingLayer({ drawing, chart, series, chartMeta, draft }) {
  const start = toScreenPoint(drawing.start, chart, series, chartMeta);
  const end = toScreenPoint(drawing.end, chart, series, chartMeta);
  if (!start || !end) return null;

  const color = drawing.type === TOOLS.ruler ? "#6bb4ff" : "#f6c85f";
  const label = drawing.type === TOOLS.ruler ? buildRulerLabel(drawing.start, drawing.end, chartMeta) : null;
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  return (
    <g opacity={draft ? 0.72 : 1} className="drawing-layer">
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke={color}
        strokeWidth={2}
        strokeDasharray={drawing.type === TOOLS.ruler ? "6 5" : "0"}
        strokeLinecap="round"
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

function buildRulerLabel(start, end, chartMeta) {
  const priceChange = end.price - start.price;
  const percent = start.price ? (priceChange / start.price) * 100 : 0;
  const bars = Math.round(pointToLogical(end, chartMeta) - pointToLogical(start, chartMeta));
  const direction = priceChange >= 0 ? "+" : "";
  const unit = chartMeta?.unit || "barras";

  return `${direction}${percent.toFixed(2)}% | ${direction}${formatIndicator(priceChange)} | ${bars} ${unit}`;
}

function buildChartMeta(data, fallbackIntervalSeconds, unit) {
  const first = data?.[0];
  const second = data?.[1];
  if (!first?.time) return null;

  const firstTime = first.time;
  const secondTime = second?.time || null;
  const intervalSeconds = secondTime && secondTime > firstTime ? secondTime - firstTime : fallbackIntervalSeconds;
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

function getPricePaneHeight(chart) {
  try {
    return chart?.paneSize(0)?.height ?? null;
  } catch {
    return null;
  }
}

function readStoredQuadDrawings(chartId) {
  try {
    const raw = window.localStorage.getItem(QUAD_DRAWINGS_STORAGE_KEY);
    const parsed = JSON.parse(raw || "{}");
    const stored = parsed?.[chartId];
    if (!Array.isArray(stored)) return [];
    return stored.filter(isValidDrawing);
  } catch {
    return [];
  }
}

function writeStoredQuadDrawings(chartId, drawings) {
  try {
    const raw = window.localStorage.getItem(QUAD_DRAWINGS_STORAGE_KEY);
    const parsed = JSON.parse(raw || "{}");
    const next = { ...parsed };
    const cleanDrawings = drawings.map(sanitizeDrawing).filter(Boolean);

    if (cleanDrawings.length > 0) {
      next[chartId] = cleanDrawings;
    } else {
      delete next[chartId];
    }

    window.localStorage.setItem(QUAD_DRAWINGS_STORAGE_KEY, JSON.stringify(next));
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

function showRecentBars(chart, visibleBars, totalBars) {
  if (!chart || !totalBars) return;
  chart.timeScale().setVisibleLogicalRange({
    from: Math.max(0, totalBars - visibleBars),
    to: totalBars + 5,
  });
}

function centerZeroAutoscale(original) {
  const result = original();
  const range = result?.priceRange;
  if (!range) return result;

  const maxAbs = Math.max(Math.abs(range.minValue), Math.abs(range.maxValue), 1);
  return {
    ...result,
    priceRange: {
      minValue: -maxAbs,
      maxValue: maxAbs,
    },
    margins: {
      above: 6,
      below: 6,
    },
  };
}

function formatCompactPriceScale(price) {
  if (!Number.isFinite(price)) return "";
  const abs = Math.abs(price);
  if (abs >= 1000) {
    const sign = price < 0 ? "-" : "";
    return `${sign}${String(Math.round(abs)).slice(0, 3)}`;
  }
  if (abs >= 100) return price.toFixed(1);
  if (abs >= 1) return price.toFixed(2);
  return price.toPrecision(2);
}

function formatTickTime(time) {
  const timestamp = typeof time === "number" ? time : null;
  if (!Number.isFinite(timestamp)) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

function getPalette(theme) {
  if (theme === "light") {
    return {
      background: "#f1f4f0",
      text: "#617086",
      grid: "rgba(24, 35, 54, 0.08)",
      border: "rgba(24, 35, 54, 0.14)",
      upperBand: "#d8902d",
      middleBand: "rgba(81, 103, 135, 0.62)",
      lowerBand: "#268f6c",
      ema: "#2f8be8",
      vwma: "#c28a18",
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
    ema: "#6bb4ff",
    vwma: "#f6c85f",
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
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, [query]);

  return matches;
}
