import { NextRequest, NextResponse } from "next/server";
import { createMaterial, getMaterialsWithLatestPrice } from "@/app/lib/materials";
import { isoDateString, nonNegativeNumberValue, ValidationError } from "@/app/lib/validation";

export async function GET() {
  try {
    return NextResponse.json({ materials: await getMaterialsWithLatestPrice() });
  } catch {
    return NextResponse.json({ error: "Unable to load material catalog" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid material data" }, { status: 400 });
  }

  const materialName = typeof body.materialName === "string" ? body.materialName.trim() : "";
  const unitName = typeof body.unitName === "string" ? body.unitName.trim() : "";
  const vendorName = typeof body.vendorName === "string" ? body.vendorName.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";

  if (!materialName) return NextResponse.json({ error: "Enter a material name" }, { status: 400 });
  if (materialName.length > 200 || unitName.length > 30 || vendorName.length > 150 || notes.length > 300) {
    return NextResponse.json({ error: "A field exceeds its length limit" }, { status: 400 });
  }

  let unitCost: number;
  let quotedDate: string;
  try {
    unitCost = nonNegativeNumberValue(body.unitCost, "Unit cost");
    quotedDate = isoDateString(body.quotedDate);
  } catch (error) {
    const message = error instanceof ValidationError && error.message === "date"
      ? "Enter a valid quoted date"
      : error instanceof Error ? error.message : "Invalid material data";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const materialId = await createMaterial({
      materialName,
      unitName: unitName || null,
      unitCost,
      quotedDate,
      vendorName: vendorName || null,
      notes: notes || null,
    });
    return NextResponse.json({ materialId }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unable to save material. Check database insert permissions." }, { status: 500 });
  }
}
