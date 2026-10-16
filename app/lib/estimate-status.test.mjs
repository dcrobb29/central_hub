import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import sql from "mssql";
import { canWinEstimate, ESTIMATE_STATUSES, isEditableEstimateStatus } from "./estimate-status.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/app/lib/")) return nextResolve(new URL(`./${specifier.slice("@/app/lib/".length)}.ts`, import.meta.url).href, context);
    if (specifier.startsWith("./") && !/\.[a-z]+$/.test(specifier) && context.parentURL?.includes("/app/lib/")) return nextResolve(`${specifier}.ts`, context);
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    const sources = {
      "db.ts": "export const getPool = async () => globalThis.estimateStatusDb.pool; export const sql = globalThis.estimateStatusDb.sql;",
      "project-billing.ts": "export const ensureProjectBillingSnapshot = async () => {};",
      "contract-changes.ts": "export const approveChangeInTransaction = async (...args) => { globalThis.estimateStatusDb.approvals.push(args); }; export const saveContractChangeInTransaction = async () => {};",
      "project-access.ts": `export { ProjectAccessError } from "./project-access-error.ts";
        export const requireProjectSession = async (_request, permission) => {
          globalThis.estimateStatusDb.permissions.push(permission);
          if (globalThis.estimateStatusDb.accessError) throw globalThis.estimateStatusDb.accessError;
          return { organization: { organizationId: 7 }, user: { userId: 1 }, permissions: [] };
        };`,
    };
    for (const [file, source] of Object.entries(sources)) {
      if (url === new URL(`./${file}`, import.meta.url).href) return { format: "module", shortCircuit: true, source };
    }
    return nextLoad(url, context);
  },
});

fixture();
const { setEstimateStatus, winEstimate } = await import("./estimates.ts");
const { ProjectAccessError } = await import("./project-access-error.ts");
const { PATCH } = await import("../api/sales/estimates/route.ts");

function fixture(status = "Draft") {
  const state = {
    status, queries: [], permissions: [], approvals: [], committed: false, rolledBack: false,
    missing: false, failure: null, accessError: null,
  };
  const transaction = {
    begin: async () => {},
    commit: async () => { state.committed = true; },
    rollback: async () => { state.rolledBack = true; },
    request() {
      const inputs = {};
      return {
        input(name, _type, value) { inputs[name] = value; return this; },
        async query(query) {
          state.queries.push({ query, inputs });
          if (query.includes("UPDATE dbo.Estimates")) {
            if (state.failure) throw state.failure;
            state.status = inputs.status ?? "Won";
            return { recordset: [] };
          }
          if (query.includes("INSERT INTO dbo.Projects")) return { recordset: [{ ProjectID: 99 }] };
          if (query.includes("SELECT e.EstimateName")) return { recordset: [{
            EstimateName: "Sent bid", EstimateStatus: state.status, EstimateRevisionID: 10,
            EngagementType: "Project", OrganizationID: 7, QuotedTotal: 100,
          }] };
          return { recordset: state.missing ? [] : [{ status: state.status }] };
        },
      };
    },
  };
  state.pool = transaction;
  state.sql = { ...sql, Transaction: class { constructor() { return globalThis.estimateStatusDb.pool; } } };
  globalThis.estimateStatusDb = state;
  return state;
}

test("estimate statuses and approval eligibility are separate from project statuses", () => {
  assert.deepEqual(ESTIMATE_STATUSES, ["Draft", "Sent", "Won", "Lost"]);
  for (const status of ["Draft", "Sent", "Lost"]) assert.equal(isEditableEstimateStatus(status), true);
  for (const value of ["Won", "Active", "sent", "", null, undefined, {}, 1]) assert.equal(isEditableEstimateStatus(value), false);
  for (const status of ["Draft", "Sent"]) assert.equal(canWinEstimate(status), true);
  for (const status of ["Won", "Lost", "Active"]) assert.equal(canWinEstimate(status), false);
});

test("Draft, Sent, and Lost transitions persist with organization and base-document scoping", async () => {
  for (const before of ["Draft", "Sent", "Lost"]) {
    for (const after of ["Draft", "Sent", "Lost"]) {
      const state = fixture(before);
      await setEstimateStatus(12, 7, after);
      assert.equal(state.status, after);
      assert.equal(state.committed, true);
      assert.equal(state.rolledBack, false);
      assert.equal(state.queries.length, 2);
      for (const { query, inputs } of state.queries) {
        assert.equal(inputs.id, 12);
        assert.equal(inputs.org, 7);
        assert.match(query, /OrganizationID=@org AND DocumentKind='Base'/);
      }
      assert.match(state.queries[0].query, /UPDLOCK, HOLDLOCK/);
    }
  }
});

test("won, missing, invalid, and failed writes never commit", async () => {
  let state = fixture("Won");
  await assert.rejects(() => setEstimateStatus(12, 7, "Sent"), (error) => error.status === 409);
  assert.equal(state.rolledBack, true);
  assert.equal(state.queries.length, 1);
  state = fixture();
  state.missing = true;
  await assert.rejects(() => setEstimateStatus(12, 7, "Lost"), (error) => error.status === 404);
  assert.equal(state.rolledBack, true);
  state = fixture();
  await assert.rejects(() => setEstimateStatus(12, 7, "Won"), (error) => error.status === 400);
  assert.equal(state.queries.length, 0);
  state = fixture();
  state.failure = new Error("Database write failed");
  await assert.rejects(() => setEstimateStatus(12, 7, "Sent"), /Database write failed/);
  assert.equal(state.rolledBack, true);
  assert.equal(state.committed, false);
});

test("Draft and Sent can be won with approval; Lost and Won cannot create projects", async () => {
  for (const status of ["Draft", "Sent"]) {
    const state = fixture(status);
    const projectId = await winEstimate(12, {
      selections: [{ changeId: 4, version: 1 }], userId: 1, approvedAt: "2026-10-16", reference: "Customer approval",
    });
    assert.equal(projectId, 99);
    assert.equal(state.status, "Won");
    assert.equal(state.committed, true);
    assert.equal(state.approvals[0][1].status, status);
  }
  for (const status of ["Lost", "Won"]) {
    const state = fixture(status);
    await assert.rejects(() => winEstimate(12), /not-draft/);
    assert.equal(state.queries.length, 1);
    assert.equal(state.rolledBack, true);
  }
});

function request(status, estimateId = 12) {
  return new Request("http://localhost/api/sales/estimates", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "set-status", estimateId, status }),
  });
}

test("set-status API validates input, checks sales.write, and returns persisted status", async () => {
  for (const status of ["Draft", "Sent", "Lost"]) {
    const state = fixture();
    const response = await PATCH(request(status));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { estimateId: 12, status });
    assert.deepEqual(state.permissions, ["sales.write"]);
    assert.equal(state.status, status);
  }
  for (const status of ["Won", "Active", null, "sent", {}]) {
    const state = fixture();
    assert.equal((await PATCH(request(status))).status, 400);
    assert.equal(state.queries.length, 0);
  }
  assert.equal((await PATCH(request("Sent", -1))).status, 400);
});

test("set-status API reports locked, missing, and unauthorized records explicitly", async () => {
  let state = fixture("Won");
  assert.equal((await PATCH(request("Lost"))).status, 409);
  state = fixture();
  state.missing = true;
  assert.equal((await PATCH(request("Sent"))).status, 404);
  state = fixture();
  state.accessError = new ProjectAccessError("Permission denied.", 403);
  assert.equal((await PATCH(request("Sent"))).status, 403);
  assert.equal(state.queries.length, 0);
});
