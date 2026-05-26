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
  BTC_QUAD_CHARTS,
  BTC_QUAD_EMA_PERIOD,
  BTC_QUAD_VWMA_PERIOD,
  calculateEMA,
  calculateBollingerBands,
  buildSocketUrl,
  fetchCandles,
  formatIndicator,
  formatPercent,
  formatPrice,
  mergeLiveCandle,
  toChartCandles,
  toChartDpoFromBars,
  toChartEma,
  toChartVwma,
} from "./market";

const BTC_SYMBOL = "BTCUSDT";
const QUAD_DRAWINGS_STORAGE_KEY = "ricxz.btcQuadDrawings.v1";
const BTC_PLAN_STORAGE_KEY = "ricxz.btcStopPlan.v1";
const BTC_STOP_LOOKBACK_CANDLES = 12;
const BTC_STOP_BUFFER_PERCENT = 0.0004;
const BTC_BB_PERIOD = 600;
const BTC_BB_MULTIPLIER = 1.001;
const BTC_DPO_PERIOD = 450;
const BTC_BAND_COLOR = "#f6c85f";
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
  const [trackedPlan, setTrackedPlan] = useState(() => readStoredBtcPlan());
  const isCompact = useMediaQuery("(max-width: 820px)");
  const btcPrice = useMemo(() => {
    const sourceCandles = [
      chartCandles["candles-1h"],
      chartCandles["candles-4h"],
    ].find((candles) => candles?.length > 0);
    return sourceCandles?.at(-1)?.close ?? null;
  }, [chartCandles]);
  const tradePlan = useMemo(() => buildBtcTradePlan(chartCandles, btcPrice), [chartCandles, btcPrice]);

  useEffect(() => {
    writeStoredBtcPlan(trackedPlan);
  }, [trackedPlan]);

  useEffect(() => {
    queueMicrotask(() => {
      setTrackedPlan((current) => {
        if (!current?.entryLow) {
          if (!tradePlan.shouldTrack || !Number.isFinite(tradePlan.entryLow) || !Number.isFinite(tradePlan.entryHigh)) {
            return current;
          }
          return {
            scenario: tradePlan.scenario,
            entryLow: tradePlan.entryLow,
            entryHigh: tradePlan.entryHigh,
            entryTime: Date.now(),
            initialStop: tradePlan.stop,
            stop: tradePlan.stop,
            updatedAt: Date.now(),
          };
        }

        if (!Number.isFinite(tradePlan.stop)) return current;
        const currentStop = Number.isFinite(current.stop) ? current.stop : Number.NEGATIVE_INFINITY;
        if (tradePlan.stop <= currentStop + 0.01) return current;
        return {
          ...current,
          stop: tradePlan.stop,
          updatedAt: Date.now(),
        };
      });
    });
  }, [
    tradePlan.entryHigh,
    tradePlan.entryLow,
    tradePlan.scenario,
    tradePlan.shouldTrack,
    tradePlan.stop,
  ]);

  const handleResetPlan = () => {
    setTrackedPlan(null);
  };

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

      <BtcStopPlanStrip
        btcPrice={btcPrice}
        onResetPlan={handleResetPlan}
        tradePlan={tradePlan}
        trackedPlan={trackedPlan}
      />

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
            selectedDrawing={selectedDrawing}
            setSelectedDrawing={setSelectedDrawing}
            theme={theme}
          />
        ))}
      </div>
    </section>
  );
}

