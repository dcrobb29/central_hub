import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import crypto from "node:crypto";
import sql from "mssql";

process.env.SESSION_SECRET = crypto.randomBytes(32).toString("hex");
const state = { rows: [], queries: [], inputs: {}, session: null, queryError: null };
globalThis.loginAccessTest = state;
globalThis.loginAccessSql = sql;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/app/lib/")) return nextResolve(new URL(`./${specifier.slice("@/app/lib/".length)}.ts`, import.meta.url).href, context);
    if (specifier.startsWith("./") && !/\.[a-z]+$/.test(specifier) && context.parentURL?.includes("/app/lib/")) return nextResolve(`${specifier}.ts`, context);
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === new URL("./db.ts", import.meta.url).href) return {
      format: "module", shortCircuit: true,
      source: `export const sql = globalThis.loginAccessSql;
        export const getPool = async () => ({request: () => ({
          input(name, type, value) { globalThis.loginAccessTest.inputs[name] = value; return this; },
          async query(query) {
            globalThis.loginAccessTest.queries.push(query);
            if (globalThis.loginAccessTest.queryError) throw globalThis.loginAccessTest.queryError;
            return {recordset: globalThis.loginAccessTest.rows};
          }
        })});`,
    };
    if (url === new URL("./project-access.ts", import.meta.url).href) return {
      format: "module", shortCircuit: true,
      source: `import { ProjectAccessError } from "./project-access-error.ts";
        export { ProjectAccessError };
        export const requireProjectSession = async () => {
          if (!globalThis.loginAccessTest.session) throw new ProjectAccessError("Please sign in.", 401);
          return globalThis.loginAccessTest.session;
        };`,
    };
    return nextLoad(url, context);
  },
});

const { authenticateUser, hashPassword, getActiveOrganizationId, verifyActiveSessionToken } = await import("./auth.ts");
const { getCurrentSession } = await import("./account.ts");
const loginRoute = await import("../api/account/login/route.ts");
const sessionRoute = await import("../api/account/session/route.ts");
const { NextRequest } = await import("next/server.js");
const { middleware } = await import("../../middleware.ts");
const { signSessionToken } = await import("./auth.ts");

test("page and API entry points reject fabricated cookies; login stays public", async () => {
  state.rows = [{ OrganizationID: 7 }];
  assert.equal((await middleware(new NextRequest("http://localhost/api/account/settings"))).status, 401);
  assert.equal((await middleware(new NextRequest("http://localhost/projects", {
    headers: { cookie: "central_hub_session=forged" },
  }))).status, 307);
  assert.equal((await middleware(new NextRequest("http://localhost/api/account/settings", {
    headers: { cookie: "central_hub_session=forged" },
  }))).status, 401);
  assert.equal((await middleware(new NextRequest("http://localhost/login"))).status, 200);
  const token = signSessionToken({ userId: 12, email: "owner@example.com", displayName: "Owner" });
  assert.equal((await middleware(new NextRequest("http://localhost/projects", {
    headers: { cookie: `central_hub_session=${token}` },
  }))).status, 200);
});

test("organization lookup requires an authenticated identity and never uses a fallback", async () => {
  state.rows = [{ OrganizationID: 7 }];
  state.queries = [];
  for (const request of [
    new NextRequest("http://localhost/api/finances/invoices"),
    new NextRequest("http://localhost/api/finances/invoices", { headers: { cookie: "central_hub_session=forged" } }),
  ]) {
    await assert.rejects(() => getActiveOrganizationId(request), (error) => error.status === 401);
  }
  assert.equal(state.queries.length, 0);

  const token = signSessionToken({ userId: 12, email: "owner@example.com", displayName: "Owner" });
  const headers = { cookie: `central_hub_session=${token}` };
  assert.equal(await getActiveOrganizationId(new NextRequest("http://localhost/api/finances/invoices", { headers })), 7);
  assert.equal(await getActiveOrganizationId(new Request("http://localhost/api/finances/invoices", { headers })), 7);
  assert.equal(state.inputs.userId, 12);
  assert.equal(state.inputs.email, "owner@example.com");
  assert.equal(state.queries.length, 2);
  for (const query of state.queries) {
    assert.match(query, /u\.UserID = @userId/);
    assert.match(query, /u\.NormalizedEmail = @email/);
    assert.match(query, /u\.IsActive = 1/);
    assert.match(query, /m\.IsActive = 1/);
    assert.match(query, /o\.Status <> 'Archived'/);
    assert.match(query, /ORDER BY m\.OrganizationID, m\.MembershipID/);
  }
});

