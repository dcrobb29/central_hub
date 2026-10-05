import { NextRequest, NextResponse } from "next/server";
import {
  addFieldOperationsTask,
  assignResourceToTask,
  deactivateFieldOperationsAssignment,
  deactivateFieldOperationsTask,
  getFieldOperationsSchedule,
  moveFieldOperationsAssignment,
  scheduleProjectVisit,
  unscheduleFieldOperationsVisit,
  updateFieldOperationsTask,
} from "@/app/lib/field-operations";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validWeek(startDate: string | null, endDate: string | null) {
  if (!startDate || !endDate || !validDate(startDate) || !validDate(endDate)) return false;
  return (Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) / 86_400_000 === 6;
}

function errorResponse(error: unknown) {
  if (error instanceof Error && error.message === "project-not-found") {
    return NextResponse.json({ error: "Choose an existing project" }, { status: 404 });
  }
  if (typeof error === "object" && error !== null && "number" in error) {
    const number = Number(error.number);
    if (number === 2601 || number === 2627) {
      return NextResponse.json({ error: "That resource is already assigned to this task" }, { status: 409 });
    }
    if (number === 547) {
      return NextResponse.json({ error: "The selected job, task, employee, or equipment no longer exists" }, { status: 400 });
    }
  }
  console.error("Field operations request failed", error);
  return NextResponse.json({ error: "Unable to update the field schedule. Check the database connection and permissions." }, { status: 500 });
}

export async function GET(request: NextRequest) {
  const startDate = request.nextUrl.searchParams.get("startDate");
  const endDate = request.nextUrl.searchParams.get("endDate");
  if (!validWeek(startDate, endDate) || startDate === null || endDate === null) {
    return NextResponse.json({ error: "Choose a valid seven-day date range" }, { status: 400 });
  }
  try {
    return NextResponse.json({ visits: await getFieldOperationsSchedule(startDate, endDate) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body) || typeof body.action !== "string") {
    return NextResponse.json({ error: "Invalid field schedule request" }, { status: 400 });
  }

  try {
    if (body.action === "schedule-project") {
      const projectId = positiveInteger(body.projectId);
      if (!projectId || !validDate(body.visitDate)) {
        return NextResponse.json({ error: "Choose a valid project and date" }, { status: 400 });
      }
      await scheduleProjectVisit(projectId, body.visitDate);
      return NextResponse.json({ success: true });
    }

    if (body.action === "unschedule-visit") {
      const serviceVisitId = positiveInteger(body.serviceVisitId);
      if (!serviceVisitId) return NextResponse.json({ error: "Choose a valid scheduled job" }, { status: 400 });
      if (!await unscheduleFieldOperationsVisit(serviceVisitId)) {
        return NextResponse.json({ error: "The scheduled job no longer exists" }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    }

    if (body.action === "add-task") {
      const serviceVisitId = positiveInteger(body.serviceVisitId);
      const taskName = typeof body.taskName === "string" ? body.taskName.trim() : "";
      const plannedLaborHours = typeof body.plannedLaborHours === "number" ? body.plannedLaborHours : Number(body.plannedLaborHours);
      if (!serviceVisitId || !taskName || taskName.length > 150 || !Number.isFinite(plannedLaborHours) || plannedLaborHours < 0 || plannedLaborHours > 100_000 || Math.abs(plannedLaborHours - Number(plannedLaborHours.toFixed(2))) > 0.0000001) {
        return NextResponse.json({ error: "Enter a task name and valid planned hours (0 to 100,000, up to two decimals)" }, { status: 400 });
      }
      if (!await addFieldOperationsTask(serviceVisitId, taskName, plannedLaborHours)) {
        return NextResponse.json({ error: "The scheduled job no longer exists" }, { status: 404 });
      }
      return NextResponse.json({ success: true }, { status: 201 });
    }

    if (body.action === "update-task") {
      const taskId = positiveInteger(body.taskId);
      const taskName = typeof body.taskName === "string" ? body.taskName.trim() : "";
      const plannedLaborHours = typeof body.plannedLaborHours === "number" ? body.plannedLaborHours : Number(body.plannedLaborHours);
      if (!taskId || !taskName || taskName.length > 150 || !Number.isFinite(plannedLaborHours) || plannedLaborHours < 0 || plannedLaborHours > 100_000 || Math.abs(plannedLaborHours - Number(plannedLaborHours.toFixed(2))) > 0.0000001) {
        return NextResponse.json({ error: "Enter a task name and valid planned hours (0 to 100,000, up to two decimals)" }, { status: 400 });
      }
      if (!await updateFieldOperationsTask(taskId, taskName, plannedLaborHours)) {
        return NextResponse.json({ error: "The scheduled task no longer exists" }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    }

    if (body.action === "delete-task") {
      const taskId = positiveInteger(body.taskId);
      if (!taskId) return NextResponse.json({ error: "Choose a valid task" }, { status: 400 });
      if (!await deactivateFieldOperationsTask(taskId)) {
        return NextResponse.json({ error: "The scheduled task no longer exists" }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    }

    if (body.action === "assign-resource") {
      const taskId = positiveInteger(body.taskId);
      const employeeId = body.resourceType === "employee" ? positiveInteger(body.resourceId) : null;
      const equipmentId = body.resourceType === "equipment" ? positiveInteger(body.resourceId) : null;
      if (!taskId || (!employeeId && !equipmentId)) {
        return NextResponse.json({ error: "Choose a valid task and employee or equipment" }, { status: 400 });
      }
      if (!await assignResourceToTask(taskId, employeeId ? { employeeId } : { equipmentId: equipmentId! })) {
        return NextResponse.json({ error: "The scheduled task no longer exists" }, { status: 404 });
      }
      return NextResponse.json({ success: true }, { status: 201 });
    }

    if (body.action === "move-assignment") {
      const assignmentId = positiveInteger(body.assignmentId);
      const taskId = positiveInteger(body.taskId);
      if (!assignmentId || !taskId) return NextResponse.json({ error: "Choose a valid assignment and task" }, { status: 400 });
      if (!await moveFieldOperationsAssignment(assignmentId, taskId)) {
        return NextResponse.json({ error: "The assignment or destination task no longer exists" }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    }

    if (body.action === "remove-assignment") {
      const assignmentId = positiveInteger(body.assignmentId);
      if (!assignmentId) return NextResponse.json({ error: "Choose a valid assignment" }, { status: 400 });
      if (!await deactivateFieldOperationsAssignment(assignmentId)) {
        return NextResponse.json({ error: "The assignment no longer exists" }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown field schedule action" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
