export const ESTIMATE_STATUSES = ["Draft", "Sent", "Won", "Lost"] as const;
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];
export type EditableEstimateStatus = Exclude<EstimateStatus, "Won">;

export function isEditableEstimateStatus(value: unknown): value is EditableEstimateStatus {
  return value === "Draft" || value === "Sent" || value === "Lost";
}

export function canWinEstimate(status: string): boolean {
  return status === "Draft" || status === "Sent";
}
