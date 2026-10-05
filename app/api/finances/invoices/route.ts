import { NextRequest, NextResponse } from "next/server";
import { addInvoice, type InvoiceInput } from "@/app/lib/invoices";
import { COMPLETED_PROJECT_MESSAGE, isCompletedProjectError } from "@/app/lib/project-status";
import { amountValue, describeValidationError, isoDateValue, optionalIsoDateValue, optionalProjectId, textValue, ValidationError } from "@/app/lib/validation";

// Shared by POST (create) and the [id] route's PUT (update) so both stay in lockstep.
export function parseInvoiceInput(body: unknown): InvoiceInput {
  if (!body || typeof body !== "object") {
    throw new ValidationError("invalid");
  }
  const input = body as Record<string, unknown>;
  return {
    invoiceNo: textValue(input.invoiceNo, 10, true),
    projectId: optionalProjectId(input.projectId),
    invoiceDate: isoDateValue(input.invoiceDate),
    invoiceDueDate: isoDateValue(input.invoiceDueDate),
    invoicePaidDate: optionalIsoDateValue(input.invoicePaidDate),
    invoiceAmount: amountValue(input.invoiceAmount),
    firstName: textValue(input.firstName, 25),
    lastName: textValue(input.lastName, 25),
    companyName: textValue(input.companyName, 10),
    billingAddressLine1: textValue(input.billingAddressLine1, 50),
    billingAddressLine2: textValue(input.billingAddressLine2, 50),
    billingAddressCity: textValue(input.billingAddressCity, 50),
    billingAddressState: textValue(input.billingAddressState, 50),
    billingAddressZip: textValue(input.billingAddressZip, 10),
    shippingAddressLine1: textValue(input.shippingAddressLine1, 50),
    shippingAddressLine2: textValue(input.shippingAddressLine2, 50),
    shippingAddressCity: textValue(input.shippingAddressCity, 50),
    shippingAddressState: textValue(input.shippingAddressState, 50),
    shippingAddressZip: textValue(input.shippingAddressZip, 10),
  };
}

export function describeInvoiceSqlError(error: unknown): { message: string; status: number } {
  if (isCompletedProjectError(error)) return { message: COMPLETED_PROJECT_MESSAGE, status: 409 };
  if (typeof error === "object" && error !== null && "number" in error && error.number === 547) {
    return { message: "The selected project no longer exists", status: 400 };
  }
  if (typeof error === "object" && error !== null && "number" in error && [2601, 2627].includes(Number(error.number))) {
    return { message: "An invoice with a duplicate key already exists", status: 409 };
  }
  return { message: "Unable to save invoice. Check database insert permissions.", status: 500 };
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  let invoiceInput: InvoiceInput;
  try {
    invoiceInput = parseInvoiceInput(body);
  } catch (error) {
    return NextResponse.json({ error: describeValidationError(error) }, { status: 400 });
  }

  try {
    const id = await addInvoice(invoiceInput);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const { message, status } = describeInvoiceSqlError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
