import { NextRequest, NextResponse } from "next/server";
import { currencyValue } from "@/app/lib/decimal-input";
import { addMaterialPrice, getMaterialPriceHistory } from "@/app/lib/materials";
import { ProjectAccessError } from "@/app/lib/project-access-error";
import { isoDateString, ValidationError } from "@/app/lib/validation";
import { authorizeSalesApi } from "../../../authorization";

export async function GET(request: NextRequest, { params }: { params: Promise<{ materialId: string }> }) {
  const auth = await authorizeSalesApi(request, "sales.read");
  if (auth instanceof NextResponse) return auth;

  const materialId = Number((await params).materialId);
  if (!Number.isInteger(materialId) || materialId < 1) {
    return NextResponse.json({ error: "Invalid material ID" }, { status: 400 });
  }
  try {
    return NextResponse.json({ entries: await getMaterialPriceHistory(auth.organizationId, materialId) });
  } catch {
    return NextResponse.json({ error: "Unable to load price history" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ materialId: string }> }) {
  const auth = await authorizeSalesApi(request, "sales.write");
  if (auth instanceof NextResponse) return auth;

  const materialId = Number((await params).materialId);
  if (!Number.isInteger(materialId) || materialId < 1) {
    return NextResponse.json({ error: "Invalid material ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid price data" }, { status: 400 });
  }

  let unitCost: number;
  for (const key of ["vendorName", "notes"]) {
    if (body[key] != null && typeof body[key] !== "string") return NextResponse.json({ error: `${key} must be text.` }, { status: 400 });
  }
  try {
    unitCost = currencyValue(body.unitCost, "Unit cost");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid unit cost" }, { status: 400 });
  }
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
    quotedDate = isoDateString(body.quotedDate);
  } catch (error) {
    const message = error instanceof ValidationError && error.message === "date"
      ? "Enter a valid quoted date"
      : error instanceof Error ? error.message : "Invalid price data";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    await addMaterialPrice(auth.organizationId, materialId, { unitCost, quotedDate, vendorName: vendorName || null, notes: notes || null });
    return NextResponse.json({ entries: await getMaterialPriceHistory(auth.organizationId, materialId) }, { status: 201 });
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Unable to save price. Check database insert permissions." }, { status: 500 });
  }
}
