import { getPool } from "@/app/lib/db";
import type { ProjectOption } from "@/app/lib/projects";

export type Invoice = {
  id: number;
  projectId: number | null;
  projectName: string | null;
  invoiceNo: string;
  invoiceDate: string;
  invoiceDueDate: string;
  invoicePaidDate: string | null;
  invoiceAmount: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingAddressCity: string | null;
  billingAddressState: string | null;
  billingAddressZip: string | null;
  shippingAddressLine1: string | null;
  shippingAddressLine2: string | null;
  shippingAddressCity: string | null;
  shippingAddressState: string | null;
  shippingAddressZip: string | null;
};

export async function getInvoices(): Promise<Invoice[]> {
  const pool = await getPool();
  const result = await pool.request().query<Invoice>(`
    SELECT
      [id],
      i.ProjectID AS projectId,
      p.ProjectName AS projectName,
      [Invoice No]              AS invoiceNo,
      CONVERT(char(10), [Invoice Date], 23) AS invoiceDate,
      CONVERT(char(10), [Invoice Due Date], 23) AS invoiceDueDate,
      CONVERT(char(10), [Invoice Paid Date], 23) AS invoicePaidDate,
      [Invoice Amount]          AS invoiceAmount,
      [First Name]              AS firstName,
      [Last Name]               AS lastName,
      [Company Name]            AS companyName,
      [Billing Address Line 1]  AS billingAddressLine1,
      [Billing Address Line 2]  AS billingAddressLine2,
      [Billing Address City]    AS billingAddressCity,
      [Billing Address State]   AS billingAddressState,
      [Billing Address Zip]     AS billingAddressZip,
      [Shipping Address Line 1] AS shippingAddressLine1,
      [Shipping Address Line 2] AS shippingAddressLine2,
      [Shipping Address City]   AS shippingAddressCity,
      [Shipping Address State]  AS shippingAddressState,
      [Shipping Address Zip]    AS shippingAddressZip
    FROM dbo.Invoices i
    LEFT JOIN dbo.Projects p ON p.ProjectID = i.ProjectID
    ORDER BY i.[Invoice Date] DESC
  `);
  return result.recordset;
}

export async function getInvoiceProjectOptions(): Promise<ProjectOption[]> {
  const pool = await getPool();
  const result = await pool.request().query<ProjectOption>(`
    SELECT ProjectID AS projectId, ProjectName AS projectName
    FROM dbo.Projects
    ORDER BY ProjectName, ProjectID
  `);
  return result.recordset;
}
