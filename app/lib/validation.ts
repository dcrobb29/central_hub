/**
 * Shared request-body validation helpers for API routes.
 *
 * Several routes (invoices, bills, materials) used to each define their own
 * near-identical copies of these functions with slightly different names and
 * rules. Keeping one copy here means every route validates the same way and
 * stays in sync when the rules change.
 *
 * Functions throw a `ValidationError` carrying a short "reason" string
 * (e.g. "required", "length", "date") rather than a user-facing message, so
 * each route can keep mapping reasons to its own wording via
 * `describeValidationError` or its own custom logic.
 */
export class ValidationError extends Error {}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Trims a string value; returns null when empty, unless `required` is set. */
export function textValue(value: unknown, maxLength: number, required: true): string;
export function textValue(value: unknown, maxLength: number, required?: boolean): string | null;
export function textValue(value: unknown, maxLength: number, required = false): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text && required) throw new ValidationError("required");
  if (text.length > maxLength) throw new ValidationError("length");
  return text || null;
}

/** Parses a "YYYY-MM-DD" string into a Date, rejecting anything else. */
export function isoDateValue(value: unknown): Date {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) throw new ValidationError("date");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new ValidationError("date");
  return date;
}

/** Same as `isoDateValue`, but null/"" is allowed and passes through as null. */
export function optionalIsoDateValue(value: unknown): Date | null {
  return value == null || value === "" ? null : isoDateValue(value);
}

/** Validates a "YYYY-MM-DD" string and returns it as-is (for callers that store the raw string rather than a Date). */
export function isoDateString(value: unknown): string {
  isoDateValue(value);
  return value as string;
}

/**
 * Parses a currency amount into a fixed-point string (matches the fixed-width
 * `NChar(10)` amount columns used by Invoices/Bills). Pass `required: true`
 * when an empty value should be rejected instead of treated as null.
 */
export function amountValue(value: unknown, options: { required: true }): string;
export function amountValue(value: unknown, options?: { required?: boolean }): string | null;
export function amountValue(value: unknown, { required = false }: { required?: boolean } = {}): string | null {
  if (required) {
    if (typeof value !== "string" || !value.trim()) throw new ValidationError("required");
  } else if (value == null || value === "") {
    return null;
  }
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new ValidationError("amount");
  const normalized = amount.toFixed(2);
  if (normalized.length > 10) throw new ValidationError("amount-length");
  return normalized;
}

/** Validates a non-negative number, throwing a human-readable message (used outside the reason-coded routes). */
export function nonNegativeNumberValue(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} must be a non-negative number`);
  return number;
}

/** Validates an optional project ID (positive integer or empty/null for "unassigned"). */
export function optionalProjectId(value: unknown): number | null {
  if (value == null || value === "") return null;
  const projectId = Number(value);
  if (!Number.isInteger(projectId) || projectId < 1) throw new ValidationError("project");
  return projectId;
}

/** Standard reason -> message mapping shared by the invoices/bills create routes. */
export function describeValidationError(error: unknown): string {
  const reason = error instanceof Error ? error.message : "";
  if (reason === "length") return "A text value is longer than its SQL column allows";
  if (reason === "amount-length") return "Amount must fit the 10-character amount column";
  return "Check required fields, dates, and amount";
}
