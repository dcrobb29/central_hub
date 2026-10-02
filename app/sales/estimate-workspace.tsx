"use client";

import { Fragment, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FileDown, Library, Plus, Trash2 } from "lucide-react";
import {
  calculateEstimate,
  type EstimateMarkupMode,
} from "@/app/lib/estimate-pricing";
import type {
  EstimateDetails,
  EstimateGroupingMode,
  EstimateLineInput,
  EstimatePrintOptions,
  EstimateSummary,
  LineType,
} from "@/app/lib/estimates";
import type { MaterialWithLatestPrice } from "@/app/lib/materials";
import { useFilterableTable, type TableColumn } from "@/app/lib/use-filterable-table";
import { FilterableTableHeaderCell } from "@/app/components/filterable-table-header-cell";
import Modal from "@/app/components/modal";


const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const money = (value: number) => currency.format(value || 0);

type EstimateLineDraft = EstimateLineInput;

type EngagementType = "Project" | "Service";
type RecurrenceFrequency = "Weekly" | "Biweekly" | "Monthly";

type Column = TableColumn<EstimateSummary>;

const COLUMNS: Column[] = [
  { key: "estimateName", label: "Estimate" },
  { key: "customerName", label: "Customer" },
  { key: "status", label: "Status" },
  { key: "revisionNumber", label: "Revision" },
  { key: "lineCount", label: "Lines" },
  { key: "quotedTotal", label: "Total" },
];

function formatValue(key: keyof EstimateSummary, value: EstimateSummary[keyof EstimateSummary]) {
  if (key === "customerName" && (value == null || value === "")) return "Unassigned";
  if (value == null || value === "") return "—";
  if (key === "quotedTotal") return money(Number(value) || 0);
  if (key === "revisionNumber") return value ? `R${value}` : "—";
  return String(value).trim();
}

function searchableValue(key: keyof EstimateSummary, value: EstimateSummary[keyof EstimateSummary]) {
  const raw = String(value ?? "").trim();
  const display = formatValue(key, value);
  return `${raw} ${display}`.toLocaleLowerCase();
}

