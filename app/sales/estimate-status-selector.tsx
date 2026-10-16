"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EstimateSummary } from "@/app/lib/estimates";
import { canWinEstimate, ESTIMATE_STATUSES, isEditableEstimateStatus } from "@/app/lib/estimate-status";

export default function EstimateStatusSelector({ estimate, canEdit, onWin }: {
  estimate: EstimateSummary;
  canEdit: boolean;
  onWin: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeStatus(value: string) {
    setError(null);
    if (value === "Won" && canWinEstimate(estimate.status)) {
      onWin();
      return;
    }
    if (!isEditableEstimateStatus(value)) {
      setError("Choose a valid estimate status.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/sales/estimates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-status", estimateId: estimate.estimateId, status: value }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to update estimate status.");
      router.refresh();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Unable to update estimate status.");
    } finally {
      setBusy(false);
    }
  }

  return <span className="projectStatusControl">
    <select className={`estimateStatus estimateStatus${estimate.status}`}
      aria-label={`Estimate status for ${estimate.estimateName}`} aria-busy={busy}
      value={estimate.status} disabled={!canEdit || busy || estimate.status === "Won"}
      onChange={(event) => void changeStatus(event.target.value)}>
      {ESTIMATE_STATUSES.map((status) => <option key={status} value={status}
        disabled={status === "Won" && !canWinEstimate(estimate.status)}>{status}</option>)}
    </select>
    {error && <span className="financeImportError" role="alert">{error}</span>}
  </span>;
}
