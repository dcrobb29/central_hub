import { getProjectsWithEstimates } from "@/app/lib/estimates";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await getProjectsWithEstimates();

  return (
    <main className="body projectsBody">
      <div className="projectsWorkspace">
        <header className="salesToolbar">
          <div>
            <p className="salesEyebrow">PROJECTS &amp; JOBS</p>
            <h1>Project management</h1>
          </div>
          <p className="salesWorkflowNote">Won estimates carry their accepted scope into a project.</p>
        </header>
        {projects.length === 0 ? (
          <div className="projectsEmptyState">Won estimates will appear here as projects.</div>
        ) : (
          <div className="projectList">
            {projects.map((project) => (
              <details className="projectCard" key={project.projectId}>
                <summary>
                  <span className="projectCardTitle">
                    <strong>{project.projectName}</strong>
                    <span>{project.customerName ?? "Customer not specified"}</span>
                  </span>
                  <span className="projectCardMeta">{project.projectStatus}</span>
                  <span className="projectCardMeta">{project.estimateName ? `Estimate R${project.estimateRevisionNumber}` : "No estimate"}</span>
                  <strong className="projectCardTotal">{project.quotedTotal == null ? "—" : currency.format(project.quotedTotal)}</strong>
                </summary>
                {project.lines.length > 0 ? (
                  <div className="projectScopeTableWrapper">
                    <table className="invoiceTable projectScopeTable">
                      <thead><tr><th>Accepted estimate scope</th><th>Quantity</th><th>Estimated unit cost</th><th>Line markup</th></tr></thead>
                      <tbody>
                        {project.lines.map((line) => (
                          <tr key={line.lineNumber}>
                            <td>{line.description}</td>
                            <td>{line.quantity} {line.unitName}</td>
                            <td>{currency.format(line.unitCost)}</td>
                            <td>{line.lineMarkupPercent}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="projectScopeEmpty">This project has no estimate scope attached.</p>}
              </details>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
