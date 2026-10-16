import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import crypto from "node:crypto";
import sql from "mssql";

process.env.SESSION_SECRET = crypto.randomBytes(32).toString("hex");
const state = { rows: [], queries: [], session: null };
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
          input() { return this; },
          async query(query) { globalThis.loginAccessTest.queries.push(query); return {recordset: globalThis.loginAccessTest.rows}; }
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

const { authenticateUser, hashPassword } = await import("./auth.ts");
const { getCurrentSession } = await import("./account.ts");
const loginRoute = await import("../api/account/login/route.ts");
const sessionRoute = await import("../api/account/session/route.ts");
const { NextRequest } = await import("next/server.js");
const { middleware } = await import("../../middleware.ts");
const { signSessionToken } = await import("./auth.ts");

test("page and API entry points reject fabricated cookies; login stays public", () => {
  assert.equal(middleware(new NextRequest("http://localhost/api/account/settings")).status, 401);
  assert.equal(middleware(new NextRequest("http://localhost/projects", {
    headers: { cookie: "central_hub_session=forged" },
  })).status, 307);
  assert.equal(middleware(new NextRequest("http://localhost/api/account/settings", {
    headers: { cookie: "central_hub_session=forged" },
  })).status, 401);
  assert.equal(middleware(new NextRequest("http://localhost/login")).status, 200);
  const token = signSessionToken({ userId: 12, email: "owner@example.com", displayName: "Owner" });
  assert.equal(middleware(new NextRequest("http://localhost/projects", {
    headers: { cookie: `central_hub_session=${token}` },
  })).status, 200);
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
