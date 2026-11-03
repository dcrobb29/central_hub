import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("./") && !/\.[a-z]+$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});
const { amountValue, booleanValue, describeValidationError, emailValue, fieldValue, integerValue, isoDateValue, optionalProjectId, textValue, validateDueDate } = await import("./validation.ts");
const { assertMoneyRange, currencyValue, decimalValue, MAX_BILL_AMOUNT, MAX_DECIMAL_4, MAX_DECIMAL_6, MAX_MONEY, normalizeCurrencyText, scaledTemplateQuantity } = await import("./decimal-input.ts");
const { validateEstimateTotals } = await import("./estimate-pricing.ts");
const { parseInvoiceSettings } = await import("./invoice-settings-input.ts");
const { sameInputText, similarCustomer } = await import("./input-warnings.ts");
const { US_STATES } = await import("./us-states.ts");

test("IDs, booleans, numbers and text do not coerce incompatible values", () => {
  for (const value of [true, false, [], {}, " ", "", null, undefined, "1e2", "1.1", 2_147_483_648]) {
    assert.throws(() => integerValue(value, "ID"));
  }
  assert.equal(integerValue("123", "ID"), 123);
  assert.equal(optionalProjectId(""), null);
  for (const value of [true, [], {}, "1e2", "1.1"]) assert.throws(() => optionalProjectId(value));
  for (const value of ["true", "false", 0, 1, null, {}]) assert.throws(() => booleanValue(value, "Active"));
  assert.equal(booleanValue(false, "Active"), false);
  for (const value of [null, undefined, true, [], {}, ""]) assert.throws(() => decimalValue(value, "Quantity", 4));
  for (const value of [true, 123, {}, []]) assert.throws(() => textValue(value, 100));
  assert.equal(textValue("  O'Brien-Smith  ", 100), "O'Brien-Smith");
  assert.equal(textValue("Line 1\nLine 2", 100), "Line 1\nLine 2");
  assert.throws(() => textValue("   ", 100, true));
});

test("calendar dates reject impossible values, ordering blocks early due dates but permits backdating", () => {
  for (const value of ["0000-01-01", "2026-02-29", "2026-04-31", "10/24/2026", true]) assert.throws(() => isoDateValue(value));
  assert.equal(isoDateValue("2024-02-29").toISOString().slice(0, 10), "2024-02-29");
  assert.doesNotThrow(() => validateDueDate(isoDateValue("2001-01-01"), isoDateValue("2001-01-01")));
  assert.doesNotThrow(() => validateDueDate(isoDateValue("2001-01-01"), null));
  assert.throws(() => validateDueDate(isoDateValue("2026-10-24"), isoDateValue("2026-10-23")), /Due date/);
});

test("US currency formatting is explicit, grouping is checked and cents are not rounded", () => {
  assert.equal(currencyValue(" $1,234.56 ", "Cost"), 1234.56);
  assert.equal(amountValue("-$1,234.56"), "-1234.56");
  assert.equal(currencyValue("0", "Cost"), 0);
  assert.equal(amountValue("0", { required: true }), "0.00");
  assert.equal(amountValue(""), null);
  assert.throws(() => amountValue("", { required: true }));
  for (const value of ["$12,34.56", "1,23", "$1,234.567", "1.234,56", "1e3", true, {}]) assert.throws(() => currencyValue(value, "Cost"));
  assert.equal(normalizeCurrencyText("$1,234.56"), "1234.56");
  assert.equal(amountValue(String(MAX_BILL_AMOUNT), { required: true }), "9999999.99");
  assert.throws(() => amountValue("10000000", { required: true }));
  assert.doesNotThrow(() => assertMoneyRange([MAX_MONEY, -MAX_MONEY], "Total"));
  for (const value of [MAX_MONEY + 1, Infinity, NaN]) assert.throws(() => assertMoneyRange([value], "Total"));
  assert.throws(() => decimalValue(MAX_DECIMAL_4 + 1, "Quantity", 4));
});

