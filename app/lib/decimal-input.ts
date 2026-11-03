export const MAX_DECIMAL_4 = Math.floor(Number.MAX_SAFE_INTEGER / 10_000);
export const MAX_DECIMAL_6 = Math.floor(Number.MAX_SAFE_INTEGER / 1_000_000);
export const MAX_MONEY = Math.floor(Number.MAX_SAFE_INTEGER / 100);
export const MAX_BILL_AMOUNT = 9_999_999.99;

export function normalizeCurrencyText(value: string): string {
  const text = value.trim();
  if (!/^-?\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?$/.test(text)) return value;
  return text.replace(/[$,]/g, "");
}

export function scaledTemplateQuantity(quantityPerUnit: number, units: number, label: string): number {
  decimalValue(quantityPerUnit, label, 6, 0, MAX_DECIMAL_6);
  decimalValue(units, "Template quantity", 6, 0.000001, MAX_DECIMAL_6);
  const fixed = (value: number) => {
    const [whole, fraction = ""] = String(value).split(".");
    return BigInt(whole) * BigInt(1_000_000) + BigInt(fraction.padEnd(6, "0"));
  };
  const product = fixed(quantityPerUnit) * fixed(units);
  if (product % BigInt(100_000_000) !== BigInt(0)) {
    throw new Error(`${label}: generated quantity exceeds four decimal places. Adjust the template component or application quantity; no rounding was applied.`);
  }
  const quantity = Number(product / BigInt(100_000_000)) / 10_000;
  return decimalValue(quantity, label, 4, 0.0001, MAX_DECIMAL_4);
}

export function assertMoneyRange(values: number[], label: string): void {
  if (values.some(value => !Number.isFinite(value) || Math.abs(value) > MAX_MONEY)) {
    throw new Error(`${label}: calculated amounts exceed the supported currency range (${MAX_MONEY}). Reduce the quantity, price, or markup.`);
  }
}

export function currencyValue(value: unknown, label: string, minimum = 0, maximum = MAX_DECIMAL_4): number {
  return decimalValue(typeof value === "string" ? normalizeCurrencyText(value) : value, label, 2, minimum, maximum);
}

export function normalizeDecimalText(value: string): string {
  const text = value.trim();
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return text;
  const sign = text.startsWith("-") ? "-" : "";
  const [whole, fraction] = text.replace(/^-/, "").split(".");
  const normalized = whole.replace(/^0+(?=\d)/, "") || "0";
  return `${sign}${normalized}${fraction === undefined || fraction === "" ? "" : `.${fraction}`}`;
}

export function decimalInputError(value: string, places: number, minimum?: number, maximum?: number): string {
  if (!value) return "";
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return "Enter a decimal number without scientific notation.";
  if ((value.split(".")[1]?.length ?? 0) > places) return `Use no more than ${places} decimal places.`;
  const number = Number(value);
  if (!Number.isFinite(number)) return "Enter a finite number.";
  if (minimum !== undefined && number < minimum) return `Enter a value of at least ${minimum}.`;
  if (maximum !== undefined && number > maximum) return `Enter a value no greater than ${maximum}.`;
  return "";
}

export function decimalValue(value: unknown, label: string, places: number, minimum = 0, maximum = MAX_DECIMAL_4): number {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") {
    throw new Error(`${label}: enter a decimal number.`);
  }
  const text = String(value).trim();
  const error = decimalInputError(text, places, minimum, maximum);
  if (error) throw new Error(`${label}: ${error}`);
  return Number(text);
}
