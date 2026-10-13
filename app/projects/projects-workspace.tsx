"use client";

import { useMemo, useState } from "react";
import type { ProjectWithEstimate } from "@/app/lib/estimates";
import type { AllocationBill, ProjectBillCost } from "@/app/lib/project-costs";
import type { ProjectFinancialSummary } from "@/app/lib/projects";
import ProjectCostPanel from "./project-cost-panel";
import ProjectStatusSelector from "./project-status-selector";
import ListViewControls from "@/app/components/list-view-controls";
import ProjectCustomerSelector from "./project-customer-selector";
import { customerLabel, type Customer } from "@/app/lib/customer-fields";
import ProjectBillingModal from "./project-billing-modal";
import { ReceiptText } from "lucide-react";
import { DocumentNotes } from "@/app/components/document-notes";
import Link from "next/link";

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

export default function ProjectsWorkspace({ projects, costs, bills, financials, customers, initialProjectId }: {
  projects: ProjectWithEstimate[];
  costs: ProjectBillCost[];
  bills: AllocationBill[];
  financials: ProjectFinancialSummary[];
  customers: Customer[];
  initialProjectId: number | null;
}) {
  const [activeTab, setActiveTab] = useState<"Project" | "Service">(
    projects.find((project) => project.projectId === initialProjectId)?.engagementType ?? "Project",
  );
  const [statusFilter, setStatusFilter] = useState("All");
  const [sort, setSort] = useState("");
  const [billing, setBilling] = useState<{ projectId: number; projectName: string; tab: "completion" | "invoice" } | null>(null);

  const customersById = useMemo(() => new Map(customers.map((c) => [c.customerId, c])), [customers]);

  const costsByProjectId = useMemo(() => {
    const map = new Map<number, ProjectBillCost[]>();
    for (const cost of costs) {
      const list = map.get(cost.projectId);
      if (list) list.push(cost);
      else map.set(cost.projectId, [cost]);
    }
    return map;
  }, [costs]);

  const financialsByProjectId = useMemo(() => {
    const map = new Map<number, ProjectFinancialSummary>();
    for (const f of financials) {
      map.set(f.projectId, f);
    }
    return map;
  }, [financials]);

  const oneTimeProjects = useMemo(() => projects.filter((project) => project.engagementType === "Project"), [projects]);
  const recurringProjects = useMemo(() => projects.filter((project) => project.engagementType === "Service"), [projects]);
  const tabProjects = activeTab === "Project" ? oneTimeProjects : recurringProjects;

  const visibleProjects = useMemo(() => {
    const list = tabProjects.filter((project) => statusFilter === "All" || project.projectStatus === statusFilter);
    if (!sort) return list;
    return [...list].sort((left, right) => {
      const byAmount = sort.startsWith("amount");
      if (byAmount && (left.quotedTotal == null || right.quotedTotal == null)) {
        if (left.quotedTotal == null && right.quotedTotal == null) return 0;
        return left.quotedTotal == null ? 1 : -1;
      }
      const comparison = byAmount
        ? (left.quotedTotal ?? 0) - (right.quotedTotal ?? 0)
        : left.projectName.localeCompare(right.projectName, undefined, { numeric: true, sensitivity: "base" });
      return sort.endsWith("desc") ? -comparison : comparison;
    });
  }, [tabProjects, statusFilter, sort]);

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
                  <span>{(() => {
                    const customer = project.customerId !== null ? customersById.get(project.customerId) : undefined;
                    return customer ? customerLabel(customer) : project.customerName ?? "Customer not specified";
                  })()}</span>
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
                  <button type="button" className="projectInvoiceButton" disabled={project.quotedTotal === null}
                    aria-label={`Invoice ${project.projectName}`} onClick={(event) => {
                      event.preventDefault(); event.stopPropagation();
                      setBilling({ projectId: project.projectId, projectName: project.projectName, tab: "invoice" });
                    }}><ReceiptText size={16} aria-hidden="true" />Invoice</button>
                </div>


              </summary>
              <div className="projectCompletionAction"><Link className="projectWorkspaceLink" href={`/projects/${project.projectId}`}>Open project workspace</Link></div>
              <ProjectCustomerSelector projectId={project.projectId} customerId={project.customerId} customers={customers} readOnly={project.projectStatus === "Complete"} />
              <div className="projectCompletionAction"><button type="button" className="estimateTextAction" disabled={project.quotedTotal === null}
                onClick={() => setBilling({ projectId: project.projectId, projectName: project.projectName, tab: "completion" })}>
                Track scope{project.engagementType === "Service" ? " / occurrence" : ""} completion &amp; billing
              </button></div>
              <ProjectCostPanel
                project={project}
                costs={costsByProjectId.get(project.projectId) ?? []}
                bills={bills}
                financials={financialsByProjectId.get(project.projectId)}
              />
              <DocumentNotes internalNotes={project.internalNotes} customerNotes={project.customerNotes}
                internalClassName="projectInternalNotes" customerClassName="projectCustomerNotes" />
            </details>
          ))}
        </div>
      )}
      {billing && <ProjectBillingModal key={billing.projectId} projectId={billing.projectId} projectName={billing.projectName}
        initialTab={billing.tab} onClose={() => setBilling(null)} />}
    </div>
  );
}