test("revocation takes effect on the next request even with the same signed cookie", async () => {
  const token = signSessionToken({ userId: 12, email: "owner@example.com", displayName: "Owner" });
  const request = (path) => new NextRequest(`http://localhost${path}`, {
    headers: { cookie: `central_hub_session=${token}` },
  });
  state.rows = [{ OrganizationID: 7 }];
  assert.equal((await middleware(request("/api/finances/invoices"))).status, 200);
  assert.equal((await middleware(request("/login"))).status, 307);
  state.rows = [];
  state.queries = [];
  assert.equal(await verifyActiveSessionToken(token), null);
  await assert.rejects(() => getActiveOrganizationId(request("/api/finances/invoices")), (error) => error.status === 401);
  assert.equal(state.queries.length, 2);
  assert.equal((await middleware(request("/api/finances/invoices"))).status, 401);
  const page = await middleware(request("/projects"));
  assert.equal(page.status, 307);
  assert.equal(new URL(page.headers.get("location")).pathname, "/login");
  assert.equal((await middleware(request("/login"))).status, 200);
});

test("database failures deny access explicitly and do not select another organization", async () => {
  const token = signSessionToken({ userId: 12, email: "owner@example.com", displayName: "Owner" });
  const request = new NextRequest("http://localhost/api/finances/invoices", {
    headers: { cookie: `central_hub_session=${token}` },
  });
  state.queryError = new Error("Test database unavailable");
  state.queries = [];
  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);
  try {
    await assert.rejects(() => getActiveOrganizationId(request), /Test database unavailable/);
    assert.equal(state.queries.length, 1);
    const response = await middleware(request);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "Authentication is unavailable." });
    assert.equal(errors.length, 1);
    assert.equal((await middleware(new NextRequest("http://localhost/api/account/login", { method: "POST" }))).status, 200);
    assert.equal((await middleware(new NextRequest("http://localhost/api/account/logout", { method: "POST" }))).status, 200);
  } finally {
    state.queryError = null;
    console.error = originalError;
  }
});

test("login no longer exposes a GET account/password directory", () => {
  assert.equal(loginRoute.GET, undefined);
});

test("missing, inactive, uncredentialed and wrong-password users fail generically", async () => {
  const hash = hashPassword("A private account password");
  for (const rows of [
    [],
    [{ IsActive: false, PasswordHash: hash }],
    [{ IsActive: true, PasswordHash: null }],
    [{ IsActive: true, PasswordHash: hash }],
  ]) {
    state.rows = rows;
    assert.deepEqual(await authenticateUser("owner@example.com", "Password1!"), {
      success: false, error: "Invalid email or password.",
    });
  }
  state.rows = [{ UserID: 12, Email: "owner@example.com", DisplayName: "Owner", Phone: null, IsActive: true, PasswordHash: hash }];
  assert.equal((await authenticateUser("owner@example.com", "A private account password")).success, true);
});

test("unknown session identity never falls back to the first organization owner", async () => {
  state.rows = [];
  state.queries = [];
  await assert.rejects(() => getCurrentSession("unknown@example.com"), /No active organization user/);
  assert.equal(state.queries.length, 1);
  assert.match(state.queries[0], /u\.IsActive = 1/);
  assert.match(state.queries[0], /m\.IsActive = 1/);
  assert.match(state.queries[0], /o\.Status <> 'Archived'/);
  assert.match(state.queries[0], /ORDER BY m\.OrganizationID, m\.MembershipID/);
  await assert.rejects(() => getCurrentSession(""), /authenticated email/);
  assert.equal(state.queries.length, 1);
});

test("session lookup by email and profile writes require authentication", async () => {
  state.session = null;
  state.queries = [];
  const response = await sessionRoute.GET(new NextRequest("http://localhost/api/account/session?email=owner@example.com"));
  assert.equal(response.status, 401);
  const patch = await sessionRoute.PATCH(new NextRequest("http://localhost/api/account/session", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: 12 }),
  }));
  assert.equal(patch.status, 401);
  assert.equal(state.queries.length, 0);
});

test("authenticated users cannot edit another user's profile", async () => {
  state.session = { user: { userId: 12, email: "owner@example.com" } };
  state.queries = [];
  const response = await sessionRoute.PATCH(new NextRequest("http://localhost/api/account/session", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: 13, displayName: "Changed" }),
  }));
  assert.equal(response.status, 403);
  assert.equal(state.queries.length, 0);
});
