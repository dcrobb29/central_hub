import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, updateProfile } from "@/app/lib/account";
import { requireProjectSession, ProjectAccessError } from "@/app/lib/project-access";

export async function GET(request: NextRequest) {
  try {
    const session = await requireProjectSession(request, null);
    return NextResponse.json(session);
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Unable to load session", error);
    return NextResponse.json(
      { error: "Unable to load session" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const currentSession = await requireProjectSession(request, null);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const userId = Number(body.userId);
    if (!Number.isInteger(userId) || userId < 1) {
      return NextResponse.json({ error: "Valid user ID is required" }, { status: 400 });
    }
    if (userId !== currentSession.user.userId) {
      return NextResponse.json({ error: "You can only update your own profile." }, { status: 403 });
    }

    await updateProfile(userId, {
      displayName: typeof body.displayName === "string" ? body.displayName : undefined,
      phone: body.phone === null || typeof body.phone === "string" ? body.phone : undefined,
    });

    const session = await getCurrentSession(currentSession.user.email);
    return NextResponse.json(session);
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update profile" },
      { status: 400 },
    );
  }
}
