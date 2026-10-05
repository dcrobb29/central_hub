"use client";

import { Fragment, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FileDown, Library, Plus, Trash2 } from "lucide-react";
import {
  calculateEstimate,
  type EstimateMarkupMode,
} from "@/app/lib/estimate-pricing";
import type {
  EngagementType,
  EstimateDetails,
  EstimateGroupingMode,
  EstimateLineInput,
  EstimatePrintOptions,
  EstimateSummary,
  LineType,
  RecurrenceFrequency,
} from "@/app/lib/estimates";
import type { MaterialWithLatestPrice } from "@/app/lib/materials";
import type { ScopeTemplateDetails, ScopeTemplateSummary } from "@/app/lib/scope-templates";
import { useFilterableTable, type TableColumn } from "@/app/lib/use-filterable-table";
import { FilterableTableHeaderCell } from "@/app/components/filterable-table-header-cell";
import Modal from "@/app/components/modal";
import { ESTIMATE_NOTES_MAX_LENGTH } from "@/app/lib/estimate-notes";
import {
  defaultUnitAbbreviation,
  findUnitPreset,
  requireUnitAbbreviation,
  type UnitPreset,
} from "@/app/lib/unit-presets";


const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const money = (value: number) => currency.format(value || 0);

type EstimateLineDraft = EstimateLineInput;

const FREQUENCY_LABELS: Record<string, string> = {
  Weekly: "Weekly",
  Biweekly: "Biweekly",
  Monthly: "Monthly",
  Quarterly: "Quarterly",
  SemiAnnually: "Semi-annually",
  Annually: "Annually",
};

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString();
}

type Column = TableColumn<EstimateSummary>;

const PROJECT_COLUMNS: Column[] = [
  { key: "estimateName", label: "Estimate" },
  { key: "customerName", label: "Customer" },
  { key: "status", label: "Status" },
  { key: "lineCount", label: "Lines" },
  { key: "quotedTotal", label: "Total" },
];

const RECURRING_COLUMNS: Column[] = [
  { key: "estimateName", label: "Estimate" },
  { key: "customerName", label: "Customer" },
  { key: "status", label: "Status" },
  { key: "recurrenceFrequency", label: "Frequency" },
  { key: "expectedStartDate", label: "Start" },
  { key: "expectedEndDate", label: "End" },
  { key: "lineCount", label: "Lines" },
  { key: "quotedTotal", label: "Total" },
];

