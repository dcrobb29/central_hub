import { NextResponse } from "next/server";
import { isFileSystemError } from "./file-storage";
import { ProjectAccessError } from "./project-access-error";

export function fileAccessErrorResponse(error: unknown, message: string) {
  if (error instanceof ProjectAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (isFileSystemError(error, "ENOENT") || isFileSystemError(error, "ENOTDIR")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (isFileSystemError(error, "EEXIST")) {
    return NextResponse.json({ error: "An item with that name already exists" }, { status: 409 });
  }
  console.error(message, error);
  return NextResponse.json({ error: message }, { status: 500 });
}
