"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/app/components/modal";
import type { ProjectScopeLine, ProjectWithEstimate } from "@/app/lib/estimates";
import { calculateEstimate } from "@/app/lib/estimate-pricing";
import { actualCostTotal, matchingQuantity, money } from "@/app/lib/project-cost-pricing";
import type { AllocationBill, ProjectBillCost } from "@/app/lib/project-costs";
import type { ProjectFinancialSummary } from "@/app/lib/projects";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const dollars = (value: number) => currency.format(value);
const unitPrice = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 });
const quantity = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

type CostDraft = {
  costId: number | null;
  estimateLineItemId: string;
  billId: string;
  description: string;
  costDate: string;
  quantity: string;
  unitName: string;
  unitCost: string;
  freightAmount: string;
  taxAmount: string;
};

async function costAction(body: Record<string, unknown>) {
  const response = await fetch("/api/projects/costs", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Unable to update actual costs");
}

export default function ProjectCostPanel({ project, costs, bills, financials }: {
  project: ProjectWithEstimate;
  costs: ProjectBillCost[];
  bills: AllocationBill[];
  financials: ProjectFinancialSummary | undefined;
}) {
  const router = useRouter();
  const readOnly = project.projectStatus === "Complete";
  const [draft, setDraft] = useState<CostDraft | null>(null);
  const [referenceLine, setReferenceLine] = useState<ProjectScopeLine | null>(null);
  const [showFinancialDetails, setShowFinancialDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pricing = calculateEstimate({
    markupMode: "perLine", estimateMarkupPercent: 0, roundingIncrement: 0,
    taxPercent: project.taxPercent, lines: project.lines,
  });
  const totalAllocated = money(costs.reduce((sum, cost) => sum + cost.amount, 0));
  const unexpected = costs.filter((cost) => cost.estimateLineItemId === null);
  const unexpectedTotal = money(unexpected.reduce((sum, cost) => sum + cost.amount, 0));
  const projectBillTotal = money(bills.reduce((sum, bill) => sum + (bill.amount ?? 0), 0));
  const hasInvalidBills = bills.some((bill) => bill.amount === null);
  const unallocated = money(projectBillTotal - totalAllocated);
  const groups = new Map<string | null, ProjectScopeLine[]>();
  for (const line of project.lines) groups.set(line.scopeName, [...(groups.get(line.scopeName) ?? []), line]);

  function openNew(line: ProjectScopeLine | null) {
    setError(null);
    setDraft({
      costId: null, estimateLineItemId: line ? String(line.estimateLineItemId) : "", billId: "",
      description: "", costDate: "", quantity: "", unitName: line?.unitName ?? "",
      unitCost: "", freightAmount: "0", taxAmount: "0",
    });
  }
  function edit(cost: ProjectBillCost) {
    setError(null);
    setDraft({
      costId: cost.costId, estimateLineItemId: cost.estimateLineItemId === null ? "" : String(cost.estimateLineItemId),
      billId: cost.billId, description: cost.description, costDate: cost.costDate,
      quantity: String(cost.quantity), unitName: cost.unitName, unitCost: String(cost.unitCost),
      freightAmount: String(cost.freightAmount), taxAmount: String(cost.taxAmount),
    });
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      await costAction({
        ...draft, action: "save", projectId: project.projectId,
        estimateLineItemId: draft.estimateLineItemId ? Number(draft.estimateLineItemId) : null,
        quantity: Number(draft.quantity), unitCost: Number(draft.unitCost),
        freightAmount: Number(draft.freightAmount), taxAmount: Number(draft.taxAmount),
      });
      setDraft(null);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save cost");
    } finally { setBusy(false); }
  }
  async function remove(cost: ProjectBillCost) {
    setBusy(true);
    setError(null);
    try {
      await costAction({ action: "remove", projectId: project.projectId, costId: cost.costId });
      router.refresh();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Unable to remove cost");
    } finally { setBusy(false); }
  }

  function costRows(rows: ProjectBillCost[]) {
    if (rows.length === 0) return <p className="projectCostHint">No actual-cost rows yet.</p>;
    return (
      <div className="projectScopeTableWrapper">
        <table className="invoiceTable projectScopeTable">
          <caption>Bill-backed actual costs</caption>
          <thead><tr><th>Date / Bill</th><th>Description</th><th>Actual quantity</th><th>Unit cost</th><th>Freight</th><th>Tax amount</th><th>Total actual</th><th>Actions</th></tr></thead>
          <tbody>{rows.map((cost) => <tr key={cost.costId}>
            <td>{cost.costDate}<br /><Link href="/finances/bills">Bill {cost.billNo} ({cost.billId})</Link></td>
            <td>{cost.description}</td><td>{quantity.format(cost.quantity)} {cost.unitName}</td>
            <td>{unitPrice.format(cost.unitCost)}</td><td>{dollars(cost.freightAmount)}</td><td>{dollars(cost.taxAmount)}</td><td>{dollars(cost.amount)}</td>
            <td><button type="button" className="estimateTextAction" disabled={busy || readOnly} onClick={() => edit(cost)}>Edit / Reallocate</button>{" "}
              <button type="button" className="estimateDangerAction" disabled={busy || readOnly} onClick={() => void remove(cost)}>Remove allocation</button></td>
          </tr>)}</tbody>
        </table>
      </div>
    );
  }
  const selectedBill = bills.find((bill) => bill.billId === draft?.billId);
  const original = costs.find((cost) => cost.costId === draft?.costId);
  const available = selectedBill?.remainingAmount == null ? null : money(selectedBill.remainingAmount + (original?.billId === selectedBill.billId ? original.amount : 0));
  const draftTotal = draft ? actualCostTotal({
    quantity: Number(draft.quantity), unitCost: Number(draft.unitCost),
    freightAmount: Number(draft.freightAmount), taxAmount: Number(draft.taxAmount),
  }) : 0;
  const referencePricing = referenceLine ? pricing.lines[project.lines.indexOf(referenceLine)] : null;

  return (
    <section className="projectCostPanel">
      {readOnly && <p className="projectCostHint" role="status">Complete job: all data is read-only. Change the job status to Active to reopen it.</p>}
      <div className="projectActualCostToolbar">
        <strong>Invoiced cost tracking</strong>
        <button type="button" className="estimateTextAction" aria-expanded={showFinancialDetails} onClick={() => setShowFinancialDetails(!showFinancialDetails)}>
          {showFinancialDetails ? "Hide financial details" : "Show financial details"}
        </button>
      </div>
      <div className="projectCostSummary" aria-label="Project financial actuals">
        {showFinancialDetails && <div><span>Estimated cost budget</span><strong>{dollars(pricing.landedCostTotal)}</strong></div>}
        <div><span>Actual bill costs (paid + unpaid)</span><strong>{hasInvalidBills ? "Needs bill correction" : dollars(projectBillTotal)}</strong></div>
        <div><span>Remaining project budget</span><strong className={pricing.landedCostTotal - projectBillTotal < 0 ? "projectOverBudget" : ""}>{hasInvalidBills ? "Unavailable" : dollars(money(pricing.landedCostTotal - projectBillTotal))}</strong></div>
        {showFinancialDetails && <div><span>Allocated to lines / unexpected</span><strong>{dollars(totalAllocated)}</strong></div>}
        <div><span>Unallocated bill balance</span><strong>{hasInvalidBills ? "Needs bill correction" : dollars(unallocated)}</strong></div>
        {showFinancialDetails && <div><span>Customer invoiced revenue</span><strong>{dollars(financials?.income ?? 0)}</strong><small>{dollars(financials?.paidIncome ?? 0)} paid / {dollars(financials?.unpaidIncome ?? 0)} unpaid</small></div>}
      </div>
      <p className="projectCostHint">Track supplier-billed materials, subcontracts, and rentals here, not in-house labor or equipment. Unallocated bills count in project actuals, but not line or scope actuals. Labor/equipment lines remain visible until sourcing classification is available.</p>
      {project.engagementType === "Service" && <p className="projectCostHint">Recurring budget uses the accepted estimate as-is; it is not multiplied by the number of visits.</p>}
      {error && !draft && <p className="financeImportError" role="alert">{error}</p>}
      {[...groups].map(([scopeName, lines]) => {
        const lineIds = new Set(lines.map((line) => line.estimateLineItemId));
        const scopeEstimated = money(lines.reduce((sum, line) => sum + pricing.lines[project.lines.indexOf(line)].landedCost, 0));
        const scopeActual = money(costs.filter((cost) => cost.estimateLineItemId !== null && lineIds.has(cost.estimateLineItemId)).reduce((sum, cost) => sum + cost.amount, 0));
        return (
          <details className="projectCostScope" key={scopeName ?? "__ungrouped"}>
            <summary className="projectScopeSummary">
              <span className="projectScopeTitle"><strong>{scopeName ?? "Cost lines"}</strong><small>{lines.length} work {lines.length === 1 ? "item" : "items"}</small></span>
              {showFinancialDetails && <span><small>Estimated cost</small><strong>{dollars(scopeEstimated)}</strong></span>}
              <span><small>Actual cost</small><strong>{dollars(scopeActual)}</strong></span>
              <span><small>Remaining budget</small><strong className={scopeActual > scopeEstimated ? "projectOverBudget" : ""}>{dollars(money(scopeEstimated - scopeActual))}</strong></span>
            </summary>
            {lines.map((line) => {
              const estimated = pricing.lines[project.lines.indexOf(line)];
              const rows = costs.filter((cost) => cost.estimateLineItemId === line.estimateLineItemId);
              const actual = money(rows.reduce((sum, cost) => sum + cost.amount, 0));
              const purchased = matchingQuantity(rows, line.unitName);
              return <details className="projectCostLine" key={line.estimateLineItemId}>
                <summary className="projectEstimateSummary">
                  <span className="projectEstimateTitle"><strong>{line.description}</strong><small>{line.lineType} · {rows.length} actual-cost {rows.length === 1 ? "row" : "rows"}</small></span>
                  <span><small>Actual cost</small><strong>{dollars(actual)}</strong></span>
                  <span><small>Remaining budget</small><strong className={actual > estimated.landedCost ? "projectOverBudget" : ""}>{dollars(money(estimated.landedCost - actual))}</strong></span>
                  <span><small>Remaining quantity</small><strong>{quantity.format(line.quantity - purchased.quantity)} {line.unitName}</strong>
                    {purchased.hasOtherUnits && <small className="projectOverBudget">Other units excluded from quantity only</small>}</span>
                  <button type="button" className="estimateTextAction" aria-label={`View estimate reference for ${line.description}`} onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setReferenceLine(line);
                  }}>Estimate reference</button>
                </summary>
                <div className="projectActualCostContent">
                <div className="projectActualCostToolbar">
                  <button type="button" className="estimateTextAction" disabled={busy || readOnly} onClick={() => openNew(line)}>Add actual cost</button>
                </div>
                {costRows(rows)}
                </div>
              </details>;
            })}
          </details>
        );
      })}
      <section className="projectCostScope">
        <header><h3>Unexpected / Out-of-scope costs</h3><strong>{dollars(unexpectedTotal)}</strong>
          <button type="button" className="estimateTextAction" disabled={busy || readOnly} onClick={() => openNew(null)}>Add unexpected cost</button></header>
        <p className="projectCostHint">Includes omitted work and pending change-order costs. These count toward job actuals now and may be reallocated later. The accepted estimate is unchanged.</p>
        {costRows(unexpected)}
      </section>
      <section className="projectCostScope">
        <header><h3>Bill reconciliation</h3><Link href="/finances/bills">Manage / assign bills in Finances</Link></header>
        <div className="projectScopeTableWrapper"><table className="invoiceTable projectScopeTable">
          <thead><tr><th>Bill / Vendor</th><th>Bill date</th><th>Total</th><th>Allocated</th><th>Unallocated balance</th></tr></thead>
          <tbody>{bills.map((bill) => <tr key={bill.billId}><td>{bill.billNo} ({bill.billId}) / {bill.companyName ?? "Not specified"}</td>
            <td>{bill.billDate}</td><td>{bill.amount === null ? "Invalid amount" : dollars(bill.amount)}</td><td>{dollars(bill.allocatedAmount)}</td>
            <td>{bill.remainingAmount === null ? "Correct bill amount" : dollars(bill.remainingAmount)}</td></tr>)}
            {bills.length === 0 && <tr><td colSpan={5}>Assign a bill to this project in Finances to start entering actual costs.</td></tr>}</tbody>
        </table></div>
      </section>
      {referenceLine && referencePricing && <Modal titleId={`estimateReferenceTitle-${project.projectId}`} title={`Estimate reference: ${referenceLine.description}`} eyebrow="ACCEPTED ESTIMATE" onClose={() => setReferenceLine(null)} closeLabel="Close estimate reference">
        <p className="projectCostHint">Original accepted estimate for reference only. Cost budget excludes customer markup. Estimated tax uses the job&apos;s {project.taxPercent}% rate; actual tax is entered from bills.</p>
        <div className="projectScopeTableWrapper"><table className="invoiceTable projectScopeTable">
          <caption>Accepted estimate baseline</caption>
          <thead><tr><th>Quantity</th><th>Unit cost</th><th>Freight</th><th>Estimated tax</th><th>Line markup</th><th>Estimated cost</th></tr></thead>
          <tbody><tr><td>{quantity.format(referenceLine.quantity)} {referenceLine.unitName}</td><td>{unitPrice.format(referenceLine.unitCost)}</td><td>{dollars(referencePricing.freightAmount)}</td>
            <td>{dollars(referencePricing.taxAmount)}</td><td>{referenceLine.lineMarkupPercent}%</td><td>{dollars(referencePricing.landedCost)}</td></tr></tbody>
        </table></div>
      </Modal>}
      {draft && !readOnly && <Modal titleId={`projectCostTitle-${project.projectId}`} title={draft.costId === null ? "Add actual cost" : "Edit / reallocate actual cost"} eyebrow="PROJECT ACTUALS" onClose={() => { if (!busy) { setDraft(null); setError(null); } }} closeDisabled={busy} closeLabel="Close actual cost form">
        <form onSubmit={(event) => void save(event)}>
          <div className="financeImportFields">
            <label className="financeImportField">Destination *
              <select value={draft.estimateLineItemId} onChange={(event) => setDraft({ ...draft, estimateLineItemId: event.target.value })}>
                <option value="">Unexpected / Out-of-scope</option>
                {project.lines.map((line) => <option key={line.estimateLineItemId} value={line.estimateLineItemId}>{line.scopeName ? `${line.scopeName}: ` : ""}{line.description}</option>)}
              </select>
            </label>
            <label className="financeImportField">Supplier bill *
              <select required value={draft.billId} onChange={(event) => {
                const bill = bills.find((item) => item.billId === event.target.value);
                setDraft({ ...draft, billId: event.target.value, costDate: draft.costDate || bill?.billDate || "" });
              }}>
                <option value="">Choose a bill assigned to this project</option>
                {bills.map((bill) => <option key={bill.billId} value={bill.billId} disabled={bill.amount === null || bill.amount <= 0}>{bill.billNo} ({bill.billId}) / {bill.companyName ?? "Vendor unspecified"}</option>)}
              </select>
            </label>
            <label className="financeImportField">Description *<input required maxLength={300} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
            <label className="financeImportField">Cost date *<input type="date" required value={draft.costDate} onChange={(event) => setDraft({ ...draft, costDate: event.target.value })} /></label>
            <label className="financeImportField">Actual quantity *<input type="number" required min="0.0001" max="1000000" step="0.0001" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} /></label>
            <label className="financeImportField">Unit *<input required maxLength={30} value={draft.unitName} onChange={(event) => setDraft({ ...draft, unitName: event.target.value })} /></label>
            <label className="financeImportField">Actual unit cost *<input type="number" required min="0" max="1000000" step="0.0001" value={draft.unitCost} onChange={(event) => setDraft({ ...draft, unitCost: event.target.value })} /></label>
            <label className="financeImportField">Freight amount *<input type="number" required min="0" max="1000000" step="0.01" value={draft.freightAmount} onChange={(event) => setDraft({ ...draft, freightAmount: event.target.value })} /></label>
            <label className="financeImportField">Actual tax amount *<input type="number" required min="0" max="1000000" step="0.01" value={draft.taxAmount} onChange={(event) => setDraft({ ...draft, taxAmount: event.target.value })} /></label>
          </div>
          <p className="projectCostHint">Job tax reference: {project.taxPercent}%. Enter the tax amount from the bill; do not repeat the full bill tax or freight on each partial allocation.</p>
          <p>Total actual cost: <strong>{Number.isFinite(draftTotal) ? dollars(draftTotal) : "Enter valid numbers"}</strong>
            {available !== null && <> / Bill balance available for this row: <strong>{dollars(available)}</strong></>}</p>
          {error && <p className="financeImportError" role="alert">{error}</p>}
          <div className="financeImportActions"><button type="button" className="financeImportCancel" disabled={busy} onClick={() => { setDraft(null); setError(null); }}>Cancel</button>
            <button type="submit" className="financeImportSubmit" disabled={busy || bills.length === 0 || (available !== null && draftTotal > available)}>{busy ? "Saving..." : "Save actual cost"}</button></div>
          {available !== null && draftTotal > available && <p className="financeImportError" role="alert">This row exceeds the remaining bill balance.</p>}
        </form>
      </Modal>}
    </section>
  );
}
