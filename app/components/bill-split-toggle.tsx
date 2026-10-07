"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BillSplitToggle({ billId, isSplit, disabled = false }: {
  billId: string; isSplit: boolean; disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function changeMode(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/finances/bills/${encodeURIComponent(billId)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isSplit: next }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to change bill split mode");
      router.refresh();
    } catch (modeError) {
      setError(modeError instanceof Error ? modeError.message : "Unable to change bill split mode");
    } finally { setBusy(false); }
  }
  return <div>
    <label><input type="checkbox" aria-label={`Split bill ${billId} across jobs`} checked={isSplit} disabled={disabled || busy}
      onChange={(event) => void changeMode(event.target.checked)} /> Split across jobs</label>
    <small className="billAllocationBalance">{isSplit ? "Each job receives only its allocated costs." : "Single-job mode charges the full bill to its job."} Changing mode changes job totals and is saved immediately.</small>
    {error && <p className="financeImportError" role="alert">{error}</p>}
  </div>;
}
