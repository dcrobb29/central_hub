import { getProjectsWithEstimates } from "@/app/lib/estimates";
import ProjectsWorkspace from "@/app/projects/projects-workspace";
import { getCustomers } from "@/app/lib/customers";
import styles from "@/app/components/record-workspace.module.css";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ projectId?: string; created?: string }> }) {
  const query = await searchParams;
  const requestedId = Number(query.projectId ?? query.created);
  const [projects, customers] = await Promise.all([
    getProjectsWithEstimates(), getCustomers(),
  ]);

  return (
    <main className={`body projectsBody ${styles.page}`}>
      <ProjectsWorkspace projects={projects} customers={customers} initialProjectId={Number.isSafeInteger(requestedId) ? requestedId : null} />
    </main>
  );
}
