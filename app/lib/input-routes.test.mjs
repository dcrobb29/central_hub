import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const state = { saves: [] };
globalThis.inputRouteTest = state;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/app/lib/")) return nextResolve(new URL(`./${specifier.slice(10)}.ts`, import.meta.url).href, context);
    if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier) && context.parentURL?.includes("/app/")) return nextResolve(`${specifier}.ts`, context);
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    const sources = {
      "project-access.ts": `export { ProjectAccessError } from "./project-access-error.ts";
        export const requireProjectSession = async () => ({ organization: { organizationId: 7 }, permissions: [] });`,
      "bills.ts": `export class BillTenantError extends Error {}
        export const addBill = async input => { globalThis.inputRouteTest.saves.push(input); };
        export const updateBill = async (_id, input) => { globalThis.inputRouteTest.saves.push(input); };
        export const deleteBill = async () => {};
        export const setBillSplitMode = async () => {};`,
      "invoices.ts": `export const getInvoices = async () => [];
        export const addInvoice = async input => { globalThis.inputRouteTest.saves.push(input); return 1; };
        export const updateInvoice = async (_id, input) => { globalThis.inputRouteTest.saves.push(input); };
        export const deleteInvoice = async () => {};`,
      "scope-templates.ts": `export const getScopeTemplates = async () => [];
        export const createScopeTemplate = async (_org, input) => { globalThis.inputRouteTest.saves.push(input); return 1; };
        export const getScopeTemplateDetails = async () => null;
        export const updateScopeTemplate = async (_org, _id, input) => { globalThis.inputRouteTest.saves.push(input); };
        export const deleteScopeTemplate = async () => {};`,
      "personnel.ts": `export class PersonnelRecordError extends Error {}
        export const getPersonnelData = async () => ({ roles: [{ id: "2" }], people: [{ id: "1", managerId: null }] });
        export const addRole = async (...args) => { globalThis.inputRouteTest.saves.push(args); };
        export const addPerson = async (...args) => { globalThis.inputRouteTest.saves.push(args); return 1; };
        export const updatePerson = async (...args) => { globalThis.inputRouteTest.saves.push(args); };`,
      "field-operations-access.ts": "export const requireFieldActionAccess = async () => {};",
      "field-operations.ts": [
        "addFieldOperationsTask", "assignResourceToTask", "deactivateFieldOperationsAssignment",
        "deactivateFieldOperationsTask", "getFieldOperationsSchedule", "moveFieldOperationsAssignment",
        "moveFieldOperationsVisit", "scheduleProjectVisit", "setFieldOperationsAssignmentHours",
        "unscheduleFieldOperationsVisit", "updateFieldOperationsTask",
      ].map(name => `export const ${name} = async (...args) => { globalThis.inputRouteTest.saves.push(args); return true; };`).join("\n"),
    };
    for (const [file, source] of Object.entries(sources)) {
      if (url === new URL(`./${file}`, import.meta.url).href) return { format: "module", shortCircuit: true, source };
    }
    return nextLoad(url, context);
  },
});
const { NextRequest } = await import("next/server.js");
const bills = await import("../api/finances/bills/route.ts");
const invoices = await import("../api/finances/invoices/route.ts");
const billEdit = await import("../api/finances/bills/[id]/route.ts");
const invoiceEdit = await import("../api/finances/invoices/[id]/route.ts");
const templates = await import("../api/sales/scope-templates/route.ts");
const template = await import("../api/sales/scope-templates/[scopeTemplateId]/route.ts");
const personnel = await import("../api/personnel/route.ts");
const planner = await import("../api/field-operations/route.ts");
const request = (body, method = "POST") => new NextRequest("http://localhost/api/test", {
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const bill = { id: "BILL1", billNo: "A123", billDate: "2026-10-24", billDueDate: "2026-10-25", billAmount: "100.00" };
const invoice = { invoiceDate: "2026-10-24", invoiceDueDate: "2026-10-25", invoiceAmount: "100.00" };

test("personnel inputs reject non-integer IDs and oversized titles before writing", async () => {
  for (const body of [
    { action: "add-role", name: "x".repeat(81) },
    { action: "add-person", name: "Alex", roleId: true, relationType: "none" },
    { action: "add-person", name: "Alex", roleId: 1.5, relationType: "none" },
  ]) {
    state.saves = [];
    assert.equal((await personnel.POST(request(body))).status, 400);
    assert.deepEqual(state.saves, []);
  }
  for (const patch of [{ id: true }, { roleId: [] }, { managerId: 1.5 }]) {
    state.saves = [];
    assert.equal((await personnel.PATCH(request({ id: 1, name: "Alex", roleId: 2, managerId: null, ...patch }, "PATCH"))).status, 400);
    assert.deepEqual(state.saves, []);
  }
});

test("planner create/edit hours reject blanks, booleans and excess precision; zero remains valid", async () => {
  for (const action of ["add-task", "update-task"]) {
    for (const plannedLaborHours of ["", true, [], "1e2", 1.001, 100001]) {
      state.saves = [];
      assert.equal((await planner.POST(request({ action, serviceVisitId: 1, taskId: 1, taskName: "Task", plannedLaborHours }))).status, 400);
      assert.deepEqual(state.saves, []);
    }
    state.saves = [];
    assert.ok([200, 201].includes((await planner.POST(request({ action, serviceVisitId: 1, taskId: 1, taskName: "Task", plannedLaborHours: 0 }))).status));
    assert.equal(state.saves.length, 1);
  }
  for (const customHours of [null, "", false, 24.01, 0.001]) {
    state.saves = [];
    assert.equal((await planner.POST(request({ action: "set-assignment-hours", assignmentId: 1, hoursMode: "Custom", customHours }))).status, 400);
    assert.deepEqual(state.saves, []);
  }
  assert.equal((await planner.POST(request({ action: "schedule-project", projectId: 1, visitDate: "0000-01-01" }))).status, 400);
});

test("bill/invoice parsers block early due dates, allow early payment and preserve signed/zero amounts", () => {
  assert.throws(() => bills.parseBillInput({ ...bill, billDueDate: "2026-10-23" }), /Due date/);
  assert.throws(() => invoices.parseInvoiceInput({ ...invoice, invoiceDueDate: "2026-10-23" }), /Due date/);
  assert.equal(bills.parseBillInput({ ...bill, billPaidDate: "2026-10-01" }).billPaidDate.toISOString().slice(0, 10), "2026-10-01");
  assert.equal(invoices.parseInvoiceInput({ ...invoice, invoicePaidDate: "2026-10-01", invoiceAmount: "-$1,234.56" }).invoiceAmount, "-1234.56");
  assert.equal(bills.parseBillInput({ ...bill, billAmount: "0" }).billAmount, "0.00");
  assert.equal(invoices.parseInvoiceInput({ ...invoice, invoiceAmount: "" }).invoiceAmount, null);
});

test("create APIs reject invalid payload types and field values before writing", async () => {
  for (const [route, base, cases] of [
    [bills, bill, [{ billAmount: "1.001" }, { billAmount: "" }, { billAmount: "10000000" },
      { projectId: true }, { companyName: {} }, { billDate: "0000-01-01" }, { billDueDate: "2026-10-23" }]],
    [invoices, invoice, [{ invoiceAmount: "1.001" }, { projectId: [] },
      { invoiceNo: {} }, { firstName: true }, { invoiceDueDate: "2026-10-23" }]],
  ]) {
    for (const patch of cases) {
      state.saves = [];
      const response = await route.POST(request({ ...base, ...patch }));
      assert.equal(response.status, 400, JSON.stringify(patch));
      assert.deepEqual(state.saves, []);
      assert.ok((await response.json()).error);
    }
    state.saves = [];
    assert.equal((await route.POST(request({ ...base }))).status, 201);
    assert.equal(state.saves.length, 1);
  }
});

test("bill/invoice edit APIs enforce the same dates, precision and value types as creation", async () => {
  for (const [route, base, cases] of [
    [billEdit, bill, [{ billDueDate: "2026-10-23" }, { billAmount: "12.345" }, { companyName: true }]],
    [invoiceEdit, invoice, [{ invoiceDueDate: "2026-10-23" }, { invoiceAmount: "12.345" }, { companyName: true }]],
  ]) {
    for (const patch of cases) {
      state.saves = [];
      assert.equal((await route.PUT(request({ ...base, ...patch }, "PUT"), { params: Promise.resolve({ id: "1" }) })).status, 400);
      assert.deepEqual(state.saves, []);
    }
    state.saves = [];
    assert.equal((await route.PUT(request(base, "PUT"), { params: Promise.resolve({ id: "1" }) })).status, 200);
    assert.equal(state.saves.length, 1);
  }
});

test("scope template create/edit share six-decimal quantity and two-decimal currency rules", async () => {
  const input = { templateName: "Fine aggregate", unitName: "SF", components: [{
    description: "Aggregate", lineType: "Material", quantityPerUnit: 0.000001, unitName: "TON",
    unitCost: "$1,234.56", materialId: null,
  }] };
  assert.equal(templates.parseScopeTemplate(input).components[0].quantityPerUnit, 0.000001);
  assert.equal(templates.parseScopeTemplate(input).components[0].unitCost, 1234.56);
  for (const patch of [{ quantityPerUnit: true }, { quantityPerUnit: "" }, { quantityPerUnit: 0.0000001 },
    { unitCost: 1.001 }, { materialId: true }, { materialId: 1.5 }, { description: {} }]) {
    const body = { ...input, components: [{ ...input.components[0], ...patch }] };
    for (const edit of [false, true]) {
      state.saves = [];
      const response = edit
        ? await template.PUT(request(body, "PUT"), { params: Promise.resolve({ scopeTemplateId: "1" }) })
        : await templates.POST(request(body));
      assert.equal(response.status, 400, JSON.stringify(patch));
      assert.deepEqual(state.saves, []);
    }
  }
  assert.equal((await templates.POST(request(input))).status, 201);
  assert.equal((await template.PUT(request(input, "PUT"), { params: Promise.resolve({ scopeTemplateId: "1" }) })).status, 200);
});
