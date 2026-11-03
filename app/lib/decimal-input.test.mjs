import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("./") && !/\.[a-z]+$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});
const { decimalInputError, decimalValue, normalizeDecimalText } = await import("./decimal-input.ts");
const { formatPhone, formatZip, phoneValue, zipValue } = await import("./contact-input.ts");
const { amountValue } = await import("./validation.ts");
const { calculateEstimate } = await import("./estimate-pricing.ts");

test("currency entries reject excess precision and scientific notation without rounding", () => {
  for (const input of ["12.345", "1e3", "NaN", "Infinity", {}, true]) {
    assert.throws(() => decimalValue(input, "Cost", 2));
  }
  assert.equal(decimalValue("00045.67", "Cost", 2), 45.67);
  assert.equal(decimalValue(".01", "Cost", 2), 0.01);
  assert.throws(() => amountValue("12.345", { required: true }));
  assert.throws(() => amountValue("1e3", { required: true }));
  assert.equal(amountValue("00045.60"), "45.60");
});

test("tax accepts four decimals in the inclusive 0 to 100 range", () => {
  for (const value of [0, 100, 8.875, 8.1234]) assert.equal(decimalValue(value, "Tax", 4, 0, 100), value);
  for (const value of [-0.1, 100.0001, 8.12345]) assert.throws(() => decimalValue(value, "Tax", 4, 0, 100));
});

test("normalization strips leading zeros without changing fractional quantities", () => {
  for (const [input, output] of [["045", "45"], ["000.005", "0.005"], [".005", "0.005"], ["000002", "2"], ["000", "0"]]) {
    assert.equal(normalizeDecimalText(input), output);
  }
  assert.equal(decimalInputError("12.345", 2), "Use no more than 2 decimal places.");
  assert.equal(decimalInputError("0.005", 6), "");
});

test("US phones format progressively and ZIP+4 preserves leading zeros", () => {
  assert.equal(formatPhone("206"), "(206");
  assert.equal(formatPhone("206555"), "(206)555");
  assert.equal(phoneValue("2065550199"), "(206)555-0199");
  assert.equal(phoneValue("+1 (206) 555-0199"), "(206)555-0199");
  assert.equal(formatZip("012345678"), "01234-5678");
  assert.equal(zipValue("01234"), "01234");
  assert.equal(zipValue("012345678"), "01234-5678");
  for (const value of ["1234", "123456", "ABC"]) assert.throws(() => zipValue(value));
  for (const value of ["123", "20655501999", "not a phone"]) assert.throws(() => phoneValue(value));
  assert.equal(phoneValue(""), null);
  assert.equal(zipValue(""), null);
});

test("small component quantities scale before the line total is rounded to cents", () => {
  const pricing = calculateEstimate({
    markupMode: "perLine", estimateMarkupPercent: 0, taxPercent: 0, roundingIncrement: 0,
    lines: [{ quantity: 0.005 * 100_000, unitCost: 45.67, freightAmount: 0, lineMarkupPercent: 0 }],
  });

  assert.equal(pricing.quotedTotal, 22_835);
  assert.notEqual(pricing.quotedTotal, Math.round(0.005 * 45.67 * 100) / 100 * 100_000);
});

test("ZIP hyphen follows the digit count when deleting and retyping", () => {
  let text = formatZip("012345");
  assert.equal(text, "01234-5");
  text = formatZip(text.slice(0, -1));
  assert.equal(text, "01234");
  text = formatZip(text.slice(0, -1));
  assert.equal(text, "0123");
  text = formatZip(`${text}4`);
  assert.equal(text, "01234");
  assert.equal(formatZip(`${text}5`), "01234-5");
  assert.equal(formatZip(""), "");
  assert.equal(formatZip("01234-5678"), "01234-5678");
  for (const value of ["012-345", "0123456789", "01234--5678", "01234-ABCD"]) {
    assert.equal(formatZip(value), value, "invalid input is not silently repaired");
    assert.throws(() => zipValue(value));
  }
});
