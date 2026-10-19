import { NextRequest, NextResponse } from "next/server";
import { completeVerifiedAccount, consumeRateLimit, requestAddress, verificationTokenHash } from "@/app/lib/account-registration";
import { SESSION_COOKIE_NAME, signSessionToken } from "@/app/lib/auth";
import { getCurrentSession } from "@/app/lib/account";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const token = body && typeof body === "object" && typeof body.token === "string" ? body.token : "";
  const password = body && typeof body === "object" && typeof body.password === "string" ? body.password : "";
  const tokenHash = verificationTokenHash(token);
  if (!tokenHash) return NextResponse.json({ error: "This verification link is invalid or expired." }, { status: 400 });
  if (password.length < 12 || password.length > 128) {
    return NextResponse.json({ error: "Choose a password between 12 and 128 characters." }, { status: 400 });
  }

  try {
    const addressAllowed = await consumeRateLimit("verify-ip", requestAddress(request), 20, 900);
    const tokenAllowed = await consumeRateLimit("verify-token", tokenHash.toString("hex"), 5, 900);
    if (!addressAllowed || !tokenAllowed) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    const user = await completeVerifiedAccount(tokenHash, password);
    if (!user) return NextResponse.json({ error: "This verification link is invalid, expired, or already used." }, { status: 400 });

    const session = await getCurrentSession(user.email);
    const response = NextResponse.json({ success: true, session });
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: signSessionToken(user),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
    });
    return response;
  } catch (error) {
    console.error("Unable to verify account", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Account verification is unavailable. Please try again later." }, { status: 503 });
  }
}
