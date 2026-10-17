import { getProjectsWithEstimates } from "@/app/lib/estimates";
import ProjectsWorkspace from "@/app/projects/projects-workspace";
import { getCustomers } from "@/app/lib/customers";
import styles from "@/app/components/record-workspace.module.css";
import { redirect } from "next/navigation";
import { ProjectAccessError, requireProjectSession } from "@/app/lib/project-access";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ projectId?: string; created?: string }> }) {
  let session;
  try {
    session = await requireProjectSession(undefined, "projects.read");
  } catch (error) {
    if (error instanceof ProjectAccessError && error.status === 401) redirect("/login");
    if (error instanceof ProjectAccessError) return <main className={`body projectsBody ${styles.page}`}><p role="alert">{error.message}</p></main>;
    throw error;
  }
  const query = await searchParams;
  const requestedId = Number(query.projectId ?? query.created);
  const [projects, customers] = await Promise.all([
    getProjectsWithEstimates({ organizationId: session.organization.organizationId }),
    session.permissions.includes("finances.read")
      ? getCustomers(session.organization.organizationId)
      : Promise.resolve([]),
  ]);

  return (
    <main className={`body projectsBody ${styles.page}`}>
      <ProjectsWorkspace projects={projects} customers={customers} initialProjectId={Number.isSafeInteger(requestedId) ? requestedId : null} />
    </main>
  );
}
