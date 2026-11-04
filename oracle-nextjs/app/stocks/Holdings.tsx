"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "../lib/csrf";
import {
  Badge,
  LiveStatus,
  MarketToggle,
  REFRESH_MS,
  SymbolInput,
  changeColor,
  errorMessage,
  hasQuote,
  money,
  signed,
  type AssetType,
  type Market,
  type Quote,
  type RowQuote,
} from "./shared";

// One row of GET /api/stocks/holdings/: a single purchase. Decimals arrive as strings.
export type HoldingRow = {
  id: number;
  symbol: string;
  market: Market;
  asset_type: AssetType;
  name: string | null;
  shares: string;
  price: string;
  bought_on: string | null; // YYYY-MM-DD
  created_at: string;
  quote: RowQuote;
};

// All the purchases of one symbol, added up.
type Position = {
  symbol: string;
  market: Market;
  assetType: AssetType;
  name: string | null;
  quote: Quote | null;
  currency: string;
  lots: HoldingRow[];
  shares: number;
  cost: number;
  value: number | null; // null while there's no price
};

type Draft = {
  id: number | null; // the purchase being edited, null when adding
  market: Market;
  symbol: string;
  shares: string;
  price: string;
  boughtOn: string;
};

const emptyDraft = (market: Market = "CA", symbol = ""): Draft => ({ id: null, market, symbol, shares: "", price: "", boughtOn: "" });

function toPositions(rows: HoldingRow[]) {
  const bySymbol = new Map<string, Position>();
  for (const row of rows) {
    let p = bySymbol.get(row.symbol);
    if (!p) {
      const quote = hasQuote(row.quote) ? row.quote : null;
      p = {
        symbol: row.symbol,
        market: row.market,
        assetType: row.asset_type,
        name: quote?.name ?? row.name,
        quote,
        currency: quote?.currency ?? (row.market === "CA" ? "CAD" : "USD"),
        lots: [],
        shares: 0,
        cost: 0,
        value: null,
      };
      bySymbol.set(row.symbol, p);
    }
    p.lots.push(row);
    p.shares += Number(row.shares);
    p.cost += Number(row.shares) * Number(row.price);
  }
  const positions = [...bySymbol.values()];
  for (const p of positions) {
    if (p.quote?.price != null) p.value = p.shares * p.quote.price;
  }
  return positions;
}

