import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { resolveSafePath } from "@/app/lib/file-storage";
import { requireProjectSession } from "@/app/lib/project-access";
import { fileAccessErrorResponse } from "@/app/lib/file-access";

export async function POST(request: NextRequest) {
  try {
    const session = await requireProjectSession(request, "projects.write");
    const body = await request.json().catch(() => null);
    const targetPath = body?.path;
    const name = body?.name;

    if (typeof targetPath !== "string" || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Missing folder name" }, { status: 400 });
    }
    if (name.includes("/") || name.includes("\\") || name === "." || name === "..") {
      return NextResponse.json({ error: "Invalid folder name" }, { status: 400 });
    }

    await resolveSafePath(targetPath, session.organization.organizationId);
    const destination = await resolveSafePath(
      `${targetPath ? targetPath + "/" : ""}${name}`, session.organization.organizationId,
    );
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.mkdir(destination, { recursive: false });
    return NextResponse.json({ name }, { status: 201 });
  } catch (error) {
    return fileAccessErrorResponse(error, "Unable to create folder");
  }
}
