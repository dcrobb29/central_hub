import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import sql from "mssql";
import nextEnv from "@next/env";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/app/lib/")) return nextResolve(new URL(`./${specifier.slice("@/app/lib/".length)}.ts`, import.meta.url).href, context);
    if (specifier === "./validation" && context.parentURL?.endsWith("/customer-fields.ts")) return nextResolve("./validation.ts", context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === new URL("./db.ts", import.meta.url).href) return {
      format: "module", shortCircuit: true,
      source: "export const getPool = async () => globalThis.customerTestDb; export const sql = globalThis.customerTestSql;",
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
  globalThis.customerTestDb = { request: () => transaction.request(), begin: async () => {}, commit: async () => {}, rollback: async () => {} };
  globalThis.customerTestSql = { ...sql, Transaction: class { constructor() { return globalThis.customerTestDb; } } };
  try {
    const customers = await import("./customers.ts");
    const invoices = await import("./invoices.ts");
    const projects = await import("./projects.ts");
    const { parseCustomerDetails, invoiceCustomerSnapshot } = await import("./customer-fields.ts");
    const input = parseCustomerDetails({
      firstName: "Customer integration fixture",
      companyName: "Long customer company name supported without truncation",
      billingAddressLine1: "Billing address longer than the previous fifty character SQL limit",
      shippingAddressLine1: "Shipping address",
    });
    const customerId = await customers.saveCustomer(input, null);
    const projectId = await projects.createProject("Customer integration fixture");
    const invoiceInput = {
      ...invoiceCustomerSnapshot(input), customerId, projectId,
      invoiceNo: "CUSTTEST", invoiceDate: new Date("2040-10-03T00:00:00Z"),
      invoiceDueDate: new Date("2040-11-03T00:00:00Z"), invoicePaidDate: null, invoiceAmount: "100.00",
    };
    await run({ ...customers, ...invoices, ...projects, customerId, projectId, invoiceInput, input, transaction });
  } finally {
    if (!aborted) await transaction.rollback();
    await pool.close();
    delete globalThis.customerTestDb;
    delete globalThis.customerTestSql;
  }
}

test("customer edits preserve invoice snapshots; archive retains links; restore re-enables assignments", { skip: !enabled }, async () => fixture(async (f) => {
  assert.equal(await f.updateProjectCustomer(f.projectId, f.customerId), true);
  assert.equal((await f.getInvoiceProjectOptions()).find((item) => item.projectId === f.projectId).customerId, f.customerId);
  const invoiceId = await f.addInvoice(f.invoiceInput);
  await f.saveCustomer({ ...f.input, companyName: "Updated company", billingAddressLine1: "Updated billing address" }, f.customerId);
  const invoice = (await f.getInvoices()).find((item) => item.id === invoiceId);
  assert.equal(invoice.customerId, f.customerId);
  assert.equal(invoice.companyName, f.input.companyName);
  assert.equal(invoice.billingAddressLine1, f.input.billingAddressLine1);
  await f.setCustomerActive(f.customerId, false);
  assert.equal((await f.getCustomers()).find((item) => item.customerId === f.customerId).isActive, false);
  await f.updateInvoice(invoiceId, { ...f.invoiceInput, invoicePaidDate: new Date("2040-10-04T00:00:00Z") });
  // Older clients omitting CustomerID preserve an existing invoice link.
  const { customerId, ...legacyInput } = f.invoiceInput;
  void customerId;
  await f.updateInvoice(invoiceId, legacyInput);
  assert.equal((await f.getInvoices()).find((item) => item.id === invoiceId).customerId, f.customerId);
  await f.setCustomerActive(f.customerId, true);
  assert.ok(await f.addInvoice({ ...f.invoiceInput, invoiceNo: "CUSTTEST2" }));
  await f.updateInvoice(invoiceId, { ...f.invoiceInput, customerId: null });
  assert.equal((await f.getInvoices()).find((item) => item.id === invoiceId).customerId, null);
}));

test("archived customers cannot be assigned to a new invoice", { skip: !enabled }, async () => fixture(async (f) => {
  await f.setCustomerActive(f.customerId, false);
  await assert.rejects(() => f.addInvoice(f.invoiceInput), /Choose an active customer/);
}));

test("archived customers cannot be assigned to a different project", { skip: !enabled }, async () => fixture(async (f) => {
  await f.setCustomerActive(f.customerId, false);
  await assert.rejects(() => f.updateProjectCustomer(f.projectId, f.customerId), /Choose an active customer/);
}));

test("completed projects remain protected against customer reassignment", { skip: !enabled }, async () => fixture(async (f) => {
  assert.equal(await f.updateProjectCustomer(f.projectId, f.customerId), true);
  assert.equal(await f.updateProjectStatus(f.projectId, "Complete"), true);
  await assert.rejects(() => f.updateProjectCustomer(f.projectId, null), /Complete and read-only/);
}));

test("customer updates report nonexistent records rather than succeeding silently", { skip: !enabled }, async () => fixture(async (f) => {
  await assert.rejects(() => f.saveCustomer(f.input, 2_147_483_647), /Customer not found/);
  await assert.rejects(() => f.setCustomerActive(2_147_483_647, false), /Customer not found/);
}));
