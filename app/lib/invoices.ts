import { getPool, sql } from "@/app/lib/db";
import type { ProjectOption } from "@/app/lib/projects";
import { parseNotes } from "@/app/lib/document-notes";

export type Invoice = {
  id: number;
  customerId: number | null;
  billingManaged: boolean;
  internalNotes: string | null;
  customerNotes: string | null;
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

export type InvoiceProjectOption = ProjectOption & { customerId: number | null };

export async function getInvoices(invoiceId?: number): Promise<Invoice[]> {
  const pool = await getPool();
  const result = await pool.request().input("invoiceId", sql.Int, invoiceId ?? null).query<Invoice>(`
    SELECT
      [id],
      i.CustomerID AS customerId,
      i.InternalNotes AS internalNotes,
      i.CustomerNotes AS customerNotes,
      CONVERT(bit, CASE WHEN EXISTS (SELECT 1 FROM dbo.ProjectIssuedInvoices h WHERE h.InvoiceID=i.id) THEN 1 ELSE 0 END) AS billingManaged,
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
    WHERE @invoiceId IS NULL OR i.id = @invoiceId
    ORDER BY i.[Invoice Date] DESC
  `);
  return result.recordset;
}

export async function getInvoiceProjectOptions(): Promise<InvoiceProjectOption[]> {
  const pool = await getPool();
  const result = await pool.request().query<InvoiceProjectOption>(`
    SELECT ProjectID AS projectId, ProjectName AS projectName, ProjectStatus AS projectStatus, CustomerID AS customerId
    FROM dbo.Projects
    ORDER BY ProjectName, ProjectID
  `);
  return result.recordset;
}

export async function addInvoice(input: {
  internalNotes?: string | null;
  customerNotes?: string | null;
  customerId?: number | null;
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
    .input("internalNotes", sql.NVarChar(4000), parseNotes(input.internalNotes, "Internal notes"))
    .input("customerNotes", sql.NVarChar(4000), parseNotes(input.customerNotes, "Customer notes"))
    .input("customerId", sql.Int, input.customerId ?? null)
    .input("invoiceNo", sql.NChar(10), input.invoiceNo)
    .input("projectId", sql.Int, input.projectId)
    .input("invoiceDate", sql.Date, input.invoiceDate)
    .input("invoiceDueDate", sql.Date, input.invoiceDueDate)
    .input("invoicePaidDate", sql.Date, input.invoicePaidDate)
    .input("invoiceAmount", sql.NVarChar(32), input.invoiceAmount)
    .input("firstName", sql.NVarChar(100), input.firstName)
    .input("lastName", sql.NVarChar(100), input.lastName)
    .input("companyName", sql.NVarChar(150), input.companyName)
    .input("billingAddressLine1", sql.NVarChar(200), input.billingAddressLine1)
    .input("billingAddressLine2", sql.NVarChar(200), input.billingAddressLine2)
    .input("billingAddressCity", sql.NVarChar(100), input.billingAddressCity)
    .input("billingAddressState", sql.NVarChar(100), input.billingAddressState)
    .input("billingAddressZip", sql.NVarChar(20), input.billingAddressZip)
    .input("shippingAddressLine1", sql.NVarChar(200), input.shippingAddressLine1)
    .input("shippingAddressLine2", sql.NVarChar(200), input.shippingAddressLine2)
    .input("shippingAddressCity", sql.NVarChar(100), input.shippingAddressCity)
    .input("shippingAddressState", sql.NVarChar(100), input.shippingAddressState)
    .input("shippingAddressZip", sql.NVarChar(20), input.shippingAddressZip)
    .query<{ id: number }>(`
      IF @customerId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Customers WHERE CustomerID = @customerId AND IsActive = 1)
        THROW 51040, 'Choose an active customer. Archived customers cannot be used for new assignments.', 1;
      INSERT INTO dbo.Invoices (
        CustomerID, InternalNotes, CustomerNotes, [Invoice No], [ProjectID], [Invoice Date], [Invoice Due Date], [Invoice Paid Date], [Invoice Amount],
        [First Name], [Last Name], [Company Name],
        [Billing Address Line 1], [Billing Address Line 2], [Billing Address City],
        [Billing Address State], [Billing Address Zip],
        [Shipping Address Line 1], [Shipping Address Line 2], [Shipping Address City],
        [Shipping Address State], [Shipping Address Zip]
      )
      VALUES (
        @customerId, @internalNotes, @customerNotes, @invoiceNo, @projectId, @invoiceDate, @invoiceDueDate, @invoicePaidDate, @invoiceAmount,
        @firstName, @lastName, @companyName,
        @billingAddressLine1, @billingAddressLine2, @billingAddressCity,
        @billingAddressState, @billingAddressZip,
        @shippingAddressLine1, @shippingAddressLine2, @shippingAddressCity,
        @shippingAddressState, @shippingAddressZip
      );
      SELECT CONVERT(int, SCOPE_IDENTITY()) AS id;
    `);
  return result.recordset[0].id;
}

export type InvoiceInput = Parameters<typeof addInvoice>[0];

export async function updateInvoice(id: number, input: InvoiceInput): Promise<void> {
  const pool = await getPool();
  await pool.request()
    .input("id", sql.Int, id)
    .input("internalNotes", sql.NVarChar(4000), parseNotes(input.internalNotes, "Internal notes"))
    .input("customerNotes", sql.NVarChar(4000), parseNotes(input.customerNotes, "Customer notes"))
    .input("internalNotesSpecified", sql.Bit, input.internalNotes !== undefined)
    .input("customerNotesSpecified", sql.Bit, input.customerNotes !== undefined)
    .input("customerId", sql.Int, input.customerId ?? null)
    .input("customerSpecified", sql.Bit, input.customerId !== undefined)
    .input("invoiceNo", sql.NChar(10), input.invoiceNo)
    .input("projectId", sql.Int, input.projectId)
    .input("invoiceDate", sql.Date, input.invoiceDate)
    .input("invoiceDueDate", sql.Date, input.invoiceDueDate)
    .input("invoicePaidDate", sql.Date, input.invoicePaidDate)
    .input("invoiceAmount", sql.NVarChar(32), input.invoiceAmount)
    .input("firstName", sql.NVarChar(100), input.firstName)
    .input("lastName", sql.NVarChar(100), input.lastName)
    .input("companyName", sql.NVarChar(150), input.companyName)
    .input("billingAddressLine1", sql.NVarChar(200), input.billingAddressLine1)
    .input("billingAddressLine2", sql.NVarChar(200), input.billingAddressLine2)
    .input("billingAddressCity", sql.NVarChar(100), input.billingAddressCity)
    .input("billingAddressState", sql.NVarChar(100), input.billingAddressState)
    .input("billingAddressZip", sql.NVarChar(20), input.billingAddressZip)
    .input("shippingAddressLine1", sql.NVarChar(200), input.shippingAddressLine1)
    .input("shippingAddressLine2", sql.NVarChar(200), input.shippingAddressLine2)
    .input("shippingAddressCity", sql.NVarChar(100), input.shippingAddressCity)
    .input("shippingAddressState", sql.NVarChar(100), input.shippingAddressState)
    .input("shippingAddressZip", sql.NVarChar(20), input.shippingAddressZip)
    .query(`
      IF @customerId IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM dbo.Customers WHERE CustomerID = @customerId AND IsActive = 1)
        AND NOT EXISTS (SELECT 1 FROM dbo.Invoices WHERE id = @id AND CustomerID = @customerId)
        THROW 51040, 'Choose an active customer. Archived customers cannot be used for new assignments.', 1;
      UPDATE dbo.Invoices SET
        InternalNotes = CASE WHEN @internalNotesSpecified=1 THEN @internalNotes ELSE InternalNotes END,
        CustomerNotes = CASE WHEN @customerNotesSpecified=1 THEN @customerNotes ELSE CustomerNotes END,
        CustomerID = CASE WHEN @customerSpecified = 1 THEN @customerId ELSE CustomerID END,
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
    .query(`
      IF EXISTS (SELECT 1 FROM dbo.ProjectIssuedInvoices WHERE InvoiceID=@id)
        THROW 51041, 'Issued project invoices cannot be deleted. Their allocations are part of billing history.', 1;
      DELETE FROM dbo.Invoices WHERE [id] = @id;
    `);
}
