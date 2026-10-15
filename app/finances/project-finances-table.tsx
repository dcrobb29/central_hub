"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { ProjectFinancialSummary } from "@/app/lib/projects";
import { useFilterableTable, type TableColumn } from "@/app/lib/use-filterable-table";
import { FilterableTableHeaderCell } from "@/app/components/filterable-table-header-cell";
import Modal from "@/app/components/modal";
import Link from "next/link";
import FinanceCollection, { FinanceRecord, FinanceFacts } from "./finance-collection";
import recordStyles from "@/app/components/record-workspace.module.css";
import styles from "./finance-workspace.module.css";

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
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedProject = rows.find((project) => project.projectId === selectedId);
  const table = useFilterableTable(rows, COLUMNS, { searchableValue, compare: compareProjects, initialPageSize: 50 });
  const {
    columnFilters,
    setColumnFilters,
    sort,
    toggleSort,
    openFilter,
    setOpenFilter,
    filterControlRoot,
    visibleRows,
    paginatedRows,
  } = table;

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
    <section className={styles.workspace} ref={filterControlRoot}>
      {selectedProject ? <FinanceRecord key={selectedProject.projectId} title={selectedProject.projectName} collection="project financials" onBack={() => setSelectedId(null)}
        actions={<Link className="financeImportButton" href={`/projects/${selectedProject.projectId}?tab=finances`}>Open project finances</Link>}
        overview={<><p className="financeImportHint">All-time totals from invoices and allocated bills.</p><FinanceFacts items={[
          { label: "Income", value: money(selectedProject.income) },
          { label: "Costs", value: money(selectedProject.costs) },
          { label: "Profit", value: <span className={selectedProject.profit < 0 ? "projectProfitNegative" : "projectProfitPositive"}>{money(selectedProject.profit)}</span> },
          { label: "Unpaid income", value: money(selectedProject.unpaidIncome) },
          { label: "Unpaid bills", value: money(selectedProject.unpaidCosts) },
          { label: "Profit margin", value: `${percent.format(selectedProject.profitMargin)}%` },
        ]} /></>}
        details={<FinanceFacts items={COLUMNS.map((column) => ({ label: column.label, value: formatValue(column.key, selectedProject[column.key]) }))} />}
      /> : null}
      <div hidden={Boolean(selectedProject)} className={!selectedProject ? styles.workspace : undefined}>
      <FinanceCollection title="Project financials" description="All-time project totals. Open a financial summary for paid and unpaid balances, percentages, and the project workspace."
        action={<button type="button" className="financeImportButton" onClick={() => { setError(null); setIsAddingProject(true); }}><Plus size={15} aria-hidden="true" />Add project</button>}
        columns={COLUMNS} controls={table} count={rows.length} itemLabel="projects"
        cards={paginatedRows.map((project) => <article className={recordStyles.card} key={project.projectId} aria-label={project.projectName}>
          <div className={recordStyles.identity}><h2><button type="button" className={styles.textButton} onClick={() => setSelectedId(project.projectId)}>{project.projectName}</button></h2>
            <p>Income {money(project.income)} / Costs {money(project.costs)}</p></div>
          <div className={recordStyles.status}><span className={recordStyles.label}>Unpaid income</span><strong>{money(project.unpaidIncome)}</strong>
            <span className={recordStyles.reference}>Unpaid bills {money(project.unpaidCosts)}</span></div>
          <div className={recordStyles.value}><span className={recordStyles.label}>Profit</span><strong className={project.profit < 0 ? "projectProfitNegative" : "projectProfitPositive"}>{money(project.profit)}</strong>
            <span className={recordStyles.reference}>{percent.format(project.profitMargin)}% margin</span></div>
          <div className={recordStyles.actions}><button type="button" className={recordStyles.openRecord} onClick={() => setSelectedId(project.projectId)} aria-label={`Open financials for ${project.projectName}`}>Open financials</button></div>
        </article>)}>
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
            ) : paginatedRows.map((project) => (
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
      </FinanceCollection>
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
