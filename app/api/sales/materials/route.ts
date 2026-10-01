import { NextRequest, NextResponse } from "next/server";
import { createMaterial, getMaterialsWithLatestPrice } from "@/app/lib/materials";

function dateValue(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Enter a valid quoted date");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Enter a valid quoted date");
  return value;
}

function numberValue(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} must be a non-negative number`);
  return number;
}

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
    unitCost = numberValue(body.unitCost, "Unit cost");
    quotedDate = dateValue(body.quotedDate);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid material data" }, { status: 400 });
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
