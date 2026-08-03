const REST_ENDPOINTS = [
  "https://api.binance.com/api/v3",
  "https://data-api.binance.vision/api/v3",
];
const COINMARKETCAP_PROXY_ENDPOINT = "/api/coinmarketcap";
const COINMARKETCAP_DIRECT_ENDPOINT = "https://pro-api.coinmarketcap.com/public-api/v3/cryptocurrency/listings/latest";
const KUCOIN_PROXY_ENDPOINT = "/api/kucoin";
const KUCOIN_DIRECT_ENDPOINT = "https://api.kucoin.com/api/v1/market";
const HYPE_SYMBOL = "HYPEUSDC";
const HYPE_KUCOIN_SYMBOL = "HYPE-USDC";
const KUCOIN_CANDLE_BATCH_LIMIT = 1500;
const INTERVAL_SECONDS = { "15m": 15 * 60, "1h": 60 * 60, "1M": 30 * 24 * 60 * 60 };
const KUCOIN_INTERVAL_TYPES = { "15m": "15min", "1h": "1hour", "1M": "1month" };

const ALT_QUOTE_PRIORITY = ["USDT", "USDC"];
const CMC_EXCLUDED_BASE_ASSETS = new Set(["U", "USD1", "USDE", "USDC", "USDT", "RLUSD", "TUSD"]);

export const DEFAULT_FILTERS = {
  universeSize: 150,
  autoRefresh: true,
};

