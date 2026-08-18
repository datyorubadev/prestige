import { NextRequest, NextResponse } from "next/server";

/**
 * Route guards (guide §6.1). Bounces unauthenticated visitors away from the
 * authenticated surfaces. The session lives in localStorage on the client
 * (src/lib/auth-store mirrors it to the `prestige_token` cookie at sign-in),
 * so the proxy can check presence server-side without blocking SSR of the
 * landing/login pages. Role-level routing (super admin ↔ tenant surfaces) is
 * enforced client-side in the (auth) layout, which also handles impersonation.
 */
const TOKEN_COOKIE = "prestige_token";

export function proxy(req: NextRequest) {
  const token = req.cookies.get(TOKEN_COOKIE)?.value;
  if (token) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*"],
};
