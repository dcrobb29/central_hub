import { NextRequest, NextResponse } from "next/server";
import { deleteBill, updateBill } from "@/app/lib/bills";
import { describeValidationError } from "@/app/lib/validation";
import { describeBillSqlError, parseBillInput } from "../route";
import { COMPLETED_PROJECT_MESSAGE, isCompletedProjectError } from "@/app/lib/project-status";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const billId = (await params).id;
  if (!billId) {
    return NextResponse.json({ error: "Invalid bill ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  let billInput;
  try {
    billInput = parseBillInput(body);
  } catch (error) {
    return NextResponse.json({ error: describeValidationError(error) }, { status: 400 });
  }

  try {
    await updateBill(billId, billInput);
    return NextResponse.json({ id: billId });
  } catch (error) {
    const { message, status } = describeBillSqlError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const billId = (await params).id;
  if (!billId) {
    return NextResponse.json({ error: "Invalid bill ID" }, { status: 400 });
  }

  try {
    await deleteBill(billId);
    return NextResponse.json({ id: billId });
  } catch (error) {
    if (isCompletedProjectError(error)) return NextResponse.json({ error: COMPLETED_PROJECT_MESSAGE }, { status: 409 });
    if (typeof error === "object" && error !== null && "number" in error && Number(error.number) === 547) {
      return NextResponse.json({ error: "This bill has cost-allocation history and cannot be deleted. Its records are retained for traceability." }, { status: 409 });
    }
    console.error("Bill deletion failed", error);
    return NextResponse.json({ error: "Unable to delete bill. Check database delete permissions." }, { status: 500 });
  }
}