test("generated template quantities are exact at four decimals or explicitly rejected", () => {
  assert.equal(scaledTemplateQuantity(0.005, 100_000, "Gravel"), 500);
  assert.equal(scaledTemplateQuantity(0.1, 0.2, "Component"), 0.02, "binary floating-point artifacts do not cause rejection");
  assert.equal(scaledTemplateQuantity(0.000001, 100, "Component"), 0.0001);
  assert.throws(() => scaledTemplateQuantity(0.000001, 1, "Gravel"), /Gravel.*four decimal/);
  assert.throws(() => scaledTemplateQuantity(0, 100, "Component"), /at least/);
  assert.throws(() => scaledTemplateQuantity(1, MAX_DECIMAL_6 + 1, "Component"));
  assert.throws(() => scaledTemplateQuantity(1, true, "Component"));
});

test("derived estimate totals cannot overflow even when each input is individually in range", () => {
  const input = { markupMode: "perLine", estimateMarkupPercent: 0, taxPercent: 0, roundingIncrement: 0,
    lines: [{ quantity: MAX_DECIMAL_4, unitCost: MAX_DECIMAL_4, freightAmount: 0, lineMarkupPercent: 0 }] };
  assert.throws(() => validateEstimateTotals(input), /Line 1.*range/);
  assert.doesNotThrow(() => validateEstimateTotals({ ...input, lines: [{ ...input.lines[0], quantity: 0.005, unitCost: 45.67 }] }));
});

test("email and invoice settings reject invalid types, overlength values and silent truncation", () => {
  assert.equal(emailValue(" test+tag@example.com "), "test+tag@example.com");
  assert.equal(emailValue(""), null);
  for (const value of ["invalid", "a @b.com", `${"a".repeat(250)}@b.com`, true]) assert.throws(() => emailValue(value));
  const input = { invoiceTitle: " INVOICE ", companyPhone: "2065550199", companyZip: "012345678",
    companyState: "Legacy region", showShippingAddress: false, nextInvoiceSequence: 42 };
  const parsed = parseInvoiceSettings(input);
  assert.equal(parsed.invoiceTitle, "INVOICE");
  assert.equal(parsed.companyPhone, "(206)555-0199");
  assert.equal(parsed.companyZip, "01234-5678");
  assert.equal(parsed.companyState, "Legacy region");
  assert.equal(parsed.showShippingAddress, false);
  for (const value of [[], null, { invoiceTitle: "x".repeat(65) }, { companyEmail: "bad" },
    { nextInvoiceSequence: 1.5 }, { showShippingAddress: "false" },
    { companyName: {} }, { accentColor: "red" }, { templateStyle: "unknown" }]) {
    assert.throws(() => parseInvoiceSettings(value));
  }
  assert.equal(parseInvoiceSettings({ invoiceTitle: " " }).invoiceTitle, undefined, "blank optional title retains the existing default");
  assert.throws(() => fieldValue("Contact name", () => textValue("", 100, true)),
    error => describeValidationError(error) === "Contact name: This field is required.");
});

test("duplicate suggestions ignore blank identifiers and match names/email/phone without enforcing uniqueness", () => {
  const base = { firstName: "Alex", lastName: "Smith", companyName: null, email: null, phone: null };
  assert.equal(sameInputText("", ""), false);
  assert.equal(sameInputText(" ACME  Builders ", "acme builders"), true);
  assert.equal(similarCustomer(base, { ...base }), true);
  assert.equal(similarCustomer(base, { ...base, firstName: "Other" }), false);
  assert.equal(similarCustomer({ ...base, email: "A@example.com" }, { ...base, firstName: "Other", email: "a@example.com" }), true);
  assert.equal(similarCustomer({ ...base, phone: "(206)555-0199" }, { ...base, firstName: "Other", phone: "2065550199" }), true);
});

test("US selector covers states, DC, territories, military and associated postal codes", () => {
  const codes = US_STATES.map(([code]) => code);
  assert.equal(new Set(codes).size, codes.length);
  for (const code of ["FL", "DC", "PR", "GU", "VI", "AS", "MP", "AA", "AE", "AP", "FM", "MH", "PW"]) assert.ok(codes.includes(code));
});
