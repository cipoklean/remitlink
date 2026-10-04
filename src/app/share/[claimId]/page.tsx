"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Card,
  Loading,
  Notice,
  PrimaryButton,
  SecondaryButton,
  Shell,
} from "@/components/ui";
import { CORRIDOR, formatNgn } from "@/lib/corridor";

export default function SharePage() {
  const params = useParams<{ claimId: string }>();
  const claimId = params?.claimId ?? "";
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const secret = sessionStorage.getItem(`secret:${claimId}`);
    if (!secret) return;
    const origin = window.location.origin;
    // Secret goes in the URL FRAGMENT (#) — browsers never send it to a server,
    // so it cannot leak into server logs or analytics.
    setLink(`${origin}/claim/${claimId}#${secret}`);
  }, [claimId]);

  const whatsapp = link
    ? `https://wa.me/?text=${encodeURIComponent(
        `You sent me money. Tap to claim it: ${link}`,
      )}`
    : null;

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
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
            <p className="mt-1 font-serif text-2xl">Claim link #${claimId}</p>
            <p className="mt-2 text-sm text-muted">
              The money is locked until they claim it, or comes back to you after 7
              days.
            </p>
          </Card>

          <div className="mt-4 flex flex-col gap-3">
            <PrimaryButton onClick={copyLink}>
              {copied ? "Copied ✓" : "Copy link"}
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
              The part after <code>#</code> is the secret key. Treat it like cash —
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