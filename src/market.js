const REST_ENDPOINTS = [
  "https://api.binance.com/api/v3",
  "https://data-api.binance.vision/api/v3",
];

const LEVERAGED_PATTERN = /(UP|DOWN|BULL|BEAR|[0-9]+L|[0-9]+S)USDT$/;
const EXCLUDED_BASE_ASSETS = new Set([
  "U",
  "USDC",
  "FDUSD",
  "RLUSD",
  "PYUSD",
  "USD1",
  "USDE",
  "USDS",
  "TUSD",
  "USDP",
  "DAI",
  "EUR",
  "EURI",
  "AEUR",
  "BUSD",
  "WBTC",
  "WBETH",
  "USTC",
]);
const FIAT_OR_STABLE_PATTERN = /(USD|EUR|BRL|TRY|GBP|AUD|CAD|CHF|JPY|MXN|ARS|COP)$/;

export const DEFAULT_FILTERS = {
  universeSize: 120,
  minQuoteVolume: 0,
  maxSpreadPercent: Number.POSITIVE_INFINITY,
  autoRefresh: true,
};

export const BB_PERIOD = 137;
export const BB_MULTIPLIER = 1.001;
export const BB_OFFSET = -2;
export const RENKO_BOX_SIZE = 5;
export const MAX_RENKO_CHART_BRICKS = 5000;
export const BTC_DPO_PERIOD = 200;
export const BTC_QUAD_EMA_PERIOD = 450;
export const BTC_QUAD_VWMA_PERIOD = 850;
export const BTC_FAST_EMA_PERIOD = 200;
export const BTC_FAST_VWMA_PERIOD = 550;
export const BTC_OFFSET_MA_PERIOD = 50;
export const BTC_OFFSET_MA_OFFSET = 50;
export const BTC_ONE_MINUTE_EMA_PERIOD = 555;
export const BTC_ONE_MINUTE_VWMA_PERIOD = 1250;
export const BTC_ONE_MINUTE_EXTRA_VWMA_PERIOD = 7000;
export const BTC_ONE_MINUTE_BB_PERIOD = 8000;
export const BTC_ONE_MINUTE_BB_MULTIPLIER = 1.001;
export const BTC_RENKO_ONE_HOUR_VWMA_PERIOD = 1500;
export const BTC_RENKO_INTERVALS = {
  "15m": { interval: "15m", historyLimit: 3000, fallbackSeconds: 900, boxSize: 5 },
};
export const BTC_QUAD_CHARTS = [
  { id: "candles-1m", title: "BTC 1m", interval: "1m", historyLimit: 10000, fallbackSeconds: 60, type: "candles", bbMultiplier: BTC_ONE_MINUTE_BB_MULTIPLIER, bbPeriod: BTC_ONE_MINUTE_BB_PERIOD, extraVwmaPeriod: BTC_ONE_MINUTE_EXTRA_VWMA_PERIOD, showBollingerBands: true, showEma: false, vwmaPeriod: BTC_ONE_MINUTE_VWMA_PERIOD },
  { id: "candles-5m", title: "BTC 5m", interval: "5m", historyLimit: 1500, fallbackSeconds: 300, type: "candles", emaPeriod: BTC_FAST_EMA_PERIOD, vwmaPeriod: BTC_FAST_VWMA_PERIOD },
  { id: "candles-15m", title: "BTC 15m", interval: "15m", historyLimit: 1500, fallbackSeconds: 900, type: "candles" },
  { id: "renko-1h", title: "BTC Renko 1H", interval: "1h", historyLimit: 5000, fallbackSeconds: 3600, type: "renko", boxSize: 10, bbMultiplier: 2.001, showEma: false, visibleBars: 5000, vwmaPeriod: BTC_RENKO_ONE_HOUR_VWMA_PERIOD },
  { id: "candles-1h", title: "BTC 1H", interval: "1h", historyLimit: 1500, fallbackSeconds: 3600, type: "candles", maOffset: BTC_OFFSET_MA_OFFSET, maPeriod: BTC_OFFSET_MA_PERIOD },
  { id: "candles-4h", title: "BTC 4H", interval: "4h", historyLimit: 1500, fallbackSeconds: 14400, type: "candles" },
];
export const DEFAULT_BTC_RENKO_TIMEFRAME = "15m";
export const RENKO_INTERVAL = BTC_RENKO_INTERVALS[DEFAULT_BTC_RENKO_TIMEFRAME].interval;
export const RENKO_HISTORY_LIMIT = BTC_RENKO_INTERVALS[DEFAULT_BTC_RENKO_TIMEFRAME].historyLimit;
export const ALT_INTERVAL = "1h";
export const ALT_HISTORY_LIMIT = 600;
export const ALT_CHART_INTERVALS = {
  "1h": { interval: "1h", historyLimit: 1500, fallbackSeconds: 3600 },
  "4h": { interval: "4h", historyLimit: 900, fallbackSeconds: 14400 },
};
export const DEFAULT_ALT_CHART_TIMEFRAME = "1h";
export const ALT_FAST_EMA = 50;
export const ALT_SLOW_EMA = 450;
export const ADX_PERIOD = 14;
export const RELATIVE_LOOKBACK = 24;

function toQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, value);
    }
  });
  return query.toString();
}

export async function fetchBinance(path, params = {}, signal) {
  const query = toQuery(params);
  const urlPath = `${path}${query ? `?${query}` : ""}`;
  let lastError;

  for (const endpoint of REST_ENDPOINTS) {
    try {
      const response = await fetch(`${endpoint}${urlPath}`, { signal });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return response.json();
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw error;
    }
  }

  throw lastError || new Error("Nao foi possivel acessar a API publica da Binance.");
}

export async function loadTradableUniverse(filters, signal) {
  const [exchangeInfo, ticker24h] = await Promise.all([
    fetchBinance("/exchangeInfo", {}, signal),
    fetchBinance("/ticker/24hr", {}, signal),
  ]);

  const tradable = new Set(
    (exchangeInfo.symbols || [])
      .filter((item) => {
        return (
          item.status === "TRADING" &&
          item.quoteAsset === "USDT" &&
          item.isSpotTradingAllowed !== false &&
          !LEVERAGED_PATTERN.test(item.symbol) &&
          !item.symbol.includes("_") &&
          !EXCLUDED_BASE_ASSETS.has(item.baseAsset) &&
          !FIAT_OR_STABLE_PATTERN.test(item.baseAsset)
        );
      })
      .map((item) => item.symbol)
  );

  const universe = ticker24h
    .filter((item) => tradable.has(item.symbol))
    .map(normalizeTicker)
    .filter((item) => item.quoteVolume >= filters.minQuoteVolume)
    .filter((item) => item.spreadPercent <= filters.maxSpreadPercent)
    .sort((a, b) => b.quoteVolume - a.quoteVolume);

  return filters.universeSize > 0 ? universe.slice(0, filters.universeSize) : universe;
}

export async function fetchCandles(symbol, limit = RENKO_HISTORY_LIMIT, signal, interval = RENKO_INTERVAL) {
  const candles = [];
  let endTime;

  while (candles.length < limit) {
    const batchLimit = Math.min(1000, limit - candles.length);
    const rows = await fetchBinance(
      "/klines",
      {
        symbol,
        interval,
        limit: batchLimit,
        endTime,
      },
      signal
    );

    if (!Array.isArray(rows) || rows.length === 0) break;

    const batch = rows.map(normalizeCandle);
    candles.unshift(...batch);
    endTime = batch[0].openTime - 1;

    if (rows.length < batchLimit) break;
  }

  return candles.slice(-limit);
}

export async function scanMarket(filters, signal, onProgress) {
  const universe = (await loadTradableUniverse(filters, signal)).filter((ticker) => ticker.symbol !== "BTCUSDT");
  const btcCandles = await fetchCandles("BTCUSDT", ALT_HISTORY_LIMIT, signal, ALT_INTERVAL);
  const btcCloses = btcCandles.map((candle) => candle.close);
  const results = [];
  const batchSize = 10;

  for (let index = 0; index < universe.length; index += batchSize) {
    const batch = universe.slice(index, index + batchSize);
    const analyzed = await Promise.all(
      batch.map(async (ticker) => {
        try {
          return await buildSignal(ticker, btcCloses, signal);
        } catch {
          return null;
        }
      })
    );

    results.push(...analyzed.filter(Boolean));
    onProgress?.({
      checked: Math.min(index + batch.length, universe.length),
      total: universe.length,
    });
  }

  return results.filter((item) => item.trendDirection !== "neutral").sort(sortAltSignals);
}

