import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import sql from "mssql";
import nextEnv from "@next/env";

const enabled = process.env.RUN_DB_TESTS === "1";
let libraries;
let facade;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/app/lib/")) return nextResolve(new URL(`./${specifier.slice("@/app/lib/".length)}.ts`, import.meta.url).href, context);
    if (specifier === "./validation") return nextResolve(new URL("./validation.ts", import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === new URL("./db.ts", import.meta.url).href) return {
      format: "module", shortCircuit: true,
      source: "export const getPool = () => globalThis.projectCostTestDb.getPool(); export const sql = globalThis.projectCostTestDb.sql;",
    };
    return nextLoad(url, context);
  },
});

async function fixture(run) {
  nextEnv.loadEnvConfig(process.cwd());
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_SERVER, port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    options: { encrypt: process.env.DB_ENCRYPT !== "false", trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === "true" },
  }).connect();
  const tx = new sql.Transaction(pool);
  let rolledBack = false;
  tx.on("rollback", () => { rolledBack = true; });
  await tx.begin();
  facade = { request: () => tx.request(), begin: async () => {}, commit: async () => {}, rollback: async () => {} };
  globalThis.projectCostTestDb = {
    getPool: async () => facade,
    sql: { ...sql, Transaction: class { constructor() { return facade; } } },
  };
  libraries ??= {
    costs: await import("./project-costs.ts"),
    projects: await import("./projects.ts"),
    bills: await import("./bills.ts"),
  };
  try {
    const result = await tx.request().query(`
      INSERT INTO dbo.Estimates (EstimateName) VALUES (N'Project cost integration fixture');
      DECLARE @estimateId int = SCOPE_IDENTITY();
      INSERT INTO dbo.EstimateRevisions (EstimateID, RevisionNumber, MarkupMode, GroupingMode, EstimateMarkupPercent, TaxPercent, RoundingIncrement, QuotedTotal)
      VALUES (@estimateId, 1, 'perLine', 'None', 0, 5.3, 0, 1053);
      DECLARE @revisionId int = SCOPE_IDENTITY();
      INSERT INTO dbo.EstimateLineItems (EstimateRevisionID, LineNumber, Description, Quantity, UnitName, UnitCost, LineType, FreightAmount, LineMarkupPercent)
      VALUES (@revisionId, 1, N'Gravel', 50, 'TON', 8, 'Material', 600, 0);
      DECLARE @lineId int = SCOPE_IDENTITY();
      INSERT INTO dbo.Projects (ProjectName, AcceptedEstimateRevisionID) VALUES (N'Project cost integration fixture', @revisionId);
      DECLARE @projectId int = SCOPE_IDENTITY();
      INSERT INTO dbo.Bills (id, ProjectID, [Bill No], [Bill Date], [Bill Amount])
      VALUES ('COSTTEST01', @projectId, 'TEST01', '2026-10-05', '600.00');
      INSERT INTO dbo.Invoices (ProjectID, [Invoice No], [Invoice Date], [Invoice Due Date], [Invoice Amount])
      VALUES (@projectId, 'COSTTEST', '2026-10-05', '2026-11-05', '900.00');
      SELECT @projectId AS projectId, @lineId AS lineId;
    `);
    await run({ tx, ...result.recordset[0], ...libraries });
  } finally {
    if (!rolledBack) await tx.rollback();
    await pool.close();
  }
}

const input = (projectId, lineId, overrides = {}) => ({
  projectId, billId: "COSTTEST01", estimateLineItemId: lineId,
  description: "First delivery", costDate: "2026-10-05",
  quantity: 10, unitName: "TON", unitCost: 7.8, freightAmount: 200, taxAmount: 4.13,
  ...overrides,
});

