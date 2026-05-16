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
  universeSize: 150,
  minQuoteVolume: 5_000_000,
  maxSpreadPercent: 0.45,
  autoRefresh: true,
};

export const BB_PERIOD = 137;
export const BB_MULTIPLIER = 1.001;
export const BB_OFFSET = -2;
export const RENKO_BOX_SIZE = 15;
export const INTERVAL = "15m";

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

  return ticker24h
    .filter((item) => tradable.has(item.symbol))
    .map(normalizeTicker)
    .filter((item) => item.quoteVolume >= filters.minQuoteVolume)
    .filter((item) => item.spreadPercent <= filters.maxSpreadPercent)
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, filters.universeSize);
}

export async function fetchCandles(symbol, limit = 1000, signal) {
  const rows = await fetchBinance(
    "/klines",
    {
      symbol,
      interval: INTERVAL,
      limit,
    },
    signal
  );

  return rows.map(normalizeCandle);
}

export async function scanMarket(filters, signal, onProgress) {
  const universe = await loadTradableUniverse(filters, signal);
  const results = [];
  const batchSize = 6;

  for (let index = 0; index < universe.length; index += batchSize) {
    const batch = universe.slice(index, index + batchSize);
    const analyzed = await Promise.all(
      batch.map(async (ticker) => {
        try {
          return await buildSignal(ticker, signal);
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

  return results
    .filter((item) => !item.isFlatMarket)
    .filter((item) => item.belowLowerBand || item.aboveUpperBand)
    .sort((a, b) => a.bandDistancePercent - b.bandDistancePercent);
}

export async function buildSignal(ticker, signal) {
  const candles = await fetchCandles(ticker.symbol, 1000, signal);
  const bricks = buildRenkoBricks(candles);
  const closes = bricks.map((brick) => brick.close);
  const bands = calculateBollingerBands(closes, BB_PERIOD, BB_MULTIPLIER);
  const latestBand = bands.at(-1);
  const latestBrick = bricks.at(-1);
  const price = latestBrick?.close;

  if (!Number.isFinite(price) || !latestBand) {
    return null;
  }

  const belowLowerBand = price < latestBand.lower;
  const aboveUpperBand = price > latestBand.upper;
  const activeBand = belowLowerBand ? latestBand.lower : aboveUpperBand ? latestBand.upper : latestBand.middle;
  const bandDistancePercent = activeBand ? ((price - activeBand) / activeBand) * 100 : null;
  const isFlatMarket = isStableLikeMarket(candles);
  const trend = getBandSignalLabel(price, latestBand);

  return {
    ...ticker,
    price,
    actualPrice: ticker.lastPrice,
    upperBand: latestBand.upper,
    middleBand: latestBand.middle,
    lowerBand: latestBand.lower,
    activeBand,
    bandDistancePercent,
    trend,
    isFlatMarket,
    candlesLoaded: candles.length,
    renkoBricksCount: bricks.length,
    lastCandleTime: latestBrick?.sourceOpenTime || candles.at(-1)?.openTime,
    belowLowerBand,
    aboveUpperBand,
  };
}

export function mergeLiveCandle(candles, payload) {
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

  const current = candles || [];
  const last = current.at(-1);
  if (last?.openTime === next.openTime) {
    return [...current.slice(0, -1), next];
  }

  return [...current.slice(-999), next];
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

    while (Math.abs(diff) >= boxSize) {
      const direction = diff > 0 ? 1 : -1;
      const open = anchorClose;
      const brickClose = anchorClose + direction * boxSize;
      const sourceTime = Math.floor(candle.openTime / 1000);
      lastChartTime = Math.max(lastChartTime + 1, sourceTime + bricksInCandle);

      bricks.push({
        openTime: lastChartTime * 1000,
        sourceOpenTime: candle.openTime,
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
  }));
}

export function toChartRenko(candles) {
  return buildRenkoBricks(candles).map((brick) => ({
    time: Math.floor(brick.openTime / 1000),
    open: brick.open,
    high: brick.high,
    low: brick.low,
    close: brick.close,
  }));
}

export function toChartBollingerBands(candles) {
  const bricks = toChartRenko(candles);
  const bands = calculateBollingerBands(
    bricks.map((brick) => brick.close),
    BB_PERIOD,
    BB_MULTIPLIER
  );

  return {
    upper: toChartBandLine(bricks, bands, "upper"),
    middle: toChartBandLine(bricks, bands, "middle"),
    lower: toChartBandLine(bricks, bands, "lower"),
  };
}

export function getLatestBollingerStats(candles) {
  const bricks = toChartRenko(candles);
  const bands = calculateBollingerBands(
    bricks.map((brick) => brick.close),
    BB_PERIOD,
    BB_MULTIPLIER
  );
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
    bricksCount: bricks.length,
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

export function buildSocketUrl(symbol) {
  return `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${INTERVAL}`;
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
  return {
    openTime: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
    closeTime: Number(row[6]),
    quoteVolume: Number(row[7]),
    trades: Number(row[8]),
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

function getBandSignalLabel(price, band) {
  if (price < band.lower) return "abaixo da BB inferior";
  if (price > band.upper) return "acima da BB superior";
  return "dentro das bandas";
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (valid.length === 0) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
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
