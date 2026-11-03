import type { OrganizationInvoiceSettings } from "./invoice-settings";
import { booleanValue, emailValue, fieldValue, integerValue, textValue, ValidationError } from "./validation";
import { phoneValue, zipValue } from "./contact-input";

export function parseInvoiceSettings(value: unknown): Partial<OrganizationInvoiceSettings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("invalid", "Invoice settings");
  const input = value as Record<string, unknown>;
  const result: Partial<OrganizationInvoiceSettings> = {};
  const fields = {
    invoiceTitle: 64, companyName: 150, companyAddressLine1: 200, companyAddressLine2: 200,
    companyCity: 100, companyState: 50, companyWebsite: 200, taxNumber: 50, paymentTerms: 100,
    emailSubjectTemplate: 250, paymentInstructions: Number.MAX_SAFE_INTEGER,
    defaultCustomerNotes: Number.MAX_SAFE_INTEGER, emailBodyTemplate: Number.MAX_SAFE_INTEGER,
  } as const;
  for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
    if (input[key] === undefined) continue;
    const label = key.replace(/([A-Z])/g, " $1");
    const text = fieldValue(fields[key] === Number.MAX_SAFE_INTEGER ? label : `${label} (up to ${fields[key]} characters)`, () => textValue(input[key], fields[key]));
    // Blank template settings retain their existing defaults; letterhead fields may be cleared.
    if (key === "invoiceTitle" || key === "paymentTerms" || key === "emailSubjectTemplate" || key === "emailBodyTemplate") {
      if (text !== null) result[key] = text;
    } else result[key] = text;
  }
  if (input.companyEmail !== undefined) result.companyEmail = fieldValue("Billing email", () => emailValue(input.companyEmail));
  if (input.companyPhone !== undefined) result.companyPhone = fieldValue("Company phone", () => phoneValue(input.companyPhone));
  if (input.companyZip !== undefined) result.companyZip = fieldValue("Company ZIP", () => zipValue(input.companyZip));
  if (input.templateStyle !== undefined) {
    if (!["modern", "classic", "compact", "minimal"].includes(String(input.templateStyle)) || typeof input.templateStyle !== "string") {
      throw new ValidationError("Choose a valid invoice template style.");
    }
    result.templateStyle = input.templateStyle as OrganizationInvoiceSettings["templateStyle"];
  }
  if (input.accentColor !== undefined) {
    if (typeof input.accentColor !== "string" || !/^#[0-9a-f]{6}$/i.test(input.accentColor)) {
      throw new ValidationError("Enter a six-digit hexadecimal accent color.");
    }
    result.accentColor = input.accentColor;
  }
  for (const key of ["showShippingAddress", "showProjectName", "showItemizedScopes"] as const) {
    if (input[key] !== undefined) result[key] = booleanValue(input[key], key);
  }
  if (input.nextInvoiceSequence !== undefined) result.nextInvoiceSequence = integerValue(input.nextInvoiceSequence, "Next invoice sequence");
  return result;
}
