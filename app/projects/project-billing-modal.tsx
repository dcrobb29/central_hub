"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Modal from "@/app/components/modal";
import type { ProjectBilling } from "@/app/lib/project-billing";
import {
  BILLING_METHODS, SCOPE_STATUSES, BillingError, billingCents, billableRemaining, calculateBillingAllocations,
  type BillingMethod, type BillingSelection, type BillingUnit, type ScopeStatus,
} from "@/app/lib/project-billing-pricing";
import { DocumentNotes, DocumentNotesFields } from "@/app/components/document-notes";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const methodLabel: Record<BillingMethod, string> = { Amount: "Dollar amount", Percentage: "% of contract", Scopes: "Scopes / occurrence" };
type Tab = "completion" | "invoice" | "history";
type SelectionDraft = { unitId: number; scopeId: number | null; kind: BillingSelection["kind"]; value: string };
function selectionKey(unitId: number, scopeId: number | null) { return `${unitId}:${scopeId ?? "parent"}`; }
function asSelections(drafts: Record<string, SelectionDraft>): BillingSelection[] {
  return Object.values(drafts).map((item) => ({ ...item, value: item.kind === "Full" ? null : Number(item.value) }));
}
function defaults(data: ProjectBilling, method: BillingMethod): Record<string, SelectionDraft> {
  const selections: Record<string, SelectionDraft> = {};
  for (const unit of data.units.filter((unit) => !unit.skipped)) {
    const completeScopes = unit.scopes.filter((scope) => scope.status === "Complete" && scope.contractValue > scope.billed);
    if (method === "Scopes") {
      for (const scope of completeScopes) selections[selectionKey(unit.unitId, scope.scopeId)] =
        { unitId: unit.unitId, scopeId: scope.scopeId, kind: "Full", value: "" };
    } else {
      const amount = completeScopes.reduce((sum, scope) => sum + billingCents(scope.contractValue) - billingCents(scope.billed), 0) / 100;
      if (amount) selections[selectionKey(unit.unitId, null)] = {
        unitId: unit.unitId, scopeId: null, kind: method === "Amount" ? "Amount" : "Percentage",
        value: method === "Amount" ? amount.toFixed(2) : String(Math.floor(amount / unit.contractValue * 1_000_000) / 10_000),
      };
    }
  }
  return selections;
}

