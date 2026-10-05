import { NextResponse } from "next/server";

/**
 * Same-origin guard for the money API routes (`/api/claim`, `/api/refund`,
 * `/api/faucet`, `/api/drip`).
 *
 * Why it exists: Vercel serves API routes with `access-control-allow-origin: *`,
 * so any attacker's website can issue a cross-origin POST against these routes
 * and drain the relayer / faucet gas budgets. A browser ALWAYS sends an
 * `Origin` header on a cross-site fetch/XHR - that is the signal we reject on.
 *
 * Rule (checked before any gas is spent):
 *  - No `Origin` header (curl, CLI, health checks, some same-origin XHR that
 *    strips it): not a cross-site browser request -> ALLOW. Damage is still
 *    bounded by each route's per-IP / per-claim / daily caps.
 *  - `Origin` host == the request's own host (`Host` / `x-forwarded-host`)
 *    -> same-origin use (our page calling our API) -> ALLOW.
 *    This dynamic comparison means the app also works behind a changing
 *    cloudflared quick-tunnel URL without hardcoding those hosts.
 *  - `Origin` host == a known dev origin (localhost) -> ALLOW.
 *  - Anything else (a different host) -> cross-site -> REJECT with 403.
 */

const DEV_ORIGINS = new Set<string>([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * Only the `Host` header is trusted for the comparison. `X-Forwarded-Host` is
 * NOT: browsers may set `X-Forwarded-*` headers on cross-site fetch, so a
 * client could forge it to match its own origin. On Vercel the edge sets
 * `Host` to the real request target, so `Host` is authoritative; and when the
 * app runs behind a tunnel the browser's Origin host still equals the
 * Host it dialed, so tunnels keep working without any allowlist.
 */
function isSameOrigin(origin: string, host: string | null): boolean {
  if (DEV_ORIGINS.has(origin)) return true;
  const oHost = hostOf(origin);
  if (!oHost || !host) return false;
  return oHost.replace(/:\d+$/, "") === host.replace(/:\d+$/, "");
}

/**
 * Return a 403 `NextResponse` to reject a cross-site request, or `null` when the
 * request may proceed. Call at the very top of a route's POST and `return` the
 * result when it is non-null, so nothing below ever runs for an attacker's
 * cross-site POST.
 */
export function requireSameOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return null;

  const host = request.headers.get("host");
  if (isSameOrigin(origin, host)) return null;

  return NextResponse.json(
    { error: "Cross-site requests are not allowed on this endpoint." },
    { status: 403 },
  );
}
