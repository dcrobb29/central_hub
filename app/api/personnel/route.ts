import { NextRequest, NextResponse } from "next/server";
import {
  addPerson,
  addRole,
  getPersonnelData,
  PersonnelRecordError,
  updatePerson,
} from "@/app/lib/personnel";
import { ProjectAccessError, requireProjectSession } from "@/app/lib/project-access";

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "number" in error && [2601, 2627].includes(Number(error.number));
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireProjectSession(request, "personnel.read");
    return NextResponse.json(await getPersonnelData(session.organization.organizationId));
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Unable to load personnel. Check the Personnel tables and database permissions." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let organizationId: number;
  try {
    organizationId = (await requireProjectSession(request, "personnel.write")).organization.organizationId;
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    if (body.action === "add-role") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) return NextResponse.json({ error: "Enter a role name" }, { status: 400 });
      await addRole(name, organizationId);
      return NextResponse.json(await getPersonnelData(organizationId), { status: 201 });
    }

    if (body.action === "add-person") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const roleId = Number(body.roleId);
      const relationType = body.relationType;
      const relationPersonId = body.relationPersonId ? Number(body.relationPersonId) : null;
      if (!name) return NextResponse.json({ error: "Enter the person's name" }, { status: 400 });
      if (name.length > 200 || !Number.isInteger(roleId) || roleId < 1) {
        return NextResponse.json({ error: "Enter a valid name and role" }, { status: 400 });
      }
      if (!["none", "reportsTo", "manages"].includes(relationType)) {
        return NextResponse.json({ error: "Choose a valid reporting relationship" }, { status: 400 });
      }
      if (relationType !== "none" && (!Number.isInteger(relationPersonId) || relationPersonId! < 1)) {
        return NextResponse.json({ error: "Choose a person for the relationship" }, { status: 400 });
      }

      const employeeId = await addPerson({
        name,
        roleId,
        relationType,
        relationPersonId,
      }, organizationId);
      return NextResponse.json({
        ...await getPersonnelData(organizationId),
        createdPersonId: String(employeeId),
      }, { status: 201 });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof PersonnelRecordError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (isUniqueConstraintError(error)) {
      return NextResponse.json({ error: "That role already exists" }, { status: 409 });
    }
    if (typeof error === "object" && error !== null && "number" in error && error.number === 547) {
      return NextResponse.json({ error: "The selected role or employee no longer exists" }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to save personnel data. Check database permissions." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  let organizationId: number;
  try {
    organizationId = (await requireProjectSession(request, "personnel.write")).organization.organizationId;
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  const body = await request.json().catch(() => null);
  const id = Number(body?.id);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const roleId = Number(body?.roleId);
  const managerId = body?.managerId === null || body?.managerId === "" ? null : Number(body?.managerId);

  if (!Number.isInteger(id) || id < 1 || !name || name.length > 200 || !Number.isInteger(roleId) || roleId < 1) {
    return NextResponse.json({ error: "Enter a valid name and role" }, { status: 400 });
  }
  if (managerId !== null && (!Number.isInteger(managerId) || managerId < 1 || managerId === id)) {
    return NextResponse.json({ error: "Choose a valid manager" }, { status: 400 });
  }

  try {
    const data = await getPersonnelData(organizationId);
    const person = data.people.find((item) => item.id === String(id));
    if (!person) return NextResponse.json({ error: "Person not found" }, { status: 404 });
    if (!data.roles.some((role) => role.id === String(roleId))) {
      return NextResponse.json({ error: "Choose a valid role" }, { status: 400 });
    }

    let ancestorId = managerId === null ? null : String(managerId);
    const visited = new Set<string>();
    while (ancestorId) {
      if (ancestorId === String(id) || visited.has(ancestorId)) {
        return NextResponse.json({ error: "That reporting relationship creates a cycle" }, { status: 400 });
      }
      visited.add(ancestorId);
      ancestorId = data.people.find((item) => item.id === ancestorId)?.managerId ?? null;
    }

    await updatePerson({ id, name, roleId, managerId }, organizationId);
    return NextResponse.json(await getPersonnelData(organizationId));
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof PersonnelRecordError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (typeof error === "object" && error !== null && "number" in error && [51050, 51051].includes(Number(error.number))) {
      return NextResponse.json({ error: Number(error.number) === 51050 ? "Choose a role in your organization" : "Choose a person in your organization" }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to update personnel data. Check database permissions." }, { status: 500 });
  }
}
