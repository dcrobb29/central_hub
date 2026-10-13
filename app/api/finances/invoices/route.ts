import { NextRequest, NextResponse } from "next/server";
import { addInvoice, getInvoices, type InvoiceInput } from "@/app/lib/invoices";
import { COMPLETED_PROJECT_MESSAGE, isCompletedProjectError } from "@/app/lib/project-status";
import { amountValue, describeValidationError, isoDateValue, optionalIsoDateValue, optionalProjectId, textValue, ValidationError } from "@/app/lib/validation";
import { optionalCustomerId } from "@/app/lib/customer-fields";
import { NotesValidationError, parseNotes } from "@/app/lib/document-notes";
import { getActiveOrganizationId } from "@/app/lib/auth";

// Shared by POST (create) and the [id] route's PUT (update) so both stay in lockstep.
export function parseInvoiceInput(body: unknown): InvoiceInput {
  if (!body || typeof body !== "object") {
    throw new ValidationError("invalid");
  }
  const input = body as Record<string, unknown>;
  const rawInvoiceNo = typeof input.invoiceNo === "string" ? input.invoiceNo.trim() : "";
  return {
    internalNotes: "internalNotes" in input ? parseNotes(input.internalNotes, "Internal notes") : undefined,
    customerNotes: "customerNotes" in input ? parseNotes(input.customerNotes, "Customer notes") : undefined,
    customerId: "customerId" in input ? optionalCustomerId(input.customerId) : undefined,
    invoiceNo: rawInvoiceNo ? textValue(rawInvoiceNo, 10, true) : "",
    projectId: optionalProjectId(input.projectId),
    invoiceDate: isoDateValue(input.invoiceDate),
    invoiceDueDate: isoDateValue(input.invoiceDueDate),
    invoicePaidDate: optionalIsoDateValue(input.invoicePaidDate),
    invoiceAmount: amountValue(input.invoiceAmount, { maxLength: 32 }),
    firstName: textValue(input.firstName, 100),
    lastName: textValue(input.lastName, 100),
    companyName: textValue(input.companyName, 150),
    billingAddressLine1: textValue(input.billingAddressLine1, 200),
    billingAddressLine2: textValue(input.billingAddressLine2, 200),
    billingAddressCity: textValue(input.billingAddressCity, 100),
    billingAddressState: textValue(input.billingAddressState, 100),
    billingAddressZip: textValue(input.billingAddressZip, 20),
    shippingAddressLine1: textValue(input.shippingAddressLine1, 200),
    shippingAddressLine2: textValue(input.shippingAddressLine2, 200),
    shippingAddressCity: textValue(input.shippingAddressCity, 100),
    shippingAddressState: textValue(input.shippingAddressState, 100),
    shippingAddressZip: textValue(input.shippingAddressZip, 20),
  };
}

export function describeInvoiceSqlError(error: unknown): { message: string; status: number } {
  if (isCompletedProjectError(error)) return { message: COMPLETED_PROJECT_MESSAGE, status: 409 };
  if (typeof error === "object" && error !== null && "number" in error && error.number === 51041 && "message" in error) {
    return { message: String(error.message), status: 409 };
  }
  if (typeof error === "object" && error !== null && "number" in error && error.number === 51040) {
    return { message: "Choose an active customer. Archived customers cannot be used for new assignments.", status: 409 };
  }
  if (typeof error === "object" && error !== null && "number" in error && error.number === 547) {
    return { message: "The selected project or customer no longer exists", status: 400 };
  }
  if (typeof error === "object" && error !== null && "number" in error && [2601, 2627].includes(Number(error.number))) {
    return { message: "An invoice with this invoice number already exists for your organization", status: 409 };
  }
  return { message: "Unable to save invoice. Check database insert permissions.", status: 500 };
}

export async function GET(request: NextRequest) {
  try {
    const organizationId = await getActiveOrganizationId(request);
    const invoices = await getInvoices({ organizationId });
    return NextResponse.json(invoices);
  } catch (error) {
    console.error("Failed to fetch invoices", error);
    return NextResponse.json({ error: "Unable to fetch invoices" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  let invoiceInput: InvoiceInput;
  try {
    invoiceInput = parseInvoiceInput(body);
  } catch (error) {
    return NextResponse.json({ error: error instanceof NotesValidationError ? error.message : describeValidationError(error) }, { status: 400 });
  }

  try {
    const organizationId = await getActiveOrganizationId(request);
    const id = await addInvoice(invoiceInput, organizationId);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error("Invoice save failed", error);
    const { message, status } = describeInvoiceSqlError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
