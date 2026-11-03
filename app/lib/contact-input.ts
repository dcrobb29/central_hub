import { ValidationError } from "./validation";

export function formatPhone(value: string): string {
  if (!/^[\d()\s+.-]*$/.test(value)) return value;
  let digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length > 10) return value;
  if (!digits) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)})${digits.slice(3)}`;
  return `(${digits.slice(0, 3)})${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function formatZip(value: string): string {
  const text = value.trim();
  if (!/^\d{0,9}$/.test(text) && !/^\d{5}-\d{0,4}$/.test(text)) return text;
  const digits = text.replace("-", "");
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export function phoneValue(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new ValidationError("phone");
  const formatted = formatPhone(value.trim());
  if (!formatted) return null;
  if (!/^\(\d{3}\)\d{3}-\d{4}$/.test(formatted)) throw new ValidationError("phone");
  return formatted;
}

export function zipValue(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new ValidationError("zip");
  const formatted = formatZip(value);
  if (!formatted) return null;
  if (!/^\d{5}(?:-\d{4})?$/.test(formatted)) throw new ValidationError("zip");
  return formatted;
}
