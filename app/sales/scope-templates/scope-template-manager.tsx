"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Library, Plus, Trash2 } from "lucide-react";
import type {
  ScopeTemplateComponentInput,
  ScopeTemplateDetails,
  ScopeTemplateSummary,
} from "@/app/lib/scope-templates";
import type { LineType } from "@/app/lib/estimates";
import type { MaterialWithLatestPrice } from "@/app/lib/materials";
import { useFilterableTable, type TableColumn } from "@/app/lib/use-filterable-table";
import { FilterableTableHeaderCell } from "@/app/components/filterable-table-header-cell";
import Modal from "@/app/components/modal";

type Column = TableColumn<ScopeTemplateSummary>;

const COLUMNS: Column[] = [
  { key: "templateName", label: "Scope template" },
  { key: "unitName", label: "Unit" },
  { key: "componentCount", label: "Components" },
];

function searchableValue(key: keyof ScopeTemplateSummary, value: ScopeTemplateSummary[keyof ScopeTemplateSummary]) {
  return String(value ?? "").toLocaleLowerCase();
}

function compareTemplates(left: ScopeTemplateSummary, right: ScopeTemplateSummary, key: keyof ScopeTemplateSummary) {
  if (key === "componentCount") return left.componentCount - right.componentCount;
  return String(left[key] ?? "").localeCompare(String(right[key] ?? ""), undefined, { numeric: true, sensitivity: "base" });
}

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);

function newComponent(): ScopeTemplateComponentInput {
  return { description: "", lineType: "Material", quantityPerUnit: 1, unitName: "", unitCost: 0, materialId: null };
}

function asNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function ScopeTemplateManager({
  scopeTemplates,
  materials,
}: {
  scopeTemplates: ScopeTemplateSummary[];
  materials: MaterialWithLatestPrice[];
}) {
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [editingScopeTemplateId, setEditingScopeTemplateId] = useState<number | null>(null);
  const [loadingEditId, setLoadingEditId] = useState<number | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [unitName, setUnitName] = useState("");
  const [components, setComponents] = useState<ScopeTemplateComponentInput[]>([newComponent()]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [deletingTemplate, setDeletingTemplate] = useState<ScopeTemplateSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // catalog picker: which component row is currently choosing a material to prefill from
  const [catalogPickerIndex, setCatalogPickerIndex] = useState<number | null>(null);
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
    visibleRows: visibleTemplates,
    clearFilters,
    hasActiveFilters,
  } = useFilterableTable(scopeTemplates, COLUMNS, { searchableValue, compare: compareTemplates });

  function resetForm() {
    setTemplateName("");
    setUnitName("");
    setComponents([newComponent()]);
    setError(null);
    setEditingScopeTemplateId(null);
  }

  function closeForm() {
    if (isSaving) return;
    setIsAdding(false);
    resetForm();
  }

  function updateComponent(index: number, patch: Partial<ScopeTemplateComponentInput>) {
    setComponents((current) => current.map((component, componentIndex) => componentIndex === index ? { ...component, ...patch } : component));
  }

  async function openEditForm(template: ScopeTemplateSummary) {
    setLoadingEditId(template.scopeTemplateId);
    setError(null);
    try {
      const response = await fetch(`/api/sales/scope-templates/${template.scopeTemplateId}`);
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Unable to load scope template");
      const details = result.scopeTemplate as ScopeTemplateDetails;
      setTemplateName(details.templateName);
      setUnitName(details.unitName);
      setComponents(details.components.map((component) => ({
        description: component.description,
        lineType: component.lineType,
        quantityPerUnit: component.quantityPerUnit,
        unitName: component.unitName ?? "",
        unitCost: component.unitCost,
        materialId: component.materialId,
      })));
      setEditingScopeTemplateId(template.scopeTemplateId);
      setIsAdding(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load scope template");
    } finally {
      setLoadingEditId(null);
    }
  }

  async function submitTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const payload = {
        templateName,
        unitName,
        components: components.map((component) => ({ ...component, unitName: component.unitName || null })),
      };
      const url = editingScopeTemplateId != null ? `/api/sales/scope-templates/${editingScopeTemplateId}` : "/api/sales/scope-templates";
      const response = await fetch(url, {
        method: editingScopeTemplateId != null ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Unable to save scope template");
      setIsAdding(false);
      resetForm();
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save scope template");
    } finally {
      setIsSaving(false);
    }
  }

  function openDeleteDialog(template: ScopeTemplateSummary) {
    setDeletingTemplate(template);
    setDeleteError(null);
  }

  async function confirmDelete() {
    if (!deletingTemplate) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/sales/scope-templates/${deletingTemplate.scopeTemplateId}`, { method: "DELETE" });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error ?? "Unable to delete scope template");
      }
      setDeletingTemplate(null);
      router.refresh();
    } catch (deleteErr) {
      setDeleteError(deleteErr instanceof Error ? deleteErr.message : "Unable to delete scope template");
    } finally {
      setIsDeleting(false);
    }
  }

  function pickMaterial(material: MaterialWithLatestPrice) {
    if (catalogPickerIndex == null) return;
    updateComponent(catalogPickerIndex, {
      description: material.materialName,
      unitName: material.unitName ?? "",
      unitCost: material.latestUnitCost ?? 0,
      materialId: material.materialId,
    });
    setCatalogPickerIndex(null);
  }

  return (
    <section className="salesWorkspace" ref={filterControlRoot}>
      <header className="salesToolbar">
        <div>
          <p className="salesEyebrow">SALES</p>
          <h1>Scope Templates</h1>
        </div>
        <label className="invoiceSearchLabel">
          Search templates
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search every column"
            className="invoiceSearchInput"
          />
        </label>
        <div className="estimateActionsInner">
          <a className="estimateTextAction" href="/sales">Back to estimates</a>
          <button className="financeImportButton" type="button" onClick={() => { resetForm(); setIsAdding(true); }}>
            <Plus size={15} aria-hidden="true" />
            Add scope template
          </button>
        </div>
      </header>

      <p className="salesWorkflowNote">
        A scope template is a preset bundle of material, labor, and equipment lines that scale together off one top-level
        quantity — e.g. a &quot;Pavers&quot; template with gravel, sand, pavers, and labor all ratioed per SF. Applying a
        template from an estimate stamps in a scope and its pre-scaled lines once; after that, those lines are ordinary,
        freely editable estimate lines with no ongoing link back to this template.
      </p>
      {error && !isAdding && <p className="financeImportError" role="alert">{error}</p>}

      <div className="invoiceTableTools">
        <span className="invoiceResultCount" aria-live="polite">
          {visibleTemplates.length} of {scopeTemplates.length} scope templates
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
                  idPrefix="scopeTemplate"
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
            {visibleTemplates.length === 0 ? (
              <tr><td colSpan={COLUMNS.length + 1} className="invoiceNoResults">{scopeTemplates.length === 0 ? "No scope templates yet." : "No scope templates match these filters."}</td></tr>
            ) : visibleTemplates.map((template) => (
              <tr key={template.scopeTemplateId}>
                {COLUMNS.map((column) => <td key={column.key}>{String(template[column.key])}</td>)}
                <td>
                  <div className="estimateActionsInner">
                    <button type="button" className="estimateTextAction" disabled={loadingEditId === template.scopeTemplateId} onClick={() => void openEditForm(template)}>
                      {loadingEditId === template.scopeTemplateId ? "Loading..." : "Edit"}
                    </button>
                    <button type="button" className="estimateTextAction estimateDangerAction" onClick={() => openDeleteDialog(template)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isAdding && (
        <Modal
          titleId="scopeTemplateFormTitle"
          title={editingScopeTemplateId != null ? "Edit scope template" : "Add scope template"}
          eyebrow="SCOPE TEMPLATES"
          onClose={closeForm}
          closeDisabled={isSaving}
          className="financeProjectDialog"
        >
          <form onSubmit={submitTemplate}>
            <label className="financeImportField">Template name *<input autoFocus value={templateName} onChange={(event) => setTemplateName(event.target.value)} maxLength={150} required /></label>
            <label className="financeImportField">
              Top-level unit *
              <input placeholder="SF, EA, LF" value={unitName} onChange={(event) => setUnitName(event.target.value)} maxLength={30} required />
            </label>
            <p className="estimateInternalNote">
              The top-level unit is what the estimator enters once when applying this template (e.g. &quot;120&quot; SF of
              pavers). Each component below defines a fixed ratio per one unit of that quantity.
            </p>

            <fieldset className="financeImportGroup">
              <legend>Components (per 1 {unitName || "unit"})</legend>
              <div className="estimateLinesHeader"><span>Description</span><span>Type</span><span>Qty / unit</span><span>Component unit</span><span>Unit cost</span><span /><span /></div>
              {components.map((component, index) => (
                <div key={index} className="estimateLineEditor">
                  <input
                    aria-label={`Component ${index + 1} description`}
                    placeholder="Description"
                    value={component.description}
                    maxLength={300}
                    onChange={(event) => updateComponent(index, { description: event.target.value })}
                    required
                  />
                  <select
                    aria-label={`Component ${index + 1} type`}
                    value={component.lineType}
                    onChange={(event) => updateComponent(index, { lineType: event.target.value as LineType })}
                  >
                    <option value="Material">Material</option>
                    <option value="Labor">Labor</option>
                    <option value="Equipment">Equipment</option>
                  </select>
                  <input
                    aria-label={`Component ${index + 1} quantity per unit`}
                    type="number"
                    min="0"
                    step="0.000001"
                    value={component.quantityPerUnit}
                    onChange={(event) => updateComponent(index, { quantityPerUnit: asNumber(event.target.value) })}
                    required
                  />
                  <input
                    aria-label={`Component ${index + 1} unit`}
                    placeholder="CY, bag, hr"
                    value={component.unitName ?? ""}
                    maxLength={30}
                    onChange={(event) => updateComponent(index, { unitName: event.target.value })}
                  />
                  <input
                    aria-label={`Component ${index + 1} unit cost`}
                    type="number"
                    min="0"
                    step="0.0001"
                    value={component.unitCost}
                    onChange={(event) => updateComponent(index, { unitCost: asNumber(event.target.value) })}
                    required
                  />
                  <button
                    type="button"
                    className="estimateCatalogLine"
                    aria-label={`Pick component ${index + 1} from catalog`}
                    title="Pick from catalog"
                    onClick={() => { setCatalogPickerIndex(index); setCatalogSearch(""); }}
                  >
                    <Library size={15} />
                  </button>
                  <button
                    type="button"
                    className="estimateRemoveLine"
                    aria-label={`Remove component ${index + 1}`}
                    disabled={components.length === 1}
                    onClick={() => setComponents((current) => current.filter((_, componentIndex) => componentIndex !== index))}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              <button type="button" className="estimateAddLine" onClick={() => setComponents((current) => [...current, newComponent()])}>
                <Plus size={14} /> Add component
              </button>
            </fieldset>

            {error && <p className="financeImportError" role="alert">{error}</p>}
            <div className="financeImportActions">
              <button type="button" className="financeImportCancel" onClick={closeForm} disabled={isSaving}>Cancel</button>
              <button type="submit" className="financeImportSubmit" disabled={isSaving}>
                {isSaving ? "Saving..." : editingScopeTemplateId != null ? "Save changes" : "Save scope template"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {catalogPickerIndex != null && (
        <Modal titleId="scopeTemplateCatalogPickerTitle" title="Pick a material" eyebrow="MATERIAL CATALOG" onClose={() => setCatalogPickerIndex(null)} className="financeProjectDialog">
          <input
            autoFocus
            className="invoiceSearchInput"
            placeholder="Search materials..."
            value={catalogSearch}
            onChange={(event) => setCatalogSearch(event.target.value)}
          />
          <ol className="estimateScope">
            {materials.length === 0 ? (
              <p>No materials in the catalog yet. Add some from the Material Catalog page.</p>
            ) : (
              materials
                .filter((material) => material.materialName.toLowerCase().includes(catalogSearch.trim().toLowerCase()))
                .map((material) => (
                  <li key={material.materialId}>
                    <button type="button" className="estimateTextAction" onClick={() => pickMaterial(material)}>
                      {material.materialName} — {money(material.latestUnitCost ?? 0)}{material.unitName ? ` / ${material.unitName}` : ""}
                    </button>
                  </li>
                ))
            )}
          </ol>
        </Modal>
      )}

      {deletingTemplate && (
        <Modal titleId="deleteScopeTemplateTitle" title="Delete scope template?" eyebrow="SCOPE TEMPLATES" onClose={() => setDeletingTemplate(null)} closeDisabled={isDeleting} className="financeProjectDialog">
          <p>
            Delete <strong>{deletingTemplate.templateName}</strong>? Estimates that already applied this template keep their
            lines — this only removes it from the picker for future estimates.
          </p>
          {deleteError && <p className="financeImportError" role="alert">{deleteError}</p>}
          <div className="financeImportActions">
            <button type="button" className="financeImportCancel" onClick={() => setDeletingTemplate(null)} disabled={isDeleting}>Cancel</button>
            <button type="button" className="financeImportDanger" onClick={() => void confirmDelete()} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete scope template"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