export const BB_PERIOD = 137;
export const BB_MULTIPLIER = 1.001;
export const BB_OFFSET = -2;
export const RENKO_BOX_SIZE = 5;
export const MAX_RENKO_CHART_BRICKS = 14000;
export const BTC_DPO_PERIOD = 200;
export const BTC_QUAD_EMA_PERIOD = 450;
export const BTC_QUAD_VWMA_PERIOD = 850;
export const BTC_FAST_EMA_PERIOD = 200;
export const BTC_FAST_VWMA_PERIOD = 550;
export const BTC_SLOW_FAST_EMA_PERIOD = 50;
export const BTC_SLOW_FAST_EMA_OFFSET = 12;
export const BTC_SLOW_VWMA_PERIOD = 190;
export const BTC_SLOW_EMA_PERIOD = 450;
export const BTC_SLOW_SETUP_BB_PERIOD = 8000;
export const BTC_SLOW_SETUP_BB_MULTIPLIER = 3.001;
export const BTC_ONE_HOUR_SETUP_BB_MULTIPLIER = 3;
export const BTC_SLOW_SETUP_LSMA_PERIOD = 3800;
export const BTC_ONE_SECOND_VWMA_PERIOD = 9000;
export const BTC_ONE_SECOND_MA_PERIOD = 450;
export const BTC_ONE_SECOND_MA_OFFSET = 40;
export const BTC_ONE_SECOND_BB_PERIOD = 8000;
export const BTC_ONE_SECOND_SECONDARY_BB_PERIOD = 10000;
export const BTC_ONE_SECOND_BB_MULTIPLIER = 2.001;
export const BTC_ONE_SECOND_SECONDARY_BB_MULTIPLIER = 1.001;
export const BTC_ONE_SECOND_THIRD_BB_MULTIPLIER = 3;
export const BTC_ONE_MINUTE_EMA_PERIOD = 555;
export const BTC_ONE_MINUTE_BB_PERIOD = 2000;
export const BTC_ONE_MINUTE_BB_MULTIPLIER = 1;
export const BTC_RENKO_ONE_HOUR_VWMA_PERIOD = 1500;
export const BTC_RENKO_THIRTY_MINUTE_BOX_SIZE = 1;
export const BTC_RENKO_INTERVALS = {
  "15m": { interval: "15m", historyLimit: 3000, fallbackSeconds: 900, boxSize: 5 },
};
export const BTC_QUAD_CHARTS = [
  { id: "renko-4h", title: "BTC Renko 4H", interval: "4h", historyLimit: 3000, fallbackSeconds: 14400, type: "renko", boxSize: BTC_RENKO_THIRTY_MINUTE_BOX_SIZE, extraBollingerBands: [{ color: "#38bdf8", middleColor: "#ffffff", period: 8000, multiplier: 2, showMiddle: true }], projectedDownColor: "#f59e0b", projectedUpColor: "#38bdf8", showBollingerBands: false, showEma: false, showVwma: false, visibleBars: 700 },
  { id: "renko-30m", title: "BTC Renko 15m", interval: "15m", historyLimit: 3000, fallbackSeconds: 900, type: "renko", boxSize: BTC_RENKO_THIRTY_MINUTE_BOX_SIZE, extraBollingerBands: [{ color: "#38bdf8", middleColor: "#ffffff", period: 8000, multiplier: 2, showMiddle: true }], projectedDownColor: "#f59e0b", projectedUpColor: "#38bdf8", showBollingerBands: false, showEma: false, showVwma: false, visibleBars: 700 },
  { id: "candles-15m-lsma", title: "BTC 15m", interval: "15m", historyLimit: 3000, fallbackSeconds: 900, type: "candles", maPeriod: 800, extraLsmaPeriod: 1700, pivots: { type: "woodie", timeframe: "monthly", periodsBack: 3, color: "#f59e0b" }, showBollingerBands: false, showEma: false, showVwma: false, visibleBars: 450 },
  { id: "candles-30m-lsma", title: "BTC 1H", interval: "1h", historyLimit: 4000, fallbackSeconds: 3600, type: "candles", maPeriod: 800, extraMaPeriods: [{ period: 30, color: "rgba(96, 165, 250, 0.4)" }], extraLsmaPeriod: 1700, pivots: { type: "woodie", timeframe: "monthly", periodsBack: 3, color: "#f59e0b" }, showBollingerBands: false, showEma: false, showVwma: false, visibleBars: 450 },
  { id: "candles-1s", title: "BTC 1s", interval: "1s", historyLimit: 11500, fallbackSeconds: 1, type: "candles", bbMultiplier: BTC_ONE_SECOND_BB_MULTIPLIER, bbPeriod: BTC_ONE_SECOND_BB_PERIOD, extraBollingerBands: [{ color: "#38bdf8", period: BTC_ONE_SECOND_SECONDARY_BB_PERIOD, multiplier: BTC_ONE_SECOND_SECONDARY_BB_MULTIPLIER }, { period: BTC_ONE_SECOND_BB_PERIOD, multiplier: BTC_ONE_SECOND_THIRD_BB_MULTIPLIER }], showBollingerBands: true, showEma: false, showVwma: false },
  { id: "candles-1m", title: "BTC 1m", interval: "1m", historyLimit: 10000, fallbackSeconds: 60, type: "candles", bbMultiplier: BTC_ONE_MINUTE_BB_MULTIPLIER, bbPeriod: BTC_ONE_MINUTE_BB_PERIOD, extraBollingerBands: [{ color: "#38bdf8", middleColor: "#ffffff", period: 3000, multiplier: 2, showMiddle: true }, { color: "#7c3aed", period: 4000, multiplier: 3 }], showBollingerBands: true, showEma: false, showVwma: false, stochRsi: { rsiPeriod: 100, stochPeriod: 300, smoothK: 50, smoothD: 15, showD: false } },
  { id: "candles-5m", title: "BTC 5m", interval: "5m", historyLimit: 1500, fallbackSeconds: 300, type: "candles", emaPeriod: BTC_FAST_EMA_PERIOD, vwmaPeriod: BTC_FAST_VWMA_PERIOD },
  { id: "candles-15m", title: "BTC 15m", interval: "15m", historyLimit: 16000, fallbackSeconds: 900, type: "candles", bbColor: "rgba(251, 191, 36, 0.55)", bbMultiplier: 1, bbPeriod: 2000, extraBollingerBands: [{ color: "#38bdf8", middleColor: "#ffffff", period: 3000, multiplier: 2, showMiddle: true }, { color: "#7c3aed", period: 4000, multiplier: 3 }], showBollingerBands: true, showEma: false, showVwma: false },
  { id: "candles-1h", title: "BTC 1H", interval: "1h", historyLimit: 16000, fallbackSeconds: 3600, type: "candles", bbMultiplier: BTC_ONE_HOUR_SETUP_BB_MULTIPLIER, bbPeriod: BTC_SLOW_SETUP_BB_PERIOD, extraBollingerBands: [{ color: "#38bdf8", period: 5000, multiplier: 2 }, { color: "rgba(251, 191, 36, 0.55)", period: 2400, multiplier: 1 }], maPeriod: 650, showBbMiddle: true, showBollingerBands: true, showEma: false, showVwma: false },
  { id: "candles-4h", title: "BTC 4H", interval: "4h", historyLimit: 1500, fallbackSeconds: 14400, type: "candles", emaOffset: 0, emaPeriod: BTC_SLOW_EMA_PERIOD, extraEmaOffset: BTC_SLOW_FAST_EMA_OFFSET, extraEmaPeriod: BTC_SLOW_FAST_EMA_PERIOD, extraVwmaPeriod: BTC_SLOW_VWMA_PERIOD, vwmaPeriod: BTC_QUAD_VWMA_PERIOD },
];
export const DEFAULT_BTC_RENKO_TIMEFRAME = "15m";
export const RENKO_INTERVAL = BTC_RENKO_INTERVALS[DEFAULT_BTC_RENKO_TIMEFRAME].interval;
export const RENKO_HISTORY_LIMIT = BTC_RENKO_INTERVALS[DEFAULT_BTC_RENKO_TIMEFRAME].historyLimit;
export const ALT_INTERVAL = "15m";
export const ALT_HISTORY_LIMIT = 3500;
export const ALT_CHART_INTERVALS = {
  "15m": { interval: "15m", historyLimit: 3500, fallbackSeconds: 900 },
};
export const ALT_CHART_VISIBLE_CANDLES = 3500;
export const DEFAULT_ALT_CHART_TIMEFRAME = "15m";
export const ALT_CHART_BB_PERIOD = 2000;
export const ALT_CHART_BB_MULTIPLIER = 1;
export const ALT_CHART_SECONDARY_BB_PERIOD = 3000;
export const ALT_CHART_SECONDARY_BB_MULTIPLIER = 2;
export const ALT_CHART_TERTIARY_BB_PERIOD = 4000;
export const ALT_CHART_TERTIARY_BB_MULTIPLIER = 3;
export const ALT_MA_PERIOD = 800;
export const ALT_SLOW_EMA = 450;
export const ALT_VWMA_PERIOD = 190;
export const ALT_LRC_PERIOD = 200;
export const ADX_PERIOD = 14;
export const RELATIVE_LOOKBACK = 96;
const ALT_PIVOT_PROXIMITY_PERCENT = 1;
const SCANNER_CANDLE_CACHE = new Map();
const SCANNER_MONTHLY_CANDLE_CACHE = new Map();

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

