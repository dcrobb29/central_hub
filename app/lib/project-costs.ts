import { getPool, sql } from "@/app/lib/db";
import { actualCostTotal, ProjectBillAssignmentError, ProjectCostError, type ProjectCostInput } from "@/app/lib/project-cost-pricing";
import { COMPLETED_PROJECT_MESSAGE } from "@/app/lib/project-status";
import { rollbackIfActive } from "@/app/lib/sql-transactions";
import type { Transaction } from "mssql";

export type ProjectBillCost = ProjectCostInput & {
  costId: number;
  billNo: string;
  amount: number;
};

export type AllocationBill = {
  billId: string;
  billNo: string;
  projectId: number | null;
  projectName: string | null;
  isSplit: boolean;
  allocatedProjectIds: number[];
  readOnly: boolean;
  billDate: string;
  companyName: string | null;
  amount: number | null;
  allocatedAmount: number;
  remainingAmount: number | null;
};

export async function getAllocationBills(): Promise<AllocationBill[]> {
  const pool = await getPool();
  const result = await pool.request().query<Omit<AllocationBill, "allocatedProjectIds"> & { allocatedProjects: string }>(`
    SELECT RTRIM(b.id) AS billId, RTRIM(b.[Bill No]) AS billNo, b.ProjectID AS projectId, p.ProjectName AS projectName,
      CONVERT(varchar(10), b.[Bill Date], 23) AS billDate, NULLIF(RTRIM(b.[Company Name]), '') AS companyName,
      totals.Amount AS amount, COALESCE(a.Allocated, 0) AS allocatedAmount,
      totals.Amount - COALESCE(a.Allocated, 0) AS remainingAmount
      , b.IsSplit AS isSplit,
      COALESCE((SELECT STRING_AGG(CONVERT(varchar(max), ids.ProjectID), ',')
        FROM (SELECT DISTINCT ProjectID FROM dbo.ProjectBillCosts WHERE BillID = b.id AND IsActive = 1) ids), '') AS allocatedProjects,
      CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.Projects p WHERE p.ProjectStatus = 'Complete'
        AND (p.ProjectID = b.ProjectID OR EXISTS (SELECT 1 FROM dbo.ProjectBillCosts c
          WHERE c.BillID = b.id AND c.ProjectID = p.ProjectID AND c.IsActive = 1))) THEN 1 ELSE 0 END AS bit) AS readOnly
    FROM dbo.Bills b
    LEFT JOIN dbo.Projects p ON p.ProjectID = b.ProjectID
    CROSS APPLY (SELECT TRY_CONVERT(decimal(19,2), NULLIF(REPLACE(REPLACE(RTRIM(b.[Bill Amount]), '$', ''), ',', ''), '')) AS Amount) totals
    OUTER APPLY (SELECT SUM(c.Amount) AS Allocated FROM dbo.ProjectBillCosts c WHERE c.BillID = b.id AND c.IsActive = 1) a
    ORDER BY b.[Bill Date] DESC, b.id
  `);
  return result.recordset.map(({ allocatedProjects, ...bill }) => ({
    ...bill, allocatedProjectIds: allocatedProjects ? allocatedProjects.split(",").map(Number) : [],
  }));
}

export async function getProjectBillCosts(): Promise<ProjectBillCost[]> {
  const pool = await getPool();
  return (await pool.request().query<ProjectBillCost>(`
    SELECT c.ProjectBillCostID AS costId, c.ProjectID AS projectId, RTRIM(c.BillID) AS billId,
      RTRIM(b.[Bill No]) AS billNo, c.EstimateLineItemID AS estimateLineItemId, c.Description AS description,
      CONVERT(varchar(10), c.CostDate, 23) AS costDate, c.Quantity AS quantity, c.UnitName AS unitName,
      c.UnitCost AS unitCost, c.FreightAmount AS freightAmount, c.TaxAmount AS taxAmount, c.Amount AS amount
    FROM dbo.ProjectBillCosts c JOIN dbo.Bills b ON b.id = c.BillID
    WHERE c.IsActive = 1
    ORDER BY c.CostDate, c.ProjectBillCostID
  `)).recordset;
}

