import { NextRequest, NextResponse } from "next/server";
import { listDirectory } from "@/app/lib/file-storage";

export async function GET(request: NextRequest) {
  const relativePath = request.nextUrl.searchParams.get("path") ?? "";

  try {
    const entries = await listDirectory(relativePath);
    return NextResponse.json({ entries });
  } catch {
    return NextResponse.json({ error: "Unable to list directory" }, { status: 400 });
  }
}
