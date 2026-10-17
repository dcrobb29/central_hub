import { getPool, sql } from "@/app/lib/db";
import type { ProjectStatus } from "@/app/lib/project-status";
import { rollbackIfActive } from "@/app/lib/sql-transactions";
import { ensureProjectBillingSnapshot } from "@/app/lib/project-billing";

export type ProjectOption = {
  projectId: number;
  projectName: string;
  projectStatus: ProjectStatus;
};

export type ProjectFinancialSummary = ProjectOption & {
  income: number;
  paidIncome: number;
  unpaidIncome: number;
  percentOfIncome: number;
  costs: number;
  paidCosts: number;
  unpaidCosts: number;
  percentOfCosts: number;
  profit: number;
  profitMargin: number;
};

export async function getProjects(organizationId: number): Promise<ProjectOption[]> {
  const pool = await getPool();
  const result = await pool.request().input("organizationId", sql.Int, organizationId).query<ProjectOption>(`
    SELECT ProjectID AS projectId, ProjectName AS projectName, ProjectStatus AS projectStatus
    FROM dbo.Projects
    WHERE OrganizationID = @organizationId
    ORDER BY ProjectName, ProjectID
  `);
  return result.recordset;
}

export async function getProjectFinancialSummary(filter: { organizationId: number; projectId?: number }): Promise<ProjectFinancialSummary[]> {
  const pool = await getPool();
  const result = await pool.request()
    .input("projectId", sql.Int, filter.projectId ?? null)
    .input("organizationId", sql.Int, filter.organizationId).query<ProjectFinancialSummary>(`
    SELECT
      ProjectID AS projectId,
      ProjectName AS projectName,
      (SELECT ProjectStatus FROM dbo.Projects p
        WHERE p.ProjectID = dbo.ProjectFinancialSummary.ProjectID AND p.OrganizationID = @organizationId) AS projectStatus,
      Income AS income,
      PaidIncome AS paidIncome,
      UnpaidIncome AS unpaidIncome,
      PercentOfIncome AS percentOfIncome,
      Costs AS costs,
      PaidCosts AS paidCosts,
      UnpaidCosts AS unpaidCosts,
      PercentOfCosts AS percentOfCosts,
      Profit AS profit,
      ProfitMargin AS profitMargin
    FROM dbo.ProjectFinancialSummary
    WHERE (@projectId IS NULL OR ProjectID = @projectId)
      AND EXISTS (SELECT 1 FROM dbo.Projects p
        WHERE p.ProjectID = dbo.ProjectFinancialSummary.ProjectID AND p.OrganizationID = @organizationId)
    ORDER BY ProjectName, ProjectID
  `);
  return result.recordset;
}

export async function updateProjectStatus(projectId: number, status: ProjectStatus, organizationId: number): Promise<boolean> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const project = await transaction.request().input("projectId", sql.Int, projectId).input("organizationId", sql.Int, organizationId)
      .query<{ revisionId: number | null; engagementType: string }>("SELECT AcceptedEstimateRevisionID AS revisionId,EngagementType AS engagementType FROM dbo.Projects WITH(UPDLOCK,HOLDLOCK) WHERE ProjectID=@projectId AND OrganizationID=@organizationId");
    if (!project.recordset[0]) { await transaction.commit(); return false; }
    if (status === "Complete" && project.recordset[0].engagementType === "Project" && project.recordset[0].revisionId) {
      await ensureProjectBillingSnapshot(transaction, projectId);
      await transaction.request().input("projectId", sql.Int, projectId).input("organizationId", sql.Int, organizationId).query(`
        UPDATE dbo.ProjectBillingUnits SET CompletionStatus='Complete'
        WHERE ProjectID=@projectId AND OrganizationID=@organizationId AND ServiceVisitID IS NULL;
        UPDATE s SET CompletionStatus='Complete' FROM dbo.ProjectBillingScopes s
        JOIN dbo.ProjectBillingUnits u ON u.BillingUnitID=s.BillingUnitID AND u.OrganizationID=@organizationId
        WHERE u.ProjectID=@projectId AND u.ServiceVisitID IS NULL;
      `);
    }
    await transaction.request().input("projectId", sql.Int, projectId).input("status", sql.VarChar(24), status)
      .input("organizationId", sql.Int, organizationId)
      .query("UPDATE dbo.Projects SET ProjectStatus=@status WHERE ProjectID=@projectId AND OrganizationID=@organizationId");
    await transaction.commit();
    return true;
  } catch (error) { await rollbackIfActive(transaction); throw error; }
}

export async function createProject(projectName: string, organizationId: number): Promise<number> {
  const pool = await getPool();
  const result = await pool.request()
    .input("projectName", sql.NVarChar(150), projectName)
    .input("organizationId", sql.Int, organizationId)
    .query<{ ProjectID: number }>(`
      INSERT INTO dbo.Projects (ProjectName, OrganizationID)
      VALUES (@projectName, @organizationId);
      SELECT CONVERT(int, SCOPE_IDENTITY()) AS ProjectID;
    `);
  return result.recordset[0].ProjectID;
}

export async function updateProjectCustomer(projectId: number, customerId: number | null, organizationId: number): Promise<boolean> {
  const pool = await getPool();
  const result = await pool.request().input("projectId", sql.Int, projectId).input("customerId", sql.Int, customerId)
    .input("organizationId", sql.Int, organizationId)
    .query(`
      IF @customerId IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM dbo.Customers WHERE CustomerID = @customerId AND IsActive = 1 AND OrganizationID = @organizationId)
        AND NOT EXISTS (SELECT 1 FROM dbo.Projects WHERE ProjectID = @projectId AND CustomerID = @customerId AND OrganizationID = @organizationId)
        THROW 51040, 'Choose an active customer. Archived customers cannot be used for new assignments.', 1;
      UPDATE dbo.Projects SET CustomerID = @customerId WHERE ProjectID = @projectId AND OrganizationID = @organizationId;
    `);
  return result.rowsAffected[0] === 1;
}