export async function fetchCoinMarketCapListings(limit = 150, signal) {
  const safeLimit = Math.min(Math.max(Number(limit) || 150, 1), 500);
  const query = toQuery({
    start: 1,
    limit: safeLimit,
    convert: "USD",
    sort: "market_cap",
    sort_dir: "desc",
  });
  const url = typeof window === "undefined"
    ? `${COINMARKETCAP_DIRECT_ENDPOINT}?${query}`
    : `${COINMARKETCAP_PROXY_ENDPOINT}?${query}`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

  const payload = await response.json();
  return Array.isArray(payload?.data) ? payload.data : [];
}

export async function loadTradableUniverse(filters, signal) {
  const universeSize = filters.universeSize > 0 ? filters.universeSize : 150;
  const cmcLimit = Math.min(universeSize + 50, 500);
  const [exchangeInfo, ticker24h, coinMarketCapListings, hypeTicker] = await Promise.all([
    fetchBinance("/exchangeInfo", {}, signal),
    fetchBinance("/ticker/24hr", {}, signal),
    fetchCoinMarketCapListings(cmcLimit, signal).catch(() => []),
    fetchKucoinTicker(signal).catch(() => null),
  ]);

  const tradableByBaseAsset = new Map();
  (exchangeInfo.symbols || [])
    .filter((item) => {
      return (
        item.status === "TRADING" &&
        ALT_QUOTE_PRIORITY.includes(item.quoteAsset) &&
        item.isSpotTradingAllowed !== false &&
        !item.symbol.includes("_")
      );
    })
    .forEach((item) => {
      const currentSymbol = tradableByBaseAsset.get(item.baseAsset);
      if (!currentSymbol || getQuotePriority(item.symbol) < getQuotePriority(currentSymbol)) {
        tradableByBaseAsset.set(item.baseAsset, item.symbol);
      }
    });

  const tickersBySymbol = new Map(ticker24h.map((item) => [item.symbol, item]));
  const tradableSymbols = new Set(tradableByBaseAsset.values());
  const rankedUniverse = getCoinMarketCapUniverse(coinMarketCapListings, tradableByBaseAsset, tickersBySymbol, hypeTicker);
  const fallbackSymbols = ticker24h
    .map((item) => item.symbol)
    .filter((symbol) => tradableSymbols.has(symbol) && !CMC_EXCLUDED_BASE_ASSETS.has(getBaseAssetFromSymbol(symbol)))
    .sort((a, b) => Number(tickersBySymbol.get(b)?.quoteVolume || 0) - Number(tickersBySymbol.get(a)?.quoteVolume || 0));
  const fallbackUniverse = fallbackSymbols.map((symbol) => normalizeTicker(tickersBySymbol.get(symbol)));

  const universe = rankedUniverse.length > 0 ? rankedUniverse : fallbackUniverse;

  return universe.slice(0, universeSize);
}

