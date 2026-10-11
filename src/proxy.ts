import { NextResponse, type NextRequest } from "next/server";

// Desktop visitors to "/" see the marketing landing page (public/landing).
// Phones get the app as before. "/?app=1" opens the app on any device and
// remembers that choice for the browser session only, so a fresh visit shows
// the landing again. "/?landing=1" forgets the choice and shows the landing on
// any device.
const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i;

export function proxy(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  if (searchParams.has("landing")) {
    const res = NextResponse.rewrite(new URL("/landing/index.html", req.url));
    res.cookies.delete("rl_app");
    return res;
  }
  if (searchParams.has("app")) {
    const res = NextResponse.next();
    res.cookies.set("rl_app", "1", { path: "/" });
    return res;
  }
  if (req.cookies.get("rl_app")) return NextResponse.next();

  const ua = req.headers.get("user-agent") ?? "";
  if (MOBILE_UA.test(ua)) return NextResponse.next();

  return NextResponse.rewrite(new URL("/landing/index.html", req.url));
}

export const config = { matcher: ["/"] };
