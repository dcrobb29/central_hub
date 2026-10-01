import { getPool } from "@/app/lib/db";
import type { ProjectOption } from "@/app/lib/projects";

export type Bill = {
  id: string;
  projectId: number | null;
  projectName: string | null;
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
      p.ProjectName AS projectName,
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
    SELECT ProjectID AS projectId, ProjectName AS projectName
    FROM dbo.Projects
    ORDER BY ProjectName, ProjectID
  `);
  return result.recordset;
}
