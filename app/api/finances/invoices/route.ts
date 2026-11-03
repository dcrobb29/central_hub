import { NextRequest, NextResponse } from "next/server";
import { zipValue } from "@/app/lib/contact-input";
import { addInvoice, getInvoices, type InvoiceInput } from "@/app/lib/invoices";
import { COMPLETED_PROJECT_MESSAGE, isCompletedProjectError } from "@/app/lib/project-status";
import { amountValue, describeValidationError, fieldValue, isoDateValue, optionalIsoDateValue, optionalProjectId, textValue, validateDueDate, ValidationError } from "@/app/lib/validation";
import { optionalCustomerId } from "@/app/lib/customer-fields";
import { NotesValidationError, parseNotes } from "@/app/lib/document-notes";
import { ProjectAccessError, requireProjectSession } from "@/app/lib/project-access";

// Shared by POST (create) and the [id] route's PUT (update) so both stay in lockstep.
export function parseInvoiceInput(body: unknown): InvoiceInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("invalid");
  }
  const input = body as Record<string, unknown>;
  const rawInvoiceNo = fieldValue("Invoice number (up to 10 characters)", () => textValue(input.invoiceNo, 10));
  const invoiceDate = fieldValue("Invoice date", () => isoDateValue(input.invoiceDate));
  const invoiceDueDate = fieldValue("Due date", () => isoDateValue(input.invoiceDueDate));
  validateDueDate(invoiceDate, invoiceDueDate);
  const text = (key: string, label: string, max: number) =>
    fieldValue(`${label} (up to ${max} characters)`, () => textValue(input[key], max));
  return {
    internalNotes: "internalNotes" in input ? parseNotes(input.internalNotes, "Internal notes") : undefined,
    customerNotes: "customerNotes" in input ? parseNotes(input.customerNotes, "Customer notes") : undefined,
    customerId: "customerId" in input ? optionalCustomerId(input.customerId) : undefined,
    invoiceNo: rawInvoiceNo ? textValue(rawInvoiceNo, 10, true) : "",
    projectId: optionalProjectId(input.projectId),
    invoiceDate,
    invoiceDueDate,
    invoicePaidDate: fieldValue("Paid date", () => optionalIsoDateValue(input.invoicePaidDate)),
    invoiceAmount: fieldValue("Invoice amount", () => amountValue(input.invoiceAmount, { maxLength: 32 })),
    firstName: text("firstName", "First name", 100),
    lastName: text("lastName", "Last name", 100),
    companyName: text("companyName", "Company name", 150),
    billingAddressLine1: text("billingAddressLine1", "Billing address line 1", 200),
    billingAddressLine2: text("billingAddressLine2", "Billing address line 2", 200),
    billingAddressCity: text("billingAddressCity", "Billing city", 100),
    billingAddressState: text("billingAddressState", "Billing state", 100),
    billingAddressZip: fieldValue("Billing ZIP", () => zipValue(input.billingAddressZip)),
    shippingAddressLine1: text("shippingAddressLine1", "Shipping address line 1", 200),
    shippingAddressLine2: text("shippingAddressLine2", "Shipping address line 2", 200),
    shippingAddressCity: text("shippingAddressCity", "Shipping city", 100),
    shippingAddressState: text("shippingAddressState", "Shipping state", 100),
    shippingAddressZip: fieldValue("Shipping ZIP", () => zipValue(input.shippingAddressZip)),
  };
}

export function describeInvoiceSqlError(error: unknown): { message: string; status: number } {
  if (error instanceof ProjectAccessError) return { message: error.message, status: error.status };
  if (typeof error === "object" && error !== null && "number" in error && error.number === 51045) {
    return { message: "Invoice not found", status: 404 };
  }
  if (isCompletedProjectError(error)) return { message: COMPLETED_PROJECT_MESSAGE, status: 409 };
  if (typeof error === "object" && error !== null && "number" in error && error.number === 51041 && "message" in error) {
    return { message: String(error.message), status: 409 };
  }
  if (typeof error === "object" && error !== null && "number" in error && error.number === 51040) {
    return { message: "Choose an active customer. Archived customers cannot be used for new assignments.", status: 409 };
  }
  if (typeof error === "object" && error !== null && "number" in error && error.number === 51044) {
    return { message: "The selected project no longer exists", status: 404 };
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
    const session = await requireProjectSession(request, "finances.read");
    const organizationId = session.organization.organizationId;
    const invoices = await getInvoices({ organizationId });
    return NextResponse.json(invoices);
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
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
    const session = await requireProjectSession(request, "finances.write");
    const organizationId = session.organization.organizationId;
    const id = await addInvoice(invoiceInput, organizationId);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Invoice save failed", error);
    const { message, status } = describeInvoiceSqlError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