export async function buildSignal(ticker, btcCloses, signal) {
  const candles = await fetchCandles(ticker.symbol, ALT_HISTORY_LIMIT, signal, ALT_INTERVAL);
  const closes = candles.map((candle) => candle.close);
  const ema50Series = calculateEMA(closes, ALT_FAST_EMA);
  const ema450Series = calculateEMA(closes, ALT_SLOW_EMA);
  const adxSeries = calculateADX(candles, ADX_PERIOD);
  const price = closes.at(-1);
  const ema50 = ema50Series.at(-1);
  const ema450 = ema450Series.at(-1);
  const adx = adxSeries.at(-1);

  if (!Number.isFinite(price) || !Number.isFinite(ema50) || !Number.isFinite(ema450)) {
    return null;
  }

  const trendDirection = getTrendDirection(price, ema50, ema450);
  const emaSpreadPercent = ((ema50 - ema450) / ema450) * 100;
  const priceDistancePercent = ((price - ema450) / ema450) * 100;
  const volumeRelative = calculateVolumeRelative(candles);
  const relativeToBtcPercent = calculateRelativePerformance(closes, btcCloses, RELATIVE_LOOKBACK);
  const isFlatMarket = isStableLikeMarket(candles);
  const trend = getAltTrendLabel(trendDirection, adx, emaSpreadPercent);

  return {
    ...ticker,
    price,
    ema50,
    ema450,
    emaSpreadPercent,
    priceDistancePercent,
    adx,
    volumeRelative,
    relativeToBtcPercent,
    relativeLabel: relativeToBtcPercent >= 0 ? "mais forte que BTC" : "mais fraca que BTC",
    trendDirection,
    trend,
    isFlatMarket,
    candlesLoaded: candles.length,
    lastCandleTime: candles.at(-1)?.openTime,
  };
}

export function mergeLiveCandle(candles, payload, limit = RENKO_HISTORY_LIMIT) {
  const kline = payload?.k;
  if (!kline) return candles;

  const next = normalizeCandle([
    kline.t,
    kline.o,
    kline.h,
    kline.l,
    kline.c,
    kline.v,
    kline.T,
    kline.q,
    kline.n,
  ]);
  next.closed = Boolean(kline.x);

  const current = candles || [];
  const last = current.at(-1);
  if (last?.openTime === next.openTime) {
    return [...current.slice(0, -1), next];
  }

  return [...current.slice(-(limit - 1)), next];
}

export function calculateEMA(values, period) {
  if (!Array.isArray(values) || values.length < period) return [];

  const multiplier = 2 / (period + 1);
  const result = Array(values.length).fill(null);
  let previous = average(values.slice(0, period));
  result[period - 1] = previous;

  for (let index = period; index < values.length; index += 1) {
    previous = (values[index] - previous) * multiplier + previous;
    result[index] = previous;
  }

  return result;
}

export function calculateADX(candles, period = ADX_PERIOD) {
  if (!Array.isArray(candles) || candles.length <= period * 2) return [];

  const trueRanges = [];
  const plusDm = [];
  const minusDm = [];

  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index];
    const previous = candles[index - 1];
    const upMove = current.high - previous.high;
    const downMove = previous.low - current.low;

    trueRanges.push(Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    ));
    plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  const result = Array(candles.length).fill(null);
  const dxValues = [];

  for (let index = period - 1; index < trueRanges.length; index += 1) {
    const tr = average(trueRanges.slice(index - period + 1, index + 1));
    if (!tr) {
      dxValues.push(null);
      continue;
    }

    const plusDi = 100 * (average(plusDm.slice(index - period + 1, index + 1)) / tr);
    const minusDi = 100 * (average(minusDm.slice(index - period + 1, index + 1)) / tr);
    const dx = plusDi + minusDi ? (Math.abs(plusDi - minusDi) / (plusDi + minusDi)) * 100 : 0;
    dxValues.push(dx);

    if (dxValues.length >= period) {
      result[index + 1] = average(dxValues.slice(-period).filter(Number.isFinite));
    }
  }

  return result;
}