async function unassignEmptyBill(transaction: Transaction, projectId: number, billId: string): Promise<void> {
  await transaction.request().input("projectId", sql.Int, projectId).input("billId", sql.NChar(10), billId).query(`
    UPDATE dbo.Bills SET ProjectID = NULL
    WHERE id = @billId AND ProjectID = @projectId AND IsSplit = 0
      AND NOT EXISTS (SELECT 1 FROM dbo.ProjectBillCosts WHERE BillID = @billId AND IsActive = 1)
  `);
}

export async function saveProjectBillCost(input: ProjectCostInput, costId: number | null = null): Promise<number> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    // Lock the project first, then all its bills in key order, serializing edits
    // that transfer an allocation between bills as well as new allocations.
    const project = await transaction.request().input("projectId", sql.Int, input.projectId)
      .query<{ ProjectID: number; ProjectStatus: string }>("SELECT ProjectID, ProjectStatus FROM dbo.Projects WITH (UPDLOCK, HOLDLOCK) WHERE ProjectID = @projectId");
    if (!project.recordset[0]) throw new ProjectCostError("The project no longer exists");
    if (project.recordset[0].ProjectStatus === "Complete") throw new ProjectCostError(COMPLETED_PROJECT_MESSAGE);
    const bills = await transaction.request().input("projectId", sql.Int, input.projectId).input("billId", sql.NChar(10), input.billId)
      .input("costId", sql.Int, costId)
      .query<{ id: string; projectId: number | null; isSplit: boolean; amount: number | null }>(`
        SELECT RTRIM(id) AS id, ProjectID AS projectId, IsSplit AS isSplit,
          TRY_CONVERT(decimal(19,2), NULLIF(REPLACE(REPLACE(RTRIM([Bill Amount]), '$', ''), ',', ''), '')) AS amount
        FROM dbo.Bills WITH (UPDLOCK, HOLDLOCK)
        WHERE ProjectID = @projectId OR id = @billId OR id IN (
          SELECT BillID FROM dbo.ProjectBillCosts WHERE ProjectBillCostID = @costId AND ProjectID = @projectId AND IsActive = 1
        ) ORDER BY id
      `);
    const bill = bills.recordset.find((candidate) => candidate.id === input.billId);
    if (!bill) throw new ProjectCostError("The selected bill no longer exists");
    if (!bill.isSplit && bill.projectId !== null && bill.projectId !== input.projectId) {
      throw new ProjectBillAssignmentError("This bill is already assigned to another job. Choose an unassigned bill or one attached to this job.");
    }
    if (bill.amount === null || bill.amount <= 0) throw new ProjectCostError("This bill must have a valid positive total before allocating costs");
    let previousBillId: string | null = null;
    if (costId !== null) {
      const existing = await transaction.request().input("costId", sql.Int, costId).input("projectId", sql.Int, input.projectId)
        .query<{ billId: string }>("SELECT RTRIM(BillID) AS billId FROM dbo.ProjectBillCosts WITH (UPDLOCK, HOLDLOCK) WHERE ProjectBillCostID = @costId AND ProjectID = @projectId AND IsActive = 1");
      if (!existing.recordset[0]) throw new ProjectCostError("The cost row no longer exists in this project");
      previousBillId = existing.recordset[0].billId;
    }
    if (input.estimateLineItemId !== null) {
      const line = await transaction.request().input("lineId", sql.Int, input.estimateLineItemId).input("projectId", sql.Int, input.projectId)
        .query(`
          SELECT li.EstimateLineItemID FROM dbo.EstimateLineItems li
          JOIN dbo.Projects p ON p.AcceptedEstimateRevisionID = li.EstimateRevisionID
          WHERE p.ProjectID = @projectId AND li.EstimateLineItemID = @lineId
        `);
      if (!line.recordset[0]) throw new ProjectCostError("Choose a line from this project's accepted estimate");
    }
    const allocated = await transaction.request().input("billId", sql.NChar(10), input.billId).input("costId", sql.Int, costId)
      .query<{ amount: number }>(`
        SELECT COALESCE(SUM(Amount), 0) AS amount FROM dbo.ProjectBillCosts
        WHERE BillID = @billId AND IsActive = 1 AND (@costId IS NULL OR ProjectBillCostID <> @costId)
      `);
    const amount = actualCostTotal(input);
    if (Math.round(allocated.recordset[0].amount * 100) + Math.round(amount * 100) > Math.round(bill.amount * 100)) {
      throw new ProjectCostError("These costs exceed the bill total. Reduce the allocation or correct the bill in Finances.");
    }
    if (!bill.isSplit && bill.projectId === null) {
      await transaction.request().input("billId", sql.NChar(10), input.billId).input("projectId", sql.Int, input.projectId)
        .query("UPDATE dbo.Bills SET ProjectID = @projectId WHERE id = @billId AND ProjectID IS NULL");
    }
    const request = transaction.request()
      .input("costId", sql.Int, costId).input("projectId", sql.Int, input.projectId)
      .input("billId", sql.NChar(10), input.billId).input("lineId", sql.Int, input.estimateLineItemId)
      .input("description", sql.NVarChar(300), input.description).input("costDate", sql.Date, new Date(`${input.costDate}T00:00:00Z`))
      .input("quantity", sql.Decimal(19, 4), input.quantity).input("unitName", sql.NVarChar(30), input.unitName)
      .input("unitCost", sql.Decimal(19, 4), input.unitCost).input("freight", sql.Decimal(19, 2), input.freightAmount)
      .input("tax", sql.Decimal(19, 2), input.taxAmount).input("amount", sql.Decimal(19, 2), amount);
    const result = await request.query<{ costId: number }>(costId === null ? `
      INSERT INTO dbo.ProjectBillCosts (ProjectID, BillID, EstimateLineItemID, Description, CostDate, Quantity, UnitName, UnitCost, FreightAmount, TaxAmount, Amount)
      VALUES (@projectId, @billId, @lineId, @description, @costDate, @quantity, @unitName, @unitCost, @freight, @tax, @amount);
      SELECT CONVERT(int, SCOPE_IDENTITY()) AS costId;
    ` : `
      DECLARE @updated TABLE (costId int);
      UPDATE dbo.ProjectBillCosts SET BillID = @billId, EstimateLineItemID = @lineId, Description = @description,
        CostDate = @costDate, Quantity = @quantity, UnitName = @unitName, UnitCost = @unitCost,
        FreightAmount = @freight, TaxAmount = @tax, Amount = @amount, UpdatedAt = SYSUTCDATETIME()
      OUTPUT inserted.ProjectBillCostID INTO @updated
      WHERE ProjectBillCostID = @costId AND ProjectID = @projectId AND IsActive = 1;
      SELECT costId FROM @updated;
    `);
    if (previousBillId !== null && previousBillId !== input.billId) {
      await unassignEmptyBill(transaction, input.projectId, previousBillId);
    }
    await transaction.commit();
    return result.recordset[0].costId;
  } catch (error) {
    await rollbackIfActive(transaction);
    throw error;
  }
}

