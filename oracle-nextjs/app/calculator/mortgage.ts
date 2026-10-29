// Pure mortgage math for the Calculator page - no React, so it's easy to
// reason about (and to test) on its own.

export type Frequency =
  | "monthly"
  | "biweekly"
  | "weekly"
  | "accelerated-biweekly"
  | "accelerated-weekly";

export const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "biweekly", label: "Bi-weekly" },
  { value: "weekly", label: "Weekly" },
  { value: "accelerated-biweekly", label: "Accelerated bi-weekly" },
  { value: "accelerated-weekly", label: "Accelerated weekly" },
];

export type MortgageInputs = {
  price: number;
  downPayment: number;
  annualRatePct: number;
  amortizationYears: number;
  frequency: Frequency;
  // Canadian fixed-rate mortgages compound semi-annually by law; US-style
  // loans compound once per payment period.
  canadianCompounding: boolean;
};

export type YearRow = {
  year: number;
  principal: number;
  interest: number;
  balance: number;
};

export type MortgageResult = {
  loan: number;
  payment: number;
  paymentsPerYear: number;
  totalInterest: number;
  totalPaid: number;
  payoffYears: number;
  years: YearRow[];
};

const PAYMENTS_PER_YEAR: Record<Frequency, number> = {
  monthly: 12,
  biweekly: 26,
  weekly: 52,
  "accelerated-biweekly": 26,
  "accelerated-weekly": 52,
};

function periodicRate(annualRatePct: number, perYear: number, canadian: boolean) {
  const r = annualRatePct / 100;
  return canadian ? Math.pow(1 + r / 2, 2 / perYear) - 1 : r / perYear;
}

function levelPayment(loan: number, rate: number, count: number) {
  if (rate === 0) return loan / count;
  return (loan * rate) / (1 - Math.pow(1 + rate, -count));
}

export function calculate(inputs: MortgageInputs): MortgageResult | null {
  const loan = inputs.price - inputs.downPayment;
  const { amortizationYears: years, frequency } = inputs;
  if (!(loan > 0) || !(years > 0) || !(inputs.annualRatePct >= 0)) return null;

  const perYear = PAYMENTS_PER_YEAR[frequency];
  const rate = periodicRate(inputs.annualRatePct, perYear, inputs.canadianCompounding);

  let payment: number;
  if (frequency.startsWith("accelerated")) {
    // "Accelerated" = the monthly payment split in 2 (or 4), paid 26 (or 52)
    // times a year - the extra payment each year is what shortens the loan.
    const monthlyRate = periodicRate(inputs.annualRatePct, 12, inputs.canadianCompounding);
    const monthly = levelPayment(loan, monthlyRate, years * 12);
    payment = monthly / (perYear === 26 ? 2 : 4);
  } else {
    payment = levelPayment(loan, rate, years * perYear);
  }

  const rows: YearRow[] = [];
  let balance = loan;
  let totalInterest = 0;
  let count = 0;
  const maxPayments = years * perYear;
  while (balance > 0.005 && count < maxPayments) {
    const row: YearRow = { year: rows.length + 1, principal: 0, interest: 0, balance: 0 };
    for (let p = 0; p < perYear && balance > 0.005; p++) {
      const interest = balance * rate;
      const principal = Math.min(payment - interest, balance);
      balance -= principal;
      row.interest += interest;
      row.principal += principal;
      count++;
    }
    row.balance = Math.max(balance, 0);
    totalInterest += row.interest;
    rows.push(row);
  }

  return {
    loan,
    payment,
    paymentsPerYear: perYear,
    totalInterest,
    totalPaid: loan + totalInterest,
    payoffYears: count / perYear,
    years: rows,
  };
}
