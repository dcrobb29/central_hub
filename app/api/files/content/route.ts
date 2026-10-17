import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import path from "path";
import type { ReadableStream as NodeWebReadableStream } from "stream/web";
import { resolveSafePath } from "@/app/lib/file-storage";
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

    const filePath = await resolveSafePath(relativePath, session.organization.organizationId);

    const stats = await stat(filePath);
    if (!stats.isFile()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = Readable.toWeb(createReadStream(filePath)) as NodeWebReadableStream<Uint8Array>;
    const disposition = isDownload ? "attachment" : "inline";
    const encodedName = encodeURIComponent(path.basename(filePath));

    return new NextResponse(body as unknown as ReadableStream, {
      headers: {
        "Content-Type": getMimeType(filePath),
        "Content-Length": String(stats.size),
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
