import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  LineSeries,
} from "lightweight-charts";
import { Maximize2, MousePointer2, Ruler, Slash, Trash2, X } from "lucide-react";
import {
  BTC_QUAD_CHARTS,
  BTC_QUAD_EMA_PERIOD,
  BTC_QUAD_VWMA_PERIOD,
  calculateEMA,
  calculateBollingerBands,
  buildSocketUrl,
  fetchCandles,
  formatIndicator,
  formatPrice,
  mergeLiveCandle,
  toChartCandles,
  toChartRenko,
} from "./market";

const BTC_SYMBOL = "BTCUSDT";
const QUAD_DRAWINGS_STORAGE_KEY = "ricxz.btcQuadDrawings.v1";
const BTC_BB_PERIOD = 600;
const BTC_BB_MULTIPLIER = 1.001;
const BTC_BAND_COLOR = "#4c1d95";
const BTC_EMA_COLOR = "#d4af37";
const BTC_MA_COLOR = "#22c55e";
const BTC_VWMA_COLOR = "#f8fafc";
const CHART_MODES = {
  fast: "fast",
  slow: "slow",
};
const FAST_CHART_IDS = new Set(["candles-1s", "candles-1m"]);
const SLOW_CHART_IDS = new Set(["candles-15m", "renko-1h", "candles-1h", "candles-4h"]);
const TOOLS = {
  cursor: "cursor",
  trend: "trend",
  ruler: "ruler",
};

