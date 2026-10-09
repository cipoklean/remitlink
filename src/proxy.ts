import { NextResponse, type NextRequest } from "next/server";

// Desktop visitors to "/" see the marketing landing page (public/landing).
// Phones get the app as before. "/?app=1" opens the app on any device and
// remembers that choice for 30 days.
const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i;

export function proxy(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  if (searchParams.has("app")) {
    const res = NextResponse.next();
    res.cookies.set("rl_app", "1", { path: "/", maxAge: 60 * 60 * 24 * 30 });
    return res;
  }
  if (req.cookies.get("rl_app")) return NextResponse.next();

  const ua = req.headers.get("user-agent") ?? "";
  if (MOBILE_UA.test(ua)) return NextResponse.next();

  return NextResponse.rewrite(new URL("/landing/index.html", req.url));
}

export const config = { matcher: ["/"] };
