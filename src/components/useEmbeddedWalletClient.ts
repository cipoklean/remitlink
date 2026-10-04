"use client";

import { useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom } from "viem";
import { monadTestnet } from "@/lib/chain";
import { useEffect, useState } from "react";

type PrivyEip1193Provider = {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
};

/**
 * Builds a viem WalletClient backed by the user's Privy embedded wallet.
 * Returns null until Privy has provisioned a wallet for the signed-in user.
 */
export function useEmbeddedWalletClient() {
  const { wallets, ready } = useWallets();
  const [client, setClient] = useState<ReturnType<
    typeof createWalletClient
  > | null>(null);

  useEffect(() => {
    if (!ready || !wallets || wallets.length === 0) {
      setClient(null);
      return;
    }
    const wallet = wallets[0] as unknown as PrivyEip1193Provider;
    if (!wallet || typeof wallet.request !== "function") {
      setClient(null);
      return;
    }
    const request = async ({
      method,
      params,
    }: {
      method: string;
      params?: unknown;
    }) => wallet.request({ method, params });

    setClient(
      createWalletClient({
        account: wallets[0].address as `0x${string}`,
        chain: monadTestnet,
        transport: custom({ request }),
      }),
    );
  }, [ready, wallets]);

  return client;
}