"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import {
  Card,
  PrimaryButton,
  SecondaryButton,
  Shell,
} from "@/components/ui";
import {
  ESCROW_ADDRESS,
  STABLECOIN_DECIMALS,
  escrowAbi,
  publicClient,
} from "@/lib/chain";
import { CORRIDOR, formatNgn, usdToNgn } from "@/lib/corridor";
import { copyText, type CopyResult } from "@/lib/copy";

export default function SharePage() {
  const params = useParams<{ claimId: string }>();
  const claimId = params?.claimId ?? "";
  const router = useRouter();
  const [copied, setCopied] = useState<CopyResult | null>(null);
  const [usd, setUsd] = useState<number | null>(null);

  // The claim link is rebuilt from the sessionStorage secret (left by the send
  // screen) plus the claim id. Both are stable for this mount, so it is a lazy
  // initializer rather than a synchronous setState in an effect (audit 9).
  // The secret travels in the URL FRAGMENT (#) - browsers never send it to a
  // server, so it cannot leak into server logs or analytics.
  const [link] = useState<string | null>(() => {
    if (typeof window === "undefined" || !claimId) return null;
    const secret = sessionStorage.getItem(`secret:${claimId}`);
    if (!secret) return null;
    return `${window.location.origin}/claim/${claimId}#${secret}`;
  });

  // Read the escrowed amount so the sender sees the real figure. The setState
  // happens in the async .then callback, not the effect body.
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
        const value = (raw as readonly unknown[])[2] as bigint;
        setUsd(Number(formatUnits(value, STABLECOIN_DECIMALS)));
      })
      .catch(() => setUsd(null));
  }, [claimId]);

  const whatsapp = link
    ? `https://wa.me/?text=${encodeURIComponent(
        `I sent you ${usd !== null ? `$${usd.toLocaleString("en-US")}` : "money"}. Tap to claim it: ${link}`,
      )}`
    : null;

  async function copyLink() {
    if (!link) return;
    const result = await copyText(link);
    setCopied(result);
    setTimeout(() => setCopied(null), 2500);
  }

  return (
    <Shell
      title="Your link is ready"
      subtitle={`Send it to them on ${CORRIDOR.label}`}
      back={{ href: "/home", label: "Home" }}
    >
      {!link ? (
        <Card>
          <p className="text-sm text-foreground">
            This link was created on another device, so the secret is not here.
          </p>
          <p className="mt-2 text-xs text-muted">
            Open the claim link on the device where you sent the money, or go
            back and create a fresh link from this device.
          </p>
        </Card>
      ) : (
        <>
          <Card>
            <p className="text-xs text-muted">Amount</p>
            <p className="mt-1 font-serif text-2xl">
              {usd !== null
                ? `$${usd.toLocaleString("en-US")}`
                : `Claim link #${claimId}`}
            </p>
            {usd !== null ? (
              <p className="mt-1 text-xs text-muted">
                About {formatNgn(usdToNgn(usd))} received
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted">Link #{claimId}</p>
            )}
            <p className="mt-2 text-sm text-muted">
              The money is locked until they claim it, or comes back to you after 7
              days.
            </p>
          </Card>

          <div className="mt-4 flex flex-col gap-3">
            <PrimaryButton onClick={copyLink}>
              {copied === "copied"
                ? "Copied ✓"
                : copied === "failed"
                  ? "Copy failed - long-press to select"
                  : "Copy link"}
            </PrimaryButton>
            {whatsapp ? (
              <a
                href={whatsapp}
                target="_blank"
                rel="noreferrer"
                className="w-full rounded-full border border-line bg-white/70 px-5 py-3.5 text-center text-sm font-medium"
              >
                Share on WhatsApp
              </a>
            ) : null}
            <SecondaryButton
              onClick={() => {
                sessionStorage.removeItem(`secret:${claimId}`);
                router.push(`/transfer/${claimId}`);
              }}
            >
              Track this transfer
            </SecondaryButton>
            <SecondaryButton
              onClick={() => {
                sessionStorage.removeItem(`secret:${claimId}`);
                // "Done" returns the user to the hub. Replace (not push) so
                // Home stays the single root frame instead of stacking on the
                // task trail; otherwise the native back button re-walks a stale
                // chain of prior screens back to login.
                router.replace("/home");
              }}
            >
              Done
            </SecondaryButton>
          </div>

          <details className="mt-5 text-xs text-muted">
            <summary className="cursor-pointer">Show the raw link</summary>
            <p className="mt-2 break-all rounded-xl border border-line bg-white/70 p-3">
              {link}
            </p>
            <p className="mt-2">
              The part after <code>#</code> is the secret key. Treat it like cash -
              whoever has it can claim the money.
            </p>
          </details>

          <Link
            href="/activity"
            className="mt-6 block text-center text-xs text-muted underline-offset-4 hover:underline"
          >
            View activity
          </Link>
        </>
      )}
    </Shell>
  );
}