function BtcStopPlanStrip({ btcPrice, onResetPlan, tradePlan, trackedPlan }) {
  const activeStop = Number.isFinite(trackedPlan?.stop) ? trackedPlan.stop : tradePlan.stop;
  const shouldShowStop = Boolean(trackedPlan?.entryLow || tradePlan.shouldTrack);
  const displayStop = shouldShowStop ? activeStop : null;
  const entryLow = Number.isFinite(trackedPlan?.entryLow) ? trackedPlan.entryLow : tradePlan.entryLow;
  const entryHigh = Number.isFinite(trackedPlan?.entryHigh) ? trackedPlan.entryHigh : tradePlan.entryHigh;
  const hasEntry = Number.isFinite(trackedPlan?.entryLow) && Number.isFinite(trackedPlan?.entryHigh);
  const entryLabel = Number.isFinite(entryLow) && Number.isFinite(entryHigh)
    ? `${formatPrice(entryLow)} - ${formatPrice(entryHigh)}`
    : "Aguardando setup";
  const distanceToPrice = Number.isFinite(displayStop) && Number.isFinite(btcPrice)
    ? ((btcPrice - displayStop) / btcPrice) * 100
    : null;
  const protectedFromEntry = hasEntry && Number.isFinite(displayStop) && Number.isFinite(trackedPlan.entryHigh)
    ? ((displayStop - trackedPlan.entryHigh) / trackedPlan.entryHigh) * 100
    : null;
  const status = getBtcPlanStatus(hasEntry, displayStop, trackedPlan?.entryHigh, protectedFromEntry, tradePlan);

  return (
    <section className="btc-plan-strip" aria-label="Plano BTC de stop movel">
      <div className="btc-plan-main">
        <div>
          <p className="eyebrow">Plano BTC</p>
          <strong>{status}</strong>
        </div>
        <BtcPlanMetric label={hasEntry ? "Entrada travada" : "Entrada sugerida"} value={entryLabel} />
        <BtcPlanMetric label={hasEntry ? "Stop movel" : "Stop inicial"} value={formatPrice(displayStop)} highlight />
        <BtcPlanMetric label="Distancia" value={formatPercent(distanceToPrice)} />
        <BtcPlanMetric
          label={Number.isFinite(protectedFromEntry) && protectedFromEntry >= 0 ? "Lucro protegido" : "Risco restante"}
          value={hasEntry ? formatPercent(protectedFromEntry) : "-"}
          intent={Number.isFinite(protectedFromEntry) && protectedFromEntry >= 0 ? "success" : "danger"}
        />
      </div>

      <div className="btc-plan-actions">
        {hasEntry ? (
          <button type="button" className="ghost" onClick={onResetPlan}>
            Reiniciar plano
          </button>
        ) : null}
      </div>
    </section>
  );
}

function BtcPlanMetric({ highlight = false, intent, label, value }) {
  const className = ["btc-plan-metric", highlight ? "highlight" : "", intent || ""].filter(Boolean).join(" ");
  return (
    <span className={className}>
      {label}
      <strong>{value}</strong>
    </span>
  );
}

function BtcQuadChart({ activeTool, candles, clearSignal, config, error, isCompact, selectedDrawing, setSelectedDrawing, theme }) {
  const containerRef = useRef(null);
  const overlayRef = useRef(null);
  const chartRef = useRef(null);
  const priceSeriesRef = useRef(null);
  const fastLineRef = useRef(null);
  const slowLineRef = useRef(null);
  const renkoEmaLineRef = useRef(null);
  const renkoVwmaLineRef = useRef(null);
  const dpoSeriesRef = useRef(null);
  const centeredOnceRef = useRef(false);
  const lastHandledClearSignalRef = useRef(0);
  const activeToolRef = useRef(activeTool);
  const drawingsRef = useRef([]);
  const chartMetaRef = useRef(null);
  const [drawings, setDrawings] = useState(() => readStoredQuadDrawings(config.id));
  const [draftDrawing, setDraftDrawing] = useState(null);
  const [drawingContext, setDrawingContext] = useState({ chart: null, series: null });
  const [pricePaneHeight, setPricePaneHeight] = useState(null);
  const [, forceOverlayUpdate] = useState(0);
  const palette = useMemo(() => getPalette(theme), [theme]);
  const chartData = useMemo(() => toChartCandles(candles), [candles]);
  const bandFillData = useMemo(() => toChartBandLinesFromBars(chartData, BTC_BB_PERIOD, BTC_BB_MULTIPLIER), [chartData]);
  const chartMeta = useMemo(() => buildChartMeta(chartData, config.fallbackSeconds, "candles"), [chartData, config.fallbackSeconds]);

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

    const renkoEmaLine = chart.addSeries(LineSeries, {
      color: palette.ema,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: !isCompact,
      title: "",
    });
    const renkoVwmaLine = chart.addSeries(LineSeries, {
      color: "#e879f9",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: !isCompact,
      title: "",
    });

    const dpoSeries = chart.addSeries(
      LineSeries,
      {
        title: "",
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
    dpoSeries?.createPriceLine({
      price: 0,
      color: "rgba(168, 179, 199, 0.55)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: false,
      title: "",
    });
    chart.panes()[0]?.setStretchFactor(4);
    chart.panes()[1]?.setStretchFactor(1);

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
    slowLineRef.current = slowLine;
    renkoEmaLineRef.current = renkoEmaLine;
    renkoVwmaLineRef.current = renkoVwmaLine;
    dpoSeriesRef.current = dpoSeries;
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
    observer.observe(containerRef.current);
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      forceOverlayUpdate((value) => value + 1);
    });
    chart.subscribeClick(handleChartClick);
    window.requestAnimationFrame(syncPaneHeight);

    return () => {
      observer.disconnect();
      chart.unsubscribeClick(handleChartClick);
      chart.remove();
      chartRef.current = null;
      priceSeriesRef.current = null;
      fastLineRef.current = null;
      slowLineRef.current = null;
      renkoEmaLineRef.current = null;
      renkoVwmaLineRef.current = null;
      dpoSeriesRef.current = null;
      setDrawingContext({ chart: null, series: null });
      centeredOnceRef.current = false;
    };
  }, [config.id, isCompact, palette, setSelectedDrawing]);

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

    priceSeriesRef.current.setData(chartData);

    fastLineRef.current?.setData(bandFillData?.upper || []);
    slowLineRef.current?.setData(bandFillData?.lower || []);
    renkoEmaLineRef.current?.setData(toChartLineEma(chartData, BTC_QUAD_EMA_PERIOD));
    renkoVwmaLineRef.current?.setData(toChartLineVwma(chartData, BTC_QUAD_VWMA_PERIOD));
    dpoSeriesRef.current?.setData(toChartDpoFromBars(chartData, BTC_DPO_PERIOD));

    if (chartData.length > 0 && !centeredOnceRef.current) {
      showRecentBars(chartRef.current, 150, chartData.length);
      centeredOnceRef.current = true;
    }
  }, [bandFillData, chartData]);

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

  const legends = [`BB ${BTC_BB_PERIOD}`, `EMA ${BTC_QUAD_EMA_PERIOD}`, `VWMA ${BTC_QUAD_VWMA_PERIOD}`, `DPO ${BTC_DPO_PERIOD}`];

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
          <BollingerBandFill
            chart={drawingContext.chart}
            chartMeta={chartMeta}
            lower={bandFillData?.lower}
            series={drawingContext.series}
            upper={bandFillData?.upper}
          />
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

