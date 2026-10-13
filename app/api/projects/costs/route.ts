import { NextRequest, NextResponse } from "next/server";
import { parseProjectCost, ProjectBillAssignmentError, ProjectCostError } from "@/app/lib/project-cost-pricing";
import { removeProjectBillCost, saveProjectBillCost } from "@/app/lib/project-costs";
import { COMPLETED_PROJECT_MESSAGE, isCompletedProjectError } from "@/app/lib/project-status";
import { ProjectAccessError, requireProject, requireProjectSession } from "@/app/lib/project-access";
import { getPool, sql } from "@/app/lib/db";

function positiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647;
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  try {
    if (typeof body !== "object" || body === null || !("action" in body)) throw new ProjectCostError("Invalid cost request");
    const session = await requireProjectSession(request, "finances.write");
    if (!("projectId" in body) || !positiveId(body.projectId)) throw new ProjectCostError("Choose a valid project.");
    await requireProject(body.projectId, session.organization.organizationId);
    if (body.action === "remove") {
      if (!("projectId" in body) || !positiveId(body.projectId) || !("costId" in body) || !positiveId(body.costId)) {
        throw new ProjectCostError("Choose a valid project and cost row");
      }
      await removeProjectBillCost(body.projectId, body.costId);
      return NextResponse.json({ success: true });
    }
    if (body.action !== "save") throw new ProjectCostError("Choose a valid cost action");
    const input = parseProjectCost(body);
    const pool = await getPool();
    const bill = await pool.request().input("id", sql.NChar(10), input.billId)
      .input("org", sql.Int, session.organization.organizationId)
      .query("SELECT 1 AS found FROM dbo.Bills WHERE id = @id AND OrganizationID = @org");
    if (!bill.recordset[0]) throw new ProjectAccessError("Supplier bill not found.", 404);
    const costId = "costId" in body ? body.costId : null;
    if (costId !== null && !positiveId(costId)) throw new ProjectCostError("Choose a valid cost row");
    return NextResponse.json({ costId: await saveProjectBillCost(input, costId) }, { status: costId === null ? 201 : 200 });
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof ProjectBillAssignmentError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (isCompletedProjectError(error) || error instanceof ProjectCostError && error.message === COMPLETED_PROJECT_MESSAGE) {
      return NextResponse.json({ error: COMPLETED_PROJECT_MESSAGE }, { status: 409 });
    }
    if (error instanceof ProjectCostError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Project cost request failed", error);
    return NextResponse.json({ error: "Unable to save project costs. Check the database connection and permissions." }, { status: 500 });
  }
}
