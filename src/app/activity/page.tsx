"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { formatUnits, parseEventLogs } from "viem";
import {
  Card,
  EmptyState,
  Loading,
  Shell,
} from "@/components/ui";
import {
  ESCROW_ADDRESS,
  STABLECOIN_DECIMALS,
  escrowEventsAbi,
  explorerTx,
  publicClient,
} from "@/lib/chain";

type Row = {
  id: bigint;
  kind: "sent" | "claimed" | "refunded" | "committed";
  party: `0x${string}`;
  amount?: bigint;
  block: bigint;
  hash: `0x${string}`;
};

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
    let cancelled = false;

    (async () => {
      try {
        // Read events straight from the contract. Envio indexing comes later —
        // see AGENT.md (spec 4 allows direct event reads as the fallback).
        const rawLogs = await publicClient.getLogs({
          address: ESCROW_ADDRESS,
          events: escrowEventsAbi,
          fromBlock: 0n,
          toBlock: "latest",
        });

        const decoded = parseEventLogs({
          abi: escrowEventsAbi,
          logs: rawLogs,
        });
        const mine = (address ?? "").toLowerCase();
        const rows: Row[] = [];

        for (const log of decoded) {
          if (log.eventName === "ClaimCreated") {
            if (log.args.sender.toLowerCase() !== mine) continue;
            rows.push({
              id: log.args.claimId,
              kind: "sent",
              party: log.args.sender,
              amount: log.args.amount,
              block: log.blockNumber ?? 0n,
              hash: log.transactionHash,
            });
          }
          if (log.eventName === "RecipientCommitted") {
            if (log.args.recipient.toLowerCase() !== mine) continue;
            rows.push({
              id: log.args.claimId,
              kind: "committed",
              party: log.args.recipient,
              block: log.blockNumber ?? 0n,
              hash: log.transactionHash,
            });
          }
          if (log.eventName === "ClaimClaimed") {
            if (log.args.recipient.toLowerCase() !== mine) continue;
            rows.push({
              id: log.args.claimId,
              kind: "claimed",
              party: log.args.recipient,
              amount: log.args.amount,
              block: log.blockNumber ?? 0n,
              hash: log.transactionHash,
            });
          }
          if (log.eventName === "ClaimRefunded") {
            if (log.args.sender.toLowerCase() !== mine) continue;
            rows.push({
              id: log.args.claimId,
              kind: "refunded",
              party: log.args.sender,
              amount: log.args.amount,
              block: log.blockNumber ?? 0n,
              hash: log.transactionHash,
            });
          }
        }

        rows.sort((a, b) => (a.block < b.block ? 1 : -1));
        if (!cancelled) setRows(rows);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Could not load activity.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
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
      ) : rows && rows.length === 0 ? (
        <EmptyState
          title="Nothing yet"
          body="Sends and claims will show up here."
        />
      ) : (
        <div className="space-y-3">
          {rows?.map((row, i) => (
            <Card key={`${row.kind}-${row.id}-${i}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{label(row.kind)}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Link #{row.id.toString()}
                    {row.amount !== undefined
                      ? ` · $${formatUnits(row.amount, STABLECOIN_DECIMALS)}`
                      : ""}
                  </p>
                </div>
                <a
                  href={explorerTx(row.hash)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-accent underline underline-offset-4"
                >
                  Details
                </a>
              </div>
            </Card>
          ))}
        </div>
      )}

      {error ? (
        <p className="mt-4 text-sm text-red-600">
          Could not load activity: {error}
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

function label(kind: Row["kind"]): string {
  switch (kind) {
    case "sent":
      return "You sent money";
    case "committed":
      return "You committed to claim";
    case "claimed":
      return "You claimed money";
    case "refunded":
      return "Money returned to you";
  }
}