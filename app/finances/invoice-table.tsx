"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { FormEvent } from "react";
import type { Invoice, InvoiceProjectOption } from "@/app/lib/invoices";
import { useFilterableTable, type TableColumn } from "@/app/lib/use-filterable-table";
import { FilterableTableHeaderCell } from "@/app/components/filterable-table-header-cell";
import Modal from "@/app/components/modal";
import Link from "next/link";
import { customerLabel, invoiceCustomerSnapshot, type Customer } from "@/app/lib/customer-fields";
import { DocumentNotesFields } from "@/app/components/document-notes";
import FinanceCollection, { FinanceRecord, FinanceFacts } from "./finance-collection";
import recordStyles from "@/app/components/record-workspace.module.css";
import styles from "./finance-workspace.module.css";

type Column = TableColumn<Invoice>;

const COLUMNS: Column[] = [
  { key: "invoiceNo", label: "Invoice No" },
  { key: "projectName", label: "Project" },
  { key: "invoiceDate", label: "Invoice Date" },
  { key: "invoiceDueDate", label: "Due Date" },
  { key: "invoicePaidDate", label: "Paid Date" },
  { key: "lastEmailedAt", label: "Email Status" },
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

type InvoiceDraft = Omit<Invoice, "id" | "organizationId" | "projectId" | "projectName" | "customerId" | "billingManaged"> & { projectId: string; customerId: string };
type InvoiceField = {
  key: Exclude<keyof InvoiceDraft, "projectId" | "customerId">;
  label: string;
  required?: boolean;
  type?: "text" | "date" | "number";
  maxLength?: number;
};

const EMPTY_INVOICE: InvoiceDraft = {
  customerId: "",
  projectId: "",
  invoiceNo: "",
  invoiceDate: "",
  invoiceDueDate: "",
  invoicePaidDate: "",
  invoiceAmount: "",
  internalNotes: "",
  customerNotes: "",
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
    { key: "firstName", label: "First / Contact Name", maxLength: 100 },
    { key: "lastName", label: "Last Name", maxLength: 100 },
    { key: "companyName", label: "Company Name", maxLength: 150 },
  ] },
  { title: "Billing Address", fields: [
    { key: "billingAddressLine1", label: "Address Line 1", maxLength: 200 },
    { key: "billingAddressLine2", label: "Address Line 2", maxLength: 200 },
    { key: "billingAddressCity", label: "City", maxLength: 100 },
    { key: "billingAddressState", label: "State", maxLength: 100 },
    { key: "billingAddressZip", label: "ZIP", maxLength: 20 },
  ] },
  { title: "Shipping Address", fields: [
    { key: "shippingAddressLine1", label: "Address Line 1", maxLength: 200 },
    { key: "shippingAddressLine2", label: "Address Line 2", maxLength: 200 },
    { key: "shippingAddressCity", label: "City", maxLength: 100 },
    { key: "shippingAddressState", label: "State", maxLength: 100 },
    { key: "shippingAddressZip", label: "ZIP", maxLength: 20 },
  ] },
];

function parseAmount(value: unknown) {
  const amountText = String(value ?? "").replace(/[^0-9.-]/g, "");
  return amountText ? Number(amountText) : Number.NaN;
}

