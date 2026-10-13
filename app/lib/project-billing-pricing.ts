export const SCOPE_STATUSES = ["Upcoming", "In Progress", "Complete"] as const;
export type ScopeStatus = (typeof SCOPE_STATUSES)[number];
export const BILLING_METHODS = ["Amount", "Percentage", "Scopes"] as const;
export type BillingMethod = (typeof BILLING_METHODS)[number];

export class BillingError extends Error {}
export function isScopeStatus(value: unknown): value is ScopeStatus {
  return SCOPE_STATUSES.some((status) => status === value);
}
export function isBillingMethod(value: unknown): value is BillingMethod {
  return BILLING_METHODS.some((method) => method === value);
}
export function billingCents(value: number): number {
  const cents = Math.round((value + Number.EPSILON) * 100);
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(cents)) throw new BillingError("Invalid billing value");
  return cents;
}

// Largest remainder allocation preserves every cent without exceeding a scope balance.
export function allocateCents(total: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0 || weights.some((weight) => !Number.isSafeInteger(weight) || weight < 0)) {
    throw new BillingError("Invalid allocation values");
  }
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!Number.isSafeInteger(sum)) throw new BillingError("Allocation is too large");
  if (!sum) {
    if (total) throw new BillingError("The contract has a value but its scopes have no priced work. Correct the accepted estimate first.");
    return weights.map(() => 0);
  }
  const portions = weights.map((weight, index) => {
    const numerator = BigInt(total) * BigInt(weight);
    return { index, cents: Number(numerator / BigInt(sum)), remainder: numerator % BigInt(sum) };
  });
  let left = total - portions.reduce((sum, portion) => sum + portion.cents, 0);
  const sorted = [...portions].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const portion of sorted) {
    if (!left) break;
    portion.cents++;
    left--;
  }
  return portions.map((portion) => portion.cents);
}

export type BillingScope = {
  scopeId: number; scopeName: string; sortOrder: number; status: ScopeStatus; contractValue: number; billed: number;
};
export type BillingUnit = {
  unitId: number; serviceVisitId: number | null; visitDate: string | null; recurrenceDate: string | null;
  status: ScopeStatus; skipped: boolean; contractValue: number; billed: number; scopes: BillingScope[];
};
export type BillingSelection = {
  unitId: number; scopeId: number | null; kind: "Full" | "Percentage" | "Amount"; value: number | null;
};
export type BillingAllocation = { unitId: number; scopeId: number; amount: number };

export function billableRemaining(unit: BillingUnit, scopeId: number | null, includeIncomplete: boolean): number {
  return unit.scopes.filter((scope) => (scopeId === null || scope.scopeId === scopeId) &&
    (includeIncomplete || scope.status === "Complete"))
    .reduce((sum, scope) => sum + billingCents(scope.contractValue) - billingCents(scope.billed), 0) / 100;
}

export function selectionAmount(original: number, billed: number, selection: Pick<BillingSelection, "kind" | "value">): number {
  const remaining = billingCents(original) - billingCents(billed);
  if (remaining < 0) throw new BillingError("Recorded billing exceeds the contract. Review existing invoices.");
  let cents: number;
  if (selection.kind === "Full") cents = remaining;
  else if (selection.kind === "Percentage") {
    if (selection.value === null || !Number.isFinite(selection.value) || selection.value <= 0 || selection.value > 100) {
      throw new BillingError("Enter a percentage greater than 0 and at most 100");
    }
    cents = Math.round(billingCents(original) * selection.value / 100);
  } else {
    if (selection.value === null || selection.value <= 0 || Math.abs(selection.value * 100 - Math.round(selection.value * 100)) > 0.00001) {
      throw new BillingError("Enter a positive amount with at most two decimal places");
    }
    cents = billingCents(selection.value);
  }
  if (cents <= 0) throw new BillingError("The selected work has no billable balance");
  if (cents > remaining) throw new BillingError("The amount exceeds the remaining unbilled balance. Percentages use the original contract value.");
  return cents / 100;
}

export function calculateBillingAllocations(
  units: BillingUnit[], selections: BillingSelection[], method: BillingMethod, reconciling = false, includeIncomplete = false,
): BillingAllocation[] {
  if (!selections.length) throw new BillingError("Select work to invoice");
  const selected = new Set<string>();
  const parentUnits = new Set(selections.filter((item) => item.scopeId === null).map((item) => item.unitId));
  const allocations: BillingAllocation[] = [];
  for (const selection of selections) {
    const key = `${selection.unitId}:${selection.scopeId ?? "parent"}`;
    if (selected.has(key)) throw new BillingError("The same work cannot be selected twice");
    selected.add(key);
    const unit = units.find((candidate) => candidate.unitId === selection.unitId);
    if (!unit || unit.skipped) throw new BillingError("Choose an available project or occurrence");
    if (selection.scopeId !== null && parentUnits.has(unit.unitId)) throw new BillingError("Select the parent or its scopes, not both on the same invoice");
    if (!reconciling && (method === "Amount" && (selection.kind !== "Amount" || selection.scopeId !== null) ||
      method === "Percentage" && (selection.kind !== "Percentage" || selection.scopeId !== null) ||
      method === "Scopes" && selection.kind === "Amount")) throw new BillingError("Use the project's selected billing method");
    if (selection.scopeId === null) {
      const remaining = unit.scopes.map((scope) => billingCents(scope.contractValue) - billingCents(scope.billed));
      if (remaining.some((value) => value < 0)) throw new BillingError("A scope has been overbilled. Review existing invoices.");
      const eligible = remaining.map((value, index) => reconciling || includeIncomplete || unit.scopes[index].status === "Complete" ? value : 0);
      const available = eligible.reduce((sum, value) => sum + value, 0);
      const amount = selection.kind === "Full" && !reconciling && !includeIncomplete
        ? selectionAmount(unit.contractValue, unit.contractValue - available / 100, selection)
        : selectionAmount(unit.contractValue, unit.billed, selection);
      if (billingCents(amount) > available) throw new BillingError("The amount exceeds completed work available to bill. Enable Include incomplete work to approve advance billing.");
      const shares = allocateCents(billingCents(amount), eligible);
      shares.forEach((cents, index) => {
        if (cents) allocations.push({ unitId: unit.unitId, scopeId: unit.scopes[index].scopeId, amount: cents / 100 });
      });
    } else {
      const scope = unit.scopes.find((candidate) => candidate.scopeId === selection.scopeId);
      if (!scope) throw new BillingError("Choose a scope from this project or occurrence");
      if (!reconciling && !includeIncomplete && scope.status !== "Complete") {
        throw new BillingError("Enable Include incomplete work to approve billing a scope that is not complete.");
      }
      allocations.push({ unitId: unit.unitId, scopeId: scope.scopeId, amount: selectionAmount(scope.contractValue, scope.billed, selection) });
    }
  }
  return allocations;
}
