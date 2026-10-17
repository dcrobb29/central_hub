import { getProjectFinancialSummary } from "@/app/lib/projects";
import ProjectFinancesTable from "../project-finances-table";
import { redirect } from "next/navigation";
import { ProjectAccessError, requireProjectSession } from "@/app/lib/project-access";

export const dynamic = "force-dynamic";

export default async function ProjectFinancesPage() {
  let session;
  try {
    session = await requireProjectSession(undefined, "finances.read");
  } catch (error) {
    if (error instanceof ProjectAccessError && error.status === 401) redirect("/login");
    if (error instanceof ProjectAccessError) return <p role="alert">{error.message}</p>;
    throw error;
  }
  const projects = await getProjectFinancialSummary({ organizationId: session.organization.organizationId });
  return <ProjectFinancesTable rows={projects} canCreateProject={session.permissions.includes("projects.write")} />;
}
