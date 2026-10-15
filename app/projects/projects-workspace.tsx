"use client";

import { useMemo, useState } from "react";
import type { ProjectWithEstimate } from "@/app/lib/estimates";
import ProjectStatusSelector from "./project-status-selector";
import ListViewControls from "@/app/components/list-view-controls";
import { customerLabel, type Customer } from "@/app/lib/customer-fields";
import ProjectBillingModal from "./project-billing-modal";
import { ArrowUpRight, ReceiptText } from "lucide-react";
import Link from "next/link";
import styles from "@/app/components/record-workspace.module.css";

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

export default function ProjectsWorkspace({ projects, customers, initialProjectId }: {
  projects: ProjectWithEstimate[];
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
    <div className={`projectsWorkspace ${styles.workspace}`}>
      <header className={styles.heading}>
        <div>
          <p className="salesEyebrow">PROJECTS &amp; JOBS</p>
          <h1>Project management</h1>
        </div>
        <p>Jobs at a glance. Open a project for scope, costs, files, and scheduling.</p>
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
        <div className={styles.list} aria-label={activeTab === "Project" ? "Projects" : "Recurring jobs"}>
          {visibleProjects.map((project) => (
            <article className={styles.card} id={`project-${project.projectId}`} key={project.projectId}
              aria-labelledby={`project-title-${project.projectId}`}
              data-highlighted={project.projectId === initialProjectId || undefined}>
                <div className={styles.identity}>
                  <h2 id={`project-title-${project.projectId}`}>
                    <Link href={`/projects/${project.projectId}`}>{project.projectName}</Link>
                  </h2>
                  <p>{(() => {
                    const customer = project.customerId !== null ? customersById.get(project.customerId) : undefined;
                    return customer ? customerLabel(customer) : project.customerName ?? "Customer not specified";
                  })()}</p>
                  {activeTab === "Service" && <p className={styles.recurrence}>
                    {project.recurrenceFrequency ? FREQUENCY_LABELS[project.recurrenceFrequency] ?? project.recurrenceFrequency : "Frequency not specified"}
                    {project.expectedStartDate ? ` · From ${formatDate(project.expectedStartDate)}` : ""}
                    {project.expectedEndDate ? ` · Until ${formatDate(project.expectedEndDate)}` : " · Ongoing"}
                  </p>}
                </div>
                <div className={styles.status}>
                  <span className={styles.label}>Status</span>
                  <ProjectStatusSelector projectId={project.projectId} projectName={project.projectName} status={project.projectStatus} />
                </div>
                <div className={styles.value}>
                  <span className={styles.label}>{activeTab === "Service" ? "Per occurrence" : "Contract value"}</span>
                  <strong>{project.quotedTotal == null ? "—" : currency.format(project.quotedTotal)}</strong>
                </div>
                <div className={styles.actions}>
                  <button type="button" className="projectInvoiceButton" disabled={project.quotedTotal === null}
                    aria-label={`Invoice ${project.projectName}`} onClick={() => {
                      setBilling({ projectId: project.projectId, projectName: project.projectName, tab: "invoice" });
                    }}><ReceiptText size={16} aria-hidden="true" />Invoice</button>
                  <Link className={styles.openRecord} href={`/projects/${project.projectId}`}
                    aria-label={`Open project: ${project.projectName}`}>
                    Open project <ArrowUpRight size={15} aria-hidden="true" />
                  </Link>
                </div>
            </article>
          ))}
        </div>
      )}
      {billing && <ProjectBillingModal key={billing.projectId} projectId={billing.projectId} projectName={billing.projectName}
        initialTab={billing.tab} onClose={() => setBilling(null)} />}
    </div>
  );
}
