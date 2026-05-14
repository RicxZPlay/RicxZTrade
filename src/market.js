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

export const PERIOD = 450;
export const DPO_PERIOD = 120;
export const INTERVAL = "1h";

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
    .sort((a, b) => a.distancePercent - b.distancePercent);
}

export async function buildSignal(ticker, signal) {
  const candles = await fetchCandles(ticker.symbol, 1000, signal);
  const closes = candles.map((candle) => candle.close);
  const emaSeries = calculateEMA(closes, PERIOD);
  const ema450 = emaSeries.at(-1);
  const price = closes.at(-1);

  if (!Number.isFinite(price) || !Number.isFinite(ema450)) {
    return null;
  }

  const distancePercent = ((price - ema450) / ema450) * 100;
  const rsi = calculateRSI(closes, 14);
  const dpoSeries = calculateDPO(closes, DPO_PERIOD);
  const dpo120 = dpoSeries.at(-1);
  const dpoPercent = Number.isFinite(dpo120) && price > 0 ? (dpo120 / price) * 100 : null;
  const isFlatMarket = isStableLikeMarket(candles);
  const trend = getTrendLabel(distancePercent, rsi, dpoPercent);

  return {
    ...ticker,
    price,
    ema450,
    distancePercent,
    rsi,
    dpo120,
    dpoPercent,
    trend,
    isFlatMarket,
    candlesLoaded: candles.length,
    lastCandleTime: candles.at(-1)?.openTime,
    belowEma: price < ema450,
    aboveEma: price >= ema450,
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

export function calculateEMA(values, period = PERIOD) {
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

export function calculateRSI(values, period = 14) {
  if (!Array.isArray(values) || values.length <= period) return null;

  let gains = 0;
  let losses = 0;
  const start = values.length - period;

  for (let index = start; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }

  if (losses === 0) return 100;
  const relativeStrength = gains / period / (losses / period);
  return 100 - 100 / (1 + relativeStrength);
}

export function calculateDPO(values, period = DPO_PERIOD) {
  if (!Array.isArray(values) || values.length < period) return [];

  const shift = Math.floor(period / 2) + 1;
  const result = Array(values.length).fill(null);

  for (let index = period - 1 + shift; index < values.length; index += 1) {
    const smaIndex = index - shift;
    const sma = average(values.slice(smaIndex - period + 1, smaIndex + 1));
    result[index] = values[index] - sma;
  }

  return result;
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

export function toChartEma(candles) {
  const ema = calculateEMA(
    candles.map((candle) => candle.close),
    PERIOD
  );

  return candles
    .map((candle, index) => ({
      time: Math.floor(candle.openTime / 1000),
      value: ema[index],
    }))
    .filter((item) => Number.isFinite(item.value));
}

export function toChartDpo(candles) {
  const dpo = calculateDPO(
    candles.map((candle) => candle.close),
    DPO_PERIOD
  );

  return candles
    .map((candle, index) => ({
      time: Math.floor(candle.openTime / 1000),
      value: dpo[index],
      color: dpo[index] >= 0 ? "rgba(31, 191, 117, 0.55)" : "rgba(239, 91, 91, 0.55)",
    }))
    .filter((item) => Number.isFinite(item.value));
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

function getTrendLabel(distancePercent, rsi, dpoPercent) {
  if (distancePercent <= -8 && rsi < 35) return "queda esticada";
  if (distancePercent >= 4 && dpoPercent > 0) return "acima com DPO positivo";
  if (distancePercent <= -4 && dpoPercent < 0) return "abaixo com DPO negativo";
  if (distancePercent > -2 && rsi >= 40) return "perto da EMA";
  if (rsi < 35) return "sobrevenda";
  if (distancePercent >= 0) return "acima da media";
  return "abaixo da media";
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
