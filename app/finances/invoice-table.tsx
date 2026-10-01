"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Filter, Plus } from "lucide-react";
import type { FormEvent } from "react";
import type { Invoice } from "@/app/lib/invoices";
import type { ProjectOption } from "@/app/lib/projects";

type Column = {
  key: keyof Invoice;
  label: string;
};

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

type SortState = { key: keyof Invoice; direction: "asc" | "desc" } | null;
type ColumnFilters = Partial<Record<keyof Invoice, string>>;
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

export default function InvoiceTable({ className, invoices, projectOptions }: { className?: string; invoices: Invoice[]; projectOptions: ProjectOption[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});
  const [sort, setSort] = useState<SortState>(null);
  const [openFilter, setOpenFilter] = useState<keyof Invoice | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft>(EMPTY_INVOICE);
  const [isSavingInvoice, setIsSavingInvoice] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const filterControlRoot = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!openFilter) return;
    function dismissFilter(event: PointerEvent) {
      if (event.target instanceof Node && !filterControlRoot.current?.contains(event.target)) {
        setOpenFilter(null);
      }
    }
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenFilter(null);
    }
    document.addEventListener("pointerdown", dismissFilter);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissFilter);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [openFilter]);

  const filteredInvoices = invoices.filter((invoice) => {
    if (search) {
      const matchesSearch = COLUMNS.some((column) =>
        searchableValue(column.key, invoice[column.key]).includes(search.trim().toLocaleLowerCase())
      );
      if (!matchesSearch) return false;
    }
    return COLUMNS.every((column) => {
      const filter = columnFilters[column.key]?.trim().toLocaleLowerCase();
      return !filter || searchableValue(column.key, invoice[column.key]).includes(filter);
    });
  });

  const visibleInvoices = sort
    ? [...filteredInvoices].sort((left, right) => {
        const leftValue = left[sort.key];
        const rightValue = right[sort.key];
        const leftMissing = leftValue == null || leftValue === "";
        const rightMissing = rightValue == null || rightValue === "";
        if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
        const comparison = compareInvoices(left, right, sort.key);
        return sort.direction === "asc" ? comparison : -comparison;
      })
    : filteredInvoices;

  function toggleSort(key: keyof Invoice) {
    setSort((current) => current?.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: "asc" });
  }

  function clearFilters() {
    setSearch("");
    setColumnFilters({});
    setSort(null);
    setOpenFilter(null);
  }

  async function submitInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingInvoice(true);
    setImportError(null);
    try {
      const response = await fetch("/api/finances/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invoiceDraft),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Unable to save invoice");
      setInvoiceDraft(EMPTY_INVOICE);
      setIsImportOpen(false);
      router.refresh();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Unable to save invoice");
    } finally {
      setIsSavingInvoice(false);
    }
  }

  function closeImportDialog() {
    if (isSavingInvoice) return;
    setIsImportOpen(false);
    setImportError(null);
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
        <button type="button" className="financeImportButton" onClick={() => { setImportError(null); setIsImportOpen(true); }}>
          <Plus size={15} aria-hidden="true" />
          Import invoice
        </button>
        <span className="invoiceResultCount" aria-live="polite">
          {visibleInvoices.length} of {invoices.length} invoices
        </span>
        {(search || Object.values(columnFilters).some(Boolean) || sort) && (
          <button type="button" className="invoiceClearButton" onClick={clearFilters}>Clear</button>
        )}
      </div>
      <div className="invoiceTableWrapper">
        <table className={className}>
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th key={column.key} aria-sort={sort?.key === column.key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                  <div className="invoiceHeaderControls">
                    <button type="button" className="invoiceSortButton" onClick={() => toggleSort(column.key)}>
                      {column.label}
                      <span aria-hidden="true">{sort?.key === column.key ? (sort.direction === "asc" ? " ↑" : " ↓") : " ↕"}</span>
                    </button>
                    <div className="invoiceFilterControl">
                      <button
                        type="button"
                        className={`invoiceFilterButton${columnFilters[column.key]?.trim() ? " invoiceFilterButtonActive" : ""}`}
                        aria-label={`Filter ${column.label}`}
                        aria-expanded={openFilter === column.key}
                        aria-controls={`invoice-filter-${column.key}`}
                        title={`Filter ${column.label}`}
                        onClick={() => setOpenFilter((current) => current === column.key ? null : column.key)}
                      >
                        <Filter size={14} aria-hidden="true" />
                      </button>
                      {openFilter === column.key && (
                        <div
                          id={`invoice-filter-${column.key}`}
                          className={`invoiceFilterPopover${COLUMNS.indexOf(column) >= COLUMNS.length - 2 ? " invoiceFilterPopoverRight" : ""}`}
                          onPointerDown={(event) => event.stopPropagation()}
                        >
                          <label>
                            Filter {column.label}
                            <input
                              autoFocus
                              type="search"
                              value={columnFilters[column.key] ?? ""}
                              onChange={(event) => setColumnFilters((current) => ({ ...current, [column.key]: event.target.value }))}
                              placeholder={`Match ${column.label.toLowerCase()}`}
                              className="invoicePopoverInput"
                            />
                          </label>
                          {columnFilters[column.key] && (
                            <button
                              type="button"
                              className="invoicePopoverClear"
                              onClick={() => setColumnFilters((current) => ({ ...current, [column.key]: "" }))}
                            >
                              Clear this filter
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleInvoices.length === 0 ? (
              <tr><td colSpan={COLUMNS.length} className="invoiceNoResults">{invoices.length === 0 ? "No invoices found." : "No invoices match these filters."}</td></tr>
            ) : visibleInvoices.map((invoice) => (
              <tr key={invoice.id}>
                {COLUMNS.map((column) => (
                  <td key={column.key}>{formatValue(column.key, invoice[column.key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isImportOpen && (
        <div className="financeImportBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeImportDialog(); }}>
          <section className="financeImportDialog" role="dialog" aria-modal="true" aria-labelledby="invoiceImportTitle">
            <header className="financeImportDialogHeader">
              <div>
                <p className="financeImportEyebrow">INVOICES</p>
                <h2 id="invoiceImportTitle">Import invoice row</h2>
              </div>
              <button type="button" className="financeImportClose" onClick={closeImportDialog} aria-label="Close import form" disabled={isSavingInvoice}>×</button>
            </header>
            <p className="financeImportHint">Fields marked required are needed to create the row. The invoice ID is generated by SQL Server.</p>
            <form onSubmit={submitInvoice}>
              <fieldset className="financeImportGroup">
                <legend>Project assignment</legend>
                <div className="financeImportFields">
                  <label className="financeImportField">
                    Project
                    <select value={invoiceDraft.projectId} onChange={(event) => setInvoiceDraft((current) => ({ ...current, projectId: event.target.value }))}>
                      <option value="">Unassigned</option>
                      {projectOptions.map((project) => <option value={project.projectId} key={project.projectId}>{project.projectName}</option>)}
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
          </section>
        </div>
      )}
    </section>
  );
}
