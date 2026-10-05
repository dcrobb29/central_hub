import { NextRequest, NextResponse } from "next/server";
import { parseProjectCost, ProjectCostError } from "@/app/lib/project-cost-pricing";
import { removeProjectBillCost, saveProjectBillCost } from "@/app/lib/project-costs";

function positiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647;
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  try {
    if (typeof body !== "object" || body === null || !("action" in body)) throw new ProjectCostError("Invalid cost request");
    if (body.action === "remove") {
      if (!("projectId" in body) || !positiveId(body.projectId) || !("costId" in body) || !positiveId(body.costId)) {
        throw new ProjectCostError("Choose a valid project and cost row");
      }
      await removeProjectBillCost(body.projectId, body.costId);
      return NextResponse.json({ success: true });
    }
    if (body.action !== "save") throw new ProjectCostError("Choose a valid cost action");
    const input = parseProjectCost(body);
    const costId = "costId" in body ? body.costId : null;
    if (costId !== null && !positiveId(costId)) throw new ProjectCostError("Choose a valid cost row");
    return NextResponse.json({ costId: await saveProjectBillCost(input, costId) }, { status: costId === null ? 201 : 200 });
  } catch (error) {
    if (error instanceof ProjectCostError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Project cost request failed", error);
    return NextResponse.json({ error: "Unable to save project costs. Check the database connection and permissions." }, { status: 500 });
  }
}
