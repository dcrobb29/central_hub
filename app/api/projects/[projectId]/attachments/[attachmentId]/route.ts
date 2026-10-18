import { NextRequest, NextResponse } from "next/server";
import { projectAttachmentSize, projectAttachmentContent, archiveProjectAttachment, getProjectAttachment } from "@/app/lib/project-attachments";
import { parseByteRange } from "@/app/lib/project-attachment-policy";
import { ProjectAccessError, requireProject, requireProjectSession } from "@/app/lib/project-access";

type Context = { params: Promise<{ projectId: string; attachmentId: string }> };

function failure(error: unknown) {
  if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("Project attachment content request failed", error);
  return NextResponse.json({ error: "Unable to access the stored file." }, { status: 500 });
}

async function authorize(request: NextRequest, context: Context, permission = "projects.read") {
  const session = await requireProjectSession(request, permission);
  const params = await context.params;
  const projectId = Number(params.projectId);
  const attachmentId = Number(params.attachmentId);
  await requireProject(projectId, session.organization.organizationId);
  if (!Number.isSafeInteger(attachmentId) || attachmentId < 1 || attachmentId > 2_147_483_647) {
    throw new ProjectAccessError("Attachment not found.", 404);
  }
  return { projectId, attachmentId, organizationId: session.organization.organizationId };
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const access = await authorize(request, context);
    const attachment = await getProjectAttachment(access.projectId, access.organizationId, access.attachmentId);
    const size = await projectAttachmentSize(attachment.storageKey, access.organizationId);
    let range;
    try { range = parseByteRange(request.headers.get("range"), size); }
    catch {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const body = await projectAttachmentContent(attachment.storageKey, access.organizationId, range ?? undefined);
    const previewable = attachment.contentType.startsWith("image/") || attachment.contentType.startsWith("video/") || attachment.contentType === "application/pdf";
    const disposition = request.nextUrl.searchParams.get("download") === "true" || !previewable ? "attachment" : "inline";
    return new NextResponse(body, {
      status: range ? 206 : 200,
      headers: {
        "Content-Type": attachment.contentType,
        "Content-Length": String(range ? range.end - range.start + 1 : size),
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.fileName).replace(/'/g, "%27")}`,
        "Accept-Ranges": "bytes",
        ...(range ? { "Content-Range": `bytes ${range.start}-${range.end}/${size}` } : {}),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const access = await authorize(request, context, "projects.write");
    await archiveProjectAttachment(access.projectId, access.organizationId, access.attachmentId);
    return NextResponse.json({ success: true });
  } catch (error) { return failure(error); }
}
