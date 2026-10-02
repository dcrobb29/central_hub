import { getPool, sql } from "@/app/lib/db";
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
      RTRIM([Invoice No])       AS invoiceNo,
      CONVERT(char(10), [Invoice Date], 23) AS invoiceDate,
      CONVERT(char(10), [Invoice Due Date], 23) AS invoiceDueDate,
      CONVERT(char(10), [Invoice Paid Date], 23) AS invoicePaidDate,
      NULLIF(RTRIM([Invoice Amount]), '')          AS invoiceAmount,
      NULLIF(RTRIM([First Name]), '')              AS firstName,
      NULLIF(RTRIM([Last Name]), '')               AS lastName,
      NULLIF(RTRIM([Company Name]), '')            AS companyName,
      NULLIF(RTRIM([Billing Address Line 1]), '')  AS billingAddressLine1,
      NULLIF(RTRIM([Billing Address Line 2]), '')  AS billingAddressLine2,
      NULLIF(RTRIM([Billing Address City]), '')    AS billingAddressCity,
      NULLIF(RTRIM([Billing Address State]), '')   AS billingAddressState,
      NULLIF(RTRIM([Billing Address Zip]), '')     AS billingAddressZip,
      NULLIF(RTRIM([Shipping Address Line 1]), '') AS shippingAddressLine1,
      NULLIF(RTRIM([Shipping Address Line 2]), '') AS shippingAddressLine2,
      NULLIF(RTRIM([Shipping Address City]), '')   AS shippingAddressCity,
      NULLIF(RTRIM([Shipping Address State]), '')  AS shippingAddressState,
      NULLIF(RTRIM([Shipping Address Zip]), '')    AS shippingAddressZip
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

export async function addInvoice(input: {
  invoiceNo: string;
  projectId: number | null;
  invoiceDate: Date;
  invoiceDueDate: Date;
  invoicePaidDate: Date | null;
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
}): Promise<number> {
  const pool = await getPool();
  const result = await pool.request()
    .input("invoiceNo", sql.NChar(10), input.invoiceNo)
    .input("projectId", sql.Int, input.projectId)
    .input("invoiceDate", sql.Date, input.invoiceDate)
    .input("invoiceDueDate", sql.Date, input.invoiceDueDate)
    .input("invoicePaidDate", sql.Date, input.invoicePaidDate)
    .input("invoiceAmount", sql.NChar(10), input.invoiceAmount)
    .input("firstName", sql.NChar(25), input.firstName)
    .input("lastName", sql.NChar(25), input.lastName)
    .input("companyName", sql.NChar(10), input.companyName)
    .input("billingAddressLine1", sql.NChar(50), input.billingAddressLine1)
    .input("billingAddressLine2", sql.NChar(50), input.billingAddressLine2)
    .input("billingAddressCity", sql.NChar(50), input.billingAddressCity)
    .input("billingAddressState", sql.NChar(50), input.billingAddressState)
    .input("billingAddressZip", sql.NChar(10), input.billingAddressZip)
    .input("shippingAddressLine1", sql.NChar(50), input.shippingAddressLine1)
    .input("shippingAddressLine2", sql.NChar(50), input.shippingAddressLine2)
    .input("shippingAddressCity", sql.NChar(50), input.shippingAddressCity)
    .input("shippingAddressState", sql.NChar(50), input.shippingAddressState)
    .input("shippingAddressZip", sql.NChar(10), input.shippingAddressZip)
    .query<{ id: number }>(`
      INSERT INTO dbo.Invoices (
        [Invoice No], [ProjectID], [Invoice Date], [Invoice Due Date], [Invoice Paid Date], [Invoice Amount],
        [First Name], [Last Name], [Company Name],
        [Billing Address Line 1], [Billing Address Line 2], [Billing Address City],
        [Billing Address State], [Billing Address Zip],
        [Shipping Address Line 1], [Shipping Address Line 2], [Shipping Address City],
        [Shipping Address State], [Shipping Address Zip]
      )
      OUTPUT inserted.id AS id
      VALUES (
        @invoiceNo, @projectId, @invoiceDate, @invoiceDueDate, @invoicePaidDate, @invoiceAmount,
        @firstName, @lastName, @companyName,
        @billingAddressLine1, @billingAddressLine2, @billingAddressCity,
        @billingAddressState, @billingAddressZip,
        @shippingAddressLine1, @shippingAddressLine2, @shippingAddressCity,
        @shippingAddressState, @shippingAddressZip
      )
    `);
  return result.recordset[0].id;
}

export type InvoiceInput = Parameters<typeof addInvoice>[0];

export async function updateInvoice(id: number, input: InvoiceInput): Promise<void> {
  const pool = await getPool();
  await pool.request()
    .input("id", sql.Int, id)
    .input("invoiceNo", sql.NChar(10), input.invoiceNo)
    .input("projectId", sql.Int, input.projectId)
    .input("invoiceDate", sql.Date, input.invoiceDate)
    .input("invoiceDueDate", sql.Date, input.invoiceDueDate)
    .input("invoicePaidDate", sql.Date, input.invoicePaidDate)
    .input("invoiceAmount", sql.NChar(10), input.invoiceAmount)
    .input("firstName", sql.NChar(25), input.firstName)
    .input("lastName", sql.NChar(25), input.lastName)
    .input("companyName", sql.NChar(10), input.companyName)
    .input("billingAddressLine1", sql.NChar(50), input.billingAddressLine1)
    .input("billingAddressLine2", sql.NChar(50), input.billingAddressLine2)
    .input("billingAddressCity", sql.NChar(50), input.billingAddressCity)
    .input("billingAddressState", sql.NChar(50), input.billingAddressState)
    .input("billingAddressZip", sql.NChar(10), input.billingAddressZip)
    .input("shippingAddressLine1", sql.NChar(50), input.shippingAddressLine1)
    .input("shippingAddressLine2", sql.NChar(50), input.shippingAddressLine2)
    .input("shippingAddressCity", sql.NChar(50), input.shippingAddressCity)
    .input("shippingAddressState", sql.NChar(50), input.shippingAddressState)
    .input("shippingAddressZip", sql.NChar(10), input.shippingAddressZip)
    .query(`
      UPDATE dbo.Invoices SET
        [Invoice No] = @invoiceNo,
        [ProjectID] = @projectId,
        [Invoice Date] = @invoiceDate,
        [Invoice Due Date] = @invoiceDueDate,
        [Invoice Paid Date] = @invoicePaidDate,
        [Invoice Amount] = @invoiceAmount,
        [First Name] = @firstName,
        [Last Name] = @lastName,
        [Company Name] = @companyName,
        [Billing Address Line 1] = @billingAddressLine1,
        [Billing Address Line 2] = @billingAddressLine2,
        [Billing Address City] = @billingAddressCity,
        [Billing Address State] = @billingAddressState,
        [Billing Address Zip] = @billingAddressZip,
        [Shipping Address Line 1] = @shippingAddressLine1,
        [Shipping Address Line 2] = @shippingAddressLine2,
        [Shipping Address City] = @shippingAddressCity,
        [Shipping Address State] = @shippingAddressState,
        [Shipping Address Zip] = @shippingAddressZip
      WHERE [id] = @id
    `);
}

export async function deleteInvoice(id: number): Promise<void> {
  const pool = await getPool();
  await pool.request()
    .input("id", sql.Int, id)
    .query(`DELETE FROM dbo.Invoices WHERE [id] = @id`);
}
