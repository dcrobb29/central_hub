import { NextRequest, NextResponse } from "next/server";
import { createProject } from "@/app/lib/projects";
import { ProjectAccessError, requireProjectSession } from "@/app/lib/project-access";

export async function POST(request: NextRequest) {
  let organizationId: number;
  try {
    organizationId = (await requireProjectSession(request, "projects.write")).organization.organizationId;
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  const body = await request.json().catch(() => null);
  const projectName = typeof body?.projectName === "string" ? body.projectName.trim() : "";

  if (!projectName) {
    return NextResponse.json({ error: "Enter a project name" }, { status: 400 });
  }
  if (projectName.length > 150) {
    return NextResponse.json({ error: "Project name must be 150 characters or fewer" }, { status: 400 });
  }

  try {
    const projectId = await createProject(projectName, organizationId);
    return NextResponse.json({ projectId, projectName }, { status: 201 });
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Unable to create project. Check database insert permissions." }, { status: 500 });
  }
}
