import { NextRequest, NextResponse } from "next/server";
import { deleteBill, updateBill } from "@/app/lib/bills";
import { describeValidationError } from "@/app/lib/validation";
import { describeBillSqlError, parseBillInput } from "../route";

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
  } catch {
    return NextResponse.json({ error: "Unable to delete bill. Check database delete permissions." }, { status: 500 });
  }
}
