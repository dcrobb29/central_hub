"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { customerLabel, type Customer } from "@/app/lib/customer-fields";

export default function ProjectCustomerSelector({ projectId, customerId, customers, readOnly }: {
  projectId: number; customerId: number | null; customers: Customer[]; readOnly: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function change(value: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/projects/customer", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, customerId: value ? Number(value) : null }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to update customer");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update customer");
    } finally { setBusy(false); }
  }
  return <div className="projectCustomerAssignment">
    <label className="financeImportField">Billing customer
      <select value={customerId ?? ""} disabled={busy || readOnly} onChange={(event) => void change(event.target.value)}>
        <option value="">Choose a saved customer</option>
        {customers.filter((customer) => customer.isActive || customer.customerId === customerId).map((customer) =>
          <option key={customer.customerId} value={customer.customerId} disabled={!customer.isActive}>
            {customerLabel(customer)}{customer.isActive ? "" : " (Archived)"}
          </option>)}
      </select>
    </label>
    <Link href="/finances/customers" className="estimateTextAction">Manage customers</Link>
    {error && <p className="financeImportError" role="alert">{error}</p>}
  </div>;
}
