import { NextRequest, NextResponse } from "next/server";
import { getPool, sql } from "@/app/lib/db";

function textValue(value: unknown, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error("required");
  if (text.length > maxLength) throw new Error("length");
  return text;
}

function optionalText(value: unknown, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length > maxLength) throw new Error("length");
  return text || null;
}

function requiredDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("date");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("date");
  return date;
}

function optionalDate(value: unknown) {
  return value === "" || value == null ? null : requiredDate(value);
}

function amountValue(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new Error("required");
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
    return NextResponse.json({ error: "Invalid bill data" }, { status: 400 });
  }

  let id: string;
  let projectId: number | null;
  let billNo: string;
  let billDate: Date;
  let billDueDate: Date | null;
  let billPaidDate: Date | null;
  let billAmount: string;
  let companyName: string | null;
  let billingAddressLine1: string | null;
  let billingAddressLine2: string | null;
  let billingAddressCity: string | null;
  let billingAddressState: string | null;
  let billingAddressZip: string | null;

  try {
    id = textValue(body.id, 10);
    projectId = optionalProjectId(body.projectId);
    billNo = textValue(body.billNo, 10);
    billDate = requiredDate(body.billDate);
    billDueDate = optionalDate(body.billDueDate);
    billPaidDate = optionalDate(body.billPaidDate);
    billAmount = amountValue(body.billAmount);
    companyName = optionalText(body.companyName, 10);
    billingAddressLine1 = optionalText(body.billingAddressLine1, 50);
    billingAddressLine2 = optionalText(body.billingAddressLine2, 50);
    billingAddressCity = optionalText(body.billingAddressCity, 50);
    billingAddressState = optionalText(body.billingAddressState, 50);
    billingAddressZip = optionalText(body.billingAddressZip, 10);
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
    await pool.request()
      .input("id", sql.NChar(10), id)
      .input("projectId", sql.Int, projectId)
      .input("billNo", sql.NChar(10), billNo)
      .input("billDate", sql.Date, billDate)
      .input("billDueDate", sql.Date, billDueDate)
      .input("billPaidDate", sql.Date, billPaidDate)
      .input("billAmount", sql.NChar(10), billAmount)
      .input("companyName", sql.NChar(10), companyName)
      .input("billingAddressLine1", sql.NChar(50), billingAddressLine1)
      .input("billingAddressLine2", sql.NChar(50), billingAddressLine2)
      .input("billingAddressCity", sql.NChar(50), billingAddressCity)
      .input("billingAddressState", sql.NChar(50), billingAddressState)
      .input("billingAddressZip", sql.NChar(10), billingAddressZip)
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
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "number" in error && error.number === 547) {
      return NextResponse.json({ error: "The selected project no longer exists" }, { status: 400 });
    }
    if (typeof error === "object" && error !== null && "number" in error && [2601, 2627].includes(Number(error.number))) {
      return NextResponse.json({ error: "A bill with that ID already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to save bill. Check database insert permissions." }, { status: 500 });
  }
}