export function buildRenkoBricks(candles, boxSize = RENKO_BOX_SIZE) {
  if (!Array.isArray(candles) || candles.length === 0 || boxSize <= 0) return [];

  const bricks = [];
  let anchorClose = candles[0].close;
  let lastChartTime = Math.floor(candles[0].openTime / 1000);

  for (const candle of candles.slice(1)) {
    const close = candle.close;
    if (!Number.isFinite(close)) continue;

    let diff = close - anchorClose;
    let bricksInCandle = 0;
    const bricksToBuild = Math.floor(Math.abs(diff) / boxSize);
    const candleVolume = Number.isFinite(candle.volume) ? candle.volume : 0;
    const volumePerBrick = bricksToBuild > 0 ? candleVolume / bricksToBuild : 0;

    while (Math.abs(diff) >= boxSize) {
      const direction = diff > 0 ? 1 : -1;
      const open = anchorClose;
      const brickClose = anchorClose + direction * boxSize;
      const sourceTime = Math.floor(candle.openTime / 1000);
      lastChartTime = Math.max(lastChartTime + 1, sourceTime + bricksInCandle);

      bricks.push({
        openTime: lastChartTime * 1000,
        sourceOpenTime: candle.openTime,
        projected: candle.closed === false,
        volume: volumePerBrick,
        open,
        high: Math.max(open, brickClose),
        low: Math.min(open, brickClose),
        close: brickClose,
        direction,
      });

      anchorClose = brickClose;
      diff = close - anchorClose;
      bricksInCandle += 1;
    }
  }

  return bricks;
}

export function calculateBollingerBands(values, period = BB_PERIOD, multiplier = BB_MULTIPLIER) {
  if (!Array.isArray(values) || values.length < period) return [];

  return values.map((value, index) => {
    if (!Number.isFinite(value) || index < period - 1) return null;

    const window = values.slice(index - period + 1, index + 1);
    const middle = average(window);
    const variance = average(window.map((item) => (item - middle) ** 2));
    const deviation = Math.sqrt(variance);

    return {
      middle,
      upper: middle + deviation * multiplier,
      lower: middle - deviation * multiplier,
    };
  });
}

export function toChartCandles(candles) {
  return candles.map((candle) => ({
    time: Math.floor(candle.openTime / 1000),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  }));
}

export function toChartEma(candles, period) {
  const ema = calculateEMA(
    candles.map((candle) => candle.close),
    period
  );

  return candles
    .map((candle, index) => ({
      time: Math.floor(candle.openTime / 1000),
      value: ema[index],
    }))
    .filter((item) => Number.isFinite(item.value));
}

export function toChartVwma(candles, period = BTC_QUAD_VWMA_PERIOD) {
  if (!Array.isArray(candles) || candles.length < period) return [];

  return candles
    .map((candle, index) => {
      if (index < period - 1) return null;

      const window = candles.slice(index - period + 1, index + 1);
      const volumeSum = window.reduce((sum, item) => sum + (Number.isFinite(item.volume) ? item.volume : 0), 0);
      if (!volumeSum) return null;

      const value = window.reduce((sum, item) => {
        const close = Number.isFinite(item.close) ? item.close : 0;
        const volume = Number.isFinite(item.volume) ? item.volume : 0;
        return sum + close * volume;
      }, 0) / volumeSum;

      return {
        time: Math.floor(candle.openTime / 1000),
        value,
      };
    })
    .filter(Boolean);
}

export function toChartRenko(candles, boxSize = RENKO_BOX_SIZE) {
  return buildRenkoBricks(candles, boxSize).slice(-MAX_RENKO_CHART_BRICKS).map((brick) => ({
    time: Math.floor(brick.openTime / 1000),
    open: brick.open,
    high: brick.high,
    low: brick.low,
    close: brick.close,
    volume: brick.volume,
    ...(brick.projected ? getProjectedRenkoColors(brick.direction) : {}),
  }));
}

export function toChartBollingerBands(candles, boxSize = RENKO_BOX_SIZE, period = BB_PERIOD, multiplier = BB_MULTIPLIER) {
  const bricks = toChartRenko(candles, boxSize);
  const bands = calculateBollingerBands(
    bricks.map((brick) => brick.close),
    period,
    multiplier
  );

  return {
    upper: toChartBandLine(bricks, bands, "upper"),
    middle: toChartBandLine(bricks, bands, "middle"),
    lower: toChartBandLine(bricks, bands, "lower"),
  };
}

