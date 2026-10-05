"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { Card, EmptyState, Loading, Shell } from "@/components/ui";
import { STABLECOIN_DECIMALS, explorerTx } from "@/lib/chain";
import { fetchClaims, type EnvioClaim } from "@/lib/envio";

/**
 * Activity history, read from the Envio HyperIndex (see src/lib/envio.ts for
 * why we cannot read logs directly on Monad testnet).
 */

type Row = {
  key: string;
  title: string;
  detail: string;
  hash: string;
};

function toRows(claims: EnvioClaim[], me: string): Row[] {
  return claims
    .filter((c) => {
      const mine = me.toLowerCase();
      return (
        c.sender?.toLowerCase() === mine ||
        (c.recipient ?? "").toLowerCase() === mine
      );
    })
    .map((c) => {
      const amount = formatUnits(BigInt(c.amount), STABLECOIN_DECIMALS);
      const iAmSender = c.sender?.toLowerCase() === me.toLowerCase();
      const base = `Link #${c.id} · $${amount}`;

      switch (c.status) {
        case "claimed":
          return {
            key: `${c.id}-claimed`,
            title: iAmSender ? "Your money was claimed" : "You claimed money",
            detail: base,
            hash: c.txHash,
          };
        case "refunded":
          return {
            key: `${c.id}-refunded`,
            title: "Money returned to you",
            detail: base,
            hash: c.txHash,
          };
        case "committed":
          return {
            key: `${c.id}-committed`,
            title: iAmSender
              ? "Waiting for the person you paid"
              : "You committed to claim",
            detail: base,
            hash: c.txHash,
          };
        default:
          return {
            key: `${c.id}-created`,
            title: iAmSender ? "You sent money" : "You created a claim",
            detail: base,
            hash: c.txHash,
          };
      }
    });
}

export default function ActivityPage() {
  const router = useRouter();
  const { ready, user } = usePrivy();
  const { wallets } = useWallets();
  const address = (wallets ?? [])[0]?.address;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !user) router.replace("/");
  }, [ready, user, router]);

  useEffect(() => {
    if (!address) return;
    const ctrl = new AbortController();

    (async () => {
      const result = await fetchClaims(ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (result.ok) {
        setRows(toRows(result.claims, address));
      } else if (result.error !== "cancelled") {
        setError(result.error);
        setRows([]);
      }
    })();

    return () => ctrl.abort();
  }, [address]);

  if (!ready) {
    return (
      <Shell title="Activity">
        <Loading />
      </Shell>
    );
  }
  if (!user) return null;

  return (
    <Shell title="Activity" back={{ href: "/home", label: "Home" }}>
      {rows === null && !error ? (
        <Loading label="Loading your activity…" />
      ) : rows && rows.length === 0 && !error ? (
        <EmptyState
          title="Nothing yet"
          body="Sends and claims will show up here."
        />
      ) : (
        <div className="space-y-3">
          {rows?.map((row) => (
            <Card key={row.key}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{row.title}</p>
                  <p className="mt-0.5 text-xs text-muted">{row.detail}</p>
                </div>
                <a
                  href={explorerTx(row.hash)}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-xs text-accent underline underline-offset-4"
                >
                  Details
                </a>
              </div>
            </Card>
          ))}
        </div>
      )}

      {error ? (
        <p className="mt-4 text-sm text-muted">
          Activity history isn&apos;t available right now. Your money and claims
          are unaffected.
        </p>
      ) : null}

      <Link
        href="/home"
        className="mt-6 block text-center text-xs text-muted underline-offset-4 hover:underline"
      >
        Back home
      </Link>
    </Shell>
  );
}