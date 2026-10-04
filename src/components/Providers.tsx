"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { monadTestnet } from "viem/chains";

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
        // EIP-7702 gas sponsorship requires the provider to know which chain is
        // 7702-capable. Without these, sponsored sends never resolve.
        // https://docs.privy.io/recipes/react/eip-7702
        defaultChain: monadTestnet,
        supportedChains: [monadTestnet],
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