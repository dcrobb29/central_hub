import assert from "node:assert/strict";
import { test } from "node:test";
import { billBalanceForRow, billSelectionIssue, searchAllocationBills } from "./bill-picker.ts";

const bill = (overrides = {}) => ({
  billId: "BILL01", billNo: "RENTAL", projectId: null, projectName: null,
  isSplit: false, allocatedProjectIds: [], readOnly: false, billDate: "2026-10-06",
  companyName: "Vendor A", amount: 100, allocatedAmount: 0, remainingAmount: 100, ...overrides,
});

test("fully unallocated and partially allocated bills are discoverable regardless of ownership", () => {
  const rows = [bill(), bill({ billId: "BILL02", projectId: 2, projectName: "Site B", allocatedAmount: 40, remainingAmount: 60 }),
    bill({ billId: "BILL03", isSplit: true, allocatedAmount: 100, remainingAmount: 0 })];
  assert.deepEqual(searchAllocationBills(rows, "").map((row) => row.billId), ["BILL01", "BILL02"]);
  assert.equal(billSelectionIssue(rows[0], 1), null);
  assert.match(billSelectionIssue(rows[1], 1), /Enable split mode/);
  assert.equal(billSelectionIssue({ ...rows[1], isSplit: true }, 1), null);
  assert.equal(billSelectionIssue(rows[1], 2), null);
});

test("search matches number, ID, vendor, date, job and multiple terms case-insensitively", () => {
  const rows = [bill({ projectId: 2, projectName: "Site B" })];
  for (const search of ["bill01", "rental", "VENDOR A", "2026-10", "site b", "rental vendor 2026"]) {
    assert.equal(searchAllocationBills(rows, search).length, 1);
  }
  assert.equal(searchAllocationBills(rows, "missing vendor").length, 0);
});

test("editing a fully allocated bill restores only the original row's balance", () => {
  const row = bill({ allocatedAmount: 100, remainingAmount: 0 });
  const original = { billId: row.billId, amount: 25.13 };
  assert.equal(searchAllocationBills([row], "", original).length, 1);
  assert.equal(billBalanceForRow(row, original), 25.13);
  assert.equal(billSelectionIssue(row, 1, original), null);
  assert.equal(billBalanceForRow(bill({ billId: "OTHER", remainingAmount: 10 }), original), 10);
  assert.match(billSelectionIssue(row, 1), /No unallocated/);
});

test("completion and invalid totals cannot be bypassed through bill selection", () => {
  assert.match(billSelectionIssue(bill({ projectId: 2, readOnly: true }), 1), /completed job/);
  assert.match(billSelectionIssue(bill({ amount: null, remainingAmount: null }), 1), /Correct the bill/);
  assert.equal(billSelectionIssue(bill({ isSplit: true, readOnly: true, remainingAmount: 50 }), 1), null);
});

test("zero-allocation assignment explains how to move without enabling split mode", () => {
  const assigned = bill({ projectId: 2, projectName: "Site B" });
  assert.match(billSelectionIssue(assigned, 1), /Project to Unassigned in Finances/);
  assert.equal(billSelectionIssue(assigned, 2), null);
  assert.equal(billSelectionIssue({ ...assigned, projectId: null }, 1), null);
  assert.match(billSelectionIssue({ ...assigned, allocatedProjectIds: [2] }, 1), /Enable split mode/);
  assert.match(billSelectionIssue({ ...assigned, readOnly: true }, 1), /completed job/);
});

test("search handles hundreds of bills without dropping late results", () => {
  const rows = Array.from({ length: 250 }, (_, index) => bill({ billId: `B${index}`, billNo: `NUMBER${index}` }));
  assert.equal(searchAllocationBills(rows, "").length, 250);
  assert.equal(searchAllocationBills(rows, "number249")[0].billId, "B249");
});
