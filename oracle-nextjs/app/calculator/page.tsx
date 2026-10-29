import { getWithSession } from "../lib/backend";
import MortgageCalculator, { type MortgageRow } from "./MortgageCalculator";

export default async function Calculator() {
  let rows: MortgageRow[] = [];
  let error: string | null = null;
  try {
    rows = await getWithSession<MortgageRow[]>("/api/mortgages/");
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <h1 className="mb-1 text-3xl font-extrabold tracking-tight">Mortgage calculator</h1>
      <p className="mb-8 text-sm text-foreground/60">
        Payments, interest and payoff time. Saved scenarios are stored in the{" "}
        <code>mortgage</code> table.
      </p>

      {error && (
        <p className="mb-6 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          Couldn&apos;t load saved scenarios: {error}
        </p>
      )}
      <MortgageCalculator initialRows={rows} />
    </main>
  );
}
