"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { FormEvent } from "react";
import type { Invoice } from "@/app/lib/invoices";
import type { ProjectOption } from "@/app/lib/projects";
import { useFilterableTable, type TableColumn } from "@/app/lib/use-filterable-table";
import { FilterableTableHeaderCell } from "@/app/components/filterable-table-header-cell";
import Modal from "@/app/components/modal";

type Column = TableColumn<Invoice>;

const COLUMNS: Column[] = [
  { key: "invoiceNo", label: "Invoice No" },
  { key: "projectName", label: "Project" },
  { key: "invoiceDate", label: "Invoice Date" },
  { key: "invoiceDueDate", label: "Due Date" },
  { key: "invoicePaidDate", label: "Paid Date" },
  { key: "invoiceAmount", label: "Amount" },
  { key: "firstName", label: "First Name" },
  { key: "lastName", label: "Last Name" },
  { key: "companyName", label: "Company" },
  { key: "billingAddressLine1", label: "Billing Address 1" },
  { key: "billingAddressLine2", label: "Billing Address 2" },
  { key: "billingAddressCity", label: "Billing City" },
  { key: "billingAddressState", label: "Billing State" },
  { key: "billingAddressZip", label: "Billing Zip" },
  { key: "shippingAddressLine1", label: "Shipping Address 1" },
  { key: "shippingAddressLine2", label: "Shipping Address 2" },
  { key: "shippingAddressCity", label: "Shipping City" },
  { key: "shippingAddressState", label: "Shipping State" },
  { key: "shippingAddressZip", label: "Shipping Zip" },
];

type InvoiceDraft = Omit<Invoice, "id" | "projectId" | "projectName"> & { projectId: string };
type InvoiceField = {
  key: Exclude<keyof InvoiceDraft, "projectId">;
  label: string;
  required?: boolean;
  type?: "text" | "date" | "number";
  maxLength?: number;
};

const EMPTY_INVOICE: InvoiceDraft = {
  projectId: "",
  invoiceNo: "",
  invoiceDate: "",
  invoiceDueDate: "",
  invoicePaidDate: "",
  invoiceAmount: "",
  firstName: "",
  lastName: "",
  companyName: "",
  billingAddressLine1: "",
  billingAddressLine2: "",
  billingAddressCity: "",
  billingAddressState: "",
  billingAddressZip: "",
  shippingAddressLine1: "",
  shippingAddressLine2: "",
  shippingAddressCity: "",
  shippingAddressState: "",
  shippingAddressZip: "",
};

const INVOICE_FIELD_GROUPS: { title: string; fields: InvoiceField[] }[] = [
  { title: "Invoice", fields: [
    { key: "invoiceNo", label: "Invoice No", required: true, maxLength: 10 },
    { key: "invoiceDate", label: "Invoice Date", required: true, type: "date" },
    { key: "invoiceDueDate", label: "Due Date", required: true, type: "date" },
    { key: "invoicePaidDate", label: "Paid Date", type: "date" },
    { key: "invoiceAmount", label: "Amount", type: "number" },
  ] },
  { title: "Customer", fields: [
    { key: "firstName", label: "First Name", maxLength: 25 },
    { key: "lastName", label: "Last Name", maxLength: 25 },
    { key: "companyName", label: "Company Name", maxLength: 10 },
  ] },
  { title: "Billing Address", fields: [
    { key: "billingAddressLine1", label: "Address Line 1", maxLength: 50 },
    { key: "billingAddressLine2", label: "Address Line 2", maxLength: 50 },
    { key: "billingAddressCity", label: "City", maxLength: 50 },
    { key: "billingAddressState", label: "State", maxLength: 50 },
    { key: "billingAddressZip", label: "ZIP", maxLength: 10 },
  ] },
  { title: "Shipping Address", fields: [
    { key: "shippingAddressLine1", label: "Address Line 1", maxLength: 50 },
    { key: "shippingAddressLine2", label: "Address Line 2", maxLength: 50 },
    { key: "shippingAddressCity", label: "City", maxLength: 50 },
    { key: "shippingAddressState", label: "State", maxLength: 50 },
    { key: "shippingAddressZip", label: "ZIP", maxLength: 10 },
  ] },
];

function parseAmount(value: unknown) {
  const amountText = String(value ?? "").replace(/[^0-9.-]/g, "");
  return amountText ? Number(amountText) : Number.NaN;
}

function formatValue(key: keyof Invoice, value: Invoice[keyof Invoice]) {
  if (key === "projectName" && (value == null || value === "")) return "Unassigned";
  if (key === "invoicePaidDate" && (value == null || value === "")) return "Unpaid";
  if (value == null || value === "") return "";
  if (key === "invoiceAmount") {
    const numeric = parseAmount(value);
    if (Number.isNaN(numeric)) return String(value).trim();
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(numeric);
  }
  if (key === "invoiceDate" || key === "invoiceDueDate" || key === "invoicePaidDate") {
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    return Number.isNaN(date.getTime()) ? String(value).trim() : date.toLocaleDateString();
  }
  return String(value).trim();
}

