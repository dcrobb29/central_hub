import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import sql from "mssql";
import { canWinEstimate, ESTIMATE_STATUSES, isEditableEstimateStatus, matchesEstimateStatus } from "./estimate-status.ts";

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
            EstimateName: "Test bid", EstimateStatus: state.status, EstimateRevisionID: 10,
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
  assert.deepEqual(ESTIMATE_STATUSES, ["Draft", "Won", "Lost"]);
  for (const status of ["Draft", "Lost"]) assert.equal(isEditableEstimateStatus(status), true);
  for (const value of ["Won", "Sent", "Approved", "Not approved", "Active", "sent", "", null, undefined, {}, 1]) assert.equal(isEditableEstimateStatus(value), false);
  for (const status of ["Draft"]) assert.equal(canWinEstimate(status), true);
  for (const status of ["Won", "Lost", "Sent", "Approved", "Not approved", "Active"]) assert.equal(canWinEstimate(status), false);
});

test("list filters and counts match exact statuses within each engagement tab", () => {
  const estimates = [
    { id: 1, engagement: "Project", status: "Draft" },
    { id: 2, engagement: "Project", status: "Draft" },
    { id: 3, engagement: "Project", status: "Won" },
    { id: 4, engagement: "Project", status: "Lost" },
    { id: 5, engagement: "Service", status: "Lost" },
    { id: 6, engagement: "Service", status: "Won" },
  ];
  for (const [engagement, expected] of [
    ["Project", { All: [1, 2, 3, 4], Draft: [1, 2], Won: [3], Lost: [4] }],
    ["Service", { All: [5, 6], Draft: [], Won: [6], Lost: [5] }],
  ]) {
    const tab = estimates.filter((estimate) => estimate.engagement === engagement);
    for (const filter of ["All", ...ESTIMATE_STATUSES]) {
      const matches = tab.filter((estimate) => matchesEstimateStatus(estimate.status, filter));
      assert.deepEqual(matches.map((estimate) => estimate.id), expected[filter]);
      assert.equal(matches.length, expected[filter].length);
    }
    for (const filter of ["Sent", "Approved", "Not approved"]) {
      assert.equal(tab.filter((estimate) => matchesEstimateStatus(estimate.status, filter)).length, 0);
    }
  }
});

test("Draft and Lost transitions persist with organization and base-document scoping", async () => {
  for (const before of ["Draft", "Lost"]) {
    for (const after of ["Draft", "Lost"]) {
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
  await assert.rejects(() => setEstimateStatus(12, 7, "Draft"), (error) => error.status === 409);
  assert.equal(state.rolledBack, true);
  assert.equal(state.queries.length, 1);
  state = fixture();
  state.missing = true;
  await assert.rejects(() => setEstimateStatus(12, 7, "Lost"), (error) => error.status === 404);
  assert.equal(state.rolledBack, true);
  for (const status of ["Won", "Sent", "Approved", "Not approved"]) {
    state = fixture();
    await assert.rejects(() => setEstimateStatus(12, 7, status), (error) => error.status === 400);
    assert.equal(state.queries.length, 0);
  }
  state = fixture();
  state.failure = new Error("Database write failed");
  await assert.rejects(() => setEstimateStatus(12, 7, "Lost"), /Database write failed/);
  assert.equal(state.rolledBack, true);
  assert.equal(state.committed, false);
});

test("only Draft can be won with alternate approval; rejected statuses cannot create projects", async () => {
  for (const status of ["Draft"]) {
    const state = fixture(status);
    const projectId = await winEstimate(12, {
      selections: [{ changeId: 4, version: 1 }], userId: 1, approvedAt: "2026-10-16", reference: "Customer approval",
    });
    assert.equal(projectId, 99);
    assert.equal(state.status, "Won");
    assert.equal(state.committed, true);
    assert.equal(state.approvals[0][1].status, status);
    const insert = state.queries.find(({ query }) => query.includes("INSERT INTO dbo.Projects"));
    assert.equal(insert.inputs.status, "Upcoming");
    assert.equal(insert.inputs.org, 7);
    assert.match(state.queries[0].query, /UPDLOCK, HOLDLOCK/);
  }
  for (const status of ["Lost", "Won", "Sent", "Approved", "Not approved"]) {
    const state = fixture(status);
    await assert.rejects(() => winEstimate(12), /not-draft/);
    assert.equal(state.queries.length, 1);
    assert.equal(state.rolledBack, true);
  }
});

test("reopening Lost enables winning once, without a duplicate project", async () => {
  const state = fixture("Lost");
  await setEstimateStatus(12, 7, "Draft");
  assert.equal(await winEstimate(12), 99);
  assert.equal(state.status, "Won");
  await assert.rejects(() => winEstimate(12), /not-draft/);
  assert.equal(state.queries.filter(({ query }) => query.includes("INSERT INTO dbo.Projects")).length, 1);
});

test("a failed Won update rolls back project creation", async () => {
  const state = fixture();
  state.failure = new Error("Database write failed");
  await assert.rejects(() => winEstimate(12), /Database write failed/);
  assert.equal(state.committed, false);
  assert.equal(state.rolledBack, true);
  assert.equal(state.queries.filter(({ query }) => query.includes("INSERT INTO dbo.Projects")).length, 1);
});

function request(status, estimateId = 12) {
  return new Request("http://localhost/api/sales/estimates", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "set-status", estimateId, status }),
  });
}

