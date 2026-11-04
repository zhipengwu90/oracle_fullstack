"use client";

import { useEffect, useRef, useState } from "react";

// What the Watchlist and My holdings tabs have in common.

export type Market = "CA" | "US";
export type AssetType = "stock" | "etf";

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

// As it arrives on an API row: null if Yahoo no longer knows the symbol, or
// {error} if fetching it failed this time.
export type RowQuote = Quote | { error: string } | null;

type Suggestion = {
  symbol: string;
  name: string | null;
  exchange: string | null;
  market: Market;
  asset_type: AssetType;
};

export const REFRESH_MS = 15_000; // matches the backend's quote cache
const SEARCH_DELAY_MS = 300;

const MARKETS: { value: Market; label: string }[] = [
  { value: "CA", label: "🇨🇦 Canada" },
  { value: "US", label: "🇺🇸 US" },
];

export async function errorMessage(res: Response) {
  try {
    const data = await res.json();
    // A serializer's field errors look like {"shares": ["Shares must be..."]}.
    return data.error ?? data.detail ?? Object.values(data).flat()[0] ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export function hasQuote(q: RowQuote): q is Quote {
  return !!q && !("error" in q);
}

export function money(value: number | null, currency: string | null) {
  if (value === null) return "—";
  // en-CA writes USD as "US$", which keeps the two currencies apart at a glance.
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: currency ?? "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  }).format(value);
}

export function signed(value: number, digits = 2) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

export function changeColor(value: number | null) {
  if (!value) return "text-foreground/60";
  return value > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
}

// All times are shown in Pacific time. Pinning the zone also makes the
// server render (UTC) and the browser render agree.
export const TIME_ZONE = "America/Vancouver";

function clockTime(d: Date) {
  return d.toLocaleTimeString("en-US", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit", second: "2-digit" });
}

export function Badge({ children, tone }: { children: React.ReactNode; tone: "accent" | "muted" }) {
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

export function LiveStatus({ refreshing, updatedAt, onClick }: { refreshing: boolean; updatedAt: Date; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
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
  );
}

export function MarketToggle({ market, onChange }: { market: Market; onChange: (market: Market) => void }) {
  return (
    <div className="flex rounded-md border border-foreground/20 p-0.5 text-sm" role="group" aria-label="Market">
      {MARKETS.map((m) => (
        <button
          key={m.value}
          type="button"
          onClick={() => onChange(m.value)}
          aria-pressed={market === m.value}
          className={`rounded px-3 py-1.5 whitespace-nowrap ${
            market === m.value ? "bg-accent/15 font-medium text-accent" : "text-foreground/70 hover:text-foreground"
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

// Ticker or company-name box with suggestions as you type. Choosing one calls
// onPick; Enter with no list open falls through to the surrounding form.
export function SymbolInput({
  market,
  value,
  onChange,
  onPick,
}: {
  market: Market;
  value: string;
  onChange: (value: string) => void;
  onPick: (symbol: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [highlight, setHighlight] = useState(-1);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Suggest as you type, after a short pause; a newer keystroke cancels the older request.
  useEffect(() => {
    const q = value.trim();
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
        // Aborted or offline - the typed symbol still works.
      }
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, market]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function pick(symbol: string) {
    setSuggestions([]);
    setOpen(false);
    onPick(symbol);
  }

  // Enter picks the highlighted suggestion; otherwise the typed ticker if it is
  // one (SHOP, SHOP.TO), else the top suggestion - so "Telus" + Enter picks T.TO.
  function enterSymbol() {
    if (highlight >= 0) return suggestions[highlight].symbol;
    const typed = value.trim().toUpperCase();
    const exact = suggestions.find((s) => s.symbol === typed || s.symbol.split(".")[0] === typed);
    return exact ? value : suggestions[0].symbol;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, -1));
    } else if (e.key === "Enter" && showList) {
      e.preventDefault();
      pick(enterSymbol());
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // Stale suggestions from an earlier query stay hidden once the box is cleared.
  const showList = open && value.trim() !== "" && suggestions.length > 0;

  return (
    <div ref={boxRef} className="relative min-w-0 flex-1">
      <input
        type="search"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
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
                onClick={() => pick(s.symbol)}
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
  );
}
