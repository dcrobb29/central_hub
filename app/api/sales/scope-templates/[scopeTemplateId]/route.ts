import { NextRequest, NextResponse } from "next/server";
import {
  deleteScopeTemplate,
  getScopeTemplateDetails,
  updateScopeTemplate,
} from "@/app/lib/scope-templates";
import { isRecord, parseScopeTemplate } from "../route";

function parseScopeTemplateId(raw: string): number | null {
  const scopeTemplateId = Number(raw);
  return Number.isInteger(scopeTemplateId) && scopeTemplateId >= 1 ? scopeTemplateId : null;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ scopeTemplateId: string }> }) {
  const scopeTemplateId = parseScopeTemplateId((await params).scopeTemplateId);
  if (scopeTemplateId == null) return NextResponse.json({ error: "Invalid scope template ID" }, { status: 400 });

  try {
    const scopeTemplate = await getScopeTemplateDetails(scopeTemplateId);
    if (!scopeTemplate) return NextResponse.json({ error: "Scope template not found" }, { status: 404 });
    return NextResponse.json({ scopeTemplate });
  } catch {
    return NextResponse.json({ error: "Unable to load scope template" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ scopeTemplateId: string }> }) {
  const scopeTemplateId = parseScopeTemplateId((await params).scopeTemplateId);
  if (scopeTemplateId == null) return NextResponse.json({ error: "Invalid scope template ID" }, { status: 400 });

  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) return NextResponse.json({ error: "Invalid scope template data" }, { status: 400 });

  let input;
  try {
    input = parseScopeTemplate(body);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid scope template data" }, { status: 400 });
  }

  try {
    await updateScopeTemplate(scopeTemplateId, input);
    return NextResponse.json({ scopeTemplateId });
  } catch {
    return NextResponse.json({ error: "Unable to save scope template. Check database insert permissions." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ scopeTemplateId: string }> }) {
  const scopeTemplateId = parseScopeTemplateId((await params).scopeTemplateId);
  if (scopeTemplateId == null) return NextResponse.json({ error: "Invalid scope template ID" }, { status: 400 });

  try {
    await deleteScopeTemplate(scopeTemplateId);
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Unable to delete scope template" }, { status: 500 });
  }
}
