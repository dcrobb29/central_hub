import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { defaultAppearance } from "./appearance.ts";

const state = { userId: 11, records: new Map(), calls: [], offline: false };
globalThis.appearanceRouteTest = state;
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubs = {
      "next/server": "appearance-next-stub",
      "@/app/lib/project-access": "appearance-access-stub",
      "./db": "appearance-db-stub",
    };
    if (stubs[specifier]) return { url: new URL(`./${stubs[specifier]}.mjs`, import.meta.url).href, shortCircuit: true };
    if (specifier.startsWith("@/app/lib/")) return nextResolve(new URL(`./${specifier.slice(10)}.ts`, import.meta.url).href, context);
    if (specifier === "./appearance") return nextResolve(new URL("./appearance.ts", import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    let source;
    if (url.endsWith("/appearance-next-stub.mjs")) source = `
      export class NextResponse extends Response {
        static json(body, init) { return new NextResponse(JSON.stringify(body), init); }
      }`;
    if (url.endsWith("/appearance-access-stub.mjs")) source = `
      export class ProjectAccessError extends Error { constructor(message, status) { super(message); this.status = status; } }
      export async function requireProjectSession() {
        const id = globalThis.appearanceRouteTest.userId;
        if (!id) throw new ProjectAccessError("Please sign in.", 401);
        return { user: { userId: id }, permissions: [] };
      }`;
    if (url.endsWith("/appearance-db-stub.mjs")) source = `
      export const sql = { Int: 1, NVarChar: n => n };
      export async function getPool() {
        return { request() {
          const inputs = {};
          return {
            input(name, type, value) { inputs[name] = value; return this; },
            async query(query) {
              const s = globalThis.appearanceRouteTest;
              if (s.offline) throw new Error("offline");
              s.calls.push({ inputs, query });
              if (query.includes("UPDATE")) {
                s.records.set(inputs.userId, inputs.preferences);
                return { recordset: [] };
              }
              return { recordset: s.records.has(inputs.userId) ? [{ PreferencesJson: s.records.get(inputs.userId) }] : [] };
            }
          };
        } };
      }`;
    return source ? { format: "module", shortCircuit: true, source } : nextLoad(url, context);
  },
});
const { GET, PUT } = await import("../api/account/appearance/route.ts");
const headers = { origin: "https://overhead.example", "content-type": "application/json", "sec-fetch-site": "same-origin" };
process.env.PUBLIC_APP_URL = "https://overhead.example";
const request = (body, extra = {}) => new Request("https://overhead.example/api/account/appearance", {
  method: "PUT", headers: { ...headers, ...extra }, body: JSON.stringify(body),
});

test("preferences are private per authenticated user, persist, and need no organization permission", async () => {
  assert.deepEqual(await (await GET(request({}))).json(), defaultAppearance());
  const custom = { ...defaultAppearance(), followSystem: false, slotB: "vision" };
  assert.equal((await PUT(request(custom))).status, 200);
  assert.deepEqual(await (await GET(request({}))).json(), custom);
  state.userId = 22;
  assert.deepEqual(await (await GET(request({}))).json(), defaultAppearance());
  assert.equal((await PUT(request(defaultAppearance()))).status, 200);
  state.userId = 11;
  assert.deepEqual(await (await GET(request({}))).json(), custom);
  assert.ok(state.calls.every(call => call.query.includes("@userId")));
  assert.match(state.calls.find(call => call.query.includes("UPDATE")).query, /UPDLOCK, SERIALIZABLE/);
});

test("anonymous, cross-origin, non-JSON and user-ID injection requests cannot write", async () => {
  const count = state.calls.length;
  state.userId = null;
  assert.equal((await PUT(request(defaultAppearance()))).status, 401);
  assert.equal((await GET(request({}))).status, 401);
  state.userId = 11;
  assert.equal((await PUT(request(defaultAppearance(), { origin: "https://attacker.example" }))).status, 403);
  assert.equal((await PUT(request(defaultAppearance(), { "sec-fetch-site": "cross-site" }))).status, 403);
  assert.equal((await PUT(request(defaultAppearance(), { "content-type": "text/plain" }))).status, 415);
  assert.equal((await PUT(request({ ...defaultAppearance(), userId: 22 }))).status, 400);
  assert.equal(state.calls.length, count);
});

test("database errors are surfaced, not replaced with successful defaults", async () => {
  state.offline = true;
  try {
    assert.equal((await GET(request({}))).status, 503);
    assert.equal((await PUT(request(defaultAppearance()))).status, 503);
  } finally {
    state.offline = false;
  }
});
