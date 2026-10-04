"use client";

import { usePrivy, useSendTransaction } from "@privy-io/react-auth";
import { encodeFunctionData } from "viem";
import { ESCROW_ADDRESS, CHAIN_ID, erc20Abi, escrowAbi } from "@/lib/chain";
import { useWallets } from "@privy-io/react-auth";

/**
 * Sends a transaction through Privy's embedded wallet with gas sponsorship
 * (EIP-7702 + Privy paymaster), so users never need to hold MON.
 *
 * Requires "Sponsor gas fees" enabled for Monad Testnet in the Privy dashboard
 * (Fee sponsorship page). See AGENT.md.
 *
 * `NEXT_PUBLIC_SPONSOR_GAS=false` falls back to an ordinary (user-paid) send.
 * That is the escape hatch: when sponsorship is misconfigured Privy never
 * resolves the request and the UI hangs forever with nothing broadcast, so we
 * bound it with a timeout and can turn it off without a code change.
 */
const SPONSOR = process.env.NEXT_PUBLIC_SPONSOR_GAS === "true";
const SPONSOR_TIMEOUT_MS = 25_000;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `${label} timed out after ${ms / 1000}s. Gas sponsorship may not be enabled for Monad Testnet — set NEXT_PUBLIC_SPONSOR_GAS=false to send without it.`,
          ),
        ),
      ms,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export function useSponsoredSend() {
  const { sendTransaction } = useSendTransaction();
  const { ready, user } = usePrivy();
  const { wallets } = useWallets();
  const address = (wallets ?? [])[0]?.address;

  const sponsorEnabled = SPONSOR;

  async function send(args: {
    to: string;
    data: `0x${string}`;
    value?: bigint;
  }): Promise<`0x${string}`> {
    const request = {
      to: args.to,
      data: args.data,
      chainId: CHAIN_ID,
      value: args.value ?? 0n,
    };
    const { hash } = sponsorEnabled
      ? await withTimeout(
          sendTransaction(request, { sponsor: true }),
          SPONSOR_TIMEOUT_MS,
          "Sponsored transaction",
        )
      : await sendTransaction(request);
    return hash;
  }

  return {
    ready,
    user,
    sponsorEnabled,
    address: address as `0x${string}` | undefined,
    hasWallet: Boolean(address),
    send,
    // --- ClaimEscrow helpers, sponsored ---
    async commitRecipient(claimId: bigint, recipient: `0x${string}`) {
      return send({
        to: ESCROW_ADDRESS,
        data: encodeFunctionData({
          abi: escrowAbi,
          functionName: "commitRecipient",
          args: [claimId, recipient],
        }),
      });
    },
    async claim(claimId: bigint, secret: bigint, recipient: `0x${string}`) {
      return send({
        to: ESCROW_ADDRESS,
        data: encodeFunctionData({
          abi: escrowAbi,
          functionName: "claim",
          args: [claimId, secret, recipient],
        }),
      });
    },
    // --- Token helpers, sponsored ---
    async approve(spender: `0x${string}`, amount: bigint) {
      return send({
        to: spender,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [spender, amount],
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
          abi: escrowAbi,
          functionName: "createClaim",
          args: [token, amount, claimHash, expiry],
        }),
      });
    },
  };
}