function buildBtcTradePlan(chartCandles, btcPrice) {
  const btc1hCandles = chartCandles["candles-1h"] || [];
  const btc4hCandles = chartCandles["candles-4h"] || [];
  const frame1h = getCandleFrameState(btc1hCandles);
  const frame4h = getCandleFrameState(btc4hCandles);
  const setupStrength = [frame1h.confirmed, frame4h.confirmed, frame1h.dpoTurningUp, !frame4h.bearish].filter(Boolean).length;
  const shouldTrack = frame1h.confirmed && !frame4h.bearish && (frame1h.dpoTurningUp || frame4h.confirmed);
  const scenario = getTradeScenario({ setupStrength, frame1h, frame4h });
  const entry = buildEntryZone({ btcPrice, frame1h, shouldTrack });
  const buffer = getStopBuffer(btcPrice);
  const stopCandidates = [
    buildStopCandidate(frame1h.lowerBand, buffer, btcPrice),
    buildStopCandidate(getRecentCandleLow(btc1hCandles), buffer, btcPrice),
    buildStopCandidate(getRecentCandleLow(btc4hCandles), buffer, btcPrice),
  ].filter(Boolean);
  const stop = stopCandidates.length ? Math.max(...stopCandidates) : null;

  return {
    entryHigh: entry.high,
    entryLow: entry.low,
    scenario,
    shouldTrack,
    stop,
  };
}

