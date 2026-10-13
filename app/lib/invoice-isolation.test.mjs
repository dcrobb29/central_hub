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
    if (specifier === "./invoices" && context.parentURL?.includes("/app/lib/")) {
      return nextResolve("./invoices.ts", context);
    }
    if (specifier === "./invoice-settings" && context.parentURL?.includes("/app/lib/")) {
      return nextResolve("./invoice-settings.ts", context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === new URL("./db.ts", import.meta.url).href) {
      return {
        format: "module",
        shortCircuit: true,
        source: "export const getPool = async () => globalThis.invoiceTestDb; export const sql = globalThis.invoiceTestSql;",
      };
    }
    return nextLoad(url, context);
  },
});

nextEnv.loadEnvConfig(process.cwd());
globalThis.invoiceTestSql = sql;

const { formatSixDigitInvoiceNumber, peekNextInvoiceNumber, allocateNextInvoiceNumber } = await import("./invoice-settings.ts");

test("formatSixDigitInvoiceNumber correctly formats numeric sequence codes", () => {
  assert.equal(formatSixDigitInvoiceNumber(1), "000001");
  assert.equal(formatSixDigitInvoiceNumber(2), "000002");
  assert.equal(formatSixDigitInvoiceNumber(42), "000042");
  assert.equal(formatSixDigitInvoiceNumber(12345), "012345");
  assert.equal(formatSixDigitInvoiceNumber(123456), "123456");
  assert.equal(formatSixDigitInvoiceNumber(1234567), "1234567");
  assert.equal(formatSixDigitInvoiceNumber(0), "000001");
  assert.equal(formatSixDigitInvoiceNumber(-1), "000001");
});

const runDbTests = process.env.RUN_DB_TESTS === "1";

test("multi-tenant invoice numbering and isolation across organizations", { skip: !runDbTests }, async () => {
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

  globalThis.invoiceTestDb = pool;
  globalThis.invoiceTestSql = sql;

  const invoices = await import("./invoices.ts");

  const org1 = 1;
  const org2Insert = await pool.request().query(`
    INSERT INTO dbo.Organizations (OrganizationKey, OrganizationName, Status)
    VALUES ('fakecompanyinc-iso-test-' + CONVERT(nvarchar(20), DATEDIFF_BIG(ms, '1970-01-01', GETUTCDATE())), 'FakeCompanyInc', 'Active');
    SELECT SCOPE_IDENTITY() AS orgId;
  `);
  const org2 = Number(org2Insert.recordset[0].orgId);

  const sharedInvoiceNo = `ISO${Date.now().toString().slice(-5)}`;

  try {
    // 1. Peek and allocate 6-digit sequence for Org 2
    const org2Peek = await peekNextInvoiceNumber(org2);
    assert.match(org2Peek, /^\d{6}$/);

    // 2. Org 1 adds invoice with sharedInvoiceNo
    const org1InvoiceId = await invoices.addInvoice({
      invoiceNo: sharedInvoiceNo,
      invoiceDate: new Date("2026-05-01"),
      invoiceDueDate: new Date("2026-05-15"),
      invoicePaidDate: null,
      invoiceAmount: "1234.50",
    }, org1);
    assert.ok(org1InvoiceId > 0);

    // 3. Org 2 adds invoice with the EXACT SAME sharedInvoiceNo (should succeed without collision!)
    const org2InvoiceId = await invoices.addInvoice({
      invoiceNo: sharedInvoiceNo,
      invoiceDate: new Date("2026-05-02"),
      invoiceDueDate: new Date("2026-05-16"),
      invoicePaidDate: null,
      invoiceAmount: "5678.90",
    }, org2);
    assert.ok(org2InvoiceId > 0);

    // 4. Duplicate invoice within the SAME organization (Org 1) must be rejected
    await assert.rejects(
      () => invoices.addInvoice({
        invoiceNo: sharedInvoiceNo,
        invoiceDate: new Date("2026-05-03"),
        invoiceDueDate: new Date("2026-05-17"),
        invoicePaidDate: null,
        invoiceAmount: "999.00",
      }, org1),
      /already exists/
    );

    // 5. Query isolation: Org 1 sees only Org 1's invoice
    const org1List = await invoices.getInvoices({ organizationId: org1 });
    const org1Found = org1List.find((inv) => inv.invoiceNo === sharedInvoiceNo);
    assert.ok(org1Found);
    assert.equal(org1Found.id, org1InvoiceId);
    assert.equal(org1Found.organizationId, org1);
    assert.equal(org1Found.invoiceAmount, "1234.50");

    // Org 1 must NOT see Org 2's invoice
    assert.equal(org1List.some((inv) => inv.id === org2InvoiceId), false);

    // 6. Query isolation: Org 2 sees only Org 2's invoice
    const org2List = await invoices.getInvoices({ organizationId: org2 });
    const org2Found = org2List.find((inv) => inv.invoiceNo === sharedInvoiceNo);
    assert.ok(org2Found);
    assert.equal(org2Found.id, org2InvoiceId);
    assert.equal(org2Found.organizationId, org2);
    assert.equal(org2Found.invoiceAmount, "5678.90");

    // Org 2 must NOT see Org 1's invoice
    assert.equal(org2List.some((inv) => inv.id === org1InvoiceId), false);

    // 7. Auto-increment allocate allocates 6-digit code
    const autoAllocatedNo = await allocateNextInvoiceNumber(pool, org2);
    assert.match(autoAllocatedNo, /^\d{6}$/);

    const autoAllocatedInvoiceId = await invoices.addInvoice({
      invoiceNo: "", // blank triggers auto-increment
      invoiceDate: new Date("2026-05-05"),
      invoiceDueDate: new Date("2026-05-20"),
      invoicePaidDate: null,
      invoiceAmount: "450.00",
    }, org2);

    const org2AutoInv = (await invoices.getInvoices({ organizationId: org2 })).find((inv) => inv.id === autoAllocatedInvoiceId);
    assert.ok(org2AutoInv);
    assert.match(org2AutoInv.invoiceNo, /^\d{6}$/);

    // Cleanup test invoices
    await pool.request().input("id1", sql.Int, org1InvoiceId).query("DELETE FROM dbo.Invoices WHERE [id] = @id1");
    await pool.request().input("id2", sql.Int, org2InvoiceId).query("DELETE FROM dbo.Invoices WHERE [id] = @id2");
    await pool.request().input("id3", sql.Int, autoAllocatedInvoiceId).query("DELETE FROM dbo.Invoices WHERE [id] = @id3");
  } finally {
    await pool.request().input("org2", sql.Int, org2).query(`
      DELETE FROM dbo.Invoices WHERE OrganizationID = @org2;
      DELETE FROM dbo.OrganizationInvoiceSettings WHERE OrganizationID = @org2;
      DELETE FROM dbo.Organizations WHERE OrganizationID = @org2;
    `);
    await pool.close();
  }
});
