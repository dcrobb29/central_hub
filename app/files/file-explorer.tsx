"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Download, File as FileIcon, Folder, Plus, Upload } from "lucide-react";
import type { FileEntry } from "@/app/lib/file-storage";
import Modal from "@/app/components/modal";
import recordStyles from "@/app/components/record-workspace.module.css";
import styles from "./file-workspace.module.css";
import FileViewer from "./file-viewer";

function formatSize(bytes?: number) {
  if (bytes == null) return "Not available";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatModified(value?: string) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function FileExplorer() {
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("asc");
  const [showFilters, setShowFilters] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const busy = isUploading || isCreatingFolder;

  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "");
    folderInputRef.current?.setAttribute("directory", "");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/files/list?path=${encodeURIComponent(currentPath)}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Unable to load this folder.");
        return data as { entries: FileEntry[] };
      })
      .then((data) => {
        if (!controller.signal.aborted) setEntries(data.entries);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setDirectoryError(error instanceof Error ? error.message : "Unable to load this folder.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [currentPath, loadAttempt]);

  useEffect(() => { previewHeading.current?.focus(); }, [selectedFile]);

  function refresh() {
    setLoading(true);
    setDirectoryError(null);
    setLoadAttempt((attempt) => attempt + 1);
  }

  function navigate(path: string) {
    if (busy) return;
    setSelectedFile(null);
    setSearch("");
    setImportError(null);
    setImportStatus(null);
    if (path !== currentPath) {
      setEntries([]);
      setLoading(true);
      setDirectoryError(null);
      setCurrentPath(path);
    }
  }

  async function handleImport(fileList: FileList | null) {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0 || busy) return;
    setShowImport(false);
    setIsUploading(true);
    setImportError(null);
    setImportStatus(null);
    const failures: string[] = [];
    for (const file of files) {
      const relativePath = file.webkitRelativePath || file.name;
      const formData = new FormData();
      formData.append("file", file);
      formData.append("path", currentPath);
      formData.append("relativePath", relativePath);
      try {
        const response = await fetch("/api/files/upload", { method: "POST", body: formData });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? `Failed to upload ${relativePath}`);
        }
      } catch (error) {
        failures.push(`${relativePath}: ${error instanceof Error ? error.message : "Upload failed"}`);
      }
    }
    if (failures.length) setImportError(`${failures.length} of ${files.length} item(s) failed: ${failures.join(", ")}`);
    setImportStatus(`${files.length - failures.length} of ${files.length} item(s) imported.`);
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
    refresh();
  }

  async function handleCreateFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!folderName.trim()) {
      setFolderError("Enter a folder name.");
      return;
    }
    setIsCreatingFolder(true);
    setFolderError(null);
    try {
      const response = await fetch("/api/files/create-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: currentPath, name: folderName.trim() }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Unable to create folder.");
      }
      setShowFolderForm(false);
      setFolderName("");
      refresh();
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : "Unable to create folder.");
    } finally {
      setIsCreatingFolder(false);
    }
  }

  const segments = currentPath ? currentPath.split("/") : [];
  const visibleEntries = entries.filter((entry) => (type === "all" || entry.type === type)
    && entry.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    .sort((a, b) => a.type !== b.type ? (a.type === "directory" ? -1 : 1)
      : (sort === "desc" ? -1 : 1) * a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  const filtersActive = Boolean(search || type !== "all" || sort !== "asc");

  function resetFilters() {
    setSearch("");
    setType("all");
    setSort("asc");
  }

  return <section className={`${recordStyles.workspace} ${styles.workspace}`}>
    <input type="file" ref={fileInputRef} onChange={(event) => void handleImport(event.target.files)} className="filesImportInput" multiple aria-label="Choose files to import" />
    <input type="file" ref={folderInputRef} onChange={(event) => void handleImport(event.target.files)} className="filesImportInput" aria-label="Choose folder to import" />
    {selectedFile ? <>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <button type="button" className="projectWorkspaceLink" onClick={() => setSelectedFile(null)}>Back to {segments.at(-1) || "Files"}</button>
        <span> / {selectedFile.name}</span>
      </nav>
      <header className={styles.heading}><div><p className="salesEyebrow">FILE WORKSPACE</p><h1 ref={previewHeading} tabIndex={-1}>{selectedFile.name}</h1></div></header>
      <details className={styles.details}><summary>File details</summary>
        <dl className={styles.facts}><div><dt>Location</dt><dd>{selectedFile.path}</dd></div>
          <div><dt>Size</dt><dd>{formatSize(selectedFile.size)}</dd></div>
          <div><dt>Last modified</dt><dd>{formatModified(selectedFile.modifiedAt)}</dd></div></dl>
      </details>
      <div className={styles.preview}><FileViewer key={selectedFile.path} file={selectedFile} /></div>
    </> : <>
      <header className={styles.heading}>
        <div><p className="salesEyebrow">FILES & DOCUMENTS</p><h1>Files</h1></div>
        <div className={styles.actions}>
          <button type="button" className="projectWorkspaceLink" disabled={busy} aria-haspopup="dialog" onClick={() => { setFolderName(""); setFolderError(null); setShowFolderForm(true); }}><Plus size={15} aria-hidden="true" />New folder</button>
          <button type="button" className="financeImportButton" disabled={busy} aria-haspopup="dialog" onClick={() => setShowImport(true)}><Upload size={15} aria-hidden="true" />Import</button>
        </div>
      </header>
      <p className={recordStyles.intro}>Files at a glance. Open folders to browse, or preview a file before downloading.</p>
      <div className={styles.toolbar}>
        <nav className={styles.breadcrumb} aria-label="Folder location">
          <button type="button" className="projectWorkspaceLink" disabled={busy} onClick={() => navigate("")} aria-current={!currentPath ? "location" : undefined}>Files</button>
          {segments.map((segment, index) => <span key={segments.slice(0, index + 1).join("/")}> / <button type="button" className="projectWorkspaceLink" disabled={busy}
            aria-current={index === segments.length - 1 ? "location" : undefined} onClick={() => navigate(segments.slice(0, index + 1).join("/"))}>{segment}</button></span>)}
        </nav>
        <div className={styles.actions}>
          {currentPath && <button type="button" className="projectWorkspaceLink" disabled={busy} onClick={() => navigate(segments.slice(0, -1).join("/"))}>Up one folder</button>}
          <button type="button" className="listFilterButton" aria-label="Filters & sort" aria-haspopup="dialog" onClick={() => setShowFilters(true)}>Filters &amp; sort
            {filtersActive && <span className="listFilterIndicator" aria-label="Filters or sorting active" />}</button>
        </div>
      </div>
      <div className="invoiceTableTools">
        <label className="invoiceSearchLabel">Search this folder<input type="search" className="invoiceSearchInput" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="File or folder name" /></label>
        {!loading && !directoryError && <span className="invoiceResultCount" aria-live="polite">{visibleEntries.length} of {entries.length} items</span>}
        {filtersActive && <button type="button" className="invoiceClearButton" onClick={resetFilters}>Clear</button>}
      </div>
      {isUploading && <p role="status">Importing items into {currentPath || "Files"}. Please keep this folder open.</p>}
      {importStatus && <p role="status" className="billingNotice">{importStatus}</p>}
      {importError && <p role="alert" className="financeImportError">{importError}</p>}
      {loading ? <p role="status">Loading folder...</p> : directoryError ? <div className={recordStyles.empty}>
        <p role="alert" className="financeImportError">{directoryError}</p><button type="button" className="projectWorkspaceLink" onClick={refresh}>Retry loading folder</button>
      </div> : <div className={recordStyles.list}>
        {visibleEntries.length === 0 && <div className={recordStyles.empty}><h2>{entries.length ? "No matching items" : "This folder is empty"}</h2>
          <p>{entries.length ? "Try another search or clear the filters." : "Import files or create a folder to get started."}</p></div>}
        {visibleEntries.map((entry) => <article className={recordStyles.card} key={entry.path} aria-label={entry.name}>
          <div className={recordStyles.identity}><h2><button type="button" className={styles.name} disabled={busy} onClick={() => entry.type === "directory" ? navigate(entry.path) : setSelectedFile(entry)}>
            {entry.type === "directory" ? <Folder size={18} aria-hidden="true" /> : <FileIcon size={18} aria-hidden="true" />}<span>{entry.name}</span></button></h2></div>
          <div className={recordStyles.status}><span className={recordStyles.label}>Type</span><strong>{entry.type === "directory" ? "Folder" : "File"}</strong></div>
          <div className={recordStyles.value}><span className={recordStyles.label}>Size</span><strong>{entry.type === "file" ? formatSize(entry.size) : "-"}</strong></div>
          <div className={recordStyles.actions}>
            <button type="button" className={recordStyles.openRecord} disabled={busy} onClick={() => entry.type === "directory" ? navigate(entry.path) : setSelectedFile(entry)}
              aria-label={`${entry.type === "directory" ? "Open folder" : "Preview"} ${entry.name}`}>{entry.type === "directory" ? "Open folder" : "Preview"}</button>
            {entry.type === "file" && <a className="projectWorkspaceLink" href={`/api/files/content?path=${encodeURIComponent(entry.path)}&download=true`} download={entry.name} aria-label={`Download ${entry.name}`}><Download size={15} aria-hidden="true" />Download</a>}
          </div>
        </article>)}
      </div>}
    </>}
    {showImport && <Modal titleId="fileImportTitle" title="Import" eyebrow="FILES" onClose={() => setShowImport(false)}>
      <p className={recordStyles.intro}>Import into {currentPath || "Files"}. Existing files are not overwritten. Folder imports keep their subfolder structure.</p>
      <div className={styles.importActions}><button type="button" className="financeImportButton" onClick={() => fileInputRef.current?.click()}>Import files</button>
        <button type="button" className="projectWorkspaceLink" onClick={() => folderInputRef.current?.click()}>Import folder</button></div>
    </Modal>}
    {showFolderForm && <Modal titleId="newFolderTitle" title="New folder" eyebrow="FILES" onClose={() => { if (!isCreatingFolder) setShowFolderForm(false); }} closeDisabled={isCreatingFolder}>
      <form onSubmit={handleCreateFolder}><p className="financeImportHint">Create in {currentPath || "Files"}.</p>
        <label className="financeImportField">Folder name<input autoFocus required value={folderName} disabled={isCreatingFolder} onChange={(event) => setFolderName(event.target.value)} /></label>
        {folderError && <p role="alert" className="financeImportError">{folderError}</p>}
        <div className="financeImportActions"><button type="button" className="financeImportCancel" disabled={isCreatingFolder} onClick={() => setShowFolderForm(false)}>Cancel</button>
          <button type="submit" className="financeImportSubmit" disabled={isCreatingFolder}>{isCreatingFolder ? "Creating..." : "Create folder"}</button></div>
      </form>
    </Modal>}
    {showFilters && <Modal titleId="fileFiltersTitle" title="Filters & sort" eyebrow="FILES" onClose={() => setShowFilters(false)} closeLabel="Close filters and sort">
      <label className="financeImportField">Type<select value={type} onChange={(event) => setType(event.target.value)}><option value="all">Files & folders</option><option value="file">Files only</option><option value="directory">Folders only</option></select></label>
      <label className="financeImportField">Sort by<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="asc">Name: A to Z</option><option value="desc">Name: Z to A</option></select></label>
      <p className="projectCostHint">Folders stay before files. Changes apply immediately to this folder.</p>
      <div className="financeImportActions"><button type="button" className="financeImportCancel" onClick={resetFilters}>Reset filters &amp; sort</button><button type="button" className="financeImportSubmit" onClick={() => setShowFilters(false)}>Done</button></div>
    </Modal>}
  </section>;
}
