"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import Link from "next/link";
import type { AllocationBill } from "@/app/lib/project-costs";
import type { Bill } from "@/app/lib/bills";
import type { ProjectOption } from "@/app/lib/projects";
import { useFilterableTable, type TableColumn } from "@/app/lib/use-filterable-table";
import { FilterableTableHeaderCell } from "@/app/components/filterable-table-header-cell";
import Modal from "@/app/components/modal";
import BillSplitToggle from "@/app/components/bill-split-toggle";
import FinanceCollection, { FinanceRecord, FinanceFacts } from "./finance-collection";
import recordStyles from "@/app/components/record-workspace.module.css";
import styles from "./finance-workspace.module.css";

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
  isSplit: false,
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
  key: Exclude<keyof BillDraft, "isSplit">;
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
    isSplit: bill.isSplit,
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

export default function BillsTable({ bills, projectOptions, allocations }: { bills: Bill[]; projectOptions: ProjectOption[]; allocations: AllocationBill[] }) {
  const router = useRouter();
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [billDraft, setBillDraft] = useState<BillDraft>(EMPTY_BILL);
  const [isSavingBill, setIsSavingBill] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [deletingBill, setDeletingBill] = useState<Bill | null>(null);
  const [isDeletingBill, setIsDeletingBill] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedBill = bills.find((bill) => bill.id === selectedId);

  const allocationsByBillId = useMemo(() => {
    const map = new Map<string, AllocationBill>();
    for (const item of allocations) {
      map.set(item.billId, item);
    }
    return map;
  }, [allocations]);

  const table = useFilterableTable(bills, COLUMNS, { searchableValue, compare: compareBills, initialPageSize: 50 });
  const {
    columnFilters,
    setColumnFilters,
    sort,
    toggleSort,
    openFilter,
    setOpenFilter,
    filterControlRoot,
    visibleRows: visibleBills,
    paginatedRows: paginatedBills,
  } = table;

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
      setSelectedId(null);
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

  function billActions(bill: Bill) {
    const isReadOnly = Boolean(allocationsByBillId.get(bill.id)?.readOnly);
    return <>
      <button type="button" className="estimateTextAction" disabled={isReadOnly} onClick={() => openEditForm(bill)}>Edit</button>
      <button type="button" className="estimateDangerAction" disabled={isReadOnly} onClick={() => { setDeleteError(null); setDeletingBill(bill); }}>Delete</button>
      {(bill.projectId !== null || bill.isSplit) && <Link href={bill.projectId !== null ? `/projects/${bill.projectId}?tab=finances` : "/projects"} className="estimateTextAction">Allocate costs</Link>}
    </>;
  }

  function allocationSummary(bill: Bill) {
    const allocation = allocationsByBillId.get(bill.id);
    return allocation ? <FinanceFacts items={[
      { label: "Allocated", value: formatValue("billAmount", String(allocation.allocatedAmount)) },
      { label: "Unallocated", value: allocation.remainingAmount === null ? "Correct bill amount" : formatValue("billAmount", String(allocation.remainingAmount)) },
    ]} /> : null;
  }

  return (
    <section className={styles.workspace} ref={filterControlRoot}>
      {selectedBill ? <FinanceRecord key={selectedBill.id} title={`Bill ${selectedBill.billNo}`} collection="bills" onBack={() => setSelectedId(null)}
        actions={billActions(selectedBill)}
        overview={<>
          <FinanceFacts items={[
            { label: "Company", value: selectedBill.companyName },
            { label: "Project", value: selectedBill.projectId === null ? "Unassigned" : <Link href={`/projects/${selectedBill.projectId}?tab=finances`}>{selectedBill.projectName || "Open project"}</Link> },
            { label: "Amount", value: formatValue("billAmount", selectedBill.billAmount) },
            { label: "Payment", value: selectedBill.billPaidDate ? `Paid ${formatValue("billPaidDate", selectedBill.billPaidDate)}` : "Unpaid" },
            { label: "Due date", value: formatValue("billDueDate", selectedBill.billDueDate) },
          ]} />
          <h3>Project allocation</h3>
          {allocationSummary(selectedBill)}
          <BillSplitToggle billId={selectedBill.id} isSplit={selectedBill.isSplit} disabled={Boolean(allocationsByBillId.get(selectedBill.id)?.readOnly)} />
          {selectedBill.isSplit && <p className={styles.hint}>Only allocated costs count toward each job.</p>}
          {allocationsByBillId.get(selectedBill.id)?.readOnly && <p className={styles.hint}>This bill is connected to a completed project and is read-only.</p>}
        </>}
        details={<FinanceFacts items={[{ label: "ID", value: selectedBill.id }, ...COLUMNS.map((column) => ({ label: column.label, value: formatValue(column.key, selectedBill[column.key]) }))]} />}
      /> : null}
      <div hidden={Boolean(selectedBill)} className={!selectedBill ? styles.workspace : undefined}>
      <FinanceCollection title="Bills" description="Bills at a glance. Open a bill to update payment details, assign its project, or manage split-cost allocations."
        action={<button type="button" className="financeImportButton" onClick={openCreateForm}><Plus size={15} aria-hidden="true" />Import bill</button>}
        columns={COLUMNS} controls={table} count={bills.length} itemLabel="bills"
        cards={paginatedBills.map((bill) => {
          const allocation = allocationsByBillId.get(bill.id);
          return <article className={recordStyles.card} key={bill.id} aria-label={`Bill ${bill.billNo}`}>
            <div className={recordStyles.identity}><h2><button type="button" className={styles.textButton} onClick={() => setSelectedId(bill.id)}>Bill {bill.billNo}</button></h2>
              <p>{bill.companyName || "No company details"}</p><p>{bill.isSplit ? "Split across projects" : bill.projectName || "Unassigned project"}</p>
              {allocation && <span className={recordStyles.reference}>Unallocated: {allocation.remainingAmount === null ? "Correct bill amount" : formatValue("billAmount", String(allocation.remainingAmount))}</span>}
            </div>
            <div className={recordStyles.status}><span className={recordStyles.label}>Payment</span><strong>{bill.billPaidDate ? "Paid" : "Unpaid"}</strong>
              <span className={recordStyles.dates}>Due {formatValue("billDueDate", bill.billDueDate)}</span>
              {allocation?.readOnly && <span className={recordStyles.reference}>Read-only project</span>}</div>
            <div className={recordStyles.value}><span className={recordStyles.label}>Amount</span><strong>{formatValue("billAmount", bill.billAmount)}</strong></div>
            <div className={recordStyles.actions}><button type="button" className={recordStyles.openRecord} onClick={() => setSelectedId(bill.id)} aria-label={`Open bill ${bill.billNo}`}>Open bill</button></div>
          </article>;
        })}>
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
            ) : paginatedBills.map((bill) => {
              const allocation = allocationsByBillId.get(bill.id);
              const isReadOnly = Boolean(allocation?.readOnly);
              return (
                <tr key={bill.id}>
                  {COLUMNS.map((column) => <td key={column.key}>{formatValue(column.key, bill[column.key])}
                    {column.key === "billAmount" && allocation && (
                      <small className="billAllocationBalance">
                        Allocated: {formatValue("billAmount", String(allocation.allocatedAmount))}<br />
                        Unallocated: {allocation.remainingAmount === null ? "Correct bill amount" : formatValue("billAmount", String(allocation.remainingAmount))}
                      </small>
                    )}
                  </td>)}
                  <td>
                    <div className="estimateActionsInner">{billActions(bill)}</div>
                    <BillSplitToggle billId={bill.id} isSplit={bill.isSplit} disabled={isReadOnly} />
                    {bill.isSplit && <small className="billAllocationBalance">Only allocated costs count toward each job.</small>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </FinanceCollection>
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
                    <select disabled={billDraft.isSplit} value={billDraft.projectId} onChange={(event) => setBillDraft((current) => ({ ...current, projectId: event.target.value }))}>
                      <option value="">Unassigned</option>
                      {projectOptions.map((project) => <option value={project.projectId} key={project.projectId} disabled={project.projectStatus === "Complete"}>{project.projectName}{project.projectStatus === "Complete" ? " (Complete - read-only)" : ""}</option>)}
                    </select>
                    {billDraft.isSplit && <small>Split bill: assign its cost rows to jobs in Project Management.</small>}
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
