"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
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
  escrowAbi,
  publicClient,
} from "@/lib/chain";
import { CORRIDOR, formatNgn, usdToNgn } from "@/lib/corridor";
import { copyText, type CopyResult } from "@/lib/copy";

export default function SharePage() {
  const params = useParams<{ claimId: string }>();
  const claimId = params?.claimId ?? "";
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState<CopyResult | null>(null);
  const [amount, setAmount] = useState<string | null>(null);

  useEffect(() => {
    const secret = sessionStorage.getItem(`secret:${claimId}`);
    if (secret) {
      const origin = window.location.origin;
      // Secret goes in the URL FRAGMENT (#) - browsers never send it to a
      // server, so it cannot leak into server logs or analytics.
      setLink(`${origin}/claim/${claimId}#${secret}`);
    }

    // Read the escrowed amount so the sender sees the real figure.
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
        setAmount(
          `$${formatUnits(value, STABLECOIN_DECIMALS).replace(
            /\B(?=(\d{3})+(?!\d))/g,
            ",",
          )}`,
        );
      })
      .catch(() => setAmount(null));
  }, [claimId]);

  const whatsapp = link
    ? `https://wa.me/?text=${encodeURIComponent(
        `You sent me money. Tap to claim it: ${link}`,
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
        <>
          <Loading label="Building your link…" />
          <Notice>
            If this stays empty, the link was opened on a different device. Go back
            and create a new one from the device where you sent the money.
          </Notice>
        </>
      ) : (
        <>
          <Card>
            <p className="text-xs text-muted">Amount</p>
            <p className="mt-1 font-serif text-2xl">
              {amount ?? `Claim link #${claimId}`}
            </p>
            {amount ? (
              <p className="mt-1 text-xs text-muted">
                About {formatNgn(usdToNgn(Number(amount.replace(/[$,]/g, ""))))}{" "}
                received
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
                window.location.href = `/transfer/${claimId}`;
              }}
            >
              Track this transfer
            </SecondaryButton>
            <SecondaryButton
              onClick={() => {
                sessionStorage.removeItem(`secret:${claimId}`);
                window.location.href = "/home";
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