export const PROJECT_STATUSES = ["Upcoming", "Active", "Complete"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const COMPLETED_PROJECT_MESSAGE = "This job is Complete and read-only. Reopen it to Active in Project Management before making changes.";
export const ACTIVE_PLANNER_MESSAGE = "Only Active jobs can be assigned or changed in the weekly planner. Set this job to Active in Project Management first.";

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return PROJECT_STATUSES.some((status) => status === value);
}

export function isCompletedProjectError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "number" in error && Number(error.number) === 51030;
}

export function isInactivePlannerError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "number" in error && Number(error.number) === 51032;
}
