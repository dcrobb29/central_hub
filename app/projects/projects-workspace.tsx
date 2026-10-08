"use client";

import { useState } from "react";
import type { ProjectWithEstimate } from "@/app/lib/estimates";
import type { AllocationBill, ProjectBillCost } from "@/app/lib/project-costs";
import type { ProjectFinancialSummary } from "@/app/lib/projects";
import ProjectCostPanel from "./project-cost-panel";
import ProjectStatusSelector from "./project-status-selector";
import ListViewControls from "@/app/components/list-view-controls";

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

export default function ProjectsWorkspace({ projects, costs, bills, financials, initialProjectId }: {
  projects: ProjectWithEstimate[];
  costs: ProjectBillCost[];
  bills: AllocationBill[];
  financials: ProjectFinancialSummary[];
  initialProjectId: number | null;
}) {
  const [activeTab, setActiveTab] = useState<"Project" | "Service">(
    projects.find((project) => project.projectId === initialProjectId)?.engagementType ?? "Project",
  );
  const [statusFilter, setStatusFilter] = useState("All");
  const [sort, setSort] = useState("");

  const oneTimeProjects = projects.filter((project) => project.engagementType === "Project");
  const recurringProjects = projects.filter((project) => project.engagementType === "Service");
  const tabProjects = activeTab === "Project" ? oneTimeProjects : recurringProjects;
  const visibleProjects = tabProjects.filter((project) => statusFilter === "All" || project.projectStatus === statusFilter);
  if (sort) visibleProjects.sort((left, right) => {
    const byAmount = sort.startsWith("amount");
    if (byAmount && (left.quotedTotal == null || right.quotedTotal == null)) {
      if (left.quotedTotal == null && right.quotedTotal == null) return 0;
      return left.quotedTotal == null ? 1 : -1;
    }
    const comparison = byAmount ? (left.quotedTotal ?? 0) - (right.quotedTotal ?? 0)
      : left.projectName.localeCompare(right.projectName, undefined, { numeric: true, sensitivity: "base" });
    return sort.endsWith("desc") ? -comparison : comparison;
  });

  return (
    <div className="projectsWorkspace">
      <header className="salesToolbar">
        <div>
          <p className="salesEyebrow">PROJECTS &amp; JOBS</p>
          <h1>Project management</h1>
        </div>
        {/* <p className="salesWorkflowNote">Won estimates carry their accepted scope into a project.</p> */}
      </header>

      <div className="listViewToolbar">
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
        <ListViewControls id="projects" label="Projects" status={statusFilter} onStatusChange={setStatusFilter}
          statuses={["All", "Upcoming", "Active", "Complete"].map((value) => ({
            value, label: value === "Complete" ? "Completed" : value,
            count: tabProjects.filter((project) => value === "All" || project.projectStatus === value).length,
          }))}
          sort={sort} onSortChange={setSort} active={statusFilter !== "All" || Boolean(sort)}
          onReset={() => { setStatusFilter("All"); setSort(""); }} />
      </div>

      {visibleProjects.length === 0 ? (
        <div className="projectsEmptyState">
          {tabProjects.length > 0 ? "No projects match this status filter." : activeTab === "Project" ? "Won one-time estimates will appear here as projects." : "Won recurring estimates will appear here as projects."}
        </div>
      ) : (
        <div className="projectList">
          {visibleProjects.map((project) => (
            <details className="projectCard" id={`project-${project.projectId}`} key={project.projectId} open={project.projectId === initialProjectId ? true : undefined}>
              <summary>
                <span className="projectCardTitle">
                  <strong>{project.projectName}</strong>
                  <span>{project.customerName ?? "Customer not specified"}</span>
                </span>
                <ProjectStatusSelector projectId={project.projectId} projectName={project.projectName} status={project.projectStatus} />
                <div className="projectCardMetaContainer"> 
                  {activeTab === "Service" && (<span className="projectCardMeta">
                    {project.recurrenceFrequency ? FREQUENCY_LABELS[project.recurrenceFrequency] ?? project.recurrenceFrequency : "—"}
                    {project.expectedStartDate ? ` · Starts ${formatDate(project.expectedStartDate)}` : ""}
                    {project.expectedEndDate ? ` · Ends ${formatDate(project.expectedEndDate)}` : " · Ongoing"}
                  </span>)}
                </div>
                <div className="projectCardTotal">
                  <strong>{project.quotedTotal == null ? "—" : currency.format(project.quotedTotal)}</strong>
                </div>


              </summary>
              <ProjectCostPanel
                project={project}
                costs={costs.filter((cost) => cost.projectId === project.projectId)}
                bills={bills}
                financials={financials.find((summary) => summary.projectId === project.projectId)}
              />
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
