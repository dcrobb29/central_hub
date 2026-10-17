import { getPool, sql } from "@/app/lib/db";
import type { ProjectOption } from "@/app/lib/projects";
import { rollbackIfActive } from "@/app/lib/sql-transactions";
import { ProjectBillAssignmentError } from "@/app/lib/project-cost-pricing";

export type Bill = {
  id: string;
  projectId: number | null;
  projectName: string | null;
  isSplit: boolean;
  billNo: string;
  billDate: string;
  billDueDate: string | null;
  billPaidDate: string | null;
  billAmount: string;
  companyName: string | null;
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingAddressCity: string | null;
  billingAddressState: string | null;
  billingAddressZip: string | null;
};

export class BillTenantError extends Error {}

export async function getBills(filter: { organizationId: number; projectId?: number }): Promise<Bill[]> {
  const pool = await getPool();
  const result = await pool.request()
    .input("projectId", sql.Int, filter.projectId ?? null)
    .input("organizationId", sql.Int, filter.organizationId).query<Bill>(`
    SELECT
      RTRIM([id]) AS id,
      b.ProjectID AS projectId,
      CASE WHEN b.IsSplit = 1 THEN N'Split across jobs' ELSE p.ProjectName END AS projectName,
      b.IsSplit AS isSplit,
      RTRIM([Bill No]) AS billNo,
      CONVERT(char(10), [Bill Date], 23) AS billDate,
      CONVERT(char(10), [Bill Due Date], 23) AS billDueDate,
      CONVERT(char(10), [Bill Paid Date], 23) AS billPaidDate,
      RTRIM([Bill Amount]) AS billAmount,
      NULLIF(RTRIM([Company Name]), '') AS companyName,
      NULLIF(RTRIM([Billing Address Line 1]), '') AS billingAddressLine1,
      NULLIF(RTRIM([Billing Address Line 2]), '') AS billingAddressLine2,
      NULLIF(RTRIM([Billing Address City]), '') AS billingAddressCity,
      NULLIF(RTRIM([Billing Address State]), '') AS billingAddressState,
      NULLIF(RTRIM([Billing Address Zip]), '') AS billingAddressZip
    FROM dbo.Bills b
    LEFT JOIN dbo.Projects p ON p.ProjectID = b.ProjectID AND p.OrganizationID = b.OrganizationID
    WHERE b.OrganizationID = @organizationId
      AND (@projectId IS NULL OR b.ProjectID = @projectId OR (b.IsSplit = 1 AND EXISTS (
        SELECT 1 FROM dbo.ProjectBillCosts c WHERE c.BillID = b.id AND c.ProjectID = @projectId AND c.IsActive = 1 AND c.OrganizationID = @organizationId)))
    ORDER BY b.[Bill Date] DESC, b.[Bill No] DESC
  `);

  return result.recordset;
}

export async function getBillProjectOptions(organizationId: number): Promise<ProjectOption[]> {
  const pool = await getPool();
  const result = await pool.request().input("organizationId", sql.Int, organizationId).query<ProjectOption>(`
    SELECT ProjectID AS projectId, ProjectName AS projectName, ProjectStatus AS projectStatus
    FROM dbo.Projects
    WHERE OrganizationID = @organizationId
    ORDER BY ProjectName, ProjectID
  `);
  return result.recordset;
}

export async function addBill(input: {
  id: string;
  organizationId: number;
  projectId: number | null;
  billNo: string;
  billDate: Date;
  billDueDate: Date | null;
  billPaidDate: Date | null;
  billAmount: string;
  companyName: string | null;
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingAddressCity: string | null;
  billingAddressState: string | null;
  billingAddressZip: string | null;
}): Promise<void> {
  const pool = await getPool();
  await pool.request()
    .input("id", sql.NChar(10), input.id)
    .input("organizationId", sql.Int, input.organizationId)
    .input("projectId", sql.Int, input.projectId)
    .input("billNo", sql.NChar(10), input.billNo)
    .input("billDate", sql.Date, input.billDate)
    .input("billDueDate", sql.Date, input.billDueDate)
    .input("billPaidDate", sql.Date, input.billPaidDate)
    .input("billAmount", sql.NChar(10), input.billAmount)
    .input("companyName", sql.NChar(10), input.companyName)
    .input("billingAddressLine1", sql.NChar(50), input.billingAddressLine1)
    .input("billingAddressLine2", sql.NChar(50), input.billingAddressLine2)
    .input("billingAddressCity", sql.NChar(50), input.billingAddressCity)
    .input("billingAddressState", sql.NChar(50), input.billingAddressState)
    .input("billingAddressZip", sql.NChar(10), input.billingAddressZip)
    .query(`
      IF @projectId IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM dbo.Projects WHERE ProjectID = @projectId AND OrganizationID = @organizationId
      ) THROW 51043, 'The selected project no longer exists', 1;
      INSERT INTO dbo.Bills (
        [id], [ProjectID], [Bill No], [Bill Date], [Bill Due Date], [Bill Paid Date], [Bill Amount],
        [Company Name], [Billing Address Line 1], [Billing Address Line 2],
        [Billing Address City], [Billing Address State], [Billing Address Zip], OrganizationID
      )
      VALUES (
        @id, @projectId, @billNo, @billDate, @billDueDate, @billPaidDate, @billAmount,
        @companyName, @billingAddressLine1, @billingAddressLine2,
        @billingAddressCity, @billingAddressState, @billingAddressZip, @organizationId
      )
    `);
}

