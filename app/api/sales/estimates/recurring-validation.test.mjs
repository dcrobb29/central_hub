import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/app/lib/")) {
      return nextResolve(new URL(`../../../lib/${specifier.slice("@/app/lib/".length)}.ts`, import.meta.url).href, context);
    }
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    return nextResolve(specifier, context);
  },
});

const { parseEstimate } = await import("./route.ts");
const input = {
  estimateName: "Recurring validation test",
  engagementType: "Service",
  recurrenceFrequency: "Weekly",
  expectedStartDate: "2026-10-07",
  expectedEndDate: "2026-10-21",
  markupMode: "perLine",
  groupingMode: "None",
  scopes: [],
  lines: [{ description: "General work", unitName: "HR", quantity: 1, unitCost: 10, lineType: "Labor" }],
};

test("recurring estimates require a real end date no earlier than their start", () => {
  for (const expectedEndDate of [undefined, null, "", "2026-02-30", "2026-10-06"]) {
    assert.throws(() => parseEstimate({ ...input, expectedEndDate }), /end date/);
  }
  assert.equal(parseEstimate(input).expectedEndDate, "2026-10-21");
});

test("one-time projects still do not require recurrence dates", () => {
  const parsed = parseEstimate({ ...input, engagementType: "Project", expectedStartDate: null, expectedEndDate: null });
  assert.equal(parsed.expectedStartDate, null);
  assert.equal(parsed.expectedEndDate, null);
  assert.equal(parsed.recurrenceFrequency, null);
});
