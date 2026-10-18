import path from "path";
import fs from "fs/promises";
import { ProjectAccessError } from "./project-access-error";
import { blobContainer, blobExists, blobSize, uploadBlob } from "./blob-storage";
import { blobContent, localContent } from "./stored-content";
import { getMimeType } from "./mime";

export const FILES_ROOT = path.join(process.cwd(), "storage", "files");

export function organizationFilesRoot(organizationId: number): string {
  if (!Number.isSafeInteger(organizationId) || organizationId < 1 || organizationId > 2_147_483_647) {
    throw new ProjectAccessError("Invalid organization.", 400);
  }
  return path.join(FILES_ROOT, "organizations", String(organizationId));
}

function fileSegments(relativePath: string): string[] {
  const cleaned = relativePath.replace(/\\/g, "/");
  const segments = cleaned.split("/").filter(Boolean);
  if (cleaned.startsWith("/") || segments.some((segment) =>
    segment === "." || segment === ".." || /[<>:"|?*\x00-\x1f]/.test(segment)
    || /[. ]$/.test(segment) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(segment))) {
    throw new ProjectAccessError("Invalid file path.", 400);
  }
  return segments;
}

function blobFileKey(relativePath: string, organizationId: number) {
  organizationFilesRoot(organizationId);
  return ["files", "organizations", String(organizationId), ...fileSegments(relativePath)].join("/");
}

export async function resolveSafePath(relativePath: string, organizationId: number): Promise<string> {
  const root = organizationFilesRoot(organizationId);
  const segments = fileSegments(relativePath);
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
  const container = blobContainer();
  if (container) {
    const key = blobFileKey(relativePath, organizationId);
    const prefix = `${key}/`;
    const entries: FileEntry[] = [];
    if (fileSegments(relativePath).length && !await blobExists(container, prefix)) {
      throw new ProjectAccessError("Not found", 404);
    }
    for await (const item of container.listBlobsByHierarchy("/", { prefix })) {
      const name = item.name.slice(prefix.length).replace(/\/$/, "");
      if (!name || name === ".gitkeep") continue;
      const entryPath = [...fileSegments(relativePath), name].join("/");
      entries.push(item.kind === "prefix"
        ? { name, path: entryPath, type: "directory" }
        : { name, path: entryPath, type: "file", size: item.properties.contentLength, modifiedAt: item.properties.lastModified?.toISOString() });
    }
    return sortEntries(entries);
  }
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

  return sortEntries(entries);
}

function sortEntries(entries: FileEntry[]) {
  return entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

async function ensureBlobParents(key: string) {
  const container = blobContainer();
  if (!container) throw new Error("Blob storage is not configured.");
  const segments = key.split("/");
  for (let index = 3; index < segments.length; index++) {
    const parent = segments.slice(0, index).join("/");
    if (await blobExists(container, parent)) throw new ProjectAccessError("A parent path is a file.", 409);
    try {
      await uploadBlob(container, `${parent}/`, Buffer.alloc(0), "application/octet-stream");
    } catch (error) {
      if (!(error instanceof ProjectAccessError && error.status === 409)) throw error;
    }
  }
}

export async function writeFile(relativePath: string, organizationId: number, buffer: Buffer) {
  const container = blobContainer();
  if (container) {
    const key = blobFileKey(relativePath, organizationId);
    if (!fileSegments(relativePath).length) throw new ProjectAccessError("Missing path", 400);
    if (await blobExists(container, `${key}/`)) throw new ProjectAccessError("An item with that name already exists", 409);
    await ensureBlobParents(key);
    await uploadBlob(container, key, buffer, getMimeType(relativePath));
    return;
  }
  const destination = await resolveSafePath(relativePath, organizationId);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, buffer, { flag: "wx" });
}

export async function createDirectory(relativePath: string, organizationId: number) {
  const container = blobContainer();
  if (container) {
    const key = blobFileKey(relativePath, organizationId);
    if (!fileSegments(relativePath).length) throw new ProjectAccessError("Missing folder name", 400);
    if (await blobExists(container, key)) throw new ProjectAccessError("An item with that name already exists", 409);
    await ensureBlobParents(key);
    await uploadBlob(container, `${key}/`, Buffer.alloc(0), "application/octet-stream");
    return;
  }
  const destination = await resolveSafePath(relativePath, organizationId);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.mkdir(destination, { recursive: false });
}

export async function readFileContent(relativePath: string, organizationId: number) {
  const container = blobContainer();
  if (container) {
    const key = blobFileKey(relativePath, organizationId);
    const size = await blobSize(container, key);
    return { size, body: await blobContent(container, key) };
  }
  const filePath = await resolveSafePath(relativePath, organizationId);
  const info = await fs.stat(filePath);
  if (!info.isFile()) throw new ProjectAccessError("Not found", 404);
  return { size: info.size, body: localContent(filePath) };
}

export async function readFileBuffer(relativePath: string, organizationId: number): Promise<Buffer> {
  const { body } = await readFileContent(relativePath, organizationId);
  return Buffer.from(await new Response(body).arrayBuffer());
}
