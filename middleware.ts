import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifyActiveSessionToken } from "@/app/lib/auth";
import { getSafeRedirectTarget } from "@/app/lib/safe-redirect";

function addPageSecurityHeaders(response: NextResponse, pathname: string) {
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$/.test(pathname)
  ) {
    return response;
  }

  response.headers.set(
    "Content-Security-Policy",
    "base-uri 'self'; object-src 'none'; frame-ancestors 'none'",
  );
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}

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
    return addPageSecurityHeaders(NextResponse.next(), pathname);
  }

  let hasSession = false;
  try {
    hasSession = await verifyActiveSessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value) !== null;
  } catch (error) {
    console.error("Unable to verify session", error);
    return addPageSecurityHeaders(
      NextResponse.json({ error: "Authentication is unavailable." }, { status: 503 }),
      pathname,
    );
  }

  if (pathname.startsWith("/api/")) {
    return hasSession
      ? NextResponse.next()
      : NextResponse.json({ error: "Please sign in." }, { status: 401 });
  }

  // If visiting /login while already having a session, redirect to home
  if (pathname === "/login") {
    if (hasSession) {
      const redirectUrl = getSafeRedirectTarget(
        request.nextUrl.searchParams.get("redirect"),
        request.nextUrl.origin,
      );
      return addPageSecurityHeaders(
        NextResponse.redirect(new URL(redirectUrl, request.url)),
        pathname,
      );
    }
    return addPageSecurityHeaders(NextResponse.next(), pathname);
  }

  if ((pathname === "/register" || pathname === "/verify-email") && hasSession) {
    return addPageSecurityHeaders(NextResponse.redirect(new URL("/", request.url)), pathname);
  }

  // If visiting protected page without session, redirect to /login
  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return addPageSecurityHeaders(NextResponse.redirect(loginUrl), pathname);
  }

  return addPageSecurityHeaders(NextResponse.next(), pathname);
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
