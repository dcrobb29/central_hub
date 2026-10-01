import { NextRequest, NextResponse } from "next/server";
import { addMaterialPrice, getMaterialPriceHistory } from "@/app/lib/materials";

function dateValue(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Enter a valid quoted date");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Enter a valid quoted date");
  return value;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ materialId: string }> }) {
  const materialId = Number((await params).materialId);
  if (!Number.isInteger(materialId) || materialId < 1) {
    return NextResponse.json({ error: "Invalid material ID" }, { status: 400 });
  }
  try {
    return NextResponse.json({ entries: await getMaterialPriceHistory(materialId) });
  } catch {
    return NextResponse.json({ error: "Unable to load price history" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ materialId: string }> }) {
  const materialId = Number((await params).materialId);
  if (!Number.isInteger(materialId) || materialId < 1) {
    return NextResponse.json({ error: "Invalid material ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid price data" }, { status: 400 });
  }

  const unitCost = Number(body.unitCost);
  const vendorName = typeof body.vendorName === "string" ? body.vendorName.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (!Number.isFinite(unitCost) || unitCost < 0) {
    return NextResponse.json({ error: "Unit cost must be a non-negative number" }, { status: 400 });
  }
  if (vendorName.length > 150 || notes.length > 300) {
    return NextResponse.json({ error: "A field exceeds its length limit" }, { status: 400 });
  }

  let quotedDate: string;
  try {
    quotedDate = dateValue(body.quotedDate);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid price data" }, { status: 400 });
  }

  try {
    await addMaterialPrice(materialId, { unitCost, quotedDate, vendorName: vendorName || null, notes: notes || null });
    return NextResponse.json({ entries: await getMaterialPriceHistory(materialId) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unable to save price. Check database insert permissions." }, { status: 500 });
  }
}
