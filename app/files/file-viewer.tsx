"use client";

import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import type { FileEntry } from "@/app/lib/file-storage";

const IMAGE_EXT = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".tif", ".tiff"];
const VIDEO_EXT = [".mp4", ".webm", ".mov", ".avi", ".wmv"];
const AUDIO_EXT = [".mp3", ".wav", ".m4a"];
const TEXT_EXT = [".txt", ".csv", ".json", ".md"];
const DOCUMENT_PREVIEW_EXT = [".docx", ".xlsx", ".pptx"];

// Recognized types with no inline renderer at all (legacy binary Office
// formats, archives, email) — shown with a clear label instead of a generic message.
const OFFICE_LABELS: Record<string, string> = {
  ".doc": "Word document (legacy format)",
  ".xls": "Excel spreadsheet (legacy format)",
  ".ppt": "PowerPoint presentation (legacy format)",
  ".odt": "OpenDocument text",
  ".ods": "OpenDocument spreadsheet",
  ".odp": "OpenDocument presentation",
  ".rtf": "Rich text document",
  ".zip": "ZIP archive",
  ".rar": "RAR archive",
  ".7z": "7-Zip archive",
  ".eml": "Email message",
  ".msg": "Outlook message",
};

type PreviewResult =
  | { kind: "html"; html: string }
  | { kind: "slides"; slides: { index: number; texts: string[] }[] };

function getExtension(name: string) {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx).toLowerCase();
}

function DocumentPreview({ file }: { file: FileEntry }) {
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/files/preview?path=${encodeURIComponent(file.path)}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Unable to generate a preview for this file.");
        return body as PreviewResult;
      })
      .then((result) => { if (!controller.signal.aborted) setPreview(result); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Unable to generate a preview for this file.");
      });
    return () => controller.abort();
  }, [file.path, attempt]);

  if (error) return <div><p role="alert" className="financeImportError">{error}</p><button type="button" className="projectWorkspaceLink" onClick={() => {
    setError(null); setPreview(null); setAttempt((value) => value + 1);
  }}>Retry preview</button></div>;
  if (!preview) return <p role="status">Generating preview...</p>;

  if (preview.kind === "html") {
    const safeHtml = DOMPurify.sanitize(preview.html);
    return <div className="documentPreview" dangerouslySetInnerHTML={{ __html: safeHtml }} />;
  }

  return (
    <div className="slidesPreview">
      {preview.slides.map((slide) => (
        <div key={slide.index} className="slidePreviewCard">
          <h3>Slide {slide.index}</h3>
          {slide.texts.length === 0 ? (
            <p>(no text content)</p>
          ) : (
            slide.texts.map((text, i) => <p key={i}>{text}</p>)
          )}
        </div>
      ))}
    </div>
  );
}

export default function FileViewer({ file }: { file: FileEntry | null }) {
  if (!file) {
    return <p>Select a file to preview it.</p>;
  }

  const ext = getExtension(file.name);
  const src = `/api/files/content?path=${encodeURIComponent(file.path)}`;
  const downloadSrc = `/api/files/content?path=${encodeURIComponent(file.path)}&download=true`;
  const officeLabel = OFFICE_LABELS[ext];

  return (
    <div className="fileViewer">
      <div className="fileViewerHeader">
        <h2>{file.name}</h2>
        <a href={downloadSrc} download={file.name} className="importButton">
          Download
        </a>
      </div>
      {IMAGE_EXT.includes(ext) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={file.name} className="fileViewerImage" />
      )}
      {VIDEO_EXT.includes(ext) && <video src={src} controls className="fileViewerVideo" />}
      {AUDIO_EXT.includes(ext) && <audio src={src} controls className="fileViewerAudio" />}
      {ext === ".pdf" && <iframe src={src} className="fileViewerFrame" title={file.name} />}
      {TEXT_EXT.includes(ext) && <iframe src={src} className="fileViewerFrame" title={file.name} />}
      {DOCUMENT_PREVIEW_EXT.includes(ext) && <DocumentPreview key={file.path} file={file} />}
      {officeLabel && <p>{officeLabel} — no inline preview available.</p>}
      {!IMAGE_EXT.includes(ext) &&
        !VIDEO_EXT.includes(ext) &&
        !AUDIO_EXT.includes(ext) &&
        ext !== ".pdf" &&
        !TEXT_EXT.includes(ext) &&
        !DOCUMENT_PREVIEW_EXT.includes(ext) &&
        !officeLabel && <p>No preview available for this file type.</p>}
    </div>
  );
}