function getCoinMarketCapUniverse(coinMarketCapListings, tradableByBaseAsset, tickersBySymbol, hypeTicker) {
  if (!Array.isArray(coinMarketCapListings) || coinMarketCapListings.length === 0) return [];

  const seenSymbols = new Set();
  const universe = [];
  coinMarketCapListings.forEach((asset) => {
    const baseAsset = String(asset?.symbol || "").toUpperCase();
    if (!baseAsset || baseAsset === "BTC" || seenSymbols.has(baseAsset) || CMC_EXCLUDED_BASE_ASSETS.has(baseAsset)) {
      return;
    }

    seenSymbols.add(baseAsset);
    const cmcRank = Number(asset?.cmc_rank ?? asset?.rank ?? universe.length + 1);
    if (baseAsset === "HYPE" && hypeTicker) {
      universe.push({ ...hypeTicker, baseAsset, cmcRank });
      return;
    }

    const tradableSymbol = tradableByBaseAsset.get(baseAsset);
    const ticker = tradableSymbol ? tickersBySymbol.get(tradableSymbol) : null;
    if (ticker) {
      universe.push({ ...normalizeTicker(ticker), baseAsset, cmcRank });
      return;
    }

    universe.push({
      symbol: `${baseAsset}USDT`,
      baseAsset,
      cmcRank,
      quoteVolume: 0,
      lastPrice: 0,
      priceChangePercent: 0,
      spreadPercent: 0,
      unsupported: true,
    });
  });

  return universe;
}

function getQuotePriority(symbol) {
  const quoteIndex = ALT_QUOTE_PRIORITY.findIndex((quoteAsset) => symbol.endsWith(quoteAsset));
  return quoteIndex === -1 ? ALT_QUOTE_PRIORITY.length : quoteIndex;
}

function getBaseAssetFromSymbol(symbol) {
  const quoteAsset = ALT_QUOTE_PRIORITY.find((quote) => symbol.endsWith(quote));
  return quoteAsset ? symbol.slice(0, -quoteAsset.length) : symbol;
}

