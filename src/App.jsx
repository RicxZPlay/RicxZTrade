import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bell,
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
import {
  buildSocketUrl,
  DEFAULT_FILTERS,
  fetchCandles,
  formatClock,
  formatIndicator,
  formatPercent,
  formatPrice,
  mergeLiveCandle,
  scanMarket,
} from "./market";
import "./App.css";

const REFRESH_INTERVAL_MS = 240_000;
const FAVORITES_STORAGE_KEY = "ricxz.cryptoFavorites";
const THEME_STORAGE_KEY = "ricxz.theme";

export default function App() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [results, setResults] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [chartSymbol, setChartSymbol] = useState("");
  const [chartCandles, setChartCandles] = useState([]);
  const [favoriteSymbols, setFavoriteSymbols] = useState(readStoredFavorites);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [theme, setTheme] = useState(readStoredTheme);
  const [chartOverlayOpen, setChartOverlayOpen] = useState(false);
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
    setChartError("");
    setLiveStatus("loading");
    if (isCompactLayout) {
      setChartOverlayOpen(true);
    }
  }, [isCompactLayout]);

  const toggleFavorite = useCallback((symbol) => {
    setFavoriteSymbols((current) => {
      if (current.includes(symbol)) return current.filter((item) => item !== symbol);
      return [...current, symbol].sort();
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
        return signals.find((item) => item.belowEma)?.symbol || signals[0]?.symbol || current || "BTCUSDT";
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
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteSymbols));
  }, [favoriteSymbols]);

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!selectedSymbol) return undefined;

    const controller = new AbortController();
    let socket;
    const requestId = chartRequestRef.current + 1;
    chartRequestRef.current = requestId;

    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setLiveStatus("loading");
        setChartError("");
      }
    });

    fetchCandlesWithRetry(selectedSymbol, controller.signal)
      .then((nextCandles) => {
        if (controller.signal.aborted || chartRequestRef.current !== requestId) return;
        setChartSymbol(selectedSymbol);
        setChartCandles(nextCandles);
        setChartError("");

        socket = new WebSocket(buildSocketUrl(selectedSymbol));
        socket.onopen = () => {
          if (!controller.signal.aborted && chartRequestRef.current === requestId) {
            setLiveStatus("online");
          }
        };
        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (controller.signal.aborted || chartRequestRef.current !== requestId || payload?.s !== selectedSymbol) return;
            setChartCandles((current) => mergeLiveCandle(current, payload));
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
  }, [selectedSymbol]);

  const favoriteSet = useMemo(() => new Set(favoriteSymbols), [favoriteSymbols]);
  const belowResults = useMemo(() => results.filter((item) => item.belowEma), [results]);
  const aboveResults = useMemo(() => results.filter((item) => item.aboveEma), [results]);

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
    const oversold = results.filter((item) => item.rsi < 35).length;
    const dpoPositive = results.filter((item) => item.dpo120 > 0).length;

    return {
      below: belowResults.length,
      above: aboveResults.length,
      oversold,
      dpoPositive,
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
          <StatCard icon={<TrendingDown size={20} />} label="Abaixo da EMA" value={summary.below} />
          <StatCard icon={<TrendingUp size={20} />} label="Acima da EMA" value={summary.above} />
          <StatCard icon={<Activity size={20} />} label="RSI abaixo de 35" value={summary.oversold} />
          <StatCard icon={<Bell size={20} />} label="DPO 120 positivo" value={summary.dpoPositive} />
        </section>

        <div className="mobile-controls-slot">{scannerControls}</div>
      </section>

      <section className="workspace">
        <aside className="scanner-panel">
          <div className="desktop-controls-slot">{scannerControls}</div>

          <div className="coins-stage">
            <div className="table-card">
              <div className="table-title">
                <Filter size={18} />
                <span>{filteredBelowResults.length} abaixo da EMA</span>
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
                      ? "Nenhuma favorita abaixo da EMA apareceu nos filtros atuais."
                      : "Nenhuma moeda abaixo da EMA passou pelos filtros atuais."}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="table-card secondary-table">
              <div className="table-title">
                <TrendingUp size={18} />
                <span>{filteredAboveResults.length} acima da EMA</span>
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
                      ? "Nenhuma favorita acima da EMA apareceu nos filtros atuais."
                      : "Nenhuma moeda acima da EMA passou pelos filtros atuais."}
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

          <div className="selected-strip">
            <SelectedMetric label="Preco" value={formatPrice(selected?.price)} />
            <SelectedMetric label="EMA 450" value={formatPrice(selected?.ema450)} />
            <SelectedMetric label="Distancia" value={formatPercent(selected?.distancePercent)} danger />
            <SelectedMetric label="DPO 120" value={formatIndicator(selected?.dpo120)} danger={selected?.dpo120 < 0} />
            <SelectedMetric label="RSI 14" value={Number.isFinite(selected?.rsi) ? selected.rsi.toFixed(1) : "-"} />
            <SelectedMetric label="Ultimo candle" value={formatClock(selected?.lastCandleTime)} />
          </div>

          {!isCompactLayout || chartOverlayOpen ? (
            <CryptoChart
              key={chartSymbol || "empty-chart"}
              symbol={chartSymbol || selectedSymbol}
              candles={chartCandles}
              liveStatus={liveStatus}
              error={chartError}
              theme={theme}
            />
          ) : null}
        </section>
      </section>
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
            <option value={30}>Top 30 volume</option>
            <option value={60}>Top 60 volume</option>
            <option value={100}>Top 100 volume</option>
            <option value={150}>Top 150 volume</option>
          </select>
        </label>

        <label>
          <span>Volume 24h minimo</span>
          <select
            value={filters.minQuoteVolume}
            onChange={(event) => setFilters((current) => ({ ...current, minQuoteVolume: Number(event.target.value) }))}
          >
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
            <option value={0.2}>0,20%</option>
            <option value={0.45}>0,45%</option>
            <option value={0.8}>0,80%</option>
          </select>
        </label>

        <button
          className={showFavoritesOnly ? "favorite-filter active" : "favorite-filter"}
          type="button"
          onClick={() => setShowFavoritesOnly((current) => !current)}
          title="Mostrar apenas moedas favoritadas nas duas listas"
        >
          <Star size={16} />
          <span>Favoritos</span>
          <strong>{showFavoritesOnly ? visibleFavoriteCount : favoriteSymbols.length}</strong>
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

      {scanState === "loading" ? (
        <div className="progress-card">
          <div>
            <strong>{progressPercent}%</strong>
            <span>
              {progress.checked}/{progress.total || filters.universeSize} moedas
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
  const isAbove = item.distancePercent >= 0;
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
      className={item.symbol === selectedSymbol ? "coin-row active" : "coin-row"}
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
        >
          <Star size={15} fill={favorite ? "currentColor" : "none"} />
        </button>
        <strong>{formatPrice(item.price)}</strong>
        <span className={isAbove ? "success" : "danger"}>{formatPercent(item.distancePercent)}</span>
      </div>
      <div className="coin-tags">
        <span>{item.trend}</span>
        <span className={item.dpo120 >= 0 ? "tag-positive" : "tag-negative"}>
          DPO {formatIndicator(item.dpo120)}
        </span>
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

async function fetchCandlesWithRetry(symbol, signal) {
  let lastError;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetchCandles(symbol, 1000, signal);
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
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [query]);

  return matches;
}

function readStoredFavorites() {
  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function readStoredTheme() {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}
