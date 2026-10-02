"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { MaterialPriceEntry, MaterialWithLatestPrice } from "@/app/lib/materials";
import { useFilterableTable, type TableColumn } from "@/app/lib/use-filterable-table";
import { FilterableTableHeaderCell } from "@/app/components/filterable-table-header-cell";
import Modal from "@/app/components/modal";

type Column = TableColumn<MaterialWithLatestPrice>;

const COLUMNS: Column[] = [
  { key: "materialName", label: "Material" },
  { key: "unitName", label: "Unit" },
  { key: "latestUnitCost", label: "Latest cost" },
  { key: "latestQuotedDate", label: "Quoted" },
  { key: "latestVendorName", label: "Vendor" },
];

const money = (value: number | null) =>
  value == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

function daysOld(quotedDate: string | null) {
  if (!quotedDate) return null;
  const days = Math.floor((Date.now() - new Date(`${quotedDate}T00:00:00`).getTime()) / 86_400_000);
  return days;
}

function formatValue(key: keyof MaterialWithLatestPrice, value: MaterialWithLatestPrice[keyof MaterialWithLatestPrice]) {
  if (key === "latestUnitCost") return money(value as number | null);
  if (key === "latestQuotedDate") {
    const age = daysOld(value as string | null);
    return value ? `${value} (${age}d old)` : "—";
  }
  return value == null || value === "" ? "—" : String(value);
}

function searchableValue(key: keyof MaterialWithLatestPrice, value: MaterialWithLatestPrice[keyof MaterialWithLatestPrice]) {
  return formatValue(key, value).toLocaleLowerCase();
}

function compareMaterials(left: MaterialWithLatestPrice, right: MaterialWithLatestPrice, key: keyof MaterialWithLatestPrice) {
  if (key === "latestUnitCost") return (left.latestUnitCost ?? -1) - (right.latestUnitCost ?? -1);
  if (key === "latestQuotedDate") {
    const leftDate = Date.parse(left.latestQuotedDate ?? "");
    const rightDate = Date.parse(right.latestQuotedDate ?? "");
    if (Number.isNaN(leftDate)) return Number.isNaN(rightDate) ? 0 : 1;
    if (Number.isNaN(rightDate)) return -1;
    return leftDate - rightDate;
  }
  return String(left[key] ?? "").localeCompare(String(right[key] ?? ""), undefined, { numeric: true, sensitivity: "base" });
}

function todayIso() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

