import { NextResponse } from "next/server";
import { createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { normalizePrivateKey } from "@/lib/key";
import { ESCROW_ADDRESS, monadTestnet, publicClient } from "@/lib/chain";

/**
 * Refund relay for the sender side (AGENT.md section 7b, item A3).
 *
 * `ClaimEscrow.refund` is permissionless: it has no msg.sender check and always
 * pays `c.sender`, so our server can pay the gas and the money still goes to
 * the right person. Same reasoning as the recipient claim relayer.
 *
 * Note: refund only becomes possible once the claim expires
 * (`if (block.timestamp <= c.expiry) revert RefundTooEarly()`). Before that the
 * sender has no way to cancel - that is a property of the deployed contract, not
 * a UI gap, so the UI says so plainly instead of offering a button that cannot
 * work.
 *
 * Guards: per-IP limit, per-claim attempt cap, and a daily gas budget, matching
 * the claim relayer so one route cannot be used to drain the relayer.
 */

const refundAbi = parseAbi([
  "function refund(uint256 claimId)",
  "function claims(uint256 claimId) view returns (address sender, address token, uint256 amount, bytes32 claimHash, uint256 expiry, address recipient, bool settled)",
]);

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
  if (dayStamp === 0) {
    dayStamp = now;
  } else if (now - dayStamp > 24 * 60 * 60 * 1000) {
    dayStamp = now;
    daySpentWei = 0n;
  }
}

function rateLimitedIp(ip: string): boolean {
  const now = Date.now();
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  ipHits.set(ip, hits);
  if (ipHits.size > 5000) {
    for (const [k, v] of ipHits) {
      if (v.every((t) => now - t >= WINDOW_MS)) ipHits.delete(k);
    }
  }
  return hits.length > MAX_PER_IP;
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const keyRaw = process.env.RELAYER_PRIVATE_KEY;
    if (!keyRaw) {
      return NextResponse.json(
        { error: "Refunds are not available on this deployment." },
        { status: 501 },
      );
    }
    const keyNorm = normalizePrivateKey(keyRaw);
    if (!keyNorm.ok) {
      return NextResponse.json(
        { error: `RELAYER_PRIVATE_KEY is not usable: ${keyNorm.error}.` },
        { status: 501 },
      );
    }
    const key = keyNorm.key;

    const body = (await request.json()) as { claimId?: string };
    if (!body.claimId || !/^\d+$/.test(body.claimId)) {
      return NextResponse.json(
        { error: "claimId is required." },
        { status: 400 },
      );
    }
    const claimId = BigInt(body.claimId);

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";
    if (rateLimitedIp(ip)) {
      return NextResponse.json(
        { error: "Too many requests. Try again shortly." },
        { status: 429 },
      );
    }

    const attempts = (claimHits.get(body.claimId) ?? 0) + 1;
    claimHits.set(body.claimId, attempts);
    if (attempts > MAX_PER_CLAIM) {
      return NextResponse.json(
        { error: "Too many refund attempts for this transfer." },
        { status: 429 },
      );
    }

    rollDay();
    const cap = BigInt(
      process.env.RELAYER_DAILY_BUDGET_WEI ?? DEFAULT_DAILY_BUDGET_WEI.toString(),
    );
    if (daySpentWei >= cap) {
      return NextResponse.json(
        { error: "Refunds are paused for now. Try again later." },
        { status: 429 },
      );
    }

    // Verify state before spending gas: must exist, be unsettled, and expired.
    const claim = (await publicClient.readContract({
      address: ESCROW_ADDRESS,
      abi: refundAbi,
      functionName: "claims",
      args: [claimId],
    })) as readonly unknown[];

    const sender = claim[0] as `0x${string}`;
    const expiry = claim[4] as bigint;
    const settled = claim[6] as boolean;

    if (sender === "0x0000000000000000000000000000000000000000") {
      return NextResponse.json({ error: "Transfer not found." }, { status: 404 });
    }
    if (settled) {
      return NextResponse.json(
        { error: "This transfer is already complete." },
        { status: 409 },
      );
    }

    const nowSec = BigInt(Math.floor(Date.now() / 1000));
    if (nowSec <= expiry) {
      const hoursLeft = Number((expiry - nowSec) / 3600n);
      return NextResponse.json(
        {
          error: "not-yet-refundable",
          expiry: expiry.toString(),
          hoursLeft,
        },
        { status: 409 },
      );
    }

    const account = privateKeyToAccount(key as `0x${string}`);
    const balance = await publicClient.getBalance({ address: account.address });
    if (balance < BigInt("10000000000000000")) {
      return NextResponse.json(
        { error: "Not enough gas left to process refunds." },
        { status: 503 },
      );
    }

    const wallet = createWalletClient({
      account,
      chain: monadTestnet,
      transport: http(
        process.env.MONAD_TESTNET_RPC_URL ?? publicClient.transport.url,
      ),
    });

    const hash = await wallet.writeContract({
      address: ESCROW_ADDRESS,
      abi: refundAbi,
      functionName: "refund",
      args: [claimId],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    daySpentWei += receipt.gasUsed * receipt.effectiveGasPrice;

    return NextResponse.json({ ok: true, hash });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not refund." },
      { status: 500 },
    );
  }
}