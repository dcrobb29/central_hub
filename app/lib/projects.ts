import { getPool, sql } from "@/app/lib/db";
import type { ProjectStatus } from "@/app/lib/project-status";

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

export async function getProjects(): Promise<ProjectOption[]> {
  const pool = await getPool();
  const result = await pool.request().query<ProjectOption>(`
    SELECT ProjectID AS projectId, ProjectName AS projectName, ProjectStatus AS projectStatus
    FROM dbo.Projects
    ORDER BY ProjectName, ProjectID
  `);
  return result.recordset;
}

export async function getProjectFinancialSummary(): Promise<ProjectFinancialSummary[]> {
  const pool = await getPool();
  const result = await pool.request().query<ProjectFinancialSummary>(`
    SELECT
      ProjectID AS projectId,
      ProjectName AS projectName,
      (SELECT ProjectStatus FROM dbo.Projects p WHERE p.ProjectID = dbo.ProjectFinancialSummary.ProjectID) AS projectStatus,
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
    ORDER BY ProjectName, ProjectID
  `);
  return result.recordset;
}

export async function updateProjectStatus(projectId: number, status: ProjectStatus): Promise<boolean> {
  const pool = await getPool();
  const result = await pool.request().input("projectId", sql.Int, projectId).input("status", sql.VarChar(24), status)
    .query("UPDATE dbo.Projects SET ProjectStatus = @status WHERE ProjectID = @projectId");
  return result.rowsAffected[0] === 1;
}

export async function createProject(projectName: string): Promise<number> {
  const pool = await getPool();
  const result = await pool.request()
    .input("projectName", sql.NVarChar(150), projectName)
    .query<{ ProjectID: number }>(`
      INSERT INTO dbo.Projects (ProjectName)
      VALUES (@projectName);
      SELECT CONVERT(int, SCOPE_IDENTITY()) AS ProjectID;
    `);
  return result.recordset[0].ProjectID;
}
