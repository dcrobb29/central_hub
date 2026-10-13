import type { FieldOperationsVisit } from "./field-operations";

export const DAILY_CAPACITY = 8;
export const WEEKLY_CAPACITY = 40;
export const HALF_DAY_HOURS = 4;
// Resources booked at or above this many hours on a day can't be dragged into more work.
export const DAILY_LOCK_HOURS = 10;

export const ASSIGNMENT_HOURS_MODES = ["FullDay", "HalfDay", "FullJob", "Split", "Custom"] as const;
export type AssignmentHoursMode = (typeof ASSIGNMENT_HOURS_MODES)[number];
export type ResourceKind = "employee" | "equipment";

export function isAssignmentHoursMode(value: unknown): value is AssignmentHoursMode {
  return typeof value === "string" && (ASSIGNMENT_HOURS_MODES as readonly string[]).includes(value);
}

export type PlanningRow = {
  projectId: number;
  isRecurring: boolean;
  taskId: number;
  estimateLineItemId: number | null;
  plannedLaborHours: number;
  assignmentId: number | null;
  kind: ResourceKind | null;
  hoursMode: AssignmentHoursMode | null;
  customHours: number | null;
};

export type TaskHoursSummary = {
  allottedHours: number;
  remainingHours: number;
  equipmentRemainingHours: number;
  sharedAcrossVisits: boolean;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

// Estimate-line tasks on one-time projects draw down one allotment across every visit;
// recurring visits and manually added tasks each have their own allotment.
export function taskGroupKey(row: Pick<PlanningRow, "projectId" | "isRecurring" | "taskId" | "estimateLineItemId">): string {
  return row.estimateLineItemId !== null && !row.isRecurring
    ? `line:${row.projectId}:${row.estimateLineItemId}`
    : `task:${row.taskId}`;
}

function fixedHours(row: PlanningRow): number | null {
  if (row.hoursMode === "FullDay") return DAILY_CAPACITY;
  if (row.hoursMode === "HalfDay") return HALF_DAY_HOURS;
  if (row.hoursMode === "Custom") return row.customHours ?? 0;
  // Assignments created before per-assignment hours keep their task's planned hours.
  if (row.hoursMode === null) return row.plannedLaborHours;
  return null;
}

/**
 * Fixed modes (Full Day, Half Day, Custom, legacy) are subtracted from the allotment first;
 * Full Job and Split Evenly then share whatever remains equally. Employees and equipment
 * are resolved independently so equipment hours never use up a task's labor hours.
 */
export function resolvePlanningHours(rows: PlanningRow[]) {
  const groups = new Map<string, PlanningRow[]>();
  for (const row of rows) {
    const key = taskGroupKey(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const assignmentHours = new Map<number, number>();
  const taskSummaries = new Map<number, TaskHoursSummary>();
  for (const groupRows of groups.values()) {
    const allottedHours = Math.max(...groupRows.map((row) => row.plannedLaborHours));
    const usedByKind = { employee: 0, equipment: 0 };
    for (const kind of ["employee", "equipment"] as const) {
      const byAssignment = new Map<number, PlanningRow>();
      for (const row of groupRows) if (row.assignmentId !== null && row.kind === kind) byAssignment.set(row.assignmentId, row);
      const assigned = [...byAssignment.values()];
      const fixedTotal = assigned.reduce((total, row) => total + (fixedHours(row) ?? 0), 0);
      const flexible = assigned.filter((row) => fixedHours(row) === null);
      const pool = Math.max(0, allottedHours - fixedTotal);
      const share = flexible.length > 0 ? round2(pool / flexible.length) : 0;
      const lastFlexible = flexible.at(-1);
      for (const row of assigned) {
        // The last flexible share absorbs rounding so an evenly split task never reads "0.01h over".
        const hours = round2(fixedHours(row) ?? (row === lastFlexible ? Math.max(0, pool - share * (flexible.length - 1)) : share));
        assignmentHours.set(row.assignmentId!, hours);
        usedByKind[kind] += hours;
      }
    }
    const summary: TaskHoursSummary = {
      allottedHours,
      remainingHours: round2(allottedHours - usedByKind.employee),
      equipmentRemainingHours: round2(allottedHours - usedByKind.equipment),
      sharedAcrossVisits: taskGroupKey(groupRows[0]).startsWith("line:"),
    };
    for (const row of groupRows) taskSummaries.set(row.taskId, summary);
  }
  return { assignmentHours, taskSummaries };
}

/** Hours a resource would receive if switched to Full Job; Full Job is only offered at 8h or less. */
export function fullJobHours(remainingHours: number, currentHours: number): number {
  return round2(Math.max(0, remainingHours + currentHours));
}

export function resourceCapacity(visits: FieldOperationsVisit[], dates: string[], kind: ResourceKind): Map<number, Map<string, number>> {
  const result = new Map<number, Map<string, number>>();
  const includedDates = new Set(dates);
  for (const visit of visits) {
    if (!includedDates.has(visit.visitDate)) continue;
    for (const task of visit.tasks) {
      for (const assignment of task.assignments) {
        const id = kind === "employee" ? assignment.employeeId : assignment.equipmentId;
        if (id === null) continue;
        const days = result.get(id) ?? new Map<string, number>();
        days.set(visit.visitDate, round2((days.get(visit.visitDate) ?? 0) + assignment.hours));
        result.set(id, days);
      }
    }
  }
  return result;
}

export function employeeCapacity(visits: FieldOperationsVisit[], dates: string[]) {
  return resourceCapacity(visits, dates, "employee");
}

export function visitLaborHours(visit: FieldOperationsVisit): number {
  return round2(visit.tasks.reduce((total, task) => total + task.assignments.reduce(
    (taskTotal, assignment) => taskTotal + (assignment.employeeId === null ? 0 : assignment.hours), 0), 0));
}

export function capacityLabel(hours: number, capacity: number): string {
  return hours > capacity ? `${round2(hours - capacity).toLocaleString()}h over`
    : hours === capacity ? "Full" : `${round2(capacity - hours).toLocaleString()}h free`;
}

export function dayCapacityLabel(hours: number, date: string): string {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6
    ? hours > 0 ? `${hours.toLocaleString()}h weekend work` : "Off / 0h planned"
    : capacityLabel(hours, DAILY_CAPACITY);
}