export function toChartDpoFromBars(bars, period = BTC_DPO_PERIOD) {
  if (!Array.isArray(bars) || bars.length < period) return [];

  const closes = bars.map((bar) => bar.close);
  const sma = calculateSMA(closes, period);
  const displacement = Math.floor(period / 2) + 1;

  return bars
    .map((bar, index) => {
      const smaIndex = index - displacement;
      if (smaIndex < period - 1) return null;

      const value = bar.close - sma[smaIndex];
      if (!Number.isFinite(value)) return null;

      return {
        time: bar.time,
        value,
      };
    })
    .filter(Boolean);
}

export function getLatestBollingerStats(candles, boxSize = RENKO_BOX_SIZE) {
  const bricks = toChartRenko(candles, boxSize);
  const bands = calculateBollingerBands(
    bricks.map((brick) => brick.close),
    BB_PERIOD,
    BB_MULTIPLIER
  );
  const dpo = toChartDpoFromBars(bricks, BTC_DPO_PERIOD).at(-1);
  const latestBrick = bricks.at(-1);
  const latestBand = bands.at(-1);
  const previousBrick = bricks.at(-2);

  if (!latestBrick || !latestBand) {
    return {
      price: latestBrick?.close,
      upperBand: null,
      middleBand: null,
      lowerBand: null,
      distance: null,
      change: null,
      dpo200: dpo?.value ?? null,
      bricksCount: bricks.length,
    };
  }

  const activeBand = latestBrick.close < latestBand.lower ? latestBand.lower : latestBrick.close > latestBand.upper ? latestBand.upper : latestBand.middle;

  return {
    price: latestBrick.close,
    upperBand: latestBand.upper,
    middleBand: latestBand.middle,
    lowerBand: latestBand.lower,
    distance: activeBand ? ((latestBrick.close - activeBand) / activeBand) * 100 : null,
    change: previousBrick ? ((latestBrick.close - previousBrick.close) / previousBrick.close) * 100 : null,
    dpo200: dpo?.value ?? null,
    bricksCount: bricks.length,
  };
}

export function getLatestAltChartStats(candles) {
  const last = candles.at(-1);
  const previous = candles.at(-2);
  const ema50 = calculateEMA(
    candles.map((candle) => candle.close),
    ALT_FAST_EMA
  ).at(-1);
  const ema450 = calculateEMA(
    candles.map((candle) => candle.close),
    ALT_SLOW_EMA
  ).at(-1);
  const distance = last && ema450 ? ((last.close - ema450) / ema450) * 100 : null;
  const change = last && previous ? ((last.close - previous.close) / previous.close) * 100 : null;

  return {
    price: last?.close,
    ema50,
    ema450,
    distance,
    change,
  };
}

