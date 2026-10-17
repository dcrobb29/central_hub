import { NextRequest, NextResponse } from "next/server";
import { listDirectory } from "@/app/lib/file-storage";
import { requireProjectSession } from "@/app/lib/project-access";
import { fileAccessErrorResponse } from "@/app/lib/file-access";

export async function GET(request: NextRequest) {
  const relativePath = request.nextUrl.searchParams.get("path") ?? "";

  try {
    const session = await requireProjectSession(request, "projects.read");
    const entries = await listDirectory(relativePath, session.organization.organizationId);
    return NextResponse.json({ entries }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return fileAccessErrorResponse(error, "Unable to list directory");
  }
}
