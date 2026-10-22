import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

// Org 22 owns material 7 and scope template 9; every other organization owns nothing.
const state = { calls: [] };
globalThis.libraryIsolationTest = state;

function runQuery(query, inputs) {
  state.calls.push({ query, inputs: { ...inputs } });
  const q = query.replace(/\s+/g, " ").trim();
  const owner = inputs.orgId === 22;
  if (q.startsWith("SELECT 1 AS found FROM dbo.Materials")) {
    return { recordset: owner && inputs.materialId === 7 ? [{ found: 1 }] : [] };
  }
  if (q.includes("INSERT INTO dbo.ScopeTemplates ")) return { recordset: [{ ScopeTemplateID: 9 }], rowsAffected: [1] };
  if (q.includes("UPDATE dbo.ScopeTemplates SET")) {
    return { recordset: [], rowsAffected: [owner && inputs.scopeTemplateId === 9 ? 1 : 0] };
  }
  if (q.includes("FROM dbo.ScopeTemplates") && q.startsWith("SELECT ScopeTemplateID")) {
    return { recordset: owner && inputs.scopeTemplateId === 9 ? [{ ScopeTemplateID: 9, TemplateName: "T", UnitName: "SF" }] : [] };
  }
  if (q.includes("INSERT INTO dbo.MaterialPrices")) {
    return { recordset: [], rowsAffected: [owner && inputs.materialId === 7 ? 1 : 0] };
  }
  return { recordset: [], rowsAffected: [1] };
}

class FakeRequest {
  constructor() { this.inputs = {}; }
  input(name, _type, value) { this.inputs[name] = value; return this; }
  async query(query) { return runQuery(query, this.inputs); }
}

const type = () => "t";
state.sql = {
  Int: "int", Bit: "bit", Date: "date", MAX: "max",
  VarChar: type, NChar: type, NVarChar: type, Decimal: type,
  Transaction: class { constructor() { return { request: () => new FakeRequest(), begin: async () => {}, commit: async () => {}, rollback: async () => {} }; } },
};
state.pool = { request: () => new FakeRequest() };

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/app/lib/")) {
      return nextResolve(new URL(`./${specifier.slice("@/app/lib/".length)}.ts`, import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === new URL("./db.ts", import.meta.url).href) return {
      format: "module", shortCircuit: true,
      source: "export const getPool = async () => globalThis.libraryIsolationTest.pool; export const sql = globalThis.libraryIsolationTest.sql;",
    };
    return nextLoad(url, context);
  },
});

const materials = await import("./materials.ts");
const templates = await import("./scope-templates.ts");

const component = (materialId) => ({ description: "x", lineType: "Material", quantityPerUnit: 1, unitName: "ea", unitCost: 1, materialId });
const templateInput = (materialId) => ({ templateName: "T", unitName: "SF", components: [component(materialId)] });

test("every library query is bound to an organization", async () => {
  state.calls = [];
  await materials.getMaterialsWithLatestPrice(11);
  await materials.getMaterialPriceHistory(11, 7);
  await templates.getScopeTemplates(11);
  await templates.getScopeTemplateDetails(11, 9);
  for (const { query, inputs } of state.calls) {
    assert.match(query, /OrganizationID = @org(Id)?/i, query);
    assert.equal(inputs.orgId ?? inputs.organizationId, 11);
  }
});

test("another organization cannot read or change a template", async () => {
  assert.equal(await templates.getScopeTemplateDetails(11, 9), null);
  assert.ok(await templates.getScopeTemplateDetails(22, 9));
  await assert.rejects(() => templates.updateScopeTemplate(11, 9, templateInput(null)), { status: 404 });
  await assert.rejects(() => templates.deleteScopeTemplate(11, 9), { status: 404 });
  await templates.deleteScopeTemplate(22, 9);
});

test("a failed update never reaches the component delete", async () => {
  state.calls = [];
  await assert.rejects(() => templates.updateScopeTemplate(11, 9, templateInput(null)), { status: 404 });
  assert.ok(!state.calls.some(({ query }) => query.includes("DELETE dbo.ScopeTemplateComponents") || query.includes("DELETE FROM dbo.ScopeTemplateComponents")));
});

test("templates reject another organization's material and set the organization on insert", async () => {
  await assert.rejects(() => templates.createScopeTemplate(11, templateInput(7)), { status: 400 });
  state.calls = [];
  assert.equal(await templates.createScopeTemplate(22, templateInput(7)), 9);
  const inserts = state.calls.filter(({ query }) => query.includes("INSERT INTO"));
  assert.equal(inserts.length, 2);
  for (const { query, inputs } of inserts) {
    assert.match(query, /OrganizationID/);
    assert.equal(inputs.orgId, 22);
  }
});

test("prices cannot be added to another organization's material", async () => {
  const price = { unitCost: 1, quotedDate: "2040-01-01", vendorName: null, notes: null };
  await assert.rejects(() => materials.addMaterialPrice(11, 7, price), { status: 404 });
  await materials.addMaterialPrice(22, 7, price);
});
