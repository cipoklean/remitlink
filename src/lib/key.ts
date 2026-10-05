/**
 * Normalize a raw private key read from an environment variable into the exact
 * `0x`-prefixed 32-byte hex string viem expects.
 *
 * Owners often paste keys without the `0x` prefix, or with stray whitespace /
 * newlines. viem's `privateKeyToAccount` rejects those with an opaque
 * "expected hex or 32 bytes, got string" error that is useless to a non-
 * technical owner. This turns it into a clear, actionable message, and accepts
 * the key in either form so the owner does not have to guess.
 */
export type NormalizedKey =
  | { ok: true; key: `0x${string}` }
  | { ok: false; error: string };

export function normalizePrivateKey(
  raw: string | undefined,
): NormalizedKey {
  if (!raw) return { ok: false, error: "key is missing" };

  let k = raw.trim();
  if (!/^0x/i.test(k)) k = `0x${k}`;

  if (!/^0x[0-9a-fA-F]{64}$/.test(k)) {
    return {
      ok: false,
      error:
        "the key is not a valid 64-character hex private key - check it was pasted in complete, without spaces",
    };
  }

  return { ok: true, key: k as `0x${string}` };
}
