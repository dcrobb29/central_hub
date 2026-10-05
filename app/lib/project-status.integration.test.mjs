import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import sql from "mssql";
import nextEnv from "@next/env";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/app/lib/")) return nextResolve(new URL(`./${specifier.slice("@/app/lib/".length)}.ts`, import.meta.url).href, context);
    if (specifier === "./validation" && context.parentURL?.includes("/app/lib/")) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === new URL("./db.ts", import.meta.url).href) return {
      format: "module", shortCircuit: true,
      source: "export const getPool = () => globalThis.statusTestDb.pool; export const sql = globalThis.statusTestDb.sql;",
    };
    return nextLoad(url, context);
  },
});

const enabled = process.env.RUN_DB_TESTS === "1";

async function fixture(run) {
  nextEnv.loadEnvConfig(process.cwd());
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_SERVER, port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    options: { encrypt: process.env.DB_ENCRYPT !== "false", trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === "true" },
  }).connect();
  const transaction = new sql.Transaction(pool);
  let aborted = false;
  transaction.on("rollback", () => { aborted = true; });
  await transaction.begin();
  const facade = { request: () => transaction.request(), begin: async () => {}, commit: async () => {}, rollback: async () => {} };
  globalThis.statusTestDb = { pool: facade, sql: { ...sql, Transaction: class { constructor() { return globalThis.statusTestDb.pool; } } } };
  try {
    const setup = await transaction.request().query(`
      INSERT INTO dbo.Estimates (EstimateName) VALUES (N'Status integration fixture');
      DECLARE @estimateId int = SCOPE_IDENTITY();
      INSERT INTO dbo.EstimateRevisions (EstimateID, RevisionNumber, MarkupMode, GroupingMode, EstimateMarkupPercent, TaxPercent, RoundingIncrement, QuotedTotal)
      VALUES (@estimateId, 1, 'perLine', 'None', 0, 0, 0, 100);
      DECLARE @revisionId int = SCOPE_IDENTITY();
      INSERT INTO dbo.EstimateLineItems (EstimateRevisionID, LineNumber, Description, Quantity, UnitName, UnitCost, LineType, FreightAmount, LineMarkupPercent)
      VALUES (@revisionId, 1, N'Status test material', 1, 'EA', 100, 'Material', 0, 0);
      DECLARE @lineId int = SCOPE_IDENTITY();
      INSERT INTO dbo.Projects (ProjectName, AcceptedEstimateRevisionID, EngagementType, RecurrenceFrequency, ExpectedStartDate, ExpectedEndDate)
      VALUES (N'Status integration fixture', @revisionId, 'Service', 'Weekly', '2040-10-03', '2040-10-17');
      DECLARE @projectId int = SCOPE_IDENTITY();
      INSERT INTO dbo.Bills (id, ProjectID, [Bill No], [Bill Date], [Bill Amount])
      VALUES ('STATUSTEST', @projectId, 'STATUS', '2040-10-03', '100.00');
      INSERT INTO dbo.Bills (id, ProjectID, [Bill No], [Bill Date], [Bill Amount])
      VALUES ('STATUSFREE', @projectId, 'FREE', '2040-10-03', '50.00');
      INSERT INTO dbo.Invoices (ProjectID, [Invoice No], [Invoice Date], [Invoice Due Date], [Invoice Amount])
      VALUES (@projectId, 'STATUSTEST', '2040-10-03', '2040-11-03', '200.00');
      DECLARE @invoiceId int = SCOPE_IDENTITY();
      UPDATE dbo.Projects SET ProjectStatus = 'Active' WHERE ProjectID = @projectId;
      INSERT INTO dbo.ServiceVisits (ProjectID, VisitDate, Status) VALUES (@projectId, '2040-10-03', 'Scheduled');
      DECLARE @visitId int = SCOPE_IDENTITY();
      INSERT INTO dbo.FieldOperationsTasks (ServiceVisitID, TaskName, PlannedLaborHours) VALUES (@visitId, N'Status test task', 1);
      DECLARE @taskId int = SCOPE_IDENTITY();
      INSERT INTO dbo.Equipment (EquipmentName) VALUES (N'Status test equipment');
      DECLARE @equipmentId int = SCOPE_IDENTITY();
      INSERT INTO dbo.FieldOperationsTaskAssignments (FieldOperationsTaskID, EquipmentID) VALUES (@taskId, @equipmentId);
      DECLARE @assignmentId int = SCOPE_IDENTITY();
      INSERT INTO dbo.ProjectBillCosts (ProjectID, BillID, EstimateLineItemID, Description, CostDate, Quantity, UnitName, UnitCost, FreightAmount, TaxAmount, Amount)
      VALUES (@projectId, 'STATUSTEST', @lineId, N'Status test allocation', '2040-10-03', 1, 'EA', 10, 0, 0, 10);
      SELECT @projectId AS projectId, @lineId AS lineId, @visitId AS visitId, @taskId AS taskId,
        @assignmentId AS assignmentId, @invoiceId AS invoiceId, SCOPE_IDENTITY() AS costId;
    `);
    const ids = setup.recordset[0];
    const request = () => {
      const request = transaction.request();
      for (const [key, value] of Object.entries(ids)) request.input(key, sql.Int, value);
      return request;
    };
    await run({ ids, request, transaction, facade });
  } finally {
    if (!aborted) await transaction.rollback();
    await pool.close();
  }
}

