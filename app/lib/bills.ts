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

export async function getBills(): Promise<Bill[]> {
  const pool = await getPool();
  const result = await pool.request().query<Bill>(`
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
    LEFT JOIN dbo.Projects p ON p.ProjectID = b.ProjectID
    ORDER BY b.[Bill Date] DESC, b.[Bill No] DESC
  `);

  return result.recordset;
}

export async function getBillProjectOptions(): Promise<ProjectOption[]> {
  const pool = await getPool();
  const result = await pool.request().query<ProjectOption>(`
    SELECT ProjectID AS projectId, ProjectName AS projectName, ProjectStatus AS projectStatus
    FROM dbo.Projects
    ORDER BY ProjectName, ProjectID
  `);
  return result.recordset;
}

export async function addBill(input: {
  id: string;
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
      INSERT INTO dbo.Bills (
        [id], [ProjectID], [Bill No], [Bill Date], [Bill Due Date], [Bill Paid Date], [Bill Amount],
        [Company Name], [Billing Address Line 1], [Billing Address Line 2],
        [Billing Address City], [Billing Address State], [Billing Address Zip]
      )
      VALUES (
        @id, @projectId, @billNo, @billDate, @billDueDate, @billPaidDate, @billAmount,
        @companyName, @billingAddressLine1, @billingAddressLine2,
        @billingAddressCity, @billingAddressState, @billingAddressZip
      )
    `);
}

export type BillInput = Omit<Parameters<typeof addBill>[0], "id">;

export async function updateBill(id: string, input: BillInput): Promise<void> {
  const pool = await getPool();
  await pool.request()
    .input("id", sql.NChar(10), id)
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
      WHERE [id] = @id
    `);
}

export async function deleteBill(id: string): Promise<void> {
  const pool = await getPool();
  await pool.request()
    .input("id", sql.NChar(10), id)
    .query(`DELETE FROM dbo.Bills WHERE [id] = @id`);
}

export async function setBillSplitMode(id: string, isSplit: boolean): Promise<void> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const bill = await transaction.request().input("id", sql.NChar(10), id)
      .query<{ ProjectID: number | null }>("SELECT ProjectID FROM dbo.Bills WITH (UPDLOCK, HOLDLOCK) WHERE id = @id");
    if (!bill.recordset[0]) throw new ProjectBillAssignmentError("The bill no longer exists");
    const allocations = await transaction.request().input("id", sql.NChar(10), id)
      .query<{ ProjectID: number }>("SELECT DISTINCT ProjectID FROM dbo.ProjectBillCosts WITH (UPDLOCK, HOLDLOCK) WHERE BillID = @id AND IsActive = 1");
    if (!isSplit && allocations.recordset.length > 1) {
      throw new ProjectBillAssignmentError("This bill has allocations in multiple jobs. Remove or reallocate them to one job before disabling split mode.");
    }
    await transaction.request().input("id", sql.NChar(10), id).input("isSplit", sql.Bit, isSplit)
      .input("projectId", sql.Int, isSplit ? null : allocations.recordset[0]?.ProjectID ?? bill.recordset[0].ProjectID)
      .query("UPDATE dbo.Bills SET IsSplit = @isSplit, ProjectID = @projectId WHERE id = @id");
    await transaction.commit();
  } catch (error) {
    await rollbackIfActive(transaction);
    throw error;
  }
}
