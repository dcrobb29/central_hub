import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "./validation") return nextResolve(new URL("./validation.ts", import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
});
const { actualCostTotal, matchingQuantity, parseProjectCost } = await import("./project-cost-pricing.ts");
const input = {
  projectId: 1, billId: "GRAVEL1", estimateLineItemId: 2,
  description: "Delivery 1", costDate: "2026-10-05",
  quantity: 10, unitName: "TON", unitCost: 7.8, freightAmount: 200, taxAmount: 4.13,
};

test("phased deliveries use actual price, freight, and manual tax instead of quoted values", () => {
  assert.equal(actualCostTotal(parseProjectCost(input)), 282.13);
  const next = { ...input, quantity: 5, unitCost: 8.1, freightAmount: 200, taxAmount: 2.15 };
  assert.equal(actualCostTotal(parseProjectCost(next)), 242.65);
  assert.equal(actualCostTotal(input) + actualCostTotal(next), 524.78);
  assert.equal(actualCostTotal({ ...input, taxAmount: 0 }), 278);
});

test("half-cent rounding matches decimal storage rather than binary multiplication", () => {
  assert.equal(actualCostTotal({ quantity: 1, unitCost: 1.005, freightAmount: 0, taxAmount: 0 }), 1.01);
  assert.equal(actualCostTotal({ quantity: 100, unitCost: 0.0001, freightAmount: 0, taxAmount: 0 }), 0.01);
});

test("quantity comparison excludes mismatched units without dropping actual costs", () => {
  assert.deepEqual(matchingQuantity([{ quantity: 10, unitName: "ton" }, { quantity: 5, unitName: "TON " }, { quantity: 2, unitName: "EA" }], "TON"), { quantity: 15, hasOtherUnits: true });
  assert.deepEqual(matchingQuantity([], "TON"), { quantity: 0, hasOtherUnits: false });
});

test("unexpected costs are valid but still require a bill and positive total", () => {
  assert.equal(parseProjectCost({ ...input, estimateLineItemId: null }).estimateLineItemId, null);
  for (const overrides of [
    { billId: "" }, { projectId: "1" }, { estimateLineItemId: undefined },
    { quantity: 0 }, { quantity: -1 }, { quantity: 1.00001 }, { unitCost: -1 },
    { freightAmount: 0.001 }, { taxAmount: -1 }, { taxAmount: "4.13" },
    { costDate: "2026-02-30" }, { costDate: "0000-01-01" },
    { unitName: "" }, { description: "" }, { quantity: 1, unitCost: 0, freightAmount: 0, taxAmount: 0 },
  ]) assert.throws(() => parseProjectCost({ ...input, ...overrides }));
});
