"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCreateWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { Card, Loading, MockBadge, Shell } from "@/components/ui";
import {
  STABLECOIN_ADDRESS,
  STABLECOIN_DECIMALS,
  publicClient,
} from "@/lib/chain";
import { CORRIDOR } from "@/lib/corridor";

export default function HomePage() {
  const router = useRouter();
  const { ready, user } = usePrivy();
  const { wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const [balance, setBalance] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);

  const address = (wallets ?? [])[0]?.address;

  // Users who signed in before embedded-wallet creation was enabled have no
  // wallet. Offer to create one rather than silently rendering nothing.
  if (ready && user && !address) {
    return (
      <Shell
        title="Finish setting up"
        subtitle="One step left before you can send."
        back={{ href: "/", label: "Sign out" }}
      >
        <Card>
          <p className="text-sm text-muted">
            Your sign-in worked, but this account has no sending address yet.
            Creating one takes a second.
          </p>
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              createWallet()
                .catch((e: unknown) =>
                  setError(
                    e instanceof Error ? e.message : "Could not create account",
                  ),
                )
                .finally(() => setCreating(false));
            }}
            disabled={creating}
            className="mt-4 w-full rounded-full bg-accent px-5 py-3.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {creating ? "Setting up…" : "Set up my account"}
          </button>
          {error ? (
            <p className="mt-2 text-xs text-red-600">{error}</p>
          ) : null}
        </Card>
        <p className="mt-4 text-xs text-muted">
          Still stuck? Sign out and back in — that also creates it.
        </p>
      </Shell>
    );
  }

  useEffect(() => {
    if (ready && !user) router.replace("/");
  }, [ready, user, router]);

  useEffect(() => {
    if (!ready || !user || !address) return;

    let cancelled = false;
    publicClient
      .readContract({
        address: STABLECOIN_ADDRESS,
        abi: [
          {
            name: "balanceOf",
            type: "function",
            stateMutability: "view",
            inputs: [{ name: "owner", type: "address" }],
            outputs: [{ type: "uint256" }],
          },
        ],
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      })
      .then((v) => {
        if (!cancelled) {
          setBalance(formatUnits(v, STABLECOIN_DECIMALS));
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      });
    return () => {
      cancelled = true;
    };
  }, [ready, user, address]);

  if (!ready) return <Shell title="RemitLink"><Loading /></Shell>;
  if (!user) return null;

  return (
    <Shell title="Your account" subtitle={`Sending to ${CORRIDOR.to}`}>
      <Card>
        <p className="text-xs text-muted">Available to send</p>
        <p className="mt-1 font-serif text-3xl">
          {balance === null ? "—" : `$${balance}`}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <MockBadge label="TEST BALANCE" />
          <span className="text-xs text-muted">Demo funds — not real money</span>
        </div>
        {error ? (
          <p className="mt-2 text-xs text-red-600">Could not read balance: {error}</p>
        ) : null}
      </Card>

      {address ? (
        <Card className="mt-4">
          <p className="text-xs text-muted">Your account address</p>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard
                ?.writeText(address)
                .then(() => setCopied(true))
                .catch(() => setCopied(false));
            }}
            className="mt-1 w-full break-all text-left font-mono text-xs text-foreground"
          >
            {address}
          </button>
          <p className="mt-1 text-xs text-muted">
            {copied ? "Copied ✓" : "Tap to copy"}
          </p>
        </Card>
      ) : null}

      <div className="mt-5 flex flex-col gap-3">
        <Link
          href="/send"
          className="w-full rounded-full bg-accent px-5 py-3.5 text-center text-sm font-medium text-white"
        >
          Send money
        </Link>
        <Link
          href="/activity"
          className="w-full rounded-full border border-line bg-white/70 px-5 py-3.5 text-center text-sm font-medium"
        >
          Activity
        </Link>
        <Link
          href="/claim/0"
          className="text-center text-xs text-muted underline-offset-4 hover:underline"
        >
          I have a link to claim
        </Link>
      </div>
    </Shell>
  );
}