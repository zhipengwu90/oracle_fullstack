"use client";

import { useMemo, useState } from "react";
import { csrfHeaders } from "../lib/csrf";
import { calculate, FREQUENCIES, type Frequency, type MortgageInputs } from "./mortgage";

export type MortgageRow = { id: number; data: string | null };

type SavedScenario = { name: string; inputs: MortgageInputs };

const DEFAULTS: MortgageInputs = {
  price: 600000,
  downPayment: 120000,
  annualRatePct: 4.5,
  amortizationYears: 25,
  frequency: "monthly",
  canadianCompounding: true,
};

const money = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});
const money2 = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

// Rows saved before this page existed hold free text, not a scenario.
function parseScenario(row: MortgageRow): SavedScenario | null {
  try {
    const parsed = JSON.parse(row.data ?? "");
    return parsed && parsed.inputs ? parsed : null;
  } catch {
    return null;
  }
}

const inputClass =
  "w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none";

function NumberField({
  label,
  value,
  onChange,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground/80">
        {label}
        {suffix && <span className="ml-1 font-normal text-foreground/50">{suffix}</span>}
      </span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        className={inputClass}
      />
    </label>
  );
}

function BalanceChart({ balances, loan }: { balances: number[]; loan: number }) {
  const w = 600;
  const h = 200;
  const points = [loan, ...balances]
    .map((b, i) => `${(i / balances.length) * w},${h - (b / loan) * h}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-40 w-full text-accent"
      preserveAspectRatio="none"
      role="img"
      aria-label="Remaining balance by year"
    >
      <polygon points={`0,${h} ${points} ${w},${h}`} fill="currentColor" opacity={0.15} />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default function MortgageCalculator({ initialRows }: { initialRows: MortgageRow[] }) {
  const [inputs, setInputs] = useState<MortgageInputs>(DEFAULTS);
  const [rows, setRows] = useState(initialRows);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllYears, setShowAllYears] = useState(false);

  const result = useMemo(() => calculate(inputs), [inputs]);
  const set = <K extends keyof MortgageInputs>(key: K, value: MortgageInputs[K]) =>
    setInputs((prev) => ({ ...prev, [key]: value }));

  const downPct = inputs.price > 0 ? (inputs.downPayment / inputs.price) * 100 : 0;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const scenario: SavedScenario = {
        name: name.trim() || `${money.format(inputs.price)} at ${inputs.annualRatePct}%`,
        inputs,
      };
      const res = await fetch("/api/mortgages/", {
        method: "POST",
        headers: csrfHeaders(),
        body: JSON.stringify({ data: JSON.stringify(scenario) }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      const row: MortgageRow = await res.json();
      setRows((prev) => [...prev, row]);
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    setError(null);
    const res = await fetch(`/api/mortgages/${id}/`, { method: "DELETE", headers: csrfHeaders() });
    if (res.ok) setRows((prev) => prev.filter((r) => r.id !== id));
    else setError(`Delete failed (${res.status})`);
  }

  const visibleYears = result
    ? showAllYears
      ? result.years
      : result.years.filter((y) => y.year === 1 || y.year % 5 === 0 || y.year === result.years.length)
    : [];

  return (
    <div className="grid gap-10 lg:grid-cols-[320px_1fr]">
      <section className="space-y-4">
        <NumberField label="Home price" value={inputs.price} step={1000} onChange={(v) => set("price", v)} />
        <NumberField
          label="Down payment"
          suffix={`(${downPct.toFixed(1)}%)`}
          value={inputs.downPayment}
          step={1000}
          onChange={(v) => set("downPayment", v)}
        />
        <NumberField
          label="Interest rate"
          suffix="% per year"
          value={inputs.annualRatePct}
          step={0.05}
          onChange={(v) => set("annualRatePct", v)}
        />
        <NumberField
          label="Amortization"
          suffix="years"
          value={inputs.amortizationYears}
          onChange={(v) => set("amortizationYears", v)}
        />
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground/80">Payment frequency</span>
          <select
            value={inputs.frequency}
            onChange={(e) => set("frequency", e.target.value as Frequency)}
            className={inputClass}
          >
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={inputs.canadianCompounding}
            onChange={(e) => set("canadianCompounding", e.target.checked)}
            className="mt-0.5 accent-[var(--accent)]"
          />
          <span>
            Canadian mortgage
            <span className="block text-foreground/50">Interest compounds semi-annually</span>
          </span>
        </label>
        {downPct > 0 && downPct < 20 && inputs.canadianCompounding && (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
            Under 20% down usually needs mortgage default insurance (CMHC), which is added to
            the loan and isn&apos;t included here.
          </p>
        )}
      </section>

      <section className="min-w-0 space-y-8">
        {!result ? (
          <p className="text-sm text-foreground/60">
            Enter a price above the down payment and a term above zero to see results.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ["Payment", money2.format(result.payment)],
                ["Loan amount", money.format(result.loan)],
                ["Total interest", money.format(result.totalInterest)],
                ["Paid off in", `${result.payoffYears.toFixed(1)} yrs`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-foreground/10 p-3">
                  <p className="text-xs text-foreground/60">{label}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>

            <div>
              <h2 className="mb-2 text-sm font-medium text-foreground/80">Remaining balance</h2>
              <BalanceChart balances={result.years.map((y) => y.balance)} loan={result.loan} />
              <div className="flex justify-between text-xs text-foreground/50">
                <span>Year 0</span>
                <span>Year {result.years.length}</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm tabular-nums">
                <thead>
                  <tr className="border-b-2 border-foreground/20 text-left">
                    <th className="py-2 pr-4 font-medium">Year</th>
                    <th className="py-2 pr-4 text-right font-medium">Principal</th>
                    <th className="py-2 pr-4 text-right font-medium">Interest</th>
                    <th className="py-2 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleYears.map((y) => (
                    <tr key={y.year} className="border-b border-foreground/10">
                      <td className="py-1.5 pr-4">{y.year}</td>
                      <td className="py-1.5 pr-4 text-right">{money.format(y.principal)}</td>
                      <td className="py-1.5 pr-4 text-right">{money.format(y.interest)}</td>
                      <td className="py-1.5 text-right">{money.format(y.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                type="button"
                onClick={() => setShowAllYears((v) => !v)}
                className="mt-2 text-sm text-accent hover:underline"
              >
                {showAllYears ? "Show every 5 years" : "Show every year"}
              </button>
            </div>
          </>
        )}

        <div className="rounded-lg border border-foreground/10 p-4">
          <h2 className="mb-3 font-semibold">Saved scenarios</h2>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name this scenario (optional)"
              className={inputClass}
            />
            <button
              type="button"
              onClick={save}
              disabled={!result || saving}
              className="rounded-md bg-foreground px-4 py-2 text-sm font-medium whitespace-nowrap text-background hover:opacity-80 disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save current"}
            </button>
          </div>
          {error && (
            <p className="mb-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}
          {rows.length === 0 ? (
            <p className="text-sm text-foreground/60">Nothing saved yet.</p>
          ) : (
            <ul className="divide-y divide-foreground/10">
              {rows.map((row) => {
                const scenario = parseScenario(row);
                const summary = scenario ? calculate(scenario.inputs) : null;
                return (
                  <li key={row.id} className="flex items-center gap-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{scenario ? scenario.name : row.data}</p>
                      {summary && (
                        <p className="text-foreground/60">
                          {money2.format(summary.payment)}{" "}
                          {FREQUENCIES.find((f) => f.value === scenario!.inputs.frequency)?.label.toLowerCase()}
                          {" · "}
                          {scenario!.inputs.annualRatePct}% · {money.format(summary.loan)} loan
                        </p>
                      )}
                    </div>
                    {scenario && (
                      <button
                        type="button"
                        onClick={() => setInputs(scenario.inputs)}
                        className="text-accent hover:underline"
                      >
                        Load
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => remove(row.id)}
                      className="text-foreground/50 hover:text-red-600"
                    >
                      Delete
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
