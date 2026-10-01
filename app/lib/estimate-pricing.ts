export type EstimateMarkupMode = "perLine" | "estimate";

export type EstimatePricingLine = {
  quantity: number;
  unitCost: number;
  freightAmount: number;
  lineMarkupPercent: number;
};

export type EstimatePricingInput = {
  markupMode: EstimateMarkupMode;
  estimateMarkupPercent: number;
  taxPercent: number;
  roundingIncrement: number;
  lines: EstimatePricingLine[];
};

export type EstimateLinePricingResult = {
  baseCost: number;
  freightAmount: number;
  taxAmount: number;
  landedCost: number;
  markupAmount: number;
  sellAmount: number;
};

export type EstimatePricingResult = {
  baseSubtotal: number;
  freightTotal: number;
  taxTotal: number;
  landedCostTotal: number;
  markupAmount: number;
  totalBeforeRounding: number;
  quotedTotal: number;
  lines: EstimateLinePricingResult[];
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// Tax and freight are real costs the company absorbs (sales tax paid to vendors, vendor-quoted
// freight), folded into each line's cost before markup. Neither is ever broken out separately
// on a customer-facing export — the customer only ever sees sell prices or a final total.
export function calculateEstimate(input: EstimatePricingInput): EstimatePricingResult {
  const lineResults: EstimateLinePricingResult[] = input.lines.map((line) => {
    const baseCost = roundMoney(line.quantity * line.unitCost);
    const freightAmount = roundMoney(line.freightAmount);
    const costWithFreight = baseCost + freightAmount;
    const taxAmount = roundMoney(costWithFreight * input.taxPercent / 100);
    const landedCost = roundMoney(costWithFreight + taxAmount);
    const markupAmount = input.markupMode === "perLine"
      ? roundMoney(landedCost * line.lineMarkupPercent / 100)
      : 0;
    return { baseCost, freightAmount, taxAmount, landedCost, markupAmount, sellAmount: roundMoney(landedCost + markupAmount) };
  });

  const baseSubtotal = roundMoney(lineResults.reduce((sum, line) => sum + line.baseCost, 0));
  const freightTotal = roundMoney(lineResults.reduce((sum, line) => sum + line.freightAmount, 0));
  const taxTotal = roundMoney(lineResults.reduce((sum, line) => sum + line.taxAmount, 0));
  const landedCostTotal = roundMoney(lineResults.reduce((sum, line) => sum + line.landedCost, 0));
  const markupAmount = input.markupMode === "perLine"
    ? roundMoney(lineResults.reduce((sum, line) => sum + line.markupAmount, 0))
    : roundMoney(landedCostTotal * input.estimateMarkupPercent / 100);
  const totalBeforeRounding = roundMoney(landedCostTotal + markupAmount);
  const quotedTotal = input.roundingIncrement > 0
    ? roundMoney(Math.round(totalBeforeRounding / input.roundingIncrement) * input.roundingIncrement)
    : totalBeforeRounding;

  return {
    baseSubtotal,
    freightTotal,
    taxTotal,
    landedCostTotal,
    markupAmount,
    totalBeforeRounding,
    quotedTotal,
    lines: lineResults,
  };
}

