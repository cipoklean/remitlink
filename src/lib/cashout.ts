/**
 * Cash-out partner catalog — MOCK DATA.
 *
 * HONESTY (AGENT.md hard rule 4): these entries are illustrative placeholders,
 * not real integrations. No API is called, no payout is triggered, and no
 * money moves. The UI labels this screen MOCK and the README must say the same.
 *
 * In production this would be a real off-ramp: an aggregator such as Mercuryo
 * or a licensed Nigerian PSP, quoted server-side with the live rate and fee,
 * paying out to the recipient's bank account. The names below are kept generic
 * on purpose so nobody mistakes a demo for a live product.
 */

export const CASH_OUT_PARTNERS = [
  { id: "bank", label: "Nigerian bank account", feeUsd: 0.5, eta: "Within a day" },
  { id: "mobile", label: "Mobile money wallet", feeUsd: 0.25, eta: "Minutes" },
] as const;

export type CashOutPartner = (typeof CASH_OUT_PARTNERS)[number];

export function findPartner(id: string): CashOutPartner | undefined {
  return CASH_OUT_PARTNERS.find((p) => p.id === id);
}

/**
 * Nigerian bank account validation. Shape only — 10 digits. This checks that
 * the input is plausible; it cannot and does not confirm the account exists or
 * is the right person's, because that requires a real bank integration.
 */
export function isValidNgnAccount(account: string): boolean {
  return /^\d{10}$/.test(account.replace(/\s/g, ""));
}