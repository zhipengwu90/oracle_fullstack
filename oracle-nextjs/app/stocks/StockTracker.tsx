"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "../lib/csrf";

type Market = "CA" | "US";
type AssetType = "stock" | "etf";

export type Quote = {
  symbol: string;
  name: string | null;
  exchange_name: string | null;
  currency: string | null;
  price: number | null;
  change: number | null;
  change_percent: number | null;
  day_high: number | null;
  day_low: number | null;
  year_high: number | null;
  year_low: number | null;
  market_time: number | null; // unix seconds
  history: number[]; // ~1 month of daily closes
  source: "finnhub" | "yahoo"; // finnhub = real-time (US only), yahoo = a few minutes behind
};

// One row of GET /api/stocks/. quote is null if Yahoo no longer knows the
// symbol, or {error} if fetching it failed this time.
export type StockRow = {
  id: number;
  symbol: string;
  market: Market;
  asset_type: AssetType;
  name: string | null;
  position: number;
  created_at: string;
  quote: Quote | { error: string } | null;
};

type Suggestion = {
  symbol: string;
  name: string | null;
  exchange: string | null;
  market: Market;
  asset_type: AssetType;
};

const REFRESH_MS = 15_000; // matches the backend's quote cache
const STALE_MS = 20 * 60_000; // Yahoo is normally 1-3 minutes behind; flag anything much older
const SEARCH_DELAY_MS = 300;

const MARKETS: { value: Market; label: string }[] = [
  { value: "CA", label: "🇨🇦 Canada" },
  { value: "US", label: "🇺🇸 US" },
];

async function errorMessage(res: Response) {
  try {
    const data = await res.json();
    return data.error ?? data.detail ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

function hasQuote(q: StockRow["quote"]): q is Quote {
  return !!q && !("error" in q);
}

function priceMap(rows: StockRow[]) {
  return new Map(rows.map((r) => [r.id, hasQuote(r.quote) ? r.quote.price : null]));
}

function money(value: number | null, currency: string | null) {
  if (value === null) return "—";
  // en-CA writes USD as "US$", which keeps the two currencies apart at a glance.
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: currency ?? "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  }).format(value);
}

function signed(value: number, digits = 2) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function changeColor(value: number | null) {
  if (!value) return "text-foreground/60";
  return value > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
}

// All times are shown in Pacific time. Pinning the zone also makes the
// server render (UTC) and the browser render agree.
const TIME_ZONE = "America/Vancouver";
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TIME_ZONE });

function clockTime(d: Date) {
  return d.toLocaleTimeString("en-US", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit", second: "2-digit" });
}

// "12:19:42 PM PDT", or "Oct 29, 1:00 PM PDT" when it isn't from today (market closed).
function quoteTime(unixSeconds: number, now: Date) {
  const d = new Date(unixSeconds * 1000);
  const today = dayKey(d) === dayKey(now);
  return d.toLocaleString("en-US", {
    timeZone: TIME_ZONE,
    timeZoneName: "short",
    ...(today
      ? { hour: "numeric", minute: "2-digit", second: "2-digit" }
      : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
  });
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 96;
  const h = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - ((v - min) / span) * (h - 4)}`)
    .join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-24" aria-label="Last month">
      <polyline
        points={points}
        fill="none"
        strokeWidth={1.5}
        strokeLinejoin="round"
        className={up ? "stroke-emerald-500" : "stroke-red-500"}
      />
    </svg>
  );
}

// Where today's price sits between the 52-week low and high.
function RangeBar({ low, high, value, currency }: { low: number | null; high: number | null; value: number | null; currency: string | null }) {
  if (low === null || high === null || value === null) return <span className="text-foreground/40">—</span>;
  const pct = high > low ? Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100)) : 50;
  return (
    <div className="w-32" title={`52-week range ${money(low, currency)} – ${money(high, currency)}`}>
      <div className="relative h-1 rounded-full bg-foreground/15">
        <span
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-foreground/50">
        <span>{low.toFixed(2)}</span>
        <span>{high.toFixed(2)}</span>
      </div>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "accent" | "muted" }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium uppercase ${
        tone === "accent" ? "bg-accent/15 text-accent" : "bg-foreground/10 text-foreground/70"
      }`}
    >
      {children}
    </span>
  );
}

