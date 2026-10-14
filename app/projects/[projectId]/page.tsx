import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProjectsWithEstimates } from "@/app/lib/estimates";
import { getProjectFinancialSummary } from "@/app/lib/projects";
import { getAllocationBills, getProjectBillCosts } from "@/app/lib/project-costs";
import { getInvoices } from "@/app/lib/invoices";
import { getBills } from "@/app/lib/bills";
import { getPersonnelData } from "@/app/lib/personnel";
import { getFieldOperationsEquipment, getFieldOperationsSchedule } from "@/app/lib/field-operations";
import { getCurrentWeekRange } from "@/app/lib/field-operations-dates";
import { requireProjectSession, ProjectAccessError } from "@/app/lib/project-access";
import { getCustomers } from "@/app/lib/customers";
import { customerLabel } from "@/app/lib/customer-fields";
import { DocumentNotes } from "@/app/components/document-notes";
import ProjectCostPanel from "../project-cost-panel";
import ProjectStatusSelector from "../project-status-selector";
import ProjectHubActions from "../project-hub-actions";
import ProjectAttachmentsPanel from "../project-attachments-panel";
import FieldOperationsWorkspace from "@/app/field-operations/field-operations-workspace";
import ContractChangesPanel from "@/app/components/contract-changes-panel";

export const dynamic = "force-dynamic";

const tabs = [
  ["overview", "Overview"], ["finances", "Scope & Finances"], ["documents", "Documents"],
  ["media", "Media"], ["schedule", "Schedule"], ["changes","Alternates & Change Orders"], ["reporting", "Reporting"],
] as const;
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const dollars = (value: number) => money.format(value);

