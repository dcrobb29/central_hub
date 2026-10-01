"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { ProjectFinancialSummary } from "@/app/lib/projects";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const percent = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function money(value: number) {
  return currency.format(Number(value) || 0);
}

export default function ProjectFinancesTable({ rows }: { rows: ProjectFinancialSummary[] }) {
  const router = useRouter();
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <section className="projectFinancesTablePanel">
      <div className="projectFinancesToolbar">
        <div>
          <p className="financeImportEyebrow">ALL-TIME PROJECT TOTALS</p>
          <h2>Project financials</h2>
        </div>
        <button type="button" className="financeImportButton" onClick={() => { setError(null); setIsAddingProject(true); }}>
          <Plus size={15} aria-hidden="true" />
          Add project
        </button>
      </div>
      <div className="invoiceTableWrapper">
        <table className="invoiceTable projectFinancesTable">
          <thead>
            <tr>
              <th>Project</th>
              <th>Income</th>
              <th>Paid Income</th>
              <th>Unpaid Income</th>
              <th>% Income</th>
              <th>Costs</th>
              <th>Paid Costs</th>
              <th>Unpaid Bills</th>
              <th>% Costs</th>
              <th>Profit</th>
              <th>Profit Margin</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="invoiceNoResults">No projects yet. Add a project to get started.</td>
              </tr>
            ) : rows.map((project) => (
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
        <div className="financeImportBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
          <section className="financeImportDialog financeProjectDialog" role="dialog" aria-modal="true" aria-labelledby="addProjectTitle">
            <header className="financeImportDialogHeader">
              <div>
                <p className="financeImportEyebrow">PROJECT FINANCES</p>
                <h2 id="addProjectTitle">Add project</h2>
              </div>
              <button type="button" className="financeImportClose" onClick={closeDialog} aria-label="Close" disabled={isSaving}>×</button>
            </header>
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
          </section>
        </div>
      )}
    </section>
  );
}
