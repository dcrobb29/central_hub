import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const state = { calls: [], roles: [], employees: [], tracked: [], committed: false };
globalThis.sampleRoleCleanupTest = state;

class Request {
  inputs = {};
  input(name, _type, value) { this.inputs[name] = value; return this; }
  async query(query) {
    state.calls.push({ query, inputs: { ...this.inputs } });
    if (query.includes("SELECT TableName, RecordKey")) {
      return { recordset: state.tracked.filter((row) => row.org === this.inputs.orgId) };
    }
    if (query.includes("DELETE r FROM dbo.Roles r")) {
      assert.match(query, /r\.OrganizationID = @orgId/);
      assert.match(query, /NOT EXISTS\s*\(\s*SELECT 1 FROM dbo\.Employees e WHERE e\.RoleID = r\.RoleID\s*\)/);
      assert.ok(!query.includes("IsActive"), "inactive personnel also protect their roles");
      const ids = query.match(/r\.RoleID IN \(([^)]+)\)/)[1].split(",").map(Number);
      state.roles = state.roles.filter((role) =>
        role.org !== this.inputs.orgId || !ids.includes(role.id) ||
        state.employees.some((employee) => employee.roleId === role.id));
    }
    if (query.includes("DELETE FROM dbo.SampleDataRecords")) {
      state.tracked = state.tracked.filter((row) => row.org !== this.inputs.orgId);
    }
    return { recordset: [], rowsAffected: [1] };
  }
}

state.pool = { request: () => new Request() };
state.sql = {
  Int: "int", NVarChar: () => "nvarchar",
  Transaction: class {
    request() { return new Request(); }
    async begin() {}
    async commit() { state.committed = true; }
    async rollback() { state.committed = false; }
  },
};

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
      source: "export const getPool = async () => globalThis.sampleRoleCleanupTest.pool; export const sql = globalThis.sampleRoleCleanupTest.sql;",
    };
    if (url === new URL("./auth.ts", import.meta.url).href) return {
      format: "module", shortCircuit: true,
      source: "export const getActiveOrganizationId = async () => { throw new Error('An explicit organization is required by this test'); };",
    };
    return nextLoad(url, context);
  },
});

const { excludeSampleData } = await import("./sample-data.ts");

test("sample cleanup preserves adopted titles and deletes only unused tracked titles in its organization", async () => {
  state.calls = [];
  state.committed = false;
  state.roles = [
    { id: 1, org: 11 }, // Unused sample title.
    { id: 2, org: 11 }, // Adopted by active personnel.
    { id: 3, org: 11 }, // Adopted by inactive personnel.
    { id: 4, org: 11 }, // Pre-existing, untracked title.
    { id: 5, org: 22 }, // Another organization's title.
  ];
  state.employees = [
    { roleId: 2, isActive: true },
    { roleId: 3, isActive: false },
  ];
  state.tracked = [1, 2, 3, 5].map((id) => ({ org: 11, TableName: "Roles", RecordKey: String(id) }));
  state.tracked.push({ org: 22, TableName: "Roles", RecordKey: "5" });

  const result = await excludeSampleData(11);
  assert.equal(result.success, true);
  assert.equal(state.committed, true);
  assert.deepEqual(state.roles.map((role) => role.id), [2, 3, 4, 5]);
  assert.deepEqual(state.tracked, [{ org: 22, TableName: "Roles", RecordKey: "5" }]);
  assert.equal(state.employees.length, 2);

  state.calls = [];
  await excludeSampleData(11);
  assert.ok(!state.calls.some(({ query }) => query.includes("DELETE r FROM dbo.Roles")));
});
