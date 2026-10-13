"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import type { ProjectAttachment } from "@/app/lib/project-attachments";
import { PROJECT_FILE_LIMIT, projectFileType, type AttachmentCategory } from "@/app/lib/project-attachment-policy";

export default function ProjectAttachmentsPanel({ projectId, category, canEdit }: {
  projectId: number; category: AttachmentCategory; canEdit: boolean;
}) {
  const [attachments, setAttachments] = useState<ProjectAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const endpoint = `/api/projects/${projectId}/attachments`;
  const media = category === "media";

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`${endpoint}?category=${category}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Unable to load attachments.");
        if (!controller.signal.aborted) setAttachments(data.attachments);
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Unable to load attachments.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [endpoint, category]);

  async function reload() {
    const response = await fetch(`${endpoint}?category=${category}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Unable to refresh attachments.");
    setAttachments(data.attachments);
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const files = Array.from(fileInput.current?.files ?? []);
    if (!files.length) { setError("Choose at least one file."); return; }
    const invalid = files.find((file) => !projectFileType(file.name, category) || file.size < 1 || file.size > PROJECT_FILE_LIMIT);
    if (invalid) { setError(`${invalid.name}: choose a supported, nonempty file up to 100 MB.`); return; }
    setBusy(true);
    setError(null);
    setMessage(null);
    let uploaded = 0;
    const failures: string[] = [];
    for (const file of files) {
      try {
        const form = new FormData();
        form.append("category", category);
        form.append("file", file);
        const response = await fetch(endpoint, { method: "POST", body: form });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Upload failed.");
        ++uploaded;
      } catch (error) { failures.push(`${file.name}: ${error instanceof Error ? error.message : "Upload failed."}`); }
    }
    try { await reload(); }
    catch (error) { failures.push(error instanceof Error ? error.message : "Unable to refresh attachments."); }
    setError(failures.length ? failures.join(" ") : null);
    setMessage(uploaded ? `${uploaded} file(s) uploaded to this project.` : null);
    if (fileInput.current) fileInput.current.value = "";
    setBusy(false);
  }

  async function archive(attachment: ProjectAttachment) {
    if (!window.confirm(`Remove "${attachment.fileName}" from this project? The stored file is retained locally, but will no longer be accessible here.`)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`${endpoint}/${attachment.attachmentId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to remove attachment.");
      await reload();
      setMessage("Attachment removed from the project. Stored content is retained.");
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to remove attachment."); }
    finally { setBusy(false); }
  }

  return <section className="projectHubSection" aria-busy={busy || loading}>
    <h2>{media ? "Jobsite media" : "Project documents"}</h2>
    <p>{media ? "Keep jobsite photos and videos with the project." : "Keep signed contracts, drawings, specifications, and handover documents with the project."} Files are stored locally for now.</p>
    {canEdit && <form className="projectUploadForm" onSubmit={(event) => void upload(event)}>
      <label>{media ? "Photos or videos" : "Documents"} (100 MB maximum per file)
        <input ref={fileInput} type="file" multiple disabled={busy || loading}
          accept={media ? ".jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.mov" : ".pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx"} />
      </label>
      <button type="submit" disabled={busy || loading}>{busy ? "Saving..." : "Upload to project"}</button>
    </form>}
    {error && <p className="financeImportError" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {loading ? <p role="status">Loading attachments...</p> : !error && attachments.length === 0 ? <p>No {media ? "media" : "documents"} attached yet.</p> : null}
    <div className={media ? "projectMediaGrid" : "projectDocumentList"}>
      {attachments.map((attachment) => {
        const url = `${endpoint}/${attachment.attachmentId}`;
        return <article className="projectAttachmentCard" key={attachment.attachmentId}>
          {media && (attachment.contentType.startsWith("image/")
            ? <a href={url} target="_blank" rel="noreferrer"><Image src={url} alt={attachment.fileName} width={640} height={440} unoptimized /></a>
            : <video controls preload="none" src={url} aria-label={attachment.fileName} />)}
          <strong>{attachment.fileName}</strong>
          <small>{(attachment.sizeBytes / 1024 / 1024).toFixed(2)} MB · {attachment.uploadedBy} · {new Date(attachment.uploadedAt).toLocaleString()}</small>
          <div className="projectAttachmentActions">
            {(media || attachment.contentType === "application/pdf") && <a href={url} target="_blank" rel="noreferrer">View</a>}
            <a href={`${url}?download=true`}>Download</a>
            {canEdit && <button type="button" className="estimateDangerAction" disabled={busy} onClick={() => void archive(attachment)}>Remove</button>}
          </div>
        </article>;
      })}
    </div>
  </section>;
}
