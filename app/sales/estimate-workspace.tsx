"use client";

import { Fragment, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FileDown, Library, Plus, Trash2 } from "lucide-react";
import {
  calculateEstimate,
  type EstimateMarkupMode,
} from "@/app/lib/estimate-pricing";
import type { EstimateDetails, EstimateLineInput, EstimatePrintOptions, EstimateSummary } from "@/app/lib/estimates";
import type { MaterialWithLatestPrice } from "@/app/lib/materials";


const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const money = (value: number) => currency.format(value || 0);

type EstimateLineDraft = EstimateLineInput;
type EngagementType = "Project" | "Service";
type RecurrenceFrequency = "Weekly" | "Biweekly" | "Monthly";

function newLine(): EstimateLineDraft {
  return { description: "", quantity: 1, unitName: "", unitCost: 0, freightAmount: 0, lineMarkupPercent: 0, materialId: null, catalogUnitCostAtEntry: null, catalogPriceDate: null };
}

function asNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function EstimateWorkspace({ estimates }: { estimates: EstimateSummary[] }) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [estimateName, setEstimateName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [markupMode, setMarkupMode] = useState<EstimateMarkupMode>("perLine");
  const [estimateMarkupPercent, setEstimateMarkupPercent] = useState(0);
  const [taxPercent, setTaxPercent] = useState(0);
  const [roundingIncrement, setRoundingIncrement] = useState(0);
  const [lines, setLines] = useState<EstimateLineDraft[]>([newLine()]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedEstimateId, setExpandedEstimateId] = useState<number | null>(null);
  const [detailsById, setDetailsById] = useState<Record<number, EstimateDetails>>({});
  const [loadingEstimateId, setLoadingEstimateId] = useState<number | null>(null);
  const [printPdfPopupOpen, setPrintPdfPopupOpen] = useState(false);
  const [printPdfEstimateId, setPrintPdfEstimateId] = useState<number | null>(null);
  const [printOptions, setPrintOptions] = useState<EstimatePrintOptions>({
    showQuantities: false,
    showLineTotals: false,
    showSummaryTotal: true,
  });
  const [printOptionsSaving, setPrintOptionsSaving] = useState<number | null>(null);
  const [pdfPreviewVersion, setPdfPreviewVersion] = useState(0);

  // win flow: picking engagement type (and recurrence, for Service) happens per-job, never
  // locked to a company-wide setting
  const [winningEstimate, setWinningEstimate] = useState<EstimateSummary | null>(null);
  const [winEngagementType, setWinEngagementType] = useState<EngagementType>("Project");
  const [winRecurrence, setWinRecurrence] = useState<RecurrenceFrequency>("Weekly");
  const [isWinning, setIsWinning] = useState(false);
  const [winError, setWinError] = useState<string | null>(null);

  // catalog picker: which line is currently choosing a material, plus the lazily-fetched list
  const [catalogPickerLine, setCatalogPickerLine] = useState<number | null>(null);
  const [catalogMaterials, setCatalogMaterials] = useState<MaterialWithLatestPrice[] | null>(null);
  const [catalogSearch, setCatalogSearch] = useState("");

  const pricing = calculateEstimate({
    markupMode,
    estimateMarkupPercent,
    taxPercent,
    roundingIncrement,
    lines,
  });

  function resetForm() {
    setEstimateName("");
    setCustomerName("");
    setMarkupMode("perLine");
    setEstimateMarkupPercent(0);
    setTaxPercent(0);
    setRoundingIncrement(0);
    setLines([newLine()]);
    setError(null);
    setPrintPdfPopupOpen(false);
  }

  function closeForm() {
    if (isSaving) return;
    setIsCreating(false);
    resetForm();
  }

  function updateLine(index: number, patch: Partial<EstimateLineDraft>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  }

  async function submitEstimate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/sales/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimateName,
          customerName,
          markupMode,
          estimateMarkupPercent,
          taxPercent,
          roundingIncrement,
          lines: lines.map((line) => ({
            ...line,
            quantity: Number(line.quantity),
            unitCost: Number(line.unitCost),
            freightAmount: Number(line.freightAmount),
            lineMarkupPercent: Number(line.lineMarkupPercent),
            unitName: line.unitName || null,
            materialId: line.materialId,
            catalogUnitCostAtEntry: line.catalogUnitCostAtEntry,
            catalogPriceDate: line.catalogPriceDate,
          })),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Unable to save estimate");
      setIsCreating(false);
      resetForm();
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save estimate");
    } finally {
      setIsSaving(false);
    }
  }

  function openPrintPdfPopup(estimate: EstimateSummary) {
    setPrintPdfEstimateId(estimate.estimateId);
    setPrintOptions({
      showQuantities: estimate.showQuantities,
      showLineTotals: estimate.showLineTotals,
      showSummaryTotal: estimate.showSummaryTotal,
    });
    setPdfPreviewVersion((version) => version + 1);
    setPrintPdfPopupOpen(true);
  }

  async function updatePrintOption(estimateId: number, patch: Partial<EstimatePrintOptions>) {
    const nextOptions = { ...printOptions, ...patch };
    setPrintOptions(nextOptions);
    setPrintOptionsSaving(estimateId);
    setError(null);
    try {
      const response = await fetch("/api/sales/estimates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-print-options", estimateId, ...nextOptions }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Unable to update print preferences");
      router.refresh();
    } catch (optionsError) {
      setError(optionsError instanceof Error ? optionsError.message : "Unable to update print preferences");
    } finally {
      setPrintOptionsSaving(null);
      setPdfPreviewVersion((version) => version + 1);
    }
  }

  function confirmPrintPdf(estimateId: number) {
    window.open(`/api/sales/estimates/${estimateId}/pdf`, "_blank", "noopener,noreferrer");
    setPrintPdfPopupOpen(false);
  }

  async function toggleDetails(estimateId: number) {
    if (expandedEstimateId === estimateId) {
      setExpandedEstimateId(null);
      return;
    }
    setExpandedEstimateId(estimateId);
    if (detailsById[estimateId]) return;
    setLoadingEstimateId(estimateId);
    try {
      const response = await fetch(`/api/sales/estimates?estimateId=${estimateId}`);
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Unable to load estimate details");
      setDetailsById((current) => ({ ...current, [estimateId]: result as EstimateDetails }));
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "Unable to load estimate details");
    } finally {
      setLoadingEstimateId(null);
    }
  }

  function openWinDialog(estimate: EstimateSummary) {
    setWinningEstimate(estimate);
    setWinEngagementType("Project");
    setWinRecurrence("Weekly");
    setWinError(null);
  }

  async function openCatalogPicker(lineIndex: number) {
    setCatalogPickerLine(lineIndex);
    setCatalogSearch("");
    if (catalogMaterials) return;
    try {
      const response = await fetch("/api/sales/materials");
      const result = await response.json().catch(() => null);
      if (response.ok) setCatalogMaterials(result.materials ?? []);
    } catch {
      setCatalogMaterials([]);
    }
  }

  function pickMaterial(material: MaterialWithLatestPrice) {
    if (catalogPickerLine == null) return;
    updateLine(catalogPickerLine, {
      description: material.materialName,
      unitName: material.unitName ?? "",
      unitCost: material.latestUnitCost ?? 0,
      materialId: material.materialId,
      catalogUnitCostAtEntry: material.latestUnitCost,
      catalogPriceDate: material.latestQuotedDate,
    });
    setCatalogPickerLine(null);
  }

  async function confirmWin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!winningEstimate) return;
    setIsWinning(true);
    setWinError(null);
    try {
      const response = await fetch("/api/sales/estimates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mark-won",
          estimateId: winningEstimate.estimateId,
          engagementType: winEngagementType,
          recurrenceFrequency: winEngagementType === "Service" ? winRecurrence : null,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Unable to convert estimate");
      router.refresh();
      router.push(`/projects?created=${result.projectId}`);
    } catch (winErr) {
      setWinError(winErr instanceof Error ? winErr.message : "Unable to convert estimate");
    } finally {
      setIsWinning(false);
      setWinningEstimate(null);
    }
  }

  return (
    <section className="salesWorkspace">
      <header className="salesToolbar">
        <div>
          <p className="salesEyebrow">SALES</p>
          <h1>Leads &amp; Estimates</h1>
        </div>
        <button className="financeImportButton" type="button" onClick={() => { resetForm(); setIsCreating(true); }}>
          <Plus size={15} aria-hidden="true" />
          New estimate
        </button>
      </header>

      <div className="estimateActionsInner">
        <a className="estimateTextAction" href="/sales/catalog">Material Catalog</a>
      </div>

      <p className="salesWorkflowNote">Draft estimates retain their pricing inputs and line items. Marking one won lets you choose a one-time project or a recurring/one-off service job, then creates it in Projects &amp; Jobs.</p>
      {error && <p className="financeImportError" role="alert">{error}</p>}

      <div className="invoiceTableWrapper salesEstimateTableWrapper">
        <table className="invoiceTable salesEstimateTable">
          <thead>
            <tr>
              <th>Estimate</th>
              <th>Customer</th>
              <th>Status</th>
              <th>Revision</th>
              <th>Lines</th>
              <th>Total</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {estimates.length === 0 ? (
              <tr><td colSpan={8} className="invoiceNoResults">No estimates yet.</td></tr>
            ) : estimates.map((estimate) => (
              <Fragment key={estimate.estimateId}>
                <tr>
                  <td>{estimate.estimateName}</td>
                  <td>{estimate.customerName ?? "—"}</td>
                  <td><span className={`estimateStatus estimateStatus${estimate.status}`}>{estimate.status}</span></td>
                  <td>{estimate.revisionNumber ? `R${estimate.revisionNumber}` : "—"}</td>
                  <td>{estimate.lineCount}</td>
                  <td>{money(estimate.quotedTotal ?? 0)}</td>
                  <td>
                    <div className="estimateActionsInner">
                      <button type="button" className="estimateTextAction" onClick={() => void toggleDetails(estimate.estimateId)}>
                        {expandedEstimateId === estimate.estimateId ? "Hide scope" : "View scope"}
                      </button>
                      <button type="button" className="estimateTextAction" onClick={() => openPrintPdfPopup(estimate)}>
                        <FileDown size={13} aria-hidden="true" /> PDF
                      </button>
                      {estimate.status === "Draft" && (
                        <button type="button" className="estimateWinAction" onClick={() => openWinDialog(estimate)}>
                          Mark won
                        </button>
                      )}
                      {estimate.projectId && <a className="estimateTextAction" href={`/projects?created=${estimate.projectId}`}>Open project</a>}
                    </div>
                  </td>
                </tr>
                {expandedEstimateId === estimate.estimateId && (
                  <tr>
                    <td colSpan={8} className="estimateScopeCell">
                      {loadingEstimateId === estimate.estimateId ? <p>Loading estimate scope...</p> : detailsById[estimate.estimateId] ? (
                        <div className="estimateScope">
                          <div className="estimateScopeSummary">
                            <span>Markup: {detailsById[estimate.estimateId].markupMode === "perLine" ? "Per line" : `${detailsById[estimate.estimateId].estimateMarkupPercent}% on estimate`}</span>
                            <span>Tax: {detailsById[estimate.estimateId].taxPercent}% of cost (internal only)</span>
                            <span>Round to: {detailsById[estimate.estimateId].roundingIncrement ? money(detailsById[estimate.estimateId].roundingIncrement) : "No rounding"}</span>
                          </div>
                          <ol>
                            {detailsById[estimate.estimateId].lines.map((line) => (
                              <li key={line.estimateLineItemId}>
                                <span>{line.description}</span>
                                <span>{line.quantity} {line.unitName}</span>
                                <span>{money(line.unitCost)} / unit</span>
                                <span>Freight {money(line.freightAmount)} (internal)</span>
                                {detailsById[estimate.estimateId].markupMode === "perLine" && <span>{line.lineMarkupPercent}% markup</span>}
                              </li>
                            ))}
                          </ol>
                        </div>
                      ) : <p>Could not load this estimate&apos;s scope.</p>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {isCreating && (
        <div className="financeImportBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }}>
          <section className="financeImportDialog estimateDialog" role="dialog" aria-modal="true" aria-labelledby="newEstimateTitle">
            <header className="financeImportDialogHeader">
              <div>
                <p className="financeImportEyebrow">LEADS &amp; ESTIMATES</p>
                <h2 id="newEstimateTitle">New estimate</h2>
              </div>
              <button type="button" className="financeImportClose" onClick={closeForm} aria-label="Close estimate form" disabled={isSaving}>×</button>
            </header>
            <form onSubmit={submitEstimate}>
              <fieldset className="financeImportGroup">
                <legend>Quote</legend>
                <div className="financeImportFields">
                  <label className="financeImportField">Estimate name *<input value={estimateName} onChange={(event) => setEstimateName(event.target.value)} maxLength={150} required /></label>
                  <label className="financeImportField">Customer name<input value={customerName} onChange={(event) => setCustomerName(event.target.value)} maxLength={150} /></label>
                </div>
              </fieldset>

              <fieldset className="financeImportGroup">
                <legend>Pricing rules</legend>
                <div className="financeImportFields">
                  <label className="financeImportField">Markup method
                    <select value={markupMode} onChange={(event) => setMarkupMode(event.target.value as EstimateMarkupMode)}>
                      <option value="perLine">Markup per line</option>
                      <option value="estimate">Markup on estimate subtotal</option>
                    </select>
                  </label>
                  {markupMode === "estimate" && <label className="financeImportField">Estimate markup %<input type="number" min="0" max="1000" step="0.01" value={estimateMarkupPercent} onChange={(event) => setEstimateMarkupPercent(asNumber(event.target.value))} /></label>}
                  <label className="financeImportField">Tax % of cost (internal only)<input type="number" min="0" max="100" step="0.01" value={taxPercent} onChange={(event) => setTaxPercent(asNumber(event.target.value))} /></label>
                  <label className="financeImportField">Final rounding
                    <select value={roundingIncrement} onChange={(event) => setRoundingIncrement(Number(event.target.value))}>
                      <option value={0}>No rounding</option>
                      <option value={1}>Nearest dollar</option>
                      <option value={10}>Nearest $10</option>
                      <option value={100}>Nearest $100</option>
                    </select>
                  </label>
                </div>
                <p className="estimateInternalNote">Tax is never shown to the customer — it&apos;s folded into each line&apos;s cost, same as freight below.</p>
              </fieldset>

              <fieldset className="financeImportGroup">
                <legend>Line items</legend>
                <div className="estimateLinesHeader"><span>Description</span><span>Qty</span><span>Unit</span><span>Unit cost</span><span>Freight $ (internal)</span><span>Markup %</span><span /><span /></div>
                {lines.map((line, index) => (
                  <Fragment key={index}>
                    <div className="estimateLineEditor">
                      <input aria-label={`Line ${index + 1} description`} placeholder="Description" value={line.description} maxLength={300} onChange={(event) => updateLine(index, { description: event.target.value })} required />
                      <input aria-label={`Line ${index + 1} quantity`} type="number" min="0.0001" step="0.0001" value={line.quantity} onChange={(event) => updateLine(index, { quantity: asNumber(event.target.value) })} required />
                      <input aria-label={`Line ${index + 1} unit`} placeholder="ea, hr, ft" value={line.unitName ?? ""} maxLength={30} onChange={(event) => updateLine(index, { unitName: event.target.value })} />
                      <input aria-label={`Line ${index + 1} unit cost`} type="number" min="0" step="0.0001" value={line.unitCost} onChange={(event) => updateLine(index, { unitCost: asNumber(event.target.value) })} required />
                      <input aria-label={`Line ${index + 1} freight`} type="number" min="0" step="0.0001" value={line.freightAmount} onChange={(event) => updateLine(index, { freightAmount: asNumber(event.target.value) })} />
                      <input aria-label={`Line ${index + 1} markup percent`} type="number" min="0" max="1000" step="0.01" value={line.lineMarkupPercent} disabled={markupMode === "estimate"} onChange={(event) => updateLine(index, { lineMarkupPercent: asNumber(event.target.value) })} />
                      <button type="button" className="estimateCatalogLine" aria-label={`Pick line ${index + 1} from catalog`} title="Pick from catalog" onClick={() => void openCatalogPicker(index)}><Library size={15} /></button>
                      <button type="button" className="estimateRemoveLine" aria-label={`Remove line ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}><Trash2 size={15} /></button>
                    </div>
                    {line.materialId && (
                      <p className="estimateInternalNote">From catalog — recorded at {money(line.catalogUnitCostAtEntry ?? 0)} as of {line.catalogPriceDate}. This line&apos;s cost can still be changed freely.</p>
                    )}
                  </Fragment>
                ))}
                <button type="button" className="estimateAddLine" onClick={() => setLines((current) => [...current, newLine()])}><Plus size={14} /> Add line</button>
              </fieldset>

              <div className="estimatePreviewTotal">
                <span>Estimated quote total (customer-facing)</span>
                <strong>{money(pricing.quotedTotal)}</strong>
                <small>Internal only — cost {money(pricing.baseSubtotal)} · freight {money(pricing.freightTotal)} · tax {money(pricing.taxTotal)} · markup {money(pricing.markupAmount)}</small>
              </div>
              {error && <p className="financeImportError" role="alert">{error}</p>}
              <div className="financeImportActions">
                <button type="button" className="financeImportCancel" onClick={closeForm} disabled={isSaving}>Cancel</button>
                <button type="submit" className="financeImportSubmit" disabled={isSaving}>{isSaving ? "Saving..." : "Save draft estimate"}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {printPdfPopupOpen && printPdfEstimateId != null && (() => {
        const activeId = printPdfEstimateId;
        const previewEstimate = estimates.find((item) => item.estimateId === activeId);
        const isSavingOptions = printOptionsSaving === activeId;
        return (
          <div className="financeImportBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPrintPdfPopupOpen(false); }}>
            <section className="financeImportDialog estimatePdfDialog" role="dialog" aria-modal="true" aria-labelledby="printPdfTitle">
              <header className="financeImportDialogHeader">
                <div>
                  <p className="financeImportEyebrow">LEADS &amp; ESTIMATES</p>
                  <h2 id="printPdfTitle">Print preview — {previewEstimate?.estimateName ?? "estimate"}</h2>
                </div>
                <button type="button" className="financeImportClose" onClick={() => setPrintPdfPopupOpen(false)} aria-label="Close print preview">×</button>
              </header>
              <fieldset className="estimatePdfOptions" disabled={isSavingOptions}>
                <legend>What should this PDF include?</legend>
                <label className="estimatePdfCheckbox">
                  <input
                    type="checkbox"
                    checked={printOptions.showQuantities}
                    onChange={(event) => void updatePrintOption(activeId, { showQuantities: event.target.checked })}
                  /> Quantities &amp; units
                </label>
                <label className="estimatePdfCheckbox">
                  <input
                    type="checkbox"
                    checked={printOptions.showLineTotals}
                    onChange={(event) => void updatePrintOption(activeId, { showLineTotals: event.target.checked })}
                  /> Line totals
                </label>
                <label className="estimatePdfCheckbox">
                  <input
                    type="checkbox"
                    checked={printOptions.showSummaryTotal}
                    onChange={(event) => void updatePrintOption(activeId, { showSummaryTotal: event.target.checked })}
                  /> Summary total
                </label>
              </fieldset>
              <iframe
                key={pdfPreviewVersion}
                className="estimatePdfPreview"
                src={`/api/sales/estimates/${activeId}/pdf?v=${pdfPreviewVersion}`}
                title={`${previewEstimate?.estimateName ?? "Estimate"} PDF preview`}
              />
              {error && <p className="financeImportError" role="alert">{error}</p>}
              <div className="financeImportActions">
                <button type="button" className="financeImportCancel" onClick={() => setPrintPdfPopupOpen(false)}>Cancel</button>
                <button type="button" className="financeImportSubmit" disabled={isSavingOptions} onClick={() => confirmPrintPdf(activeId)}>Print PDF</button>
              </div>
            </section>
          </div>
        );
      })()}

      {winningEstimate && (
        <div className="financeImportBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !isWinning) setWinningEstimate(null); }}>
          <section className="financeImportDialog financeProjectDialog" role="dialog" aria-modal="true" aria-labelledby="winEstimateTitle">
            <header className="financeImportDialogHeader">
              <div>
                <p className="financeImportEyebrow">LEADS &amp; ESTIMATES</p>
                <h2 id="winEstimateTitle">Send &quot;{winningEstimate.estimateName}&quot; to Projects &amp; Jobs</h2>
              </div>
              <button type="button" className="financeImportClose" onClick={() => setWinningEstimate(null)} aria-label="Close" disabled={isWinning}>×</button>
            </header>
            <form onSubmit={confirmWin}>
              <label className="financeImportField">What kind of work is this?
                <select value={winEngagementType} onChange={(event) => setWinEngagementType(event.target.value as EngagementType)}>
                  <option value="Project">Project (one-time, single team for its duration)</option>
                  <option value="Service">Service (recurring maintenance or a one-off field visit)</option>
                </select>
              </label>
              {winEngagementType === "Service" && (
                <label className="financeImportField">Recurrence
                  <select value={winRecurrence} onChange={(event) => setWinRecurrence(event.target.value as RecurrenceFrequency)}>
                    <option value="Weekly">Weekly</option>
                    <option value="Biweekly">Biweekly</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                </label>
              )}
              {winError && <p className="financeImportError" role="alert">{winError}</p>}
              <div className="financeImportActions">
                <button type="button" className="financeImportCancel" onClick={() => setWinningEstimate(null)} disabled={isWinning}>Cancel</button>
                <button type="submit" className="financeImportSubmit" disabled={isWinning}>{isWinning ? "Converting..." : "Confirm"}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {catalogPickerLine != null && (
        <div className="financeImportBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCatalogPickerLine(null); }}>
          <section className="financeImportDialog financeProjectDialog" role="dialog" aria-modal="true" aria-labelledby="catalogPickerTitle">
            <header className="financeImportDialogHeader">
              <div>
                <p className="financeImportEyebrow">MATERIAL CATALOG</p>
                <h2 id="catalogPickerTitle">Pick a material</h2>
              </div>
              <button type="button" className="financeImportClose" onClick={() => setCatalogPickerLine(null)} aria-label="Close">×</button>
            </header>
            <input
              autoFocus
              className="invoiceSearchInput"
              placeholder="Search materials..."
              value={catalogSearch}
              onChange={(event) => setCatalogSearch(event.target.value)}
            />
            <ol className="estimateScope">
              {catalogMaterials == null ? (
                <p>Loading catalog...</p>
              ) : catalogMaterials.length === 0 ? (
                <p>No materials in the catalog yet. Add some from the Material Catalog page.</p>
              ) : (
                catalogMaterials
                  .filter((material) => material.materialName.toLowerCase().includes(catalogSearch.trim().toLowerCase()))
                  .map((material) => (
                    <li key={material.materialId}>
                      <button type="button" className="estimateTextAction" onClick={() => pickMaterial(material)}>
                        {material.materialName} — {money(material.latestUnitCost ?? 0)}{material.unitName ? ` / ${material.unitName}` : ""}
                        {material.latestQuotedDate ? ` (as of ${material.latestQuotedDate})` : ""}
                      </button>
                    </li>
                  ))
              )}
            </ol>
          </section>
        </div>
      )}
    </section>
  );
}
