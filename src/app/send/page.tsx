"use client";

import { useRouter } from "next/navigation";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useState } from "react";
import { keccak256, toHex } from "viem";
import { useSponsoredSend } from "@/components/useSponsoredSend";
import {
  Card,
  Loading,
  MockBadge,
  Notice,
  PrimaryButton,
  Shell,
} from "@/components/ui";
import {
  ESCROW_ADDRESS,
  STABLECOIN_ADDRESS,
  STABLECOIN_DECIMALS,
  erc20Abi,
  escrowAbi,
  monadTestnet,
  publicClient,
} from "@/lib/chain";
import {
  CORRIDOR,
  FEE_QUOTES,
  formatNgn,
  formatUsd,
  quoteFee,
  usdToNgn,
} from "@/lib/corridor";

const MAX_UINT256 = (1n << 256n) - 1n;

export default function SendPage() {
  const router = useRouter();
  const { ready, user } = usePrivy();
  const { wallets } = useWallets();
  const address = (wallets ?? [])[0]?.address;
  const sponsored = useSponsoredSend();
  const [amount, setAmount] = useState("100");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usd = Number(amount) > 0 ? Number(amount) : 0;
  const ngn = usdToNgn(usd);
  const remitFee = quoteFee(FEE_QUOTES[0], usd);
  const wireFee = quoteFee(FEE_QUOTES[1], usd);
  const serviceFee = quoteFee(FEE_QUOTES[2], usd);
  const savings = Math.max(0, wireFee - remitFee);

  async function handleSend() {
    if (usd <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const amountUnits = BigInt(Math.round(usd * 10 ** STABLECOIN_DECIMALS));

      // 0. Make sure the sender can pay for its own transactions. Privy gas
      //    sponsorship does not work on Monad testnet (AGENT.md 5.2), so a
      //    brand-new account holding zero MON would fail on `approve`. Ask the
      //    server for a small top-up first; it is a no-op if we already have
      //    enough, and it fails softly so a send is never blocked outright.
      if (address) {
        try {
          await fetch("/api/drip", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address }),
          });
        } catch {
          // Ignore: the send below will surface a clear error if gas is short.
        }
      }

      // 1. Approve the escrow to pull exactly this amount. Gas is sponsored,
      //    so the sender never needs to hold MON.
      const approveHash = await sponsored.approve(
        ESCROW_ADDRESS,
        MAX_UINT256,
      );
      await publicClient.waitForTransactionReceipt({ hash: approveHash });

      // 2. Secret lives only client-side; only its hash goes on-chain.
      //    32 random bytes -> uint256 (the contract stores keccak256 of it).
      const secret = BigInt(toHex(crypto.getRandomValues(new Uint8Array(32))));
      const claimHash = keccak256(toHex(secret, { size: 32 }));

      // 3. Escrow for 7 days.
      const expiry = BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60);

      const hash = await sponsored.createClaim(
        STABLECOIN_ADDRESS,
        amountUnits,
        claimHash,
        expiry,
      );
      await publicClient.waitForTransactionReceipt({ hash });

      // 4. Read the new claimId back on-chain.
      const nextId = (await publicClient.readContract({
        address: ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName: "nextClaimId",
      })) as bigint;
      const claimId = nextId - 1n;

      // 5. Hand the secret to the share screen via sessionStorage only -
      //    never a query param, never logged server-side.
      sessionStorage.setItem(`secret:${claimId}`, secret.toString());

      router.push(`/share/${claimId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <Shell title="Send money"><Loading /></Shell>;
  if (!user) return null;

  return (
    <Shell
      title="Send money"
      subtitle={`${CORRIDOR.label} · ${CORRIDOR.toCurrency}`}
      back={{ href: "/home", label: "Back" }}
    >
      <Card>
        <label htmlFor="amount" className="text-xs text-muted">
          You send
        </label>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-serif text-2xl">$</span>
          <input
            id="amount"
            type="number"
            inputMode="decimal"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-transparent font-serif text-4xl outline-none"
            placeholder="0"
          />
        </div>
        <p className="mt-3 text-sm text-muted">
          They receive about{" "}
          <span className="font-medium text-foreground">{formatNgn(ngn)}</span>{" "}
          <MockBadge label="MOCK RATE" />
        </p>
      </Card>

      <Card className="mt-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted">What it costs</p>
          <MockBadge label="ILLUSTRATIVE" />
        </div>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-foreground">RemitLink</dt>
            <dd className="font-medium">{formatUsd(remitFee)}</dd>
          </div>
          <div className="flex justify-between text-muted">
            <dt>Typical bank wire</dt>
            <dd>{formatUsd(wireFee)}</dd>
          </div>
          <div className="flex justify-between text-muted">
            <dt>Typical remittance service</dt>
            <dd>{formatUsd(serviceFee)}</dd>
          </div>
        </dl>
        <p className="mt-3 rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent">
          You save about {formatUsd(savings)} vs a bank wire.
        </p>
      </Card>

      {error ? (
        <div className="mt-4">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}

      <div className="mt-5">
        <PrimaryButton
          disabled={busy || usd <= 0 || !sponsored.hasWallet}
          onClick={handleSend}
        >
          {busy ? "Setting up your link…" : "Create claim link"}
        </PrimaryButton>
        <p className="mt-3 text-center text-xs text-muted">
          The money stays locked until they claim it, or returns to you after 7 days.
        </p>
      </div>
    </Shell>
  );
}