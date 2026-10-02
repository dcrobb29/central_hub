"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { ProjectFinancialSummary } from "@/app/lib/projects";
import { useFilterableTable, type TableColumn } from "@/app/lib/use-filterable-table";
import { FilterableTableHeaderCell } from "@/app/components/filterable-table-header-cell";
import Modal from "@/app/components/modal";

type Column = TableColumn<ProjectFinancialSummary>;

const COLUMNS: Column[] = [
  { key: "projectName", label: "Project" },
  { key: "income", label: "Income" },
  { key: "paidIncome", label: "Paid Income" },
  { key: "unpaidIncome", label: "Unpaid Income" },
  { key: "percentOfIncome", label: "% Income" },
  { key: "costs", label: "Costs" },
  { key: "paidCosts", label: "Paid Costs" },
  { key: "unpaidCosts", label: "Unpaid Bills" },
  { key: "percentOfCosts", label: "% Costs" },
  { key: "profit", label: "Profit" },
  { key: "profitMargin", label: "Profit Margin" },
];

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const percent = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function money(value: number) {
  return currency.format(Number(value) || 0);
}

function formatValue(key: keyof ProjectFinancialSummary, value: ProjectFinancialSummary[keyof ProjectFinancialSummary]) {
  if (key === "projectName") return String(value ?? "");
  if (key === "percentOfIncome" || key === "percentOfCosts" || key === "profitMargin") return `${percent.format(Number(value))}%`;
  return money(Number(value));
}

function searchableValue(key: keyof ProjectFinancialSummary, value: ProjectFinancialSummary[keyof ProjectFinancialSummary]) {
  return formatValue(key, value).toLocaleLowerCase();
}

function compareProjects(left: ProjectFinancialSummary, right: ProjectFinancialSummary, key: keyof ProjectFinancialSummary) {
  if (key === "projectName") {
    return String(left.projectName).localeCompare(String(right.projectName), undefined, { numeric: true, sensitivity: "base" });
  }
  return Number(left[key]) - Number(right[key]);
}

export default function ProjectFinancesTable({ rows }: { rows: ProjectFinancialSummary[] }) {
  const router = useRouter();
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    visibleRows,
    clearFilters,
    hasActiveFilters,
  } = useFilterableTable(rows, COLUMNS, { searchableValue, compare: compareProjects });

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/finances/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Unable to create project");
      setProjectName("");
      setIsAddingProject(false);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create project");
    } finally {
      setIsSaving(false);
    }
  }

  function closeDialog() {
    if (isSaving) return;
    setIsAddingProject(false);
    setError(null);
  }

  return (
    <section className="projectFinancesTablePanel" ref={filterControlRoot}>
      <div className="projectFinancesToolbar">
        <div>
          <p className="financeImportEyebrow">ALL-TIME PROJECT TOTALS</p>
          <h2>Project financials</h2>
        </div>
        <label className="invoiceSearchLabel">
          Search projects
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search every column"
            className="invoiceSearchInput"
          />
        </label>
        <button type="button" className="financeImportButton" onClick={() => { setError(null); setIsAddingProject(true); }}>
          <Plus size={15} aria-hidden="true" />
          Add project
        </button>
        <span className="invoiceResultCount" aria-live="polite">
          {visibleRows.length} of {rows.length} projects
        </span>
        {hasActiveFilters && (
          <button type="button" className="invoiceClearButton" onClick={clearFilters}>Clear</button>
        )}
      </div>
      <div className="invoiceTableWrapper">
        <table className="invoiceTable projectFinancesTable">
          <thead>
            <tr>
              {COLUMNS.map((column, index) => (
                <FilterableTableHeaderCell
                  key={column.key}
                  column={column}
                  idPrefix="project-finances"
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
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="invoiceNoResults">
                  {rows.length === 0 ? "No projects yet. Add a project to get started." : "No projects match these filters."}
                </td>
              </tr>
            ) : visibleRows.map((project) => (
              <tr key={project.projectId}>
                <td>{project.projectName}</td>
                <td>{money(project.income)}</td>
                <td>{money(project.paidIncome)}</td>
                <td>{money(project.unpaidIncome)}</td>
                <td>{percent.format(project.percentOfIncome)}%</td>
                <td>{money(project.costs)}</td>
                <td>{money(project.paidCosts)}</td>
                <td>{money(project.unpaidCosts)}</td>
                <td>{percent.format(project.percentOfCosts)}%</td>
                <td className={project.profit < 0 ? "projectProfitNegative" : "projectProfitPositive"}>{money(project.profit)}</td>
                <td>{percent.format(project.profitMargin)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isAddingProject && (
        <Modal titleId="addProjectTitle" title="Add project" eyebrow="PROJECT FINANCES" onClose={closeDialog} closeDisabled={isSaving} className="financeProjectDialog">
            <p className="financeImportHint">Projects can be connected to invoices and bills when those records are added. Existing unassigned records stay unassigned.</p>
            <form onSubmit={submitProject}>
              <label className="financeImportField">
                Project name *
                <input autoFocus value={projectName} onChange={(event) => setProjectName(event.target.value)} maxLength={150} required />
              </label>
              {error && <p className="financeImportError" role="alert">{error}</p>}
              <div className="financeImportActions">
                <button type="button" className="financeImportCancel" onClick={closeDialog} disabled={isSaving}>Cancel</button>
                <button type="submit" className="financeImportSubmit" disabled={isSaving}>{isSaving ? "Saving..." : "Save project"}</button>
              </div>
            </form>
        </Modal>
      )}
    </section>
  );
}
