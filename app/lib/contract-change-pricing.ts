import { calculateEstimate, type EstimatePricingInput } from "./estimate-pricing";
import { allocateCents, billingCents } from "./project-billing-pricing";

export type ChangeLineOperation = "Add" | "Deduct";
export function allocateEstimateLineValues(input: Omit<EstimatePricingInput, "lines"> & {
  lines: (EstimatePricingInput["lines"][number] & { scopeName: string | null })[];
}) {
  const pricing = calculateEstimate(input);
  const groups = [...new Set(input.lines.map(line => line.scopeName))];
  const weights = groups.map(scope => input.lines.reduce((sum, line, index) =>
    sum + (line.scopeName === scope ? billingCents(pricing.lines[index].sellAmount) : 0), 0));
  const groupAmounts = allocateCents(billingCents(pricing.quotedTotal), weights);
  const values = pricing.lines.map(line => ({ sellAmount: 0, landedAmount: line.landedCost }));
  groups.forEach((scope, groupIndex) => {
    const indexes = input.lines.flatMap((line, index) => line.scopeName === scope ? [index] : []);
    const amounts = allocateCents(groupAmounts[groupIndex], indexes.map(index => billingCents(pricing.lines[index].sellAmount)));
    indexes.forEach((index, offset) => { values[index].sellAmount = amounts[offset] / 100; });
  });
  return values;
}
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
