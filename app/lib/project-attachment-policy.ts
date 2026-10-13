export const PROJECT_FILE_LIMIT = 100 * 1024 * 1024;
export type AttachmentCategory = "document" | "media";

const documents: Record<string, string> = {
  pdf: "application/pdf", txt: "text/plain", csv: "text/csv",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
const media: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
};

export function projectFileType(fileName: string, category: AttachmentCategory): string | null {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  const types = category === "document" ? documents : media;
  return Object.hasOwn(types, extension) ? types[extension] : null;
}

export function safeProjectFileName(name: string): string {
  const result = name.replace(/\\/g, "/").split("/").pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim() ?? "";
  if (!result || result.length > 255) throw new Error("Enter a file name of 1 to 255 characters.");
  return result;
}

export function parseByteRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) throw new Error("Invalid byte range.");
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size || (!match[1] && Number(match[2]) === 0)) {
    throw new Error("Invalid byte range.");
  }
  return { start, end };
}
