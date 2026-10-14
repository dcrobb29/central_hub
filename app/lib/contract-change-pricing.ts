import { calculateEstimate, type EstimatePricingInput } from "./estimate-pricing";

export type ChangeLineOperation = "Add" | "Deduct";
export function calculateChange(input: EstimatePricingInput & { lines: (EstimatePricingInput["lines"][number] & { operation: ChangeLineOperation })[] }) {
  const pricing = calculateEstimate({ ...input, markupMode: "perLine", roundingIncrement: 0,
    lines: input.lines.map(line=>({...line,lineMarkupPercent:input.markupMode==="estimate"?0:line.lineMarkupPercent})) });
  const lines = pricing.lines.map((line, index) => ({
    ...line,
    sellAmount: Math.round(line.sellAmount * (input.markupMode === "estimate" ? 1 + input.estimateMarkupPercent / 100 : 1) * 100) / 100,
    sign: input.lines[index].operation === "Add" ? 1 : -1,
  }));
  return {
    lines,
    quotedTotal: Math.round(lines.reduce((sum, line) => sum + line.sign * line.sellAmount, 0) * 100) / 100,
    landedCostTotal: Math.round(lines.reduce((sum, line) => sum + line.sign * line.landedCost, 0) * 100) / 100,
  };
}
