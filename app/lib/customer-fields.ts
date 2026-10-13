import { textValue, ValidationError } from "./validation";

export type CustomerDetails = {
  firstName: string;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingAddressCity: string | null;
  billingAddressState: string | null;
  billingAddressZip: string | null;
  shippingAddressLine1: string | null;
  shippingAddressLine2: string | null;
  shippingAddressCity: string | null;
  shippingAddressState: string | null;
  shippingAddressZip: string | null;
};

export type Customer = CustomerDetails & { customerId: number; isActive: boolean };
export type CustomerDraft = { [K in keyof CustomerDetails]: string };

export const CUSTOMER_FIELD_GROUPS: {
  title: string;
  fields: { key: keyof CustomerDetails; label: string; maxLength: number; required?: boolean; type?: "email" | "tel" }[];
}[] = [
  { title: "Contact", fields: [
    { key: "firstName", label: "First / contact name", maxLength: 100, required: true },
    { key: "lastName", label: "Last name", maxLength: 100 },
    { key: "companyName", label: "Company (optional)", maxLength: 150 },
    { key: "email", label: "Email", maxLength: 254, type: "email" },
    { key: "phone", label: "Phone", maxLength: 50, type: "tel" },
  ] },
  { title: "Billing address", fields: [
    { key: "billingAddressLine1", label: "Address line 1", maxLength: 200 },
    { key: "billingAddressLine2", label: "Address line 2", maxLength: 200 },
    { key: "billingAddressCity", label: "City", maxLength: 100 },
    { key: "billingAddressState", label: "State / region", maxLength: 100 },
    { key: "billingAddressZip", label: "ZIP / postal code", maxLength: 20 },
  ] },
  { title: "Shipping address", fields: [
    { key: "shippingAddressLine1", label: "Address line 1", maxLength: 200 },
    { key: "shippingAddressLine2", label: "Address line 2", maxLength: 200 },
    { key: "shippingAddressCity", label: "City", maxLength: 100 },
    { key: "shippingAddressState", label: "State / region", maxLength: 100 },
    { key: "shippingAddressZip", label: "ZIP / postal code", maxLength: 20 },
  ] },
];

export const EMPTY_CUSTOMER: CustomerDraft = {
  firstName: "", lastName: "", companyName: "", email: "", phone: "",
  billingAddressLine1: "", billingAddressLine2: "", billingAddressCity: "", billingAddressState: "", billingAddressZip: "",
  shippingAddressLine1: "", shippingAddressLine2: "", shippingAddressCity: "", shippingAddressState: "", shippingAddressZip: "",
};

export function customerLabel(customer: Pick<CustomerDetails, "firstName" | "lastName" | "companyName">): string {
  const contact = [customer.firstName, customer.lastName].filter(Boolean).join(" ");
  return customer.companyName ? `${customer.companyName} - ${contact}` : contact;
}

export function optionalCustomerId(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value !== "number" && typeof value !== "string") throw new ValidationError("customer");
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647) throw new ValidationError("customer");
  return id;
}

export function parseCustomerDetails(body: unknown): CustomerDetails {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ValidationError("invalid");
  const input = body as Record<string, unknown>;
  for (const { fields } of CUSTOMER_FIELD_GROUPS) {
    for (const field of fields) {
      if (input[field.key] != null && typeof input[field.key] !== "string") throw new ValidationError("invalid");
    }
  }
  const email = textValue(input.email, 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError("email");
  return {
    firstName: textValue(input.firstName, 100, true),
    lastName: textValue(input.lastName, 100),
    companyName: textValue(input.companyName, 150),
    email,
    phone: textValue(input.phone, 50),
    billingAddressLine1: textValue(input.billingAddressLine1, 200),
    billingAddressLine2: textValue(input.billingAddressLine2, 200),
    billingAddressCity: textValue(input.billingAddressCity, 100),
    billingAddressState: textValue(input.billingAddressState, 100),
    billingAddressZip: textValue(input.billingAddressZip, 20),
    shippingAddressLine1: textValue(input.shippingAddressLine1, 200),
    shippingAddressLine2: textValue(input.shippingAddressLine2, 200),
    shippingAddressCity: textValue(input.shippingAddressCity, 100),
    shippingAddressState: textValue(input.shippingAddressState, 100),
    shippingAddressZip: textValue(input.shippingAddressZip, 20),
  };
}

export function customerToDraft(customer: CustomerDetails): CustomerDraft {
  return {
    firstName: customer.firstName, lastName: customer.lastName ?? "", companyName: customer.companyName ?? "",
    email: customer.email ?? "", phone: customer.phone ?? "",
    billingAddressLine1: customer.billingAddressLine1 ?? "", billingAddressLine2: customer.billingAddressLine2 ?? "",
    billingAddressCity: customer.billingAddressCity ?? "", billingAddressState: customer.billingAddressState ?? "",
    billingAddressZip: customer.billingAddressZip ?? "",
    shippingAddressLine1: customer.shippingAddressLine1 ?? "", shippingAddressLine2: customer.shippingAddressLine2 ?? "",
    shippingAddressCity: customer.shippingAddressCity ?? "", shippingAddressState: customer.shippingAddressState ?? "",
    shippingAddressZip: customer.shippingAddressZip ?? "",
  };
}

export function invoiceCustomerSnapshot(customer: CustomerDetails) {
  const { email, phone, ...snapshot } = customerToDraft(customer);
  void email;
  void phone;
  return snapshot;
}
