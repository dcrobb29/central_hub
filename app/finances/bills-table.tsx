"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { Bill } from "@/app/lib/bills";
import type { ProjectOption } from "@/app/lib/projects";
import { useFilterableTable, type TableColumn } from "@/app/lib/use-filterable-table";
import { FilterableTableHeaderCell } from "@/app/components/filterable-table-header-cell";
import Modal from "@/app/components/modal";

type Column = TableColumn<Bill>;

const COLUMNS: Column[] = [
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

function searchableValue(key: keyof Bill, value: Bill[keyof Bill]) {
  const raw = String(value ?? "").trim();
  const display = formatValue(key, value);
  return `${raw} ${display}`.toLocaleLowerCase();
}

function compareBills(left: Bill, right: Bill, key: keyof Bill) {
  const leftValue = left[key];
  const rightValue = right[key];
  if (key === "billAmount") {
    const leftAmount = Number(String(leftValue ?? "").replace(/[^0-9.-]/g, ""));
    const rightAmount = Number(String(rightValue ?? "").replace(/[^0-9.-]/g, ""));
    if (Number.isNaN(leftAmount)) return Number.isNaN(rightAmount) ? 0 : 1;
    if (Number.isNaN(rightAmount)) return -1;
    return leftAmount - rightAmount;
  }
  if (key === "billDate" || key === "billDueDate" || key === "billPaidDate") {
    const leftDate = Date.parse(String(leftValue ?? ""));
    const rightDate = Date.parse(String(rightValue ?? ""));
    if (Number.isNaN(leftDate)) return Number.isNaN(rightDate) ? 0 : 1;
    if (Number.isNaN(rightDate)) return -1;
    return leftDate - rightDate;
  }
  return String(leftValue ?? "").trim().localeCompare(String(rightValue ?? "").trim(), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function toDraft(bill: Bill): BillDraft {
  return {
    id: bill.id,
    projectId: bill.projectId == null ? "" : String(bill.projectId),
    billNo: bill.billNo,
    billDate: bill.billDate,
    billDueDate: bill.billDueDate ?? "",
    billPaidDate: bill.billPaidDate ?? "",
    billAmount: bill.billAmount,
    companyName: bill.companyName ?? "",
    billingAddressLine1: bill.billingAddressLine1 ?? "",
    billingAddressLine2: bill.billingAddressLine2 ?? "",
    billingAddressCity: bill.billingAddressCity ?? "",
    billingAddressState: bill.billingAddressState ?? "",
    billingAddressZip: bill.billingAddressZip ?? "",
  };
}

export default function BillsTable({ bills, projectOptions }: { bills: Bill[]; projectOptions: ProjectOption[] }) {
  const router = useRouter();
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [billDraft, setBillDraft] = useState<BillDraft>(EMPTY_BILL);
  const [isSavingBill, setIsSavingBill] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [deletingBill, setDeletingBill] = useState<Bill | null>(null);
  const [isDeletingBill, setIsDeletingBill] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const {
    search,
    setSearch,
    columnFilters,
    setColumnFilters,
    sort,
    toggleSort,
    openFilter,
    setOpenFilter,
    filterControlRoot,
    visibleRows: visibleBills,
    clearFilters,
    hasActiveFilters,
  } = useFilterableTable(bills, COLUMNS, { searchableValue, compare: compareBills });

  async function submitBill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingBill(true);
    setImportError(null);
    try {
      const url = editingBillId == null ? "/api/finances/bills" : `/api/finances/bills/${editingBillId}`;
      const response = await fetch(url, {
        method: editingBillId == null ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(billDraft),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Unable to save bill");
      setBillDraft(EMPTY_BILL);
      setIsImportOpen(false);
      setEditingBillId(null);
      router.refresh();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Unable to save bill");
    } finally {
      setIsSavingBill(false);
    }
  }

  function openCreateForm() {
    setImportError(null);
    setBillDraft(EMPTY_BILL);
    setEditingBillId(null);
    setIsImportOpen(true);
  }

  function openEditForm(bill: Bill) {
    setImportError(null);
    setBillDraft(toDraft(bill));
    setEditingBillId(bill.id);
    setIsImportOpen(true);
  }

  function closeImportDialog() {
    if (isSavingBill) return;
    setIsImportOpen(false);
    setEditingBillId(null);
    setImportError(null);
  }

  async function confirmDeleteBill() {
    if (!deletingBill) return;
    setIsDeletingBill(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/finances/bills/${deletingBill.id}`, { method: "DELETE" });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Unable to delete bill");
      setDeletingBill(null);
      router.refresh();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Unable to delete bill");
    } finally {
      setIsDeletingBill(false);
    }
  }

  function closeDeleteDialog() {
    if (isDeletingBill) return;
    setDeletingBill(null);
    setDeleteError(null);
  }

  return (
    <section className="invoiceTablePanel" ref={filterControlRoot}>
      <div className="invoiceTableTools">
        <label className="invoiceSearchLabel">
          Search bills
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search every column"
            className="invoiceSearchInput"
          />
        </label>
        <button type="button" className="financeImportButton" onClick={openCreateForm}>
          <Plus size={15} aria-hidden="true" />
          Import bill
        </button>
        <span className="invoiceResultCount" aria-live="polite">
          {visibleBills.length} of {bills.length} bills
        </span>
        {hasActiveFilters && (
          <button type="button" className="invoiceClearButton" onClick={clearFilters}>Clear</button>
        )}
      </div>
      <div className="invoiceTableWrapper">
        <table className="invoiceTable">
          <thead>
            <tr>
              {COLUMNS.map((column, index) => (
                <FilterableTableHeaderCell
                  key={column.key}
                  column={column}
                  idPrefix="bill"
                  alignPopoverRight={index >= COLUMNS.length - 2}
                  sortDirection={sort?.key === column.key ? sort.direction : null}
                  filterValue={columnFilters[column.key] ?? ""}
                  isFilterOpen={openFilter === column.key}
                  onToggleSort={() => toggleSort(column.key)}
                  onToggleFilter={() => setOpenFilter((current) => current === column.key ? null : column.key)}
                  onFilterChange={(value) => setColumnFilters((current) => ({ ...current, [column.key]: value }))}
                  onClearFilter={() => setColumnFilters((current) => ({ ...current, [column.key]: "" }))}
                />
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleBills.length === 0 ? (
              <tr><td colSpan={COLUMNS.length + 1} className="invoiceNoResults">{bills.length === 0 ? "No bills found." : "No bills match these filters."}</td></tr>
            ) : visibleBills.map((bill) => (
              <tr key={bill.id}>
                {COLUMNS.map((column) => <td key={column.key}>{formatValue(column.key, bill[column.key])}</td>)}
                <td>
                  <div className="estimateActionsInner">
                    <button type="button" className="estimateTextAction" onClick={() => openEditForm(bill)}>Edit</button>
                    <button type="button" className="estimateDangerAction" onClick={() => { setDeleteError(null); setDeletingBill(bill); }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isImportOpen && (
        <Modal
          titleId="billImportTitle"
          title={editingBillId == null ? "Import bill row" : "Edit bill row"}
          eyebrow="BILLS"
          onClose={closeImportDialog}
          closeDisabled={isSavingBill}
          closeLabel="Close import form"
        >
            <p className="financeImportHint">
              {editingBillId == null
                ? "ID, bill number, date, and amount are required. Due date, paid date, company, and address fields are optional."
                : "Bill number, date, and amount are required. The bill ID cannot be changed."}
            </p>
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
                          disabled={field.key === "id" && editingBillId != null}
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
        </Modal>
      )}
      {deletingBill && (
        <Modal
          titleId="billDeleteTitle"
          title="Delete bill row"
          eyebrow="BILLS"
          onClose={closeDeleteDialog}
          closeDisabled={isDeletingBill}
          closeLabel="Close delete confirmation"
          className="financeConfirmDialog"
        >
          <p className="financeImportHint">
            Delete bill <strong>{deletingBill.billNo}</strong>? This cannot be undone.
          </p>
          {deleteError && <p className="financeImportError" role="alert">{deleteError}</p>}
          <div className="financeImportActions">
            <button type="button" className="financeImportCancel" onClick={closeDeleteDialog} disabled={isDeletingBill}>Cancel</button>
            <button type="button" className="financeImportDanger" onClick={() => void confirmDeleteBill()} disabled={isDeletingBill}>
              {isDeletingBill ? "Deleting..." : "Delete bill"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