test("set-status API validates input, checks sales.write, and returns persisted status", async () => {
  for (const status of ["Draft", "Lost"]) {
    const state = fixture();
    const response = await PATCH(request(status));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { estimateId: 12, status });
    assert.deepEqual(state.permissions, ["sales.write"]);
    assert.equal(state.status, status);
  }
  for (const status of ["Won", "Sent", "Approved", "Not approved", "Active", null, "sent", {}]) {
    const state = fixture();
    assert.equal((await PATCH(request(status))).status, 400);
    assert.equal(state.queries.length, 0);
  }
  assert.equal((await PATCH(request("Draft", -1))).status, 400);
});

test("set-status API reports locked, missing, and unauthorized records explicitly", async () => {
  let state = fixture("Won");
  assert.equal((await PATCH(request("Lost"))).status, 409);
  state = fixture();
  state.missing = true;
  assert.equal((await PATCH(request("Draft"))).status, 404);
  state = fixture();
  state.accessError = new ProjectAccessError("Permission denied.", 403);
  assert.equal((await PATCH(request("Draft"))).status, 403);
  assert.equal(state.queries.length, 0);
});

function winRequest() {
  return new Request("http://localhost/api/sales/estimates", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "mark-won", estimateId: 12 }),
  });
}

test("mark-won API creates a project only for Draft and scopes access to the company", async () => {
  const state = fixture();
  const response = await PATCH(winRequest());
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { estimateId: 12, projectId: 99 });
  assert.deepEqual(state.permissions, ["sales.write"]);
  assert.equal(state.status, "Won");
  assert.equal(state.queries[0].inputs.org, 7);
  assert.match(state.queries[0].query, /OrganizationID=@org AND DocumentKind='Base'/);
  for (const status of ["Lost", "Won", "Sent"]) {
    const rejected = fixture(status);
    const response = await PATCH(winRequest());
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.match(body.error, /Only Draft estimates/);
    assert.doesNotMatch(body.error, /Sent/);
    assert.equal(rejected.queries.some(({ query }) => query.includes("INSERT INTO dbo.Projects")), false);
  }
});

test("mark-won API refuses missing or foreign estimates before conversion", async () => {
  const state = fixture();
  state.missing = true;
  assert.equal((await PATCH(winRequest())).status, 404);
  assert.equal(state.queries.length, 1);
  assert.equal(state.committed, false);
});
