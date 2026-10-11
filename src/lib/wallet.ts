/**
 * Create the user's Privy embedded wallet if it does not exist yet.
 *
 * Privy (createOnLogin: "all-users") usually provisions the wallet on its own,
 * so a manual createWallet() can lose the race and throw "User already has an
 * embedded wallet". That means the wallet exists, so treat it as success.
 */
export async function ensureEmbeddedWallet(
  createWallet: () => Promise<unknown>,
): Promise<void> {
  try {
    await createWallet();
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/already has an embedded wallet/i.test(m)) return;
    throw e;
  }
}
