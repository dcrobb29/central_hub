import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import type { ReadableStream as NodeWebReadableStream } from "stream/web";
import { resolveSafePath } from "@/app/lib/file-storage";
import { getMimeType } from "@/app/lib/mime";

export async function GET(request: NextRequest) {
  const relativePath = request.nextUrl.searchParams.get("path");
  if (!relativePath) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  let filePath: string;
  try {
    filePath = resolveSafePath(relativePath);
  } catch {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const stats = await stat(filePath).catch(() => null);
  if (!stats || !stats.isFile()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = Readable.toWeb(createReadStream(filePath)) as NodeWebReadableStream<Uint8Array>;

  return new NextResponse(body as unknown as ReadableStream, {
    headers: {
      "Content-Type": getMimeType(filePath),
      "Content-Length": String(stats.size),
    },
  });
}
