"use client";

import {
  PrivyProvider,
  useLoginWithPasskey,
  usePrivy,
  useSignupWithPasskey,
} from "@privy-io/react-auth";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;

function AuthButtons() {
  const { ready, user, logout } = usePrivy();
  const { loginWithPasskey } = useLoginWithPasskey();
  const { signupWithPasskey } = useSignupWithPasskey();

  if (!ready) {
    return <p className="text-center text-sm text-zinc-500">Loading…</p>;
  }

  if (user) {
    return (
      <div className="rounded-2xl border border-zinc-200 p-4 text-center">
        <p className="text-sm text-zinc-600">Signed in</p>
        <p className="mt-1 truncate font-mono text-xs text-zinc-500">
          {user.id}
        </p>
        <button
          onClick={logout}
          className="mt-4 w-full rounded-full bg-zinc-900 py-2.5 text-sm font-medium text-white"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => loginWithPasskey()}
        className="w-full rounded-full bg-teal-700 py-3 text-sm font-medium text-white"
      >
        Continue with passkey
      </button>
      <button
        onClick={() => signupWithPasskey()}
        className="w-full rounded-full border border-zinc-300 py-3 text-sm font-medium text-zinc-800"
      >
        Create an account with passkey
      </button>
    </div>
  );
}

export default function Page() {
  return (
    <PrivyProvider appId={PRIVY_APP_ID} config={{ loginMethods: ["passkey"] }}>
      <main className="flex min-h-[100dvh] flex-col items-center justify-center px-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            RemitLink
          </h1>
          <p className="mx-auto mt-2 max-w-xs text-sm text-zinc-600">
            Send dollars home in seconds. No account needed — your passkey is
            your account.
          </p>
        </div>
        <div className="mt-8 w-full max-w-sm">
          <AuthButtons />
        </div>
      </main>
    </PrivyProvider>
  );
}
