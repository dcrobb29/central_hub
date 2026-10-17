import { NextRequest, NextResponse } from "next/server";
import { optionalCustomerId } from "@/app/lib/customer-fields";
import { updateProjectCustomer } from "@/app/lib/projects";
import { COMPLETED_PROJECT_MESSAGE, isCompletedProjectError } from "@/app/lib/project-status";
import { ValidationError } from "@/app/lib/validation";
import { ProjectAccessError, requireProjectSession } from "@/app/lib/project-access";

export async function PATCH(request: NextRequest) {
  let organizationId: number;
  try {
    organizationId = (await requireProjectSession(request, "projects.write")).organization.organizationId;
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  const body: unknown = await request.json().catch(() => null);
  try {
    if (!body || typeof body !== "object" || !("projectId" in body) || !("customerId" in body) ||
      typeof body.projectId !== "number" || !Number.isSafeInteger(body.projectId) ||
      body.projectId < 1 || body.projectId > 2_147_483_647) throw new ValidationError("invalid");
    const customerId = optionalCustomerId(body.customerId);
    if (!await updateProjectCustomer(body.projectId, customerId, organizationId)) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json({ projectId: body.projectId, customerId });
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof ValidationError) return NextResponse.json({ error: "Choose a valid project and customer" }, { status: 400 });
    if (isCompletedProjectError(error)) return NextResponse.json({ error: COMPLETED_PROJECT_MESSAGE }, { status: 409 });
    if (typeof error === "object" && error !== null && "number" in error && error.number === 51040) {
      return NextResponse.json({ error: "Choose an active customer. Archived customers cannot be used for new assignments." }, { status: 409 });
    }
    console.error("Project customer update failed", error);
    return NextResponse.json({ error: "Unable to update project customer" }, { status: 500 });
  }
}