test("jobs default Upcoming; completion freezes data and explicit Active reopening unlocks costs", { skip: !enabled }, async () => fixture(async ({ ids, request, facade }) => {
  const { updateProjectStatus, createProject } = await import("./projects.ts");
  const { addInvoice } = await import("./invoices.ts");
  const { ensureRecurringVisits } = await import("./recurring-schedule.ts");
  const { saveProjectBillCost } = await import("./project-costs.ts");
  const upcomingId = await createProject("Status integration secondary fixture");
  assert.equal((await request().input("upcomingId", sql.Int, upcomingId).query("SELECT ProjectStatus FROM dbo.Projects WHERE ProjectID = @upcomingId")).recordset[0].ProjectStatus, "Upcoming");
  assert.equal(await updateProjectStatus(ids.projectId, "Active"), true);
  assert.equal(await updateProjectStatus(ids.projectId, "Complete"), true);
  await ensureRecurringVisits(facade, ids.projectId, "2040-10-03", "2040-10-17", "Weekly");
  assert.equal((await request().query("SELECT COUNT(*) AS total FROM dbo.ServiceVisits WHERE ProjectID = @projectId")).recordset[0].total, 1);
  const input = { projectId: ids.projectId, billId: "STATUSTEST", estimateLineItemId: ids.lineId,
    description: "Reopened cost", costDate: "2040-10-03", quantity: 1, unitName: "EA", unitCost: 5, freightAmount: 0, taxAmount: 0 };
  await assert.rejects(() => saveProjectBillCost(input), /Complete and read-only/);
  assert.equal(await updateProjectStatus(ids.projectId, "Active"), true);
  assert.ok(await saveProjectBillCost(input));
  const invoiceId = await addInvoice({
    projectId: ids.projectId, invoiceNo: "REOPENED", invoiceDate: new Date("2040-10-03"),
    invoiceDueDate: new Date("2040-11-03"), invoicePaidDate: null, invoiceAmount: "50.00",
    firstName: null, lastName: null, companyName: null, billingAddressLine1: null, billingAddressLine2: null,
    billingAddressCity: null, billingAddressState: null, billingAddressZip: null,
    shippingAddressLine1: null, shippingAddressLine2: null, shippingAddressCity: null,
    shippingAddressState: null, shippingAddressZip: null,
  });
  assert.ok(invoiceId > 0);
}));

