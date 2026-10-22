"use client";

import type { ChangeInput, ChangeSourceLine } from "@/app/lib/contract-changes";
import { calculateChange } from "@/app/lib/contract-change-pricing";
import { defaultUnitAbbreviation, type UnitPreset } from "@/app/lib/unit-presets";
import { DocumentNotesFields } from "./document-notes";
import CustomerPicker, { type PickedCustomer } from "@/app/sales/customer-picker";

export function blankContractChange(unitName: string): ChangeInput {
  return {
    estimateName: "", customerName: null, internalNotes: null, customerNotes: null, engagementType: "Project",
    recurrenceFrequency: null, expectedStartDate: null, expectedEndDate: null, markupMode: "perLine", estimateMarkupPercent: 0,
    taxPercent: 0, roundingIncrement: 0, groupingMode: "Scope", scopes: ["Changed work"], lines: [{
      operation: "Add", deductLineId: null, description: "", quantity: 1, unitName,
      unitCost: 0, freightAmount: 0, lineMarkupPercent: 0, lineType: "Material", scopeName: "Changed work",
      materialId: null, catalogUnitCostAtEntry: null, catalogPriceDate: null,
    }],
  };
}

export function contractChangePreview(input: ChangeInput, sources: ChangeSourceLine[]) {
  const pricing = calculateChange(input);
  return Math.round(input.lines.reduce((sum, line, index) => {
    if (line.operation === "Add") return sum + pricing.lines[index].sellAmount;
    const source = sources.find(candidate => candidate.lineId === line.deductLineId);
    return source ? sum - (line.quantity === source.remainingQuantity ? source.sellAmount - source.deductedSell :
      Math.round(source.sellAmount * line.quantity / source.originalQuantity * 100) / 100) : sum;
  }, 0) * 100) / 100;
}

