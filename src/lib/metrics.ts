/**
 * Transfer metrics for the "why Monad?" proof (AGENT.md section 7b, B1).
 *
 * HONESTY (hard rule 4): every number here is MEASURED from chain data — block
 * timestamps and gas actually used. Nothing is hardcoded, estimated, or
 * rounded up to look good. If we cannot measure it, we say so rather than
 * inventing a figure.
 *
 * Source: the Envio HyperIndex in /envio, which already holds createdAtTimestamp
 * and settledAtTimestamp per claim. Reading them over GraphQL is the only way to
 * get these reliably, because the public Monad RPC caps eth_getLogs at a 100
 * block range and scanning 68M blocks from block 0 is not viable.
 *
 * Fee is the REAL gas the sender paid to create the claim, in native MON, from
 * that transaction's receipt (gasUsed x effectiveGasPrice). We deliberately do
 * NOT convert it to USD: a live price lookup would be another moving part, and
 * the honest unit for a testnet receipt is the native token itself.
 */

import { fetchClaims, type EnvioClaim } from "./envio";
import { publicClient } from "./chain";

export type TransferMetrics = {
  /** Seconds from claim creation to settle (claim or refund). Null if unsettled. */
  settleSeconds: number | null;
  /** Seconds between the creating tx's block and the previous block, i.e. how fast blocks came. */
  createdAtIso: string | null;
  settledAtIso: string | null;
  /** Real gas cost of the createClaim transaction, in wei. Null if unmeasurable. */
  feeWei: bigint | null;
  feeMon: string | null;
  /** True when the indexer has no data for this claim yet. */
  unavailable: boolean;
};

export async function loadMetrics(claimId: string): Promise<TransferMetrics> {
  const empty: TransferMetrics = {
    settleSeconds: null,
    createdAtIso: null,
    settledAtIso: null,
    feeWei: null,
    feeMon: null,
    unavailable: true,
  };

  const result = await fetchClaims();
  if (!result.ok) return empty;

  const claim = result.claims.find((c: EnvioClaim) => c.id === claimId);
  if (!claim) return empty;

  const created = Number(claim.createdAtTimestamp);
  const settled = claim.settledAtTimestamp ? Number(claim.settledAtTimestamp) : null;

  // Fee from the real createClaim receipt.
  let feeWei: bigint | null = null;
  try {
    const receipt = await publicClient.getTransactionReceipt({
      hash: claim.txHash as `0x${string}`,
    });
    feeWei = receipt.gasUsed * receipt.effectiveGasPrice;
  } catch {
    feeWei = null;
  }

  return {
    settleSeconds:
      settled !== null && Number.isFinite(created) && settled > created
        ? settled - created
        : null,
    createdAtIso: Number.isFinite(created)
      ? new Date(created * 1000).toISOString()
      : null,
    settledAtIso:
      settled !== null && Number.isFinite(settled)
        ? new Date(settled * 1000).toISOString()
        : null,
    feeWei,
    feeMon:
      feeWei !== null ? formatMon(feeWei) : null,
    unavailable: false,
  };
}

function formatMon(wei: bigint): string {
  // 18 decimals, trimmed to a sensible precision for a testnet receipt.
  const whole = wei / 10n ** 18n;
  const frac = wei % 10n ** 18n;
  if (whole === 0n) {
    return `${(Number(frac) / 1e18).toFixed(6)}`;
  }
  return `${whole}.${frac.toString().padStart(18, "0").slice(0, 6)}`;
}

/** "2m 14s" / "48s" — reads better than raw seconds on a phone. */
export function humanDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}