export async function removeProjectBillCost(projectId: number, costId: number): Promise<void> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const project = await transaction.request().input("projectId", sql.Int, projectId)
      .query<{ ProjectStatus: string }>("SELECT ProjectStatus FROM dbo.Projects WITH (UPDLOCK, HOLDLOCK) WHERE ProjectID = @projectId");
    if (!project.recordset[0]) throw new ProjectCostError("The project no longer exists");
    if (project.recordset[0].ProjectStatus === "Complete") throw new ProjectCostError(COMPLETED_PROJECT_MESSAGE);
    const bill = await transaction.request().input("projectId", sql.Int, projectId).input("costId", sql.Int, costId)
      .query<{ billId: string }>(`
        SELECT RTRIM(id) AS billId FROM dbo.Bills WITH (UPDLOCK, HOLDLOCK)
        WHERE id IN (SELECT BillID FROM dbo.ProjectBillCosts
          WHERE ProjectID = @projectId AND ProjectBillCostID = @costId AND IsActive = 1)
      `);
    if (!bill.recordset[0]) throw new ProjectCostError("The cost row no longer exists in this project");
    const result = await transaction.request().input("projectId", sql.Int, projectId).input("costId", sql.Int, costId).query(`
      UPDATE dbo.ProjectBillCosts SET IsActive = 0, UpdatedAt = SYSUTCDATETIME()
      WHERE ProjectID = @projectId AND ProjectBillCostID = @costId AND IsActive = 1
    `);
    if (result.rowsAffected[0] !== 1) throw new ProjectCostError("The cost row no longer exists in this project");
    await unassignEmptyBill(transaction, projectId, bill.recordset[0].billId);
    await transaction.commit();
  } catch (error) {
    await rollbackIfActive(transaction);
    throw error;
  }
}
