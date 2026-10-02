import { getProjectsWithEstimates } from "@/app/lib/estimates";
import ProjectsWorkspace from "@/app/projects/projects-workspace";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await getProjectsWithEstimates();

  return (
    <main className="body projectsBody">
      <ProjectsWorkspace projects={projects} />
    </main>
  );
}
