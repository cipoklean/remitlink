/**
 * Envio HyperIndex client for the Activity screen.
 *
 * WHY THIS EXISTS (verified 2026-10-05): the public Monad testnet RPC rejects
 * wide log queries -- `eth_getLogs is limited to a 100 range` -- so reading
 * contract events directly from block 0 is impossible (~680k requests would be
 * needed at 100 blocks per call). The Envio indexer in /envio is what makes
 * activity history possible; this file is the read side of it.
 *
 * Set NEXT_PUBLIC_ENVIO_GRAPHQL_URL to the deployed indexer endpoint, e.g.
 *   local dev : http://localhost:8080/v1/graphql   (npx envio dev in /envio)
 *   hosted    : https://<your-indexer>.envio.run
 */

// Trim so a trailing newline from a paste does not break fetch. (The value
// must still be a clean URL - no surrounding quotes or interior spaces, which
// a JSON-pasted value like "https://... " carries; see .env.example.)
const rawEnv = process.env.NEXT_PUBLIC_ENVIO_GRAPHQL_URL?.trim();
export const ENVIO_GRAPHQL_URL =
  rawEnv || "http://localhost:8080/v1/graphql";

/**
 * A short, human-readable identity of the endpoint we are hitting, so a
 * failure message tells you WHICH endpoint broke instead of a generic
 * "unreachable". Falls back to the raw value (JSON-shown) when it is not a
 * parseable URL - which is exactly how a malformed value is caught in seconds
 * instead of an afternoon.
 */
function describeEndpoint(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return JSON.stringify(url).slice(0, 80);
  }
}

export type EnvioClaim = {
  id: string;
  sender: string;
  recipient: string | null;
  token: string;
  amount: string;
  status: "created" | "committed" | "claimed" | "refunded";
  claimHash: string;
  expiry: string;
  createdAtBlock: string;
  createdAtTimestamp: string;
  settledAtBlock: string | null;
  settledAtTimestamp: string | null;
  txHash: string;
};

const CLAIMS_QUERY = `query Claims {
  Claim(order_by: {createdAtBlock: desc}) {
    id sender recipient token amount status claimHash expiry
    createdAtBlock createdAtTimestamp settledAtBlock settledAtTimestamp txHash
  }
}`;

export type EnvioResult =
  | { ok: true; claims: EnvioClaim[] }
  | { ok: false; error: string };

export async function fetchClaims(signal?: AbortSignal): Promise<EnvioResult> {
  // Validate the endpoint up front. A malformed NEXT_PUBLIC_ENVIO_GRAPHQL_URL
  // (e.g. pasted from JSON with surrounding quotes or an interior space) would
  // otherwise make fetch() throw "Invalid URL" and render as a vague
  // "could not reach the activity indexer". Catching it here turns that into
  // an actionable message in seconds.
  try {
    new URL(ENVIO_GRAPHQL_URL);
  } catch {
    return {
      ok: false,
      error: `the activity indexer URL is not a valid URL: ${JSON.stringify(ENVIO_GRAPHQL_URL)}`,
    };
  }

  try {
    const res = await fetch(ENVIO_GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: CLAIMS_QUERY }),
      signal,
    });

    if (!res.ok) {
      return { ok: false, error: `indexer returned ${res.status}` };
    }

    const json = (await res.json()) as {
      data?: { Claim?: EnvioClaim[] };
      errors?: { message: string }[];
    };

    if (json.errors?.length) {
      return { ok: false, error: json.errors[0].message };
    }

    return { ok: true, claims: json.data?.Claim ?? [] };
  } catch (e) {
    // A local indexer that isn't running is the common case in production.
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, error: "cancelled" };
    }
    return {
      ok: false,
      // Naming the endpoint makes a misconfigured URL obvious at a glance
      // (a malformed NEXT_PUBLIC_ENVIO_GRAPHQL_URL shows up here as the
      // raw string instead of a vague "unreachable").
      error: `could not reach the activity indexer at ${describeEndpoint(ENVIO_GRAPHQL_URL)}`,
    };
  }
}