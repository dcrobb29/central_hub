import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import sql from "mssql";
import nextEnv from "@next/env";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/app/lib/")) {
      return nextResolve(new URL(`./${specifier.slice("@/app/lib/".length)}.ts`, import.meta.url).href, context);
    }
    if (specifier === "./auth" && context.parentURL?.includes("/app/lib/")) {
      return nextResolve("./auth.ts", context);
    }
    if (specifier === "./db" && context.parentURL?.includes("/app/lib/")) {
      return nextResolve("./db.ts", context);
    }
    if (specifier === "./sample-data" && context.parentURL?.includes("/app/lib/")) {
      return nextResolve("./sample-data.ts", context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === new URL("./db.ts", import.meta.url).href) {
      return {
        format: "module",
        shortCircuit: true,
        source: "export const getPool = async () => globalThis.sampleTestDb; export const sql = globalThis.sampleTestSql;",
      };
    }
    return nextLoad(url, context);
  },
});

nextEnv.loadEnvConfig(process.cwd());
globalThis.sampleTestSql = sql;

const config = {
  server: process.env.DB_SERVER || "localhost",
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 1433,
  database: process.env.DB_NAME || "centralHubTest",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: process.env.DB_ENCRYPT !== "false",
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === "true",
  },
};

test("Sample data inclusion and exclusion lifecycle", async (t) => {
  const pool = await new sql.ConnectionPool(config).connect();
  globalThis.sampleTestDb = pool;

  t.after(async () => {
    await pool.close();
  });

  const { isSampleDataIncluded, includeSampleData, excludeSampleData } = await import("./sample-data.ts");

  // Step 1: Ensure initial state is clean for org 1
  console.log("Checking initial sample data status...");
  let status = await isSampleDataIncluded(1);
  if (status.hasSampleData) {
    console.log("Cleaning up existing sample data first...");
    await excludeSampleData(1);
    status = await isSampleDataIncluded(1);
  }
  assert.equal(status.hasSampleData, false, "Initial state should have no sample data");

  // Step 2: Include sample data
  console.log("Generating sample data for organization 1...");
  const includeResult = await includeSampleData(1);
  assert.equal(includeResult.success, true, "includeSampleData should return success: true");
  assert.equal(includeResult.hasSampleData, true, "includeSampleData should return hasSampleData: true");
  assert.ok(includeResult.recordCount > 20, `Record count should be > 20, got ${includeResult.recordCount}`);
  console.log(`Generated ${includeResult.recordCount} sample data records across all tables!`);

  // Step 3: Verify data presence in specific tables
  const checkEstimates = await pool.request().query("SELECT COUNT(*) AS c FROM dbo.Estimates WHERE OrganizationID = 1 AND EstimateName LIKE '%(Sample)%'");
  assert.ok(checkEstimates.recordset[0].c >= 4, "Should have at least 4 sample estimates");

  const checkProjects = await pool.request().query("SELECT COUNT(*) AS c FROM dbo.Projects WHERE OrganizationID = 1 AND ProjectName LIKE '%(Sample)%'");
  assert.ok(checkProjects.recordset[0].c >= 3, "Should have at least 3 sample projects");

  const checkInvoices = await pool.request().query("SELECT COUNT(*) AS c FROM dbo.Invoices WHERE OrganizationID = 1 AND [Invoice No] IN ('900001', '900002', '900003')");
  assert.equal(checkInvoices.recordset[0].c, 3, "Should have 3 sample invoices");

  const checkBills = await pool.request().query("SELECT COUNT(*) AS c FROM dbo.Bills WHERE OrganizationID = 1 AND id IN ('SMP-B01', 'SMP-B02')");
  assert.equal(checkBills.recordset[0].c, 2, "Should have 2 sample bills");

  const checkTasks = await pool.request().query("SELECT COUNT(*) AS c FROM dbo.FieldOperationsTasks WHERE OrganizationID = 1 AND TaskName LIKE '%(Sample)%'");
  assert.ok(checkTasks.recordset[0].c >= 2, "Should have sample field operations tasks");
  const changes=await pool.request().query(`SELECT c.Kind,c.Status,r.QuotedTotal FROM dbo.ContractChanges c
    JOIN dbo.Estimates e ON e.EstimateID=c.DocumentEstimateID JOIN dbo.EstimateRevisions r ON r.EstimateID=e.EstimateID
    WHERE c.OrganizationID=1 AND e.EstimateName LIKE '%(Sample)%' ORDER BY c.Kind`);
  assert.deepEqual(changes.recordset,[{Kind:"Alternate",Status:"Proposed",QuotedTotal:300},{Kind:"ChangeOrder",Status:"Proposed",QuotedTotal:450}]);

  // Step 4: Exclude sample data
  console.log("Excluding sample data for organization 1...");
  const excludeResult = await excludeSampleData(1);
  assert.equal(excludeResult.success, true, "excludeSampleData should return success: true");
  assert.equal(excludeResult.hasSampleData, false, "excludeSampleData should return hasSampleData: false");

  // Step 5: Verify clean database state (0 sample records)
  const finalStatus = await isSampleDataIncluded(1);
  assert.equal(finalStatus.hasSampleData, false, "Final state should have no sample data");
  assert.equal(finalStatus.sampleRecordCount, 0, "Final tracked record count should be 0");

  const postEst = await pool.request().query("SELECT COUNT(*) AS c FROM dbo.Estimates WHERE OrganizationID = 1 AND EstimateName LIKE '%(Sample)%'");
  assert.equal(postEst.recordset[0].c, 0, "Sample estimates should be deleted");

  const postProj = await pool.request().query("SELECT COUNT(*) AS c FROM dbo.Projects WHERE OrganizationID = 1 AND ProjectName LIKE '%(Sample)%'");
  assert.equal(postProj.recordset[0].c, 0, "Sample projects should be deleted");

  const postInv = await pool.request().query("SELECT COUNT(*) AS c FROM dbo.Invoices WHERE OrganizationID = 1 AND [Invoice No] IN ('900001', '900002', '900003')");
  assert.equal(postInv.recordset[0].c, 0, "Sample invoices should be deleted");

  const postBills = await pool.request().query("SELECT COUNT(*) AS c FROM dbo.Bills WHERE OrganizationID = 1 AND id IN ('SMP-B01', 'SMP-B02')");
  assert.equal(postBills.recordset[0].c, 0, "Sample bills should be deleted");

  // Step 6: Repeat cycle to verify idempotency and re-run safety
  console.log("Testing second cycle (repeatability)...");
  const cycle2Inc = await includeSampleData(1);
  assert.equal(cycle2Inc.success, true);
  assert.equal(cycle2Inc.hasSampleData, true);

  const cycle2Exc = await excludeSampleData(1);
  assert.equal(cycle2Exc.success, true);
  assert.equal(cycle2Exc.hasSampleData, false);

  const finalCheck = await isSampleDataIncluded(1);
  assert.equal(finalCheck.hasSampleData, false);
  assert.equal(finalCheck.sampleRecordCount, 0);

  console.log("Sample data lifecycle test completed successfully with 100% clean teardown!");
});
