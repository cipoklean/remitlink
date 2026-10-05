import { NextResponse } from "next/server";
import { createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { normalizePrivateKey } from "@/lib/key";
import { requireSameOrigin } from "@/lib/origin";
import { monadTestnet, publicClient } from "@/lib/chain";

/**
 * Gas drip for senders (AGENT.md section 7b, item A2).
 *
 * MOCK / TESTNET ONLY. Sends a small amount of testnet MON from the same
 * relayer wallet that pays recipient-side gas, so a first-time sender never has
 * to buy or hold MON before their first send. Testnet only, no mainnet path.
 *
 * Why not an EIP-2612 permit relay (the other option A2 listed)? Circle USDC on
 * Monad testnet DOES implement `permit` (verified: live DOMAIN_SEPARATOR and
 * nonces), but `ClaimEscrow.createClaim` reads `msg.sender` for both the stored
 * sender and the `safeTransferFrom`, so a server cannot submit it on the user's
 * behalf without changing the contract and redeploying. Dripping gas keeps the
 * deployed contract and its address untouched. Revisit only if time allows.
 *
 * Abuse protection:
 *  - per-IP: max 3 requests / 10 minutes
 *  - per-address: one drip per DRIP_COOLDOWN_MS (default 24h) - we top up, we
 *    do not keep sending
 *  - per-tx cap: DRIP_AMOUNT_MON (default 0.05 MON), so the cost is bounded
 *  - daily cap: DRIP_DAILY_CAP_MON across all addresses, so a scripted run
 *    cannot empty the relayer before judging
 *  - balance guard: refuse if the relayer cannot cover the drip plus gas
 */

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_IP = 3;
const DEFAULT_DRIP = "0.05";
const DEFAULT_DAILY_CAP = "2";
const DEFAULT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const RESERVE_FOR_GAS = parseEther("0.5");

const ipHits = new Map<string, number[]>();
const addressLastDrip = new Map<string, number>();
let daySentWei = 0n;
let dayStamp = 0;

function rollDay() {
  const now = Date.now();
  if (dayStamp === 0) {
    dayStamp = now;
  } else if (now - dayStamp > 24 * 60 * 60 * 1000) {
    dayStamp = now;
    daySentWei = 0n;
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

function inCooldown(address: string): boolean {
  const cooldown = Number(process.env.DRIP_COOLDOWN_MS ?? DEFAULT_COOLDOWN_MS);
  const last = addressLastDrip.get(address);
  return typeof last === "number" && Date.now() - last < cooldown;
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  // Same-origin guard: reject cross-site browser POSTs before gas is moved.
  const denied = requireSameOrigin(request);
  if (denied) return denied;

  try {
    const keyRaw = process.env.RELAYER_PRIVATE_KEY;
    if (!keyRaw) {
      return NextResponse.json(
        { error: "Gas top-up is not available on this deployment." },
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

    let body: { address?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json(
        { error: "The request body is not valid JSON." },
        { status: 400 },
      );
    }
    const address =
      typeof body.address === "string" &&
      /^0x[a-fA-F0-9]{40}$/.test(body.address)
        ? (body.address as `0x${string}`)
        : null;
    if (!address) {
      return NextResponse.json(
        { error: "A valid address is required." },
        { status: 400 },
      );
    }

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

    if (inCooldown(address)) {
      return NextResponse.json(
        { error: "This account already has its gas top-up." },
        { status: 429 },
      );
    }

    rollDay();
    const amount = parseEther(process.env.DRIP_AMOUNT_MON ?? DEFAULT_DRIP);
    const dailyCap = parseEther(
      process.env.DRIP_DAILY_CAP_MON ?? DEFAULT_DAILY_CAP,
    );
    if (daySentWei + amount > dailyCap) {
      return NextResponse.json(
        { error: "Today's gas top-ups are used up." },
        { status: 429 },
      );
    }

    // Skip the drip if the account already has enough to be useful.
    const existing = await publicClient.getBalance({
      address: address as `0x${string}`,
    });
    if (existing >= amount) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const account = privateKeyToAccount(key as `0x${string}`);
    const relayer = account.address;
    const relayerBalance = await publicClient.getBalance({ address: relayer });

    // Keep a reserve so recipient-side relaying still works.
    if (relayerBalance < amount + RESERVE_FOR_GAS) {
      return NextResponse.json(
        { error: "Not enough gas left to share right now." },
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

    const hash = await wallet.sendTransaction({
      to: address as `0x${string}`,
      value: amount,
    });
    await publicClient.waitForTransactionReceipt({ hash });

    addressLastDrip.set(address, Date.now());
    daySentWei += amount;

    return NextResponse.json({
      ok: true,
      hash,
      amountMon: Number(process.env.DRIP_AMOUNT_MON ?? DEFAULT_DRIP),
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Could not top up gas.",
      },
      { status: 500 },
    );
  }
}