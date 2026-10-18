import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "@/app/lib/file-storage";
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

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(`${targetDir ? targetDir + "/" : ""}${safeSubPath}`, session.organization.organizationId, buffer);

    return NextResponse.json({ name: safeSubPath }, { status: 201 });
  } catch (error) {
    return fileAccessErrorResponse(error, "Unable to upload file");
  }
}
