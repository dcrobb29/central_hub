import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, updateProfile } from "@/app/lib/account";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/app/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const emailParam = request.nextUrl.searchParams.get("email");
    if (emailParam) {
      const session = await getCurrentSession(emailParam);
      return NextResponse.json(session);
    }

    const cookieToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const verified = verifySessionToken(cookieToken);

    if (!verified) {
      return NextResponse.json(
        { authenticated: false, session: null, error: "Not authenticated" },
        { status: 401 },
      );
    }

    const session = await getCurrentSession(verified.email);
    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load session" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const userId = Number(body.userId);
    if (!Number.isInteger(userId) || userId < 1) {
      return NextResponse.json({ error: "Valid user ID is required" }, { status: 400 });
    }

    await updateProfile(userId, {
      displayName: typeof body.displayName === "string" ? body.displayName : undefined,
      phone: body.phone === null || typeof body.phone === "string" ? body.phone : undefined,
    });

    const cookieToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const verified = verifySessionToken(cookieToken);
    const session = await getCurrentSession(verified?.email);
    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update profile" },
      { status: 400 },
    );
  }
}
