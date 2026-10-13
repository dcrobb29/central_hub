import assert from "node:assert/strict";
import { test } from "node:test";
import { allocateCents, billingCents, calculateBillingAllocations, selectionAmount } from "./project-billing-pricing.ts";

function unit() {
  return { unitId: 1, serviceVisitId: null, visitDate: null, recurrenceDate: null, status: "Upcoming", skipped: false,
    contractValue: 1000, billed: 0, scopes: [
      { scopeId: 11, scopeName: "A", sortOrder: 0, status: "Complete", contractValue: 600, billed: 0 },
      { scopeId: 12, scopeName: "B", sortOrder: 1, status: "Upcoming", contractValue: 400, billed: 0 },
    ] };
}
test("scope apportionment preserves all cents and is deterministic", () => {
  assert.deepEqual(allocateCents(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(allocateCents(1000, [6, 3, 1]), [600, 300, 100]);
  assert.deepEqual(allocateCents(0, [0, 0]), [0, 0]);
  assert.throws(() => allocateCents(100, [0, 0]), /no priced work/);
});
test("large allocations avoid floating-point multiplication errors", () => {
  const amounts = allocateCents(999_999_999_999, [123_456_789, 987_654_321]);
  assert.equal(amounts.reduce((sum, value) => sum + value, 0), 999_999_999_999);
});
test("percentages use original value rather than remaining", () => {
  assert.equal(selectionAmount(1000, 250, { kind: "Percentage", value: 25 }), 250);
  assert.equal(selectionAmount(1000, 250, { kind: "Full", value: null }), 750);
  assert.throws(() => selectionAmount(1000, 800, { kind: "Percentage", value: 25 }), /exceeds/);
});
test("parent invoice consumes the same scope balances", () => {
  const item = unit(); item.billed = 300; item.scopes[0].billed = 300;
  const result = calculateBillingAllocations([item], [{ unitId: 1, scopeId: null, kind: "Full", value: null }], "Scopes",false,true);
  assert.deepEqual(result, [{ unitId: 1, scopeId: 11, amount: 300 }, { unitId: 1, scopeId: 12, amount: 400 }]);
});
test("parent percentage spreads over remaining scope balances without rebilling", () => {
  const item = unit(); item.billed = 600; item.scopes[0].billed = 600;
  assert.deepEqual(calculateBillingAllocations([item], [{ unitId: 1, scopeId: null, kind: "Percentage", value: 25 }], "Scopes",false,true),
    [{ unitId: 1, scopeId: 12, amount: 250 }]);
});
test("parent and child cannot be selected together; duplicate scopes are rejected", () => {
  const parent = { unitId: 1, scopeId: null, kind: "Full", value: null };
  const scope = { unitId: 1, scopeId: 11, kind: "Full", value: null };
  assert.throws(() => calculateBillingAllocations([unit()], [parent, scope], "Scopes"), /not both/);
  assert.throws(() => calculateBillingAllocations([unit()], [scope, scope], "Scopes"), /twice/);
});
test("billing method restrictions apply to subsequent requests too", () => {
  assert.throws(() => calculateBillingAllocations([unit()], [{ unitId: 1, scopeId: 11, kind: "Full", value: null }], "Amount"), /method/);
  assert.throws(() => calculateBillingAllocations([unit()], [{ unitId: 1, scopeId: null, kind: "Amount", value: 1 }], "Percentage"), /method/);
  assert.throws(() => calculateBillingAllocations([unit()], [{ unitId: 1, scopeId: 11, kind: "Amount", value: 1 }], "Scopes"), /method/);
});
test("legacy reconciliation supports exact dollar scope allocations", () => {
  assert.deepEqual(calculateBillingAllocations([unit()], [{ unitId: 1, scopeId: 11, kind: "Amount", value: 123.45 }], "Scopes", true),
    [{ unitId: 1, scopeId: 11, amount: 123.45 }]);
});
test("invalid inputs and fully billed/skipped/foreign work fail explicitly", () => {
  for (const value of [0, -1, NaN, Infinity, 100.01]) assert.throws(() => selectionAmount(1000, 0, { kind: "Percentage", value }));
  for (const value of [0, -1, NaN, Infinity, 1.001]) assert.throws(() => selectionAmount(1000, 0, { kind: "Amount", value }));
  assert.throws(() => selectionAmount(1000, 1000, { kind: "Full", value: null }), /no billable/);
  assert.throws(() => calculateBillingAllocations([unit()], [], "Scopes"), /Select/);
  assert.throws(() => calculateBillingAllocations([unit()], [{ unitId: 2, scopeId: null, kind: "Full", value: null }], "Scopes"), /available/);
  assert.throws(() => calculateBillingAllocations([unit()], [{ unitId: 1, scopeId: 99, kind: "Full", value: null }], "Scopes"), /scope/);
  const skipped = unit(); skipped.skipped = true;
  assert.throws(() => calculateBillingAllocations([skipped], [{ unitId: 1, scopeId: null, kind: "Full", value: null }], "Scopes"), /available/);
});
test("cent-scale parent invoices stay under every remaining scope balance", () => {
  for (let total = 1; total <= 100; total++) {
    const result = allocateCents(total, [1, 32, 67]);
    assert.equal(result.reduce((sum, value) => sum + value, 0), total);
    result.forEach((value, index) => assert.ok(value <= [1, 32, 67][index]));
  }
});
test("separate recurring occurrences each retain the full original contract", () => {
  const a = unit(); a.unitId = 1; a.scopes[0].scopeId = 11; a.scopes[1].scopeId = 12;
  const b = unit(); b.unitId = 2; b.scopes[0].scopeId = 21; b.scopes[1].scopeId = 22;
  const result = calculateBillingAllocations([a, b], [{ unitId: 1, scopeId: null, kind: "Full", value: null },
    { unitId: 2, scopeId: null, kind: "Full", value: null }], "Scopes",false,true);
  assert.equal(result.reduce((sum, row) => sum + billingCents(row.amount), 0), 200_000);
});
test("without override parent full bills completed scopes only",()=>{
  const result=calculateBillingAllocations([unit()],[{unitId:1,scopeId:null,kind:"Full",value:null}],"Scopes");
  assert.deepEqual(result,[{unitId:1,scopeId:11,amount:600}]);
});
test("amount and percentage use completed balances without leaking allocations into upcoming scopes",()=>{
  for(const [method,kind,value] of [["Amount","Amount",300],["Percentage","Percentage",30]]) {
    const selection={unitId:1,scopeId:null,kind,value};
    assert.deepEqual(calculateBillingAllocations([unit()],[selection],method),[{unitId:1,scopeId:11,amount:300}]);
    assert.throws(()=>calculateBillingAllocations([unit()],[{...selection,value:method==="Amount"?700:70}],method),/Include incomplete work/);
  }
});
test("incomplete scopes need explicit override and still cannot exceed contract",()=>{
  const selection={unitId:1,scopeId:12,kind:"Full",value:null};
  assert.throws(()=>calculateBillingAllocations([unit()],[selection],"Scopes"),/Include incomplete work/);
  assert.deepEqual(calculateBillingAllocations([unit()],[selection],"Scopes",false,true),[{unitId:1,scopeId:12,amount:400}]);
  assert.throws(()=>calculateBillingAllocations([unit()],[{unitId:1,scopeId:null,kind:"Amount",value:1001}],"Amount",false,true),/exceeds/);
});
