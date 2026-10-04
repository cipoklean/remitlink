"use client";

import {
  usePrivy,
  useSendTransaction,
  useWallets,
} from "@privy-io/react-auth";
import {
  createWalletClient,
  custom,
  encodeFunctionData,
  parseAbi,
} from "viem";
import { monadTestnet } from "viem/chains";
import { CHAIN_ID, ESCROW_ADDRESS, STABLECOIN_ADDRESS } from "@/lib/chain";
import { useEffect, useState } from "react";

/**
 * Two send paths:
 *
 * 1. Sponsored (`NEXT_PUBLIC_SPONSOR_GAS=true`): Privy's sendTransaction with
 *    `sponsor: true` (EIP-7702 + Privy paymaster) so users hold no MON.
 *    Requires "Sponsor gas fees" enabled for Monad Testnet in the Privy
 *    dashboard plus defaultChain/supportedChains set in Providers.tsx.
 *
 * 2. Fallback (default): plain viem sendTransaction through the Privy embedded
 *    wallet's EIP-1193 provider. The user pays gas from their own balance.
 *
 * The fallback exists because Privy's sendTransaction rejected our requests
 * with "Missing or invalid parameters", and hung indefinitely under
 * sponsor:true. The viem path uses standard eth_sendTransaction.
 */
const SPONSOR = process.env.NEXT_PUBLIC_SPONSOR_GAS === "true";
const SPONSOR_TIMEOUT_MS = 25_000;

const commitAbi = parseAbi([
  "function commitRecipient(uint256 claimId, address recipient)",
]);
const claimAbi = parseAbi([
  "function claim(uint256 claimId, uint256 secret, address recipient)",
]);
const createClaimAbi = parseAbi([
  "function createClaim(address token, uint256 amount, bytes32 claimHash, uint256 expiry) returns (uint256)",
]);
const approveAbi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms / 1000}s.`)),
      ms,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

type Provider = {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
};

export function useSponsoredSend() {
  const { sendTransaction } = useSendTransaction();
  const { ready, user } = usePrivy();
  const { wallets } = useWallets();
  const address = (wallets ?? [])[0]?.address;
  const [viemClient, setViemClient] = useState<ReturnType<
    typeof createWalletClient
  > | null>(null);

  // Build a viem wallet client over the embedded wallet's EIP-1193 provider.
  useEffect(() => {
    const wallet = wallets?.[0] as unknown as
      | (Provider & { getEthereumProvider?: () => Promise<Provider> })
      | undefined;
    if (!address || !wallet) {
      setViemClient(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const provider =
          typeof wallet.getEthereumProvider === "function"
            ? await wallet.getEthereumProvider()
            : wallet;
        if (cancelled || !provider) return;
        // Privy's provider is EIP-1193; viem's `custom` expects the provider
        // object itself (with a request method), so pass it directly.
        setViemClient(
          createWalletClient({
            account: address as `0x${string}`,
            chain: monadTestnet,
            transport: custom(provider as never),
          }),
        );
      } catch {
        if (!cancelled) setViemClient(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, wallets]);

  /** Send raw calldata, sponsored or user-paid depending on the flag. */
  async function send(args: {
    to: `0x${string}`;
    data: `0x${string}`;
  }): Promise<`0x${string}`> {
    if (SPONSOR) {
      const { hash } = await withTimeout(
        sendTransaction(
          { to: args.to, data: args.data, chainId: CHAIN_ID },
          { sponsor: true },
        ),
        SPONSOR_TIMEOUT_MS,
        "Sponsored transaction",
      );
      return hash;
    }

    if (!viemClient) {
      throw new Error(
        "No wallet connection available yet. Reload the page and try again.",
      );
    }
    const hash = await viemClient.sendTransaction({
      account: viemClient.account!,
      chain: monadTestnet,
      to: args.to,
      data: args.data,
      value: 0n,
    });
    return hash;
  }

  return {
    ready,
    user,
    sponsorEnabled: SPONSOR,
    address: address as `0x${string}` | undefined,
    hasWallet: Boolean(address) && Boolean(SPONSOR || viemClient),
    send,

    // --- ClaimEscrow helpers ---
    async commitRecipient(claimId: bigint, recipient: `0x${string}`) {
      return send({
        to: ESCROW_ADDRESS,
        data: encodeFunctionData({
          abi: commitAbi,
          functionName: "commitRecipient",
          args: [claimId, recipient],
        }),
      });
    },
    async claim(claimId: bigint, secret: bigint, recipient: `0x${string}`) {
      return send({
        to: ESCROW_ADDRESS,
        data: encodeFunctionData({
          abi: claimAbi,
          functionName: "claim",
          args: [claimId, secret, recipient],
        }),
      });
    },
    async createClaim(
      token: `0x${string}`,
      amount: bigint,
      claimHash: `0x${string}`,
      expiry: bigint,
    ) {
      return send({
        to: ESCROW_ADDRESS,
        data: encodeFunctionData({
          abi: createClaimAbi,
          functionName: "createClaim",
          args: [token, amount, claimHash, expiry],
        }),
      });
    },

    // --- Token helper ---
    async approve(spender: `0x${string}`, amount: bigint) {
      return send({
        to: STABLECOIN_ADDRESS,
        data: encodeFunctionData({
          abi: approveAbi,
          functionName: "approve",
          args: [spender, amount],
        }),
      });
    },
  };
}