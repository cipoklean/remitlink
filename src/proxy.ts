import { NextResponse, type NextRequest } from "next/server";

// Every visitor to "/" sees the marketing landing page (public/landing), on
// desktop and phone. "Try RemitLink" goes to "/?app=1", which opens the app and
// remembers that choice for the browser session only (no maxAge), so a fresh
// visit shows the landing again. "/?landing=1" forgets the choice.
// The cookie was renamed from "rl_app" (which had a 30-day maxAge) so browsers
// still holding the old long-lived cookie get the landing again.
// App routes only get the session cookie set; nothing else changes there.
const COOKIE = "rl_session_app";

function landing(req: NextRequest) {
  const res = NextResponse.rewrite(new URL("/landing/index.html", req.url));
  res.cookies.delete(COOKIE);
  res.cookies.delete("rl_app");
  return res;
}

export function proxy(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // Any app screen marks the session as "in the app", so in-app links and
  // sign-out back to "/" stay in the app instead of bouncing to the landing.
  if (pathname !== "/") {
    const res = NextResponse.next();
    if (!req.cookies.get(COOKIE)) res.cookies.set(COOKIE, "1", { path: "/" });
    return res;
  }

  if (searchParams.has("landing")) return landing(req);
  if (searchParams.has("app")) {
    const res = NextResponse.next();
    res.cookies.set(COOKIE, "1", { path: "/" });
    return res;
  }
  if (req.cookies.get(COOKIE)) return NextResponse.next();

  return landing(req);
}

export const config = {
  matcher: [
    "/",
    "/home",
    "/send",
    "/activity",
    "/cashout",
    "/claim/:path*",
    "/share/:path*",
    "/transfer/:path*",
  ],
};