export default function ContractChangeFields({ input, sources, unitPresets, disabled, onChange, customerMode = "hidden", contractCustomer = null, canCreateCustomer = false }: {
  input: ChangeInput; sources: ChangeSourceLine[]; unitPresets: UnitPreset[]; disabled?: boolean;
  onChange: (input: ChangeInput) => void;
  customerMode?: "hidden" | "locked" | "selectable";
  contractCustomer?: PickedCustomer | null;
  canCreateCustomer?: boolean;
}) {
  const patch = (values: Partial<ChangeInput>) => onChange({ ...input, ...values });
  const linePatch = (index: number, values: Partial<ChangeInput["lines"][number]>) =>
    patch({ lines: input.lines.map((line, position) => position === index ? { ...line, ...values } : line) });
  // An unset change-order customer falls back to the contract's customer on the server.
  const shown: PickedCustomer = input.customerId != null
    ? { customerId: input.customerId, name: input.customerName ?? "", address: input.customerAddress ?? null }
    : contractCustomer ?? { customerId: null, name: "", address: null };
  const differs = customerMode === "selectable" && input.customerId != null && input.customerId !== contractCustomer?.customerId;
  return <fieldset disabled={disabled} className="financeImportGroup">
    <legend>Estimate-style pricing</legend>
    {customerMode === "locked" && <p>Customer: <strong>{contractCustomer?.name || "Unassigned"}</strong> (alternates always use the contract&apos;s customer)</p>}
    {customerMode === "selectable" && <div className="financeImportField">
      <span>Customer</span>
      <CustomerPicker value={shown} canCreate={canCreateCustomer} disabled={disabled}
        onChange={customer => patch({ customerId: customer.customerId, customerName: customer.name, customerAddress: customer.address })}/>
      {differs && <p role="note"><strong>Different customer:</strong> this change order is for a customer other than the contract&apos;s
        {contractCustomer?.name ? ` (${contractCustomer.name})` : ""}. Confirm this is intended.</p>}
    </div>}
    <div className="financeImportFields">
      <label className="financeImportField">Name<input required maxLength={150} value={input.estimateName} onChange={e => patch({ estimateName: e.target.value })}/></label>
      <label className="financeImportField">Markup method<select value={input.markupMode}
        onChange={e => patch({ markupMode: e.target.value === "estimate" ? "estimate" : "perLine" })}>
        <option value="perLine">Markup per line</option><option value="estimate">Markup on additions</option>
      </select></label>
      {input.markupMode === "estimate" && <label className="financeImportField">Markup %<input type="number" min={0} max={1000} step="0.01"
        value={input.estimateMarkupPercent} onChange={e => patch({ estimateMarkupPercent: Number(e.target.value) })}/></label>}
      <label className="financeImportField">Tax % on added costs<input type="number" min={0} max={100} step="0.01"
        value={input.taxPercent} onChange={e => patch({ taxPercent: Number(e.target.value) })}/></label>
    </div>
    <p>Deductions use the existing work&apos;s contract pricing. Enter the quantity removed; add replacement work on a separate Add line.</p>
    <div className="projectScopeTableWrapper"><table className="invoiceTable contractLineTable">
      <thead><tr><th>Add / Deduct</th><th>Existing line reduced</th><th>Scope</th><th>Description</th><th>Type</th><th>Quantity</th><th>Unit</th><th>Unit cost</th><th>Freight</th><th>Markup %</th><th>Remove</th></tr></thead>
      <tbody>{input.lines.map((line, index) => <tr key={index}>
        <td><select aria-label={`Line ${index + 1} operation`} value={line.operation}
          onChange={e => linePatch(index, { operation: e.target.value === "Deduct" ? "Deduct" : "Add", deductLineId: null })}><option>Add</option><option>Deduct</option></select></td>
        <td>{line.operation === "Deduct" ? <select required value={line.deductLineId ?? ""} aria-label={`Line ${index + 1} existing work`} onChange={e => {
          const source = sources.find(candidate => candidate.lineId === Number(e.target.value));
          if (source) linePatch(index, { deductLineId: source.lineId, quantity: Math.min(1, source.remainingQuantity), unitName: source.unitName,
            unitCost: source.unitCost, freightAmount: Number((source.freightAmount / source.originalQuantity).toFixed(4)),
            lineMarkupPercent: source.lineMarkupPercent, lineType: source.lineType, description: `Remove ${source.description}`.slice(0, 300) });
          else linePatch(index, { deductLineId: null });
        }}><option value="">Choose existing work</option>{sources.filter(source => source.remainingQuantity > 0).map(source =>
          <option value={source.lineId} key={source.lineId}>{source.description} ({source.remainingQuantity} {source.unitName} remaining)</option>)}
        </select> : "New work"}</td>
        <td><input required maxLength={150} aria-label={`Line ${index + 1} scope`} value={line.scopeName ?? ""} onChange={e => linePatch(index, { scopeName: e.target.value })}/></td>
        <td><input required maxLength={300} aria-label={`Line ${index + 1} description`} value={line.description} onChange={e => linePatch(index, { description: e.target.value })}/></td>
        <td><select aria-label={`Line ${index + 1} type`} disabled={line.operation === "Deduct"} value={line.lineType}
          onChange={e => linePatch(index, { lineType: e.target.value === "Labor" ? "Labor" : e.target.value === "Equipment" ? "Equipment" : "Material" })}>
          <option>Material</option><option>Labor</option><option>Equipment</option></select></td>
        <td><input required type="number" min="0.0001" step="0.0001"
          max={line.operation === "Deduct" ? sources.find(source => source.lineId === line.deductLineId)?.remainingQuantity : undefined}
          aria-label={`Line ${index + 1} quantity`} value={line.quantity} onChange={e => linePatch(index, { quantity: Number(e.target.value) })}/></td>
        <td><select required aria-label={`Line ${index + 1} unit`} disabled={line.operation === "Deduct"} value={line.unitName ?? ""} onChange={e => linePatch(index, { unitName: e.target.value })}>
          <option value="">Choose unit</option>{unitPresets.map(unit => <option key={unit.abbreviation} value={unit.abbreviation}>{unit.abbreviation}</option>)}</select></td>
        <td><input required type="number" min={0} step="0.0001" disabled={line.operation === "Deduct"} aria-label={`Line ${index + 1} unit cost`} value={line.unitCost} onChange={e => linePatch(index, { unitCost: Number(e.target.value) })}/></td>
        <td><input type="number" min={0} step="0.0001" aria-label={`Line ${index + 1} freight`} disabled={line.operation === "Deduct"} value={line.freightAmount} onChange={e => linePatch(index, { freightAmount: Number(e.target.value) })}/></td>
        <td><input type="number" min={0} max={1000} step="0.0001" aria-label={`Line ${index + 1} markup percent`} disabled={line.operation === "Deduct" || input.markupMode === "estimate"} value={line.lineMarkupPercent} onChange={e => linePatch(index, { lineMarkupPercent: Number(e.target.value) })}/></td>
        <td><button type="button" disabled={input.lines.length === 1} aria-label={`Remove line ${index + 1}`} onClick={() => patch({ lines: input.lines.filter((_, position) => position !== index) })}>Remove</button></td>
      </tr>)}</tbody>
    </table></div>
    <button type="button" disabled={input.lines.length >= 100} onClick={() => patch({ lines: [...input.lines, blankContractChange(defaultUnitAbbreviation(unitPresets)).lines[0]] })}>Add line</button>
    <DocumentNotesFields internalNotes={input.internalNotes ?? ""} customerNotes={input.customerNotes ?? ""}
      onInternalChange={value => patch({ internalNotes: value })} onCustomerChange={value => patch({ customerNotes: value })}/>
  </fieldset>;
}
