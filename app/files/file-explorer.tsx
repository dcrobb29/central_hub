"use client";

import { useEffect, useState } from "react";
import type { FileEntry } from "@/app/lib/file-storage";
import FileViewer from "./file-viewer";

function formatSize(bytes?: number) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileExplorer() {
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    fetch(`/api/files/list?path=${encodeURIComponent(currentPath)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load directory");
        return res.json();
      })
      .then((data) => setEntries(data.entries))
      .catch(() => setError("Unable to load this folder."));
  }, [currentPath]);

  const breadcrumbSegments = currentPath ? currentPath.split("/") : [];
  const filteredEntries = entries.filter((entry) =>
    entry.name.toLowerCase().includes(search.toLowerCase())
  );

  function openEntry(entry: FileEntry) {
    if (entry.type === "directory") {
      setCurrentPath(entry.path);
      setSelectedFile(null);
    } else {
      setSelectedFile(entry);
    }
  }

  return (
    <div className="filesLayout">
      <div className="filesSidebar">
        <input
          type="text"
          placeholder="Search this folder..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="filesSearchInput"
        />
        <div className="filesBreadcrumb">
          <button onClick={() => setCurrentPath("")}>Files</button>
          {breadcrumbSegments.map((segment, i) => {
            const pathAtSegment = breadcrumbSegments.slice(0, i + 1).join("/");
            return (
              <span key={pathAtSegment}>
                {" / "}
                <button onClick={() => setCurrentPath(pathAtSegment)}>{segment}</button>
              </span>
            );
          })}
        </div>
        {error && <p>{error}</p>}
        <ul className="filesList">
          {currentPath && (
            <li>
              <button onClick={() => setCurrentPath(breadcrumbSegments.slice(0, -1).join("/"))}>.. (up)</button>
            </li>
          )}
          {filteredEntries.map((entry) => (
            <li key={entry.path}>
              <button
                onClick={() => openEntry(entry)}
                className={selectedFile?.path === entry.path ? "filesListItemActive" : undefined}
              >
                {entry.type === "directory" ? "📁" : "📄"} {entry.name}
                {entry.type === "file" && <span className="filesListItemSize"> ({formatSize(entry.size)})</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="filesContent">
        <FileViewer file={selectedFile} />
      </div>
    </div>
  );
}
