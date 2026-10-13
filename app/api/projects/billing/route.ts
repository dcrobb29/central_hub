import { NextRequest, NextResponse } from "next/server";
import { getProjectBilling, issueProjectInvoice, setBillingCompletion } from "@/app/lib/project-billing";
import { BillingError, isBillingMethod, isScopeStatus, type BillingSelection } from "@/app/lib/project-billing-pricing";
import { isoDateValue, textValue, ValidationError } from "@/app/lib/validation";
import { COMPLETED_PROJECT_MESSAGE, isCompletedProjectError } from "@/app/lib/project-status";
import { NotesValidationError, parseNotes } from "@/app/lib/document-notes";

function positiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647;
}
function errorResponse(error: unknown) {
  if (isCompletedProjectError(error)) return NextResponse.json({ error: COMPLETED_PROJECT_MESSAGE }, { status: 409 });
  if (error instanceof BillingError || error instanceof ValidationError || error instanceof NotesValidationError) {
    return NextResponse.json({ error: error instanceof ValidationError ? "Check required invoice fields and dates." : error.message }, { status: 400 });
  }
  if (typeof error === "object" && error !== null && "number" in error && Number(error.number) === 51041 && "message" in error) {
    return NextResponse.json({ error: String(error.message) }, { status: 409 });
  }
  console.error("Project billing request failed", error);
  return NextResponse.json({ error: "Unable to update project billing. Check the connection and project-billing migration." }, { status: 500 });
}
export async function GET(request: NextRequest) {
  const projectId = Number(request.nextUrl.searchParams.get("projectId"));
  if (!positiveId(projectId)) return NextResponse.json({ error: "Choose a valid project" }, { status: 400 });
  try { return NextResponse.json(await getProjectBilling(projectId)); }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  try {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BillingError("Invalid billing request");
    const input = body as Record<string, unknown>;
    if (!positiveId(input.projectId)) throw new BillingError("Choose a valid project");
    if (input.action === "completion") {
      if (!positiveId(input.unitId) || input.scopeId !== null && !positiveId(input.scopeId) || !isScopeStatus(input.status)) {
        throw new BillingError("Choose a valid scope or occurrence and completion status");
      }
      await setBillingCompletion(input.projectId, input.unitId, input.scopeId, input.status);
      return NextResponse.json({ success: true });
    }
    if (input.action !== "invoice" || !isBillingMethod(input.method) || typeof input.showScopes !== "boolean" ||
      typeof input.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.requestId) ||
      input.includeIncompleteWork !== undefined && typeof input.includeIncompleteWork !== "boolean" ||
      input.existingInvoiceId !== null && !positiveId(input.existingInvoiceId) || !Array.isArray(input.selections)) {
      throw new BillingError("Choose a billing method and valid invoice details");
    }
    const selections: BillingSelection[] = input.selections.map((item: unknown) => {
      if (!item || typeof item !== "object" || !("unitId" in item) || !positiveId(item.unitId) ||
        !("scopeId" in item) || item.scopeId !== null && !positiveId(item.scopeId) ||
        !("kind" in item) || !["Full", "Percentage", "Amount"].includes(String(item.kind)) ||
        !("value" in item) || item.value !== null && (typeof item.value !== "number" || !Number.isFinite(item.value))) {
        throw new BillingError("Choose valid invoice selections");
      }
      return { unitId: item.unitId, scopeId: item.scopeId, kind: item.kind as BillingSelection["kind"], value: item.value as number | null };
    });
    const legacy = input.existingInvoiceId !== null;
    const invoiceDate = legacy ? new Date("2000-01-01T00:00:00Z") : isoDateValue(input.invoiceDate);
    const dueDate = legacy ? invoiceDate : isoDateValue(input.dueDate);
    if (dueDate < invoiceDate) throw new BillingError("Due date must not be before the invoice date");
    const invoiceId = await issueProjectInvoice({
      projectId: input.projectId, requestId: input.requestId, method: input.method, showScopes: input.showScopes,
      existingInvoiceId: input.existingInvoiceId, selections, invoiceDate, dueDate,
      invoiceNo: legacy ? "" : textValue(input.invoiceNo, 10, true),
      includeIncompleteWork: input.includeIncompleteWork === true,
      internalNotes: parseNotes(input.internalNotes, "Internal notes"),
      customerNotes: parseNotes(input.customerNotes, "Customer notes"),
    });
    return NextResponse.json({ invoiceId }, { status: legacy ? 200 : 201 });
  } catch (error) { return errorResponse(error); }
}
