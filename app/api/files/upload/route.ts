import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { resolveSafePath } from "@/app/lib/file-storage";
import { requireProjectSession } from "@/app/lib/project-access";
import { fileAccessErrorResponse } from "@/app/lib/file-access";

export async function POST(request: NextRequest) {
  try {
    const session = await requireProjectSession(request, "projects.write");
    const form = await request.formData();
    const file = form.get("file");
    const targetDir = form.get("path");
    const relativePath = form.get("relativePath");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    if (typeof targetDir !== "string") {
      return NextResponse.json({ error: "Missing target path" }, { status: 400 });
    }

    const subPath = typeof relativePath === "string" && relativePath ? relativePath : file.name;
    const safeSubPath = subPath.replace(/\\/g, "/");
    if (!safeSubPath || safeSubPath.startsWith("/") || safeSubPath.split("/").some((segment) => segment === "." || segment === "..")) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }

    await resolveSafePath(targetDir, session.organization.organizationId);
    const destination = await resolveSafePath(
      `${targetDir ? targetDir + "/" : ""}${safeSubPath}`, session.organization.organizationId,
    );

    await fs.mkdir(path.dirname(destination), { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(destination, buffer, { flag: "wx" });

    return NextResponse.json({ name: safeSubPath }, { status: 201 });
  } catch (error) {
    return fileAccessErrorResponse(error, "Unable to upload file");
  }
}
