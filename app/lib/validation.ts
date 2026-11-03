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
import { decimalValue, MAX_MONEY, normalizeCurrencyText } from "./decimal-input";

export class ValidationError extends Error {
  field?: string;
  constructor(reason: string, field?: string) {
    super(reason);
    this.field = field;
  }
}

export function fieldValue<T>(field: string, parse: () => T): T {
  try { return parse(); }
  catch (error) {
    if (error instanceof ValidationError) throw new ValidationError(error.message, field);
    throw error;
  }
}

export function integerValue(value: unknown, label: string): number {
  if ((typeof value !== "number" && typeof value !== "string")
      || !/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) > 2_147_483_647) {
    throw new ValidationError("Choose a valid positive whole-number ID.", label);
  }
  return Number(value);
}

export function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new ValidationError("Choose true or false.", label);
  return value;
}

export function emailValue(value: unknown, required: true): string;
export function emailValue(value: unknown, required?: boolean): string | null;
export function emailValue(value: unknown, required = false): string | null {
  const email = textValue(value, 254, required);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError("email");
  return email;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Trims a string value; returns null when empty, unless `required` is set. */
export function textValue(value: unknown, maxLength: number, required: true): string;
export function textValue(value: unknown, maxLength: number, required?: boolean): string | null;
export function textValue(value: unknown, maxLength: number, required = false): string | null {
  if (value != null && typeof value !== "string") throw new ValidationError("text");
  const text = typeof value === "string" ? value.trim() : "";
  if (!text && required) throw new ValidationError("required");
  if (text.length > maxLength) throw new ValidationError("length");
  return text || null;
}

/** Parses a "YYYY-MM-DD" string into a Date, rejecting anything else. */
export function isoDateValue(value: unknown): Date {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) throw new ValidationError("date");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (value < "0001-01-01" || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new ValidationError("date");
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

export function validateDueDate(issueDate: Date, dueDate: Date | null): void {
  if (dueDate && dueDate < issueDate) throw new ValidationError("Due date cannot be before the document date.", "Due date");
}

/**
 * Parses a currency amount into a fixed-point string (matches the fixed-width
 * `NChar(10)` amount columns used by Invoices/Bills). Pass `required: true`
 * when an empty value should be rejected instead of treated as null.
 */
export function amountValue(value: unknown, options: { required: true; maxLength?: number }): string;
export function amountValue(value: unknown, options?: { required?: boolean; maxLength?: number }): string | null;
export function amountValue(value: unknown, { required = false, maxLength = 10 }: { required?: boolean; maxLength?: number } = {}): string | null {
  if (required) {
    if (typeof value !== "string" || !value.trim()) throw new ValidationError("required");
  } else if (value == null || value === "") {
    return null;
  }
  let amount: number;
  try {
    amount = decimalValue(typeof value === "string" ? normalizeCurrencyText(value) : value, "Amount", 2, -MAX_MONEY, MAX_MONEY);
  } catch {
    throw new ValidationError("amount");
  }
  const normalized = amount.toFixed(2);
  if (normalized.length > maxLength) throw new ValidationError("amount-length");
  return normalized;
}

/** Validates a non-negative number, throwing a human-readable message (used outside the reason-coded routes). */
export function nonNegativeNumberValue(value: unknown, label: string): number {
  return decimalValue(value, label, 4);
}

/** Validates an optional project ID (positive integer or empty/null for "unassigned"). */
export function optionalProjectId(value: unknown): number | null {
  if (value == null || value === "") return null;
  try { return integerValue(value, "Project"); }
  catch (error) {
    if (error instanceof ValidationError) throw new ValidationError("project");
    throw error;
  }
}

/** Standard reason -> message mapping shared by the invoices/bills create routes. */
export function describeValidationError(error: unknown): string {
  const reason = error instanceof Error ? error.message : "";
  const messages: Record<string, string> = {
    length: "Text exceeds the allowed character limit.",
    text: "Enter text, not another value type.",
    required: "This field is required.",
    date: "Enter a valid calendar date (YYYY-MM-DD).",
    email: "Enter a valid email address.",
    project: "Choose a valid project.",
    customer: "Choose a valid customer.",
    invalid: "Enter a valid record.",
    "amount-length": "Amount is too large for this field.",
    amount: "Enter an amount within the supported range, with up to two decimal places; scientific notation is not allowed.",
    zip: "Enter a 5-digit ZIP or ZIP+4 (XXXXX-XXXX).",
    phone: "Enter a 10-digit US phone number.",
  };
  const message = messages[reason] ?? (error instanceof ValidationError ? reason : "Check the required fields, dates, and amount.");
  return error instanceof ValidationError && error.field ? `${error.field}: ${message}` : message;
}
