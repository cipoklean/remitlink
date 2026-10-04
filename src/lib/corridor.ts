// Corridor + fee comparison config.
//
// HONESTY (AGENT.md rule 4): every figure here is an ILLUSTRATIVE ESTIMATE, not a
// live quote. The FX rate is a static MOCK value. Both are labeled as such in the
// UI and must stay labeled in the README and write-up.

export const CORRIDOR = {
  from: "US",
  to: "NG",
  fromCurrency: "USD",
  toCurrency: "NGN",
  label: "United States → Nigeria",
} as const;

// MOCK static rate. Replace with a free public FX API when available (spec 5.3).
export const MOCK_USD_NGN_RATE = 1480;

export const isMockFx = true;

export function usdToNgn(usd: number): number {
  return usd * MOCK_USD_NGN_RATE;
}

export function ngnToUsd(ngn: number): number {
  return ngn / MOCK_USD_NGN_RATE;
}

// Illustrative competitor fees. Hard-coded, clearly labeled in the UI as
// "typical fees, illustrative". Source to cite in README if found.
export type FeeQuote = {
  label: string;
  flatUsd: number;
  percentOfAmount: number;
  illustrative: boolean;
};

export const FEE_QUOTES: FeeQuote[] = [
  { label: "RemitLink", flatUsd: 0.99, percentOfAmount: 0, illustrative: false },
  { label: "Typical bank wire", flatUsd: 25, percentOfAmount: 0.015, illustrative: true },
  { label: "Typical remittance service", flatUsd: 4.99, percentOfAmount: 0.021, illustrative: true },
];

export function quoteFee(q: FeeQuote, usdAmount: number): number {
  return q.flatUsd + usdAmount * q.percentOfAmount;
}

export function formatUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

export function formatNgn(n: number): string {
  return "₦" + n.toLocaleString("en-NG", { maximumFractionDigits: 0 });
}