const blockedWrites = [
  ["job notes", "UPDATE dbo.Projects SET InternalNotes = 'Changed' WHERE ProjectID = @projectId"],
  ["reopening directly to Upcoming", "UPDATE dbo.Projects SET ProjectStatus = 'Upcoming' WHERE ProjectID = @projectId"],
  ["new bill", "INSERT INTO dbo.Bills (id, ProjectID, [Bill No], [Bill Date], [Bill Amount]) VALUES ('STATUSNEW', @projectId, 'NEW', '2040-10-03', '50.00')"],
  ["editing bill", "UPDATE dbo.Bills SET [Bill Paid Date] = '2040-10-04' WHERE id = 'STATUSTEST'"],
  ["deleting bill", "DELETE FROM dbo.Bills WHERE id = 'STATUSFREE'"],
  ["moving bill away", "UPDATE dbo.Bills SET ProjectID = NULL WHERE id = 'STATUSTEST'"],
  ["new invoice", "INSERT INTO dbo.Invoices (ProjectID, [Invoice No], [Invoice Date], [Invoice Due Date], [Invoice Amount]) VALUES (@projectId, 'NEW', '2040-10-03', '2040-11-03', '50.00')"],
  ["editing invoice", "UPDATE dbo.Invoices SET [Invoice Amount] = '250.00' WHERE id = @invoiceId"],
  ["moving invoice away", "UPDATE dbo.Invoices SET ProjectID = NULL WHERE id = @invoiceId"],
  ["deleting invoice", "DELETE FROM dbo.Invoices WHERE id = @invoiceId"],
  ["removing allocation", "UPDATE dbo.ProjectBillCosts SET IsActive = 0 WHERE ProjectBillCostID = @costId"],
  ["new allocation", "INSERT INTO dbo.ProjectBillCosts (ProjectID, BillID, Description, CostDate, Quantity, UnitName, UnitCost, FreightAmount, TaxAmount, Amount) VALUES (@projectId, 'STATUSTEST', N'Blocked cost', '2040-10-03', 1, 'EA', 5, 0, 0, 5)"],
  ["editing estimate baseline", "UPDATE dbo.EstimateLineItems SET UnitCost = 90 WHERE EstimateLineItemID = @lineId"],
  ["editing saved estimate preferences", "UPDATE e SET ShowQuantities = 0 FROM dbo.Estimates e JOIN dbo.EstimateRevisions r ON r.EstimateID = e.EstimateID JOIN dbo.Projects p ON p.AcceptedEstimateRevisionID = r.EstimateRevisionID WHERE p.ProjectID = @projectId"],
  ["moving visit", "UPDATE dbo.ServiceVisits SET VisitDate = '2040-10-05' WHERE ServiceVisitID = @visitId"],
  ["new visit", "INSERT INTO dbo.ServiceVisits (ProjectID, VisitDate) VALUES (@projectId, '2040-10-10')"],
  ["editing task", "UPDATE dbo.FieldOperationsTasks SET PlannedLaborHours = 5 WHERE FieldOperationsTaskID = @taskId"],
  ["removing resource", "UPDATE dbo.FieldOperationsTaskAssignments SET IsActive = 0 WHERE FieldOperationsTaskAssignmentID = @assignmentId"],
];
for (const [name, query] of blockedWrites) {
  test(`Complete blocks ${name}`, { skip: !enabled }, async () => fixture(async ({ request }) => {
    // Isolate bill reassignment from the pre-existing allocation-project guard.
    if (name === "moving bill away") await request().query("UPDATE dbo.ProjectBillCosts SET IsActive = 0 WHERE ProjectBillCostID = @costId");
    await request().query("UPDATE dbo.Projects SET ProjectStatus = 'Complete' WHERE ProjectID = @projectId");
    await assert.rejects(() => request().query(query), (error) => error.number === 51030
      || (name === "editing estimate baseline" && error.number === 229));
  }));
}

for (const [name, query] of blockedWrites.filter(([name]) => ["moving visit", "new visit", "editing task", "removing resource"].includes(name))) {
  test(`Upcoming blocks planner ${name}`, { skip: !enabled }, async () => fixture(async ({ request }) => {
    await request().query("UPDATE dbo.Projects SET ProjectStatus = 'Upcoming' WHERE ProjectID = @projectId");
    await assert.rejects(() => request().query(query), (error) => error.number === 51032);
  }));
}

for (const direction of ["from", "to"]) {
  test(`Upcoming blocks moving resources ${direction} its tasks`, { skip: !enabled }, async () => fixture(async ({ request }) => {
    await assert.rejects(() => request().query(`
      INSERT dbo.Projects (ProjectName, ProjectStatus) VALUES (N'Status transfer fixture', 'Active');
      DECLARE @otherProjectId int = SCOPE_IDENTITY();
      INSERT dbo.ServiceVisits (ProjectID, VisitDate) VALUES (@otherProjectId, '2040-10-03');
      DECLARE @otherVisitId int = SCOPE_IDENTITY();
      INSERT dbo.FieldOperationsTasks (ServiceVisitID, TaskName, PlannedLaborHours) VALUES (@otherVisitId, N'Transfer task', 1);
      DECLARE @otherTaskId int = SCOPE_IDENTITY();
      UPDATE dbo.Projects SET ProjectStatus = 'Upcoming'
      WHERE ProjectID = ${direction === "from" ? "@projectId" : "@otherProjectId"};
      UPDATE dbo.FieldOperationsTaskAssignments SET FieldOperationsTaskID = @otherTaskId
      WHERE FieldOperationsTaskAssignmentID = @assignmentId;
    `), (error) => error.number === 51032);
  }));
}
