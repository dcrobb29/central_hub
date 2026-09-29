import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { resolveSafePath } from "@/app/lib/file-storage";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const targetPath = body?.path;
  const name = body?.name;

  if (typeof targetPath !== "string" || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Missing folder name" }, { status: 400 });
  }
  // folder names must be a single path segment, not a nested/traversal path
  if (name.includes("/") || name.includes("\\") || name === "." || name === "..") {
    return NextResponse.json({ error: "Invalid folder name" }, { status: 400 });
  }

  let destination: string;
  try {
    destination = resolveSafePath(path.posix.join(targetPath, name));
  } catch {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const exists = await fs
    .stat(destination)
    .then(() => true)
    .catch(() => false);
  if (exists) {
    return NextResponse.json({ error: "A folder with that name already exists" }, { status: 409 });
  }

  await fs.mkdir(destination, { recursive: false });
  return NextResponse.json({ name }, { status: 201 });
}
