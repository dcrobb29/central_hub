"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PROJECT_STATUSES, type ProjectStatus } from "@/app/lib/project-status";

export default function ProjectStatusSelector({ projectId, projectName, status }: {
  projectId: number; projectName: string; status: ProjectStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function changeStatus(nextStatus: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/projects/status", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, status: nextStatus }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to update status");
      router.refresh();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Unable to update status");
    } finally { setBusy(false); }
  }
  return (
    <span className="projectStatusControl" onClick={(event) => event.stopPropagation()}>
      <select aria-label={`Status for ${projectName}`} value={status} disabled={busy} onChange={(event) => void changeStatus(event.target.value)}>
        {PROJECT_STATUSES.map((value) => <option key={value} value={value} disabled={status === "Complete" && value === "Upcoming"}>{value}</option>)}
      </select>
      {error && <span className="financeImportError" role="alert">{error}</span>}
    </span>
  );
}
