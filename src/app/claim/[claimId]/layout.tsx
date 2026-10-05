import type { Metadata } from "next";

/**
 * Link-preview metadata for /claim/[id] (audit 4D / B2).
 *
 * The claim page is a client component, so it cannot export its own metadata.
 * This sibling layout is a server component that provides it. We do NOT fetch
 * the on-chain amount here (that would add latency to every page load and the
 * amount is already shown on the page itself); instead the preview is static
 * and honest. A real OG image is a follow-up; the text description is what a
 * WhatsApp/SMS link preview renders today, so it is not blank.
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "You received money - RemitLink",
    description:
      "Someone sent you money. Open this link and claim it with your passkey - no account or forms needed.",
    openGraph: {
      title: "You received money",
      description:
        "Claim your money with your passkey - no account, no forms.",
      type: "website",
      siteName: "RemitLink",
    },
    twitter: {
      card: "summary",
      title: "You received money - RemitLink",
      description: "Claim your money with your passkey - no account, no forms.",
    },
  };
}

export default function ClaimLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
