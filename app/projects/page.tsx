import { getProjectsWithEstimates } from "@/app/lib/estimates";
import ProjectsWorkspace from "@/app/projects/projects-workspace";
import { getAllocationBills, getProjectBillCosts } from "@/app/lib/project-costs";
import { getProjectFinancialSummary } from "@/app/lib/projects";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const requestedId = Number((await searchParams).projectId);
  const [projects, bills, costs, financials] = await Promise.all([
    getProjectsWithEstimates(), getAllocationBills(), getProjectBillCosts(), getProjectFinancialSummary(),
  ]);

  return (
    <main className="body projectsBody">
      <ProjectsWorkspace projects={projects} bills={bills} costs={costs} financials={financials} initialProjectId={Number.isSafeInteger(requestedId) ? requestedId : null} />
    </main>
  );
}
