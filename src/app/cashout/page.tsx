"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Card, Loading, MockBadge, Notice, PrimaryButton, SecondaryButton, Shell } from "@/components/ui";
import { formatNgn, formatUsd, usdToNgn } from "@/lib/corridor";
import {
  CASH_OUT_PARTNERS,
  isValidNgnAccount,
  type CashOutPartner,
} from "@/lib/cashout";

/**
 * Cash-out to a Nigerian bank - MOCK (AGENT.md section 7b, item A4).
 *
 * This screen is a STORY, not an integration. Nothing is sent anywhere: no
 * partner API is called, no payout is triggered, no money moves. It exists so
 * the product has a complete shape - money arrives, then it lands in a real bank
 * account - while staying honest about what is real.
 *
 * It is labeled MOCK in the UI, in code comments, and must be labeled in the
 * README and the write-up (hard rule 4). The production path named in the
 * README is a licensed off-ramp, not this.
 *
 * The amount comes from the URL only as a display figure; nothing is trusted
 * from the client for a real payout, and none of this is stored.
 */

function CashOutInner() {
  const params = useSearchParams();
  const router = useRouter();

  const usd = Number(params.get("usd") ?? "0") || 0;
  const ngnGross = usdToNgn(usd);
  const [partner, setPartner] = useState<CashOutPartner | null>(null);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!usd) {
    return (
      <Shell title="Cash out" back={{ href: "/home", label: "Home" }}>
        <Card>
          <p className="text-sm text-muted">
            We don&apos;t know how much to cash out. Claim your money first, then
            come back here.
          </p>
        </Card>
      </Shell>
    );
  }

  // Confirmation state.
  if (done && partner) {
    const ngnNet = ngnGross - partner.feeUsd * usdToNgn(1);
    return (
      <Shell title="Almost there" back={{ href: "/home", label: "Home" }}>
        <Card>
          <div className="flex items-center gap-2">
            <MockBadge label="MOCK - NOT A REAL PAYOUT" />
          </div>
          <p className="mt-3 font-serif text-3xl">{formatNgn(ngnNet)}</p>
          <p className="mt-1 text-xs text-muted">
            {partner.label} · {partner.eta}
          </p>
        </Card>

        <div className="mt-4">
          <Notice tone="info">
            <strong>This is a demo.</strong> No money has moved and no bank was
            contacted. A real version would call a licensed payout partner and
            send the money to your account.
          </Notice>
        </div>

        <dl className="mt-4 space-y-2 rounded-2xl border border-line p-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Bank</dt>
            <dd className="text-xs">{bankCode}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Account number</dt>
            <dd className="font-mono text-xs">{accountNumber}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Account name</dt>
            <dd className="text-xs">{accountName}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Fee</dt>
            <dd className="text-xs">{formatUsd(partner.feeUsd)}</dd>
          </div>
        </dl>

        <div className="mt-5">
          <PrimaryButton onClick={() => router.push("/home")}>
            Done
          </PrimaryButton>
        </div>
      </Shell>
    );
  }

  // Details step.
  if (!partner) {
    return (
      <Shell title="Cash out" back={{ href: "/home", label: "Home" }}>
        <Card>
          <div className="flex items-center gap-2">
            <MockBadge label="MOCK" />
            <span className="text-xs text-muted">
              Demo only - no real payout
            </span>
          </div>
          <p className="mt-3 text-xs text-muted">You&apos;ll receive</p>
          <p className="mt-1 font-serif text-3xl">{formatNgn(ngnGross)}</p>
          <p className="mt-1 text-xs text-muted">
            from {formatUsd(usd)} · at a sample rate, for demo purposes
          </p>
        </Card>

        <div className="mt-4 space-y-3">
          {CASH_OUT_PARTNERS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPartner(p)}
              className="flex w-full items-center justify-between rounded-2xl border border-line bg-white/70 px-4 py-4 text-left"
            >
              <span>
                <span className="block text-sm font-medium">{p.label}</span>
                <span className="block text-xs text-muted">
                  {p.eta} · {formatUsd(p.feeUsd)} fee
                </span>
              </span>
              <span className="text-muted">›</span>
            </button>
          ))}
        </div>
      </Shell>
    );
  }

  // Form step.
  const accountValid = isValidNgnAccount(accountNumber);
  const bankValid = /^\d{3}$/.test(bankCode);
  const nameValid = accountName.trim().length >= 2;

  return (
    <Shell
      title={partner.label}
      subtitle="Where should the money go?"
      back={{ href: "/home", label: "Home" }}
    >
      <div className="mb-4 flex items-center gap-2">
        <MockBadge label="MOCK" />
        <span className="text-xs text-muted">Demo only - no real payout</span>
      </div>

      <Card>
        <label className="block text-xs text-muted" htmlFor="bank">
          Bank code
        </label>
        <input
          id="bank"
          value={bankCode}
          onChange={(e) => setBankCode(e.target.value)}
          placeholder="e.g. 058"
          inputMode="numeric"
          maxLength={3}
          className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm"
        />
        <p className="mt-1 text-xs text-muted">
          Three digits for most Nigerian banks
        </p>
      </Card>

      <Card className="mt-3">
        <label className="block text-xs text-muted" htmlFor="account">
          Account number
        </label>
        <input
          id="account"
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value)}
          placeholder="10 digits"
          inputMode="numeric"
          maxLength={10}
          className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm"
        />
      </Card>

      <Card className="mt-3">
        <label className="block text-xs text-muted" htmlFor="accname">
          Account name
        </label>
        <input
          id="accname"
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          placeholder="As it appears at your bank"
          className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm"
        />
        <p className="mt-1 text-xs text-muted">
          Must match the name on the account
        </p>
      </Card>

      {error ? (
        <div className="mt-3">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        <PrimaryButton
          onClick={() => {
            if (!bankValid) {
              setError("Enter your 3-digit bank code.");
              return;
            }
            if (!accountValid) {
              setError("Enter your 10-digit account number.");
              return;
            }
            if (!nameValid) {
              setError("Enter the name on your account.");
              return;
            }
            setError(null);
            setDone(true);
          }}
        >
          Confirm
        </PrimaryButton>
        <SecondaryButton onClick={() => setPartner(null)}>
          Change method
        </SecondaryButton>
      </div>
    </Shell>
  );
}

export default function CashOutPage() {
  return (
    <Suspense
      fallback={
        <Shell title="Cash out">
          <Loading />
        </Shell>
      }
    >
      <CashOutInner />
    </Suspense>
  );
}