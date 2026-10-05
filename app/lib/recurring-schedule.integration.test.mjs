import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import sql from "mssql";
import nextEnv from "@next/env";

test("recurring approval, moves, skips, and legacy visits persist correctly", {
  skip: process.env.RUN_DB_TESTS !== "1",
}, async () => {
  nextEnv.loadEnvConfig(process.cwd());
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_SERVER,
    port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
      encrypt: process.env.DB_ENCRYPT !== "false",
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === "true",
    },
  }).connect();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  // Keep library transactions inside one real transaction, rolled back after the test.
  const facade = {
    request: () => transaction.request(),
    begin: async () => {},
    commit: async () => {},
    rollback: async () => {},
  };
  globalThis.recurringTestDb = {
    getPool: async () => facade,
    sql: { ...sql, Transaction: class { constructor() { return facade; } } },
  };
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith("@/app/lib/")) {
        return nextResolve(new URL(`./${specifier.slice("@/app/lib/".length)}.ts`, import.meta.url).href, context);
      }
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (url === new URL("./db.ts", import.meta.url).href) {
        return {
          format: "module", shortCircuit: true,
          source: "export const sql = globalThis.recurringTestDb.sql; export const getPool = globalThis.recurringTestDb.getPool;",
        };
      }
      return nextLoad(url, context);
    },
  });
  try {
    const { winEstimate } = await import("./estimates.ts");
    const { ensureRecurringVisits } = await import("./recurring-schedule.ts");
    const { getFieldOperationsSchedule, moveFieldOperationsVisit, unscheduleFieldOperationsVisit } = await import("./field-operations.ts");
    const fixture = await transaction.request().query(`
      INSERT INTO dbo.Estimates (EstimateName, EngagementType, RecurrenceFrequency, ExpectedStartDate, ExpectedEndDate)
      VALUES (N'Recurring planner integration test', 'Service', 'Weekly', '2040-10-03', '2040-10-17');
      DECLARE @estimateId int = SCOPE_IDENTITY();
      INSERT INTO dbo.EstimateRevisions (EstimateID, RevisionNumber, MarkupMode, GroupingMode,
        EstimateMarkupPercent, TaxPercent, RoundingIncrement, QuotedTotal)
      VALUES (@estimateId, 1, 'perLine', 'None', 0, 0, 0, 0);
      SELECT @estimateId AS estimateId;
    `);
    const projectId = await winEstimate(fixture.recordset[0].estimateId);
    const visits = async () => (await transaction.request().input("projectId", sql.Int, projectId).query(`
      SELECT ServiceVisitID AS id, CONVERT(varchar(10), VisitDate, 23) AS date,
        CONVERT(varchar(10), RecurrenceDate, 23) AS original, Status AS status
      FROM dbo.ServiceVisits WHERE ProjectID = @projectId ORDER BY RecurrenceDate
    `)).recordset;
    const initial = await visits();
    assert.deepEqual(initial.map((visit) => visit.date), ["2040-10-03", "2040-10-10", "2040-10-17"]);
    await assert.rejects(() => winEstimate(fixture.recordset[0].estimateId), /not-draft/);

    const task = (await transaction.request().input("visitId", sql.Int, initial[0].id).query(`
      SELECT FieldOperationsTaskID AS id FROM dbo.FieldOperationsTasks WHERE ServiceVisitID = @visitId
    `)).recordset[0];
    assert.ok(task);
    await transaction.request().input("taskId", sql.Int, task.id).query(`
      UPDATE dbo.FieldOperationsTasks SET TaskName = N'Keep this task', PlannedLaborHours = 3.5
      WHERE FieldOperationsTaskID = @taskId;
      INSERT INTO dbo.Equipment (EquipmentName) VALUES (N'Recurring planner test equipment');
      INSERT INTO dbo.FieldOperationsTaskAssignments (FieldOperationsTaskID, EquipmentID)
      VALUES (@taskId, SCOPE_IDENTITY());
    `);
    assert.equal(await moveFieldOperationsVisit(initial[0].id, "2040-10-05"), true);
    await assert.rejects(() => moveFieldOperationsVisit(initial[0].id, "2040-10-12"), /visit-outside-week/);
    await ensureRecurringVisits(facade, projectId, "2040-10-03", "2040-10-17", "Weekly");
    assert.equal((await visits()).length, 3);
    assert.equal((await visits())[0].original, "2040-10-03");
    assert.equal((await visits())[0].date, "2040-10-05");
    const schedule = (await getFieldOperationsSchedule("2040-10-01", "2040-10-07")).filter((visit) => visit.projectId === projectId);
    assert.equal(schedule.length, 1);
    assert.equal(schedule[0].visitDate, "2040-10-05");
    assert.equal(schedule[0].tasks[0].taskId, task.id);
    assert.equal(schedule[0].tasks[0].taskName, "Keep this task");
    assert.equal(schedule[0].tasks[0].plannedLaborHours, 3.5);
    assert.equal(schedule[0].tasks[0].assignments.length, 1);

    assert.equal(await unscheduleFieldOperationsVisit(initial[0].id), true);
    await ensureRecurringVisits(facade, projectId, "2040-10-03", "2040-10-17", "Weekly");
    assert.equal((await visits()).length, 3);
    assert.equal((await visits())[0].status, "Skipped");
    assert.equal((await getFieldOperationsSchedule("2040-10-01", "2040-10-07")).filter((visit) => visit.projectId === projectId).length, 0);

    // Existing manually scheduled/skipped visits are adopted rather than duplicated.
    await transaction.request().input("visitId", sql.Int, initial[1].id).query(`
      UPDATE dbo.ServiceVisits SET RecurrenceDate = NULL, Status = 'Completed' WHERE ServiceVisitID = @visitId
    `);
    await ensureRecurringVisits(facade, projectId, "2040-10-03", "2040-10-17", "Weekly");
    assert.equal((await visits()).length, 3);
    assert.equal((await visits())[1].id, initial[1].id);
    assert.equal((await visits())[1].status, "Completed");
    assert.equal((await getFieldOperationsSchedule("2040-10-22", "2040-10-28")).filter((visit) => visit.projectId === projectId).length, 0);

    const oneTime = await transaction.request().query(`
      INSERT INTO dbo.Estimates (EstimateName, EngagementType) VALUES (N'One-time planner integration test', 'Project');
      DECLARE @estimateId int = SCOPE_IDENTITY();
      INSERT INTO dbo.EstimateRevisions (EstimateID, RevisionNumber, MarkupMode, GroupingMode,
        EstimateMarkupPercent, TaxPercent, RoundingIncrement, QuotedTotal)
      VALUES (@estimateId, 1, 'perLine', 'None', 0, 0, 0, 0);
      SELECT @estimateId AS estimateId;
    `);
    const oneTimeProjectId = await winEstimate(oneTime.recordset[0].estimateId);
    const count = await transaction.request().input("projectId", sql.Int, oneTimeProjectId)
      .query("SELECT COUNT(*) AS count FROM dbo.ServiceVisits WHERE ProjectID = @projectId");
    assert.equal(count.recordset[0].count, 0);
  } finally {
    hooks.deregister();
    delete globalThis.recurringTestDb;
    await transaction.rollback();
    await pool.close();
  }
});
