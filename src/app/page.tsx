"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useLoginWithPasskey,
  usePrivy,
  useSignupWithPasskey,
} from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { CORRIDOR, formatNgn, formatUsd, usdToNgn } from "@/lib/corridor";
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
  const { ready, user, logout } = usePrivy();
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
        Your face or fingerprint is your account. No passwords, no forms.
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
          Sign in with your face. Send dollars. Share one link. They claim it with
          their own passkey — no account, no app, no forms.
        </p>
      </div>

      <div className="mt-8 rounded-2xl border border-line bg-white/70 p-5">
        <p className="text-xs text-muted">Example</p>
        <p className="mt-1 font-serif text-2xl">{formatUsd(sampleUsd)}</p>
        <p className="mt-1 text-sm text-muted">
          arrives as about{" "}
          <span className="font-medium text-foreground">
            {formatNgn(usdToNgn(sampleUsd))}
          </span>{" "}
          <MockBadge label="MOCK RATE" />
        </p>
      </div>

      <div className="mt-8">{!ready ? <Loading /> : user ? <AccountPanel /> : <SignInPanel />}</div>
    </main>
  );
}