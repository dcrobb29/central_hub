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
  await assert.rejects(() => costs.saveProjectBillCost(input(projectId, lineId, { billId: "MISSING" })), /Assign this bill/);
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

test("bill project cannot change while active actual costs reference it", { skip: !enabled }, async () => fixture(async ({ tx, costs, projectId, lineId }) => {
  await costs.saveProjectBillCost(input(projectId, lineId));
  await assert.rejects(() => tx.request().query("UPDATE dbo.Bills SET ProjectID = NULL WHERE id = 'COSTTEST01'"), (error) => error.number === 51021);
}));