export default function BtcQuadView({ embedded = false, onClose, onFullscreen, theme }) {
  const [chartCandles, setChartCandles] = useState(() => ({}));
  const [errors, setErrors] = useState(() => ({}));
  const [activeTool, setActiveTool] = useState(TOOLS.cursor);
  const [clearSignal, setClearSignal] = useState({ id: 0, target: null });
  const [selectedDrawing, setSelectedDrawing] = useState(null);
  const [chartMode, setChartMode] = useState(CHART_MODES.fast);
  const isCompact = useMediaQuery("(max-width: 820px)");
  const visibleCharts = useMemo(
    () => BTC_QUAD_CHARTS.filter((config) => (
      chartMode === CHART_MODES.fast
        ? FAST_CHART_IDS.has(config.id)
        : SLOW_CHART_IDS.has(config.id)
    )),
    [chartMode]
  );
  const btcPrice = useMemo(() => {
    const sourceCandles = [
      chartCandles["candles-1s"],
      chartCandles["candles-1m"],
      chartCandles["candles-5m"],
      chartCandles["candles-15m"],
      chartCandles["candles-1h"],
      chartCandles["candles-4h"],
    ].find((candles) => candles?.length > 0);
    return sourceCandles?.at(-1)?.close ?? null;
  }, [chartCandles]);

  useEffect(() => {
    const controller = new AbortController();
    const sockets = [];
    const configsByInterval = BTC_QUAD_CHARTS.reduce((groups, config) => {
      const group = groups.get(config.interval) || [];
      group.push(config);
      groups.set(config.interval, group);
      return groups;
    }, new Map());

    configsByInterval.forEach((configs, interval) => {
      const maxHistoryLimit = Math.max(...configs.map((config) => config.historyLimit));
      const maxHistoryConfig = configs.find((config) => config.historyLimit === maxHistoryLimit) || configs[0];
      const assignCandlesToConfigs = (sourceCandles) => {
        setChartCandles((current) => {
          const next = { ...current };
          configs.forEach((config) => {
            next[config.id] = sourceCandles.slice(-config.historyLimit);
          });
          return next;
        });
      };
      const assignErrorToConfigs = (message) => {
        setErrors((current) => {
          const next = { ...current };
          configs.forEach((config) => {
            next[config.id] = message;
          });
          return next;
        });
      };

      fetchCandles(BTC_SYMBOL, maxHistoryLimit, controller.signal, interval)
        .then((candles) => {
          if (controller.signal.aborted) return;
          assignCandlesToConfigs(candles);
          assignErrorToConfigs("");

          const socket = new WebSocket(buildSocketUrl(BTC_SYMBOL, interval));
          sockets.push(socket);
          socket.onmessage = (event) => {
            try {
              const payload = JSON.parse(event.data);
              if (controller.signal.aborted || payload?.s !== BTC_SYMBOL) return;
              setChartCandles((current) => {
                const mergedCandles = mergeLiveCandle(current[maxHistoryConfig.id] || candles, payload, maxHistoryLimit);
                const next = { ...current };
                configs.forEach((config) => {
                  next[config.id] = mergedCandles.slice(-config.historyLimit);
                });
                return next;
              });
            } catch {
              assignErrorToConfigs("Falha no tempo real.");
            }
          };
          socket.onerror = () => {
            if (!controller.signal.aborted) {
              assignErrorToConfigs("Tempo real desconectado.");
            }
          };
        })
        .catch((error) => {
          if (!controller.signal.aborted) {
            assignErrorToConfigs(error?.message || "Nao foi possivel carregar este grafico.");
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
          <p className="eyebrow">BTC Graf.</p>
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
              onClick={() => {
                if (!selectedDrawing) return;
                setClearSignal((current) => ({ id: current.id + 1, target: selectedDrawing }));
                setSelectedDrawing(null);
              }}
            >
              <Trash2 size={15} />
            </ToolButton>
          </div>
          <span className="btc-quad-price">{formatPrice(btcPrice)}</span>
          <button
            className={chartMode === CHART_MODES.fast ? "btc-quad-restore active" : "btc-quad-restore"}
            type="button"
            onClick={() => setChartMode(CHART_MODES.fast)}
          >
            GRAFICO RAPIDO
          </button>
          <button
            className={chartMode === CHART_MODES.slow ? "btc-quad-restore active" : "btc-quad-restore"}
            type="button"
            onClick={() => setChartMode(CHART_MODES.slow)}
          >
            GRAFICO LENTO
          </button>
          {embedded ? (
            <button className="btc-quad-fullscreen" type="button" onClick={onFullscreen}>
              <Maximize2 size={15} />
              Graficos em tela cheia
            </button>
          ) : (
            <button className="btc-quad-close" type="button" onClick={onClose} aria-label="Fechar BTC Graf.">
              <X size={18} />
            </button>
          )}
        </div>
      </header>

      <div className="btc-quad-grid">
        {visibleCharts.map((config) => (
          <BtcQuadChart
            key={config.id}
            candles={chartCandles[config.id] || []}
            config={config}
            error={errors[config.id]}
            activeTool={activeTool}
            clearSignal={clearSignal}
            isCompact={isCompact}
            selectedDrawing={selectedDrawing}
            setSelectedDrawing={setSelectedDrawing}
            theme={theme}
          />
        ))}
      </div>
    </section>
  );
}

function BtcQuadChart({
  activeTool,
  candles,
  clearSignal,
  config,
  error,
  isCompact,
  selectedDrawing,
  setSelectedDrawing,
  theme,
}) {
  const containerRef = useRef(null);
  const overlayRef = useRef(null);
  const chartRef = useRef(null);
  const priceSeriesRef = useRef(null);
  const fastLineRef = useRef(null);
  const maLineRef = useRef(null);
  const slowLineRef = useRef(null);
  const renkoEmaLineRef = useRef(null);
  const renkoVwmaLineRef = useRef(null);
  const centeredOnceRef = useRef(false);
  const interactionTimeoutRef = useRef(null);
  const isInteractingRef = useRef(false);
  const lastHandledClearSignalRef = useRef(0);
  const activeToolRef = useRef(activeTool);
  const drawingsRef = useRef([]);
  const chartMetaRef = useRef(null);
  const [drawings, setDrawings] = useState(() => readStoredQuadDrawings(config.id));
  const [draftDrawing, setDraftDrawing] = useState(null);
  const [drawingContext, setDrawingContext] = useState({ chart: null, series: null });
  const [pricePaneHeight, setPricePaneHeight] = useState(null);
  const [interactionRevision, setInteractionRevision] = useState(0);
  const [, forceOverlayUpdate] = useState(0);
  const palette = useMemo(() => getPalette(theme), [theme]);
  const bbMultiplier = getChartBbMultiplier(config);
  const bbPeriod = getChartBbPeriod(config);
  const emaPeriod = getChartEmaPeriod(config);
  const maOffset = getChartMaOffset(config);
  const maPeriod = getChartMaPeriod(config);
  const showMa = Number.isFinite(maPeriod);
  const vwmaPeriod = getChartVwmaPeriod(config);
  const showEma = config.showEma !== false;
  const showBollingerBands = config.showBollingerBands !== false && !isOneMinuteCandleChart(config);
  const chartData = useMemo(() => sanitizeChartData(toChartData(candles, config)), [candles, config]);
  const bandFillData = useMemo(
    () => showBollingerBands ? toChartBandLinesFromBars(chartData, bbPeriod, bbMultiplier) : null,
    [bbMultiplier, bbPeriod, chartData, showBollingerBands]
  );
  const chartMeta = useMemo(
    () => buildChartMeta(chartData, config.fallbackSeconds, config.type === "renko" ? "bricks" : "candles"),
    [chartData, config.fallbackSeconds, config.type]
  );

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const containerElement = containerRef.current;

    const chart = createChart(containerElement, {
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
      color: BTC_BAND_COLOR,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: !isCompact,
      title: "",
    });

    const slowLine = chart.addSeries(LineSeries, {
      color: BTC_BAND_COLOR,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: !isCompact,
      title: "",
    });

    const maLine = chart.addSeries(LineSeries, {
      color: BTC_MA_COLOR,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: !isCompact,
      title: "",
    });

    const renkoEmaLine = chart.addSeries(LineSeries, {
      color: BTC_EMA_COLOR,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: !isCompact,
      title: "",
    });
    const renkoVwmaLine = chart.addSeries(LineSeries, {
      color: BTC_VWMA_COLOR,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: !isCompact,
      title: "",
    });

    const handleChartClick = (param) => {
      if (activeToolRef.current !== TOOLS.cursor || !param?.point) return;

      const drawing = findNearestDrawing(
        param.point,
        drawingsRef.current,
        chart,
        priceSeries,
        chartMetaRef.current
      );
      setSelectedDrawing(drawing ? { chartId: config.id, id: drawing.id } : null);
    };

    chartRef.current = chart;
    priceSeriesRef.current = priceSeries;
    fastLineRef.current = fastLine;
    maLineRef.current = maLine;
    slowLineRef.current = slowLine;
    renkoEmaLineRef.current = renkoEmaLine;
    renkoVwmaLineRef.current = renkoVwmaLine;
    setDrawingContext({ chart, series: priceSeries });

    const syncPaneHeight = () => {
      const height = getPricePaneHeight(chart);
      if (height) setPricePaneHeight(height);
      forceOverlayUpdate((value) => value + 1);
    };

    const observer = new ResizeObserver(() => {
      chart.applyOptions({ autoSize: true });
      window.requestAnimationFrame(syncPaneHeight);
    });
    observer.observe(containerElement);
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      forceOverlayUpdate((value) => value + 1);
    });
    chart.subscribeClick(handleChartClick);
    window.requestAnimationFrame(syncPaneHeight);

    const finishInteraction = () => {
      interactionTimeoutRef.current = null;
      if (!isInteractingRef.current) return;
      isInteractingRef.current = false;
      setInteractionRevision((value) => value + 1);
    };
    const markInteraction = () => {
      if (!isHighFrequencyChart(config)) return;
      isInteractingRef.current = true;
      if (interactionTimeoutRef.current) {
        window.clearTimeout(interactionTimeoutRef.current);
      }
      interactionTimeoutRef.current = window.setTimeout(finishInteraction, 650);
    };

    containerElement.addEventListener("pointerdown", markInteraction, { passive: true });
    containerElement.addEventListener("pointermove", markInteraction, { passive: true });
    containerElement.addEventListener("wheel", markInteraction, { passive: true });
    containerElement.addEventListener("touchmove", markInteraction, { passive: true });

    return () => {
      if (interactionTimeoutRef.current) {
        window.clearTimeout(interactionTimeoutRef.current);
        interactionTimeoutRef.current = null;
      }
      containerElement.removeEventListener("pointerdown", markInteraction);
      containerElement.removeEventListener("pointermove", markInteraction);
      containerElement.removeEventListener("wheel", markInteraction);
      containerElement.removeEventListener("touchmove", markInteraction);
      observer.disconnect();
      chart.unsubscribeClick(handleChartClick);
      chart.remove();
      chartRef.current = null;
      priceSeriesRef.current = null;
      fastLineRef.current = null;
      maLineRef.current = null;
      slowLineRef.current = null;
      renkoEmaLineRef.current = null;
      renkoVwmaLineRef.current = null;
      setDrawingContext({ chart: null, series: null });
      centeredOnceRef.current = false;
      isInteractingRef.current = false;
    };
  }, [config, isCompact, palette, setSelectedDrawing]);

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
    writeStoredQuadDrawings(config.id, drawings);
  }, [config.id, drawings]);

  useEffect(() => {
    if (clearSignal.id === 0 || lastHandledClearSignalRef.current === clearSignal.id) return;
    lastHandledClearSignalRef.current = clearSignal.id;

    queueMicrotask(() => {
      const targetDrawing = clearSignal.target;
      setDrawings((current) => {
        if (targetDrawing) {
          return targetDrawing.chartId === config.id
            ? current.filter((drawing) => drawing.id !== targetDrawing.id)
            : current;
        }
        return [];
      });
      setDraftDrawing(null);
    });
  }, [clearSignal, config.id]);

  useEffect(() => {
    if (activeTool === TOOLS.cursor) {
      queueMicrotask(() => setDraftDrawing(null));
    }
  }, [activeTool]);

  useEffect(() => {
    if (!chartRef.current || !priceSeriesRef.current) return;
    if (isHighFrequencyChart(config) && isInteractingRef.current) return;

    try {
      priceSeriesRef.current.setData(chartData);
      fastLineRef.current?.setData(showBollingerBands ? bandFillData?.upper || [] : []);
      maLineRef.current?.setData(showMa ? toChartLineMaOffset(chartData, maPeriod, maOffset, config.fallbackSeconds) : []);
      slowLineRef.current?.setData(showBollingerBands ? bandFillData?.lower || [] : []);
      renkoEmaLineRef.current?.setData(showEma ? toChartLineEma(chartData, emaPeriod) : []);
      renkoVwmaLineRef.current?.setData(toChartLineVwma(chartData, vwmaPeriod));
    } catch {
      return;
    }

    if (chartData.length > 0 && !centeredOnceRef.current) {
      showRecentBars(chartRef.current, getChartVisibleBars(config), chartData.length, getChartRightOffset(config));
      centeredOnceRef.current = true;
    }
  }, [bandFillData, chartData, config, emaPeriod, interactionRevision, maOffset, maPeriod, showBollingerBands, showEma, showMa, vwmaPeriod]);

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
      setSelectedDrawing({ chartId: config.id, id: completed.id });
    }
    setDraftDrawing(null);
  };

  const handleToolPointerMove = (event) => {
    if (!draftDrawing) return;
    const point = readChartPoint(event, overlayRef.current, chartRef.current, priceSeriesRef.current, chartMeta);
    if (!point) return;
    setDraftDrawing((current) => (current ? { ...current, end: point } : current));
  };

  const legends = [
    showBollingerBands ? formatBbLegend(bbPeriod, bbMultiplier) : null,
    showEma ? `EMA ${emaPeriod}` : null,
    showMa ? `MA ${maPeriod} off ${maOffset}` : null,
    `VWMA ${vwmaPeriod}`,
  ].filter(Boolean);

  return (
    <article className="btc-quad-card">
      <div className="btc-quad-card-header">
        <strong>{config.title}</strong>
        <div className="btc-quad-card-meta">
          <span>{legends.join(" / ")}</span>
        </div>
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
          {showBollingerBands ? (
            <BollingerBandFill
              chart={drawingContext.chart}
              chartMeta={chartMeta}
              lower={bandFillData?.lower}
              series={drawingContext.series}
              upper={bandFillData?.upper}
            />
          ) : null}
          {[...drawings, draftDrawing].filter(Boolean).map((drawing) => (
            <DrawingLayer
              key={drawing.id}
              drawing={drawing}
              chart={drawingContext.chart}
              series={drawingContext.series}
              chartMeta={chartMeta}
              draft={drawing.id.startsWith("draft")}
              selected={selectedDrawing?.chartId === config.id && selectedDrawing.id === drawing.id}
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

function getChartBbMultiplier(config) {
  return Number.isFinite(config?.bbMultiplier) ? config.bbMultiplier : BTC_BB_MULTIPLIER;
}

function getChartBbPeriod(config) {
  return Number.isFinite(config?.bbPeriod) ? config.bbPeriod : BTC_BB_PERIOD;
}

function getChartEmaPeriod(config) {
  return Number.isFinite(config?.emaPeriod) ? config.emaPeriod : BTC_QUAD_EMA_PERIOD;
}

function getChartMaPeriod(config) {
  return Number.isFinite(config?.maPeriod) ? config.maPeriod : null;
}

function getChartMaOffset(config) {
  return Number.isFinite(config?.maOffset) ? config.maOffset : 0;
}

function getChartVwmaPeriod(config) {
  return Number.isFinite(config?.vwmaPeriod) ? config.vwmaPeriod : BTC_QUAD_VWMA_PERIOD;
}

function getChartVisibleBars(config) {
  return Number.isFinite(config?.visibleBars) ? config.visibleBars : 150;
}

function getChartRightOffset(config) {
  return Math.max(
    5,
    Number.isFinite(config?.maOffset) ? config.maOffset + 5 : 5
  );
}

function formatBbLegend(period, multiplier) {
  return multiplier === BTC_BB_MULTIPLIER ? `BB ${period}` : `BB ${period} ${multiplier}`;
}

function toChartData(candles, config) {
  if (config?.type === "renko") {
    return toChartRenko(candles, config.boxSize || 1);
  }

  return toChartCandles(candles);
}

function sanitizeChartData(data) {
  if (!Array.isArray(data) || data.length === 0) return [];

  const byTime = new Map();
  data.forEach((item) => {
    if (
      !Number.isFinite(item?.time) ||
      !Number.isFinite(item.open) ||
      !Number.isFinite(item.high) ||
      !Number.isFinite(item.low) ||
      !Number.isFinite(item.close)
    ) {
      return;
    }

    byTime.set(item.time, item);
  });

  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

function isOneMinuteCandleChart(config) {
  return config?.id === "candles-1m";
}

function isHighFrequencyChart(config) {
  return config?.interval === "1s";
}

function BollingerBandFill({ chart, chartMeta, lower, series, upper }) {
  if (!chart || !series || !Array.isArray(upper) || !Array.isArray(lower) || upper.length === 0 || lower.length === 0) {
    return null;
  }

  const lowerByTime = new Map(lower.map((point) => [point.time, point.value]));
  const paneWidth = getPricePaneWidth(chart);
  const points = upper
    .map((upperPoint) => {
      const lowerValue = lowerByTime.get(upperPoint.time);
      if (!Number.isFinite(upperPoint.value) || !Number.isFinite(lowerValue)) return null;

      const x = pointToCoordinate({ time: upperPoint.time }, chart, chartMeta);
      const upperY = series.priceToCoordinate(upperPoint.value);
      const lowerY = series.priceToCoordinate(lowerValue);
      if (!Number.isFinite(x) || !Number.isFinite(upperY) || !Number.isFinite(lowerY)) return null;
      if (Number.isFinite(paneWidth) && (x < -24 || x > paneWidth + 24)) return null;

      return {
        lower: `${x.toFixed(1)},${lowerY.toFixed(1)}`,
        upper: `${x.toFixed(1)},${upperY.toFixed(1)}`,
      };
    })
    .filter(Boolean);

  if (points.length < 2) return null;

  const polygonPoints = [
    ...points.map((point) => point.upper),
    ...[...points].reverse().map((point) => point.lower),
  ].join(" ");

  return <polygon className="bb-fill-zone" points={polygonPoints} />;
}

function toChartBandLinesFromBars(bars, period = BTC_BB_PERIOD, multiplier = BTC_BB_MULTIPLIER) {
  const bands = calculateBollingerBands(
    bars.map((bar) => bar.close),
    period,
    multiplier
  );

  return {
    upper: toChartBandLineFromBars(bars, bands, "upper"),
    middle: toChartBandLineFromBars(bars, bands, "middle"),
    lower: toChartBandLineFromBars(bars, bands, "lower"),
  };
}

function toChartBandLineFromBars(bars, bands, key) {
  return bars
    .map((bar, index) => {
      const value = bands[index]?.[key];
      if (!Number.isFinite(value)) return null;
      return {
        time: bar.time,
        value,
      };
    })
    .filter(Boolean);
}

function toChartLineEma(bars, period) {
  const ema = calculateEMA(
    bars.map((bar) => bar.close),
    period
  );

  return bars
    .map((bar, index) => ({
      time: bar.time,
      value: ema[index],
    }))
    .filter((item) => Number.isFinite(item.value));
}

function toChartLineMaOffset(bars, period, offset = 0, fallbackSeconds = 60) {
  if (!Array.isArray(bars) || bars.length < period) return [];

  const intervalSeconds = getBarIntervalSeconds(bars, fallbackSeconds);
  return bars
    .map((bar, index) => {
      if (index < period - 1) return null;

      const window = bars.slice(index - period + 1, index + 1);
      const value = window.reduce((sum, item) => sum + item.close, 0) / period;
      const targetBar = bars[index + offset];
      return {
        time: targetBar?.time ?? bar.time + offset * intervalSeconds,
        value,
      };
    })
    .filter((item) => Number.isFinite(item?.time) && Number.isFinite(item.value));
}

function getBarIntervalSeconds(bars, fallbackSeconds) {
  const first = bars.find((bar) => Number.isFinite(bar?.time));
  if (!first) return fallbackSeconds;
  const second = bars.find((bar) => Number.isFinite(bar?.time) && bar.time > first.time);
  return second ? second.time - first.time : fallbackSeconds;
}

function toChartLineVwma(bars, period) {
  if (!Array.isArray(bars) || bars.length < period) return [];

  const points = [];
  let priceVolumeSum = 0;
  let volumeSum = 0;

  bars.forEach((bar, index) => {
    const volume = Number.isFinite(bar.volume) ? bar.volume : 0;
    const close = Number.isFinite(bar.close) ? bar.close : 0;
    priceVolumeSum += close * volume;
    volumeSum += volume;

    if (index >= period) {
      const removed = bars[index - period];
      const removedVolume = Number.isFinite(removed?.volume) ? removed.volume : 0;
      const removedClose = Number.isFinite(removed?.close) ? removed.close : 0;
      priceVolumeSum -= removedClose * removedVolume;
      volumeSum -= removedVolume;
    }

    if (index < period - 1 || !volumeSum) return;

    points.push({
      time: bar.time,
      value: priceVolumeSum / volumeSum,
    });
  });

  return points;
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

  const screenPoint = readScreenPoint(event, overlay);
  if (!screenPoint) return null;

  const { x, y } = screenPoint;
  const timeScale = chart.timeScale();
  const logical = timeScale.coordinateToLogical(x);
  const rawTime = typeof timeScale.coordinateToTime === "function" ? normalizeChartTime(timeScale.coordinateToTime(x)) : null;
  const price = series.coordinateToPrice(y);

  if (logical == null || !Number.isFinite(price)) return null;
  return { x, y, logical, time: resolveDrawingPointTime(logical, rawTime, chartMeta), price };
}

function readScreenPoint(event, overlay) {
  if (!overlay) return null;

  const rect = overlay.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
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

function getPricePaneWidth(chart) {
  try {
    return chart?.paneSize(0)?.width ?? null;
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

function showRecentBars(chart, visibleBars, totalBars, rightOffset = 5) {
  if (!chart || !totalBars) return;
  chart.timeScale().setVisibleLogicalRange({
    from: Math.max(0, totalBars - visibleBars),
    to: totalBars + rightOffset,
  });
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
