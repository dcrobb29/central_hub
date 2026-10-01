"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { Bill } from "@/app/lib/bills";
import type { ProjectOption } from "@/app/lib/projects";

type BillColumn = {
  key: keyof Bill;
  label: string;
};

const COLUMNS: BillColumn[] = [
  { key: "billNo", label: "Bill No" },
  { key: "projectName", label: "Project" },
  { key: "billDate", label: "Bill Date" },
  { key: "billDueDate", label: "Due Date" },
  { key: "billPaidDate", label: "Paid Date" },
  { key: "billAmount", label: "Amount" },
  { key: "companyName", label: "Company" },
  { key: "billingAddressLine1", label: "Billing Address 1" },
  { key: "billingAddressLine2", label: "Billing Address 2" },
  { key: "billingAddressCity", label: "Billing City" },
  { key: "billingAddressState", label: "Billing State" },
  { key: "billingAddressZip", label: "Billing Zip" },
];

type BillDraft = Omit<Bill, "projectId" | "projectName"> & { projectId: string };

const EMPTY_BILL: BillDraft = {
  id: "",
  projectId: "",
  billNo: "",
  billDate: "",
  billDueDate: "",
  billPaidDate: "",
  billAmount: "",
  companyName: "",
  billingAddressLine1: "",
  billingAddressLine2: "",
  billingAddressCity: "",
  billingAddressState: "",
  billingAddressZip: "",
};

type BillField = {
  key: keyof BillDraft;
  label: string;
  required?: boolean;
  type?: "text" | "date" | "number";
  maxLength?: number;
};

const BILL_FIELD_GROUPS: { title: string; fields: BillField[] }[] = [
  { title: "Bill", fields: [
    { key: "id", label: "ID", required: true, maxLength: 10 },
    { key: "billNo", label: "Bill No", required: true, maxLength: 10 },
    { key: "billDate", label: "Bill Date", required: true, type: "date" },
    { key: "billDueDate", label: "Due Date", type: "date" },
    { key: "billPaidDate", label: "Paid Date", type: "date" },
    { key: "billAmount", label: "Amount", required: true, type: "number" },
  ] },
  { title: "Company", fields: [
    { key: "companyName", label: "Company Name", maxLength: 10 },
  ] },
  { title: "Billing Address", fields: [
    { key: "billingAddressLine1", label: "Address Line 1", maxLength: 50 },
    { key: "billingAddressLine2", label: "Address Line 2", maxLength: 50 },
    { key: "billingAddressCity", label: "City", maxLength: 50 },
    { key: "billingAddressState", label: "State", maxLength: 50 },
    { key: "billingAddressZip", label: "ZIP", maxLength: 10 },
  ] },
];

function formatValue(key: keyof Bill, value: Bill[keyof Bill]) {
  if (key === "projectName" && (value == null || value === "")) return "Unassigned";
  if (value == null || value === "") return "—";
  if (key === "billAmount") {
    const amount = Number(String(value).replace(/[^0-9.-]/g, ""));
    if (Number.isNaN(amount)) return String(value).trim();
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
  }
  if (key === "billDate" || key === "billDueDate" || key === "billPaidDate") {
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? String(value).trim() : date.toLocaleDateString();
  }
  return String(value).trim();
}

export default function BillsTable({ bills, projectOptions }: { bills: Bill[]; projectOptions: ProjectOption[] }) {
  const router = useRouter();
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [billDraft, setBillDraft] = useState<BillDraft>(EMPTY_BILL);
  const [isSavingBill, setIsSavingBill] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  async function submitBill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingBill(true);
    setImportError(null);
    try {
      const response = await fetch("/api/finances/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(billDraft),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Unable to save bill");
      setBillDraft(EMPTY_BILL);
      setIsImportOpen(false);
      router.refresh();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Unable to save bill");
    } finally {
      setIsSavingBill(false);
    }
  }

  function closeImportDialog() {
    if (isSavingBill) return;
    setIsImportOpen(false);
    setImportError(null);
  }

  return (
    <section className="invoiceTablePanel">
      <div className="invoiceTableTools">
        <button type="button" className="financeImportButton" onClick={() => { setImportError(null); setIsImportOpen(true); }}>
          <Plus size={15} aria-hidden="true" />
          Import bill
        </button>
        <span className="invoiceResultCount">{bills.length} bills</span>
      </div>
      <div className="invoiceTableWrapper">
        <table className="invoiceTable">
          <thead>
            <tr>{COLUMNS.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
          </thead>
          <tbody>
            {bills.length === 0 ? (
              <tr><td colSpan={COLUMNS.length} className="invoiceNoResults">No bills found.</td></tr>
            ) : bills.map((bill) => (
              <tr key={bill.id}>
                {COLUMNS.map((column) => <td key={column.key}>{formatValue(column.key, bill[column.key])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isImportOpen && (
        <div className="financeImportBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeImportDialog(); }}>
          <section className="financeImportDialog" role="dialog" aria-modal="true" aria-labelledby="billImportTitle">
            <header className="financeImportDialogHeader">
              <div>
                <p className="financeImportEyebrow">BILLS</p>
                <h2 id="billImportTitle">Import bill row</h2>
              </div>
              <button type="button" className="financeImportClose" onClick={closeImportDialog} aria-label="Close import form" disabled={isSavingBill}>×</button>
            </header>
            <p className="financeImportHint">ID, bill number, date, and amount are required. Due date, paid date, company, and address fields are optional.</p>
            <form onSubmit={submitBill}>
              <fieldset className="financeImportGroup">
                <legend>Project assignment</legend>
                <div className="financeImportFields">
                  <label className="financeImportField">
                    Project
                    <select value={billDraft.projectId} onChange={(event) => setBillDraft((current) => ({ ...current, projectId: event.target.value }))}>
                      <option value="">Unassigned</option>
                      {projectOptions.map((project) => <option value={project.projectId} key={project.projectId}>{project.projectName}</option>)}
                    </select>
                  </label>
                </div>
              </fieldset>
              {BILL_FIELD_GROUPS.map((group) => (
                <fieldset className="financeImportGroup" key={group.title}>
                  <legend>{group.title}</legend>
                  <div className="financeImportFields">
                    {group.fields.map((field) => (
                      <label className="financeImportField" key={field.key}>
                        {field.label}{field.required ? " *" : ""}
                        <input
                          type={field.type ?? "text"}
                          value={billDraft[field.key] ?? ""}
                          onChange={(event) => setBillDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                          maxLength={field.maxLength}
                          step={field.type === "number" ? "0.01" : undefined}
                          required={field.required}
                        />
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              {importError && <p className="financeImportError" role="alert">{importError}</p>}
              <div className="financeImportActions">
                <button type="button" className="financeImportCancel" onClick={closeImportDialog} disabled={isSavingBill}>Cancel</button>
                <button type="submit" className="financeImportSubmit" disabled={isSavingBill}>{isSavingBill ? "Saving..." : "Save bill"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
