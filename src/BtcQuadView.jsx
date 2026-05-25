import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  LineSeries,
  LineStyle,
} from "lightweight-charts";
import { X } from "lucide-react";
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

export default function BtcQuadView({ onClose, theme }) {
  const [chartCandles, setChartCandles] = useState(() => ({}));
  const [errors, setErrors] = useState(() => ({}));
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
    <section className="btc-quad-overlay" aria-label="Quatro graficos do BTC">
      <header className="btc-quad-topbar">
        <div>
          <p className="eyebrow">BTC 4 Graf.</p>
          <h2>BTCUSDT</h2>
        </div>
        <div className="btc-quad-actions">
          <span className="btc-quad-price">{formatPrice(btcPrice)}</span>
          <button className="btc-quad-close" type="button" onClick={onClose} aria-label="Fechar BTC 4 Graf.">
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="btc-quad-grid">
        {BTC_QUAD_CHARTS.map((config) => (
          <BtcQuadChart
            key={config.id}
            candles={chartCandles[config.id] || []}
            config={config}
            error={errors[config.id]}
            isCompact={isCompact}
            theme={theme}
          />
        ))}
      </div>
    </section>
  );
}

function BtcQuadChart({ candles, config, error, isCompact, theme }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const priceSeriesRef = useRef(null);
  const fastLineRef = useRef(null);
  const slowLineRef = useRef(null);
  const dpoSeriesRef = useRef(null);
  const centeredOnceRef = useRef(false);
  const palette = useMemo(() => getPalette(theme), [theme]);
  const isRenko = config.type === "renko";
  const chartData = useMemo(() => (isRenko ? toChartRenko(candles, RENKO_BOX_SIZE) : toChartCandles(candles)), [candles, isRenko]);

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
    chart.middleLine = middleLine;

    const observer = new ResizeObserver(() => chart.applyOptions({ autoSize: true }));
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      priceSeriesRef.current = null;
      fastLineRef.current = null;
      slowLineRef.current = null;
      dpoSeriesRef.current = null;
      centeredOnceRef.current = false;
    };
  }, [isCompact, isRenko, palette]);

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

  const legends = isRenko
    ? [`BB ${BB_PERIOD}`, `DPO ${BTC_DPO_PERIOD}`]
    : [`EMA ${BTC_QUAD_EMA_PERIOD}`, `VWMA ${BTC_QUAD_VWMA_PERIOD}`, `DPO ${BTC_QUAD_DPO_PERIOD}`];

  return (
    <article className="btc-quad-card">
      <div className="btc-quad-card-header">
        <strong>{config.title}</strong>
        <span>{legends.join(" / ")}</span>
      </div>
      <div className="btc-quad-canvas" ref={containerRef} />
      {error ? <div className="btc-quad-error">{error}</div> : null}
      {!error && candles.length === 0 ? <div className="btc-quad-loading">Carregando...</div> : null}
    </article>
  );
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
