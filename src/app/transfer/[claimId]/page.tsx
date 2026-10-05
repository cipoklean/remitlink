"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import {
  Card,
  Loading,
  MockBadge,
  PrimaryButton,
  Shell,
} from "@/components/ui";
import {
  ESCROW_ADDRESS,
  STABLECOIN_DECIMALS,
  escrowAbi,
  explorerAddress,
  explorerTx,
  publicClient,
} from "@/lib/chain";
import { copyText, type CopyResult } from "@/lib/copy";
import {
  humanDuration,
  loadMetrics,
  type TransferMetrics,
} from "@/lib/metrics";

/**
 * Transfer status (AGENT.md section 7b, item A3): what state is this transfer
 * in, and what can the sender still do about it.
 *
 * Everything here is read from the contract, never from a database, so the page
 * cannot drift from chain truth.
 */

type State = {
  sender: `0x${string}`;
  recipient: `0x${string}`;
  amount: bigint;
  expiry: bigint;
  settled: boolean;
};

const ZERO = "0x0000000000000000000000000000000000000000";

function shorten(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function when(ts: bigint) {
  return new Date(Date.now() && Number(ts) * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function Missing() {
  return (
    <Shell title="Your transfer" back={{ href: "/home", label: "Home" }}>
      <Card>
        <p className="text-sm text-muted">
          We couldn&apos;t find this transfer. Check the link and try again.
        </p>
      </Card>
    </Shell>
  );
}

export default function TransferPage() {
  const params = useParams<{ claimId: string }>();
  const claimId = params?.claimId ?? "";
  const [state, setState] = useState<State | null>(null);
  const [missing, setMissing] = useState(false);
  const [copied, setCopied] = useState<CopyResult | null>(null);
  const [refunding, setRefunding] = useState(false);
  const [refundMsg, setRefundMsg] = useState<string | null>(null);
  const [refundHash, setRefundHash] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<TransferMetrics | null>(null);

  // Measured proof (AGENT.md 7b B1): real block timestamps and real gas from the
  // createClaim receipt. Null values render as "not measurable" rather than a
  // made-up number.
  useEffect(() => {
    if (!claimId) return;
    loadMetrics(claimId).then(setMetrics).catch(() => setMetrics(null));
  }, [claimId]);

  useEffect(() => {
    if (!claimId) return;
    publicClient
      .readContract({
        address: ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName: "claims",
        args: [BigInt(claimId)],
      })
      .then((raw) => {
        const v = raw as readonly unknown[];
        const sender = v[0] as `0x${string}`;
        if (sender === ZERO) {
          setMissing(true);
          return;
        }
        setState({
          sender,
          recipient: v[5] as `0x${string}`,
          amount: v[2] as bigint,
          expiry: v[4] as bigint,
          settled: v[6] as boolean,
        });
      })
      .catch(() => setMissing(true));
  }, [claimId]);

  async function requestRefund() {
    setRefunding(true);
    setRefundMsg(null);
    try {
      const res = await fetch("/api/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId }),
      });
      const data = (await res.json()) as {
        hash?: string;
        error?: string;
        hoursLeft?: number;
      };
      if (!res.ok || !data.hash) {
        setRefundMsg(
          data.error === "not-yet-refundable" &&
            typeof data.hoursLeft === "number"
            ? `You can get this back in about ${Math.max(1, Math.round(data.hoursLeft))} hours, once the link expires.`
            : (data.error ?? "Could not return the money yet."),
        );
        return;
      }
      setRefundHash(data.hash);
      setRefundMsg("Returned to your account.");
    } catch {
      setRefundMsg("Could not reach the refund service.");
    } finally {
      setRefunding(false);
    }
  }

  if (!state && !missing) {
    return (
      <Shell title="Your transfer" back={{ href: "/home", label: "Home" }}>
        <Loading label="Loading your transfer…" />
      </Shell>
    );
  }

  if (missing || !state) return <Missing />;

  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const expired = nowSec > state.expiry;
  const claimed = state.settled && !expired;
  const hoursLeft = Math.max(1, Math.ceil(Number(state.expiry - nowSec) / 3600));

  const status = claimed
    ? "Claimed"
    : state.settled
      ? "Returned to you"
      : expired
        ? "Expired"
        : "Waiting to be claimed";

  return (
    <Shell title="Your transfer" back={{ href: "/home", label: "Home" }}>
      <Card>
        <div className="flex items-center gap-2">
          <MockBadge label="TESTNET" />
          <span className="text-xs text-muted">Sending to Nigeria</span>
        </div>
        <p className="mt-3 font-serif text-3xl">
          ${formatUnits(state.amount, STABLECOIN_DECIMALS)}
        </p>
        <p className="mt-1 text-sm font-medium">{status}</p>
      </Card>

      <Card className="mt-4">
        <dl className="space-y-2 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted">Transfer</dt>
            <dd className="font-mono text-xs">#{claimId}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted">To</dt>
            <dd className="font-mono text-xs">
              {state.recipient === ZERO ? "not opened yet" : shorten(state.recipient)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted">Link expires</dt>
            <dd className="text-xs">{when(state.expiry)}</dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={async () => {
            const result = await copyText(
              `${window.location.origin}/claim/${claimId}`,
            );
            setCopied(result);
            setTimeout(() => setCopied(null), 2500);
          }}
          className="mt-4 w-full rounded-full border border-line px-4 py-2.5 text-xs font-medium"
        >
          {copied === "copied"
            ? "Link copied ✓"
            : copied === "failed"
              ? "Copy failed — long-press to copy"
              : "Copy claim link"}
        </button>
      </Card>

      {metrics && !metrics.unavailable ? (
        <Card className="mt-4">
          <p className="text-xs text-muted">Measured on Monad</p>
          <dl className="mt-2 space-y-2 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">Time to settle</dt>
              <dd className="text-xs font-medium">
                {metrics.settleSeconds !== null
                  ? humanDuration(metrics.settleSeconds)
                  : "not settled yet"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">Network fee paid</dt>
              <dd className="font-mono text-xs">
                {metrics.feeMon !== null ? `${metrics.feeMon} MON` : "—"}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-muted">
            Read from block timestamps and the gas actually used — not an
            estimate.
          </p>
        </Card>
      ) : null}

      {state.settled ? null : (
        <Card className="mt-4">
          <p className="text-sm font-medium">
            {expired ? "Get your money back" : "Changed your mind?"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {expired
              ? "This link has expired, so the money can be returned to your account."
              : "You can get this money back once the link expires. Until then it stays safe in escrow."}
          </p>
          <div className="mt-3">
            <PrimaryButton
              onClick={requestRefund}
              disabled={!expired || refunding || Boolean(refundHash)}
            >
              {refunding
                ? "Returning…"
                : refundHash
                  ? "Returned"
                  : expired
                    ? "Return my money"
                    : `Available in ${hoursLeft}h`}
            </PrimaryButton>
          </div>
          {refundMsg ? (
            <p className="mt-2 text-xs text-muted">{refundMsg}</p>
          ) : null}
          {refundHash ? (
            <a
              href={explorerTx(refundHash)}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block text-xs text-accent underline underline-offset-4"
            >
              View the return
            </a>
          ) : null}
        </Card>
      )}

      <div className="mt-5 flex flex-col gap-2 text-center text-xs text-muted">
        <a
          href={explorerAddress(state.sender)}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4"
        >
          View on the explorer
        </a>
        <Link href="/home" className="underline underline-offset-4">
          Back home
        </Link>
      </div>
    </Shell>
  );
}