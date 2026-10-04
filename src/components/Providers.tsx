"use client";

import { PrivyProvider } from "@privy-io/react-auth";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;

export default function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["passkey"],
        embeddedWallets: {
          // Privy v3 config shape: provision an embedded EVM wallet on login.
          ethereum: { createOnLogin: "all-users" },
        },
        appearance: {
          theme: "light",
          accentColor: "#0F766E",
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}