export async function fetchCandles(symbol, limit = RENKO_HISTORY_LIMIT, signal, interval = RENKO_INTERVAL) {
  if (symbol === HYPE_SYMBOL) {
    return fetchKucoinCandles(limit, signal, interval);
  }

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
  pruneScannerCandleCache(new Set(universe.map((ticker) => ticker.symbol)));
  const btcCandles = await fetchCandles("BTCUSDT", RELATIVE_LOOKBACK + 2, signal, ALT_INTERVAL);
  const btcCloses = btcCandles.map((candle) => candle.close);
  const results = [];
  const batchSize = 4;

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
  if (ticker?.unsupported) {
    return null;
  }

  const candles = await fetchScannerCandles(ticker.symbol, signal);
  const closes = candles.map((candle) => candle.close);
  const ma800 = toChartSma(candles, ALT_MA_PERIOD).at(-1)?.value;
  const adxSeries = calculateADX(candles, ADX_PERIOD);
  const price = closes.at(-1);
  const adx = adxSeries.at(-1);

  if (![price, ma800].every(Number.isFinite)) {
    return null;
  }

  let trendDirection = "neutral";
  if (price < ma800) trendDirection = "bearish";
  if (price > ma800) trendDirection = "bullish";
  const priceDistancePercent = ((price - ma800) / ma800) * 100;
  const relativeToBtcPercent = calculateRelativePerformance(closes, btcCloses, RELATIVE_LOOKBACK);
  const isFlatMarket = isStableLikeMarket(candles);
  const trend = getAltTrendLabel(trendDirection);
  const monthlyPivot = await fetchLatestMonthlyWoodiePivot(ticker.symbol, signal).catch(() => calculateLatestMonthlyWoodiePivot(candles));
  const pivotAlert = getAltPivotAlert(price, monthlyPivot);

  return {
    ...ticker,
    price,
    ma800,
    priceDistancePercent,
    adx,
    relativeToBtcPercent,
    relativeLabel: relativeToBtcPercent >= 0 ? "mais forte que BTC" : "mais fraca que BTC",
    trendDirection,
    trend,
    pivotAlert,
    monthlyPivot,
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

export function buildRenkoBricks(candles, boxSize = RENKO_BOX_SIZE, maxBricks = Number.POSITIVE_INFINITY) {
  if (!Array.isArray(candles) || candles.length === 0 || boxSize <= 0) return [];

  const bricks = [];
  const hasBrickLimit = Number.isFinite(maxBricks) && maxBricks > 0;
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
      if (hasBrickLimit && bricks.length > maxBricks + 500) {
        bricks.splice(0, bricks.length - maxBricks);
      }

      anchorClose = brickClose;
      diff = close - anchorClose;
      bricksInCandle += 1;
    }
  }

  return hasBrickLimit && bricks.length > maxBricks ? bricks.slice(-maxBricks) : bricks;
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

export function toChartLrc(candles, period) {
  if (!Array.isArray(candles) || candles.length < period) return [];

  const points = [];
  const sumX = (period * (period - 1)) / 2;
  const sumX2 = ((period - 1) * period * (2 * period - 1)) / 6;
  const denominator = period * sumX2 - sumX * sumX;
  let sumY = 0;
  let sumXY = 0;

  for (let index = 0; index < candles.length; index += 1) {
    const close = Number.isFinite(candles[index]?.close) ? candles[index].close : 0;

    if (index < period) {
      sumY += close;
      sumXY += index * close;
    } else {
      const removedClose = Number.isFinite(candles[index - period]?.close) ? candles[index - period].close : 0;
      sumXY = sumXY - (sumY - removedClose) + (period - 1) * close;
      sumY = sumY - removedClose + close;
    }

    if (index < period - 1 || denominator === 0) continue;

    const slope = (period * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / period;
    points.push({
      time: Math.floor(candles[index].openTime / 1000),
      value: intercept + slope * (period - 1),
    });
  }

  return points.filter((item) => Number.isFinite(item.time) && Number.isFinite(item.value));
}

export function toChartLsma(candles, period) {
  return toChartLrc(candles, period);
}

export function toChartVwma(candles, period = BTC_QUAD_VWMA_PERIOD) {
  if (!Array.isArray(candles) || candles.length < period) return [];

  const points = [];
  let priceVolumeSum = 0;
  let volumeSum = 0;

  candles.forEach((candle, index) => {
    const close = Number.isFinite(candle?.close) ? candle.close : 0;
    const volume = Number.isFinite(candle?.volume) ? candle.volume : 0;
    priceVolumeSum += close * volume;
    volumeSum += volume;

    if (index >= period) {
      const removed = candles[index - period];
      const removedClose = Number.isFinite(removed?.close) ? removed.close : 0;
      const removedVolume = Number.isFinite(removed?.volume) ? removed.volume : 0;
      priceVolumeSum -= removedClose * removedVolume;
      volumeSum -= removedVolume;
    }

    if (index < period - 1 || !volumeSum) return;
    points.push({
      time: Math.floor(candle.openTime / 1000),
      value: priceVolumeSum / volumeSum,
    });
  });

  return points;
}

export function toChartSma(candles, period) {
  if (!Array.isArray(candles) || candles.length < period) return [];

  const points = [];
  let sum = 0;

  candles.forEach((candle, index) => {
    const close = Number.isFinite(candle?.close) ? candle.close : 0;
    sum += close;

    if (index >= period) {
      const removedClose = Number.isFinite(candles[index - period]?.close) ? candles[index - period].close : 0;
      sum -= removedClose;
    }

    if (index < period - 1) return;
    points.push({ time: Math.floor(candle.openTime / 1000), value: sum / period });
  });

  return points;
}

export function toChartCandleBollingerBands(candles, period, multiplier) {
  if (!Array.isArray(candles) || candles.length < period) {
    return { upper: [], middle: [], lower: [] };
  }

  const upper = [];
  const middle = [];
  const lower = [];
  let sum = 0;
  let squaredSum = 0;

  candles.forEach((candle, index) => {
    const close = Number.isFinite(candle?.close) ? candle.close : 0;
    sum += close;
    squaredSum += close * close;

    if (index >= period) {
      const removedClose = Number.isFinite(candles[index - period]?.close) ? candles[index - period].close : 0;
      sum -= removedClose;
      squaredSum -= removedClose * removedClose;
    }

    if (index < period - 1) return;
    const basis = sum / period;
    const variance = Math.max(0, squaredSum / period - basis * basis);
    const deviation = Math.sqrt(variance) * multiplier;
    const time = Math.floor(candle.openTime / 1000);
    upper.push({ time, value: basis + deviation });
    middle.push({ time, value: basis });
    lower.push({ time, value: basis - deviation });
  });

  return { upper, middle, lower };
}

export function toChartRenko(candles, boxSize = RENKO_BOX_SIZE, projectedColors) {
  return buildRenkoBricks(candles, boxSize, MAX_RENKO_CHART_BRICKS).map((brick) => ({
    time: Math.floor(brick.openTime / 1000),
    open: brick.open,
    high: brick.high,
    low: brick.low,
    close: brick.close,
    volume: brick.volume,
    ...(brick.projected ? getProjectedRenkoColors(brick.direction, projectedColors) : {}),
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
  const ema450 = calculateEMA(
    candles.map((candle) => candle.close),
    ALT_SLOW_EMA
  ).at(-1);
  const lrc200 = toChartLrc(candles, ALT_LRC_PERIOD).at(-1)?.value;
  const vwma190 = toChartVwma(candles, ALT_VWMA_PERIOD).at(-1)?.value;
  const distance = last && ema450 ? ((last.close - ema450) / ema450) * 100 : null;
  const change = last && previous ? ((last.close - previous.close) / previous.close) * 100 : null;

  return {
    price: last?.close,
    ema450,
    lrc200,
    vwma190,
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

function getProjectedRenkoColors(direction, projectedColors) {
  const customColor = direction > 0 ? projectedColors?.up : projectedColors?.down;
  if (customColor) {
    return {
      color: customColor,
      borderColor: customColor,
      wickColor: customColor,
    };
  }

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

function getAltTrendLabel(direction) {
  if (direction === "bearish") return "abaixo da MA 800";
  if (direction === "bullish") return "acima da MA 800";
  return "fora das zonas";
}

function getAltPivotAlert(price, monthlyPivot) {
  if (!Number.isFinite(price) || !monthlyPivot) return null;

  const levels = [
    { label: "P", level: monthlyPivot.p },
    { label: "S1", level: monthlyPivot.s1 },
    { label: "S2", level: monthlyPivot.s2 },
    { label: "R1", level: monthlyPivot.r1 },
    { label: "R2", level: monthlyPivot.r2 },
  ].filter((item) => Number.isFinite(item.level) && item.level > 0);

  const nearest = levels
    .map((support) => {
      const distancePercent = ((price - support.level) / support.level) * 100;
      return { ...support, distance: Math.abs(distancePercent) };
    })
    .sort((a, b) => a.distance - b.distance);

  if (nearest[0]?.distance <= ALT_PIVOT_PROXIMITY_PERCENT) {
    return nearest[0].label === "P" ? "proximo P" : `proximo a ${nearest[0].label}`;
  }

  if (Number.isFinite(monthlyPivot.s2) && price < monthlyPivot.s2) return "abaixo de S2";
  if (Number.isFinite(monthlyPivot.s1) && price < monthlyPivot.s1) return "abaixo de S1";
  if (Number.isFinite(monthlyPivot.r1) && price < monthlyPivot.r1) return "abaixo de R1";
  if (Number.isFinite(monthlyPivot.r2) && price < monthlyPivot.r2) return "abaixo de R2";
  return null;
}

function calculateLatestMonthlyWoodiePivot(candles) {
  if (!Array.isArray(candles) || candles.length < 2) return null;

  const monthsByKey = new Map();
  candles.forEach((candle) => {
    if (![candle?.openTime, candle?.open, candle?.high, candle?.low].every(Number.isFinite)) return;
    const date = new Date(candle.openTime);
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
    const month = monthsByKey.get(key) || { candles: [] };
    month.candles.push(candle);
    monthsByKey.set(key, month);
  });

  const months = [...monthsByKey.values()].filter((month) => month.candles.length > 0);
  if (months.length < 2) return null;

  const current = months.at(-1);
  const previous = months.at(-2);
  const previousHigh = Math.max(...previous.candles.map((candle) => candle.high));
  const previousLow = Math.min(...previous.candles.map((candle) => candle.low));
  const currentOpen = current.candles[0]?.open;
  if (![previousHigh, previousLow, currentOpen].every(Number.isFinite)) return null;

  const pivot = (previousHigh + previousLow + 2 * currentOpen) / 4;
  return {
    p: pivot,
    r1: 2 * pivot - previousLow,
    r2: pivot + previousHigh - previousLow,
    s1: 2 * pivot - previousHigh,
    s2: pivot - previousHigh + previousLow,
  };
}

export function usesPollingMarketData(symbol) {
  return symbol === HYPE_SYMBOL;
}

async function fetchKucoin(path, params = {}, signal) {
  const query = toQuery({ endpoint: path, ...params });
  const url = typeof window === "undefined"
    ? `${KUCOIN_DIRECT_ENDPOINT}/${path}?${toQuery(params)}`
    : `${KUCOIN_PROXY_ENDPOINT}?${query}`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

  const payload = await response.json();
  if (payload?.code !== "200000") {
    throw new Error(payload?.msg || "Falha ao acessar dados publicos da KuCoin.");
  }
  return payload.data;
}

async function fetchKucoinTicker(signal) {
  const ticker = await fetchKucoin("stats", { symbol: HYPE_KUCOIN_SYMBOL }, signal);
  const bid = Number(ticker?.buy);
  const ask = Number(ticker?.sell);
  const lastPrice = Number(ticker?.last);
  const spreadPercent = bid > 0 && ask > 0 && lastPrice > 0 ? ((ask - bid) / lastPrice) * 100 : 0;

  if (!Number.isFinite(lastPrice) || lastPrice <= 0) return null;
  return {
    symbol: HYPE_SYMBOL,
    baseAsset: "HYPE",
    lastPrice,
    quoteVolume: Number(ticker?.volValue) || 0,
    priceChangePercent: (Number(ticker?.changeRate) || 0) * 100,
    spreadPercent,
    source: "kucoin",
  };
}

async function fetchKucoinCandles(limit, signal, interval) {
  const intervalSeconds = INTERVAL_SECONDS[interval];
  if (!intervalSeconds) throw new Error(`Intervalo ${interval} indisponivel para HYPE-USDC.`);

  const candlesByTime = new Map();
  let endAt = Math.floor(Date.now() / 1000);

  while (candlesByTime.size < limit) {
    const batchLimit = Math.min(KUCOIN_CANDLE_BATCH_LIMIT, limit - candlesByTime.size);
    const startAt = endAt - intervalSeconds * (batchLimit + 5);
    const rows = await fetchKucoin(
      "candles",
      { type: KUCOIN_INTERVAL_TYPES[interval] || interval, symbol: HYPE_KUCOIN_SYMBOL, startAt, endAt },
      signal
    );
    if (!Array.isArray(rows) || rows.length === 0) break;

    rows.forEach((row) => {
      const candle = normalizeKucoinCandle(row, intervalSeconds);
      if (Number.isFinite(candle.openTime)) candlesByTime.set(candle.openTime, candle);
    });
    const earliestOpenTime = Math.min(...rows.map((row) => Number(row?.[0])).filter(Number.isFinite));
    if (!Number.isFinite(earliestOpenTime)) break;
    endAt = earliestOpenTime - 1;
    if (rows.length < batchLimit) break;
  }

  return [...candlesByTime.values()]
    .sort((a, b) => a.openTime - b.openTime)
    .slice(-limit);
}

function normalizeKucoinCandle(row, intervalSeconds) {
  const openTime = Number(row?.[0]) * 1000;
  return {
    openTime,
    open: Number(row?.[1]),
    close: Number(row?.[2]),
    high: Number(row?.[3]),
    low: Number(row?.[4]),
    volume: Number(row?.[5]),
    closeTime: openTime + intervalSeconds * 1000 - 1,
    quoteVolume: Number(row?.[6]),
    trades: 0,
    closed: openTime + intervalSeconds * 1000 <= Date.now(),
  };
}

async function fetchScannerCandles(symbol, signal) {
  const cached = SCANNER_CANDLE_CACHE.get(symbol);
  const lastCachedTime = cached?.at(-1)?.openTime;
  const missingCandles = Number.isFinite(lastCachedTime)
    ? Math.ceil((Date.now() - lastCachedTime) / (INTERVAL_SECONDS[ALT_INTERVAL] * 1000)) + 2
    : ALT_HISTORY_LIMIT;
  const requestLimit = cached?.length >= ALT_MA_PERIOD && missingCandles <= 1000
    ? Math.max(2, missingCandles)
    : ALT_HISTORY_LIMIT;
  const fetched = await fetchCandles(symbol, requestLimit, signal, ALT_INTERVAL);

  if (!cached?.length) {
    const initial = fetched.slice(-ALT_HISTORY_LIMIT);
    SCANNER_CANDLE_CACHE.set(symbol, initial);
    return initial;
  }

  const byOpenTime = new Map(cached.map((candle) => [candle.openTime, candle]));
  fetched.forEach((candle) => byOpenTime.set(candle.openTime, candle));
  const merged = [...byOpenTime.values()]
    .sort((a, b) => a.openTime - b.openTime)
    .slice(-ALT_HISTORY_LIMIT);
  SCANNER_CANDLE_CACHE.set(symbol, merged);
  return merged;
}

function pruneScannerCandleCache(activeSymbols) {
  SCANNER_CANDLE_CACHE.forEach((_, symbol) => {
    if (!activeSymbols.has(symbol)) SCANNER_CANDLE_CACHE.delete(symbol);
  });
  SCANNER_MONTHLY_CANDLE_CACHE.forEach((_, symbol) => {
    if (!activeSymbols.has(symbol)) SCANNER_MONTHLY_CANDLE_CACHE.delete(symbol);
  });
}

async function fetchLatestMonthlyWoodiePivot(symbol, signal) {
  const candles = await fetchScannerMonthlyCandles(symbol, signal);
  return calculateLatestMonthlyWoodiePivot(candles);
}

async function fetchScannerMonthlyCandles(symbol, signal) {
  const currentMonthKey = getCurrentUtcMonthKey();
  const cached = SCANNER_MONTHLY_CANDLE_CACHE.get(symbol);
  if (cached?.monthKey === currentMonthKey && Array.isArray(cached.candles) && cached.candles.length >= 2) {
    return cached.candles;
  }

  const candles = await fetchCandles(symbol, 8, signal, "1M");
  SCANNER_MONTHLY_CANDLE_CACHE.set(symbol, { monthKey: currentMonthKey, candles });
  return candles;
}

function getCurrentUtcMonthKey() {
  const date = new Date();
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
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
  if (a.trendDirection === "bullish") return b.priceDistancePercent - a.priceDistancePercent;
  return a.priceDistancePercent - b.priceDistancePercent;
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
