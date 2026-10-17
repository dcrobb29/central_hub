import { NextRequest, NextResponse } from "next/server";
import { deleteBill, setBillSplitMode, updateBill } from "@/app/lib/bills";
import { ProjectBillAssignmentError } from "@/app/lib/project-cost-pricing";
import { describeValidationError } from "@/app/lib/validation";
import { describeBillSqlError, parseBillInput } from "../route";
import { COMPLETED_PROJECT_MESSAGE, isCompletedProjectError } from "@/app/lib/project-status";
import { BillTenantError } from "@/app/lib/bills";
import { ProjectAccessError, requireProjectSession } from "@/app/lib/project-access";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let organizationId: number;
  try {
    organizationId = (await requireProjectSession(request, "finances.write")).organization.organizationId;
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
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
    await updateBill(billId, billInput, organizationId);
    return NextResponse.json({ id: billId });
  } catch (error) {
    if (error instanceof BillTenantError) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    const { message, status } = describeBillSqlError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let organizationId: number;
  try {
    organizationId = (await requireProjectSession(_request, "finances.write")).organization.organizationId;
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  const billId = (await params).id;
  if (!billId) {
    return NextResponse.json({ error: "Invalid bill ID" }, { status: 400 });
  }

  try {
    await deleteBill(billId, organizationId);
    return NextResponse.json({ id: billId });
  } catch (error) {
    if (error instanceof BillTenantError) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    if (isCompletedProjectError(error)) return NextResponse.json({ error: COMPLETED_PROJECT_MESSAGE }, { status: 409 });
    if (typeof error === "object" && error !== null && "number" in error && Number(error.number) === 547) {
      return NextResponse.json({ error: "This bill has cost-allocation history and cannot be deleted. Its records are retained for traceability." }, { status: 409 });
    }
    console.error("Bill deletion failed", error);
    return NextResponse.json({ error: "Unable to delete bill. Check database delete permissions." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let organizationId: number;
  try {
    organizationId = (await requireProjectSession(request, "finances.write")).organization.organizationId;
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  const id = (await params).id;
  const body: unknown = await request.json().catch(() => null);
  if (!id || id.length > 10 || typeof body !== "object" || body === null || !("isSplit" in body) || typeof body.isSplit !== "boolean") {
    return NextResponse.json({ error: "Choose a valid bill and split mode" }, { status: 400 });
  }
  try {
    await setBillSplitMode(id, body.isSplit, organizationId);
    return NextResponse.json({ id, isSplit: body.isSplit });
  } catch (error) {
    if (error instanceof BillTenantError) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    if (error instanceof ProjectBillAssignmentError) return NextResponse.json({ error: error.message }, { status: 409 });
    const { message, status } = describeBillSqlError(error);
    if (status === 500) console.error("Bill split mode update failed", error);
    return NextResponse.json({ error: message }, { status });
  }
}
