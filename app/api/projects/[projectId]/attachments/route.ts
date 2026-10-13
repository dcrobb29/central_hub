import { NextRequest, NextResponse } from "next/server";
import { getProjectAttachments, saveProjectAttachment } from "@/app/lib/project-attachments";
import { ProjectAccessError, requireProject, requireProjectSession } from "@/app/lib/project-access";
import { PROJECT_FILE_LIMIT } from "@/app/lib/project-attachment-policy";

type Context = { params: Promise<{ projectId: string }> };

function failure(error: unknown) {
  if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("Project attachment request failed", error);
  return NextResponse.json({ error: "Unable to access project attachments. Check storage and the project-workspace database migration." }, { status: 500 });
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireProjectSession(request);
    const projectId = Number((await context.params).projectId);
    await requireProject(projectId, session.organization.organizationId);
    const category = request.nextUrl.searchParams.get("category");
    if (category !== "document" && category !== "media") throw new ProjectAccessError("Choose Documents or Media.", 400);
    return NextResponse.json({ attachments: await getProjectAttachments(projectId, session.organization.organizationId, category) });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const session = await requireProjectSession(request, "projects.write");
    const projectId = Number((await context.params).projectId);
    await requireProject(projectId, session.organization.organizationId);
    if (Number(request.headers.get("content-length")) > PROJECT_FILE_LIMIT + 1024 * 1024) {
      throw new ProjectAccessError("Choose a file up to 100 MB.", 413);
    }
    const form = await request.formData();
    const category = form.get("category");
    const file = form.get("file");
    if ((category !== "document" && category !== "media") || !(file instanceof File)) {
      throw new ProjectAccessError("Choose a file and its section.", 400);
    }
    const attachmentId = await saveProjectAttachment(projectId, session.organization.organizationId, session.user.userId, category, file);
    return NextResponse.json({ attachmentId }, { status: 201 });
  } catch (error) { return failure(error); }
}
