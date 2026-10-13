import { NextRequest, NextResponse } from "next/server";
import {
  authenticateUser,
  listLocalUsersForLogin,
  signSessionToken,
  SESSION_COOKIE_NAME,
  PRACTICE_PASSWORD,
} from "@/app/lib/auth";
import { getCurrentSession } from "@/app/lib/account";

export async function GET() {
  try {
    const localUsers = await listLocalUsersForLogin();
    return NextResponse.json({
      practicePassword: PRACTICE_PASSWORD,
      localUsers,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to list users" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
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

    const token = signSessionToken(authResult.user);
    const session = await getCurrentSession(authResult.user.email);

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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sign-in failed" },
      { status: 500 },
    );
  }
}
