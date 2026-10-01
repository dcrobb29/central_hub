import { NextRequest, NextResponse } from "next/server";
import { createProject } from "@/app/lib/projects";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const projectName = typeof body?.projectName === "string" ? body.projectName.trim() : "";

  if (!projectName) {
    return NextResponse.json({ error: "Enter a project name" }, { status: 400 });
  }
  if (projectName.length > 150) {
    return NextResponse.json({ error: "Project name must be 150 characters or fewer" }, { status: 400 });
  }

  try {
    const projectId = await createProject(projectName);
    return NextResponse.json({ projectId, projectName }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unable to create project. Check database insert permissions." }, { status: 500 });
  }
}
