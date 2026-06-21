const ALLOWED_ENDPOINTS = new Set(["candles", "stats"]);
const ALLOWED_SYMBOL = "HYPE-USDC";
const KUCOIN_MARKET_ENDPOINT = "https://api.kucoin.com/api/v1/market";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ code: "405000", msg: "Method not allowed" });
  }

  const endpoint = readQueryValue(request.query.endpoint);
  const symbol = readQueryValue(request.query.symbol);
  if (!ALLOWED_ENDPOINTS.has(endpoint) || symbol !== ALLOWED_SYMBOL) {
    return response.status(400).json({ code: "400000", msg: "Invalid market request" });
  }

  const params = new URLSearchParams({ symbol });
  if (endpoint === "candles") {
    const type = readQueryValue(request.query.type);
    const startAt = readTimestamp(request.query.startAt);
    const endAt = readTimestamp(request.query.endAt);
    if (type !== "15min" || startAt == null || endAt == null) {
      return response.status(400).json({ code: "400000", msg: "Invalid candle request" });
    }
    params.set("type", type);
    params.set("startAt", String(startAt));
    params.set("endAt", String(endAt));
  }

  try {
    const upstream = await fetch(`${KUCOIN_MARKET_ENDPOINT}/${endpoint}?${params}`);
    const body = await upstream.text();
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", endpoint === "stats" ? "s-maxage=10, stale-while-revalidate=20" : "s-maxage=30, stale-while-revalidate=60");
    return response.status(upstream.status).send(body);
  } catch {
    return response.status(502).json({ code: "502000", msg: "KuCoin unavailable" });
  }
}

function readQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function readTimestamp(value) {
  const number = Number(readQueryValue(value));
  return Number.isInteger(number) && number > 0 ? number : null;
}

