import { NextRequest, NextResponse } from "next/server";
import {
  createScopeTemplate,
  getScopeTemplates,
  type ScopeTemplateComponentInput,
  type ScopeTemplateInput,
} from "@/app/lib/scope-templates";
import { describeValidationError, fieldValue, integerValue, textValue, ValidationError } from "@/app/lib/validation";
import { currencyValue, decimalValue, MAX_DECIMAL_6 } from "@/app/lib/decimal-input";
import type { LineType } from "@/app/lib/estimates";
import { ProjectAccessError } from "@/app/lib/project-access-error";
import { authorizeSalesApi } from "../authorization";

const LINE_TYPES: LineType[] = ["Material", "Labor", "Equipment"];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseScopeTemplate(body: Record<string, unknown>): ScopeTemplateInput {
  const templateName = fieldValue("Template name (up to 150 characters)", () => textValue(body.templateName, 150, true));
  const unitName = fieldValue("Template unit (up to 30 characters)", () => textValue(body.unitName, 30, true));

  const rawComponents = Array.isArray(body.components) ? body.components : [];
  if (rawComponents.length === 0) throw new ValidationError("A scope template needs at least one component");

  const components: ScopeTemplateComponentInput[] = rawComponents.map((rawComponent, index) => {
    if (!isRecord(rawComponent)) throw new ValidationError("Invalid component data");
    const description = fieldValue(`Component ${index + 1} description (up to 300 characters)`, () => textValue(rawComponent.description, 300, true));
    const lineType = rawComponent.lineType;
    if (typeof lineType !== "string" || !LINE_TYPES.includes(lineType as LineType)) {
      throw new ValidationError("Each component needs a valid type (Material, Labor, or Equipment)");
    }
    const quantityPerUnit = decimalValue(rawComponent.quantityPerUnit, "Quantity per unit", 6, 0, MAX_DECIMAL_6);
    const unitCost = currencyValue(rawComponent.unitCost, "Unit cost");
    const componentUnitName = textValue(rawComponent.unitName, 30, false);
    const materialId = rawComponent.materialId == null || rawComponent.materialId === ""
      ? null
      : integerValue(rawComponent.materialId, "Material");

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

export async function GET(request: NextRequest) {
  const auth = await authorizeSalesApi(request, "sales.read");
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json({ scopeTemplates: await getScopeTemplates(auth.organizationId) });
  } catch {
    return NextResponse.json({ error: "Unable to load scope templates" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorizeSalesApi(request, "sales.write");
  if (auth instanceof NextResponse) return auth;

  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) return NextResponse.json({ error: "Invalid scope template data" }, { status: 400 });

  let input: ScopeTemplateInput;
  try {
    input = parseScopeTemplate(body);
  } catch (error) {
    return NextResponse.json({ error: error instanceof ValidationError ? describeValidationError(error) : error instanceof Error ? error.message : "Invalid scope template data" }, { status: 400 });
  }

  try {
    const scopeTemplateId = await createScopeTemplate(auth.organizationId, input);
    return NextResponse.json({ scopeTemplateId }, { status: 201 });
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Unable to save scope template. Check database insert permissions." }, { status: 500 });
  }
}
