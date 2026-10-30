import { getWithSession } from "../lib/backend";
import StockTracker, { type StockRow } from "./StockTracker";

export default async function Stocks() {
  let rows: StockRow[] = [];
  let error: string | null = null;
  try {
    rows = await getWithSession<StockRow[]>("/api/stocks/");
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <h1 className="mb-1 text-3xl font-extrabold tracking-tight">Stocks</h1>
      <p className="mb-8 text-sm text-foreground/60">
        Your watchlist of Canadian and US stocks and ETFs, refreshed every 15 seconds. US prices
        are real-time from Finnhub; Canadian prices come from Yahoo Finance and usually run a few
        minutes behind. Times are Pacific.
      </p>

      {error && (
        <p className="mb-6 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          Couldn&apos;t load your watchlist: {error}
        </p>
      )}
      <StockTracker initialRows={rows} />
    </main>
  );
}