export default async function ProjectPage({ params, searchParams }: {
  params: Promise<{ projectId: string }>; searchParams: Promise<{ tab?: string }>;
}) {
  let session;
  try { session = await requireProjectSession(); }
  catch (error) {
    if (error instanceof ProjectAccessError && error.status === 401) redirect("/login");
    if (error instanceof ProjectAccessError) return <main className="body projectsBody"><p role="alert">{error.message}</p><Link href="/projects">Back to projects</Link></main>;
    throw error;
  }
  const projectId = Number((await params).projectId);
  if (!Number.isSafeInteger(projectId) || projectId < 1 || projectId > 2_147_483_647) notFound();
  const organizationId = session.organization.organizationId;
  const [project] = await getProjectsWithEstimates({ projectId, organizationId });
  if (!project) notFound();
  const requestedTab = (await searchParams).tab;
  const tab = tabs.some(([key]) => key === requestedTab) ? requestedTab : "overview";
  const canReadFinances = session.permissions.includes("finances.read");
  const canWriteFinances = session.permissions.includes("finances.write");
  const canWriteProject = session.permissions.includes("projects.write");
  let content;

  if (tab === "finances" && canReadFinances) {
    const [costs, allocationBills, financials, invoices, bills] = await Promise.all([
      getProjectBillCosts({ projectId, organizationId }), getAllocationBills(organizationId),
      getProjectFinancialSummary({ projectId, organizationId }), getInvoices({ projectId, organizationId }),
      getBills({ projectId, organizationId }),
    ]);
    const financial = financials[0];
    content = <>
      <section className="projectHubSection">
        <h2>Scope, budget &amp; actual costs</h2>
        <p>The same estimate, supplier bills, allocations, and calculations used in the portfolio. Changes here update those records directly.</p>
        {project.engagementType === "Service" && <p>Estimated cost is per accepted occurrence; recorded costs and invoices below are for the whole agreement. These are not a completion-adjusted budget or an earned-value calculation.</p>}
        {canWriteFinances && canWriteProject && project.quotedTotal !== null && <ProjectHubActions projectId={projectId} projectName={project.projectName} />}
        <ProjectCostPanel project={project} costs={costs} bills={allocationBills} financials={financial} canEdit={canWriteFinances} />
      </section>
      <section className="projectHubSection">
        <h2>Invoices &amp; payments</h2>
        <div className="projectHubMetrics">
          <div><span>Invoiced</span><strong>{financial ? dollars(financial.income) : "Unavailable"}</strong></div>
          <div><span>Customer payments recorded</span><strong>{financial ? dollars(financial.paidIncome) : "Unavailable"}</strong></div>
          <div><span>Outstanding invoices</span><strong>{financial ? dollars(financial.unpaidIncome) : "Unavailable"}</strong></div>
        </div>
        <div className="projectScopeTableWrapper"><table className="invoiceTable">
          <caption>Invoices linked to this project</caption>
          <thead><tr><th>Invoice</th><th>Date</th><th>Due</th><th>Amount</th><th>Paid date</th><th>Export</th></tr></thead>
          <tbody>{invoices.map((invoice) => <tr key={invoice.id}>
            <td>{invoice.invoiceNo}</td><td>{invoice.invoiceDate}</td><td>{invoice.invoiceDueDate}</td>
            <td>{invoice.invoiceAmount}</td><td>{invoice.invoicePaidDate ?? "Unpaid"}</td>
            <td>{invoice.billingManaged ? <a href={`/api/projects/billing/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer">Invoice PDF</a> : "Finance invoice"}</td>
          </tr>)}{!invoices.length && <tr><td colSpan={6}>No invoices linked to this project.</td></tr>}</tbody>
        </table></div>
        <Link href="/finances/invoices">Open company invoices to edit payment or contact details</Link>
      </section>
      <section className="projectHubSection">
        <h2>Supplier bills</h2>
        <div className="projectScopeTableWrapper"><table className="invoiceTable">
          <caption>Bills attached or allocated to this project</caption>
          <thead><tr><th>Bill</th><th>Supplier</th><th>Date</th><th>Due</th><th>Cost for this project</th><th>Paid date</th></tr></thead>
          <tbody>{bills.map((bill) => <tr key={bill.id}>
            <td>{bill.billNo}</td><td>{bill.companyName}</td><td>{bill.billDate}</td><td>{bill.billDueDate ?? "-"}</td>
            <td>{bill.isSplit ? `${dollars(costs.filter((cost) => cost.billId === bill.id).reduce((sum, cost) => sum + cost.amount, 0))} (split allocation)` : bill.billAmount}</td>
            <td>{bill.billPaidDate ?? "Unpaid"}</td>
          </tr>)}{!bills.length && <tr><td colSpan={6}>No supplier bills linked to this project.</td></tr>}</tbody>
        </table></div>
        <Link href="/finances/bills">Open company bills to manage supplier invoices and payments</Link>
      </section>
    </>;
  } else if(tab==="changes") {
    content=<ContractChangesPanel key={projectId} context={{projectId}}/>;
  } else if (tab === "documents" || tab === "media") {
    content = <ProjectAttachmentsPanel key={`${projectId}:${tab}`} projectId={projectId} category={tab === "documents" ? "document" : "media"} canEdit={canWriteProject} />;
  } else if (tab === "schedule" && session.permissions.includes("planning.read")) {
    const week = getCurrentWeekRange(new Date());
    const [projects, personnel, equipment, visits] = await Promise.all([
      getProjectsWithEstimates({ organizationId }), getPersonnelData(organizationId),
      getFieldOperationsEquipment(organizationId), getFieldOperationsSchedule(week.startDate, week.endDate, organizationId),
    ]);
    content = <FieldOperationsWorkspace key={`${projectId}:${project.projectStatus}`} projects={projects} employees={personnel.people}
      roleNames={Object.fromEntries(personnel.roles.map((role) => [role.id, role.name]))} equipment={equipment}
      initialWeek={week} initialVisits={visits} projectId={projectId} canEdit={session.permissions.includes("planning.write")} />;
  } else if (tab === "reporting") {
    content = <section className="projectHubSection">
      <h2>Project reporting</h2>
      <p>This is the future home for budget-versus-completion charts, forecasts, and management presentations.</p>
      <p>No earned-value or percent-complete dashboard has been implemented yet. Recorded spending alone does not establish whether the project is ahead or behind budget for the work performed.</p>
      <Link href={`/projects/${projectId}?tab=finances`}>Review the current scope and financial records</Link>
    </section>;
  } else if (tab === "finances" || tab === "schedule") {
    content = <p role="alert">Your organization role does not permit viewing this section.</p>;
  } else {
    const customers = await getCustomers(organizationId);
    const customer = customers.find((item) => item.customerId === project.customerId);
    content = <section className="projectHubSection">
      <h2>Project overview</h2>
      <dl className="projectHubFacts">
        <div><dt>Customer</dt><dd>{customer ? customerLabel(customer) : project.customerName ?? "Not assigned"}</dd></div>
        <div><dt>Accepted estimate</dt><dd>{project.estimateName ?? "No accepted estimate"}</dd></div>
        <div><dt>{project.engagementType === "Service" ? "Quoted value per occurrence" : "Current contract value"}</dt><dd>{project.quotedTotal === null ? "Not available" : dollars(project.quotedTotal)}</dd></div>
        <div><dt>Start date</dt><dd>{project.expectedStartDate ?? "Not specified"}</dd></div>
        <div><dt>End date</dt><dd>{project.expectedEndDate ?? "Not specified"}</dd></div>
        <div><dt>Work type</dt><dd>{project.engagementType === "Service" ? `Recurring service - ${project.recurrenceFrequency ?? "Frequency not specified"}` : "One-time project"}</dd></div>
      </dl>
      <DocumentNotes internalNotes={project.internalNotes} customerNotes={project.customerNotes} />
      <div className="projectHubShortcuts">{tabs.slice(1).map(([key, label]) => <Link key={key} href={`/projects/${projectId}?tab=${key}`}>{label}</Link>)}</div>
    </section>;
  }
  return <main className="body projectsBody">
    <div className="projectHub">
      <nav className="projectHubBreadcrumb" aria-label="Breadcrumb"><Link href="/projects">Projects &amp; recurring jobs</Link><span> / {project.projectName}</span></nav>
      <header className="projectHubHeader">
        <div><p className="salesEyebrow">{session.organization.organizationName} / PROJECT WORKSPACE</p><h1>{project.projectName}</h1></div>
        {canWriteProject ? <ProjectStatusSelector projectId={projectId} projectName={project.projectName} status={project.projectStatus} /> : <strong>{project.projectStatus}</strong>}
      </header>
      <nav className="projectHubTabs" aria-label="Project sections">{tabs.map(([key, label]) =>
        <Link key={key} href={`/projects/${projectId}?tab=${key}`} aria-current={tab === key ? "page" : undefined}>{label}</Link>)}</nav>
      <div className="projectHubContent">{content}</div>
    </div>
  </main>;
}
