import { getProjectFinancialSummary } from "@/app/lib/projects";
import ProjectFinancesTable from "../project-finances-table";

export const dynamic = "force-dynamic";

export default async function ProjectFinancesPage() {
  const projects = await getProjectFinancialSummary();
  return <ProjectFinancesTable rows={projects} />;
}
