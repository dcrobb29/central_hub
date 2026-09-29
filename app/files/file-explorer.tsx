"use client";

import { useEffect, useRef, useState } from "react";
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
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // webkitdirectory has no React prop; set it imperatively so folder pickers work
  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "");
    folderInputRef.current?.setAttribute("directory", "");
  }, []);

  function loadDirectory(path: string) {
    setError(null);
    return fetch(`/api/files/list?path=${encodeURIComponent(path)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load directory");
        return res.json();
      })
      .then((data) => setEntries(data.entries))
      .catch(() => setError("Unable to load this folder."));
  }

  useEffect(() => {
    loadDirectory(currentPath);
  }, [currentPath]);

  async function uploadFile(file: File, relativePath: string) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("path", currentPath);
    formData.append("relativePath", relativePath);

    const res = await fetch("/api/files/upload", { method: "POST", body: formData });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `Failed to upload ${relativePath}`);
    }
  }

  async function handleImport(fileList: FileList | null) {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) return;

    setIsUploading(true);
    setError(null);
    const failures: string[] = [];

    for (const file of files) {
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      try {
        await uploadFile(file, relativePath);
      } catch (err) {
        failures.push(err instanceof Error ? err.message : relativePath);
      }
    }

    if (failures.length > 0) {
      setError(`${failures.length} of ${files.length} item(s) failed: ${failures.join(", ")}`);
    }

    await loadDirectory(currentPath);
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
  }

  async function handleCreateFolder() {
    const name = window.prompt("New folder name:");
    if (!name || !name.trim()) return;

    setError(null);
    try {
      const res = await fetch("/api/files/create-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: currentPath, name: name.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to create folder");
      }
      await loadDirectory(currentPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create folder");
    }
  }

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
          type="file"
          ref={fileInputRef}
          onChange={(e) => handleImport(e.target.files)}
          className="filesImportInput"
          multiple
        />
        <input
          type="file"
          ref={folderInputRef}
          onChange={(e) => handleImport(e.target.files)}
          className="filesImportInput"
        />
        <div className="filesActionRow">
          <button className="importButton" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            {isUploading ? "Importing..." : "Import Files"}
          </button>
          <button className="importButton" onClick={() => folderInputRef.current?.click()} disabled={isUploading}>
            {isUploading ? "Importing..." : "Import Folder"}
          </button>
        </div>
        <button className="importButton" onClick={handleCreateFolder} disabled={isUploading}>
          New Folder
        </button>
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
            <li key={entry.path} className="filesListRow">
              <button
                onClick={() => openEntry(entry)}
                className={selectedFile?.path === entry.path ? "filesListItemActive" : undefined}
              >
                {entry.type === "directory" ? "📁" : "📄"} {entry.name}
                {entry.type === "file" && <span className="filesListItemSize"> ({formatSize(entry.size)})</span>}
              </button>
              {entry.type === "file" && (
                <a
                  href={`/api/files/content?path=${encodeURIComponent(entry.path)}&download=true`}
                  download={entry.name}
                  className="filesListDownload"
                  title={`Download ${entry.name}`}
                >
                  ⬇
                </a>
              )}
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
