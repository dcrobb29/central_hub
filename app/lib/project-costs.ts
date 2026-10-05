import { getPool, sql } from "@/app/lib/db";
import { actualCostTotal, ProjectCostError, type ProjectCostInput } from "@/app/lib/project-cost-pricing";

export type ProjectBillCost = ProjectCostInput & {
  costId: number;
  billNo: string;
  amount: number;
};

export type AllocationBill = {
  billId: string;
  billNo: string;
  projectId: number | null;
  billDate: string;
  companyName: string | null;
  amount: number | null;
  allocatedAmount: number;
  remainingAmount: number | null;
};

export async function getAllocationBills(): Promise<AllocationBill[]> {
  const pool = await getPool();
  return (await pool.request().query<AllocationBill>(`
    SELECT RTRIM(b.id) AS billId, RTRIM(b.[Bill No]) AS billNo, b.ProjectID AS projectId,
      CONVERT(varchar(10), b.[Bill Date], 23) AS billDate, NULLIF(RTRIM(b.[Company Name]), '') AS companyName,
      totals.Amount AS amount, COALESCE(a.Allocated, 0) AS allocatedAmount,
      totals.Amount - COALESCE(a.Allocated, 0) AS remainingAmount
    FROM dbo.Bills b
    CROSS APPLY (SELECT TRY_CONVERT(decimal(19,2), NULLIF(REPLACE(REPLACE(RTRIM(b.[Bill Amount]), '$', ''), ',', ''), '')) AS Amount) totals
    OUTER APPLY (SELECT SUM(c.Amount) AS Allocated FROM dbo.ProjectBillCosts c WHERE c.BillID = b.id AND c.IsActive = 1) a
    ORDER BY b.[Bill Date] DESC, b.id
  `)).recordset;
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

export async function saveProjectBillCost(input: ProjectCostInput, costId: number | null = null): Promise<number> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    // Lock the project first, then all its bills in key order, serializing edits
    // that transfer an allocation between bills as well as new allocations.
    const project = await transaction.request().input("projectId", sql.Int, input.projectId)
      .query<{ ProjectID: number }>("SELECT ProjectID FROM dbo.Projects WITH (UPDLOCK, HOLDLOCK) WHERE ProjectID = @projectId");
    if (!project.recordset[0]) throw new ProjectCostError("The project no longer exists");
    const bills = await transaction.request().input("projectId", sql.Int, input.projectId)
      .query<{ id: string; amount: number | null }>(`
        SELECT RTRIM(id) AS id,
          TRY_CONVERT(decimal(19,2), NULLIF(REPLACE(REPLACE(RTRIM([Bill Amount]), '$', ''), ',', ''), '')) AS amount
        FROM dbo.Bills WITH (UPDLOCK, HOLDLOCK) WHERE ProjectID = @projectId ORDER BY id
      `);
    const bill = bills.recordset.find((candidate) => candidate.id === input.billId);
    if (!bill) throw new ProjectCostError("Assign this bill to the project in Finances before adding costs");
    if (bill.amount === null || bill.amount <= 0) throw new ProjectCostError("This bill must have a valid positive total before allocating costs");
    if (costId !== null) {
      const existing = await transaction.request().input("costId", sql.Int, costId).input("projectId", sql.Int, input.projectId)
        .query("SELECT ProjectBillCostID FROM dbo.ProjectBillCosts WITH (UPDLOCK, HOLDLOCK) WHERE ProjectBillCostID = @costId AND ProjectID = @projectId AND IsActive = 1");
      if (!existing.recordset[0]) throw new ProjectCostError("The cost row no longer exists in this project");
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
    const request = transaction.request()
      .input("costId", sql.Int, costId).input("projectId", sql.Int, input.projectId)
      .input("billId", sql.NChar(10), input.billId).input("lineId", sql.Int, input.estimateLineItemId)
      .input("description", sql.NVarChar(300), input.description).input("costDate", sql.Date, new Date(`${input.costDate}T00:00:00Z`))
      .input("quantity", sql.Decimal(19, 4), input.quantity).input("unitName", sql.NVarChar(30), input.unitName)
      .input("unitCost", sql.Decimal(19, 4), input.unitCost).input("freight", sql.Decimal(19, 2), input.freightAmount)
      .input("tax", sql.Decimal(19, 2), input.taxAmount).input("amount", sql.Decimal(19, 2), amount);
    const result = await request.query<{ costId: number }>(costId === null ? `
      INSERT INTO dbo.ProjectBillCosts (ProjectID, BillID, EstimateLineItemID, Description, CostDate, Quantity, UnitName, UnitCost, FreightAmount, TaxAmount, Amount)
      OUTPUT inserted.ProjectBillCostID AS costId
      VALUES (@projectId, @billId, @lineId, @description, @costDate, @quantity, @unitName, @unitCost, @freight, @tax, @amount)
    ` : `
      UPDATE dbo.ProjectBillCosts SET BillID = @billId, EstimateLineItemID = @lineId, Description = @description,
        CostDate = @costDate, Quantity = @quantity, UnitName = @unitName, UnitCost = @unitCost,
        FreightAmount = @freight, TaxAmount = @tax, Amount = @amount, UpdatedAt = SYSUTCDATETIME()
      OUTPUT inserted.ProjectBillCostID AS costId
      WHERE ProjectBillCostID = @costId AND ProjectID = @projectId AND IsActive = 1
    `);
    await transaction.commit();
    return result.recordset[0].costId;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function removeProjectBillCost(projectId: number, costId: number): Promise<void> {
  const pool = await getPool();
  const result = await pool.request().input("projectId", sql.Int, projectId).input("costId", sql.Int, costId).query(`
    UPDATE dbo.ProjectBillCosts SET IsActive = 0, UpdatedAt = SYSUTCDATETIME()
    WHERE ProjectID = @projectId AND ProjectBillCostID = @costId AND IsActive = 1
  `);
  if (result.rowsAffected[0] !== 1) throw new ProjectCostError("The cost row no longer exists in this project");
}