function buildStopCandidate(level, buffer, btcPrice) {
  if (!Number.isFinite(level) || !Number.isFinite(buffer)) return null;
  const stop = level - buffer;
  if (Number.isFinite(btcPrice) && stop >= btcPrice) return null;
  return stop;
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

function toChartLineVwma(bars, period) {
  if (!Array.isArray(bars) || bars.length < period) return [];

  return bars
    .map((bar, index) => {
      if (index < period - 1) return null;

      const window = bars.slice(index - period + 1, index + 1);
      const volumeSum = window.reduce((sum, item) => sum + (Number.isFinite(item.volume) ? item.volume : 0), 0);
      if (!volumeSum) return null;

      const value = window.reduce((sum, item) => {
        const close = Number.isFinite(item.close) ? item.close : 0;
        const volume = Number.isFinite(item.volume) ? item.volume : 0;
        return sum + close * volume;
      }, 0) / volumeSum;

      return {
        time: bar.time,
        value,
      };
    })
    .filter(Boolean);
}

function getCandleFrameState(candles) {
  const last = candles.at(-1);
  const ema = toChartEma(candles, BTC_QUAD_EMA_PERIOD).at(-1)?.value;
  const vwma = toChartVwma(candles, BTC_QUAD_VWMA_PERIOD).at(-1)?.value;
  const chartCandles = toChartCandles(candles);
  const bands = toChartBandLinesFromBars(chartCandles, BTC_BB_PERIOD, BTC_BB_MULTIPLIER);
  const dpo = toChartDpoFromBars(chartCandles, BTC_DPO_PERIOD);
  const latestDpo = dpo.at(-1)?.value;
  const previousDpo = dpo.at(-4)?.value ?? dpo.at(-2)?.value;
  const price = last?.close;
  const aboveEma = Number.isFinite(price) && Number.isFinite(ema) && price >= ema;
  const aboveVwma = Number.isFinite(price) && Number.isFinite(vwma) && price >= vwma;
  const belowBoth = Number.isFinite(price) && Number.isFinite(ema) && Number.isFinite(vwma) && price < ema && price < vwma;
  const lowerBand = bands.lower.at(-1)?.value;
  const upperBand = bands.upper.at(-1)?.value;
  const nearLowerBand = Number.isFinite(price) && Number.isFinite(lowerBand) && price <= lowerBand * 1.006;
  const dpoTurningUp = Number.isFinite(latestDpo) && Number.isFinite(previousDpo) && latestDpo > previousDpo;

  return {
    aboveEma,
    aboveVwma,
    bearish: belowBoth,
    confirmed: (aboveEma || aboveVwma || nearLowerBand) && dpoTurningUp,
    dpoTurningUp,
    ema,
    lowerBand,
    nearLowerBand,
    price,
    upperBand,
    vwma,
  };
}

function getTradeScenario({ setupStrength, frame1h, frame4h }) {
  if (frame1h.confirmed && frame4h.confirmed && !frame1h.bearish && !frame4h.bearish) return "Compra forte";
  if (frame1h.confirmed && !frame4h.bearish) return "Compra inicial";
  if (frame4h.bearish && frame1h.bearish) return "Evitar compra";
  if (setupStrength >= 2) return "Aguardar pullback";
  return "Aguardar";
}

function buildEntryZone({ btcPrice, frame1h, shouldTrack }) {
  if (!shouldTrack) return { high: null, low: null, reference: null };
  if (!Number.isFinite(btcPrice)) return { high: null, low: null, reference: null };
  const references = [
    frame1h.nearLowerBand ? frame1h.lowerBand : null,
    frame1h.aboveVwma ? frame1h.vwma : null,
    frame1h.aboveEma ? frame1h.ema : null,
    frame1h.price,
  ].filter(Number.isFinite);
  const reference = references.length ? Math.max(...references.filter((value) => value <= btcPrice * 1.006)) : btcPrice;
  const width = Math.max(15, btcPrice * (shouldTrack ? 0.0018 : 0.0012));
  const low = Math.min(reference, btcPrice) - width * 0.45;
  const high = Math.max(reference, btcPrice) + width * 0.25;
  return { high, low };
}

function getRecentCandleLow(candles) {
  const recentCandles = candles
    .filter((candle) => candle && candle.closed !== false && Number.isFinite(candle.low))
    .slice(-BTC_STOP_LOOKBACK_CANDLES);

  return getFiniteMin(recentCandles.map((candle) => candle.low));
}

function getFiniteMin(values) {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length === 0) return null;
  return Math.min(...finiteValues);
}

function getStopBuffer(price) {
  if (!Number.isFinite(price)) return 15;
  return Math.max(15, price * BTC_STOP_BUFFER_PERCENT);
}

function getBtcPlanStatus(hasEntry, activeStop, entryPrice, protectedFromEntry, tradePlan) {
  if (!hasEntry) return tradePlan.scenario;
  if (!Number.isFinite(activeStop)) return "Aguardando dados do stop";
  if (activeStop >= entryPrice) return "Stop em lucro, seguir tendencia";
  if (Number.isFinite(protectedFromEntry) && protectedFromEntry > -0.35) return "Risco bem reduzido";
  return `${trackedScenarioLabel(tradePlan.scenario)} com stop tecnico`;
}

function trackedScenarioLabel(scenario) {
  return scenario === "Compra forte" || scenario === "Compra inicial" ? scenario : "Plano ativo";
}

function readStoredBtcPlan() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(BTC_PLAN_STORAGE_KEY) || "null");
    if (!parsed || !Number.isFinite(parsed.entryLow) || !Number.isFinite(parsed.entryHigh)) return null;
    return {
      entryHigh: Number(parsed.entryHigh),
      entryLow: Number(parsed.entryLow),
      entryTime: Number(parsed.entryTime) || Date.now(),
      initialStop: Number.isFinite(parsed.initialStop) ? Number(parsed.initialStop) : null,
      scenario: typeof parsed.scenario === "string" ? parsed.scenario : null,
      stop: Number.isFinite(parsed.stop) ? Number(parsed.stop) : null,
      updatedAt: Number(parsed.updatedAt) || Date.now(),
    };
  } catch {
    return null;
  }
}

function writeStoredBtcPlan(plan) {
  try {
    if (!plan) {
      window.localStorage.removeItem(BTC_PLAN_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(BTC_PLAN_STORAGE_KEY, JSON.stringify(plan));
  } catch {
    // localStorage can fail in private modes; the open session still keeps the stop plan.
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