function AddStock({ onAdded }: { onAdded: (row: StockRow) => void }) {
  const [market, setMarket] = useState<Market>("CA");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [highlight, setHighlight] = useState(-1);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Suggest as you type, after a short pause; a newer keystroke cancels the older request.
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q, market });
        const res = await fetch(`/api/stocks/search/?${params}`, { signal: controller.signal });
        if (!res.ok) return;
        setSuggestions(await res.json());
        setHighlight(-1);
      } catch {
        // Aborted or offline - the Add button still works with the typed symbol.
      }
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, market]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  async function add(symbol: string) {
    if (!symbol.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/stocks/", {
        method: "POST",
        headers: csrfHeaders(),
        body: JSON.stringify({ symbol, market }),
      });
      if (!res.ok) throw new Error(await errorMessage(res));
      onAdded(await res.json());
      setQuery("");
      setSuggestions([]);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }

  // Enter adds the highlighted suggestion; otherwise the typed ticker if it is
  // one (SHOP, SHOP.TO), else the top suggestion - so "Telus" + Enter adds T.TO.
  function enterSymbol() {
    if (!showList) return query;
    if (highlight >= 0) return suggestions[highlight].symbol;
    const typed = query.trim().toUpperCase();
    const exact = suggestions.find((s) => s.symbol === typed || s.symbol.split(".")[0] === typed);
    return exact ? query : suggestions[0].symbol;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      add(enterSymbol());
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // Stale suggestions from an earlier query stay hidden once the box is cleared.
  const showList = open && query.trim() !== "" && suggestions.length > 0;

  return (
    <div className="mb-8 rounded-lg border border-foreground/10 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-foreground/20 p-0.5 text-sm" role="group" aria-label="Market">
          {MARKETS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMarket(m.value)}
              aria-pressed={market === m.value}
              className={`rounded px-3 py-1.5 whitespace-nowrap ${
                market === m.value ? "bg-accent/15 font-medium text-accent" : "text-foreground/70 hover:text-foreground"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div ref={boxRef} className="relative min-w-0 flex-1">
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={market === "CA" ? "Ticker or name, e.g. SHOP, XEQT, Royal Bank" : "Ticker or name, e.g. AAPL, VOO, Microsoft"}
            role="combobox"
            aria-expanded={showList}
            aria-controls="stock-suggestions"
            aria-autocomplete="list"
            className="w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
          {showList && (
            <ul
              id="stock-suggestions"
              role="listbox"
              className="absolute top-full right-0 left-0 z-20 mt-1 max-h-80 overflow-auto rounded-md border border-foreground/15 bg-background py-1 shadow-lg"
            >
              {suggestions.map((s, i) => (
                <li key={s.symbol} role="option" aria-selected={i === highlight}>
                  <button
                    type="button"
                    onClick={() => add(s.symbol)}
                    onMouseEnter={() => setHighlight(i)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${
                      i === highlight ? "bg-foreground/5" : ""
                    }`}
                  >
                    <span className="w-24 shrink-0 font-semibold">{s.symbol}</span>
                    <span className="min-w-0 flex-1 truncate text-foreground/70">{s.name}</span>
                    <span className="hidden text-xs text-foreground/50 sm:inline">{s.exchange}</span>
                    <Badge tone={s.asset_type === "etf" ? "accent" : "muted"}>{s.asset_type}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          onClick={() => add(query)}
          disabled={adding || !query.trim()}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-80 disabled:opacity-40"
        >
          {adding ? "Adding…" : "Add"}
        </button>
      </div>
      <p className="mt-2 text-xs text-foreground/50">
        {market === "CA"
          ? "TSX, TSX Venture, Cboe Canada and CSE listings. A plain ticker like SHOP is looked up on the TSX first."
          : "NYSE, NASDAQ and NYSE Arca listings."}
      </p>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

// Move the visible row at `from` to `to`. Rows hidden by a filter keep
// their slots, so reordering "Canada only" never shuffles the US rows.
function reorder(all: StockRow[], visibleIds: number[], from: number, to: number) {
  const moved = [...visibleIds];
  const [id] = moved.splice(from, 1);
  moved.splice(to, 0, id);
  const byId = new Map(all.map((r) => [r.id, r]));
  const shown = new Set(visibleIds);
  let k = 0;
  return all.map((r) => (shown.has(r.id) ? byId.get(moved[k++])! : r));
}

export default function StockTracker({ initialRows }: { initialRows: StockRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [marketFilter, setMarketFilter] = useState<Market | "all">("all");
  const [typeFilter, setTypeFilter] = useState<AssetType | "all">("all");
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  // Which way each row's price moved on the last refresh, for a brief flash.
  const [moves, setMoves] = useState<Record<number, "up" | "down">>({});
  // Last seen price per row id; only read and written inside refresh().
  const pricesRef = useRef(priceMap(initialRows));
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  // Polling would snap a row back mid-drag; only touched in event handlers.
  const draggingRef = useRef(false);
  const tbodyRef = useRef<HTMLTableSectionElement>(null);

  const refresh = useCallback(async () => {
    if (draggingRef.current) return;
    setRefreshing(true);
    try {
      const res = await fetch("/api/stocks/", { cache: "no-store" });
      if (!res.ok) throw new Error(await errorMessage(res));
      const next: StockRow[] = await res.json();
      const before = pricesRef.current;
      const after = priceMap(next);
      const changed: Record<number, "up" | "down"> = {};
      for (const [id, now] of after) {
        const old = before.get(id);
        if (old != null && now != null && now !== old) changed[id] = now > old ? "up" : "down";
      }
      pricesRef.current = after;
      setMoves(changed);
      setRows(next);
      setUpdatedAt(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Refresh every 15 seconds while the tab is visible.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  async function remove(id: number) {
    const res = await fetch(`/api/stocks/${id}/`, { method: "DELETE", headers: csrfHeaders() });
    if (!res.ok && res.status !== 404) return setError(await errorMessage(res));
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function added(row: StockRow) {
    setRows((prev) => [...prev, row]); // the server puts new symbols last too
  }

  async function saveOrder(ordered: StockRow[]) {
    const res = await fetch("/api/stocks/order/", {
      method: "POST",
      headers: csrfHeaders(),
      body: JSON.stringify({ ids: ordered.map((r) => r.id) }),
    });
    if (!res.ok) setError(`Couldn't save the new order: ${await errorMessage(res)}`);
  }

  function moveTo(id: number, to: number) {
    const visibleIds = visible.map((r) => r.id);
    const from = visibleIds.indexOf(id);
    if (from < 0 || to < 0 || to >= visibleIds.length || to === from) return null;
    const next = reorder(rows, visibleIds, from, to);
    setRows(next);
    return next;
  }

  // Drag by the handle. Pointer events (not HTML drag-and-drop) so it works
  // with touch on iPad/iPhone as well as a mouse.
  function onHandleDown(e: React.PointerEvent<HTMLButtonElement>, id: number) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setDragId(id);
  }

  function onHandleMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (dragId === null || !tbodyRef.current) return;
    // Target index = how many of the *other* rows sit above the pointer.
    let to = 0;
    for (const tr of Array.from(tbodyRef.current.rows)) {
      if (Number(tr.dataset.id) === dragId) continue;
      const box = tr.getBoundingClientRect();
      if (e.clientY > box.top + box.height / 2) to++;
    }
    moveTo(dragId, to);
  }

  function onHandleUp() {
    if (dragId === null) return;
    draggingRef.current = false;
    setDragId(null);
    saveOrder(rows);
  }

  function onHandleKey(e: React.KeyboardEvent<HTMLButtonElement>, id: number, index: number) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const next = moveTo(id, index + (e.key === "ArrowUp" ? -1 : 1));
    if (next) saveOrder(next);
  }

  const count = (market: Market | "all", type: AssetType | "all") =>
    rows.filter((r) => (market === "all" || r.market === market) && (type === "all" || r.asset_type === type)).length;
  const visible = rows.filter(
    (r) => (marketFilter === "all" || r.market === marketFilter) && (typeFilter === "all" || r.asset_type === typeFilter),
  );

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 ${
      active ? "border-accent bg-accent/15 text-accent" : "border-foreground/15 text-foreground/70 hover:text-foreground"
    }`;

  return (
    <div>
      <AddStock onAdded={added} />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {(["all", "CA", "US"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMarketFilter(m)} className={chip(marketFilter === m)}>
            {m === "all" ? "All markets" : m === "CA" ? "Canada" : "US"} ({count(m, typeFilter)})
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-foreground/15" aria-hidden="true" />
        {(["all", "stock", "etf"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTypeFilter(t)} className={chip(typeFilter === t)}>
            {t === "all" ? "All types" : t === "stock" ? "Stocks" : "ETFs"} ({count(marketFilter, t)})
          </button>
        ))}
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="ml-auto text-foreground/60 hover:text-foreground disabled:opacity-50"
        >
          <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle ${refreshing ? "animate-ping" : ""}`} />
          {refreshing ? "Updating…" : "Live"}
          {/* Server and browser render this a moment apart. */}
          <span suppressHydrationWarning className="ml-2 text-xs text-foreground/40">
            checked {clockTime(updatedAt)} PT
          </span>
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="py-8 text-sm text-foreground/60">
          {rows.length === 0
            ? "You're not tracking anything yet. Pick Canada or US above and search for a stock or ETF."
            : "Nothing matches these filters."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-foreground/10 text-left text-xs text-foreground/50 uppercase">
                <th className="w-6 py-2" aria-label="Reorder" />
                <th className="py-2 pr-3 font-medium">Symbol</th>
                <th className="py-2 pr-3 text-right font-medium">Price</th>
                <th className="py-2 pr-3 text-right font-medium">Today</th>
                <th className="hidden py-2 pr-3 font-medium md:table-cell">1 month</th>
                <th className="hidden py-2 pr-3 font-medium lg:table-cell">52-week</th>
                <th className="py-2" aria-label="Remove" />
              </tr>
            </thead>
            <tbody ref={tbodyRef} className="divide-y divide-foreground/10">
              {visible.map((row, index) => {
                const q = hasQuote(row.quote) ? row.quote : null;
                const move = moves[row.id];
                const stale = q?.market_time != null && updatedAt.getTime() - q.market_time * 1000 > STALE_MS;
                return (
                  <tr
                    key={row.id}
                    data-id={row.id}
                    className={`align-middle ${dragId === row.id ? "relative z-10 bg-foreground/5 shadow-lg" : ""}`}
                  >
                    <td className="py-3 pr-1">
                      <button
                        type="button"
                        onPointerDown={(e) => onHandleDown(e, row.id)}
                        onPointerMove={onHandleMove}
                        onPointerUp={onHandleUp}
                        onPointerCancel={onHandleUp}
                        onKeyDown={(e) => onHandleKey(e, row.id, index)}
                        aria-label={`Move ${row.symbol} (drag, or use the arrow keys)`}
                        title="Drag to reorder"
                        className={`touch-none rounded px-1 text-lg leading-none text-foreground/30 select-none hover:text-foreground/70 ${
                          dragId === row.id ? "cursor-grabbing text-accent" : "cursor-grab"
                        }`}
                      >
                        ⠿
                      </button>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{row.symbol}</span>
                        <Badge tone={row.asset_type === "etf" ? "accent" : "muted"}>{row.asset_type}</Badge>
                        <span className="text-xs" title={row.market === "CA" ? "Canada" : "US"}>
                          {row.market === "CA" ? "🇨🇦" : "🇺🇸"}
                        </span>
                      </div>
                      <div className="max-w-56 truncate text-xs text-foreground/60 sm:max-w-xs">
                        {q?.name ?? row.name}
                        {q?.exchange_name && <span className="text-foreground/40"> · {q.exchange_name}</span>}
                      </div>
                    </td>
                    {q ? (
                      <>
                        <td className="py-3 pr-3 text-right whitespace-nowrap tabular-nums">
                          {/* Keyed on the price so a new value remounts and replays the flash. */}
                          <span
                            key={q.price ?? "none"}
                            className={`rounded px-1 font-medium ${
                              move === "up" ? "flash-up" : move === "down" ? "flash-down" : ""
                            }`}
                          >
                            {money(q.price, q.currency)}
                          </span>
                          {q.market_time != null && (
                            <div
                              title={
                                stale
                                  ? "No newer trade reported - market closed, halted or thinly traded"
                                  : q.source === "finnhub"
                                    ? "Real-time price from Finnhub"
                                    : "From Yahoo Finance, usually a few minutes behind"
                              }
                              className={`text-[11px] ${stale ? "text-amber-600 dark:text-amber-400" : "text-foreground/40"}`}
                            >
                              {quoteTime(q.market_time, updatedAt)} · {q.source === "finnhub" ? "live" : "delayed"}
                            </div>
                          )}
                        </td>
                        <td className={`py-3 pr-3 text-right whitespace-nowrap tabular-nums ${changeColor(q.change)}`}>
                          {q.change !== null && q.change_percent !== null ? (
                            <>
                              <div>{signed(q.change_percent)}%</div>
                              <div className="text-xs">{signed(q.change)}</div>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="hidden py-3 pr-3 md:table-cell">
                          <Sparkline values={q.history} />
                        </td>
                        <td className="hidden py-3 pr-3 lg:table-cell">
                          <RangeBar low={q.year_low} high={q.year_high} value={q.price} currency={q.currency} />
                        </td>
                      </>
                    ) : (
                      <td colSpan={4} className="py-3 pr-3 text-right text-xs text-foreground/50">
                        {row.quote && "error" in row.quote ? "Price unavailable right now" : "No longer listed on Yahoo Finance"}
                      </td>
                    )}
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => remove(row.id)}
                        aria-label={`Stop tracking ${row.symbol}`}
                        className="rounded p-1 text-foreground/40 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