test("phased actuals reconcile bills, preserve revenue, and reallocate without duplication", { skip: !enabled }, async () => fixture(async ({ costs, projects, projectId, lineId }) => {
  const first = await costs.saveProjectBillCost(input(projectId, lineId));
  const second = await costs.saveProjectBillCost(input(projectId, null, { quantity: 5, unitCost: 8.1, taxAmount: 2.15 }));
  let allocations = await costs.getAllocationBills();
  let bill = allocations.find((bill) => bill.billId === "COSTTEST01");
  assert.equal(bill.allocatedAmount, 524.78);
  assert.equal(bill.remainingAmount, 75.22);
  const financials = (await projects.getProjectFinancialSummary()).find((project) => project.projectId === projectId);
  assert.equal(financials.costs, 600);
  assert.equal(financials.income, 900);
  await assert.rejects(() => costs.saveProjectBillCost(input(projectId, lineId, { unitCost: 10, freightAmount: 0, taxAmount: 0 })), /exceed the bill total/);
  await assert.rejects(() => costs.saveProjectBillCost(input(projectId, 2_147_483_647)), /accepted estimate/);
  await assert.rejects(() => costs.saveProjectBillCost(input(projectId, lineId, { billId: "MISSING" })), /no longer exists/);
  await costs.saveProjectBillCost(input(projectId, lineId, { quantity: 5, unitCost: 8.1, taxAmount: 2.15 }), second);
  const rows = (await costs.getProjectBillCosts()).filter((cost) => cost.projectId === projectId);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((cost) => cost.estimateLineItemId === lineId));
  assert.equal((await costs.getAllocationBills()).find((bill) => bill.billId === "COSTTEST01").allocatedAmount, 524.78);
  await costs.removeProjectBillCost(projectId, first);
  bill = (await costs.getAllocationBills()).find((bill) => bill.billId === "COSTTEST01");
  assert.equal(bill.allocatedAmount, 242.65);
  assert.equal(bill.remainingAmount, 357.35);
  assert.equal((await projects.getProjectFinancialSummary()).find((project) => project.projectId === projectId).costs, 600);
  const halfCent = await costs.saveProjectBillCost(input(projectId, lineId, { quantity: 1, unitCost: 1.005, freightAmount: 0, taxAmount: 0 }));
  assert.equal((await costs.getProjectBillCosts()).find((cost) => cost.costId === halfCent).amount, 1.01);
}));

test("bill total cannot be reduced below allocated actual costs", { skip: !enabled }, async () => fixture(async ({ tx, costs, projectId, lineId }) => {
  await costs.saveProjectBillCost(input(projectId, lineId));
  await assert.rejects(() => tx.request().query("UPDATE dbo.Bills SET [Bill Amount] = '100.00' WHERE id = 'COSTTEST01'"), (error) => error.number === 51022);
}));

test("unassigned bill attaches on save and the last removal releases it for another job", { skip: !enabled }, async () => fixture(async ({ tx, costs, projects, projectId, lineId }) => {
  await tx.request().query("UPDATE dbo.Bills SET ProjectID = NULL WHERE id = 'COSTTEST01'");
  const bill = async () => (await costs.getAllocationBills()).find((item) => item.billId === "COSTTEST01");
  assert.equal((await bill()).projectId, null);
  await assert.rejects(() => costs.saveProjectBillCost(input(projectId, 2_147_483_647)), /accepted estimate/);
  await assert.rejects(() => costs.saveProjectBillCost(input(projectId, lineId, { quantity: 100 })), /exceed the bill total/);
  assert.equal((await bill()).projectId, null);
  const first = await costs.saveProjectBillCost(input(projectId, lineId));
  assert.equal((await bill()).projectId, projectId);
  const second = await costs.saveProjectBillCost(input(projectId, null, { quantity: 5, unitCost: 8.1, taxAmount: 2.15 }));
  assert.equal((await bill()).allocatedAmount, 524.78);
  assert.equal((await projects.getProjectFinancialSummary()).find((item) => item.projectId === projectId).costs, 600);
  const otherProjectId = await projects.createProject("Other bill allocation fixture");
  await assert.rejects(() => costs.saveProjectBillCost(input(otherProjectId, null)), /already assigned to another job/);
  assert.equal((await bill()).projectId, projectId);
  await costs.removeProjectBillCost(projectId, first);
  assert.equal((await bill()).projectId, projectId);
  assert.equal((await projects.getProjectFinancialSummary()).find((item) => item.projectId === projectId).costs, 600);
  await costs.removeProjectBillCost(projectId, second);
  assert.equal((await bill()).allocatedAmount, 0);
  assert.equal((await bill()).projectId, null);
  assert.equal((await bill()).isSplit, false);
  assert.equal((await projects.getProjectFinancialSummary()).find((item) => item.projectId === projectId).costs, 0);
  assert.equal((await projects.getProjectFinancialSummary()).find((item) => item.projectId === projectId).income, 900);
  await costs.saveProjectBillCost(input(otherProjectId, null));
  assert.equal((await bill()).projectId, otherProjectId);
  assert.equal((await bill()).isSplit, false);
  assert.equal((await projects.getProjectFinancialSummary()).find((item) => item.projectId === otherProjectId).costs, 600);
}));

