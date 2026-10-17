import path from "path";
import fs from "fs/promises";
import { ProjectAccessError } from "./project-access-error";

export const FILES_ROOT = path.join(process.cwd(), "storage", "files");

export function organizationFilesRoot(organizationId: number): string {
  if (!Number.isSafeInteger(organizationId) || organizationId < 1 || organizationId > 2_147_483_647) {
    throw new ProjectAccessError("Invalid organization.", 400);
  }
  return path.join(FILES_ROOT, "organizations", String(organizationId));
}

export async function resolveSafePath(relativePath: string, organizationId: number): Promise<string> {
  const root = organizationFilesRoot(organizationId);
  const cleaned = relativePath.replace(/\\/g, "/");
  const segments = cleaned.split("/").filter(Boolean);
  if (cleaned.startsWith("/") || segments.some((segment) =>
    segment === "." || segment === ".." || /[<>:"|?*\x00-\x1f]/.test(segment)
    || /[. ]$/.test(segment) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(segment))) {
    throw new ProjectAccessError("Invalid file path.", 400);
  }
  const resolved = path.resolve(root, ...segments);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new ProjectAccessError("Invalid file path.", 400);
  }
  // Existing links must not redirect any part of a tenant path into shared storage.
  const parts = ["organizations", String(organizationId), ...segments];
  for (let index = 0; index <= parts.length; index++) {
    const current = path.join(FILES_ROOT, ...parts.slice(0, index));
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) {
        throw new ProjectAccessError("Linked file paths are not allowed.", 403);
      }
    } catch (error) {
      if (isFileSystemError(error, "ENOENT")) break;
      throw error;
    }
  }
  return resolved;
}

export function isFileSystemError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

export function toRelativePath(absolutePath: string, organizationId: number): string {
  return path.relative(organizationFilesRoot(organizationId), absolutePath).split(path.sep).join("/");
}

export type FileEntry = {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  modifiedAt?: string;
};

export async function listDirectory(relativePath: string, organizationId: number): Promise<FileEntry[]> {
  const dirPath = await resolveSafePath(relativePath, organizationId);
  let dirents;
  try {
    dirents = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if (relativePath === "" && isFileSystemError(error, "ENOENT")) return [];
    throw error;
  }

  const entries = await Promise.all(
    dirents
      .filter((d) => d.name !== ".gitkeep" && !d.isSymbolicLink())
      .map(async (dirent): Promise<FileEntry> => {
        const entryAbsolute = path.join(dirPath, dirent.name);
        const entryRelative = toRelativePath(entryAbsolute, organizationId);
        if (dirent.isDirectory()) {
          return { name: dirent.name, path: entryRelative, type: "directory" };
        }
        const stats = await fs.stat(entryAbsolute);
        return {
          name: dirent.name,
          path: entryRelative,
          type: "file",
          size: stats.size,
          modifiedAt: stats.mtime.toISOString(),
        };
      })
  );

  return entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
