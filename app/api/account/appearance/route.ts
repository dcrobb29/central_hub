import { NextResponse, type NextRequest } from "next/server";
import { requireProjectSession, ProjectAccessError } from "@/app/lib/project-access";
import { getAppearance, saveAppearance } from "@/app/lib/appearance-store";
import { parseAppearance } from "@/app/lib/appearance";

export async function GET(request: NextRequest) {
  try {
    const session = await requireProjectSession(request, null);
    return NextResponse.json(await getAppearance(session.user.userId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Unable to load appearance", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Unable to load appearance preferences." }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const expected = new URL(process.env.PUBLIC_APP_URL || request.url).origin;
    if (request.headers.get("origin") !== expected
      || (request.headers.get("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin")) {
      return NextResponse.json({ error: "Appearance changes must come from this application." }, { status: 403 });
    }
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      return NextResponse.json({ error: "Appearance changes must use JSON." }, { status: 415 });
    }
    const session = await requireProjectSession(request, null);
    const preferences = parseAppearance(await request.json().catch(() => null));
    if (!preferences) return NextResponse.json({ error: "Choose valid themes and six-digit hexadecimal colors." }, { status: 400 });
    await saveAppearance(session.user.userId, preferences);
    return NextResponse.json(preferences, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Unable to save appearance", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Unable to save appearance preferences. Please try again." }, { status: 503 });
  }
}
