import { isoDateString } from "./validation";

export type ProjectCostInput = {
  projectId: number;
  billId: string;
  estimateLineItemId: number | null;
  description: string;
  costDate: string;
  quantity: number;
  unitName: string;
  unitCost: number;
  freightAmount: number;
  taxAmount: number;
};

export class ProjectCostError extends Error {}
export class ProjectBillAssignmentError extends ProjectCostError {}

export function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function actualCostTotal(input: Pick<ProjectCostInput, "quantity" | "unitCost" | "freightAmount" | "taxAmount">): number {
  if (![input.quantity, input.unitCost, input.freightAmount, input.taxAmount].every(Number.isFinite)) return NaN;
  // Fixed-point multiplication matches SQL decimal rounding at half-cent boundaries.
  const product = BigInt(Math.round(input.quantity * 10_000)) * BigInt(Math.round(input.unitCost * 10_000));
  const baseCents = (product + BigInt(500_000)) / BigInt(1_000_000);
  return (Number(baseCents) + Math.round(input.freightAmount * 100) + Math.round(input.taxAmount * 100)) / 100;
}

export function parseProjectCost(body: unknown): ProjectCostInput {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ProjectCostError("Invalid cost entry");
  const input = body as Record<string, unknown>;
  function id(value: unknown, label: string): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) {
      throw new ProjectCostError(`Choose a valid ${label}`);
    }
    return value;
  }
  function text(value: unknown, label: string, max: number): string {
    if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
      throw new ProjectCostError(`${label} is required and must be ${max} characters or fewer`);
    }
    return value.trim();
  }
  function decimal(value: unknown, label: string, places: number, minimum = 0): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > 1_000_000 ||
      Math.abs(value - Number(value.toFixed(places))) > 0.00000001) {
      throw new ProjectCostError(`${label} must be between ${minimum} and 1,000,000, with up to ${places} decimals`);
    }
    return value;
  }
  let costDate: string;
  try {
    costDate = isoDateString(input.costDate);
    if (costDate < "0001-01-01") throw new Error("date");
  }
  catch { throw new ProjectCostError("Enter a valid cost date"); }
  const result: ProjectCostInput = {
    projectId: id(input.projectId, "project"),
    billId: text(input.billId, "Bill", 10),
    estimateLineItemId: input.estimateLineItemId === null ? null : id(input.estimateLineItemId, "estimate line"),
    description: text(input.description, "Description", 300),
    costDate,
    quantity: decimal(input.quantity, "Quantity", 4, 0.0001),
    unitName: text(input.unitName, "Unit", 30),
    unitCost: decimal(input.unitCost, "Unit cost", 4),
    freightAmount: decimal(input.freightAmount, "Freight", 2),
    taxAmount: decimal(input.taxAmount, "Tax amount", 2),
  };
  if (actualCostTotal(result) <= 0 || actualCostTotal(result) > 99_999_999.99) {
    throw new ProjectCostError("Total cost must be positive and fit the bill amount limit");
  }
  return result;
}

export function matchingQuantity(costs: Array<{ quantity: number; unitName: string }>, unitName: string | null): {
  quantity: number; hasOtherUnits: boolean;
} {
  const unit = unitName?.trim().toUpperCase();
  return {
    quantity: costs.filter((cost) => unit && cost.unitName.trim().toUpperCase() === unit).reduce((sum, cost) => sum + cost.quantity, 0),
    hasOtherUnits: costs.some((cost) => !unit || cost.unitName.trim().toUpperCase() !== unit),
  };
}
