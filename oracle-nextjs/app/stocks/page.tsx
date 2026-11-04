import Link from "next/link";
import { getWithSession } from "../lib/backend";
import Holdings, { type HoldingRow } from "./Holdings";
import StockTracker, { type StockRow } from "./StockTracker";

const TABS = [
  { href: "/stocks", label: "Watchlist" },
  { href: "/stocks?tab=holdings", label: "My holdings" },
];

async function load<T>(path: string): Promise<{ rows: T[]; error: string | null }> {
  try {
    return { rows: await getWithSession<T[]>(path), error: null };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export default async function Stocks({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const onHoldings = tab === "holdings";
  const holdings = onHoldings ? await load<HoldingRow>("/api/stocks/holdings/") : null;
  const watchlist = onHoldings ? null : await load<StockRow>("/api/stocks/");
  const error = holdings?.error ?? watchlist?.error;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <h1 className="mb-4 text-3xl font-extrabold tracking-tight">Stocks</h1>

      <nav aria-label="Stocks sections" className="mb-4 flex gap-5 border-b border-foreground/10 text-sm">
        {TABS.map((t, i) => {
          const active = (i === 1) === onHoldings;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`-mb-px border-b-2 pb-2 ${
                active ? "border-accent font-medium text-accent" : "border-transparent text-foreground/60 hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      <p className="mb-8 text-sm text-foreground/60">
        {onHoldings ? "Your purchases and their gain or loss at today's price" : "Your watchlist of Canadian and US stocks and ETFs"}
        , refreshed every 15 seconds. US prices are real-time from Finnhub; Canadian prices come from Yahoo Finance and
        usually run a few minutes behind.{onHoldings ? "" : " Times are Pacific."}
      </p>

      {error && (
        <p className="mb-6 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          Couldn&apos;t load your {onHoldings ? "holdings" : "watchlist"}: {error}
        </p>
      )}
      {holdings && <Holdings initialRows={holdings.rows} />}
      {watchlist && <StockTracker initialRows={watchlist.rows} />}
    </main>
  );
}
