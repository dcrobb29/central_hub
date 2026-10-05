import { NextRequest, NextResponse } from "next/server";
import { addBill, type BillInput } from "@/app/lib/bills";
import { COMPLETED_PROJECT_MESSAGE, isCompletedProjectError } from "@/app/lib/project-status";
import { amountValue, describeValidationError, isoDateValue, optionalIsoDateValue, optionalProjectId, textValue, ValidationError } from "@/app/lib/validation";

// Shared by POST (create) and the [id] route's PUT (update) so both stay in lockstep.
export function parseBillInput(body: unknown): BillInput {
  if (!body || typeof body !== "object") {
    throw new ValidationError("invalid");
  }
  const input = body as Record<string, unknown>;
  return {
    projectId: optionalProjectId(input.projectId),
    billNo: textValue(input.billNo, 10, true),
    billDate: isoDateValue(input.billDate),
    billDueDate: optionalIsoDateValue(input.billDueDate),
    billPaidDate: optionalIsoDateValue(input.billPaidDate),
    billAmount: amountValue(input.billAmount, { required: true }),
    companyName: textValue(input.companyName, 10),
    billingAddressLine1: textValue(input.billingAddressLine1, 50),
    billingAddressLine2: textValue(input.billingAddressLine2, 50),
    billingAddressCity: textValue(input.billingAddressCity, 50),
    billingAddressState: textValue(input.billingAddressState, 50),
    billingAddressZip: textValue(input.billingAddressZip, 10),
  };
}

export function describeBillSqlError(error: unknown): { message: string; status: number } {
  if (isCompletedProjectError(error)) return { message: COMPLETED_PROJECT_MESSAGE, status: 409 };
  if (typeof error === "object" && error !== null && "number" in error && [51021, 51022].includes(Number(error.number))) {
    return { message: Number(error.number) === 51021
      ? "Remove active cost allocations in Projects & Jobs before changing this bill's project"
      : "The bill total cannot be lower than its allocated costs", status: 409 };
  }
  if (typeof error === "object" && error !== null && "number" in error && error.number === 547) {
    return { message: "The selected project no longer exists", status: 400 };
  }
  if (typeof error === "object" && error !== null && "number" in error && [2601, 2627].includes(Number(error.number))) {
    return { message: "A bill with that ID already exists", status: 409 };
  }
  return { message: "Unable to save bill. Check database insert permissions.", status: 500 };
}

export async function POST(request: NextRequest) {
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
    await addBill({ id, ...billInput });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const { message, status } = describeBillSqlError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
