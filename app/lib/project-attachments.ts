import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { getPool, sql } from "./db";
import { requireProject, ProjectAccessError } from "./project-access";
import { PROJECT_FILE_LIMIT, projectFileType, safeProjectFileName, type AttachmentCategory } from "./project-attachment-policy";

// Keep project-owned content outside the legacy path-based file explorer.
const root = path.join(process.cwd(), "storage", "project-attachments");

export type ProjectAttachment = {
  attachmentId: number;
  category: AttachmentCategory;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: string;
};

export function attachmentPath(storageKey: string): string {
  if (!/^[a-f0-9-]{36}\.[a-z0-9]+$/.test(storageKey)) throw new Error("Invalid attachment storage key.");
  return path.join(root, storageKey);
}

export async function getProjectAttachments(projectId: number, organizationId: number, category: AttachmentCategory) {
  const pool = await getPool();
  return (await pool.request().input("project", sql.Int, projectId).input("org", sql.Int, organizationId)
    .input("category", sql.VarChar(12), category).query<ProjectAttachment>(`
      SELECT a.AttachmentID AS attachmentId, a.Category AS category, a.FileName AS fileName,
        a.ContentType AS contentType, a.SizeBytes AS sizeBytes,
        CONVERT(varchar(33), a.UploadedAt, 126) + 'Z' AS uploadedAt, u.DisplayName AS uploadedBy
      FROM dbo.ProjectAttachments a JOIN dbo.Users u ON u.UserID = a.UploadedByUserID
      WHERE a.ProjectID = @project AND a.OrganizationID = @org AND a.Category = @category AND a.IsArchived = 0
      ORDER BY a.AttachmentID DESC
    `)).recordset;
}

export async function saveProjectAttachment(projectId: number, organizationId: number, userId: number, category: AttachmentCategory, file: File) {
  await requireProject(projectId, organizationId);
  let fileName: string;
  try { fileName = safeProjectFileName(file.name); }
  catch (error) { throw new ProjectAccessError(error instanceof Error ? error.message : "Invalid filename.", 400); }
  const contentType = projectFileType(fileName, category);
  if (!contentType) throw new ProjectAccessError("Unsupported file type for this section.", 400);
  if (file.size < 1 || file.size > PROJECT_FILE_LIMIT) throw new ProjectAccessError("Choose a nonempty file up to 100 MB.", 400);
  const storageKey = `${crypto.randomUUID()}.${fileName.split(".").pop()!.toLowerCase()}`;
  await fs.mkdir(root, { recursive: true });
  const destination = attachmentPath(storageKey);
  await fs.writeFile(destination, Buffer.from(await file.arrayBuffer()), { flag: "wx" });
  try {
    const pool = await getPool();
    return (await pool.request().input("project", sql.Int, projectId).input("org", sql.Int, organizationId)
      .input("user", sql.Int, userId).input("category", sql.VarChar(12), category)
      .input("name", sql.NVarChar(255), fileName).input("key", sql.VarChar(80), storageKey)
      .input("type", sql.VarChar(150), contentType).input("size", sql.BigInt, file.size)
      .query<{ attachmentId: number }>(`
        INSERT INTO dbo.ProjectAttachments(OrganizationID, ProjectID, Category, FileName, StorageKey, ContentType, SizeBytes, UploadedByUserID)
        VALUES (@org, @project, @category, @name, @key, @type, @size, @user);
        SELECT CONVERT(int, SCOPE_IDENTITY()) AS attachmentId;
      `)).recordset[0].attachmentId;
  } catch (error) {
    try { await fs.unlink(destination); }
    catch (cleanupError) { console.error("Unable to clean up failed project upload", cleanupError); }
    throw error;
  }
}

export async function getProjectAttachment(projectId: number, organizationId: number, attachmentId: number) {
  const pool = await getPool();
  const row = (await pool.request().input("project", sql.Int, projectId).input("org", sql.Int, organizationId)
    .input("id", sql.Int, attachmentId).query<{ fileName: string; storageKey: string; contentType: string; sizeBytes: number }>(`
      SELECT FileName AS fileName, StorageKey AS storageKey, ContentType AS contentType, SizeBytes AS sizeBytes
      FROM dbo.ProjectAttachments WHERE ProjectID = @project AND OrganizationID = @org AND AttachmentID = @id AND IsArchived = 0
    `)).recordset[0];
  if (!row) throw new ProjectAccessError("Attachment not found.", 404);
  return row;
}

export async function archiveProjectAttachment(projectId: number, organizationId: number, attachmentId: number) {
  const pool = await getPool();
  const result = await pool.request().input("project", sql.Int, projectId).input("org", sql.Int, organizationId)
    .input("id", sql.Int, attachmentId).query(`
      UPDATE dbo.ProjectAttachments SET IsArchived = 1
      WHERE ProjectID = @project AND OrganizationID = @org AND AttachmentID = @id AND IsArchived = 0
    `);
  if (!result.rowsAffected[0]) throw new ProjectAccessError("Attachment not found.", 404);
}
