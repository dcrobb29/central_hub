export type EstimateMarkupMode = "perLine" | "estimate";

export type EstimatePricingLine = {
  quantity: number;
  unitCost: number;
  lineMarkupPercent: number;
};

export type EstimatePricingInput = {
  markupMode: EstimateMarkupMode;
  estimateMarkupPercent: number;
  taxAmount: number;
  freightAmount: number;
  roundingIncrement: number;
  lines: EstimatePricingLine[];
};

export type EstimatePricingResult = {
  baseSubtotal: number;
  markupAmount: number;
  taxAmount: number;
  freightAmount: number;
  totalBeforeRounding: number;
  quotedTotal: number;
  lines: { extendedCost: number; markupAmount: number; sellAmount: number }[];
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateEstimate(input: EstimatePricingInput): EstimatePricingResult {
  const lineResults = input.lines.map((line) => {
    const extendedCost = roundMoney(line.quantity * line.unitCost);
    const markupAmount = input.markupMode === "perLine"
      ? roundMoney(extendedCost * line.lineMarkupPercent / 100)
      : 0;
    return { extendedCost, markupAmount, sellAmount: roundMoney(extendedCost + markupAmount) };
  });

  const baseSubtotal = roundMoney(lineResults.reduce((sum, line) => sum + line.extendedCost, 0));
  const markupAmount = input.markupMode === "perLine"
    ? roundMoney(lineResults.reduce((sum, line) => sum + line.markupAmount, 0))
    : roundMoney(baseSubtotal * input.estimateMarkupPercent / 100);
  const taxAmount = roundMoney(input.taxAmount);
  const freightAmount = roundMoney(input.freightAmount);
  const totalBeforeRounding = roundMoney(baseSubtotal + markupAmount + taxAmount + freightAmount);
  const quotedTotal = input.roundingIncrement > 0
    ? roundMoney(Math.round(totalBeforeRounding / input.roundingIncrement) * input.roundingIncrement)
    : totalBeforeRounding;

  return {
    baseSubtotal,
    markupAmount,
    taxAmount,
    freightAmount,
    totalBeforeRounding,
    quotedTotal,
    lines: lineResults,
  };
}