export default function ProjectBillingModal({ projectId, projectName, initialTab, onClose }: {
  projectId: number; projectName: string; initialTab: Tab; onClose: () => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<ProjectBilling | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [method, setMethod] = useState<BillingMethod>("Scopes");
  const [drafts, setDrafts] = useState<Record<string, SelectionDraft>>({});
  const [existingInvoiceId, setExistingInvoiceId] = useState<number | null>(null);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  });
  const [dueDate, setDueDate] = useState("");
  const [showScopes, setShowScopes] = useState(true);
  const [includeIncompleteWork, setIncludeIncompleteWork] = useState(false);
  const [internalNotes, setInternalNotes] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [busySendingInvoiceId, setBusySendingInvoiceId] = useState<number | null>(null);

  useEffect(() => {
    if (tab === "invoice" && existingInvoiceId === null && !invoiceNo.trim()) {
      let isSubscribed = true;
      fetch("/api/finances/invoices/next-number")
        .then((res) => (res.ok ? res.json() : null))
        .then((body) => {
          if (isSubscribed && body?.nextInvoiceNumber) {
            setInvoiceNo((curr) => curr.trim() || body.nextInvoiceNumber);
          }
        })
        .catch(() => {});
      return () => {
        isSubscribed = false;
      };
    }
  }, [tab, existingInvoiceId, invoiceNo]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/projects/billing?projectId=${projectId}`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load project billing");
        if (controller.signal.aborted) return;
        const state: ProjectBilling = result;
        const selectedMethod = state.method ?? "Scopes";
        setData(state);
        setMethod(selectedMethod);
        setDrafts(defaults(state, selectedMethod));
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "Unable to load project billing");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [projectId]);

  async function reload() {
    const response = await fetch(`/api/projects/billing?projectId=${projectId}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Unable to refresh billing. Reload before issuing another invoice.");
    const state: ProjectBilling = result;
    setData(state);
    const nextMethod = state.method ?? method;
    setMethod(nextMethod);
    setDrafts(defaults(state, nextMethod));
    setRequestId(null);
    return state;
  }
  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/projects/billing", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, ...body }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Unable to update billing");
    return result;
  }
  async function completion(unitId: number, scopeId: number | null, status: ScopeStatus) {
    setBusy(true); setError(null); setNotice(null);
    try {
      await post({ action: "completion", unitId, scopeId, status });
      await reload();
      router.refresh();
    } catch (updateError) { setError(updateError instanceof Error ? updateError.message : "Unable to update completion"); }
    finally { setBusy(false); }
  }
  function chooseMethod(value: BillingMethod) {
    setMethod(value);
    if (data) setDrafts(existingInvoiceId ? {} : defaults(data, value));
    setRequestId(null);
  }
  function select(unit: BillingUnit, scopeId: number | null, checked: boolean) {
    const key = selectionKey(unit.unitId, scopeId);
    setDrafts((current) => {
      const next = { ...current };
      if (!checked) { delete next[key]; return next; }
      if (scopeId === null) {
        for (const item of Object.values(next)) if (item.unitId === unit.unitId) delete next[selectionKey(item.unitId, item.scopeId)];
      } else delete next[selectionKey(unit.unitId, null)];
      const kind = existingInvoiceId || method === "Amount" ? "Amount" : method === "Percentage" ? "Percentage" : "Full";
      const scope = unit.scopes.find((scope) => scope.scopeId === scopeId);
      const original = scope ? scope.contractValue : unit.contractValue;
      const remaining = billableRemaining(unit, scopeId, includeIncompleteWork || existingInvoiceId !== null);
      next[key] = { unitId: unit.unitId, scopeId, kind,
        value: kind === "Amount" ? remaining.toFixed(2) : kind === "Percentage" ? String(Math.floor(remaining / original * 1_000_000) / 10_000) : "" };
      return next;
    });
    setRequestId(null); setNotice(null);
  }
  function changeDraft(key: string, update: Partial<SelectionDraft>) {
    setDrafts((current) => ({ ...current, [key]: { ...current[key], ...update } }));
    setRequestId(null);
  }
  let total = 0;
  let advanceTotal = 0;
  let calculationError: string | null = null;
  if (data && Object.keys(drafts).length) {
    try {
      const allocations = calculateBillingAllocations(data.units, asSelections(drafts), method, existingInvoiceId !== null, includeIncompleteWork);
      total = allocations.reduce((sum, allocation) => sum + billingCents(allocation.amount), 0) / 100;
      if (existingInvoiceId === null) advanceTotal = allocations.filter((allocation) =>
        data.units.find((unit) => unit.unitId === allocation.unitId)?.scopes.find((scope) => scope.scopeId === allocation.scopeId)?.status !== "Complete")
        .reduce((sum, allocation) => sum + billingCents(allocation.amount), 0) / 100;
    }
    catch (calculation) { calculationError = calculation instanceof BillingError ? calculation.message : "Invalid invoice selection"; }
  }
  const legacy = data?.invoices.filter((invoice) => !invoice.managed) ?? [];
  const target = legacy.find((invoice) => invoice.invoiceId === existingInvoiceId);
  const canIssue = data && !calculationError && total > 0 && (existingInvoiceId !== null
    ? target?.amount != null && target.amount > 0 && billingCents(target.amount) === billingCents(total)
    : !legacy.length && data.project.customerId !== null && Boolean(invoiceNo.trim()) && Boolean(invoiceDate) && Boolean(dueDate) &&
      (!advanceTotal || Boolean(internalNotes.trim())));

  async function issue() {
    setBusy(true); setError(null); setNotice(null);
    const id = requestId ?? crypto.randomUUID();
    setRequestId(id);
    try {
      const result = await post({
        action: "invoice", requestId: id, method, showScopes, selections: asSelections(drafts),
        existingInvoiceId, invoiceNo, invoiceDate, dueDate, includeIncompleteWork, internalNotes, customerNotes,
      });
      setNotice(existingInvoiceId === null ? `Invoice ${invoiceNo} created in Finance.` : "Existing invoice allocated. No new Finance invoice was created.");
      setInvoiceNo(""); setExistingInvoiceId(null);
      setIncludeIncompleteWork(false); setInternalNotes(""); setCustomerNotes("");
      await reload();
      router.refresh();
      setTab("history");
      void result;
    } catch (issueError) { setError(issueError instanceof Error ? issueError.message : "Unable to issue invoice"); }
    finally { setBusy(false); }
  }

  async function sendInvoiceEmail(invoiceId: number, invoiceNumber: string) {
    setBusySendingInvoiceId(invoiceId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/finances/invoices/${invoiceId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to dispatch email");
      const simMsg = data.simulated ? " (Simulated - configure SMTP in .env.local to send live)" : "";
      setNotice(`Invoice ${invoiceNumber} successfully emailed to ${data.recipientEmail}${simMsg}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send invoice email");
    } finally {
      setBusySendingInvoiceId(null);
    }
  }
  function inputFor(unit: BillingUnit, scopeId: number | null, label: string) {
    const key = selectionKey(unit.unitId, scopeId);
    const item = drafts[key];
    if (!item) return null;
    return <span className="billingSelectionInput">
      {method === "Scopes" && existingInvoiceId === null && <select aria-label={`Billing type for ${label}`} disabled={busy} value={item.kind}
        onChange={(event) => changeDraft(key, { kind: event.target.value as SelectionDraft["kind"], value: event.target.value === "Percentage" ? "100" : "" })}>
        <option value="Full">Full remaining balance</option><option value="Percentage">Percentage of original</option>
      </select>}
      {item.kind !== "Full" && <label>{item.kind === "Amount" ? "$" : "%"}
        <input aria-label={`${item.kind} for ${label}`} type="number" min="0" max={item.kind === "Percentage" ? 100 : undefined}
          step={item.kind === "Percentage" ? "0.0001" : "0.01"} value={item.value} disabled={busy}
          onChange={(event) => changeDraft(key, { value: event.target.value })} />
      </label>}
    </span>;
  }
  return <Modal titleId="projectBillingTitle" title={projectName} eyebrow="COMPLETION & BILLING" className="projectBillingModal"
    closeDisabled={busy} onClose={() => { if (!busy) onClose(); }}>
    <div className="fieldSegmentedToggle billingTabs" role="tablist" aria-label="Project billing views">
      {(["completion", "invoice", "history"] as const).map((value) => <button type="button" key={value} role="tab" aria-selected={tab === value}
        disabled={busy} className={tab === value ? "fieldSegmentedToggleActive" : ""} onClick={() => setTab(value)}>
        {value === "completion" ? "Completion" : value === "invoice" ? "Invoice" : "Invoice history"}
      </button>)}
    </div>
    {loading && <p role="status">Loading scopes and billing balances...</p>}
    {error && <p className="financeImportError" role="alert">{error}</p>}
    {notice && <p className="billingNotice" role="status">{notice}</p>}
    {data && <>
      {data.project.engagementType === "Service" && <p className="financeImportHint">Each dated occurrence has its own contract and billing balance. Completing one does not complete this recurring agreement. Scheduled dates may move without losing billing history.</p>}
      {tab === "completion" && <>
        <p className="financeImportHint">Update scopes independently. Completing the job or occurrence row completes its scopes; changing scopes never automatically completes its parent. One-time job “In Progress” corresponds to its Active status. Corrections do not alter issued invoices.</p>
        <div className="billingTableWrap"><table className="invoiceTable billingTable">
          <thead><tr><th>Job / occurrence / scope</th><th>Completion</th><th>Contract</th><th>Billed</th><th>Unbilled</th></tr></thead>
          <tbody>{data.units.map((unit) => <UnitRows key={unit.unitId} unit={unit} projectName={projectName} render={(scope, label) => <select
            aria-label={`Completion for ${label}`} value={scope ? scope.status : unit.status} disabled={busy || unit.skipped}
            onChange={(event) => void completion(unit.unitId, scope?.scopeId ?? null, event.target.value as ScopeStatus)}>
            {SCOPE_STATUSES.map((status) => <option key={status} disabled={!scope && data.project.engagementType === "Project" && data.project.projectStatus === "Complete" && status === "Upcoming"}>{status}</option>)}
          </select>} />)}</tbody>
        </table></div>
      </>}
      {tab === "invoice" && <>
        <div className="billingInvoiceOptions">
          <label className="financeImportField">Billing method{data.method ? " (locked)" : " (locks when the first invoice is issued)"}
            <select value={method} disabled={busy || data.method !== null} onChange={(event) => chooseMethod(event.target.value as BillingMethod)}>
              {BILLING_METHODS.map((value) => <option key={value} value={value}>{methodLabel[value]}</option>)}
            </select>
          </label>
          {legacy.length > 0 && <label className="financeImportField">Allocate existing invoice first
            <select value={existingInvoiceId ?? ""} disabled={busy} onChange={(event) => {
              setExistingInvoiceId(event.target.value ? Number(event.target.value) : null); setDrafts({}); setRequestId(null);
            }}><option value="">Choose an unallocated Finance invoice</option>
              {legacy.map((invoice) => <option key={invoice.invoiceId} value={invoice.invoiceId}>{invoice.invoiceNo} - {invoice.amount === null ? "Invalid amount: correct in Finance" : money.format(invoice.amount)}</option>)}
            </select>
          </label>}
        </div>
        {legacy.length > 0 && <p className="financeImportError">There are existing Finance invoices without scope/occurrence allocations. Assign their full amounts before issuing new invoices to avoid billing the same work twice.</p>}
        {existingInvoiceId === null ? <>
          {!data.project.customerId && <p className="financeImportError">Choose a billing customer in the project workspace before issuing an invoice. <Link href={`/projects/${projectId}`}>Choose project customer</Link></p>}
          <div className="financeImportFields billingInvoiceOptions">
            <label className="financeImportField">Invoice number *<input value={invoiceNo} maxLength={10} disabled={busy} onChange={(event) => { setInvoiceNo(event.target.value); setRequestId(null); }} /></label>
            <label className="financeImportField">Invoice date *<input type="date" value={invoiceDate} disabled={busy} onChange={(event) => { setInvoiceDate(event.target.value); setRequestId(null); }} /></label>
            <label className="financeImportField">Due date *<input type="date" value={dueDate} min={invoiceDate} disabled={busy} onChange={(event) => { setDueDate(event.target.value); setRequestId(null); }} /></label>
          </div>
        </> : <p className="financeImportHint">Allocate exactly {target?.amount == null ? "the existing invoice amount" : money.format(target.amount)} using dollar amounts below. The existing invoice number, dates, and amount are preserved.</p>}
        {existingInvoiceId === null && <>
          <label className="customerArchivedToggle"><input type="checkbox" checked={includeIncompleteWork} disabled={busy}
            onChange={(event) => {
              setIncludeIncompleteWork(event.target.checked);
              setDrafts(defaults(data, method)); setRequestId(null); setNotice(null);
            }} />Include incomplete work (manager advance billing override)</label>
          <p className="financeImportHint">This approval affects billing only, never actual completion. Work billed in advance consumes its remaining balance and cannot be billed again when completed. Toggling resets selections to completed work.</p>
          <DocumentNotesFields internalNotes={internalNotes} customerNotes={customerNotes} disabled={busy} internalRequired={advanceTotal > 0}
            onInternalChange={(value) => { setInternalNotes(value); setRequestId(null); }}
            onCustomerChange={(value) => { setCustomerNotes(value); setRequestId(null); }}
            internalHint="For incomplete work, enter the advance billing reason here. It is preserved in internal approval history."
            customerHint="Included even when scope amounts are hidden." />
          {advanceTotal > 0 && <p className="financeImportHint">Billing {money.format(advanceTotal)} ahead of recorded completion. An internal reason is required.</p>}
        </>}
        <label className="customerArchivedToggle"><input type="checkbox" checked={showScopes} disabled={busy} onChange={(event) => { setShowScopes(event.target.checked); setRequestId(null); }} />Show scope amounts on the invoice; otherwise show only the final total</label>
        <p className="financeImportHint">Completed work with a remaining balance is preselected. Without an override, a parent selection bills only completed scopes. With an override it may include incomplete scopes. Percentages use the current approved contract/scope value (not the remaining balance) and cannot exceed eligible remaining work.</p>
        <div className="billingTableWrap"><table className="invoiceTable billingTable">
          <thead><tr><th>Select job / occurrence / scope</th><th>Status</th><th>Contract</th><th>Billed</th><th>Unbilled</th></tr></thead>
          <tbody>{data.units.map((unit) => <UnitRows key={unit.unitId} unit={unit} projectName={projectName} selection={(scope, label) => {
            const scopeId = scope?.scopeId ?? null;
            const allowed = !scope || method === "Scopes" || existingInvoiceId !== null;
            const remaining = billableRemaining(unit, scopeId, includeIncompleteWork || existingInvoiceId !== null);
            return <>
              <input type="checkbox" aria-label={`Invoice ${label}`} disabled={busy || unit.skipped || !allowed || remaining <= 0}
                checked={Boolean(drafts[selectionKey(unit.unitId, scopeId)])} onChange={(event) => select(unit, scopeId, event.target.checked)} />
              {inputFor(unit, scopeId, label)}
            </>;
          }} render={(scope) => scope?.status ?? unit.status} />)}</tbody>
        </table></div>
        {!data.units.length && <p>No occurrences are available. Set the recurring agreement to Active and confirm its schedule before invoicing.</p>}
        {calculationError && <p className="financeImportError" role="alert">{calculationError}</p>}
        <div className="financeImportActions">
          <strong className="billingInvoiceTotal">This invoice: {money.format(total)}</strong>
          <button type="button" className="financeImportCancel" disabled={busy} onClick={() => { setDrafts({}); setRequestId(null); }}>Clear selections</button>
          <button type="button" className="financeImportSubmit" disabled={busy || !canIssue} onClick={() => void issue()}>
            {busy ? "Saving..." : existingInvoiceId === null ? "Issue invoice" : "Allocate existing invoice"}
          </button>
        </div>
      </>}
      {tab === "history" && <>
        <p className="financeImportHint">Issued amounts remain part of billing history regardless of paid status. <Link href="/finances/invoices">Open Finance invoices</Link></p>
        {data.invoices.length === 0 && <p>No invoices have been issued for this project.</p>}
        {data.invoices.map((invoice) => <details key={invoice.invoiceId} className="billingHistoryItem">
          <summary><strong>{invoice.invoiceNo}</strong><span>{invoice.invoiceDate}</span><strong>{invoice.amount === null ? "Invalid amount" : money.format(invoice.amount)}</strong><span>{invoice.managed ? "Allocated" : "Needs allocation"}</span></summary>
          <p>Due {invoice.dueDate}. Customer presentation: {invoice.showScopes ? "scope amounts" : "final total only"}.</p>
          {invoice.includesIncompleteWork && <div className="internalNotes"><strong>Original advance billing approval (internal)</strong><p>{invoice.overrideReason}</p></div>}
          <DocumentNotes internalNotes={invoice.internalNotes === invoice.overrideReason ? null : invoice.internalNotes} customerNotes={invoice.customerNotes} />
          {invoice.managed && (
            <div className="billingInvoiceActionsRow" style={{ marginTop: 8, display: "flex", gap: 12, alignItems: "center" }}>
              <a className="estimateTextAction" href={`/api/projects/billing/invoices/${invoice.invoiceId}/pdf`} target="_blank" rel="noopener noreferrer">Open invoice PDF</a>
              <button
                type="button"
                className="estimateTextAction"
                disabled={busySendingInvoiceId === invoice.invoiceId}
                onClick={() => void sendInvoiceEmail(invoice.invoiceId, invoice.invoiceNo)}
              >
                {busySendingInvoiceId === invoice.invoiceId ? "Sending email..." : "Send invoice email"}
              </button>
            </div>
          )}
          <p className="financeImportHint">Internal allocation details remain available even when customer scope amounts are hidden.</p>
          {invoice.allocations.map((item) => <div className="billingHistoryAllocation" key={item.scopeId}>
            <span>{item.visitDate ? `${item.visitDate} - ` : ""}{item.scopeName}
              <small>Completion when billed: {item.completionStatusAtIssue ?? "Not recorded (historical invoice)"}</small>
            </span><strong>{money.format(item.amount)}</strong>
          </div>)}
        </details>)}
      </>}
    </>}
  </Modal>;
}

function UnitRows({ unit, projectName, render, selection }: {
  unit: BillingUnit; projectName: string;
  render: (scope: BillingUnit["scopes"][number] | null, label: string) => React.ReactNode;
  selection?: (scope: BillingUnit["scopes"][number] | null, label: string) => React.ReactNode;
}) {
  const label = unit.visitDate ? `${projectName} - ${unit.visitDate}` : projectName;
  return <>
    <tr className="billingParentRow"><td><span className="billingRowLabel">{selection?.(null, label)}<strong>{label}{unit.skipped ? " (Skipped)" : ""}</strong></span>
      {unit.recurrenceDate && unit.recurrenceDate !== unit.visitDate && <small>Original occurrence: {unit.recurrenceDate}</small>}
    </td><td>{render(null, label)}</td><td>{money.format(unit.contractValue)}</td><td>{money.format(unit.billed)}</td><td>{money.format(unit.contractValue - unit.billed)}</td></tr>
    {unit.scopes.map((scope) => {
      const scopeLabel = `${label} / ${scope.scopeName}`;
      return <tr key={scope.scopeId}><td className="billingScopeIndent"><span className="billingRowLabel">{selection?.(scope, scopeLabel)}<span>{scope.scopeName}</span></span></td>
        <td>{render(scope, scopeLabel)}</td><td>{money.format(scope.contractValue)}</td><td>{money.format(scope.billed)}</td><td>{money.format(scope.contractValue - scope.billed)}</td></tr>;
    })}
  </>;
}
