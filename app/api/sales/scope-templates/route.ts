import { NextRequest, NextResponse } from "next/server";
import {
  createScopeTemplate,
  getScopeTemplates,
  type ScopeTemplateComponentInput,
  type ScopeTemplateInput,
} from "@/app/lib/scope-templates";
import { nonNegativeNumberValue, textValue, ValidationError } from "@/app/lib/validation";
import type { LineType } from "@/app/lib/estimates";

const LINE_TYPES: LineType[] = ["Material", "Labor", "Equipment"];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseScopeTemplate(body: Record<string, unknown>): ScopeTemplateInput {
  const templateName = textValue(body.templateName, 150, true);
  const unitName = textValue(body.unitName, 30, true);

  const rawComponents = Array.isArray(body.components) ? body.components : [];
  if (rawComponents.length === 0) throw new ValidationError("A scope template needs at least one component");

  const components: ScopeTemplateComponentInput[] = rawComponents.map((rawComponent) => {
    if (!isRecord(rawComponent)) throw new ValidationError("Invalid component data");
    const description = textValue(rawComponent.description, 300, true);
    const lineType = rawComponent.lineType;
    if (typeof lineType !== "string" || !LINE_TYPES.includes(lineType as LineType)) {
      throw new ValidationError("Each component needs a valid type (Material, Labor, or Equipment)");
    }
    const quantityPerUnit = nonNegativeNumberValue(rawComponent.quantityPerUnit, "Quantity per unit");
    const unitCost = nonNegativeNumberValue(rawComponent.unitCost, "Unit cost");
    const componentUnitName = textValue(rawComponent.unitName, 30, false);
    const materialId = rawComponent.materialId == null || rawComponent.materialId === ""
      ? null
      : Number(rawComponent.materialId);
    if (materialId != null && (!Number.isInteger(materialId) || materialId < 1)) {
      throw new ValidationError("Invalid material reference");
    }

    return {
      description,
      lineType: lineType as LineType,
      quantityPerUnit,
      unitName: componentUnitName,
      unitCost,
      materialId,
    };
  });

  return { templateName, unitName, components };
}

export async function GET() {
  try {
    return NextResponse.json({ scopeTemplates: await getScopeTemplates() });
  } catch {
    return NextResponse.json({ error: "Unable to load scope templates" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) return NextResponse.json({ error: "Invalid scope template data" }, { status: 400 });

  let input: ScopeTemplateInput;
  try {
    input = parseScopeTemplate(body);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid scope template data" }, { status: 400 });
  }

  try {
    const scopeTemplateId = await createScopeTemplate(input);
    return NextResponse.json({ scopeTemplateId }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unable to save scope template. Check database insert permissions." }, { status: 500 });
  }
}
