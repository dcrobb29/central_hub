import { NextRequest, NextResponse } from "next/server";
import { getPool, sql } from "@/app/lib/db";

function textValue(value: unknown, maxLength: number, required = false) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text && required) throw new Error("required");
  if (text.length > maxLength) throw new Error("length");
  return text || null;
}

function dateValue(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("date");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("date");
  return date;
}

function optionalDateValue(value: unknown) {
  return value == null || value === "" ? null : dateValue(value);
}

function amountValue(value: unknown) {
  if (value == null || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new Error("amount");
  const normalized = amount.toFixed(2);
  if (normalized.length > 10) throw new Error("amount-length");
  return normalized;
}

function optionalProjectId(value: unknown) {
  if (value == null || value === "") return null;
  const projectId = Number(value);
  if (!Number.isInteger(projectId) || projectId < 1) throw new Error("project");
  return projectId;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid invoice data" }, { status: 400 });
  }

  let invoiceNo: string | null;
  let projectId: number | null;
  let invoiceDate: Date;
  let invoiceDueDate: Date;
  let invoicePaidDate: Date | null;
  let invoiceAmount: string | null;
  let firstName: string | null;
  let lastName: string | null;
  let companyName: string | null;
  let billingAddressLine1: string | null;
  let billingAddressLine2: string | null;
  let billingAddressCity: string | null;
  let billingAddressState: string | null;
  let billingAddressZip: string | null;
  let shippingAddressLine1: string | null;
  let shippingAddressLine2: string | null;
  let shippingAddressCity: string | null;
  let shippingAddressState: string | null;
  let shippingAddressZip: string | null;

  try {
    invoiceNo = textValue(body.invoiceNo, 10, true);
    projectId = optionalProjectId(body.projectId);
    invoiceDate = dateValue(body.invoiceDate);
    invoiceDueDate = dateValue(body.invoiceDueDate);
    invoicePaidDate = optionalDateValue(body.invoicePaidDate);
    invoiceAmount = amountValue(body.invoiceAmount);
    firstName = textValue(body.firstName, 25);
    lastName = textValue(body.lastName, 25);
    companyName = textValue(body.companyName, 10);
    billingAddressLine1 = textValue(body.billingAddressLine1, 50);
    billingAddressLine2 = textValue(body.billingAddressLine2, 50);
    billingAddressCity = textValue(body.billingAddressCity, 50);
    billingAddressState = textValue(body.billingAddressState, 50);
    billingAddressZip = textValue(body.billingAddressZip, 10);
    shippingAddressLine1 = textValue(body.shippingAddressLine1, 50);
    shippingAddressLine2 = textValue(body.shippingAddressLine2, 50);
    shippingAddressCity = textValue(body.shippingAddressCity, 50);
    shippingAddressState = textValue(body.shippingAddressState, 50);
    shippingAddressZip = textValue(body.shippingAddressZip, 10);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    const message = reason === "length"
      ? "A text value is longer than its SQL column allows"
      : reason === "amount-length"
        ? "Amount must fit the 10-character amount column"
        : "Check required fields, dates, and amount";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input("invoiceNo", sql.NChar(10), invoiceNo)
      .input("projectId", sql.Int, projectId)
      .input("invoiceDate", sql.Date, invoiceDate)
      .input("invoiceDueDate", sql.Date, invoiceDueDate)
      .input("invoicePaidDate", sql.Date, invoicePaidDate)
      .input("invoiceAmount", sql.NChar(10), invoiceAmount)
      .input("firstName", sql.NChar(25), firstName)
      .input("lastName", sql.NChar(25), lastName)
      .input("companyName", sql.NChar(10), companyName)
      .input("billingAddressLine1", sql.NChar(50), billingAddressLine1)
      .input("billingAddressLine2", sql.NChar(50), billingAddressLine2)
      .input("billingAddressCity", sql.NChar(50), billingAddressCity)
      .input("billingAddressState", sql.NChar(50), billingAddressState)
      .input("billingAddressZip", sql.NChar(10), billingAddressZip)
      .input("shippingAddressLine1", sql.NChar(50), shippingAddressLine1)
      .input("shippingAddressLine2", sql.NChar(50), shippingAddressLine2)
      .input("shippingAddressCity", sql.NChar(50), shippingAddressCity)
      .input("shippingAddressState", sql.NChar(50), shippingAddressState)
      .input("shippingAddressZip", sql.NChar(10), shippingAddressZip)
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
    return NextResponse.json({ id: result.recordset[0]?.id }, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "number" in error && error.number === 547) {
      return NextResponse.json({ error: "The selected project no longer exists" }, { status: 400 });
    }
    if (typeof error === "object" && error !== null && "number" in error && [2601, 2627].includes(Number(error.number))) {
      return NextResponse.json({ error: "An invoice with a duplicate key already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to save invoice. Check database insert permissions." }, { status: 500 });
  }
}
