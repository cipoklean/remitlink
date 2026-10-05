import { NextResponse } from "next/server";
import {
  createWalletClient,
  encodeFunctionData,
  formatUnits,
  http,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { normalizePrivateKey } from "@/lib/key";
import {
  STABLECOIN_ADDRESS,
  STABLECOIN_DECIMALS,
  erc20Abi,
  monadTestnet,
  publicClient,
} from "@/lib/chain";

/**
 * Test-money faucet (AGENT.md section 7b, item A1).
 *
 * MOCK / TESTNET ONLY. It moves real testnet USDC from a treasury wallet we
 * control so a judge can try the app without hunting for a faucet. There is no
 * mainnet equivalent and this route must never be pointed at a live chain.
 *
 * The treasury private key is read from TREASURY_PRIVATE_KEY and never leaves
 * the server: it is not a NEXT_PUBLIC_ variable and is never sent to the client.
 * If it is missing, the route returns a clear "not configured" error instead of
 * pretending to work.
 *
 * Abuse protection (same reasoning as the relayer):
 *  - per-IP: max 3 requests / 10 minutes
 *  - per-address: one drip per TREASURY_DRIP_COOLDOWN_MS (default 1 hour), so
 *    repeated taps cannot drain the treasury
 *  - daily cap: stop once TREASURY_DAILY_CAP_USDC has been sent, so a runaway
 *    script cannot exhaust the demo funds before judging starts
 *  - balance guards: refuse if the treasury lacks the USDC or the MON for gas
 */

const DRIP_USDC = parseUnits(
  process.env.TREASURY_DRIP_USDC ?? "50",
  STABLECOIN_DECIMALS,
);
const MIN_NATIVE = parseUnits("0.05", 18);
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_IP = 3;
const DEFAULT_DAILY_CAP_USDC = 300;
const DEFAULT_COOLDOWN_MS = 60 * 60 * 1000;

const ipHits = new Map<string, number[]>();
const addressLastDrip = new Map<string, number>();
let daySentUsdc = 0n;
let dayStamp = 0;

function rollDay() {
  const now = Date.now();
  if (dayStamp === 0) {
    dayStamp = now;
  } else if (now - dayStamp > 24 * 60 * 60 * 1000) {
    dayStamp = now;
    daySentUsdc = 0n;
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
  const cooldown = Number(
    process.env.TREASURY_DRIP_COOLDOWN_MS ?? DEFAULT_COOLDOWN_MS,
  );
  const last = addressLastDrip.get(address);
  return typeof last === "number" && Date.now() - last < cooldown;
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const raw = process.env.TREASURY_PRIVATE_KEY;
    if (!raw) {
      return NextResponse.json(
        {
          error:
            "Test money is not set up on this deployment (TREASURY_PRIVATE_KEY missing).",
        },
        { status: 501 },
      );
    }
    const keyNorm = normalizePrivateKey(raw);
    if (!keyNorm.ok) {
      return NextResponse.json(
        {
          error: `TREASURY_PRIVATE_KEY is not usable: ${keyNorm.error}.`,
        },
        { status: 501 },
      );
    }
    const key = keyNorm.key;

    const body = (await request.json()) as { address?: string };
    const address = body.address;
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
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
        { error: "You already received test money. Try again later." },
        { status: 429 },
      );
    }

    rollDay();
    const dailyCap = parseUnits(
      process.env.TREASURY_DAILY_CAP_USDC ?? String(DEFAULT_DAILY_CAP_USDC),
      STABLECOIN_DECIMALS,
    );
    if (daySentUsdc + DRIP_USDC > dailyCap) {
      return NextResponse.json(
        { error: "Today's test money has all been claimed." },
        { status: 429 },
      );
    }

    const account = privateKeyToAccount(key as `0x${string}`);
    const treasury = account.address;

    const [tokenBalance, nativeBalance] = await Promise.all([
      publicClient.readContract({
        address: STABLECOIN_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [treasury],
      }),
      publicClient.getBalance({ address: treasury }),
    ]);

    if (tokenBalance < DRIP_USDC) {
      return NextResponse.json(
        { error: "The test-money supply is empty. Ask the demo host." },
        { status: 503 },
      );
    }
    if (nativeBalance < MIN_NATIVE) {
      return NextResponse.json(
        { error: "The test-money account needs a little MON for fees." },
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
      to: STABLECOIN_ADDRESS,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [address as `0x${string}`, DRIP_USDC],
      }),
    });

    await publicClient.waitForTransactionReceipt({ hash });
    addressLastDrip.set(address, Date.now());
    daySentUsdc += DRIP_USDC;

    return NextResponse.json({
      ok: true,
      hash,
      amountUsd: Number(formatUnits(DRIP_USDC, STABLECOIN_DECIMALS)),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not send test money." },
      { status: 500 },
    );
  }
}