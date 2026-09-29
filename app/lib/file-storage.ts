import path from "path";
import fs from "fs/promises";

export const FILES_ROOT = path.join(process.cwd(), "storage", "files");

// Resolves a user-supplied relative path against FILES_ROOT and rejects
// anything that would escape the storage root (path traversal).
export function resolveSafePath(relativePath: string): string {
  const cleaned = (relativePath ?? "").replace(/\\/g, "/");
  const resolved = path.resolve(FILES_ROOT, "." + path.posix.sep + cleaned);
  const rootWithSep = FILES_ROOT.endsWith(path.sep) ? FILES_ROOT : FILES_ROOT + path.sep;
  if (resolved !== FILES_ROOT && !resolved.startsWith(rootWithSep)) {
    throw new Error("Path escapes storage root");
  }
  return resolved;
}

export function toRelativePath(absolutePath: string): string {
  return path.relative(FILES_ROOT, absolutePath).split(path.sep).join("/");
}

export type FileEntry = {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  modifiedAt?: string;
};

export async function listDirectory(relativePath: string): Promise<FileEntry[]> {
  const dirPath = resolveSafePath(relativePath);
  const dirents = await fs.readdir(dirPath, { withFileTypes: true });

  const entries = await Promise.all(
    dirents
      .filter((d) => d.name !== ".gitkeep")
      .map(async (dirent): Promise<FileEntry> => {
        const entryAbsolute = path.join(dirPath, dirent.name);
        const entryRelative = toRelativePath(entryAbsolute);
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
