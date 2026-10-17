import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import sql from "mssql";

const state = { queries: [], foreignMembership: false, existingUser: false, committed: false, rolledBack: false };
globalThis.memberBoundaryTest = state;
globalThis.memberBoundarySql = {
  ...sql,
  Transaction: class {
    async begin() {}
    async commit() { state.committed = true; }
    async rollback() { state.rolledBack = true; }
    request() {
      const inputs = {};
      return {
        input(name, _type, value) { inputs[name] = value; return this; },
        async query(query) {
          state.queries.push({ query, inputs });
          if (query.includes("SELECT AccessRoleID")) return { recordset: [{ AccessRoleID: 2 }] };
          if (query.includes("SELECT UserID FROM dbo.Users")) return { recordset: state.existingUser ? [{ UserID: 12 }] : [] };
          if (query.includes("SELECT MembershipID, IsActive")) return { recordset: [] };
          if (query.includes("SELECT MembershipID FROM")) return { recordset: state.foreignMembership ? [] : [{ MembershipID: 3 }] };
          return { recordset: [] };
        },
      };
    }
  },
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/app/lib/")) return nextResolve(new URL(`./${specifier.slice(10)}.ts`, import.meta.url).href, context);
    if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier) && context.parentURL?.includes("/app/lib/")) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === new URL("./db.ts", import.meta.url).href) {
      return { format: "module", shortCircuit: true, source: `
        export const sql = globalThis.memberBoundarySql;
        export const getPool = async () => ({});
      ` };
    }
    return nextLoad(url, context);
  },
});
const { updateOrganizationMember, addOrganizationMember } = await import("./account.ts");
function reset() {
  Object.assign(state, { queries: [], foreignMembership: false, existingUser: false, committed: false, rolledBack: false });
}

test("another organization's membership is rejected before any role or status changes", async () => {
  reset();
  state.foreignMembership = true;
  await assert.rejects(() => updateOrganizationMember(7, 99, { accessRoleId: 2, isActive: false }), /membership not found/);
  assert.equal(state.queries.length, 1);
  assert.equal(state.queries[0].inputs.organizationId, 7);
  assert.equal(state.queries[0].inputs.membershipId, 99);
  assert.match(state.queries[0].query, /OrganizationID = @organizationId AND MembershipID = @membershipId/);
  assert.equal(state.rolledBack, true);
  assert.equal(state.committed, false);
});

test("authorized membership changes scope role deletion and insertion to the same tenant", async () => {
  reset();
  await updateOrganizationMember(7, 3, { accessRoleId: 2, isActive: false });
  const deletion = state.queries.find(({ query }) => query.includes("DELETE FROM dbo.MembershipAccessRoles"));
  assert.match(deletion.query, /OrganizationID = @organizationId AND MembershipID = @membershipId/);
  assert.deepEqual(deletion.inputs, { organizationId: 7, membershipId: 3 });
  assert.equal(state.queries.find(({ query }) => query.includes("INSERT INTO dbo.MembershipAccessRoles")).inputs.organizationId, 7);
  assert.equal(state.committed, true);
});

test("an admin cannot attach someone else's existing account to a new tenant by email", async () => {
  reset();
  state.existingUser = true;
  await assert.rejects(() => addOrganizationMember(7, {
    email: "existing@example.com", displayName: "Existing", accessRoleId: 2,
  }), /accept an invitation/);
  assert.equal(state.queries.length, 3);
  assert.ok(state.queries.every(({ query }) => !/\b(INSERT|UPDATE|DELETE)\b/.test(query)));
  assert.equal(state.rolledBack, true);
  assert.equal(state.committed, false);
});