// Totals per currency: there's no CAD/USD conversion, so they can't be added
// together. Positions without a price are left out of both sides of the gain.
function toTotals(positions: Position[]) {
  const totals = new Map<string, { cost: number; value: number }>();
  for (const p of positions) {
    if (p.value === null) continue;
    const t = totals.get(p.currency) ?? { cost: 0, value: 0 };
    t.cost += p.cost;
    t.value += p.value;
    totals.set(p.currency, t);
  }
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function shareCount(value: number) {
  return new Intl.NumberFormat("en-CA", { maximumFractionDigits: 6 }).format(value);
}

function signedMoney(value: number, currency: string) {
  // Sign first and on the absolute value, because money() switches to 4 decimals below 1.
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${money(Math.abs(value), currency)}`;
}

function boughtDate(value: string | null) {
  if (!value) return "No date";
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC", // it's a calendar date, not an instant
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function GainLoss({ gain, cost, currency }: { gain: number | null; cost: number; currency: string }) {
  if (gain === null) return <span className="text-foreground/40">—</span>;
  return (
    <span className={changeColor(gain)}>
      <div className="font-medium">{signedMoney(gain, currency)}</div>
      <div className="text-xs">{signed((gain / cost) * 100)}%</div>
    </span>
  );
}

const inputClass =
  "w-full min-w-0 rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none";

export default function Holdings({ initialRows }: { initialRows: HoldingRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Only the newest refresh may apply, so a poll that started before a save
  // can't bring back the old list.
  const latestRefresh = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++latestRefresh.current;
    setRefreshing(true);
    try {
      const res = await fetch("/api/stocks/holdings/", { cache: "no-store" });
      if (!res.ok) throw new Error(await errorMessage(res));
      const next: HoldingRow[] = await res.json();
      if (mine !== latestRefresh.current) return;
      setRows(next);
      setUpdatedAt(new Date());
      setError(null);
    } catch (e) {
      if (mine === latestRefresh.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mine === latestRefresh.current) setRefreshing(false);
    }
  }, []);

  // Refresh every 15 seconds while the tab is visible.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  function startDraft(next: Draft) {
    setDraft(next);
    setFormError(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function startEdit(lot: HoldingRow) {
    startDraft({
      id: lot.id,
      market: lot.market,
      symbol: lot.symbol,
      shares: String(Number(lot.shares)), // "10.000000" -> "10"
      price: String(Number(lot.price)),
      boughtOn: lot.bought_on ?? "",
    });
  }

  function toggle(symbol: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(symbol)) next.add(symbol);
      return next;
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const purchase = { shares: draft.shares, price: draft.price, bought_on: draft.boughtOn || null };
      const res = await fetch(draft.id === null ? "/api/stocks/holdings/" : `/api/stocks/holdings/${draft.id}/`, {
        method: draft.id === null ? "POST" : "PATCH",
        headers: csrfHeaders(),
        body: JSON.stringify(draft.id === null ? { ...purchase, symbol: draft.symbol, market: draft.market } : purchase),
      });
      if (!res.ok) throw new Error(await errorMessage(res));
      const saved: HoldingRow = await res.json();
      setDraft(emptyDraft(draft.market));
      setExpanded((prev) => new Set(prev).add(saved.symbol));
      await refresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(lot: HoldingRow) {
    if (!window.confirm(`Delete this purchase of ${shareCount(Number(lot.shares))} ${lot.symbol}?`)) return;
    const res = await fetch(`/api/stocks/holdings/${lot.id}/`, { method: "DELETE", headers: csrfHeaders() });
    if (!res.ok && res.status !== 404) return setError(await errorMessage(res));
    if (draft.id === lot.id) setDraft(emptyDraft(draft.market));
    await refresh();
  }

  const positions = toPositions(rows);
  const totals = toTotals(positions);
  const unpriced = positions.filter((p) => p.value === null);

  return (
    <div>
      <form ref={formRef} onSubmit={save} className="mb-8 rounded-lg border border-foreground/10 p-4">
        {draft.id !== null ? (
          <p className="mb-3 text-sm font-medium">Editing a purchase of {draft.symbol}</p>
        ) : (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <MarketToggle market={draft.market} onChange={(market) => setDraft({ ...draft, market })} />
            <SymbolInput
              market={draft.market}
              value={draft.symbol}
              onChange={(symbol) => setDraft({ ...draft, symbol })}
              onPick={(symbol) => setDraft({ ...draft, symbol })}
            />
          </div>
        )}
        <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-3">
          <label className="min-w-0 text-xs text-foreground/60">
            Shares
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              required
              value={draft.shares}
              onChange={(e) => setDraft({ ...draft, shares: e.target.value })}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="min-w-0 text-xs text-foreground/60">
            Price per share
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              required
              value={draft.price}
              onChange={(e) => setDraft({ ...draft, price: e.target.value })}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          {/* Safari and Chrome on iPad draw date inputs wider than a narrow column. */}
          <label className="col-span-2 min-w-0 text-xs text-foreground/60 sm:col-span-1">
            Bought on (optional)
            <input
              type="date"
              value={draft.boughtOn}
              onChange={(e) => setDraft({ ...draft, boughtOn: e.target.value })}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <div className="col-span-2 mt-1 flex gap-2 sm:col-span-3 sm:justify-end">
            <button
              type="submit"
              disabled={saving || (draft.id === null && !draft.symbol.trim())}
              className="flex-1 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-80 disabled:opacity-40 sm:flex-none"
            >
              {saving ? "Saving…" : draft.id === null ? "Add purchase" : "Save"}
            </button>
            {draft.id !== null && (
              <button
                type="button"
                onClick={() => startDraft(emptyDraft(draft.market))}
                className="rounded-md border border-foreground/20 px-3 py-2 text-sm text-foreground/70 hover:text-foreground"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-foreground/50">
          Add one entry per purchase; several buys of a stock are averaged together. Use the price in the currency the
          listing trades in.
        </p>
        {formError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{formError}</p>}
      </form>

      {totals.length > 0 && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {totals.map(([currency, t]) => (
            <div key={currency} className="rounded-lg border border-foreground/10 p-4">
              <div className="text-xs text-foreground/50 uppercase">{currency} holdings</div>
              <div className="mt-1 flex items-start justify-between gap-4 tabular-nums">
                <div>
                  <div className="text-2xl font-bold">{money(t.value, currency)}</div>
                  <div className="text-xs text-foreground/60">Cost {money(t.cost, currency)}</div>
                </div>
                <div className="text-right">
                  <GainLoss gain={t.value - t.cost} cost={t.cost} currency={currency} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-foreground/60">
          {positions.length} {positions.length === 1 ? "stock" : "stocks"}
        </span>
        <LiveStatus refreshing={refreshing} updatedAt={updatedAt} onClick={refresh} />
      </div>

      {error && (
        <p className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
      {unpriced.length > 0 && (
        <p className="mb-4 text-sm text-amber-600 dark:text-amber-400">
          No price right now for {unpriced.map((p) => p.symbol).join(", ")}, so the totals above leave{" "}
          {unpriced.length === 1 ? "it" : "them"} out.
        </p>
      )}

      {positions.length === 0 ? (
        <p className="py-8 text-sm text-foreground/60">
          You haven&apos;t entered any purchases yet. Search for a stock above and add the shares and price you paid.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-foreground/10 text-left text-xs text-foreground/50 uppercase">
                <th className="w-6 py-2" aria-label="Show purchases" />
                <th className="py-2 pr-3 font-medium">Symbol</th>
                <th className="hidden py-2 pr-3 text-right font-medium sm:table-cell">Shares</th>
                <th className="hidden py-2 pr-3 text-right font-medium sm:table-cell">Avg cost</th>
                <th className="py-2 pr-3 text-right font-medium">Price</th>
                <th className="hidden py-2 pr-3 text-right font-medium md:table-cell">Value</th>
                <th className="py-2 text-right font-medium">Gain / loss</th>
              </tr>
            </thead>
            {positions.map((p) => {
              const isOpen = expanded.has(p.symbol);
              const price = p.quote?.price ?? null;
              return (
                <tbody key={p.symbol} className="border-b border-foreground/10">
                  <tr className="align-middle">
                    <td className="py-3 pr-1">
                      <button
                        type="button"
                        onClick={() => toggle(p.symbol)}
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? "Hide" : "Show"} purchases of ${p.symbol}`}
                        className="rounded px-1 text-foreground/50 hover:text-foreground"
                      >
                        <span className={`inline-block transition-transform ${isOpen ? "rotate-90" : ""}`}>▸</span>
                      </button>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{p.symbol}</span>
                        {/* On a phone these give way so Gain / loss fits without scrolling. */}
                        <span className="hidden items-center gap-2 sm:flex">
                          <Badge tone={p.assetType === "etf" ? "accent" : "muted"}>{p.assetType}</Badge>
                          <span className="text-xs" title={p.market === "CA" ? "Canada" : "US"}>
                            {p.market === "CA" ? "🇨🇦" : "🇺🇸"}
                          </span>
                        </span>
                      </div>
                      <div className="max-w-28 truncate text-xs text-foreground/60 sm:max-w-xs">
                        {p.name}
                        {" · "}
                        {p.lots.length} {p.lots.length === 1 ? "purchase" : "purchases"}
                      </div>
                    </td>
                    <td className="hidden py-3 pr-3 text-right tabular-nums sm:table-cell">{shareCount(p.shares)}</td>
                    <td className="hidden py-3 pr-3 text-right whitespace-nowrap tabular-nums sm:table-cell">
                      {money(p.cost / p.shares, p.currency)}
                    </td>
                    <td className="py-3 pr-3 text-right whitespace-nowrap tabular-nums">
                      <div className="font-medium">{money(price, p.currency)}</div>
                      {p.quote?.change_percent != null && (
                        <div className={`text-[11px] ${changeColor(p.quote.change_percent)}`}>
                          {signed(p.quote.change_percent)}% today
                        </div>
                      )}
                    </td>
                    <td className="hidden py-3 pr-3 text-right whitespace-nowrap tabular-nums md:table-cell">
                      {money(p.value, p.currency)}
                    </td>
                    <td className="py-3 text-right whitespace-nowrap tabular-nums">
                      <GainLoss gain={p.value === null ? null : p.value - p.cost} cost={p.cost} currency={p.currency} />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={7} className="pb-3 pl-6">
                        <ul className="divide-y divide-foreground/10 rounded-md bg-foreground/5 text-xs">
                          {p.lots.map((lot) => {
                            const shares = Number(lot.shares);
                            const cost = shares * Number(lot.price);
                            return (
                              <li key={lot.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 tabular-nums">
                                <span className="w-24 text-foreground/60">{boughtDate(lot.bought_on)}</span>
                                <span className="min-w-32 flex-1">
                                  {shareCount(shares)} @ {money(Number(lot.price), p.currency)}
                                </span>
                                <span className="text-right whitespace-nowrap">
                                  <GainLoss gain={price === null ? null : shares * price - cost} cost={cost} currency={p.currency} />
                                </span>
                                <span className="flex gap-2">
                                  <button type="button" onClick={() => startEdit(lot)} className="text-foreground/60 hover:text-foreground">
                                    Edit
                                  </button>
                                  <button type="button" onClick={() => remove(lot)} className="text-foreground/60 hover:text-red-600">
                                    Delete
                                  </button>
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                        <button
                          type="button"
                          onClick={() => startDraft(emptyDraft(p.market, p.symbol))}
                          className="mt-2 text-xs font-medium text-accent hover:underline"
                        >
                          + Add another purchase of {p.symbol}
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              );
            })}
          </table>
        </div>
      )}
    </div>
  );
}
