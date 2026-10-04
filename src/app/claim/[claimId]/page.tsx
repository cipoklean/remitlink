"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useSponsoredSend } from "@/components/useSponsoredSend";
import {
  Card,
  Loading,
  Notice,
  PrimaryButton,
  SecondaryButton,
  Shell,
} from "@/components/ui";
import {
  ESCROW_ADDRESS,
  STABLECOIN_DECIMALS,
  explorerTx,
  escrowAbi,
  publicClient,
} from "@/lib/chain";

type ClaimData = {
  amount: bigint;
  settled: boolean;
  expiry: bigint;
  recipient: `0x${string}`;
};

export default function ClaimPage() {
  const params = useParams<{ claimId: string }>();
  const router = useRouter();
  const claimId = params?.claimId ?? "";
  const { ready, user } = usePrivy();
  const sponsored = useSponsoredSend();
  const address = sponsored.address;

  const [secret, setSecret] = useState<string | null>(null);
  const [claim, setClaim] = useState<ClaimData | null>(null);
  const [status, setStatus] = useState<
    "idle" | "committing" | "claiming" | "done"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  // The secret lives in the URL fragment, which the browser does not transmit.
  useEffect(() => {
    const fromHash = window.location.hash.replace(/^#/, "").trim();
    if (fromHash) {
      setSecret(fromHash);
      return;
    }
    setSecret(sessionStorage.getItem(`secret:${claimId}`));
  }, [claimId]);

  const loadClaim = useCallback(async () => {
    try {
      const raw = (await publicClient.readContract({
        address: ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName: "claims",
        args: [BigInt(claimId)],
      })) as readonly [unknown, unknown, bigint, unknown, bigint, `0x${string}`, boolean];
      setClaim({
        amount: raw[2],
        settled: raw[6],
        expiry: raw[4],
        recipient: raw[5],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this link.");
    }
  }, [claimId]);

  useEffect(() => {
    if (!claimId) return;
    void loadClaim();
  }, [claimId, loadClaim]);

  async function handleClaim() {
    if (!address || !secret) return;
    setError(null);
    try {
      // Step 1: commit the payout address BEFORE revealing the secret, so a
      // copied secret from the mempool cannot be redirected.
      setStatus("committing");
      const commitHash = await sponsored.commitRecipient(
        BigInt(claimId),
        address,
      );
      await publicClient.waitForTransactionReceipt({ hash: commitHash });

      // Step 2: reveal the secret to release the funds to the committed address.
      setStatus("claiming");
      const claimHash = await sponsored.claim(
        BigInt(claimId),
        BigInt(secret),
        address,
      );
      await publicClient.waitForTransactionReceipt({ hash: claimHash });

      setTxHash(claimHash);
      setStatus("done");
      await loadClaim();
    } catch (e) {
      setStatus("idle");
      setError(
        e instanceof Error
          ? friendlyError(e.message)
          : "Something went wrong. Try again.",
      );
    }
  }

  if (!ready) {
    return (
      <Shell title="You received money">
        <Loading />
      </Shell>
    );
  }

  if (claim?.settled) {
    return (
      <Shell title="Already claimed">
        <Notice tone="success">
          This link has been used. If that was not you, contact the sender.
        </Notice>
      </Shell>
    );
  }

  return (
    <Shell
      title="You received money"
      subtitle="No forms. Sign in with your face to claim."
    >
      <Card>
        <p className="text-xs text-muted">Amount waiting for you</p>
        <p className="mt-1 font-serif text-3xl">
          {claim ? `$${formatUnits(claim.amount, STABLECOIN_DECIMALS)}` : "—"}
        </p>
        {claim ? (
          <p className="mt-2 text-xs text-muted">
            {claim.expiry > BigInt(Math.floor(Date.now() / 1000))
              ? "Available until the link expires."
              : "This link has expired. Ask the sender to refund it."}
          </p>
        ) : null}
      </Card>

      {!secret ? (
        <div className="mt-4">
          <Notice tone="error">
            This link is missing its secret code. Ask the sender to send the whole
            link, including the part after <code>#</code>.
          </Notice>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3">
        {!user ? (
          <SecondaryButton onClick={() => router.push("/")}>
            Sign in with passkey to claim
          </SecondaryButton>
        ) : claim ? (
          <PrimaryButton
            disabled={
              !secret ||
              !address ||
              status === "committing" ||
              status === "claiming" ||
              claim.expiry <= BigInt(Math.floor(Date.now() / 1000))
            }
            onClick={handleClaim}
          >
            {status === "committing"
              ? "Checking your details…"
              : status === "claiming"
                ? "Sending to you…"
                : "Claim now"}
          </PrimaryButton>
        ) : (
          <Loading label="Checking this link…" />
        )}

        {txHash ? (
          <Notice tone="success">
            Claimed.{" "}
            <a
              href={explorerTx(txHash)}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              View on the explorer
            </a>
          </Notice>
        ) : null}

        <Link
          href="/"
          className="text-center text-xs text-muted underline-offset-4 hover:underline"
        >
          RemitLink home
        </Link>
      </div>
    </Shell>
  );
}

function friendlyError(message: string): string {
  if (message.includes("RecipientNotCommitted"))
    return "This link has already been claimed by someone else.";
  if (message.includes("RecipientMismatch"))
    return "This link is locked to a different account.";
  if (message.includes("WrongSecret"))
    return "This link's code is not valid.";
  if (message.includes("ClaimExpired"))
    return "This link has expired. Ask the sender to refund it.";
  if (message.includes("ClaimSettled"))
    return "This link has already been claimed.";
  return message;
}