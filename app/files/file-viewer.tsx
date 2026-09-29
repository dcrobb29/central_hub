"use client";

import type { FileEntry } from "@/app/lib/file-storage";

const IMAGE_EXT = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"];
const VIDEO_EXT = [".mp4", ".webm", ".mov", ".avi"];
const TEXT_EXT = [".txt", ".csv", ".json", ".md"];

function getExtension(name: string) {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx).toLowerCase();
}

export default function FileViewer({ file }: { file: FileEntry | null }) {
  if (!file) {
    return <p>Select a file to preview it.</p>;
  }

  const ext = getExtension(file.name);
  const src = `/api/files/content?path=${encodeURIComponent(file.path)}`;

  return (
    <div className="fileViewer">
      <h2>{file.name}</h2>
      {IMAGE_EXT.includes(ext) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={file.name} className="fileViewerImage" />
      )}
      {VIDEO_EXT.includes(ext) && (
        <video src={src} controls className="fileViewerVideo" />
      )}
      {ext === ".pdf" && <iframe src={src} className="fileViewerFrame" title={file.name} />}
      {TEXT_EXT.includes(ext) && <iframe src={src} className="fileViewerFrame" title={file.name} />}
      {!IMAGE_EXT.includes(ext) && !VIDEO_EXT.includes(ext) && ext !== ".pdf" && !TEXT_EXT.includes(ext) && (
        <p>
          No preview available for this file type. <a href={src}>Download {file.name}</a>
        </p>
      )}
    </div>
  );
}
