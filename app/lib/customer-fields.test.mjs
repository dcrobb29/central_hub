import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "./validation" && context.parentURL?.endsWith("/customer-fields.ts")) return nextResolve("./validation.ts", context);
    return nextResolve(specifier, context);
  },
});

const { EMPTY_CUSTOMER, parseCustomerDetails, optionalCustomerId, customerLabel, customerToDraft, invoiceCustomerSnapshot, customerEstimateName, customerBillingAddressText } =
  await import("./customer-fields.ts");

test("individual customers do not require a company, last name or addresses", () => {
  const customer = parseCustomerDetails({ ...EMPTY_CUSTOMER, firstName: "  Jane  " });
  assert.equal(customer.firstName, "Jane");
  assert.equal(customer.companyName, null);
  assert.equal(customer.lastName, null);
  assert.equal(customerLabel(customer), "Jane");
});

test("contact names are required and field types/limits are enforced", () => {
  for (const firstName of ["", " ", null, 123, "x".repeat(101)]) {
    assert.throws(() => parseCustomerDetails({ ...EMPTY_CUSTOMER, firstName }));
  }
  assert.throws(() => parseCustomerDetails({ firstName: "Jane", companyName: "x".repeat(151) }));
  assert.throws(() => parseCustomerDetails({ firstName: "Jane", billingAddressLine1: {} }));
  assert.throws(() => parseCustomerDetails([]));
  assert.throws(() => parseCustomerDetails(null));
  assert.equal(parseCustomerDetails({ firstName: "Jane", companyName: "x".repeat(150) }).companyName.length, 150);
  assert.equal(parseCustomerDetails({ firstName: "Jane", billingAddressLine1: "x".repeat(200) }).billingAddressLine1.length, 200);
});

test("email is optional and must be valid when supplied", () => {
  assert.equal(parseCustomerDetails({ firstName: "Jane", email: "  jane@example.com " }).email, "jane@example.com");
  for (const email of ["invalid", "bad @example.com", "jane@", "x".repeat(255)]) {
    assert.throws(() => parseCustomerDetails({ firstName: "Jane", email }));
  }
});

test("customer identifiers only allow nullable valid SQL integer IDs", () => {
  for (const value of [null, undefined, ""]) assert.equal(optionalCustomerId(value), null);
  assert.equal(optionalCustomerId("42"), 42);
  assert.equal(optionalCustomerId(2_147_483_647), 2_147_483_647);
  for (const value of [0, -1, 1.5, "abc", true, {}, [], 2_147_483_648]) assert.throws(() => optionalCustomerId(value));
});

test("customer labels distinguish company and individual contacts", () => {
  assert.equal(customerLabel({ firstName: "Jane", lastName: "Doe", companyName: "Example Construction" }), "Example Construction - Jane Doe");
});

test("invoice snapshots are copies and exclude directory-only fields", () => {
  const customer = parseCustomerDetails({
    firstName: "Jane", companyName: "A company name longer than ten characters",
    email: "jane@example.com", phone: "555-1234", billingAddressLine1: "1 Main Street", shippingAddressLine1: "2 Delivery Street",
  });
  const snapshot = invoiceCustomerSnapshot(customer);
  customer.billingAddressLine1 = "New billing address";
  assert.equal(snapshot.billingAddressLine1, "1 Main Street");
  assert.equal(snapshot.shippingAddressLine1, "2 Delivery Street");
  assert.equal(snapshot.companyName, "A company name longer than ten characters");
  assert.equal("email" in snapshot, false);
  assert.equal("phone" in snapshot, false);
  assert.equal(customerToDraft(customer).lastName, "");
});

test("estimate customer name prefers the company, else first and last name", () => {
  assert.equal(customerEstimateName({ companyName: "Skanska", firstName: "Pat", lastName: "Lee" }), "Skanska");
  assert.equal(customerEstimateName({ companyName: " ", firstName: "Ms.", lastName: "Miller" }), "Ms. Miller");
  assert.equal(customerEstimateName({ companyName: null, firstName: "Sam", lastName: null }), "Sam");
});

test("billing address text is multi-line and null when empty", () => {
  assert.equal(customerBillingAddressText({
    billingAddressLine1: "1 Main St", billingAddressLine2: "Suite 4",
    billingAddressCity: "Austin", billingAddressState: "TX", billingAddressZip: "78701",
  }), "1 Main St\nSuite 4\nAustin, TX 78701");
  assert.equal(customerBillingAddressText({
    billingAddressLine1: null, billingAddressLine2: null,
    billingAddressCity: null, billingAddressState: null, billingAddressZip: null,
  }), null);
});

test("optionalCustomerId rejects non-numeric and out-of-range ids", () => {
  assert.equal(optionalCustomerId(""), null);
  assert.equal(optionalCustomerId("12"), 12);
  assert.throws(() => optionalCustomerId(0));
  assert.throws(() => optionalCustomerId({}));
});