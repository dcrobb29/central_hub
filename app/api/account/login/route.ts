import { NextRequest, NextResponse } from "next/server";
import {
  authenticateUser,
  signSessionToken,
  SESSION_COOKIE_NAME,
} from "@/app/lib/auth";
import { getCurrentSession } from "@/app/lib/account";
import { consumeRateLimit, requestAddress } from "@/app/lib/account-registration";

export async function POST(request: NextRequest) {
  try {
    const allowed = await consumeRateLimit("login-ip", requestAddress(request), 10, 900);
    if (!allowed) return NextResponse.json({ error: "Too many sign-in attempts. Please try again later." }, { status: 429 });
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    const authResult = await authenticateUser(email, password);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const session = await getCurrentSession(authResult.user.email);
    const token = signSessionToken(authResult.user);

    const response = NextResponse.json({
      success: true,
      user: authResult.user,
      session,
    });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (error) {
    console.error("Unable to sign in", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json(
      { error: "Sign-in is unavailable. Please try again later." },
      { status: 503 },
    );
  }
}