export type BillInput = Omit<Parameters<typeof addBill>[0], "id" | "organizationId">;

export async function updateBill(id: string, input: BillInput, organizationId: number): Promise<void> {
  const pool = await getPool();
  const result = await pool.request()
    .input("id", sql.NChar(10), id)
    .input("organizationId", sql.Int, organizationId)
    .input("projectId", sql.Int, input.projectId)
    .input("billNo", sql.NChar(10), input.billNo)
    .input("billDate", sql.Date, input.billDate)
    .input("billDueDate", sql.Date, input.billDueDate)
    .input("billPaidDate", sql.Date, input.billPaidDate)
    .input("billAmount", sql.NChar(10), input.billAmount)
    .input("companyName", sql.NChar(10), input.companyName)
    .input("billingAddressLine1", sql.NChar(50), input.billingAddressLine1)
    .input("billingAddressLine2", sql.NChar(50), input.billingAddressLine2)
    .input("billingAddressCity", sql.NChar(50), input.billingAddressCity)
    .input("billingAddressState", sql.NChar(50), input.billingAddressState)
    .input("billingAddressZip", sql.NChar(10), input.billingAddressZip)
    .query(`
      IF @projectId IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM dbo.Projects WHERE ProjectID = @projectId AND OrganizationID = @organizationId
      ) THROW 51043, 'The selected project no longer exists', 1;
      UPDATE dbo.Bills SET
        [ProjectID] = @projectId,
        [Bill No] = @billNo,
        [Bill Date] = @billDate,
        [Bill Due Date] = @billDueDate,
        [Bill Paid Date] = @billPaidDate,
        [Bill Amount] = @billAmount,
        [Company Name] = @companyName,
        [Billing Address Line 1] = @billingAddressLine1,
        [Billing Address Line 2] = @billingAddressLine2,
        [Billing Address City] = @billingAddressCity,
        [Billing Address State] = @billingAddressState,
        [Billing Address Zip] = @billingAddressZip
      OUTPUT inserted.[id]
      WHERE [id] = @id AND OrganizationID = @organizationId;
    `);
  if (!result.recordset[0]) throw new BillTenantError("The bill no longer exists");
}

export async function deleteBill(id: string, organizationId: number): Promise<void> {
  const pool = await getPool();
  const result = await pool.request()
    .input("id", sql.NChar(10), id)
    .input("organizationId", sql.Int, organizationId)
    .query(`DELETE FROM dbo.Bills OUTPUT deleted.[id] WHERE [id] = @id AND OrganizationID = @organizationId`);
  if (!result.recordset[0]) throw new BillTenantError("The bill no longer exists");
}

export async function setBillSplitMode(id: string, isSplit: boolean, organizationId: number): Promise<void> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const bill = await transaction.request().input("id", sql.NChar(10), id).input("organizationId", sql.Int, organizationId)
      .query<{ ProjectID: number | null }>("SELECT ProjectID FROM dbo.Bills WITH (UPDLOCK, HOLDLOCK) WHERE id = @id AND OrganizationID = @organizationId");
    if (!bill.recordset[0]) throw new BillTenantError("The bill no longer exists");
    const allocations = await transaction.request().input("id", sql.NChar(10), id).input("organizationId", sql.Int, organizationId)
      .query<{ ProjectID: number }>("SELECT DISTINCT ProjectID FROM dbo.ProjectBillCosts WITH (UPDLOCK, HOLDLOCK) WHERE BillID = @id AND IsActive = 1 AND OrganizationID = @organizationId");
    if (!isSplit && allocations.recordset.length > 1) {
      throw new ProjectBillAssignmentError("This bill has allocations in multiple jobs. Remove or reallocate them to one job before disabling split mode.");
    }
    await transaction.request().input("id", sql.NChar(10), id).input("isSplit", sql.Bit, isSplit)
      .input("organizationId", sql.Int, organizationId)
      .input("projectId", sql.Int, isSplit ? null : allocations.recordset[0]?.ProjectID ?? bill.recordset[0].ProjectID)
      .query("UPDATE dbo.Bills SET IsSplit = @isSplit, ProjectID = @projectId WHERE id = @id AND OrganizationID = @organizationId");
    await transaction.commit();
  } catch (error) {
    await rollbackIfActive(transaction);
    throw error;
  }
}
