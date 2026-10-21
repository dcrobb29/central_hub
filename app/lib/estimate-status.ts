export const ESTIMATE_STATUSES = ["Draft", "Won", "Lost"] as const;
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];
export type EditableEstimateStatus = Exclude<EstimateStatus, "Won">;

export function isEditableEstimateStatus(value: unknown): value is EditableEstimateStatus {
  return value === "Draft" || value === "Lost";
}

export function canWinEstimate(status: string): boolean {
  return status === "Draft";
}

export function matchesEstimateStatus(status: EstimateStatus, filter: string): boolean {
  return filter === "All" || status === filter;
}