function formatValue(key: keyof EstimateSummary, value: EstimateSummary[keyof EstimateSummary]) {
  if (key === "customerName" && (value == null || value === "")) return "Unassigned";
  if (key === "recurrenceFrequency") return value ? (FREQUENCY_LABELS[String(value)] ?? String(value)) : "—";
  if (key === "expectedStartDate") return value ? formatDate(String(value)) : "—";
  if (key === "expectedEndDate") return value ? formatDate(String(value)) : "Ongoing";
  if (value == null || value === "") return "—";
  if (key === "quotedTotal") return money(Number(value) || 0);
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
  if (key === "quotedTotal" || key === "lineCount") {
    return (Number(leftValue) || 0) - (Number(rightValue) || 0);
  }
  return String(leftValue ?? "").trim().localeCompare(String(rightValue ?? "").trim(), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function createLine(unitName: string): EstimateLineDraft {
  return {
    description: "", quantity: 1, unitName, unitCost: 0, freightAmount: 0, lineMarkupPercent: 0,
    materialId: null, catalogUnitCostAtEntry: null, catalogPriceDate: null, lineType: "Material", scopeName: null,
  };
}

function asNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function EstimateWorkspace({ estimates, unitPresets }: { estimates: EstimateSummary[]; unitPresets: UnitPreset[] }) {
  const defaultUnit = defaultUnitAbbreviation(unitPresets);

  function newLine(): EstimateLineDraft {
    return createLine(defaultUnit);
  }

  function importedUnit(value: string | null): string {
    return findUnitPreset(value, unitPresets)?.abbreviation ?? (value?.trim() || defaultUnit);
  }
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [estimateName, setEstimateName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [markupMode, setMarkupMode] = useState<EstimateMarkupMode>("perLine");
  const [estimateMarkupPercent, setEstimateMarkupPercent] = useState(0);
  const [taxPercent, setTaxPercent] = useState(0);
  const [roundingIncrement, setRoundingIncrement] = useState(0);
  const [groupingMode, setGroupingMode] = useState<EstimateGroupingMode>("None");
  const [activeEngagementTab, setActiveEngagementTab] = useState<EngagementType>("Project");
  const [engagementType, setEngagementType] = useState<EngagementType>("Project");
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurrenceFrequency>("Weekly");
  const [expectedStartDate, setExpectedStartDate] = useState<string | null>(null);
  const [expectedEndDate, setExpectedEndDate] = useState<string | null>(null);
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

  // win flow: a plain confirmation now, since engagement type/recurrence are decided at creation
  // time and simply carry through onto the new Project row.
  const [winningEstimate, setWinningEstimate] = useState<EstimateSummary | null>(null);
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

  // scope template picker: a two-step modal (pick a template, then enter its top quantity) that
  // stamps a new scope + pre-scaled lines into the form. Once applied, the lines have no further
  // link back to the template — editing them afterward is identical to editing any other line.
  const [scopeTemplatePickerOpen, setScopeTemplatePickerOpen] = useState(false);
  const [scopeTemplates, setScopeTemplates] = useState<ScopeTemplateSummary[] | null>(null);
  const [scopeTemplateSearch, setScopeTemplateSearch] = useState("");
  const [selectedScopeTemplate, setSelectedScopeTemplate] = useState<ScopeTemplateDetails | null>(null);
  const [loadingScopeTemplateId, setLoadingScopeTemplateId] = useState<number | null>(null);
  const [scopeTemplateQuantity, setScopeTemplateQuantity] = useState(1);
  const [scopeTemplateError, setScopeTemplateError] = useState<string | null>(null);

  const projectEstimates = estimates.filter((estimate) => estimate.engagementType === "Project");
  const recurringEstimates = estimates.filter((estimate) => estimate.engagementType === "Service");

  const projectTable = useFilterableTable(projectEstimates, PROJECT_COLUMNS, { searchableValue, compare: compareEstimates });
  const recurringTable = useFilterableTable(recurringEstimates, RECURRING_COLUMNS, { searchableValue, compare: compareEstimates });

  const activeColumns = activeEngagementTab === "Project" ? PROJECT_COLUMNS : RECURRING_COLUMNS;
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
  } = activeEngagementTab === "Project" ? projectTable : recurringTable;

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
    setInternalNotes("");
    setCustomerNotes("");
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
    setEngagementType(activeEngagementTab);
    setRecurrenceFrequency("Weekly");
    setExpectedStartDate(null);
    setExpectedEndDate(null);
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
      setInternalNotes(details.internalNotes ?? "");
      setCustomerNotes(details.customerNotes ?? "");
      setMarkupMode(details.markupMode);
      setEstimateMarkupPercent(details.estimateMarkupPercent);
      setTaxPercent(details.taxPercent);
      setRoundingIncrement(details.roundingIncrement);
      setGroupingMode(details.groupingMode);
      setEngagementType(details.engagementType);
      setRecurrenceFrequency(details.recurrenceFrequency ?? "Weekly");
      setExpectedStartDate(details.expectedStartDate);
      setExpectedEndDate(details.expectedEndDate);
      setScopes([...details.scopes].sort((a, b) => a.sortOrder - b.sortOrder).map((scope) => scope.scopeName));
      setLines(details.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitName: importedUnit(line.unitName),
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
          <select aria-label={`Line ${index + 1} unit`} value={line.unitName ?? ""} onChange={(event) => updateLine(index, { unitName: event.target.value })} required>
            <option value="" disabled>Choose unit</option>
            {line.unitName && !findUnitPreset(line.unitName, unitPresets) && (
              <option value={line.unitName} disabled>{line.unitName} (choose preset)</option>
            )}
            {unitPresets.map((preset) => (
              <option key={preset.abbreviation} value={preset.abbreviation} title={preset.unitName}>{preset.abbreviation}</option>
            ))}
          </select>
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
      const canonicalLines = lines.map((line, index) => ({
        ...line,
        unitName: requireUnitAbbreviation(line.unitName, unitPresets, index + 1),
      }));
      const url = editingEstimateId != null ? `/api/sales/estimates/${editingEstimateId}` : "/api/sales/estimates";
      const response = await fetch(url, {
        method: editingEstimateId != null ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimateName,
          customerName,
          internalNotes,
          customerNotes,
          markupMode,
          estimateMarkupPercent,
          taxPercent,
          roundingIncrement,
          groupingMode,
          engagementType,
          recurrenceFrequency: engagementType === "Service" ? recurrenceFrequency : null,
          expectedStartDate: engagementType === "Service" ? expectedStartDate : null,
          expectedEndDate: engagementType === "Service" ? expectedEndDate : null,
          scopes: scopes.map((scope) => scope.trim()).filter((scope) => scope.length > 0),
          lines: canonicalLines.map((line) => ({
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
      unitName: importedUnit(material.unitName),
      unitCost: material.latestUnitCost ?? 0,
      materialId: material.materialId,
      catalogUnitCostAtEntry: material.latestUnitCost,
      catalogPriceDate: material.latestQuotedDate,
    });
    setCatalogPickerLine(null);
  }

  async function openScopeTemplatePicker() {
    setScopeTemplatePickerOpen(true);
    setSelectedScopeTemplate(null);
    setScopeTemplateQuantity(1);
    setScopeTemplateError(null);
    setScopeTemplateSearch("");
    if (scopeTemplates) return;
    try {
      const response = await fetch("/api/sales/scope-templates");
      const result = await response.json().catch(() => null);
      if (response.ok) setScopeTemplates(result.scopeTemplates ?? []);
    } catch {
      setScopeTemplates([]);
    }
  }

  async function selectScopeTemplate(summary: ScopeTemplateSummary) {
    setLoadingScopeTemplateId(summary.scopeTemplateId);
    setScopeTemplateError(null);
    try {
      const response = await fetch(`/api/sales/scope-templates/${summary.scopeTemplateId}`);
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Unable to load scope template");
      setSelectedScopeTemplate(result.scopeTemplate as ScopeTemplateDetails);
      setScopeTemplateQuantity(1);
    } catch (loadError) {
      setScopeTemplateError(loadError instanceof Error ? loadError.message : "Unable to load scope template");
    } finally {
      setLoadingScopeTemplateId(null);
    }
  }

  // Picks a name for the new scope that doesn't collide with one already on the form, so applying
  // the same template twice (e.g. two separate paver areas) doesn't silently merge their lines.
  function uniqueScopeName(baseName: string) {
    const existing = new Set(scopes.map((scope) => scope.trim()));
    if (!existing.has(baseName)) return baseName;
    let suffix = 2;
    while (existing.has(`${baseName} (${suffix})`)) suffix += 1;
    return `${baseName} (${suffix})`;
  }

  function applyScopeTemplate() {
    if (!selectedScopeTemplate) return;
    if (!(scopeTemplateQuantity > 0)) {
      setScopeTemplateError(`Enter a ${selectedScopeTemplate.unitName} quantity greater than 0`);
      return;
    }
    const scopeName = uniqueScopeName(selectedScopeTemplate.templateName);
    const newLines: EstimateLineDraft[] = selectedScopeTemplate.components.map((component) => ({
      description: component.description,
      quantity: Number((component.quantityPerUnit * scopeTemplateQuantity).toFixed(6)),
      unitName: importedUnit(component.unitName),
      unitCost: component.unitCost,
      freightAmount: 0,
      lineMarkupPercent: 0,
      materialId: component.materialId,
      catalogUnitCostAtEntry: null,
      catalogPriceDate: null,
      lineType: component.lineType,
      scopeName,
    }));
    setScopes((current) => [...current, scopeName]);
    setLines((current) => {
      // The lone placeholder blank line from a brand-new form is never worth keeping once real
      // lines arrive, so drop it instead of leaving an empty required row behind.
      const withoutEmptyPlaceholder = current.length === 1 && !current[0].description.trim() && !current[0].scopeName
        ? []
        : current;
      return [...withoutEmptyPlaceholder, ...newLines];
    });
    setScopeTemplatePickerOpen(false);
    setSelectedScopeTemplate(null);
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
        <a className="estimateTextAction" href="/sales/scope-templates">Scope Templates</a>
      </div>

      <div className="engagementTabs" role="tablist" aria-label="Estimate type">
        <button
          type="button"
          role="tab"
          aria-selected={activeEngagementTab === "Project"}
          className={`engagementTab${activeEngagementTab === "Project" ? " engagementTabActive" : ""}`}
          onClick={() => setActiveEngagementTab("Project")}
        >
          Projects ({projectEstimates.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeEngagementTab === "Service"}
          className={`engagementTab${activeEngagementTab === "Service" ? " engagementTabActive" : ""}`}
          onClick={() => setActiveEngagementTab("Service")}
        >
          Recurring ({recurringEstimates.length})
        </button>
      </div>

      <p className="salesWorkflowNote">Draft estimates retain their pricing inputs and line items. Marking one won sends it straight to Projects &amp; Jobs using the engagement type chosen when it was created.</p>
      {unitPresets.length === 0 && <p className="financeImportError" role="alert">No unit presets are configured. Add units to dbo.UnitsOfMeasurement, then refresh this page.</p>}
      {unitPresets.length > 0 && !defaultUnit && <p className="estimateInternalNote">No EA preset is configured. Choose a unit for each new line.</p>}
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
          {visibleEstimates.length} of {activeEngagementTab === "Project" ? projectEstimates.length : recurringEstimates.length} estimates
        </span>
        {hasActiveFilters && (
          <button type="button" className="invoiceClearButton" onClick={clearFilters}>Clear</button>
        )}
      </div>

      <div className="invoiceTableWrapper salesEstimateTableWrapper">
        <table className="invoiceTable salesEstimateTable">
          <thead>
            <tr>
              {activeColumns.map((column, index) => (
                <FilterableTableHeaderCell
                  key={column.key}
                  column={column}
                  idPrefix="estimate"
                  alignPopoverRight={index >= activeColumns.length - 2}
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
              <tr><td colSpan={activeColumns.length + 1} className="invoiceNoResults">{(activeEngagementTab === "Project" ? projectEstimates : recurringEstimates).length === 0 ? "No estimates yet." : "No estimates match these filters."}</td></tr>
            ) : visibleEstimates.map((estimate) => (
              <Fragment key={estimate.estimateId}>
                <tr>
                  {activeColumns.map((column) => (
                    column.key === "status" ? (
                      <td key={column.key}><span className={`estimateStatus estimateStatus${estimate.status}`}>{estimate.status}</span></td>
                    ) : column.key === "quotedTotal" ? (
                      <td key={column.key}>{money(estimate.quotedTotal ?? 0)}</td>
                    ) : (
                      <td key={column.key}>{formatValue(column.key, estimate[column.key])}</td>
                    )
                  ))}
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
                    <td colSpan={activeColumns.length + 1} className="estimateScopeCell">
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
                            {details.internalNotes && (
                              <div className="internalNotes">
                                <strong>Internal notes</strong>
                                <p>{details.internalNotes}</p>
                              </div>
                            )}
                            {details.customerNotes && (
                              <div className="customerNotes">
                                <strong>Customer notes</strong>
                                <p>{details.customerNotes}</p>
                              </div>
                            )}
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
                <legend>Engagement</legend>
                <div className="financeImportFields">
                  <label className="financeImportField">Type of work
                    <select
                      value={engagementType}
                      disabled={editingEstimateId != null}
                      onChange={(event) => setEngagementType(event.target.value as EngagementType)}
                    >
                      <option value="Project">One-time project</option>
                      <option value="Service">Recurring service</option>
                    </select>
                  </label>
                  {engagementType === "Service" && (
                    <>
                      <label className="financeImportField">Recurrence
                        <select value={recurrenceFrequency ?? "Weekly"} onChange={(event) => setRecurrenceFrequency(event.target.value as RecurrenceFrequency)}>
                          <option value="Weekly">Weekly</option>
                          <option value="Biweekly">Biweekly</option>
                          <option value="Monthly">Monthly</option>
                          <option value="Quarterly">Quarterly</option>
                          <option value="SemiAnnually">Semi-annually</option>
                          <option value="Annually">Annually</option>
                        </select>
                      </label>
                      <label className="financeImportField">Expected start date *
                        <input type="date" value={expectedStartDate ?? ""} onChange={(event) => setExpectedStartDate(event.target.value || null)} required />
                      </label>
                      <label className="financeImportField">Expected end date *
                        <input type="date" value={expectedEndDate ?? ""} min={expectedStartDate ?? undefined} onChange={(event) => setExpectedEndDate(event.target.value || null)} required />
                      </label>
                    </>
                  )}
                </div>
                {editingEstimateId != null && (
                  <p className="estimateInternalNote">Type of work can&apos;t be changed after an estimate is created — delete and recreate it if the other type is needed.</p>
                )}
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
                  <div className="estimateActionsInner">
                    <button type="button" className="estimateAddLine" onClick={addScope}><Plus size={14} /> Add scope</button>
                    <button type="button" className="estimateAddLine" onClick={() => void openScopeTemplatePicker()}><Library size={14} /> Apply scope template</button>
                  </div>
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
              <div className="estimateNotes">
                <label className="financeImportField" htmlFor="internalNotes">Internal Notes
                  <textarea id="internalNotes" placeholder="Notes for the team (not shown on the customer PDF)" value={internalNotes} maxLength={ESTIMATE_NOTES_MAX_LENGTH} rows={4} onChange={(event) => setInternalNotes(event.target.value)} />
                </label>
                <p className="estimateInternalNote">Optional. Carried into the project when this estimate is won. Up to {ESTIMATE_NOTES_MAX_LENGTH.toLocaleString()} characters.</p>
              </div>
              <div className="estimateNotes">
                <label className="financeImportField" htmlFor="customerNotes">Customer Notes
                  <textarea id="customerNotes" placeholder="Notes for the customer (shown on the customer PDF)" value={customerNotes} maxLength={ESTIMATE_NOTES_MAX_LENGTH} rows={4} onChange={(event) => setCustomerNotes(event.target.value)} />
                </label>
                <p className="estimateInternalNote">Optional. Included on the customer PDF and carried into the project when won. Up to {ESTIMATE_NOTES_MAX_LENGTH.toLocaleString()} characters.</p>
              </div>

              <div className="estimatePreviewTotal">
                <strong>{money(pricing.quotedTotal)}</strong>
                <small>Internal only — cost {money(pricing.baseSubtotal)} · freight {money(pricing.freightTotal)} · tax {money(pricing.taxTotal)} · markup {money(pricing.markupAmount)}</small>
              </div>
              {error && <p className="financeImportError" role="alert">{error}</p>}
              <div className="financeImportActions">
                <button type="button" className="financeImportCancel" onClick={closeForm} disabled={isSaving}>Cancel</button>
                <button type="submit" className="financeImportSubmit" disabled={isSaving || unitPresets.length === 0}>
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
              <p className="estimateInternalNote">
                {winningEstimate.engagementType === "Service"
                  ? <>This recurring estimate will become a project with {FREQUENCY_LABELS[String(winningEstimate.recurrenceFrequency)] ?? winningEstimate.recurrenceFrequency} recurrence{winningEstimate.expectedStartDate ? <> starting {formatDate(winningEstimate.expectedStartDate)}</> : null}{winningEstimate.expectedEndDate ? <> through {formatDate(winningEstimate.expectedEndDate)}</> : null}.</>
                  : <>This one-time project estimate will become a project in Projects &amp; Jobs.</>}
              </p>
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

      {scopeTemplatePickerOpen && (
        <Modal
          titleId="scopeTemplatePickerTitle"
          title={selectedScopeTemplate ? `Apply "${selectedScopeTemplate.templateName}"` : "Apply scope template"}
          eyebrow="SCOPE TEMPLATES"
          onClose={() => setScopeTemplatePickerOpen(false)}
          className="financeProjectDialog"
        >
          {!selectedScopeTemplate ? (
            <>
              <input
                autoFocus
                className="invoiceSearchInput"
                placeholder="Search scope templates..."
                value={scopeTemplateSearch}
                onChange={(event) => setScopeTemplateSearch(event.target.value)}
              />
              {scopeTemplateError && <p className="financeImportError" role="alert">{scopeTemplateError}</p>}
              <ol className="estimateScope">
                {scopeTemplates == null ? (
                  <p>Loading scope templates...</p>
                ) : scopeTemplates.length === 0 ? (
                  <p>No scope templates yet. Add some from the Scope Templates page.</p>
                ) : (
                  scopeTemplates
                    .filter((template) => template.templateName.toLowerCase().includes(scopeTemplateSearch.trim().toLowerCase()))
                    .map((template) => (
                      <li key={template.scopeTemplateId}>
                        <button
                          type="button"
                          className="estimateTextAction"
                          disabled={loadingScopeTemplateId === template.scopeTemplateId}
                          onClick={() => void selectScopeTemplate(template)}
                        >
                          {loadingScopeTemplateId === template.scopeTemplateId
                            ? "Loading..."
                            : `${template.templateName} — ${template.componentCount} component${template.componentCount === 1 ? "" : "s"} per ${template.unitName}`}
                        </button>
                      </li>
                    ))
                )}
              </ol>
            </>
          ) : (
            <>
              <label className="financeImportField">
                {selectedScopeTemplate.unitName} quantity *
                <input
                  autoFocus
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={scopeTemplateQuantity}
                  onChange={(event) => setScopeTemplateQuantity(asNumber(event.target.value))}
                />
              </label>
              <p className="estimateInternalNote">
                This creates a new &quot;{selectedScopeTemplate.templateName}&quot; scope with the lines below, pre-scaled to
                the quantity above. Once applied, every line can be freely edited like any other line.
              </p>
              <ol className="estimateScope">
                {selectedScopeTemplate.components.map((component) => (
                  <li key={component.scopeTemplateComponentId}>
                    {component.description} — {Number((component.quantityPerUnit * scopeTemplateQuantity).toFixed(6))}
                    {component.unitName ? ` ${component.unitName}` : ""} @ {money(component.unitCost)} ({component.lineType})
                  </li>
                ))}
              </ol>
              {scopeTemplateError && <p className="financeImportError" role="alert">{scopeTemplateError}</p>}
              <div className="financeImportActions">
                <button type="button" className="financeImportCancel" onClick={() => setSelectedScopeTemplate(null)}>Back</button>
                <button type="button" className="financeImportSubmit" onClick={applyScopeTemplate}>Apply template</button>
              </div>
            </>
          )}
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