test("moving allocations releases only the emptied old bill and failed moves preserve ownership", { skip: !enabled }, async () => fixture(async ({ tx, costs, projects, projectId, lineId }) => {
  await tx.request().query(`
    INSERT INTO dbo.Bills (id, [Bill No], [Bill Date], [Bill Amount])
    VALUES ('COSTTEST02', 'TEST02', '2026-10-05', '700.00')
  `);
  const first = await costs.saveProjectBillCost(input(projectId, lineId));
  const second = await costs.saveProjectBillCost(input(projectId, null, { quantity: 1, unitCost: 20, freightAmount: 0, taxAmount: 0 }));
  const bill = async (id) => (await costs.getAllocationBills()).find((item) => item.billId === id);
  await assert.rejects(() => costs.saveProjectBillCost(input(projectId, lineId, { billId: "COSTTEST02", quantity: 100 }), first), /exceed the bill total/);
  assert.equal((await bill("COSTTEST01")).projectId, projectId);
  assert.equal((await bill("COSTTEST02")).projectId, null);
  await costs.saveProjectBillCost(input(projectId, lineId), first);
  assert.equal((await bill("COSTTEST01")).projectId, projectId);
  await costs.saveProjectBillCost(input(projectId, lineId, { billId: "COSTTEST02" }), first);
  assert.equal((await bill("COSTTEST01")).projectId, projectId);
  assert.equal((await bill("COSTTEST02")).projectId, projectId);
  await costs.saveProjectBillCost(input(projectId, null, { billId: "COSTTEST02", quantity: 1, unitCost: 20, freightAmount: 0, taxAmount: 0 }), second);
  assert.equal((await bill("COSTTEST01")).projectId, null);
  assert.equal((await bill("COSTTEST01")).allocatedAmount, 0);
  assert.equal((await bill("COSTTEST02")).projectId, projectId);
  assert.equal((await projects.getProjectFinancialSummary()).find((item) => item.projectId === projectId).costs, 700);
}));

test("last removal keeps split mode and completed jobs cannot release their bills", { skip: !enabled }, async () => fixture(async ({ bills, costs, projects, projectId, lineId }) => {
  const first = await costs.saveProjectBillCost(input(projectId, lineId));
  await assert.rejects(() => costs.removeProjectBillCost(projectId, 2_147_483_647), /no longer exists/);
  await projects.updateProjectStatus(projectId, "Complete");
  await assert.rejects(() => costs.removeProjectBillCost(projectId, first), /Complete and read-only/);
  await assert.rejects(() => costs.saveProjectBillCost(input(projectId, lineId), first), /Complete and read-only/);
  let bill = (await costs.getAllocationBills()).find((item) => item.billId === "COSTTEST01");
  assert.equal(bill.projectId, projectId);
  assert.equal(bill.allocatedAmount, 282.13);
  await projects.updateProjectStatus(projectId, "Active");
  await bills.setBillSplitMode("COSTTEST01", true);
  await costs.removeProjectBillCost(projectId, first);
  bill = (await costs.getAllocationBills()).find((item) => item.billId === "COSTTEST01");
  assert.equal(bill.isSplit, true);
  assert.equal(bill.projectId, null);
  assert.equal(bill.allocatedAmount, 0);
}));

test("completed job cannot claim an unassigned bill", { skip: !enabled }, async () => fixture(async ({ tx, costs, projects, projectId, lineId }) => {
  await tx.request().query("UPDATE dbo.Bills SET ProjectID = NULL WHERE id = 'COSTTEST01'");
  await projects.updateProjectStatus(projectId, "Complete");
  await assert.rejects(() => costs.saveProjectBillCost(input(projectId, lineId)), /Complete and read-only/);
  assert.equal((await costs.getAllocationBills()).find((item) => item.billId === "COSTTEST01").projectId, null);
}));

test("bill project cannot change while active actual costs reference it", { skip: !enabled }, async () => fixture(async ({ tx, costs, projectId, lineId }) => {
  await costs.saveProjectBillCost(input(projectId, lineId));
  await assert.rejects(() => tx.request().query("UPDATE dbo.Bills SET ProjectID = NULL WHERE id = 'COSTTEST01'"), (error) => error.number === 51021);
}));