function searchableValue(key: keyof Invoice, value: Invoice[keyof Invoice]) {
  const raw = String(value ?? "").trim();
  const display = formatValue(key, value);
  return `${raw} ${display}`.toLocaleLowerCase();
}

function compareInvoices(left: Invoice, right: Invoice, key: keyof Invoice) {
  const leftValue = left[key];
  const rightValue = right[key];
  if (key === "invoiceAmount") {
    const leftAmount = parseAmount(leftValue);
    const rightAmount = parseAmount(rightValue);
    if (Number.isNaN(leftAmount)) return Number.isNaN(rightAmount) ? 0 : 1;
    if (Number.isNaN(rightAmount)) return -1;
    return leftAmount - rightAmount;
  }
  if (key === "invoiceDate" || key === "invoiceDueDate" || key === "invoicePaidDate") {
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

function toDraft(invoice: Invoice): InvoiceDraft {
  return {
    projectId: invoice.projectId == null ? "" : String(invoice.projectId),
    invoiceNo: invoice.invoiceNo,
    invoiceDate: invoice.invoiceDate,
    invoiceDueDate: invoice.invoiceDueDate,
    invoicePaidDate: invoice.invoicePaidDate ?? "",
    invoiceAmount: invoice.invoiceAmount ?? "",
    firstName: invoice.firstName ?? "",
    lastName: invoice.lastName ?? "",
    companyName: invoice.companyName ?? "",
    billingAddressLine1: invoice.billingAddressLine1 ?? "",
    billingAddressLine2: invoice.billingAddressLine2 ?? "",
    billingAddressCity: invoice.billingAddressCity ?? "",
    billingAddressState: invoice.billingAddressState ?? "",
    billingAddressZip: invoice.billingAddressZip ?? "",
    shippingAddressLine1: invoice.shippingAddressLine1 ?? "",
    shippingAddressLine2: invoice.shippingAddressLine2 ?? "",
    shippingAddressCity: invoice.shippingAddressCity ?? "",
    shippingAddressState: invoice.shippingAddressState ?? "",
    shippingAddressZip: invoice.shippingAddressZip ?? "",
  };
}

export default function InvoiceTable({ className, invoices, projectOptions }: { className?: string; invoices: Invoice[]; projectOptions: ProjectOption[] }) {
  const router = useRouter();
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<number | null>(null);
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft>(EMPTY_INVOICE);
  const [isSavingInvoice, setIsSavingInvoice] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [deletingInvoice, setDeletingInvoice] = useState<Invoice | null>(null);
  const [isDeletingInvoice, setIsDeletingInvoice] = useState(false);
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
    visibleRows: visibleInvoices,
    clearFilters,
    hasActiveFilters,
  } = useFilterableTable(invoices, COLUMNS, { searchableValue, compare: compareInvoices });

  async function submitInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingInvoice(true);
    setImportError(null);
    try {
      const url = editingInvoiceId == null ? "/api/finances/invoices" : `/api/finances/invoices/${editingInvoiceId}`;
      const response = await fetch(url, {
        method: editingInvoiceId == null ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invoiceDraft),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Unable to save invoice");
      setInvoiceDraft(EMPTY_INVOICE);
      setIsImportOpen(false);
      setEditingInvoiceId(null);
      router.refresh();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Unable to save invoice");
    } finally {
      setIsSavingInvoice(false);
    }
  }

  function openCreateForm() {
    setImportError(null);
    setInvoiceDraft(EMPTY_INVOICE);
    setEditingInvoiceId(null);
    setIsImportOpen(true);
  }

  function openEditForm(invoice: Invoice) {
    setImportError(null);
    setInvoiceDraft(toDraft(invoice));
    setEditingInvoiceId(invoice.id);
    setIsImportOpen(true);
  }

  function closeImportDialog() {
    if (isSavingInvoice) return;
    setIsImportOpen(false);
    setEditingInvoiceId(null);
    setImportError(null);
  }

  async function confirmDeleteInvoice() {
    if (!deletingInvoice) return;
    setIsDeletingInvoice(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/finances/invoices/${deletingInvoice.id}`, { method: "DELETE" });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Unable to delete invoice");
      setDeletingInvoice(null);
      router.refresh();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Unable to delete invoice");
    } finally {
      setIsDeletingInvoice(false);
    }
  }

  function closeDeleteDialog() {
    if (isDeletingInvoice) return;
    setDeletingInvoice(null);
    setDeleteError(null);
  }

  return (
    <section className="invoiceTablePanel" ref={filterControlRoot}>
      <div className="invoiceTableTools">
        <label className="invoiceSearchLabel">
          Search invoices
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
          Import invoice
        </button>
        <span className="invoiceResultCount" aria-live="polite">
          {visibleInvoices.length} of {invoices.length} invoices
        </span>
        {hasActiveFilters && (
          <button type="button" className="invoiceClearButton" onClick={clearFilters}>Clear</button>
        )}
      </div>
      <div className="invoiceTableWrapper">
        <table className={className}>
          <thead>
            <tr>
              {COLUMNS.map((column, index) => (
                <FilterableTableHeaderCell
                  key={column.key}
                  column={column}
                  idPrefix="invoice"
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
            {visibleInvoices.length === 0 ? (
              <tr><td colSpan={COLUMNS.length + 1} className="invoiceNoResults">{invoices.length === 0 ? "No invoices found." : "No invoices match these filters."}</td></tr>
            ) : visibleInvoices.map((invoice) => (
              <tr key={invoice.id}>
                {COLUMNS.map((column) => (
                  <td key={column.key}>{formatValue(column.key, invoice[column.key])}</td>
                ))}
                <td>
                  <div className="estimateActionsInner">
                    <button type="button" className="estimateTextAction" disabled={projectOptions.some((project) => project.projectId === invoice.projectId && project.projectStatus === "Complete")} onClick={() => openEditForm(invoice)}>Edit</button>
                    <button type="button" className="estimateDangerAction" disabled={projectOptions.some((project) => project.projectId === invoice.projectId && project.projectStatus === "Complete")} onClick={() => { setDeleteError(null); setDeletingInvoice(invoice); }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isImportOpen && (
        <Modal
          titleId="invoiceImportTitle"
          title={editingInvoiceId == null ? "Import invoice row" : "Edit invoice row"}
          eyebrow="INVOICES"
          onClose={closeImportDialog}
          closeDisabled={isSavingInvoice}
          closeLabel="Close import form"
        >
            <p className="financeImportHint">
              {editingInvoiceId == null
                ? "Fields marked required are needed to create the row. The invoice ID is generated by SQL Server."
                : "Fields marked required are needed to save the row."}
            </p>
            <form onSubmit={submitInvoice}>
              <fieldset className="financeImportGroup">
                <legend>Project assignment</legend>
                <div className="financeImportFields">
                  <label className="financeImportField">
                    Project
                    <select value={invoiceDraft.projectId} onChange={(event) => setInvoiceDraft((current) => ({ ...current, projectId: event.target.value }))}>
                      <option value="">Unassigned</option>
                      {projectOptions.map((project) => <option value={project.projectId} key={project.projectId} disabled={project.projectStatus === "Complete"}>{project.projectName}{project.projectStatus === "Complete" ? " (Complete - read-only)" : ""}</option>)}
                    </select>
                  </label>
                </div>
              </fieldset>
              {INVOICE_FIELD_GROUPS.map((group) => (
                <fieldset className="financeImportGroup" key={group.title}>
                  <legend>{group.title}</legend>
                  <div className="financeImportFields">
                    {group.fields.map((field) => (
                      <label className="financeImportField" key={field.key}>
                        {field.label}{field.required ? " *" : ""}
                        <input
                          type={field.type ?? "text"}
                          value={invoiceDraft[field.key] ?? ""}
                          onChange={(event) => setInvoiceDraft((current) => ({ ...current, [field.key]: event.target.value }))}
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
                <button type="button" className="financeImportCancel" onClick={closeImportDialog} disabled={isSavingInvoice}>Cancel</button>
                <button type="submit" className="financeImportSubmit" disabled={isSavingInvoice}>{isSavingInvoice ? "Saving..." : "Save invoice"}</button>
              </div>
            </form>
        </Modal>
      )}
      {deletingInvoice && (
        <Modal
          titleId="invoiceDeleteTitle"
          title="Delete invoice row"
          eyebrow="INVOICES"
          onClose={closeDeleteDialog}
          closeDisabled={isDeletingInvoice}
          closeLabel="Close delete confirmation"
          className="financeConfirmDialog"
        >
          <p className="financeImportHint">
            Delete invoice <strong>{deletingInvoice.invoiceNo}</strong>? This cannot be undone.
          </p>
          {deleteError && <p className="financeImportError" role="alert">{deleteError}</p>}
          <div className="financeImportActions">
            <button type="button" className="financeImportCancel" onClick={closeDeleteDialog} disabled={isDeletingInvoice}>Cancel</button>
            <button type="button" className="financeImportDanger" onClick={() => void confirmDeleteInvoice()} disabled={isDeletingInvoice}>
              {isDeletingInvoice ? "Deleting..." : "Delete invoice"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
