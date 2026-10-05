import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the ngrok tunnel host to use dev-only resources (HMR, etc.)
  // so the passkey flow can be tested on a real phone. Remove for production.
  allowedDevOrigins: [
    "debunk-create-headboard.ngrok-free.dev",
    "places-download-charged-dept.trycloudflare.com",
  ],
  async headers() {
    // Security headers for every page.
    //
    // Why: this is a money app. The claim and send screens must never render
    // inside another site's frame, or an attacker can overlay a fake "Claim
    // now" button on top of their own page and trick a recipient into
    // confirming on our page (clickjacking).
    //
    // What is deliberately NOT set yet: a full Content-Security-Policy with
    // script-src / connect-src. The app loads Privy at runtime (passkey
    // sign-in, embedded wallets), which pulls assets from privy.io subdomains
    // that have not been allowlisted and verified. A resource CSP shipped
    // blind would risk breaking sign-in. frame-ancestors below covers the
    // framing risk; revisit a full CSP after confirming Privy's origins
    // (AGENT.md decision log).
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
