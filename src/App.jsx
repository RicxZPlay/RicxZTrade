import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Clock3,
  Filter,
  RefreshCcw,
  Search,
  SlidersHorizontal,
  Moon,
  Star,
  Sun,
  TrendingUp,
  TrendingDown,
  Wifi,
  X,
} from "lucide-react";
import CryptoChart from "./CryptoChart";
import BtcQuadView from "./BtcQuadView";
import {
  buildSocketUrl,
  ALT_CHART_INTERVALS,
  DEFAULT_ALT_CHART_TIMEFRAME,
  DEFAULT_FILTERS,
  fetchCandles,
  formatClock,
  formatPercent,
  formatPrice,
  mergeLiveCandle,
  scanMarket,
  usesPollingMarketData,
} from "./market";
import "./App.css";

const REFRESH_INTERVAL_MS = 900_000;
const FAVORITES_STORAGE_KEY = "ricxz.cryptoFavorites";
const THEME_STORAGE_KEY = "ricxz.theme";
const BTC_CHART_SYMBOL = "BTCUSDT";
const CHART_MODES = {
  btc: "btc",
  alt: "alt",
};
const ALT_CHART_TIMEFRAMES = ["1m", "15m"];

export default function App() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [results, setResults] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [chartSymbol, setChartSymbol] = useState(BTC_CHART_SYMBOL);
  const [chartMode, setChartMode] = useState(CHART_MODES.btc);
  const [chartCandles, setChartCandles] = useState({});
  const [favoriteSymbols, setFavoriteSymbols] = useState(readStoredFavorites);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [theme, setTheme] = useState(readStoredTheme);
  const [chartOverlayOpen, setChartOverlayOpen] = useState(false);
  const [btcQuadOpen, setBtcQuadOpen] = useState(false);
  const isCompactLayout = useMediaQuery("(max-width: 820px)");
  const [scanState, setScanState] = useState("idle");
  const [progress, setProgress] = useState({ checked: 0, total: 0 });
  const [lastScan, setLastScan] = useState(null);
  const [error, setError] = useState("");
  const [liveStatus, setLiveStatus] = useState({});
  const [chartError, setChartError] = useState({});
  const scanAbortRef = useRef(null);
  const chartRequestRef = useRef(0);

  const selectSymbol = useCallback((symbol) => {
    setSelectedSymbol(symbol);
    setChartMode(CHART_MODES.alt);
    setChartSymbol(symbol);
    setChartError({});
    setLiveStatus({});
    if (isCompactLayout) {
      setChartOverlayOpen(true);
    }
  }, [isCompactLayout]);

  const toggleFavorite = useCallback((symbol) => {
    const normalizedSymbol = normalizeFavoriteSymbol(symbol);
    if (!normalizedSymbol) return;

    setFavoriteSymbols((current) => {
      const normalizedCurrent = normalizeFavoriteSymbols(current);
      if (normalizedCurrent.includes(normalizedSymbol)) {
        return normalizedCurrent.filter((item) => item !== normalizedSymbol);
      }
      return [...normalizedCurrent, normalizedSymbol].sort();
    });
  }, []);

  const runScan = useCallback(async () => {
    scanAbortRef.current?.abort();
    const controller = new AbortController();
    scanAbortRef.current = controller;

    setScanState("loading");
    setError("");
    setProgress({ checked: 0, total: 0 });

    try {
      const signals = await scanMarket(filters, controller.signal, setProgress);
      setResults(signals);
      setLastScan(Date.now());
      setScanState("success");

      setSelectedSymbol((current) => {
        if (current && signals.some((item) => item.symbol === current)) return current;
        return signals[0]?.symbol || current || "";
      });
    } catch (scanError) {
      if (controller.signal.aborted) return;
      setScanState("error");
      setError(scanError?.message || "Falha ao buscar dados de mercado.");
    }
  }, [filters]);

  useEffect(() => {
    queueMicrotask(runScan);
    return () => scanAbortRef.current?.abort();
  }, [runScan]);

  useEffect(() => {
    if (!filters.autoRefresh) return undefined;
    const timer = window.setInterval(runScan, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [filters.autoRefresh, runScan]);

  useEffect(() => {
    writeLocalStorage(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteSymbols));
  }, [favoriteSymbols]);

  useEffect(() => {
    writeLocalStorage(THEME_STORAGE_KEY, theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!chartSymbol || chartMode === CHART_MODES.btc) return undefined;

    const controller = new AbortController();
    const sockets = [];
    const pollTimers = [];
    const requestId = chartRequestRef.current + 1;
    chartRequestRef.current = requestId;
    const targetSymbol = chartSymbol;

    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setChartCandles({});
        setLiveStatus(Object.fromEntries(ALT_CHART_TIMEFRAMES.map((timeframe) => [timeframe, "loading"])));
        setChartError({});
      }
    });

    ALT_CHART_TIMEFRAMES.forEach((timeframe) => {
      const timeframeConfig = ALT_CHART_INTERVALS[timeframe] || ALT_CHART_INTERVALS[DEFAULT_ALT_CHART_TIMEFRAME];
      const targetInterval = timeframeConfig.interval;
      const targetLimit = timeframeConfig.historyLimit;

      fetchCandlesWithRetry(targetSymbol, controller.signal, targetLimit, targetInterval)
        .then((nextCandles) => {
          if (controller.signal.aborted || chartRequestRef.current !== requestId) return;
          setChartCandles((current) => ({ ...current, [timeframe]: nextCandles }));
          setChartError((current) => ({ ...current, [timeframe]: "" }));

          if (usesPollingMarketData(targetSymbol)) {
            setLiveStatus((current) => ({ ...current, [timeframe]: "online" }));
            const pollTimer = window.setInterval(async () => {
              try {
                const recentCandles = await fetchCandles(targetSymbol, 2, controller.signal, targetInterval);
                if (controller.signal.aborted || chartRequestRef.current !== requestId) return;
                setChartCandles((current) => ({
                  ...current,
                  [timeframe]: mergeFetchedCandles(current[timeframe] || [], recentCandles, targetLimit),
                }));
              } catch {
                if (!controller.signal.aborted && chartRequestRef.current === requestId) {
                  setLiveStatus((current) => ({ ...current, [timeframe]: "offline" }));
                }
              }
            }, 15_000);
            pollTimers.push(pollTimer);
            return;
          }

          const socket = new WebSocket(buildSocketUrl(targetSymbol, targetInterval));
          sockets.push(socket);
          socket.onopen = () => {
            if (!controller.signal.aborted && chartRequestRef.current === requestId) {
              setLiveStatus((current) => ({ ...current, [timeframe]: "online" }));
            }
          };
          socket.onmessage = (event) => {
            try {
              const payload = JSON.parse(event.data);
              if (controller.signal.aborted || chartRequestRef.current !== requestId || payload?.s !== targetSymbol) return;
              setChartCandles((current) => ({
                ...current,
                [timeframe]: mergeLiveCandle(current[timeframe] || [], payload, targetLimit),
              }));
            } catch {
              if (!controller.signal.aborted && chartRequestRef.current === requestId) {
                setLiveStatus((current) => ({ ...current, [timeframe]: "offline" }));
              }
            }
          };
          socket.onerror = () => {
            if (!controller.signal.aborted && chartRequestRef.current === requestId) {
              setLiveStatus((current) => ({ ...current, [timeframe]: "offline" }));
            }
          };
          socket.onclose = () => {
            if (!controller.signal.aborted && chartRequestRef.current === requestId) {
              setLiveStatus((current) => ({ ...current, [timeframe]: "offline" }));
            }
          };
        })
        .catch((loadError) => {
          if (!controller.signal.aborted && chartRequestRef.current === requestId) {
            setLiveStatus((current) => ({ ...current, [timeframe]: "offline" }));
            setChartError((current) => ({
              ...current,
              [timeframe]: loadError?.message || "Nao foi possivel carregar este grafico.",
            }));
          }
        });
    });

    return () => {
      controller.abort();
      sockets.forEach((socket) => socket.close());
      pollTimers.forEach((pollTimer) => window.clearInterval(pollTimer));
    };
  }, [chartMode, chartSymbol]);

  const favoriteSet = useMemo(() => new Set(favoriteSymbols), [favoriteSymbols]);
  const belowResults = useMemo(() => results.filter((item) => item.trendDirection === "bearish"), [results]);
  const aboveResults = useMemo(() => results.filter((item) => item.trendDirection === "bullish"), [results]);

  const filteredBelowResults = useMemo(() => {
    const term = query.trim().toUpperCase();
    return belowResults.filter((item) => {
      const matchesQuery = !term || item.symbol.includes(term) || item.baseAsset.includes(term);
      const matchesFavorite = !showFavoritesOnly || favoriteSet.has(item.symbol);
      return matchesQuery && matchesFavorite;
    });
  }, [belowResults, favoriteSet, query, showFavoritesOnly]);

  const filteredAboveResults = useMemo(() => {
    const term = query.trim().toUpperCase();
    return aboveResults.filter((item) => {
      const matchesQuery = !term || item.symbol.includes(term) || item.baseAsset.includes(term);
      const matchesFavorite = !showFavoritesOnly || favoriteSet.has(item.symbol);
      return matchesQuery && matchesFavorite;
    });
  }, [aboveResults, favoriteSet, query, showFavoritesOnly]);

  const selected = useMemo(
    () => results.find((item) => item.symbol === selectedSymbol) || null,
    [results, selectedSymbol]
  );

  const summary = useMemo(() => {
    const strongTrend = results.filter((item) => item.adx >= 25).length;
    const strongerThanBtc = results.filter((item) => item.relativeToBtcPercent > 0).length;

    return {
      below: belowResults.length,
      above: aboveResults.length,
      strongTrend,
      strongerThanBtc,
    };
  }, [aboveResults.length, belowResults, results]);

  const progressPercent = progress.total ? Math.round((progress.checked / progress.total) * 100) : 0;
  const visibleFavoriteCount = results.filter((item) => favoriteSet.has(item.symbol)).length;
  const scannerControls = (
    <ScannerControls
      filters={filters}
      setFilters={setFilters}
      showFavoritesOnly={showFavoritesOnly}
      setShowFavoritesOnly={setShowFavoritesOnly}
      favoriteSymbols={favoriteSymbols}
      visibleFavoriteCount={visibleFavoriteCount}
      query={query}
      setQuery={setQuery}
      scanState={scanState}
      progress={progress}
      progressPercent={progressPercent}
      error={error}
    />
  );

  return (
    <main className={`app-shell theme-${theme}`}>
      <section className="mobile-scanner-screen">
        <header className="topbar">
          <div className="top-spacer" />
          <h1 className="brand-title">RicxZ</h1>

          <div className="top-actions">
            <StatusPill icon={<Wifi size={16} />} label={scanState === "loading" ? "Buscando" : "Online"} />
            <StatusPill icon={<Clock3 size={16} />} label={lastScan ? formatClock(lastScan) : "Aguardando"} />
            <button
              className="ghost-action"
              type="button"
              onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
            >
              {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
              {theme === "light" ? "Escuro" : "Claro"}
            </button>
            <button className="primary-action" type="button" onClick={runScan} disabled={scanState === "loading"}>
              <RefreshCcw size={17} />
              Atualizar
            </button>
          </div>
        </header>

        <section className="stats-grid">
          <StatCard icon={<TrendingDown size={20} />} label="Abaixo MA / acima BB 8000" value={summary.below} />
          <StatCard icon={<TrendingUp size={20} />} label="Acima MA / abaixo BB 5000" value={summary.above} />
          <StatCard icon={<Activity size={20} />} label="ADX forte" value={summary.strongTrend} />
          <StatCard icon={<Clock3 size={20} />} label="Mais fortes que BTC" value={summary.strongerThanBtc} />
        </section>

        <div className="mobile-controls-slot">{scannerControls}</div>
      </section>

      <section className="workspace">
        <aside className="scanner-panel">
          <div className="desktop-controls-slot">{scannerControls}</div>

          <div className="coins-stage">
            <div className="table-card below-table">
              <div className="table-title">
                <Filter size={18} />
                <span>{filteredBelowResults.length} abaixo</span>
              </div>

              <div className="coin-list">
                {filteredBelowResults.map((item) => (
                  <CoinRow
                    key={item.symbol}
                    item={item}
                    selectedSymbol={selectedSymbol}
                    favorite={favoriteSet.has(item.symbol)}
                    onSelect={selectSymbol}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}

                {scanState !== "loading" && filteredBelowResults.length === 0 ? (
                  <div className="empty-state">
                    {showFavoritesOnly
                      ? "Nenhuma favorita abaixo da MA 800 e acima da BB inferior 8000 / 3 apareceu."
                      : "Nenhuma altcoin abaixo da MA 800 e acima da BB inferior 8000 / 3 apareceu."}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="table-card above-table secondary-table">
              <div className="table-title">
                <TrendingUp size={18} />
                <span>{filteredAboveResults.length} acima</span>
                <div className="btc-chart-actions" aria-label="Timeframes dos graficos">
                  <button
                    className={chartMode === CHART_MODES.btc ? "btc-chart-button active" : "btc-chart-button"}
                    type="button"
                    onClick={() => {
                      setChartMode(CHART_MODES.btc);
                      setChartSymbol(BTC_CHART_SYMBOL);
                      if (isCompactLayout) {
                        setBtcQuadOpen(true);
                      } else {
                        setChartOverlayOpen(false);
                      }
                    }}
                  >
                    BTC Graf.
                  </button>
                </div>
              </div>

              <div className="coin-list secondary-list">
                {filteredAboveResults.map((item) => (
                  <CoinRow
                    key={item.symbol}
                    item={item}
                    selectedSymbol={selectedSymbol}
                    favorite={favoriteSet.has(item.symbol)}
                    onSelect={selectSymbol}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}

                {scanState !== "loading" && filteredAboveResults.length === 0 ? (
                  <div className="empty-state">
                    {showFavoritesOnly
                      ? "Nenhuma favorita acima da MA 800 e abaixo da BB superior 5000 / 2 apareceu."
                      : "Nenhuma altcoin acima da MA 800 e abaixo da BB superior 5000 / 2 apareceu."}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </aside>

        <section className={chartOverlayOpen ? "detail-panel mobile-chart-open" : "detail-panel"}>
          <button className="mobile-chart-close" type="button" onClick={() => setChartOverlayOpen(false)}>
            <X size={18} />
            Fechar
          </button>

          <div className={chartMode === CHART_MODES.alt ? "selected-strip" : "selected-strip btc-dashboard"}>
            <SelectedMetric label="Preco" value={formatPrice(selected?.price)} />
            <SelectedMetric label="BB 8000 Inf" value={formatPrice(selected?.bbLower8000)} />
            <SelectedMetric label="BB 5000 Sup" value={formatPrice(selected?.bbUpper5000)} />
            <SelectedMetric label="MA 800" value={formatPrice(selected?.ma800)} />
            <SelectedMetric
              label="Posicao MA 800"
              value={selected?.maPosition ? (selected.maPosition === "above" ? "Acima" : "Abaixo") : null}
            />
            <SelectedMetric label="ADX 14" value={formatNumber(selected?.adx)} />
            <SelectedMetric label="vs BTC 24h" value={formatPercent(selected?.relativeToBtcPercent)} danger={selected?.relativeToBtcPercent < 0} />
          </div>

          {chartMode === CHART_MODES.btc && !isCompactLayout ? (
            <BtcQuadView embedded theme={theme} onFullscreen={() => setBtcQuadOpen(true)} />
          ) : null}

          {chartMode === CHART_MODES.alt && (!isCompactLayout || chartOverlayOpen) ? (
              <div className="alt-chart-grid">
                {ALT_CHART_TIMEFRAMES.map((timeframe) => (
                  <CryptoChart
                    key={`${chartMode}-${chartSymbol || "empty-chart"}-${timeframe}`}
                    symbol={chartSymbol || BTC_CHART_SYMBOL}
                    candles={chartCandles[timeframe] || []}
                    liveStatus={liveStatus[timeframe] || "loading"}
                    error={chartError[timeframe] || ""}
                    theme={theme}
                    mode={chartMode}
                    timeframe={timeframe}
                  />
                ))}
              </div>
            ) : null}
        </section>
      </section>

      {btcQuadOpen ? <BtcQuadView theme={theme} onClose={() => setBtcQuadOpen(false)} /> : null}
    </main>
  );
}

function ScannerControls({
  filters,
  setFilters,
  showFavoritesOnly,
  setShowFavoritesOnly,
  favoriteSymbols,
  visibleFavoriteCount,
  query,
  setQuery,
  scanState,
  progress,
  progressPercent,
  error,
}) {
  return (
    <>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Scanner</p>
          <h2>Filtros</h2>
        </div>
        <SlidersHorizontal size={20} />
      </div>

      <div className="filter-grid">
        <label>
          <span>Universo</span>
          <select
            value={filters.universeSize}
            onChange={(event) => setFilters((current) => ({ ...current, universeSize: Number(event.target.value) }))}
          >
            <option value={0}>Todas as moedas</option>
            <option value={30}>Top 30 volume</option>
            <option value={60}>Top 60 volume</option>
            <option value={100}>Top 100 volume</option>
            <option value={120}>Top 120 volume</option>
            <option value={150}>Top 150 volume</option>
          </select>
        </label>

        <label>
          <span>Volume 24h minimo</span>
          <select
            value={filters.minQuoteVolume}
            onChange={(event) => setFilters((current) => ({ ...current, minQuoteVolume: Number(event.target.value) }))}
          >
            <option value={0}>Sem minimo</option>
            <option value={5_000_000}>US$ 5M</option>
            <option value={20_000_000}>US$ 20M</option>
            <option value={50_000_000}>US$ 50M</option>
            <option value={100_000_000}>US$ 100M</option>
          </select>
        </label>

        <label>
          <span>Spread maximo</span>
          <select
            value={filters.maxSpreadPercent}
            onChange={(event) => setFilters((current) => ({ ...current, maxSpreadPercent: Number(event.target.value) }))}
          >
            <option value={Number.POSITIVE_INFINITY}>Sem limite</option>
            <option value={0.2}>0,20%</option>
            <option value={0.45}>0,45%</option>
            <option value={0.8}>0,80%</option>
          </select>
        </label>

        <button
          className={showFavoritesOnly ? "favorite-filter active" : "favorite-filter"}
          type="button"
          onClick={() => setShowFavoritesOnly((current) => !current)}
          title={`Mostrar apenas favoritas. Visiveis agora: ${visibleFavoriteCount}/${favoriteSymbols.length}`}
        >
          <Star size={16} />
          <span>Favoritos</span>
          <strong>{favoriteSymbols.length}</strong>
        </button>

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={filters.autoRefresh}
            onChange={(event) => setFilters((current) => ({ ...current, autoRefresh: event.target.checked }))}
          />
          <span>Atualizar a cada 15 minutos</span>
        </label>
      </div>

      <div className="search-box">
        <Search size={18} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar BTC, ETH, SOL..." />
      </div>

      {progress.total ? (
        <div className="filter-note">
          Universo ativo: {formatUniverseCount(progress.total, filters.universeSize)} moedas validas
        </div>
      ) : null}

      {scanState === "loading" ? (
        <div className="progress-card">
          <div>
            <strong>{progressPercent}%</strong>
            <span>
              {progress.checked}/{progress.total || formatUniverseLimit(filters.universeSize)} moedas
            </span>
          </div>
          <div className="progress-track">
            <div style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      ) : null}

      {error ? <div className="error-card">{error}</div> : null}
    </>
  );
}

function StatCard({ icon, label, value }) {
  return (
    <article className="stat-card">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function CoinRow({ item, selectedSymbol, favorite, onSelect, onToggleFavorite }) {
  const isAbove = item.trendDirection === "bullish";
  const selectCurrent = () => onSelect(item.symbol);
  const selectByKeyboard = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectCurrent();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={["coin-row", isAbove ? "above" : "below", item.symbol === selectedSymbol ? "active" : ""]
        .filter(Boolean)
        .join(" ")}
      onClick={selectCurrent}
      onKeyDown={selectByKeyboard}
    >
      <div className="coin-main">
        <strong>{item.baseAsset}</strong>
        <span>{item.symbol}</span>
      </div>
      <div className="coin-price">
        <button
          className={favorite ? "favorite-star active" : "favorite-star"}
          type="button"
          aria-label={favorite ? `Remover ${item.symbol} dos favoritos` : `Favoritar ${item.symbol}`}
          title={favorite ? "Remover favorito" : "Favoritar"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite(item.symbol);
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Star size={15} fill={favorite ? "currentColor" : "none"} />
        </button>
        <strong>{formatPrice(item.price)}</strong>
        <span className={item.priceDistancePercent >= 0 ? "success" : "danger"}>{formatPercent(item.priceDistancePercent)}</span>
      </div>
      <div className="coin-tags">
        <span>{item.trend}</span>
        <span className={item.relativeToBtcPercent >= 0 ? "tag-positive" : "tag-negative"}>{item.relativeLabel}</span>
        <span>ADX {formatNumber(item.adx)}</span>
      </div>
    </div>
  );
}

function StatusPill({ icon, label }) {
  return (
    <span className="status-pill">
      {icon}
      {label}
    </span>
  );
}

function SelectedMetric({ label, value, danger }) {
  return (
    <div className="selected-metric">
      <span>{label}</span>
      <strong className={danger ? "danger" : ""}>{value || "-"}</strong>
    </div>
  );
}

function formatNumber(value, digits = 1) {
  if (!Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

function formatUniverseLimit(value) {
  return value > 0 ? value : "todas";
}

function formatUniverseCount(total, limit) {
  if (limit > 0 && total > limit) return `${total} (top ${limit} + HYPE)`;
  return limit > 0 ? `${total}/${limit}` : `${total}`;
}

async function fetchCandlesWithRetry(symbol, signal, limit, interval) {
  let lastError;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetchCandles(symbol, limit, signal, interval);
    } catch (error) {
      lastError = error;
      if (signal.aborted) throw error;
      await wait(450);
    }
  }

  throw lastError;
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function mergeFetchedCandles(current, incoming, limit) {
  const byOpenTime = new Map((current || []).map((candle) => [candle.openTime, candle]));
  incoming.forEach((candle) => byOpenTime.set(candle.openTime, candle));
  return [...byOpenTime.values()]
    .sort((a, b) => a.openTime - b.openTime)
    .slice(-limit);
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

function readStoredFavorites() {
  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    const parsed = JSON.parse(raw || "[]");
    return normalizeFavoriteSymbols(parsed);
  } catch {
    return [];
  }
}

function normalizeFavoriteSymbols(symbols) {
  if (!Array.isArray(symbols)) return [];
  return [...new Set(symbols.map(normalizeFavoriteSymbol).filter(Boolean))].sort();
}

function normalizeFavoriteSymbol(symbol) {
  if (typeof symbol !== "string") return "";
  const normalized = symbol.trim().toUpperCase();
  return normalized.endsWith("USDT") ? normalized : "";
}

function readStoredTheme() {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function writeLocalStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable on some mobile/private browser sessions.
  }
}

