"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useCreateWallet,
  useLoginWithPasskey,
  usePrivy,
  useSignupWithPasskey,
} from "@privy-io/react-auth";
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
import { formatNgn, usdToNgn } from "@/lib/corridor";

type ClaimData = {
  amount: bigint;
  settled: boolean;
  expiry: bigint;
  recipient: `0x${string}`;
};

/**
 * The whole recipient journey lives on this one page: sign in with a passkey,
 * create an account if needed, then commit + claim. We deliberately do NOT send
 * the user to the landing page - that bounced them to /home and lost the claim.
 */
export default function ClaimPage() {
  const params = useParams<{ claimId: string }>();
  const claimId = params?.claimId ?? "";

  const { ready, user } = usePrivy();
  const { loginWithPasskey } = useLoginWithPasskey({
    onComplete: () => setSignedIn(true),
    onError: (e: unknown) => {
      setStatus("idle");
      setError(friendlyError(e));
    },
  });
  const { signupWithPasskey } = useSignupWithPasskey({
    onComplete: () => setSignedIn(true),
    onError: (e: unknown) => {
      setStatus("idle");
      setError(friendlyError(e));
    },
  });
  const { createWallet } = useCreateWallet();

  const sponsored = useSponsoredSend();
  const address = sponsored.address;

  // The secret lives in the URL fragment, which browsers never transmit. Read it
  // once on mount via a lazy initializer (audit 9: no synchronous setState in an
  // effect) from the fragment, falling back to the sessionStorage value the send
  // screen left behind.
  const [secret] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const fromHash = window.location.hash.replace(/^#/, "").trim();
    if (fromHash) return fromHash;
    return sessionStorage.getItem(`secret:${claimId}`);
  });
  const [claim, setClaim] = useState<ClaimData | null>(null);
  const [status, setStatus] = useState<
    "idle" | "authing" | "wallet" | "committing" | "claiming" | "done"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  // "Now" as a state value, not a Date.now() call in the render body: the
  // "expired" flag is derived from it. Seeded from the clock when the claim loads
  // (audit 9: impure Date.now() during render), so the flag is correct without an
  // impure render and updates as new claims are read.
  const [nowSec, setNowSec] = useState<number>(0);

  const loadClaim = useCallback(async () => {
    try {
      const raw = (await publicClient.readContract({
        address: ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName: "claims",
        args: [BigInt(claimId)],
      })) as readonly [
        unknown,
        unknown,
        bigint,
        unknown,
        bigint,
        `0x${string}`,
        boolean,
      ];
      setClaim({
        amount: raw[2],
        settled: raw[6],
        expiry: raw[4],
        recipient: raw[5],
      });
      setNowSec(Math.floor(Date.now() / 1000));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not read this claim link.",
      );
    }
  }, [claimId]);

  useEffect(() => {
    if (!claimId) return;
    // loadClaim is an async contract read that setStates inside its .then, i.e.
    // the "subscribe to an external system" pattern the rule allows. It is flagged
    // only because the call is synchronous in the body. Left as a reasoned
    // disable: restructuring the mount-time data fetch risks the claim flow.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch
    void loadClaim();
  }, [claimId, loadClaim]);

  // Derived from nowSec (seeded when the claim loads), not Date.now() in render.
  // While no claim is loaded, claim is null and this is false.
  const expired = claim !== null && claim.expiry <= BigInt(nowSec);

  /**
   * Relay the claim: our server pays the gas so a first-time recipient needs
   * no native token. Falls back to the wallet path if the relayer is
   * unavailable (e.g. misconfigured on a fresh deploy).
   */
  async function runClaim() {
    if (!address || !secret) return;
    setError(null);
    try {
      setStatus("committing");

      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimId,
          secret,
          recipient: address,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        txs?: `0x${string}`[];
      };

      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "The claim could not be completed.");
      }

      setTxHash(data.txs?.[data.txs.length - 1] ?? null);
      setStatus("done");
      await loadClaim();
    } catch (e) {
      setStatus("idle");
      setError(friendlyError(e));
    }
  }

  // Once signed in, make sure an embedded wallet exists, then claim.
  useEffect(() => {
    if (!signedIn || !user || status !== "authing") return;
    let cancelled = false;
    (async () => {
      try {
        if (!address) {
          setStatus("wallet");
          await createWallet();
          if (cancelled) return;
        }
      } catch (e) {
        if (!cancelled) {
          setStatus("idle");
          setError(friendlyError(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, user, address]);

  useEffect(() => {
    if (status === "wallet" && address && secret && !error) {
      // Auto-run the claim once the embedded wallet is ready. runClaim setStates
      // inside its async body (the rule's allowed "subscribe to external system"
      // case); the call is only flagged because it is synchronous here. Reasoned
      // disable: this is the critical claim path and is not restructured.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- async claim action
      void runClaim();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, address]);

  function handleAuth(kind: "login" | "signup") {
    setError(null);
    setStatus("authing");
    // Callbacks are wired on the hooks above (v3 API); the returned functions
    // take only optional credentialIds.
    if (kind === "login") void loginWithPasskey();
    else void signupWithPasskey();
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
      <Shell title="Already claimed" back={{ href: "/", label: "RemitLink home" }}>
        <Notice tone="success">
          This link has been used. If that was not you, contact the sender.
        </Notice>
        <Link
          href="/"
          className="mt-5 block text-center text-xs text-muted underline-offset-4 hover:underline"
        >
          Back to RemitLink
        </Link>
      </Shell>
    );
  }

  const usd = claim ? Number(formatUnits(claim.amount, STABLECOIN_DECIMALS)) : 0;

  return (
    <Shell title="You received money" subtitle="No forms. Your fingerprint or face is your account.">
      <Card>
        <p className="text-xs text-muted">Amount waiting for you</p>
        <p className="mt-1 font-serif text-3xl">
          {claim ? `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "-"}
        </p>
        <p className="mt-1 text-xs text-muted">
          {claim ? `About ${formatNgn(usdToNgn(usd))} received` : "Checking…"}
        </p>
        {expired ? (
          <p className="mt-2 text-xs text-red-600">
            This link has expired. Ask the sender to refund it.
          </p>
        ) : null}
      </Card>

      {!secret ? (
        <div className="mt-4">
          <Notice tone="error">
            This link is missing its code. Ask the sender to send the whole link,
            including the part after <code>#</code>.
          </Notice>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}

      {txHash ? (
        <div className="mt-4">
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
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3">
        {!user ? (
          <>
            <PrimaryButton
              disabled={!secret || status === "authing"}
              onClick={() => handleAuth("login")}
            >
              {status === "authing" ? "Checking…" : "Claim with passkey"}
            </PrimaryButton>
            <SecondaryButton
              disabled={status === "authing"}
              onClick={() => handleAuth("signup")}
            >
              First time here? Create an account
            </SecondaryButton>
          </>
        ) : status === "done" ? (
          // The success Notice ("Claimed. View on the explorer") renders above;
          // the only meaningful next step for a recipient is to cash out, so the
          // done state offers that CTA instead of a dead button (audit 4C).
          <Link
            href={`/cashout?usd=${usd.toFixed(2)}`}
            className="block w-full rounded-full bg-accent px-5 py-3.5 text-center text-sm font-medium text-white"
          >
            Cash out to your bank
          </Link>
        ) : (
          <>
            {txHash ? (
              <Link
                href={`/cashout?usd=${usd.toFixed(2)}`}
                className="block w-full rounded-full bg-accent px-5 py-3.5 text-center text-sm font-medium text-white"
              >
                Cash out to your bank
              </Link>
            ) : null}
            <PrimaryButton
              disabled={
                !secret ||
                !address ||
                expired ||
                status === "wallet" ||
                status === "committing" ||
                status === "claiming"
              }
              onClick={() => void runClaim()}
            >
              {status === "wallet"
                ? "Setting up your account…"
                : status === "committing"
                  ? "Securing your money…"
                  : status === "claiming"
                    ? "Sending to you…"
                    : "Claim now"}
            </PrimaryButton>
            {sponsored.hasWallet ? null : (
              <Loading label="Waiting for your account…" />
            )}
          </>
        )}

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

function friendlyError(message: unknown): string {
  const m = message instanceof Error ? message.message : String(message);
  if (/RecipientNotCommitted/i.test(m))
    return "This link has already been claimed by someone else.";
  if (/RecipientMismatch/i.test(m))
    return "This link is locked to a different account.";
  if (/WrongSecret/i.test(m)) return "This link's code is not valid.";
  if (/ClaimExpired/i.test(m))
    return "This link has expired. Ask the sender to refund it.";
  if (/ClaimSettled/i.test(m)) return "This link has already been claimed.";
  if (/insufficient funds|gas/i.test(m))
    return "Not enough test MON to pay for this step.";
  // Unmapped error: show a calm catch-all instead of the raw viem/SDK text
  // (a bare "execution reverted / 0x…" on screen reads as broken). The raw
  // message is still logged so it is not lost when debugging.
  console.warn("[remitlink] unmapped error surfaced to user:", m);
  return "Something went wrong on this step. Your money is safe and the link is unchanged, so you can try again.";
}