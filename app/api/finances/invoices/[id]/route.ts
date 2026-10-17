import { NextRequest, NextResponse } from "next/server";
import { deleteInvoice, updateInvoice } from "@/app/lib/invoices";
import { describeValidationError } from "@/app/lib/validation";
import { describeInvoiceSqlError, parseInvoiceInput } from "../route";
import { COMPLETED_PROJECT_MESSAGE, isCompletedProjectError } from "@/app/lib/project-status";
import { NotesValidationError } from "@/app/lib/document-notes";
import { ProjectAccessError, requireProjectSession } from "@/app/lib/project-access";

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
    return NextResponse.json({ error: error instanceof NotesValidationError ? error.message : describeValidationError(error) }, { status: 400 });
  }

  try {
    const session = await requireProjectSession(request, "finances.write");
    const organizationId = session.organization.organizationId;
    await updateInvoice(invoiceId, invoiceInput, organizationId);
    return NextResponse.json({ id: invoiceId });
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Invoice update failed", error);
    const { message, status } = describeInvoiceSqlError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const invoiceId = Number((await params).id);
  if (!Number.isInteger(invoiceId) || invoiceId < 1) {
    return NextResponse.json({ error: "Invalid invoice ID" }, { status: 400 });
  }

  try {
    const session = await requireProjectSession(request, "finances.write");
    const organizationId = session.organization.organizationId;
    await deleteInvoice(invoiceId, organizationId);
    return NextResponse.json({ id: invoiceId });
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (isCompletedProjectError(error)) return NextResponse.json({ error: COMPLETED_PROJECT_MESSAGE }, { status: 409 });
    if (typeof error === "object" && error !== null && "number" in error && Number(error.number) === 51041) {
      return NextResponse.json({ error: describeInvoiceSqlError(error).message }, { status: 409 });
    }
    console.error("Invoice deletion failed", error);
    return NextResponse.json({ error: "Unable to delete invoice. Check database delete permissions." }, { status: 500 });
  }
}
