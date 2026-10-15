import type { ChangeInput, ChangeSourceLine, InitialAlternateInput } from "./contract-changes";
import type { CreateEstimateInput, EstimateLineInput } from "./estimates";
import { allocateEstimateLineValues } from "./contract-change-pricing";

export type EstimateLineDraft = EstimateLineInput & { draftLineId: number };

export function draftAlternateSources(input: Pick<CreateEstimateInput, "markupMode" | "estimateMarkupPercent" | "taxPercent" | "roundingIncrement" | "groupingMode"> & {
  lines: EstimateLineDraft[];
}): ChangeSourceLine[] {
  const lines = input.lines.map(line => ({ ...line, scopeName: input.groupingMode === "Scope" ? line.scopeName : null }));
  const values = allocateEstimateLineValues({ ...input, lines });
  return lines.map((line, index) => ({
    ...line, ...values[index], lineId: line.draftLineId, revisionId: 0,
    originalQuantity: line.quantity, remainingQuantity: line.quantity,
    deductedSell: 0, deductedLanded: 0, scopeId: null, taxPercent: input.taxPercent,
  }));
}

export function initialAlternateInputs(alternates: ChangeInput[], baseLines: EstimateLineDraft[]): InitialAlternateInput[] {
  return alternates.map((alternate, index) => ({
    ...alternate,
    scopes: [...new Set(alternate.lines.map(line => line.scopeName?.trim() ?? "").filter(Boolean))],
    lines: alternate.lines.map(line => {
      const target = baseLines.findIndex(base => base.draftLineId === line.deductLineId);
      if (line.operation === "Deduct" && target < 0)
        throw new Error(`Alternate ${index + 1}: choose an existing base-bid line for each deduction.`);
      return { ...line, scopeName: line.scopeName?.trim() || null, deductLineIndex: line.operation === "Deduct" ? target : null };
    }),
  }));
}
