const CMC_LISTINGS_ENDPOINT = "https://pro-api.coinmarketcap.com/public-api/v3/cryptocurrency/listings/latest";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ status: { error_message: "Method not allowed" }, data: [] });
  }

  const params = new URLSearchParams({
    start: "1",
    limit: String(readLimit(request.query.limit)),
    convert: "USD",
    sort: "market_cap",
    sort_dir: "desc",
  });

  try {
    const upstream = await fetch(`${CMC_LISTINGS_ENDPOINT}?${params}`);
    const body = await upstream.text();
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return response.status(upstream.status).send(body);
  } catch {
    return response.status(502).json({ status: { error_message: "CoinMarketCap unavailable" }, data: [] });
  }
}

function readQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function readLimit(value) {
  const number = Number(readQueryValue(value));
  if (!Number.isInteger(number)) return 150;
  return Math.min(Math.max(number, 1), 500);
}