function compareEstimates(left: EstimateSummary, right: EstimateSummary, key: keyof EstimateSummary) {
  const leftValue = left[key];
  const rightValue = right[key];
  if (key === "quotedTotal" || key === "lineCount" || key === "revisionNumber") {
    return (Number(leftValue) || 0) - (Number(rightValue) || 0);
  }
  return String(leftValue ?? "").trim().localeCompare(String(rightValue ?? "").trim(), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function newLine(): EstimateLineDraft {
  return {
    description: "", quantity: 1, unitName: "", unitCost: 0, freightAmount: 0, lineMarkupPercent: 0,
    materialId: null, catalogUnitCostAtEntry: null, catalogPriceDate: null, lineType: "Material", scopeName: null,
  };
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
  const [groupingMode, setGroupingMode] = useState<EstimateGroupingMode>("None");
  const [scopes, setScopes] = useState<string[]>([]);
  const [lines, setLines] = useState<EstimateLineDraft[]>([newLine()]);
  // Collapse state for the scope-of-work parent containers, keyed by scope name ("__ungrouped" for unassigned lines).
  const [collapsedFormScopes, setCollapsedFormScopes] = useState<Record<string, boolean>>({});
  // Collapse state for the read-only "View scope" detail panel, keyed by `${estimateId}:${groupKey}`.
  const [collapsedDetailScopes, setCollapsedDetailScopes] = useState<Record<string, boolean>>({});
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
    showScopesOfWork: false,
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

  // edit flow: non-null while the create/edit form is prefilled for an existing (non-won) estimate
  const [editingEstimateId, setEditingEstimateId] = useState<number | null>(null);
  const [loadingEditEstimateId, setLoadingEditEstimateId] = useState<number | null>(null);

  // delete flow: a draft/lost estimate pending a confirm-or-cancel decision
  const [deletingEstimate, setDeletingEstimate] = useState<EstimateSummary | null>(null);
  const [isDeletingEstimate, setIsDeletingEstimate] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // catalog picker: which line is currently choosing a material, plus the lazily-fetched list
  const [catalogPickerLine, setCatalogPickerLine] = useState<number | null>(null);
  const [catalogMaterials, setCatalogMaterials] = useState<MaterialWithLatestPrice[] | null>(null);
  const [catalogSearch, setCatalogSearch] = useState("");

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
    visibleRows: visibleEstimates,
    clearFilters,
    hasActiveFilters,
  } = useFilterableTable(estimates, COLUMNS, { searchableValue, compare: compareEstimates });

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
    setGroupingMode("None");
    setScopes([]);
    setRoundingIncrement(0);
    setLines([newLine()]);
    setError(null);
    setPrintPdfPopupOpen(false);
    setCollapsedFormScopes({});
    setEditingEstimateId(null);
  }

  function closeForm() {
    if (isSaving) return;
    setIsCreating(false);
    resetForm();
  }

  // Loads an existing (non-won) estimate's full details and prefills the create form with them so
  // the same Modal can be reused for both creating and editing.
  async function openEditForm(estimate: EstimateSummary) {
    setLoadingEditEstimateId(estimate.estimateId);
    setError(null);
    try {
      const response = await fetch(`/api/sales/estimates?estimateId=${estimate.estimateId}`);
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Unable to load estimate");
      const details = result as EstimateDetails;
      setEstimateName(details.estimateName);
      setCustomerName(details.customerName ?? "");
      setMarkupMode(details.markupMode);
      setEstimateMarkupPercent(details.estimateMarkupPercent);
      setTaxPercent(details.taxPercent);
      setRoundingIncrement(details.roundingIncrement);
      setGroupingMode(details.groupingMode);
      setScopes([...details.scopes].sort((a, b) => a.sortOrder - b.sortOrder).map((scope) => scope.scopeName));
      setLines(details.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitName: line.unitName,
        unitCost: line.unitCost,
        freightAmount: line.freightAmount,
        lineMarkupPercent: line.lineMarkupPercent,
        materialId: line.materialId,
        catalogUnitCostAtEntry: line.catalogUnitCostAtEntry,
        catalogPriceDate: line.catalogPriceDate,
        lineType: line.lineType,
        scopeName: line.scopeName,
      })));
      setCollapsedFormScopes({});
      setEditingEstimateId(estimate.estimateId);
      setIsCreating(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load estimate");
    } finally {
      setLoadingEditEstimateId(null);
    }
  }

  function openDeleteDialog(estimate: EstimateSummary) {
    setDeletingEstimate(estimate);
    setDeleteError(null);
  }

  function closeDeleteDialog() {
    if (isDeletingEstimate) return;
    setDeletingEstimate(null);
    setDeleteError(null);
  }

  async function confirmDeleteEstimate() {
    if (!deletingEstimate) return;
    setIsDeletingEstimate(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/sales/estimates/${deletingEstimate.estimateId}`, { method: "DELETE" });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error ?? "Unable to delete estimate");
      }
      setDeletingEstimate(null);
      router.refresh();
    } catch (deleteErr) {
      setDeleteError(deleteErr instanceof Error ? deleteErr.message : "Unable to delete estimate");
    } finally {
      setIsDeletingEstimate(false);
    }
  }

  function updateLine(index: number, patch: Partial<EstimateLineDraft>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  }

  function renderLineEditor(index: number) {
    const line = lines[index];
    return (
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
        <div className="estimateLineMeta">
          <label className="estimateLineMetaField">Type
            <select aria-label={`Line ${index + 1} type`} value={line.lineType} onChange={(event) => updateLine(index, { lineType: event.target.value as LineType })}>
              <option value="Material">Material</option>
              <option value="Labor">Labor</option>
              <option value="Equipment">Equipment</option>
            </select>
          </label>
          {groupingMode === "Scope" && (
            <label className="estimateLineMetaField">Scope
              <select aria-label={`Line ${index + 1} scope`} value={line.scopeName ?? ""} onChange={(event) => updateLine(index, { scopeName: event.target.value || null })}>
                <option value="">Ungrouped</option>
                {scopes.filter((scope) => scope.trim()).map((scope) => (
                  <option key={scope} value={scope}>{scope}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        {line.materialId && (
          <p className="estimateInternalNote">From catalog — recorded at {money(line.catalogUnitCostAtEntry ?? 0)} as of {line.catalogPriceDate}. This line&apos;s cost can still be changed freely.</p>
        )}
      </Fragment>
    );
  }

  function addScope() {
    setScopes((current) => [...current, ""]);
  }

  function renameScope(index: number, value: string) {
    setScopes((current) => {
      const previousName = current[index];
      const next = current.map((scope, scopeIndex) => scopeIndex === index ? value : scope);
      // Keep any lines already assigned to this scope pointed at its new name.
      if (previousName) {
        setLines((currentLines) => currentLines.map((line) => line.scopeName === previousName ? { ...line, scopeName: value || null } : line));
      }
      return next;
    });
  }

  function removeScope(index: number) {
    setScopes((current) => {
      const removedName = current[index];
      if (removedName) {
        setLines((currentLines) => currentLines.map((line) => line.scopeName === removedName ? { ...line, scopeName: null } : line));
      }
      return current.filter((_, scopeIndex) => scopeIndex !== index);
    });
  }

  function changeGroupingMode(mode: EstimateGroupingMode) {
    setGroupingMode(mode);
    if (mode !== "Scope") {
      // Scope assignments only make sense while grouping by scope is active.
      setLines((current) => current.map((line) => ({ ...line, scopeName: null })));
    }
  }

  const UNGROUPED_KEY = "__ungrouped";

  // Builds the scope "parent containers" for the line-item editor: one group per defined scope
  // (in order) plus a trailing "Ungrouped" group for lines with no scope (or a scope that was removed).
  function lineGroupsForForm() {
    const trimmedScopes = scopes.map((scope) => scope.trim()).filter((scope) => scope.length > 0);
    const groups = trimmedScopes.map((name) => ({
      key: name,
      title: name,
      indexes: lines.reduce<number[]>((acc, line, index) => {
        if (line.scopeName === name) acc.push(index);
        return acc;
      }, []),
    }));
    const ungroupedIndexes = lines.reduce<number[]>((acc, line, index) => {
      if (!line.scopeName || !trimmedScopes.includes(line.scopeName)) acc.push(index);
      return acc;
    }, []);
    groups.push({ key: UNGROUPED_KEY, title: "Ungrouped", indexes: ungroupedIndexes });
    return groups;
  }

  function toggleFormScopeCollapse(key: string) {
    setCollapsedFormScopes((current) => ({ ...current, [key]: !current[key] }));
  }

  function addLineToGroup(key: string) {
    const scopeName = key === UNGROUPED_KEY ? null : key;
    setLines((current) => [...current, { ...newLine(), scopeName }]);
  }

  function toggleDetailScopeCollapse(key: string) {
    setCollapsedDetailScopes((current) => ({ ...current, [key]: !current[key] }));
  }

  async function submitEstimate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const url = editingEstimateId != null ? `/api/sales/estimates/${editingEstimateId}` : "/api/sales/estimates";
      const response = await fetch(url, {
        method: editingEstimateId != null ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimateName,
          customerName,
          markupMode,
          estimateMarkupPercent,
          taxPercent,
          roundingIncrement,
          groupingMode,
          scopes: scopes.map((scope) => scope.trim()).filter((scope) => scope.length > 0),
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
            lineType: line.lineType,
            scopeName: groupingMode === "Scope" ? line.scopeName : null,
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
      showScopesOfWork: estimate.showScopesOfWork,
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
    <section className="salesWorkspace" ref={filterControlRoot}>
      <header className="salesToolbar">
        <div>
          <p className="salesEyebrow">SALES</p>
          <h1>Sales &amp; Estimates</h1>
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

      <div className="invoiceTableTools">
        <label className="invoiceSearchLabel">
          Search estimates
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search every column"
            className="invoiceSearchInput"
          />
        </label>
        <span className="invoiceResultCount" aria-live="polite">
          {visibleEstimates.length} of {estimates.length} estimates
        </span>
        {hasActiveFilters && (
          <button type="button" className="invoiceClearButton" onClick={clearFilters}>Clear</button>
        )}
      </div>

      <div className="invoiceTableWrapper salesEstimateTableWrapper">
        <table className="invoiceTable salesEstimateTable">
          <thead>
            <tr>
              {COLUMNS.map((column, index) => (
                <FilterableTableHeaderCell
                  key={column.key}
                  column={column}
                  idPrefix="estimate"
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
            {visibleEstimates.length === 0 ? (
              <tr><td colSpan={COLUMNS.length + 1} className="invoiceNoResults">{estimates.length === 0 ? "No estimates yet." : "No estimates match these filters."}</td></tr>
            ) : visibleEstimates.map((estimate) => (
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
                      {estimate.status !== "Won" && (
                        <>
                          <button
                            type="button"
                            className="estimateTextAction"
                            disabled={loadingEditEstimateId === estimate.estimateId}
                            onClick={() => void openEditForm(estimate)}
                          >
                            {loadingEditEstimateId === estimate.estimateId ? "Loading..." : "Edit"}
                          </button>
                          <button type="button" className="estimateDangerAction" onClick={() => openDeleteDialog(estimate)}>
                            Delete
                          </button>
                        </>
                      )}
                      {estimate.projectId && <a className="estimateTextAction" href={`/projects?created=${estimate.projectId}`}>Open project</a>}
                    </div>
                  </td>
                </tr>
                {expandedEstimateId === estimate.estimateId && (
                  <tr>
                    <td colSpan={COLUMNS.length + 1} className="estimateScopeCell">
                      {loadingEstimateId === estimate.estimateId ? <p>Loading estimate scope...</p> : detailsById[estimate.estimateId] ? (() => {
                        const details = detailsById[estimate.estimateId];
                        const lineItem = (line: EstimateDetails["lines"][number]) => (
                          <li key={line.estimateLineItemId}>
                            <span>{line.description}</span>
                            <span>{line.quantity} {line.unitName}</span>
                            <span>{money(line.unitCost)} / unit</span>
                            <span>Freight {money(line.freightAmount)} (internal)</span>
                            {details.markupMode === "perLine" && <span>{line.lineMarkupPercent}% markup</span>}
                            <span className="estimateLineTypeBadge">{line.lineType}</span>
                          </li>
                        );
                        // A scope (or type) group renders as a collapsible "parent row": its header toggles
                        // whether the nested line items beneath it are shown, mirroring the View/Hide scope action.
                        const groupSection = (key: string, title: string, groupLines: EstimateDetails["lines"]) => {
                          const collapseKey = `${estimate.estimateId}:${key}`;
                          const collapsed = collapsedDetailScopes[collapseKey];
                          return (
                            <div key={key} className="estimateScopeGroup">
                              <button
                                type="button"
                                className="estimateScopeToggle"
                                aria-expanded={!collapsed}
                                onClick={() => toggleDetailScopeCollapse(collapseKey)}
                              >
                                <span className="estimateScopeToggleIcon">{collapsed ? "▸" : "▾"}</span>
                                <h4>{title}</h4>
                                <span className="estimateLineGroupCount">({groupLines.length} line{groupLines.length === 1 ? "" : "s"})</span>
                              </button>
                              {!collapsed && <ol>{groupLines.map(lineItem)}</ol>}
                            </div>
                          );
                        };
                        let groupedContent: ReactNode;
                        if (details.groupingMode === "Scope") {
                          const orderedScopes = [...details.scopes].sort((a, b) => a.sortOrder - b.sortOrder);
                          const ungrouped = details.lines.filter((line) => line.estimateScopeOfWorkId === null);
                          groupedContent = (
                            <>
                              {orderedScopes.map((scope) => {
                                const scopeLines = details.lines.filter((line) => line.estimateScopeOfWorkId === scope.estimateScopeOfWorkId);
                                if (scopeLines.length === 0) return null;
                                return groupSection(`scope-${scope.estimateScopeOfWorkId}`, scope.scopeName, scopeLines);
                              })}
                              {ungrouped.length > 0 && groupSection("ungrouped", "Ungrouped", ungrouped)}
                            </>
                          );
                        } else if (details.groupingMode === "Type") {
                          groupedContent = (
                            <>
                              {(["Material", "Labor", "Equipment"] as const).map((lineType) => {
                                const typeLines = details.lines.filter((line) => line.lineType === lineType);
                                if (typeLines.length === 0) return null;
                                return groupSection(`type-${lineType}`, lineType, typeLines);
                              })}
                            </>
                          );
                        } else {
                          groupedContent = <ol>{details.lines.map(lineItem)}</ol>;
                        }
                        return (
                          <div className="estimateScope">
                            <div className="estimateScopeSummary">
                              <span>Markup: {details.markupMode === "perLine" ? "Per line" : `${details.estimateMarkupPercent}% on estimate`}</span>
                              <span>Tax: {details.taxPercent}% of cost (internal only)</span>
                              <span>Round to: {details.roundingIncrement ? money(details.roundingIncrement) : "No rounding"}</span>
                              <span>Grouping: {details.groupingMode === "None" ? "None" : details.groupingMode === "Scope" ? "By scope of work" : "By line type"}</span>
                            </div>
                            {groupedContent}
                          </div>
                        );
                      })() : <p>Could not load this estimate&apos;s scope.</p>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {isCreating && (
        <Modal titleId="newEstimateTitle" title={editingEstimateId != null ? "Edit estimate" : "New estimate"} eyebrow="SALES & ESTIMATES" onClose={closeForm} closeDisabled={isSaving} closeLabel="Close estimate form" className="estimateDialog">
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
                  <label className="financeImportField">Group by
                    <select value={groupingMode} onChange={(event) => changeGroupingMode(event.target.value as EstimateGroupingMode)}>
                      <option value="None">No grouping</option>
                      <option value="Scope">Group by Scope of work</option>
                      <option value="Type">Group by Type (Material, Labor, Equipment)</option>
                    </select>
                  </label>
                </div>
              </fieldset>

              {groupingMode === "Scope" && (
                <fieldset className="financeImportGroup">
                  <legend>Scopes of work</legend>
                  <p className="estimateInternalNote">Define the scopes of work for this project (e.g. &quot;Pavers&quot;, &quot;Irrigation&quot;). Each line item below can then be assigned to one of these, or left ungrouped.</p>
                  {scopes.map((scope, index) => (
                    <div key={index} className="estimateScopeEditor">
                      <input
                        aria-label={`Scope ${index + 1} name`}
                        placeholder="Scope name (e.g. Pavers)"
                        value={scope}
                        maxLength={150}
                        onChange={(event) => renameScope(index, event.target.value)}
                      />
                      <button type="button" className="estimateRemoveLine" aria-label={`Remove scope ${index + 1}`} onClick={() => removeScope(index)}><Trash2 size={15} /></button>
                    </div>
                  ))}
                  <button type="button" className="estimateAddLine" onClick={addScope}><Plus size={14} /> Add scope</button>
                </fieldset>
              )}

              <fieldset className="financeImportGroup">
                <legend>Line items</legend>
                <div className="estimateLinesHeader"><span>Description</span><span>Qty</span><span>Unit</span><span>Unit cost</span><span>Freight $ (internal)</span><span>Markup %</span><span /><span /></div>
                {groupingMode === "Scope" ? (
                  lineGroupsForForm().map((group) => {
                    const collapsed = collapsedFormScopes[group.key];
                    return (
                      <div key={group.key} className="estimateLineGroup">
                        <button
                          type="button"
                          className="estimateScopeToggle"
                          aria-expanded={!collapsed}
                          onClick={() => toggleFormScopeCollapse(group.key)}
                        >
                          <span className="estimateScopeToggleIcon">{collapsed ? "▸" : "▾"}</span>
                          <h4>{group.title}</h4>
                          <span className="estimateLineGroupCount">({group.indexes.length} line{group.indexes.length === 1 ? "" : "s"})</span>
                        </button>
                        {!collapsed && (
                          <div className="estimateLineGroupBody">
                            {group.indexes.map((index) => renderLineEditor(index))}
                            <button type="button" className="estimateAddLine estimateAddLineNested" onClick={() => addLineToGroup(group.key)}>
                              <Plus size={14} /> Add line to {group.title}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <>
                    {lines.map((_, index) => renderLineEditor(index))}
                    <button type="button" className="estimateAddLine" onClick={() => setLines((current) => [...current, newLine()])}><Plus size={14} /> Add line</button>
                  </>
                )}
              </fieldset>

              <div className="estimatePreviewTotal">
                <strong>{money(pricing.quotedTotal)}</strong>
                <small>Internal only — cost {money(pricing.baseSubtotal)} · freight {money(pricing.freightTotal)} · tax {money(pricing.taxTotal)} · markup {money(pricing.markupAmount)}</small>
              </div>
              {error && <p className="financeImportError" role="alert">{error}</p>}
              <div className="financeImportActions">
                <button type="button" className="financeImportCancel" onClick={closeForm} disabled={isSaving}>Cancel</button>
                <button type="submit" className="financeImportSubmit" disabled={isSaving}>
                  {isSaving ? "Saving..." : editingEstimateId != null ? "Save changes" : "Save draft estimate"}
                </button>
              </div>
            </form>
        </Modal>
      )}

      {printPdfPopupOpen && printPdfEstimateId != null && (() => {
        const activeId = printPdfEstimateId;
        const previewEstimate = estimates.find((item) => item.estimateId === activeId);
        const isSavingOptions = printOptionsSaving === activeId;
        return (
          <Modal titleId="printPdfTitle" title={<>Print preview — {previewEstimate?.estimateName ?? "estimate"}</>} eyebrow="SALES & ESTIMATES" onClose={() => setPrintPdfPopupOpen(false)} closeLabel="Close print preview" className="estimatePdfDialog">
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
                {previewEstimate?.groupingMode === "Scope" && (
                  <label className="estimatePdfCheckbox">
                    <input
                      type="checkbox"
                      checked={printOptions.showScopesOfWork}
                      onChange={(event) => void updatePrintOption(activeId, { showScopesOfWork: event.target.checked })}
                    /> Scopes of work
                  </label>
                )}
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
          </Modal>
        );
      })()}

      {winningEstimate && (
        <Modal titleId="winEstimateTitle" title={<>Send &quot;{winningEstimate.estimateName}&quot; to Projects &amp; Jobs</>} eyebrow="SALES & ESTIMATES" onClose={() => { if (!isWinning) setWinningEstimate(null); }} closeDisabled={isWinning} className="financeProjectDialog">
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
        </Modal>
      )}

      {deletingEstimate && (
        <Modal
          titleId="estimateDeleteTitle"
          title="Delete estimate"
          eyebrow="SALES & ESTIMATES"
          onClose={closeDeleteDialog}
          closeDisabled={isDeletingEstimate}
          closeLabel="Close delete confirmation"
          className="financeConfirmDialog"
        >
          <p className="financeImportHint">
            Delete estimate <strong>{deletingEstimate.estimateName}</strong>? This cannot be undone.
          </p>
          {deleteError && <p className="financeImportError" role="alert">{deleteError}</p>}
          <div className="financeImportActions">
            <button type="button" className="financeImportCancel" onClick={closeDeleteDialog} disabled={isDeletingEstimate}>Cancel</button>
            <button type="button" className="financeImportDanger" onClick={() => void confirmDeleteEstimate()} disabled={isDeletingEstimate}>
              {isDeletingEstimate ? "Deleting..." : "Delete estimate"}
            </button>
          </div>
        </Modal>
      )}

      {catalogPickerLine != null && (
        <Modal titleId="catalogPickerTitle" title="Pick a material" eyebrow="MATERIAL CATALOG" onClose={() => setCatalogPickerLine(null)} className="financeProjectDialog">
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
        </Modal>
      )}
    </section>
  );
}
