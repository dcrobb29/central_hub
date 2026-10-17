import { NextRequest, NextResponse } from "next/server";
import {
  addEmployeeHistory,
  getEmployeeHistory,
  PersonnelRecordError,
} from "@/app/lib/personnel";
import { ProjectAccessError, requireProjectSession } from "@/app/lib/project-access";

export async function GET(request: NextRequest) {
  let organizationId: number;
  try {
    organizationId = (await requireProjectSession(request, "personnel.read")).organization.organizationId;
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  const employeeId = Number(request.nextUrl.searchParams.get("employeeId"));
  if (!Number.isInteger(employeeId) || employeeId < 1) {
    return NextResponse.json({ error: "Invalid employee ID" }, { status: 400 });
  }

  try {
    return NextResponse.json({ entries: await getEmployeeHistory(employeeId, organizationId) });
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Unable to load employee history. Check the Personnel tables and database permissions." }, { status: 500 });
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
  const employeeId = Number(body?.employeeId);
  const eventDate = typeof body?.eventDate === "string" ? body.eventDate : "";
  const notes = typeof body?.notes === "string" ? body.notes.trim() : "";

  if (!Number.isInteger(employeeId) || employeeId < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !notes) {
    return NextResponse.json({ error: "Employee, event date, and notes are required" }, { status: 400 });
  }
  const parsedDate = new Date(`${eventDate}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== eventDate || notes.length > 8000) {
    return NextResponse.json({ error: "Enter a valid date and notes under 8,000 characters" }, { status: 400 });
  }

  try {
    await addEmployeeHistory({ employeeId, eventDate, notes }, organizationId);
    return NextResponse.json({ entries: await getEmployeeHistory(employeeId, organizationId) }, { status: 201 });
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof PersonnelRecordError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (typeof error === "object" && error !== null && "number" in error && Number(error.number) === 51052) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Unable to save employee history. Check database permissions." }, { status: 500 });
  }
}
