import { getPool } from "@/app/lib/db";

export type Invoice = {
  id: number;
  invoiceNo: string;
  invoiceDate: string;
  invoiceDueDate: string;
  invoiceAmount: string;
  firstName: string;
  lastName: string;
  companyName: string;
  billingAddressLine1: string;
  billingAddressLine2: string;
  billingAddressCity: string;
  billingAddressState: string;
  billingAddressZip: string;
  shippingAddressLine1: string;
  shippingAddressLine2: string;
  shippingAddressCity: string;
  shippingAddressState: string;
  shippingAddressZip: string;
};

export async function getInvoices(): Promise<Invoice[]> {
  const pool = await getPool();
  const result = await pool.request().query<Invoice>(`
    SELECT
      [id],
      [Invoice No]              AS invoiceNo,
      [Invoice Date]            AS invoiceDate,
      [Invoice Due Date]        AS invoiceDueDate,
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
    FROM [dbo].[Invoices]
    ORDER BY [Invoice Date] DESC
  `);
  return result.recordset;
}
