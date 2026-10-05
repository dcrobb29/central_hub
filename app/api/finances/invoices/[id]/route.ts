import { NextRequest, NextResponse } from "next/server";
import { deleteInvoice, updateInvoice } from "@/app/lib/invoices";
import { describeValidationError } from "@/app/lib/validation";
import { describeInvoiceSqlError, parseInvoiceInput } from "../route";
import { COMPLETED_PROJECT_MESSAGE, isCompletedProjectError } from "@/app/lib/project-status";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const invoiceId = Number((await params).id);
  if (!Number.isInteger(invoiceId) || invoiceId < 1) {
    return NextResponse.json({ error: "Invalid invoice ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  let invoiceInput;
  try {
    invoiceInput = parseInvoiceInput(body);
  } catch (error) {
    return NextResponse.json({ error: describeValidationError(error) }, { status: 400 });
  }

  try {
    await updateInvoice(invoiceId, invoiceInput);
    return NextResponse.json({ id: invoiceId });
  } catch (error) {
    const { message, status } = describeInvoiceSqlError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const invoiceId = Number((await params).id);
  if (!Number.isInteger(invoiceId) || invoiceId < 1) {
    return NextResponse.json({ error: "Invalid invoice ID" }, { status: 400 });
  }

  try {
    await deleteInvoice(invoiceId);
    return NextResponse.json({ id: invoiceId });
  } catch (error) {
    if (isCompletedProjectError(error)) return NextResponse.json({ error: COMPLETED_PROJECT_MESSAGE }, { status: 409 });
    console.error("Invoice deletion failed", error);
    return NextResponse.json({ error: "Unable to delete invoice. Check database delete permissions." }, { status: 500 });
  }
}
