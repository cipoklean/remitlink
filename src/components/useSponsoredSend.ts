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
 */
export function useSponsoredSend() {
  const { sendTransaction } = useSendTransaction();
  const { ready, user } = usePrivy();
  const { wallets } = useWallets();
  const address = (wallets ?? [])[0]?.address;

  async function send(args: {
    to: string;
    data: `0x${string}`;
    value?: bigint;
  }): Promise<`0x${string}`> {
    const { hash } = await sendTransaction(
      {
        to: args.to,
        data: args.data,
        chainId: CHAIN_ID,
        value: args.value ?? 0n,
      },
      { sponsor: true },
    );
    return hash;
  }

  return {
    ready,
    user,
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