import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "central_hub_session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Never redirect API routes, internal next assets, or files
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  const hasSession = request.cookies.has(SESSION_COOKIE_NAME);

  // If visiting /login while already having a session, redirect to home
  if (pathname === "/login") {
    if (hasSession) {
      const redirectUrl = request.nextUrl.searchParams.get("redirect") || "/";
      return NextResponse.redirect(new URL(redirectUrl, request.url));
    }
    return NextResponse.next();
  }

  // If visiting protected page without session, redirect to /login
  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files with extensions (e.g. .png, .jpg, .svg)
     * - /api/* routes (APIs handle auth internally)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)|api).*)",
  ],
};