export function formatPrice(value) {
  if (!Number.isFinite(value)) return "-";
  if (value >= 1000) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (value >= 1) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 8 })}`;
}

export function formatPercent(value, digits = 2) {
  if (!Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatCompactUsd(value) {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatIndicator(value) {
  if (!Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : "";
  const abs = Math.abs(value);
  if (abs >= 1000) return `${sign}${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (abs >= 1) return `${sign}${value.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  return `${sign}${value.toLocaleString("en-US", { maximumFractionDigits: 8 })}`;
}

export function formatClock(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function buildSocketUrl(symbol, interval = RENKO_INTERVAL) {
  return `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`;
}

function normalizeTicker(item) {
  const symbol = item.symbol;
  const bid = Number(item.bidPrice);
  const ask = Number(item.askPrice);
  const lastPrice = Number(item.lastPrice);
  const spreadPercent = bid > 0 && ask > 0 && lastPrice > 0 ? ((ask - bid) / lastPrice) * 100 : 0;

  return {
    symbol,
    baseAsset: symbol.replace(/USDT$/, ""),
    lastPrice,
    quoteVolume: Number(item.quoteVolume),
    priceChangePercent: Number(item.priceChangePercent),
    highPrice: Number(item.highPrice),
    lowPrice: Number(item.lowPrice),
    spreadPercent,
  };
}

function normalizeCandle(row) {
  const closeTime = Number(row[6]);

  return {
    openTime: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
    closeTime,
    quoteVolume: Number(row[7]),
    trades: Number(row[8]),
    closed: Number.isFinite(closeTime) ? closeTime <= Date.now() : true,
  };
}

function getProjectedRenkoColors(direction) {
  if (direction > 0) {
    return {
      color: "rgba(111, 216, 164, 0.36)",
      borderColor: "rgba(111, 216, 164, 0.72)",
      wickColor: "rgba(111, 216, 164, 0.52)",
    };
  }

  return {
    color: "rgba(255, 132, 132, 0.34)",
    borderColor: "rgba(255, 132, 132, 0.72)",
    wickColor: "rgba(255, 132, 132, 0.52)",
  };
}

function toChartBandLine(bricks, bands, key) {
  return bands
    .map((band, index) => {
      if (!band || !Number.isFinite(band[key])) return null;

      const targetIndex = index + BB_OFFSET;
      const targetBrick = bricks[targetIndex];
      if (!targetBrick) return null;

      return {
        time: targetBrick.time,
        value: band[key],
      };
    })
    .filter(Boolean);
}

function getTrendDirection(price, ema50, ema450) {
  if (!Number.isFinite(price) || !Number.isFinite(ema50) || !Number.isFinite(ema450)) return "neutral";
  if (price >= ema450) return "bullish";
  return "bearish";
}

function getAltTrendLabel(direction, adx, emaSpreadPercent) {
  if (direction === "neutral") return "lateral";
  const aligned = direction === "bullish" ? emaSpreadPercent >= 0 : emaSpreadPercent < 0;
  if (!aligned) return direction === "bullish" ? "acima da EMA" : "abaixo da EMA";

  const strength = adx >= 25 ? "forte" : "fraca";
  return direction === "bullish" ? `alta ${strength}` : `baixa ${strength}`;
}

function calculateVolumeRelative(candles, period = 20) {
  if (!Array.isArray(candles) || candles.length <= period) return null;

  const last = candles.at(-1)?.quoteVolume;
  const previous = candles.slice(-(period + 1), -1).map((candle) => candle.quoteVolume);
  const baseline = average(previous);
  return Number.isFinite(last) && baseline > 0 ? last / baseline : null;
}

function calculateRelativePerformance(closes, btcCloses, lookback) {
  if (!Array.isArray(closes) || !Array.isArray(btcCloses) || closes.length <= lookback || btcCloses.length <= lookback) return null;

  const altNow = closes.at(-1);
  const altPast = closes.at(-1 - lookback);
  const btcNow = btcCloses.at(-1);
  const btcPast = btcCloses.at(-1 - lookback);

  if (!altPast || !btcPast) return null;

  const altChange = (altNow - altPast) / altPast;
  const btcChange = (btcNow - btcPast) / btcPast;
  return (altChange - btcChange) * 100;
}

function sortAltSignals(a, b) {
  if (a.trendDirection !== b.trendDirection) return a.trendDirection === "bearish" ? -1 : 1;
  if (a.trendDirection === "bullish") return b.emaSpreadPercent - a.emaSpreadPercent;
  return a.emaSpreadPercent - b.emaSpreadPercent;
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (valid.length === 0) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function calculateSMA(values, period) {
  if (!Array.isArray(values) || values.length < period) return [];

  const result = Array(values.length).fill(null);
  let sum = 0;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    sum += Number.isFinite(value) ? value : 0;

    if (index >= period) {
      const dropped = values[index - period];
      sum -= Number.isFinite(dropped) ? dropped : 0;
    }

    if (index >= period - 1) {
      result[index] = sum / period;
    }
  }

  return result;
}

function isStableLikeMarket(candles) {
  const recent = candles.slice(-240);
  if (recent.length < 120) return false;

  const closes = recent.map((candle) => candle.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const last = closes.at(-1);
  if (!Number.isFinite(last) || last <= 0) return false;

  const rangePercent = ((max - min) / last) * 100;
  const closeToOneDollar = last > 0.985 && last < 1.015;
  return closeToOneDollar && rangePercent < 2.5;
}
