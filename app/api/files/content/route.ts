import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { readFileContent } from "@/app/lib/file-storage";
import { getMimeType } from "@/app/lib/mime";
import { requireProjectSession } from "@/app/lib/project-access";
import { fileAccessErrorResponse } from "@/app/lib/file-access";

export async function GET(request: NextRequest) {
  try {
    const session = await requireProjectSession(request, "projects.read");
    const relativePath = request.nextUrl.searchParams.get("path");
    if (!relativePath) {
      return NextResponse.json({ error: "Missing path" }, { status: 400 });
    }
    const isDownload = request.nextUrl.searchParams.get("download") === "true";

    const { body, size } = await readFileContent(relativePath, session.organization.organizationId);
    const disposition = isDownload ? "attachment" : "inline";
    const encodedName = encodeURIComponent(path.basename(relativePath.replace(/\\/g, "/"))).replace(/'/g, "%27");

    return new NextResponse(body, {
      headers: {
        "Content-Type": getMimeType(relativePath),
        "Content-Length": String(size),
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodedName}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none';",
      },
    });
  } catch (error) {
    return fileAccessErrorResponse(error, "Unable to read file");
  }
}
