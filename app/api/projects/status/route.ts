import { NextRequest, NextResponse } from "next/server";
import { updateProjectStatus } from "@/app/lib/projects";
import { COMPLETED_PROJECT_MESSAGE, isCompletedProjectError, isProjectStatus } from "@/app/lib/project-status";

export async function PATCH(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null || !("projectId" in body) || !("status" in body) ||
    typeof body.projectId !== "number" || !Number.isSafeInteger(body.projectId) || body.projectId < 1 ||
    body.projectId > 2_147_483_647 || !isProjectStatus(body.status)) {
    return NextResponse.json({ error: "Choose a valid project and status (Upcoming, Active, or Complete)" }, { status: 400 });
  }
  try {
    if (!await updateProjectStatus(body.projectId, body.status)) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json({ projectId: body.projectId, status: body.status });
  } catch (error) {
    if (isCompletedProjectError(error)) return NextResponse.json({ error: COMPLETED_PROJECT_MESSAGE }, { status: 409 });
    console.error("Project status update failed", error);
    return NextResponse.json({ error: "Unable to update project status" }, { status: 500 });
  }
}
