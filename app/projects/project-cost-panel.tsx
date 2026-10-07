"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/app/components/modal";
import BillSplitToggle from "@/app/components/bill-split-toggle";
import SupplierBillPicker from "./supplier-bill-picker";
import { billBalanceForRow, billSelectionIssue } from "@/app/lib/bill-picker";
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
  const [billPickerOpen, setBillPickerOpen] = useState(false);
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
  const attachedBills = bills.filter((bill) => bill.projectId === project.projectId || bill.isSplit && bill.allocatedProjectIds.includes(project.projectId));
  const billJobAmount = (bill: AllocationBill) => bill.isSplit
    ? money(costs.filter((cost) => cost.billId === bill.billId).reduce((sum, cost) => sum + cost.amount, 0))
    : bill.amount ?? 0;
  const projectBillTotal = money(attachedBills.reduce((sum, bill) => sum + billJobAmount(bill), 0));
  const hasInvalidBills = attachedBills.some((bill) => bill.amount === null);
  const unallocated = money(projectBillTotal - totalAllocated);
  const groups = new Map<string | null, ProjectScopeLine[]>();
  for (const line of project.lines) groups.set(line.scopeName, [...(groups.get(line.scopeName) ?? []), line]);

  function openNew(line: ProjectScopeLine | null) {
    setBillPickerOpen(false);
    setError(null);
    setDraft({
      costId: null, estimateLineItemId: line ? String(line.estimateLineItemId) : "", billId: "",
      description: "", costDate: "", quantity: "", unitName: line?.unitName ?? "",
      unitCost: "", freightAmount: "0", taxAmount: "0",
    });
  }
  function edit(cost: ProjectBillCost) {
    setBillPickerOpen(false);
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
    const bill = bills.find((item) => item.billId === draft.billId);
    const selectionIssue = bill ? billSelectionIssue(bill, project.projectId, costs.find((cost) => cost.costId === draft.costId)) : "Choose a supplier bill first.";
    if (selectionIssue) { setError(selectionIssue); return; }
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
    if (rows.length === 0) return <p className="projectCostHint">
      {/* No actual-cost rows yet. */}
      </p>;
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
  const available = selectedBill ? billBalanceForRow(selectedBill, original) : null;
  const selectedBillIssue = selectedBill ? billSelectionIssue(selectedBill, project.projectId, original) : null;
  const draftTotal = draft ? actualCostTotal({
    quantity: Number(draft.quantity), unitCost: Number(draft.unitCost),
    freightAmount: Number(draft.freightAmount), taxAmount: Number(draft.taxAmount),
  }) : 0;
  const referencePricing = referenceLine ? pricing.lines[project.lines.indexOf(referenceLine)] : null;

  return (
    <section className="projectCostPanel">
      {readOnly && <p className="projectCostHint" role="status">Complete job: all data is read-only. Change the job status to Active to reopen it.</p>}
      <div className="projectActualCostToolbar">
        {/* <strong>Invoiced cost tracking</strong> */}
        <button type="button" className="estimateTextAction" aria-expanded={showFinancialDetails} onClick={() => setShowFinancialDetails(!showFinancialDetails)}>
          {/* {showFinancialDetails ? "Hide financial details" : "Show financial details"} */}
        </button>
      </div>
      <div className="projectCostSummary" aria-label="Project financial actuals">
       <div><span>Estimated costs</span><strong>{dollars(pricing.landedCostTotal)}</strong></div>
        <div><span>Actual costs</span><strong>{hasInvalidBills ? "Needs bill correction" : dollars(projectBillTotal)}</strong></div>
        <div><span>Remaining project budget</span><strong className={pricing.landedCostTotal - projectBillTotal < 0 ? "projectOverBudget" : ""}>{hasInvalidBills ? "Unavailable" : dollars(money(pricing.landedCostTotal - projectBillTotal))}</strong></div>
        <div><span>Allocated Costs</span><strong>{dollars(totalAllocated)}</strong></div>
        <div><span>Unallocated Costs</span><strong>{hasInvalidBills ? "Needs bill correction" : dollars(unallocated)}</strong></div>
        <div><span>Current Invoiced Total</span><strong>{dollars(financials?.income ?? 0)}</strong>
          {/* <small>{dollars(financials?.paidIncome ?? 0)} paid / {dollars(financials?.unpaidIncome ?? 0)} unpaid</small> */}
        </div>
      </div>
      {/* <p className="projectCostHint">Track supplier-billed materials, subcontracts, and rentals here, not in-house labor or equipment. Single-job bills count in full; split bills count only this job&apos;s allocations. Unallocated split balances stay in Finances. Labor/equipment lines remain visible until sourcing classification is available.</p> */}
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
              {/* {showFinancialDetails &&  */}
              <span><small>Estimated cost</small><strong>{dollars(scopeEstimated)}</strong></span>
              {/* } */}
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
                  <span><small>Estimated quantity</small><strong>{quantity.format(line.quantity)} {line.unitName}</strong></span>
                  <span><small>Remaining quantity</small><strong>{quantity.format(line.quantity - purchased.quantity)} {line.unitName}</strong>
                    {purchased.hasOtherUnits && <small className="projectOverBudget">Other units excluded from quantity only</small>}</span>
                  <span><small>Estimated cost</small><strong>{dollars(estimated.landedCost)}</strong></span>
                  <span><small>Actual cost</small><strong>{dollars(actual)}</strong></span>
                  <span><small>Remaining budget</small><strong className={actual > estimated.landedCost ? "projectOverBudget" : ""}>{dollars(money(estimated.landedCost - actual))}</strong></span>

                  {/* <button type="button" className="estimateTextAction" aria-label={`View estimate reference for ${line.description}`} onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setReferenceLine(line);
                  }}>Estimate reference</button> */}
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
      <details className="projectCostScope">
        <summary className="projectScopeSummary">
          <span className="projectScopeTitle"><strong>Unexpected / Out-of-scope costs</strong><small>{unexpected.length} actual-cost {unexpected.length === 1 ? "row" : "rows"}</small></span>
          <span><small>Actual cost</small><strong>{dollars(unexpectedTotal)}</strong></span>
        </summary>
        <div className="projectActualCostContent">
          <div className="projectActualCostToolbar">
            <button type="button" className="estimateTextAction" disabled={busy || readOnly} onClick={() => openNew(null)}>Add an unexpected cost</button>
          </div>
          {costRows(unexpected)}
        </div>
      </details>
      <section className="projectCostScope">
        <header><h3>Bill reconciliation</h3><Link href="/finances/bills">Manage / assign bills in Finances</Link></header>
        <div className="projectScopeTableWrapper"><table className="invoiceTable projectScopeTable">
          <thead><tr><th>Bill / Vendor</th><th>Bill date</th><th>Bill total</th><th>This job&apos;s cost</th><th>Allocated across all jobs</th><th>Unallocated bill balance</th></tr></thead>
          <tbody>{attachedBills.map((bill) => <tr key={bill.billId}><td>{bill.billNo} ({bill.billId}) / {bill.companyName ?? "Not specified"}</td>
            <td>{bill.billDate}</td><td>{bill.amount === null ? "Invalid amount" : dollars(bill.amount)}{bill.isSplit && <small> · Split bill</small>}</td>
            <td>{dollars(billJobAmount(bill))}</td><td>{dollars(bill.allocatedAmount)}</td>
            <td>{bill.remainingAmount === null ? "Correct bill amount" : dollars(bill.remainingAmount)}</td></tr>)}
            {attachedBills.length === 0 && <tr><td colSpan={6}>No bills attached yet. Add an actual cost and select an unassigned or split supplier bill.</td></tr>}</tbody>
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
            <div className="financeImportField"><span>Supplier bill *</span>
              <button type="button" className="financeImportCancel" disabled={busy} onClick={() => setBillPickerOpen(true)}>
                {selectedBill ? `Change supplier bill: ${selectedBill.billNo} (${selectedBill.billId})` : "Find supplier bill"}
              </button>
              {selectedBill && <small>{selectedBill.companyName ?? "Vendor unspecified"} · {selectedBill.billDate}</small>}
            </div>
            <label className="financeImportField">Description *<input required maxLength={300} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
            <label className="financeImportField">Cost date *<input type="date" required value={draft.costDate} onChange={(event) => setDraft({ ...draft, costDate: event.target.value })} /></label>
            <label className="financeImportField">Actual quantity *<input type="number" required min="0.0001" max="1000000" step="0.0001" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} /></label>
            <label className="financeImportField">Unit *<input required maxLength={30} value={draft.unitName} onChange={(event) => setDraft({ ...draft, unitName: event.target.value })} /></label>
            <label className="financeImportField">Actual unit cost *<input type="number" required min="0" max="1000000" step="0.0001" value={draft.unitCost} onChange={(event) => setDraft({ ...draft, unitCost: event.target.value })} /></label>
            <label className="financeImportField">Freight amount *<input type="number" required min="0" max="1000000" step="0.01" value={draft.freightAmount} onChange={(event) => setDraft({ ...draft, freightAmount: event.target.value })} /></label>
            <label className="financeImportField">Actual tax amount *<input type="number" required min="0" max="1000000" step="0.01" value={draft.taxAmount} onChange={(event) => setDraft({ ...draft, taxAmount: event.target.value })} /></label>
          </div>
          <p className="projectCostHint">Job tax reference: {project.taxPercent}%. Enter the tax amount from the bill; do not repeat the full bill tax or freight on each partial allocation.</p>
          {selectedBill && <BillSplitToggle billId={selectedBill.billId} isSplit={selectedBill.isSplit} disabled={busy || selectedBill.readOnly} />}
          {selectedBill && <p className="projectCostHint">Changing split mode is saved immediately for the whole bill, even if this cost form is cancelled.</p>}
          {selectedBill?.isSplit && <p className="projectCostHint">Split bill: only this job&apos;s allocated cost rows count toward its actuals. Other jobs can allocate the remaining balance. Unallocated amounts stay in Finances, not in any job.</p>}
          {selectedBill && !selectedBill.isSplit && selectedBill.projectId === null && <p className="projectCostHint">Saving attaches this bill to the job. Its full total ({selectedBill.amount === null ? "Invalid amount" : dollars(selectedBill.amount)}) counts toward project actuals; only this row&apos;s amount counts toward the selected work item. The remaining balance can be allocated to more lines in this job.</p>}
          <p className="projectCostHint">Removing an allocation leaves its bill attached to the job.</p>
          <p>Total actual cost: <strong>{Number.isFinite(draftTotal) ? dollars(draftTotal) : "Enter valid numbers"}</strong>
            {available !== null && <> / Bill balance available for this row: <strong>{dollars(available)}</strong></>}</p>
          {error && <p className="financeImportError" role="alert">{error}</p>}
          {selectedBillIssue && <p className="financeImportError" role="alert">{selectedBillIssue}</p>}
          <div className="financeImportActions"><button type="button" className="financeImportCancel" disabled={busy} onClick={() => { setDraft(null); setError(null); }}>Cancel</button>
            <button type="submit" className="financeImportSubmit" disabled={busy || !selectedBill || selectedBillIssue !== null || (available !== null && draftTotal > available)}>{busy ? "Saving..." : selectedBill && !selectedBill.isSplit && selectedBill.projectId === null ? "Attach bill & save actual cost" : "Save actual cost"}</button></div>
          {available !== null && draftTotal > available && <p className="financeImportError" role="alert">This row exceeds the remaining bill balance.</p>}
        </form>
        {billPickerOpen && <SupplierBillPicker bills={bills} projectId={project.projectId} original={original}
          onClose={() => setBillPickerOpen(false)} onSelect={(bill) => {
            setDraft({ ...draft, billId: bill.billId, costDate: draft.costDate || bill.billDate });
            setBillPickerOpen(false);
            setError(null);
          }} />}
      </Modal>}
    </section>
  );
}