function formatValue(key: keyof Invoice, value: Invoice[keyof Invoice]) {
  if (key === "projectName" && (value == null || value === "")) return "Unassigned";
  if (key === "invoicePaidDate" && (value == null || value === "")) return "Unpaid";
  if (key === "lastEmailedAt") {
    if (value == null || value === "") return "Unsent";
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value).trim() : `Sent ${date.toLocaleDateString()}`;
  }
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
  if (key === "lastEmailedAt") {
    return value ? `sent emailed ${value}` : "unsent not emailed";
  }
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
  if (key === "invoiceDate" || key === "invoiceDueDate" || key === "invoicePaidDate" || key === "lastEmailedAt") {
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
    customerId: invoice.customerId == null ? "" : String(invoice.customerId),
    projectId: invoice.projectId == null ? "" : String(invoice.projectId),
    invoiceNo: invoice.invoiceNo,
    invoiceDate: invoice.invoiceDate,
    invoiceDueDate: invoice.invoiceDueDate,
    invoicePaidDate: invoice.invoicePaidDate ?? "",
    invoiceAmount: invoice.invoiceAmount ?? "",
    internalNotes: invoice.internalNotes ?? "",
    customerNotes: invoice.customerNotes ?? "",
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

export default function InvoiceTable({ className, invoices, projectOptions, customers }: { className?: string; invoices: Invoice[]; projectOptions: InvoiceProjectOption[]; customers: Customer[] }) {
  const router = useRouter();
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<number | null>(null);
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft>(EMPTY_INVOICE);
  const [isSavingInvoice, setIsSavingInvoice] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [deletingInvoice, setDeletingInvoice] = useState<Invoice | null>(null);
  const [isDeletingInvoice, setIsDeletingInvoice] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [emailingInvoice, setEmailingInvoice] = useState<Invoice | null>(null);
  const [emailOverride, setEmailOverride] = useState("");
  const [emailSubjectOverride, setEmailSubjectOverride] = useState("");
  const [emailNote, setEmailNote] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailStatusMessage, setEmailStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedId);
  const selectedCustomer = customers.find((customer) => String(customer.customerId) === invoiceDraft.customerId);
  const originalCustomerId = invoices.find((invoice) => invoice.id === editingInvoiceId)?.customerId;
  const editingManagedInvoice = invoices.find((invoice) => invoice.id === editingInvoiceId)?.billingManaged ?? false;
  const table = useFilterableTable(invoices, COLUMNS, { searchableValue, compare: compareInvoices, initialPageSize: 50 });
  const {
    columnFilters,
    setColumnFilters,
    sort,
    toggleSort,
    openFilter,
    setOpenFilter,
    filterControlRoot,
    paginatedRows: paginatedInvoices,
    visibleRows: visibleInvoices,
  } = table;

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
    fetch("/api/finances/invoices/next-number")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.nextInvoiceNumber) {
          setInvoiceDraft((curr) => ({
            ...curr,
            invoiceNo: curr.invoiceNo || data.nextInvoiceNumber,
          }));
        }
      })
      .catch(() => {});
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
      setSelectedId(null);
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

  function openEmailDialog(invoice: Invoice) {
    const customer = customers.find((c) => c.customerId === invoice.customerId);
    setEmailOverride(customer?.email || "");
    setEmailSubjectOverride("");
    setEmailNote("");
    setEmailStatusMessage(null);
    setEmailingInvoice(invoice);
  }

  async function sendEmailAction() {
    if (!emailingInvoice) return;
    setIsSendingEmail(true);
    setEmailStatusMessage(null);
    try {
      const response = await fetch(`/api/finances/invoices/${emailingInvoice.id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmail: emailOverride,
          subjectOverride: emailSubjectOverride.trim() || undefined,
          customNote: emailNote.trim() || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to send invoice email");
      const sim = data.simulated ? " (Simulation mode - SMTP not yet configured in .env.local)" : "";
      setEmailStatusMessage({
        text: `Invoice sent to ${data.recipientEmail}!${sim}`,
        isError: false,
      });
      setEmailingInvoice({ ...emailingInvoice, lastEmailedAt: new Date().toISOString(), lastEmailedTo: data.recipientEmail });
      router.refresh();
    } catch (err) {
      setEmailStatusMessage({
        text: err instanceof Error ? err.message : "Unable to send invoice email",
        isError: true,
      });
    } finally {
      setIsSendingEmail(false);
    }
  }

  function invoiceActions(invoice: Invoice) {
    const completed = projectOptions.some((project) => project.projectId === invoice.projectId && project.projectStatus === "Complete");
    return <>
      <button type="button" className="estimateTextAction" onClick={() => openEmailDialog(invoice)}>Email</button>
      <button type="button" className="estimateTextAction" disabled={!invoice.billingManaged && completed} onClick={() => openEditForm(invoice)}>Edit</button>
      <button type="button" className="estimateDangerAction" disabled={invoice.billingManaged || completed} onClick={() => { setDeleteError(null); setDeletingInvoice(invoice); }}>Delete</button>
    </>;
  }

  return (
    <section className={styles.workspace} ref={filterControlRoot}>
      {selectedInvoice ? <FinanceRecord key={selectedInvoice.id} title={`Invoice ${selectedInvoice.invoiceNo}`} collection="invoices" onBack={() => setSelectedId(null)}
        actions={invoiceActions(selectedInvoice)}
        overview={<>
          <FinanceFacts items={[
            { label: "Customer", value: [selectedInvoice.firstName, selectedInvoice.lastName, selectedInvoice.companyName].filter(Boolean).join(" ") },
            { label: "Project", value: selectedInvoice.projectId === null ? "Unassigned" : <Link href={`/projects/${selectedInvoice.projectId}?tab=finances`}>{selectedInvoice.projectName || "Open project"}</Link> },
            { label: "Amount", value: formatValue("invoiceAmount", selectedInvoice.invoiceAmount) },
            { label: "Payment", value: selectedInvoice.invoicePaidDate ? `Paid ${formatValue("invoicePaidDate", selectedInvoice.invoicePaidDate)}` : "Unpaid" },
            { label: "Due date", value: formatValue("invoiceDueDate", selectedInvoice.invoiceDueDate) },
            { label: "Email status", value: formatValue("lastEmailedAt", selectedInvoice.lastEmailedAt) },
          ]} />
          {selectedInvoice.billingManaged && <p className="financeImportHint">Issued project allocations are protected. Edit allows notes, contact/address details, and paid date updates; deletion is unavailable.</p>}
          {!selectedInvoice.billingManaged && projectOptions.some((project) => project.projectId === selectedInvoice.projectId && project.projectStatus === "Complete") && <p className="financeImportHint">This completed project is read-only. Editing and deletion are unavailable.</p>}
        </>}
        details={<FinanceFacts items={[
          ...COLUMNS.map((column) => ({ label: column.label, value: formatValue(column.key, selectedInvoice[column.key]) })),
          { label: "Last emailed to", value: selectedInvoice.lastEmailedTo },
          { label: "Internal notes", value: selectedInvoice.internalNotes },
          { label: "Customer notes", value: selectedInvoice.customerNotes },
        ]} />}
      /> : null}
      <div hidden={Boolean(selectedInvoice)} className={!selectedInvoice ? styles.workspace : undefined}>
      <FinanceCollection title="Invoices" description="Invoices at a glance. Open an invoice for payment dates, customer details, email, and editing."
        action={<button type="button" className="financeImportButton" onClick={openCreateForm}><Plus size={15} aria-hidden="true" />Import invoice</button>}
        columns={COLUMNS} controls={table} count={invoices.length} itemLabel="invoices"
        cards={paginatedInvoices.map((invoice) => <article className={recordStyles.card} key={invoice.id} aria-label={`Invoice ${invoice.invoiceNo}`}>
          <div className={recordStyles.identity}><h2><button type="button" className={styles.textButton} onClick={() => setSelectedId(invoice.id)}>Invoice {invoice.invoiceNo}</button></h2>
            <p>{[invoice.firstName, invoice.lastName, invoice.companyName].filter(Boolean).join(" ") || "No customer details"}</p>
            <p>{invoice.projectName || "Unassigned project"}</p></div>
          <div className={recordStyles.status}><span className={recordStyles.label}>Payment</span><strong>{invoice.invoicePaidDate ? "Paid" : "Unpaid"}</strong>
            <span className={recordStyles.dates}>Due {formatValue("invoiceDueDate", invoice.invoiceDueDate) || "not set"}</span>
            <span className={recordStyles.reference}>{formatValue("lastEmailedAt", invoice.lastEmailedAt)}</span></div>
          <div className={recordStyles.value}><span className={recordStyles.label}>Amount</span><strong>{formatValue("invoiceAmount", invoice.invoiceAmount) || "Not provided"}</strong></div>
          <div className={recordStyles.actions}><button type="button" className={recordStyles.openRecord} onClick={() => setSelectedId(invoice.id)} aria-label={`Open invoice ${invoice.invoiceNo}`}>Open invoice</button></div>
        </article>)}>
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
            ) : paginatedInvoices.map((invoice) => (
              <tr key={invoice.id}>
                {COLUMNS.map((column) => (
                  <td key={column.key}>
                    {column.key === "lastEmailedAt" ? (
                      invoice.lastEmailedAt ? (
                        <span
                          className="invoiceEmailedBadge"
                          title={`Last sent to ${invoice.lastEmailedTo || "customer"} on ${new Date(invoice.lastEmailedAt).toLocaleString()}`}
                        >
                          ✓ Sent {new Date(invoice.lastEmailedAt).toLocaleDateString()}
                        </span>
                      ) : (
                        <span style={{ color: "var(--muted, #6c757d)", fontSize: "0.82rem" }}>Not sent</span>
                      )
                    ) : (
                      formatValue(column.key, invoice[column.key])
                    )}
                  </td>
                ))}
                <td>
                  <div className="estimateActionsInner">{invoiceActions(invoice)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </FinanceCollection>
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
              {editingManagedInvoice && <p className="financeImportHint">This invoice has issued project allocations. Its amount, project/customer links, number, and dates are locked. You can update notes, contact/address details and its paid date. Any original advance billing approval reason remains unchanged in Project Management invoice history.</p>}
              <fieldset className="financeImportGroup">
                <legend>Saved customer</legend>
                <label className="financeImportField">
                  Customer
                  <select value={invoiceDraft.customerId} disabled={isSavingInvoice || editingManagedInvoice} onChange={(event) => {
                    const customerId = event.target.value;
                    const customer = customers.find((item) => String(item.customerId) === customerId);
                    setInvoiceDraft((current) => ({ ...current, ...(customer ? invoiceCustomerSnapshot(customer) : {}), customerId }));
                  }}>
                    <option value="">No saved customer / manual details</option>
                    {customers.filter((customer) => customer.isActive || customer.customerId === originalCustomerId).map((customer) =>
                      <option key={customer.customerId} value={customer.customerId} disabled={!customer.isActive && String(customer.customerId) !== invoiceDraft.customerId}>
                        {customerLabel(customer)}{customer.isActive ? "" : " (Archived)"}
                      </option>)}
                  </select>
                </label>
                <p className="financeImportHint">Selecting a customer copies their details below. These are saved with this invoice and do not change when the customer is edited. Unlinking keeps the copied details. <Link href="/finances/customers">Manage customers</Link></p>
                {selectedCustomer && <button type="button" className="estimateTextAction" disabled={isSavingInvoice}
                  onClick={() => setInvoiceDraft((current) => ({ ...current, ...invoiceCustomerSnapshot(selectedCustomer) }))}>Load current customer details</button>}
              </fieldset>
              <fieldset className="financeImportGroup">
                <legend>Project assignment</legend>
                <div className="financeImportFields">
                  <label className="financeImportField">
                    Project
                    <select value={invoiceDraft.projectId} disabled={isSavingInvoice || editingManagedInvoice} onChange={(event) => {
                      const projectId = event.target.value;
                      const project = projectOptions.find((item) => String(item.projectId) === projectId);
                      const customer = customers.find((item) => item.customerId === project?.customerId && item.isActive);
                      setInvoiceDraft((current) => ({
                        ...current, projectId,
                        ...(editingInvoiceId === null && current.customerId === "" && customer
                          ? { ...invoiceCustomerSnapshot(customer), customerId: String(customer.customerId) } : {}),
                      }));
                    }}>
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
                          disabled={isSavingInvoice || editingManagedInvoice && ["invoiceNo", "invoiceDate", "invoiceDueDate", "invoiceAmount"].includes(field.key)}
                        />
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <fieldset className="financeImportGroup">
                <legend>Invoice notes</legend>
                <DocumentNotesFields internalNotes={invoiceDraft.internalNotes} customerNotes={invoiceDraft.customerNotes} disabled={isSavingInvoice}
                  onInternalChange={(value) => setInvoiceDraft((current) => ({ ...current, internalNotes: value }))}
                  onCustomerChange={(value) => setInvoiceDraft((current) => ({ ...current, customerNotes: value }))}
                  internalHint="Editing these notes does not change the original advance billing approval."
                  customerHint="Included even when scope amounts are hidden." />
              </fieldset>
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
      {emailingInvoice && (
        <Modal
          titleId="invoiceEmailTitle"
          title={`Email Invoice ${emailingInvoice.invoiceNo}`}
          eyebrow="INVOICES"
          onClose={() => { if (!isSendingEmail) setEmailingInvoice(null); }}
          closeDisabled={isSendingEmail}
          closeLabel="Close email dialog"
        >
          <p className="financeImportHint">
            Send Invoice <strong>{emailingInvoice.invoiceNo}</strong> as a PDF attachment to the customer.
            {emailingInvoice.lastEmailedAt && (
              <span style={{ display: "block", marginTop: "4px", color: "var(--color-success, #28a745)" }}>
                Previously sent on {new Date(emailingInvoice.lastEmailedAt).toLocaleDateString()} to {emailingInvoice.lastEmailedTo || "customer"}.
              </span>
            )}
          </p>
          <div style={{ display: "grid", gap: "12px", margin: "16px 0" }}>
            <label className="financeImportField">
              Recipient Email Address *
              <input
                type="email"
                value={emailOverride}
                onChange={(e) => setEmailOverride(e.target.value)}
                placeholder="customer@example.com"
                disabled={isSendingEmail}
                required
              />
            </label>
            <label className="financeImportField">
              Subject Override (optional)
              <input
                type="text"
                value={emailSubjectOverride}
                onChange={(e) => setEmailSubjectOverride(e.target.value)}
                placeholder="Leave blank to use organization template"
                disabled={isSendingEmail}
              />
            </label>
            <label className="financeImportField">
              Personal Note / Message (optional)
              <textarea
                value={emailNote}
                onChange={(e) => setEmailNote(e.target.value)}
                placeholder="Add an optional personal message to include in the email body..."
                disabled={isSendingEmail}
                rows={3}
                style={{ resize: "vertical", fontFamily: "inherit", fontSize: "0.9rem" }}
              />
            </label>
          </div>
          {emailStatusMessage && (
            <p className={emailStatusMessage.isError ? "financeImportError" : "billingNotice"} role="alert">
              {emailStatusMessage.text}
            </p>
          )}
          <div className="financeImportActions">
            <button
              type="button"
              className="financeImportCancel"
              onClick={() => setEmailingInvoice(null)}
              disabled={isSendingEmail}
            >
              {emailStatusMessage?.isError === false ? "Done" : "Cancel"}
            </button>
            <button
              type="button"
              className="financeImportSubmit"
              onClick={() => void sendEmailAction()}
              disabled={isSendingEmail || !emailOverride.trim()}
            >
              {isSendingEmail ? "Sending..." : "Send Email"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
