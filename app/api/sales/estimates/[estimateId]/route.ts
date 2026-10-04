import { NextRequest, NextResponse } from "next/server";
import { InvalidUnitPresetError } from "@/app/lib/unit-presets";
import { deleteEstimate, updateEstimate, type CreateEstimateInput } from "@/app/lib/estimates";
import { isRecord, parseEstimate } from "../route";

function describeEstimateMutationError(error: unknown): { message: string; status: number } {
  const reason = error instanceof Error ? error.message : "";
  if (reason === "not-found") return { message: "Estimate not found", status: 404 };
  if (reason === "not-editable") return { message: "Won estimates can't be edited or deleted", status: 409 };
  return { message: "Unable to save estimate. Check the database connection and permissions.", status: 500 };
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ estimateId: string }> }) {
  const estimateId = Number((await params).estimateId);
  if (!Number.isInteger(estimateId) || estimateId < 1) {
    return NextResponse.json({ error: "Invalid estimate ID" }, { status: 400 });
  }
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) return NextResponse.json({ error: "Invalid estimate data" }, { status: 400 });
  let estimateInput: CreateEstimateInput;
  try {
    estimateInput = parseEstimate(body);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid estimate data" }, { status: 400 });
  }
  try {
    await updateEstimate(estimateId, estimateInput);
    return NextResponse.json({ estimateId });
  } catch (error) {
    if (error instanceof InvalidUnitPresetError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const { message, status } = describeEstimateMutationError(error);
    if (status === 500) console.error("Unable to update estimate", error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ estimateId: string }> }) {
  const estimateId = Number((await params).estimateId);
  if (!Number.isInteger(estimateId) || estimateId < 1) {
    return NextResponse.json({ error: "Invalid estimate ID" }, { status: 400 });
  }
  try {
    await deleteEstimate(estimateId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const { message, status } = describeEstimateMutationError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
