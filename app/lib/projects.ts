import { getPool, sql } from "@/app/lib/db";

export type ProjectOption = {
  projectId: number;
  projectName: string;
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
    SELECT ProjectID AS projectId, ProjectName AS projectName
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

export async function createProject(projectName: string): Promise<number> {
  const pool = await getPool();
  const result = await pool.request()
    .input("projectName", sql.NVarChar(150), projectName)
    .query<{ ProjectID: number }>(`
      INSERT INTO dbo.Projects (ProjectName)
      OUTPUT inserted.ProjectID
      VALUES (@projectName)
    `);
  return result.recordset[0].ProjectID;
}
