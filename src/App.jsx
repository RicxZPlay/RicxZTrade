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
} from "./market";
import "./App.css";

const REFRESH_INTERVAL_MS = 240_000;
const FAVORITES_STORAGE_KEY = "ricxz.cryptoFavorites";
const THEME_STORAGE_KEY = "ricxz.theme";
const BTC_CHART_SYMBOL = "BTCUSDT";
const CHART_MODES = {
  btc: "btc",
  alt: "alt",
};

export default function App() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [results, setResults] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [chartSymbol, setChartSymbol] = useState(BTC_CHART_SYMBOL);
  const [chartMode, setChartMode] = useState(CHART_MODES.btc);
  const [altTimeframe, setAltTimeframe] = useState(DEFAULT_ALT_CHART_TIMEFRAME);
  const [chartCandles, setChartCandles] = useState([]);
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
  const [liveStatus, setLiveStatus] = useState("offline");
  const [chartError, setChartError] = useState("");
  const scanAbortRef = useRef(null);
  const chartRequestRef = useRef(0);

  const selectSymbol = useCallback((symbol) => {
    setSelectedSymbol(symbol);
    setChartMode(CHART_MODES.alt);
    setChartSymbol(symbol);
    setChartError("");
    setLiveStatus("loading");
    if (isCompactLayout) {
      setChartOverlayOpen(true);
    }
  }, [isCompactLayout]);

  const showAltChart = useCallback((timeframe = altTimeframe) => {
    if (!selectedSymbol) return;
    setAltTimeframe(timeframe);
    setChartMode(CHART_MODES.alt);
    setChartSymbol(selectedSymbol);
    setChartError("");
    setLiveStatus("loading");
    if (isCompactLayout) {
      setChartOverlayOpen(true);
    }
  }, [altTimeframe, isCompactLayout, selectedSymbol]);

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
    let socket;
    const requestId = chartRequestRef.current + 1;
    chartRequestRef.current = requestId;
    const altTimeframeConfig = ALT_CHART_INTERVALS[altTimeframe] || ALT_CHART_INTERVALS[DEFAULT_ALT_CHART_TIMEFRAME];
    const targetSymbol = chartSymbol;
    const targetInterval = altTimeframeConfig.interval;
    const targetLimit = altTimeframeConfig.historyLimit;

    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setLiveStatus("loading");
        setChartError("");
      }
    });

    fetchCandlesWithRetry(targetSymbol, controller.signal, targetLimit, targetInterval)
      .then((nextCandles) => {
        if (controller.signal.aborted || chartRequestRef.current !== requestId) return;
        setChartCandles(nextCandles);
        setChartError("");

        socket = new WebSocket(buildSocketUrl(targetSymbol, targetInterval));
        socket.onopen = () => {
          if (!controller.signal.aborted && chartRequestRef.current === requestId) {
            setLiveStatus("online");
          }
        };
        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (controller.signal.aborted || chartRequestRef.current !== requestId || payload?.s !== targetSymbol) return;
            setChartCandles((current) => mergeLiveCandle(current, payload, targetLimit));
          } catch {
            if (!controller.signal.aborted && chartRequestRef.current === requestId) setLiveStatus("offline");
          }
        };
        socket.onerror = () => {
          if (!controller.signal.aborted && chartRequestRef.current === requestId) setLiveStatus("offline");
        };
        socket.onclose = () => {
          if (!controller.signal.aborted && chartRequestRef.current === requestId) setLiveStatus("offline");
        };
      })
      .catch((loadError) => {
        if (!controller.signal.aborted && chartRequestRef.current === requestId) {
          setLiveStatus("offline");
          setChartError(loadError?.message || "Nao foi possivel carregar o grafico desta moeda.");
        }
      });

    return () => {
      controller.abort();
      socket?.close();
    };
  }, [altTimeframe, chartMode, chartSymbol]);

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
          <StatCard icon={<TrendingDown size={20} />} label="Baixa 1H" value={summary.below} />
          <StatCard icon={<TrendingUp size={20} />} label="Alta 1H" value={summary.above} />
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
                <span>{filteredBelowResults.length} em baixa 1H</span>
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
                      ? "Nenhuma favorita em baixa 1H apareceu nos filtros atuais."
                      : "Nenhuma altcoin em baixa 1H passou pelos filtros atuais."}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="table-card above-table secondary-table">
              <div className="table-title">
                <TrendingUp size={18} />
                <span>{filteredAboveResults.length} em alta 1H</span>
                <div className="btc-chart-actions" aria-label="Timeframes dos graficos">
                  <button
                    className={chartMode === CHART_MODES.btc ? "btc-chart-button active" : "btc-chart-button"}
                    type="button"
                    onClick={() => {
                      setChartMode(CHART_MODES.btc);
                      setChartSymbol(BTC_CHART_SYMBOL);
                      setChartOverlayOpen(false);
                    }}
                  >
                    BTC 4 Graf.
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
                      ? "Nenhuma favorita em alta 1H apareceu nos filtros atuais."
                      : "Nenhuma altcoin em alta 1H passou pelos filtros atuais."}
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

          <div className={chartMode === CHART_MODES.alt ? "selected-strip with-timeframe" : "selected-strip btc-dashboard"}>
            {chartMode === CHART_MODES.alt ? (
              <div className="chart-timeframe-actions" aria-label="Timeframe do grafico da altcoin">
                <button
                  className={altTimeframe === "1h" ? "btc-chart-button active" : "btc-chart-button"}
                  type="button"
                  onClick={() => showAltChart("1h")}
                >
                  Alt 1H
                </button>
                <button
                  className={altTimeframe === "4h" ? "btc-chart-button active" : "btc-chart-button"}
                  type="button"
                  onClick={() => showAltChart("4h")}
                >
                  Alt 4H
                </button>
              </div>
            ) : null}
            <SelectedMetric label="Preco" value={formatPrice(selected?.price)} />
            <SelectedMetric label="EMA 50" value={formatPrice(selected?.ema50)} />
            <SelectedMetric label="EMA 450" value={formatPrice(selected?.ema450)} />
            <SelectedMetric label="ADX 14" value={formatNumber(selected?.adx)} />
            <SelectedMetric label="Vol rel" value={formatRatio(selected?.volumeRelative)} />
            <SelectedMetric label="vs BTC 24h" value={formatPercent(selected?.relativeToBtcPercent)} danger={selected?.relativeToBtcPercent < 0} />
          </div>

          {chartMode === CHART_MODES.btc && !isCompactLayout ? (
            <BtcQuadView embedded theme={theme} onFullscreen={() => setBtcQuadOpen(true)} />
          ) : null}

          {chartMode === CHART_MODES.alt && (!isCompactLayout || chartOverlayOpen) ? (
              <CryptoChart
                key={`${chartMode}-${chartSymbol || "empty-chart"}-${altTimeframe}`}
                symbol={chartSymbol || BTC_CHART_SYMBOL}
                candles={chartCandles}
                liveStatus={liveStatus}
                error={chartError}
                theme={theme}
                mode={chartMode}
                timeframe={altTimeframe}
              />
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
          <span>Atualizar a cada 4 minutos</span>
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
        <span className={isAbove ? "success" : "danger"}>{formatPercent(item.emaSpreadPercent)}</span>
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

function formatRatio(value) {
  if (!Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}x`;
}

function formatUniverseLimit(value) {
  return value > 0 ? value : "todas";
}

function formatUniverseCount(total, limit) {
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
