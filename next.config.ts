import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the ngrok tunnel host to use dev-only resources (HMR, etc.)
  // so the passkey flow can be tested on a real phone. Remove for production.
  allowedDevOrigins: [
    "debunk-create-headboard.ngrok-free.dev",
    "places-download-charged-dept.trycloudflare.com",
  ],
};

export default nextConfig;