export default function MaterialCatalog({ materials }: { materials: MaterialWithLatestPrice[] }) {
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [materialName, setMaterialName] = useState("");
  const [unitName, setUnitName] = useState("");
  const [unitCost, setUnitCost] = useState(0);
  const [quotedDate, setQuotedDate] = useState(todayIso);
  const [vendorName, setVendorName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [historyMaterialId, setHistoryMaterialId] = useState<number | null>(null);
  const [historyEntries, setHistoryEntries] = useState<MaterialPriceEntry[]>([]);
  const [isAddingPrice, setIsAddingPrice] = useState(false);
  const [newPriceCost, setNewPriceCost] = useState(0);
  const [newPriceDate, setNewPriceDate] = useState(todayIso);
  const [newPriceVendor, setNewPriceVendor] = useState("");

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
    visibleRows: visibleMaterials,
    clearFilters,
    hasActiveFilters,
  } = useFilterableTable(materials, COLUMNS, { searchableValue, compare: compareMaterials });

  function resetForm() {
    setMaterialName("");
    setUnitName("");
    setUnitCost(0);
    setQuotedDate(todayIso());
    setVendorName("");
    setError(null);
  }

  function closeForm() {
    if (isSaving) return;
    setIsAdding(false);
    resetForm();
  }

  async function submitMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/sales/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialName, unitName: unitName || null, unitCost, quotedDate, vendorName: vendorName || null }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Unable to save material");
      setIsAdding(false);
      resetForm();
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save material");
    } finally {
      setIsSaving(false);
    }
  }

  async function openHistory(material: MaterialWithLatestPrice) {
    setHistoryMaterialId(material.materialId);
    setNewPriceCost(material.latestUnitCost ?? 0);
    setNewPriceDate(todayIso());
    setNewPriceVendor("");
    try {
      const response = await fetch(`/api/sales/materials/${material.materialId}/prices`);
      const result = await response.json().catch(() => null);
      if (response.ok) setHistoryEntries(result.entries ?? []);
    } catch {
      setHistoryEntries([]);
    }
  }

  async function submitNewPrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!historyMaterialId) return;
    setIsAddingPrice(true);
    setError(null);
    try {
      const response = await fetch(`/api/sales/materials/${historyMaterialId}/prices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitCost: newPriceCost, quotedDate: newPriceDate, vendorName: newPriceVendor || null }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Unable to save price");
      setHistoryEntries(result.entries ?? []);
      router.refresh();
    } catch (priceError) {
      setError(priceError instanceof Error ? priceError.message : "Unable to save price");
    } finally {
      setIsAddingPrice(false);
    }
  }

  return (
    <section className="salesWorkspace" ref={filterControlRoot}>
      <header className="salesToolbar">
        <div>
          <p className="salesEyebrow">SALES</p>
          <h1>Material Catalog</h1>
        </div>
        <label className="invoiceSearchLabel">
          Search materials
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
            Add material
          </button>
        </div>
      </header>

      <p className="salesWorkflowNote">Prices are recorded over time, never overwritten, so you can see how old the last quote is when pulling an item into an estimate.</p>
      {error && !isAdding && !historyMaterialId && <p className="financeImportError" role="alert">{error}</p>}

      <div className="invoiceTableTools">
        <span className="invoiceResultCount" aria-live="polite">
          {visibleMaterials.length} of {materials.length} materials
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
                  idPrefix="material"
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
            {visibleMaterials.length === 0 ? (
              <tr><td colSpan={COLUMNS.length + 1} className="invoiceNoResults">{materials.length === 0 ? "No materials in the catalog yet." : "No materials match these filters."}</td></tr>
            ) : visibleMaterials.map((material) => {
              return (
                <tr key={material.materialId}>
                  {COLUMNS.map((column) => <td key={column.key}>{formatValue(column.key, material[column.key])}</td>)}
                  <td>
                    <div className="estimateActionsInner">
                      <button type="button" className="estimateTextAction" onClick={() => void openHistory(material)}>History / Update</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isAdding && (
        <Modal titleId="addMaterialTitle" title="Add material" eyebrow="MATERIAL CATALOG" onClose={closeForm} closeDisabled={isSaving} className="financeProjectDialog">
            <form onSubmit={submitMaterial}>
              <label className="financeImportField">Material name *<input autoFocus value={materialName} onChange={(event) => setMaterialName(event.target.value)} maxLength={200} required /></label>
              <label className="financeImportField">Unit<input placeholder="ea, ft, hr" value={unitName} onChange={(event) => setUnitName(event.target.value)} maxLength={30} /></label>
              <label className="financeImportField">Unit cost *<input type="number" min="0" step="0.0001" value={unitCost} onChange={(event) => setUnitCost(Number(event.target.value))} required /></label>
              <label className="financeImportField">Quoted date *<input type="date" value={quotedDate} onChange={(event) => setQuotedDate(event.target.value)} required /></label>
              <label className="financeImportField">Vendor<input value={vendorName} onChange={(event) => setVendorName(event.target.value)} maxLength={150} /></label>
              {error && <p className="financeImportError" role="alert">{error}</p>}
              <div className="financeImportActions">
                <button type="button" className="financeImportCancel" onClick={closeForm} disabled={isSaving}>Cancel</button>
                <button type="submit" className="financeImportSubmit" disabled={isSaving}>{isSaving ? "Saving..." : "Save material"}</button>
              </div>
            </form>
        </Modal>
      )}

      {historyMaterialId && (
        <Modal titleId="priceHistoryTitle" title="Price history" eyebrow="MATERIAL CATALOG" onClose={() => setHistoryMaterialId(null)} className="financeProjectDialog">
            <ol className="estimateScope">
              {historyEntries.length === 0 ? <p>No recorded prices yet.</p> : historyEntries.map((entry) => (
                <li key={entry.materialPriceId}>{entry.quotedDate} — {money(entry.unitCost)}{entry.vendorName ? ` · ${entry.vendorName}` : ""}</li>
              ))}
            </ol>
            <form onSubmit={submitNewPrice}>
              <legend className="estimateInternalNote">Record a new price (previous prices are kept, not overwritten)</legend>
              <label className="financeImportField">Unit cost *<input type="number" min="0" step="0.0001" value={newPriceCost} onChange={(event) => setNewPriceCost(Number(event.target.value))} required /></label>
              <label className="financeImportField">Quoted date *<input type="date" value={newPriceDate} onChange={(event) => setNewPriceDate(event.target.value)} required /></label>
              <label className="financeImportField">Vendor<input value={newPriceVendor} onChange={(event) => setNewPriceVendor(event.target.value)} maxLength={150} /></label>
              {error && <p className="financeImportError" role="alert">{error}</p>}
              <div className="financeImportActions">
                <button type="button" className="financeImportCancel" onClick={() => setHistoryMaterialId(null)}>Close</button>
                <button type="submit" className="financeImportSubmit" disabled={isAddingPrice}>{isAddingPrice ? "Saving..." : "Add price"}</button>
              </div>
            </form>
        </Modal>
      )}
    </section>
  );
}