test("split bills distribute only allocations across jobs and track paid costs without double counting", { skip: !enabled }, async () => fixture(async ({ tx, costs, bills, projects, projectId, lineId }) => {
  const first = await costs.saveProjectBillCost(input(projectId, lineId));
  assert.equal((await projects.getProjectFinancialSummary()).find((p) => p.projectId === projectId).costs, 600);
  await bills.setBillSplitMode("COSTTEST01", true);
  const otherId = await projects.createProject("Split rental site B fixture");
  const thirdId = await projects.createProject("Split rental site C fixture");
  const second = await costs.saveProjectBillCost(input(otherId, null, { quantity: 1, unitCost: 200, freightAmount: 0, taxAmount: 0 }));
  await costs.saveProjectBillCost(input(thirdId, null, { quantity: 1, unitCost: 50, freightAmount: 0, taxAmount: 0 }));
  const shared = (await costs.getAllocationBills()).find((b) => b.billId === "COSTTEST01");
  assert.equal(shared.isSplit, true);
  assert.equal(shared.projectId, null);
  assert.deepEqual(shared.allocatedProjectIds.sort((a, b) => a - b), [projectId, otherId, thirdId]);
  assert.equal(shared.allocatedAmount, 532.13);
  assert.equal(shared.remainingAmount, 67.87);
  let summaries = await projects.getProjectFinancialSummary();
  assert.equal(summaries.find((p) => p.projectId === projectId).costs, 282.13);
  assert.equal(summaries.find((p) => p.projectId === otherId).costs, 200);
  assert.equal(summaries.find((p) => p.projectId === thirdId).costs, 50);
  assert.equal(summaries.find((p) => p.projectId === projectId).income, 900);
  await assert.rejects(() => costs.saveProjectBillCost(input(otherId, null, { quantity: 1, unitCost: 68, freightAmount: 0, taxAmount: 0 })), /exceed the bill total/);
  await assert.rejects(() => bills.setBillSplitMode("COSTTEST01", false), /multiple jobs/);
  await tx.request().query("UPDATE dbo.Bills SET [Bill Paid Date] = '2026-10-06' WHERE id = 'COSTTEST01'");
  summaries = await projects.getProjectFinancialSummary();
  assert.equal(summaries.find((p) => p.projectId === otherId).paidCosts, 200);
  assert.equal(summaries.find((p) => p.projectId === otherId).unpaidCosts, 0);
  await costs.removeProjectBillCost(otherId, second);
  assert.equal((await projects.getProjectFinancialSummary()).find((p) => p.projectId === otherId).costs, 0);
  await costs.removeProjectBillCost(projectId, first);
  await bills.setBillSplitMode("COSTTEST01", false);
  const single = (await costs.getAllocationBills()).find((b) => b.billId === "COSTTEST01");
  assert.equal(single.projectId, thirdId);
  assert.equal(single.isSplit, false);
  assert.equal((await projects.getProjectFinancialSummary()).find((p) => p.projectId === thirdId).costs, 600);
}));

test("empty split bill can return to unassigned single-job mode", { skip: !enabled }, async () => fixture(async ({ bills, costs }) => {
  await bills.setBillSplitMode("COSTTEST01", true);
  await bills.setBillSplitMode("COSTTEST01", false);
  const bill = (await costs.getAllocationBills()).find((b) => b.billId === "COSTTEST01");
  assert.equal(bill.isSplit, false);
  assert.equal(bill.projectId, null);
}));

test("shared bill with completed allocation disables bill editing but permits other jobs to use its balance", { skip: !enabled }, async () => fixture(async ({ bills, costs, projects, projectId, lineId }) => {
  await bills.setBillSplitMode("COSTTEST01", true);
  await costs.saveProjectBillCost(input(projectId, lineId));
  await projects.updateProjectStatus(projectId, "Complete");
  const otherId = await projects.createProject("Shared rental active fixture");
  await costs.saveProjectBillCost(input(otherId, null, { quantity: 1, unitCost: 20, freightAmount: 0, taxAmount: 0 }));
  assert.equal((await costs.getAllocationBills()).find((b) => b.billId === "COSTTEST01").readOnly, true);
  await assert.rejects(() => bills.setBillSplitMode("COSTTEST01", true), (error) => error.number === 51030);
}));

test("split bill payment edits are blocked when an allocated job is completed", { skip: !enabled }, async () => fixture(async ({ tx, bills, costs, projects, projectId, lineId }) => {
  await bills.setBillSplitMode("COSTTEST01", true);
  await costs.saveProjectBillCost(input(projectId, lineId));
  await projects.updateProjectStatus(projectId, "Complete");
  await assert.rejects(() => tx.request().query("UPDATE dbo.Bills SET [Bill Paid Date] = '2026-10-06' WHERE id = 'COSTTEST01'"), (error) => error.number === 51030);
}));

test("split bill total cannot fall below allocations across all jobs", { skip: !enabled }, async () => fixture(async ({ tx, bills, costs, projects, projectId, lineId }) => {
  await bills.setBillSplitMode("COSTTEST01", true);
  await costs.saveProjectBillCost(input(projectId, lineId));
  const otherId = await projects.createProject("Shared rental total fixture");
  await costs.saveProjectBillCost(input(otherId, null, { quantity: 1, unitCost: 200, freightAmount: 0, taxAmount: 0 }));
  await assert.rejects(() => tx.request().query("UPDATE dbo.Bills SET [Bill Amount] = '400.00' WHERE id = 'COSTTEST01'"), (error) => error.number === 51022);
}));
