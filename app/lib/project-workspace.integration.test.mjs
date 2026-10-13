import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { registerHooks } from "node:module";
import { test } from "node:test";
import sql from "mssql";
import nextEnv from "@next/env";

test("project-scoped reads share planner records and preserve organization-wide capacity", {
  skip: process.env.RUN_DB_TESTS !== "1",
}, async () => {
  nextEnv.loadEnvConfig(process.cwd());
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_SERVER, port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    options: { encrypt: process.env.DB_ENCRYPT !== "false", trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === "true" },
  }).connect();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  const uploadedPaths = [];
  const facade = { request: () => transaction.request(), begin: async () => {}, commit: async () => {}, rollback: async () => {} };
  globalThis.workspaceTestDb = { getPool: async () => facade, sql: { ...sql, Transaction: class { constructor() { return facade; } } } };
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "next/headers") return { url: "workspace-test:headers", shortCircuit: true };
      if (specifier.startsWith("@/app/lib/")) return nextResolve(new URL(`./${specifier.slice("@/app/lib/".length)}.ts`, import.meta.url).href, context);
      if (specifier.startsWith("./") && !/\.[a-z]+$/.test(specifier) && context.parentURL?.includes("/app/lib/")) return nextResolve(`${specifier}.ts`, context);
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (url === "workspace-test:headers") return {
        format: "module", shortCircuit: true,
        source: "export const cookies = async () => ({ get: () => undefined });",
      };
      if (url === new URL("./db.ts", import.meta.url).href) return {
        format: "module", shortCircuit: true,
        source: "export const sql = globalThis.workspaceTestDb.sql; export const getPool = globalThis.workspaceTestDb.getPool;",
      };
      return nextLoad(url, context);
    },
  });
  try {
    const { getProjectsWithEstimates } = await import("./estimates.ts");
    const { getProjectBillCosts } = await import("./project-costs.ts");
    const { getBills } = await import("./bills.ts");
    const { getInvoices } = await import("./invoices.ts");
    const { getFieldOperationsSchedule, scheduleProjectVisit, assignResourceToTask, setFieldOperationsAssignmentHours } = await import("./field-operations.ts");
    const { resourceCapacity } = await import("./field-capacity.ts");
    const { requireProject, requireProjectSession } = await import("./project-access.ts");
    const { requireFieldActionAccess } = await import("./field-operations-access.ts");
    const attachments = await import("./project-attachments.ts");
    const result = await transaction.request().input("key", sql.NVarChar(100), `workspace-${crypto.randomUUID()}`).query(`
      INSERT dbo.Organizations(OrganizationKey,OrganizationName) VALUES(@key,N'Workspace rollback test');
      DECLARE @org int=SCOPE_IDENTITY();
      INSERT dbo.Projects(ProjectName,ProjectStatus,OrganizationID) VALUES(N'Workspace target','Active',@org);
      DECLARE @target int=SCOPE_IDENTITY();
      INSERT dbo.Projects(ProjectName,ProjectStatus,OrganizationID) VALUES(N'Workspace other job','Active',@org);
      DECLARE @other int=SCOPE_IDENTITY();
      INSERT dbo.Equipment(EquipmentName,OrganizationID) VALUES(N'Workspace test equipment',@org);
      SELECT @org AS org, @target AS target, @other AS other, CONVERT(int,SCOPE_IDENTITY()) AS equipment;
    `);
    const { org, target, other, equipment } = result.recordset[0];
    const notFound = (error) => error.status === 404;
    await assert.rejects(() => requireProjectSession(), (error) => error.status === 401);
    await requireProject(target, org);
    await assert.rejects(() => requireProject(target, 1), notFound);
    assert.deepEqual((await getProjectsWithEstimates({ organizationId: org, projectId: target })).map((p) => p.projectId), [target]);
    assert.equal((await getProjectsWithEstimates({ organizationId: 1, projectId: target })).length, 0);
    assert.deepEqual(await getProjectBillCosts({ projectId: target, organizationId: org }), []);
    assert.deepEqual(await getBills({ projectId: target, organizationId: org }), []);
    assert.deepEqual(await getInvoices({ projectId: target, organizationId: org }), []);
    await scheduleProjectVisit(target, "2041-03-04");
    await scheduleProjectVisit(other, "2041-03-04");
    let visits = await getFieldOperationsSchedule("2041-03-04", "2041-03-10", org);
    assert.equal(visits.length, 2);
    for (const visit of visits) {
      const action = { action: "assign-resource", taskId: visit.tasks[0].taskId, resourceType: "equipment", resourceId: equipment };
      await requireFieldActionAccess(action, org);
      await assert.rejects(() => requireFieldActionAccess(action, 1), notFound);
      assert.equal(await assignResourceToTask(visit.tasks[0].taskId, { equipmentId: equipment }), true);
    }
    visits = await getFieldOperationsSchedule("2041-03-04", "2041-03-10", org);
    for (const visit of visits) {
      assert.equal(await setFieldOperationsAssignmentHours(visit.tasks[0].assignments[0].assignmentId, "Custom", visit.projectId === target ? 3 : 4), true);
    }
    visits = await getFieldOperationsSchedule("2041-03-04", "2041-03-10", org);
    const capacity = resourceCapacity(visits, ["2041-03-04"], "equipment");
    assert.equal(capacity.get(equipment).get("2041-03-04"), 7);
    const targetVisits = visits.filter((visit) => visit.projectId === target);
    assert.equal(targetVisits.length, 1);
    assert.equal(targetVisits[0].tasks[0].assignments[0].hours, 3);
    const stored = await transaction.request().input("org", sql.Int, org).query(`
      SELECT COUNT(*) AS count FROM dbo.FieldOperationsTaskAssignments WHERE OrganizationID=@org
    `);
    assert.equal(stored.recordset[0].count, 2);
    const wrongOrg = await getFieldOperationsSchedule("2041-03-04", "2041-03-10", 1);
    assert.ok(wrongOrg.every((visit) => visit.projectId !== target && visit.projectId !== other));
    const { userId } = (await transaction.request().query("SELECT TOP (1) UserID AS userId FROM dbo.Users ORDER BY UserID")).recordset[0];
    const file = new File(["workspace integration content"], "workspace-integration.txt", { type: "text/plain" });
    await assert.rejects(() => attachments.saveProjectAttachment(target, 1, userId, "document", file), notFound);
    const attachmentId = await attachments.saveProjectAttachment(target, org, userId, "document", file);
    const attachment = await attachments.getProjectAttachment(target, org, attachmentId);
    uploadedPaths.push(attachments.attachmentPath(attachment.storageKey));
    assert.equal(await fs.readFile(uploadedPaths[0], "utf8"), "workspace integration content");
    assert.equal((await attachments.getProjectAttachments(target, org, "document")).length, 1);
    assert.deepEqual(await attachments.getProjectAttachments(target, 1, "document"), []);
    await assert.rejects(() => attachments.getProjectAttachment(target, 1, attachmentId), notFound);
    await assert.rejects(() => attachments.getProjectAttachment(other, org, attachmentId), notFound);
    await assert.rejects(() => attachments.archiveProjectAttachment(target, 1, attachmentId), notFound);
    await attachments.archiveProjectAttachment(target, org, attachmentId);
    await assert.rejects(() => attachments.getProjectAttachment(target, org, attachmentId), notFound);
    assert.deepEqual(await attachments.getProjectAttachments(target, org, "document"), []);
  } finally {
    try { await transaction.rollback(); }
    finally {
      hooks.deregister();
      delete globalThis.workspaceTestDb;
      await pool.close();
      for (const filePath of uploadedPaths) await fs.unlink(filePath);
    }
  }
});
