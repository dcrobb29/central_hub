import { NextRequest, NextResponse } from "next/server";
import { zipValue } from "@/app/lib/contact-input";
import { addBill, type BillInput } from "@/app/lib/bills";
import { COMPLETED_PROJECT_MESSAGE, isCompletedProjectError } from "@/app/lib/project-status";
import { amountValue, describeValidationError, fieldValue, isoDateValue, optionalIsoDateValue, optionalProjectId, textValue, validateDueDate, ValidationError } from "@/app/lib/validation";
import { ProjectAccessError, requireProjectSession } from "@/app/lib/project-access";

// Shared by POST (create) and the [id] route's PUT (update) so both stay in lockstep.
export function parseBillInput(body: unknown): BillInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("invalid");
  }
  const input = body as Record<string, unknown>;
  const billDate = fieldValue("Bill date", () => isoDateValue(input.billDate));
  const billDueDate = fieldValue("Due date", () => optionalIsoDateValue(input.billDueDate));
  validateDueDate(billDate, billDueDate);
  const text = (key: string, label: string, max: number) =>
    fieldValue(`${label} (up to ${max} characters)`, () => textValue(input[key], max));
  return {
    projectId: optionalProjectId(input.projectId),
    billNo: fieldValue("Bill number (up to 10 characters)", () => textValue(input.billNo, 10, true)),
    billDate,
    billDueDate,
    billPaidDate: fieldValue("Paid date", () => optionalIsoDateValue(input.billPaidDate)),
    billAmount: fieldValue("Bill amount (up to 9,999,999.99; credits may be negative)", () => amountValue(input.billAmount, { required: true })),
    companyName: text("companyName", "Company name", 150),
    billingAddressLine1: text("billingAddressLine1", "Address line 1", 50),
    billingAddressLine2: text("billingAddressLine2", "Address line 2", 50),
    billingAddressCity: text("billingAddressCity", "City", 50),
    billingAddressState: text("billingAddressState", "State", 50),
    billingAddressZip: fieldValue("Billing ZIP", () => zipValue(input.billingAddressZip)),
  };
}

export function describeBillSqlError(error: unknown): { message: string; status: number } {
  if (isCompletedProjectError(error)) return { message: COMPLETED_PROJECT_MESSAGE, status: 409 };
  if (error instanceof Error && error.message.includes("CK_Bills_SplitOwnership")) {
    return { message: "Split bills cannot have a single project assignment. Allocate costs in Projects & Jobs, or disable split mode first.", status: 409 };
  }
  if (typeof error === "object" && error !== null && "number" in error && [51021, 51022].includes(Number(error.number))) {
    return { message: Number(error.number) === 51021
      ? "Remove active cost allocations in Projects & Jobs before changing this bill's project"
      : "The bill total cannot be lower than its allocated costs", status: 409 };
  }
  if (typeof error === "object" && error !== null && "number" in error && error.number === 547) {
    return { message: "The selected project no longer exists", status: 400 };
  }
  if (typeof error === "object" && error !== null && "number" in error && [51043, 51044].includes(Number(error.number))) {
    return { message: "The bill or project no longer exists", status: 404 };
  }
  if (typeof error === "object" && error !== null && "number" in error && [2601, 2627].includes(Number(error.number))) {
    return { message: "A bill with that ID already exists", status: 409 };
  }
  return { message: "Unable to save bill. Check database insert permissions.", status: 500 };
}

export async function POST(request: NextRequest) {
  let organizationId: number;
  try {
    organizationId = (await requireProjectSession(request, "finances.write")).organization.organizationId;
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  const body = await request.json().catch(() => null);

  let id: string;
  let billInput: BillInput;
  try {
    id = textValue((body as Record<string, unknown> | null)?.id, 10, true);
    billInput = parseBillInput(body);
  } catch (error) {
    return NextResponse.json({ error: describeValidationError(error) }, { status: 400 });
  }

  try {
    await addBill({ id, ...billInput, organizationId });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const { message, status } = describeBillSqlError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
