import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifyActiveSessionToken } from "@/app/lib/auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Login/logout must remain reachable without a session.
  if (
    pathname === "/api/account/login" ||
    pathname === "/api/account/logout" ||
    pathname === "/api/account/register" ||
    pathname === "/api/account/verify" ||
    pathname === "/register" ||
    pathname === "/verify-email" ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  let hasSession = false;
  try {
    hasSession = await verifyActiveSessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value) !== null;
  } catch (error) {
    console.error("Unable to verify session", error);
    return NextResponse.json({ error: "Authentication is unavailable." }, { status: 503 });
  }

  if (pathname.startsWith("/api/")) {
    return hasSession ? NextResponse.next()
      : NextResponse.json({ error: "Please sign in." }, { status: 401 });
  }

  // If visiting /login while already having a session, redirect to home
  if (pathname === "/login") {
    if (hasSession) {
      const requested = request.nextUrl.searchParams.get("redirect") || "/";
      const redirectUrl = requested.startsWith("/") && !requested.startsWith("//")
        && !requested.includes("\\") ? requested : "/";
      return NextResponse.redirect(new URL(redirectUrl, request.url));
    }
    return NextResponse.next();
  }

  if ((pathname === "/register" || pathname === "/verify-email") && hasSession) {
    return NextResponse.redirect(new URL("/", request.url));
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
  runtime: "nodejs",
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files with extensions (e.g. .png, .jpg, .svg)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
