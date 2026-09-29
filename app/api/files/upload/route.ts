import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { resolveSafePath } from "@/app/lib/file-storage";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const file = form.get("file");
  const targetDir = form.get("path");
  // relative path of the file within the item being imported (e.g. a
  // sub-path from a folder import); falls back to the plain filename
  const relativePath = form.get("relativePath");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (typeof targetDir !== "string") {
    return NextResponse.json({ error: "Missing target path" }, { status: 400 });
  }

  const subPath = typeof relativePath === "string" && relativePath ? relativePath : file.name;
  // normalize to forward slashes and strip any leading traversal segments;
  // resolveSafePath does the final authoritative check below
  const safeSubPath = subPath
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");

  if (!safeSubPath) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  let destination: string;
  try {
    destination = resolveSafePath(path.posix.join(targetDir, safeSubPath));
  } catch {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const exists = await fs
    .stat(destination)
    .then(() => true)
    .catch(() => false);
  if (exists) {
    return NextResponse.json({ error: "A file with that name already exists" }, { status: 409 });
  }

  await fs.mkdir(path.dirname(destination), { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(destination, buffer);

  return NextResponse.json({ name: safeSubPath }, { status: 201 });
}
