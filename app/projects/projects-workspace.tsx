"use client";

import { useState } from "react";
import type { ProjectWithEstimate } from "@/app/lib/estimates";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

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

export default function ProjectsWorkspace({ projects }: { projects: ProjectWithEstimate[] }) {
  const [activeTab, setActiveTab] = useState<"Project" | "Service">("Project");

  const oneTimeProjects = projects.filter((project) => project.engagementType === "Project");
  const recurringProjects = projects.filter((project) => project.engagementType === "Service");
  const visibleProjects = activeTab === "Project" ? oneTimeProjects : recurringProjects;

  return (
    <div className="projectsWorkspace">
      <header className="salesToolbar">
        <div>
          <p className="salesEyebrow">PROJECTS &amp; JOBS</p>
          <h1>Project management</h1>
        </div>
        <p className="salesWorkflowNote">Won estimates carry their accepted scope into a project.</p>
      </header>

      <div className="engagementTabs" role="tablist" aria-label="Project type">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "Project"}
          className={`engagementTab${activeTab === "Project" ? " engagementTabActive" : ""}`}
          onClick={() => setActiveTab("Project")}
        >
          Projects ({oneTimeProjects.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "Service"}
          className={`engagementTab${activeTab === "Service" ? " engagementTabActive" : ""}`}
          onClick={() => setActiveTab("Service")}
        >
          Recurring ({recurringProjects.length})
        </button>
      </div>

      {visibleProjects.length === 0 ? (
        <div className="projectsEmptyState">
          {activeTab === "Project" ? "Won one-time estimates will appear here as projects." : "Won recurring estimates will appear here as projects."}
        </div>
      ) : (
        <div className="projectList">
          {visibleProjects.map((project) => (
            <details className="projectCard" key={project.projectId}>
              <summary>
                <span className="projectCardTitle">
                  <strong>{project.projectName}</strong>
                  <span>{project.customerName ?? "Customer not specified"}</span>
                </span>
                <span className="projectCardMeta">{project.projectStatus}</span>
                <span className="projectCardMeta">{project.estimateName ? `Estimate: ${project.estimateName}` : "No estimate"}</span>
                {activeTab === "Service" && (
                  <span className="projectCardMeta">
                    {project.recurrenceFrequency ? FREQUENCY_LABELS[project.recurrenceFrequency] ?? project.recurrenceFrequency : "—"}
                    {project.expectedStartDate ? ` · Starts ${formatDate(project.expectedStartDate)}` : ""}
                    {project.expectedEndDate ? ` · Ends ${formatDate(project.expectedEndDate)}` : " · Ongoing"}
                  </span>
                )}
                <strong className="projectCardTotal">{project.quotedTotal == null ? "—" : currency.format(project.quotedTotal)}</strong>
              </summary>
              {project.lines.length > 0 ? (
                <div className="projectScopeTableWrapper">
                  <table className="invoiceTable projectScopeTable">
                    <thead><tr><th>Accepted estimate scope</th><th>Quantity</th><th>Estimated unit cost</th><th>Line markup</th></tr></thead>
                    <tbody>
                      {project.lines.map((line) => (
                        <tr key={line.lineNumber}>
                          <td>{line.description}</td>
                          <td>{line.quantity} {line.unitName}</td>
                          <td>{currency.format(line.unitCost)}</td>
                          <td>{line.lineMarkupPercent}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="projectScopeEmpty">This project has no estimate scope attached.</p>}
              {project.internalNotes && (
                <div className="internalNotes projectInternalNotes">
                  <strong>Internal notes</strong>
                  <p>{project.internalNotes}</p>
                </div>
              )}
              {project.customerNotes && (
                <div className="customerNotes projectCustomerNotes">
                  <strong>Customer notes</strong>
                  <p>{project.customerNotes}</p>
                </div>
              )}
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
