import { NextResponse } from "next/server";
import {
  createWalletClient,
  createPublicClient,
  custom,
  http,
  keccak256,
  parseAbi,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { CHAIN_ID, ESCROW_ADDRESS, publicClient } from "@/lib/chain";

/**
 * Gas relayer for the recipient side of a claim.
 *
 * Both `commitRecipient` and `claim` are permissionless: the contract never
 * checks msg.sender, and funds always go to the committed `recipient`
 * address. That means our server can pay the gas on the recipient's behalf,
 * so a first-time recipient needs NO native token at all.
 *
 * Safety before spending our gas:
 *  - the claim must exist, be unexpired and unsettled
 *  - `keccak256(secret)` must equal the stored claimHash (checked off-chain,
 *    so a wrong secret never costs us a transaction)
 *  - if the claim is already committed, the recipient must match it exactly
 *
 * This is the AGENT.md section 5.4 fallback path ("a small server-side
 * relayer funded with testnet MON"), used because Privy's native gas
 * sponsorship did not resolve on Monad testnet.
 */

const commitAbi = parseAbi([
  "function commitRecipient(uint256 claimId, address recipient)",
]);
const claimAbi = parseAbi([
  "function claim(uint256 claimId, uint256 secret, address recipient)",
]);
const claimsAbi = parseAbi([
  "function claims(uint256 claimId) view returns (address sender, address token, uint256 amount, bytes32 claimHash, uint256 expiry, address recipient, bool settled)",
]);

export const runtime = "nodejs";

type ClaimTuple = readonly [
  `0x${string}`,
  `0x${string}`,
  bigint,
  `0x${string}`,
  bigint,
  `0x${string}`,
  boolean,
];

export async function POST(request: Request) {
  try {
    const relayerKey = process.env.RELAYER_PRIVATE_KEY;
    if (!relayerKey) {
      return NextResponse.json(
        { error: "Relayer not configured (RELAYER_PRIVATE_KEY missing)." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as {
      claimId?: string;
      secret?: string;
      recipient?: string;
    };
    const { claimId, secret, recipient } = body;

    if (!claimId || !secret || !recipient) {
      return NextResponse.json(
        { error: "claimId, secret and recipient are required." },
        { status: 400 },
      );
    }

    const claimIdBig = BigInt(claimId);
    const secretBig = BigInt(secret);
    const recipientAddr = recipient as `0x${string}`;

    const claim = (await publicClient.readContract({
      address: ESCROW_ADDRESS,
      abi: claimsAbi,
      functionName: "claims",
      args: [claimIdBig],
    })) as ClaimTuple;

    const [, , amount, claimHash, expiry, committed, settled] = claim;

    if (settled) {
      return NextResponse.json(
        { error: "This link has already been claimed." },
        { status: 409 },
      );
    }
    if (BigInt(Math.floor(Date.now() / 1000)) > expiry) {
      return NextResponse.json(
        { error: "This link has expired. Ask the sender to refund it." },
        { status: 409 },
      );
    }
    // Verify the secret OFF-CHAIN so a bad guess never burns our gas.
    if (keccak256(toHex(secretBig, { size: 32 })) !== claimHash) {
      return NextResponse.json(
        { error: "This link's code is not valid." },
        { status: 403 },
      );
    }
    // If someone already committed, only that exact address can be paid.
    if (committed !== "0x0000000000000000000000000000000000000000") {
      if (committed.toLowerCase() !== recipientAddr.toLowerCase()) {
        return NextResponse.json(
          { error: "This link is locked to a different account." },
          { status: 409 },
        );
      }
    }

    const account = privateKeyToAccount(relayerKey as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: monadTestnet,
      transport: http("https://testnet-rpc.monad.xyz"),
    });

    const txs: `0x${string}`[] = [];

    if (committed === "0x0000000000000000000000000000000000000000") {
      const commitHash = await walletClient.writeContract({
        address: ESCROW_ADDRESS,
        abi: commitAbi,
        functionName: "commitRecipient",
        args: [claimIdBig, recipientAddr],
        chain: monadTestnet,
        account,
      });
      await publicClient.waitForTransactionReceipt({ hash: commitHash });
      txs.push(commitHash);
    }

    const claimHashTx = await walletClient.writeContract({
      address: ESCROW_ADDRESS,
      abi: claimAbi,
      functionName: "claim",
      args: [claimIdBig, secretBig, recipientAddr],
      chain: monadTestnet,
      account,
    });
    await publicClient.waitForTransactionReceipt({ hash: claimHashTx });
    txs.push(claimHashTx);

    return NextResponse.json({
      ok: true,
      recipient: recipientAddr,
      amount: amount.toString(),
      txs,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Relayer request failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}