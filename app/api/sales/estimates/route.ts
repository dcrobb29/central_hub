import { NextRequest, NextResponse } from "next/server";
import {
  createEstimate,
  getEstimateDetails,
  getEstimates,
  setEstimatePrintOptions,
  winEstimate,
  type CreateEstimateInput,
  type EngagementType,
  type LineType,
  type RecurrenceFrequency,
} from "@/app/lib/estimates";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown, label: string, minimum: number, maximum = 1_000_000_000_000) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}`);
  }
  return number;
}

function decimalPlaces(value: number, places: number) {
  return Math.abs(value - Number(value.toFixed(places))) < 0.0000001;
}

export function parseEstimate(body: Record<string, unknown>): CreateEstimateInput {
  const estimateName = typeof body.estimateName === "string" ? body.estimateName.trim() : "";
  const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
  if (!estimateName) throw new Error("Enter an estimate name");
  if (estimateName.length > 150 || customerName.length > 150) throw new Error("Name fields must be 150 characters or fewer");
  if (body.markupMode !== "perLine" && body.markupMode !== "estimate") {
    throw new Error("Choose line-level or estimate-level markup");
  }
  if (body.groupingMode !== "None" && body.groupingMode !== "Scope" && body.groupingMode !== "Type") {
    throw new Error("Choose a valid grouping mode");
  }
  if (!Array.isArray(body.lines) || body.lines.length === 0 || body.lines.length > 100) {
    throw new Error("Add between 1 and 100 estimate lines");
  }

  if (!Array.isArray(body.scopes) || body.scopes.some((scope) => typeof scope !== "string")) {
    throw new Error("Scopes of work must be a list of names");
  }
  const scopes = (body.scopes as string[]).map((scope) => scope.trim()).filter((scope) => scope.length > 0);
  if (scopes.length > 50 || scopes.some((scope) => scope.length > 150)) {
    throw new Error("Scope names must be 150 characters or fewer, up to 50 scopes");
  }
  if (new Set(scopes).size !== scopes.length) {
    throw new Error("Scope names must be unique");
  }
  if (body.groupingMode === "Scope" && scopes.length === 0) {
    throw new Error("Add at least one scope of work when grouping by scope");
  }

  const estimateMarkupPercent = numberValue(body.estimateMarkupPercent ?? 0, "Estimate markup", 0, 1000);
  const taxPercent = numberValue(body.taxPercent ?? 0, "Tax percent", 0, 100);
  const roundingIncrement = numberValue(body.roundingIncrement ?? 0, "Rounding option", 0, 100);
  if (![0, 1, 10, 100].includes(roundingIncrement)) throw new Error("Choose no rounding, nearest dollar, $10, or $100");
  if (![estimateMarkupPercent, taxPercent].every((value) => decimalPlaces(value, 2))) {
    throw new Error("Markup and tax percentages support up to two decimal places");
  }

  const lines = body.lines.map((rawLine, index) => {
    if (!isRecord(rawLine)) throw new Error(`Line ${index + 1} is invalid`);
    const description = typeof rawLine.description === "string" ? rawLine.description.trim() : "";
    const unitName = typeof rawLine.unitName === "string" ? rawLine.unitName.trim() : "";
    if (!description) throw new Error(`Enter a description for line ${index + 1}`);
    if (description.length > 300 || unitName.length > 30) throw new Error(`Line ${index + 1} exceeds a field length limit`);
    const quantity = numberValue(rawLine.quantity, `Line ${index + 1} quantity`, 0.0001);
    const unitCost = numberValue(rawLine.unitCost, `Line ${index + 1} unit cost`, 0);
    const freightAmount = numberValue(rawLine.freightAmount ?? 0, `Line ${index + 1} freight`, 0, 1_000_000_000);
    const lineMarkupPercent = numberValue(rawLine.lineMarkupPercent ?? 0, `Line ${index + 1} markup`, 0, 1000);
    if (![quantity, unitCost, freightAmount, lineMarkupPercent].every((value) => decimalPlaces(value, 4))) {
      throw new Error(`Line ${index + 1} supports up to four decimal places for quantity, cost, freight, and markup`);
    }
    const materialId = rawLine.materialId == null ? null : numberValue(rawLine.materialId, `Line ${index + 1} material`, 1);
    const catalogUnitCostAtEntry = rawLine.catalogUnitCostAtEntry == null
      ? null
      : numberValue(rawLine.catalogUnitCostAtEntry, `Line ${index + 1} catalog cost`, 0);
    const catalogPriceDate = typeof rawLine.catalogPriceDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawLine.catalogPriceDate)
      ? rawLine.catalogPriceDate
      : null;
    const rawLineType = rawLine.lineType;
    const lineType: LineType =
      rawLineType === "Material" || rawLineType === "Labor" || rawLineType === "Equipment"
        ? rawLineType
        : (() => { throw new Error(`Choose a valid line type (Material, Labor, or Equipment) for line ${index + 1}`); })();
    const scopeName = typeof rawLine.scopeName === "string" && rawLine.scopeName.trim() ? rawLine.scopeName.trim() : null;
    if (scopeName !== null && !scopes.includes(scopeName)) {
      throw new Error(`Line ${index + 1} is assigned to a scope that was not defined`);
    }
    return {
      description, unitName: unitName || null, quantity, unitCost, freightAmount, lineMarkupPercent,
      materialId, catalogUnitCostAtEntry, catalogPriceDate, lineType, scopeName,
    };
  });

  return {
    estimateName,
    customerName: customerName || null,
    markupMode: body.markupMode,
    estimateMarkupPercent,
    taxPercent,
    roundingIncrement,
    groupingMode: body.groupingMode,
    scopes,
    lines,
  };
}

export async function GET(request: NextRequest) {
  const estimateIdText = request.nextUrl.searchParams.get("estimateId");
  if (estimateIdText) {
    const estimateId = Number(estimateIdText);
    if (!Number.isInteger(estimateId) || estimateId < 1) {
      return NextResponse.json({ error: "Invalid estimate ID" }, { status: 400 });
    }
    try {
      const details = await getEstimateDetails(estimateId);
      if (!details) return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
      return NextResponse.json(details);
    } catch {
      return NextResponse.json({ error: "Unable to load estimate details" }, { status: 500 });
    }
  }
  try {
    return NextResponse.json({ estimates: await getEstimates() });
  } catch {
    return NextResponse.json({ error: "Unable to load estimates" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) return NextResponse.json({ error: "Invalid estimate data" }, { status: 400 });
  let estimateInput: CreateEstimateInput;
  try {
    estimateInput = parseEstimate(body);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid estimate data" }, { status: 400 });
  }
  try {
    const estimateId = await createEstimate(estimateInput);
    return NextResponse.json({ estimateId }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unable to save estimate. Check the database connection and permissions." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const estimateId = Number(body?.estimateId);
  if (!Number.isInteger(estimateId) || estimateId < 1) {
    return NextResponse.json({ error: "Invalid estimate ID" }, { status: 400 });
  }

  if (body?.action === "set-print-options") {
    if (
      typeof body.showQuantities !== "boolean" ||
      typeof body.showLineTotals !== "boolean" ||
      typeof body.showSummaryTotal !== "boolean" ||
      typeof body.showScopesOfWork !== "boolean"
    ) {
      return NextResponse.json({ error: "Choose which PDF sections to include" }, { status: 400 });
    }
    const printOptions = {
      showQuantities: body.showQuantities,
      showLineTotals: body.showLineTotals,
      showSummaryTotal: body.showSummaryTotal,
      showScopesOfWork: body.showScopesOfWork,
    };
    try {
      await setEstimatePrintOptions(estimateId, printOptions);
      return NextResponse.json({ estimateId, ...printOptions });
    } catch {
      return NextResponse.json({ error: "Unable to update print preferences" }, { status: 500 });
    }
  }

  if (body?.action === "mark-won") {
    const engagementType: EngagementType = body.engagementType === "Service" ? "Service" : "Project";
    const recurrenceFrequency: RecurrenceFrequency =
      engagementType === "Service" && ["Weekly", "Biweekly", "Monthly"].includes(body.recurrenceFrequency)
        ? body.recurrenceFrequency
        : null;
    try {
      const projectId = await winEstimate(estimateId, engagementType, recurrenceFrequency);
      return NextResponse.json({ estimateId, projectId }, { status: 201 });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      if (reason === "not-found") return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
      if (reason === "not-draft") return NextResponse.json({ error: "Only draft estimates can be marked as won" }, { status: 409 });
      if (reason === "no-revision") return NextResponse.json({ error: "Estimate has no saved revision" }, { status: 400 });
      if (typeof error === "object" && error !== null && "number" in error && [2601, 2627].includes(Number(error.number))) {
        return NextResponse.json({ error: "This accepted estimate already has a project" }, { status: 409 });
      }
      return NextResponse.json({ error: "Unable to convert estimate to project" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Invalid estimate action" }, { status: 400 });
}

