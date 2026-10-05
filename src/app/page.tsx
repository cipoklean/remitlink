"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useLoginWithPasskey,
  usePrivy,
  useSignupWithPasskey,
} from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import {
  CORRIDOR,
  FEE_QUOTES,
  formatNgn,
  formatUsd,
  quoteFee,
  usdToNgn,
} from "@/lib/corridor";
import {
  Loading,
  MockBadge,
  Notice,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui";

/** Turn Privy error codes into something actionable for a non-technical user. */
function friendlyAuthError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (/invalid_origin|not been allowlisted/i.test(message)) {
    return "This site isn't approved for sign-in yet. Ask the developer to add this domain to the Privy allowlist.";
  }
  if (/PRF_UNAVAILABLE|PRF/i.test(message)) {
    return "Your phone didn't share the passkey key. Try a different browser or device.";
  }
  if (/user_cancelled|cancelled|canceled/i.test(message)) {
    return "Sign-in was cancelled. Try again when you're ready.";
  }
  return message;
}

function SignInPanel() {
  const router = useRouter();
  const { ready, user } = usePrivy();
  const [error, setError] = useState<string | null>(null);

  const { loginWithPasskey } = useLoginWithPasskey({
    onError: (e) => setError(friendlyAuthError(e)),
  });
  const { signupWithPasskey } = useSignupWithPasskey({
    onError: (e) => setError(friendlyAuthError(e)),
  });

  useEffect(() => {
    if (user) router.replace("/home");
  }, [user, router]);

  if (!ready) return <Loading label="Getting things ready…" />;

  if (user) return <Loading label="Taking you to your account…" />;

  return (
    <div className="flex flex-col gap-3">
      <PrimaryButton onClick={() => loginWithPasskey()}>
        Continue with passkey
      </PrimaryButton>
      <SecondaryButton onClick={() => signupWithPasskey()}>
        First time here? Create an account
      </SecondaryButton>
      <p className="mt-1 text-center text-xs text-muted">
        Your fingerprint or face is your account. No passwords, no forms.
      </p>
      {error ? (
        <div className="mt-3">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}
    </div>
  );
}

function AccountPanel() {
  const { logout } = usePrivy();
  return (
    <div className="flex flex-col gap-3">
      <Link
        href="/home"
        className="w-full rounded-full bg-accent px-5 py-3.5 text-center text-sm font-medium text-white"
      >
        Open RemitLink
      </Link>
      <SecondaryButton onClick={logout}>Sign out</SecondaryButton>
    </div>
  );
}

export default function Page() {
  const { ready, user } = usePrivy();
  const sampleUsd = 200;

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="text-center">
        <p className="text-xs font-medium tracking-[0.18em] text-muted uppercase">
          {CORRIDOR.label}
        </p>
        <h1 className="mt-3 font-serif text-4xl leading-tight tracking-tight">
          Send money home
          <br />
          <span className="italic text-accent">without the runaround.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-muted">
          Sign in with your fingerprint or face. Send dollars. Share one link.
          They claim it with their own passkey - no account, no app, no forms.
        </p>
        <p className="mx-auto mt-3 text-xs text-muted">
          {formatUsd(sampleUsd)} arrives as about{" "}
          <span className="font-medium text-foreground">
            {formatNgn(usdToNgn(sampleUsd))}
          </span>{" "}
          <MockBadge label="MOCK RATE" />
        </p>
      </div>

      {/* Fee comparison is the pitch, so it is the hero card (audit 4B): an
          accent-soft fill and slightly more presence than the surrounding UI,
          and the example above is demoted to a one-line figure. */}
      <div className="mt-6 rounded-2xl border border-accent/15 bg-accent-soft p-5">
        <p className="text-xs font-medium text-accent">
          Sending {formatUsd(sampleUsd)} today
        </p>
        <div className="mt-2 space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-muted">Typical bank wire</span>
            <span className="font-mono text-sm text-muted line-through">
              {formatUsd(quoteFee(FEE_QUOTES[1], sampleUsd))}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium">With RemitLink</span>
            <span className="font-mono text-lg font-semibold text-accent">
              {formatUsd(quoteFee(FEE_QUOTES[0], sampleUsd))}
            </span>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted">
          You save about{" "}
          <span className="font-medium text-accent">
            {formatUsd(
              Math.max(
                0,
                quoteFee(FEE_QUOTES[1], sampleUsd) -
                  quoteFee(FEE_QUOTES[0], sampleUsd),
              ),
            )}
          </span>{" "}
          · typical fees, illustrative
        </p>
      </div>

      <div className="mt-6">{!ready ? <Loading /> : user ? <AccountPanel /> : <SignInPanel />}</div>
    </main>
  );
}