import { NextResponse } from "next/server";
import {
  createWalletClient,
  http,
  keccak256,
  parseAbi,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { normalizePrivateKey } from "@/lib/key";
import { requireSameOrigin } from "@/lib/origin";
import { monadTestnet } from "viem/chains";
import { ESCROW_ADDRESS, publicClient } from "@/lib/chain";

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

/**
 * Abuse protection.
 *
 * Anyone holding a valid secret can make us pay gas, so we bound the damage:
 *  - per-IP: max 10 requests / 10 minutes
 *  - per-claim: max 3 relay attempts (one real flow needs 1-2)
 *  - per-claim-payout: once a claim is settled we never relay it again
 *  - daily budget: stop relaying once RELAYER_DAILY_BUDGET_WEI of gas is spent
 *
 * These are in-memory on purpose: correct for a single Vercel instance and
 * good enough for a hackathon demo. A multi-instance deploy would need a
 * shared store (Upstash/Redis) - see README "Known limitations".
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_IP = 10;
const MAX_PER_CLAIM = 3;
const DEFAULT_DAILY_BUDGET_WEI = BigInt("500000000000000000"); // 0.5 MON

const ipHits = new Map<string, number[]>();
const claimHits = new Map<string, number>();
let daySpentWei = 0n;
let dayStamp = 0;

function rollDay() {
  const now = Date.now();
  if (dayStamp !== 0 && now - dayStamp > 24 * 60 * 60 * 1000) {
    dayStamp = now;
    daySpentWei = 0n;
  } else if (dayStamp === 0) {
    dayStamp = now;
  }
}

function rateLimitedIp(ip: string): boolean {
  const now = Date.now();
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  ipHits.set(ip, hits);
  // opportunistic cleanup so the map cannot grow forever
  if (ipHits.size > 5000) {
    for (const [k, v] of ipHits) {
      if (v.every((t) => now - t >= WINDOW_MS)) ipHits.delete(k);
    }
  }
  return hits.length > MAX_PER_IP;
}

function budgetExhausted(): boolean {
  rollDay();
  const cap = BigInt(
    process.env.RELAYER_DAILY_BUDGET_WEI ?? DEFAULT_DAILY_BUDGET_WEI.toString(),
  );
  return daySpentWei >= cap;
}

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
  // Same-origin guard first: a cross-site browser POST (Origin: evil.example)
  // is rejected before any gas, chain read, or secret work happens.
  const denied = requireSameOrigin(request);
  if (denied) return denied;

  try {
    const relayerKeyRaw = process.env.RELAYER_PRIVATE_KEY;
    if (!relayerKeyRaw) {
      return NextResponse.json(
        { error: "Relayer not configured (RELAYER_PRIVATE_KEY missing)." },
        { status: 500 },
      );
    }
    const relayerKeyNorm = normalizePrivateKey(relayerKeyRaw);
    if (!relayerKeyNorm.ok) {
      return NextResponse.json(
        {
          error: `RELAYER_PRIVATE_KEY is not usable: ${relayerKeyNorm.error}.`,
        },
        { status: 500 },
      );
    }
    const relayerKey = relayerKeyNorm.key;

    // Parse the body safely: malformed JSON used to throw into the catch and
    // become a 500. Now it is a plain 400.
    let body: { claimId?: unknown; secret?: unknown; recipient?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json(
        { error: "The request body is not valid JSON." },
        { status: 400 },
      );
    }

    // Validate input shapes BEFORE touching the chain. claimId and secret are
    // uint256 values; recipient must be an address. BigInt("abc") used to
    // throw an uncaught 500; now every malformed field is a 400.
    const MAX_UINT256 = (1n << 256n) - 1n;
    const asUint256 = (value: unknown): string | null => {
      if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
      const n = BigInt(value);
      return n <= MAX_UINT256 ? value : null;
    };
    const claimId = asUint256(body.claimId);
    const secret = asUint256(body.secret);
    const recipient =
      typeof body.recipient === "string" && /^0x[a-fA-F0-9]{40}$/.test(body.recipient)
        ? (body.recipient as `0x${string}`)
        : null;

    if (!claimId || !secret || !recipient) {
      return NextResponse.json(
        {
          error:
            "claimId and secret must be whole numbers, and a valid account address is required.",
        },
        { status: 400 },
      );
    }

    const claimIdBig = BigInt(claimId);
    const secretBig = BigInt(secret);
    const recipientAddr = recipient;

    // --- abuse guards -------------------------------------------------
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";
    if (rateLimitedIp(ip)) {
      return NextResponse.json(
        { error: "Too many requests. Try again in a few minutes." },
        { status: 429 },
      );
    }

    rollDay();
    const attempts = (claimHits.get(claimId) ?? 0) + 1;
    claimHits.set(claimId, attempts);
    if (attempts > MAX_PER_CLAIM) {
      return NextResponse.json(
        { error: "Too many attempts on this link." },
        { status: 429 },
      );
    }

    if (budgetExhausted()) {
      return NextResponse.json(
        { error: "Relayer is out of daily gas budget. Try again tomorrow." },
        { status: 503 },
      );
    }

    const relayerAccount = privateKeyToAccount(relayerKey);
    const relayerBalance = await publicClient.getBalance({
      address: relayerAccount.address,
    });
    if (relayerBalance === 0n) {
      console.error(
        "[relayer] balance is zero - fund it or claims will fail:",
        relayerAccount.address,
      );
      return NextResponse.json(
        { error: "Relayer needs funding. Try again shortly." },
        { status: 503 },
      );
    }
    // -----------------------------------------------------------------

    const claim = (await publicClient.readContract({
      address: ESCROW_ADDRESS,
      abi: claimsAbi,
      functionName: "claims",
      args: [claimIdBig],
    })) as ClaimTuple;

    const [, , amount, claimHash, expiry, committed, settled] = claim;

    if (settled) {
      // A settled claim must never be relayed again - this is the loop that
      // would otherwise let one caller drain the relayer.
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
    let gasSpent = 0n;

    if (committed === "0x0000000000000000000000000000000000000000") {
      const commitHash = await walletClient.writeContract({
        address: ESCROW_ADDRESS,
        abi: commitAbi,
        functionName: "commitRecipient",
        args: [claimIdBig, recipientAddr],
        chain: monadTestnet,
        account,
      });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: commitHash,
      });
      gasSpent += receipt.gasUsed * receipt.effectiveGasPrice;
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
    const claimReceipt = await publicClient.waitForTransactionReceipt({
      hash: claimHashTx,
    });
    gasSpent += claimReceipt.gasUsed * claimReceipt.effectiveGasPrice;
    txs.push(claimHashTx);

    // Count against today's budget so one caller cannot drain the relayer.
    rollDay();
    daySpentWei += gasSpent;
    console.log(
      `[relayer] claim ${claimId} relayed to ${recipientAddr}; gas ${gasSpent} wei; day total ${daySpentWei} wei`,
    );

    return NextResponse.json({
      ok: true,
      recipient: recipientAddr,
      amount: amount.toString(),
      gasSpentWei: gasSpent.toString(),
      txs,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Relayer request failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}