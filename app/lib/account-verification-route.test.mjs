import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const state = {
  rateChecks: 0,
  completionCalls: 0,
  sessionCalls: 0,
  cookies: [],
};
globalThis.accountVerificationRouteTest = state;
process.env.PUBLIC_APP_URL = "https://overhead.example";
process.env.NODE_ENV = "production";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") {
      return { url: new URL("./next-server-verification-stub.mjs", import.meta.url).href, shortCircuit: true };
    }
    if (specifier === "@/app/lib/account-registration") {
      return { url: new URL("./account-registration-verification-stub.mjs", import.meta.url).href, shortCircuit: true };
    }
    if (specifier === "@/app/lib/auth") {
      return { url: new URL("./auth-verification-stub.mjs", import.meta.url).href, shortCircuit: true };
    }
    if (specifier === "@/app/lib/account") {
      return { url: new URL("./account-verification-stub.mjs", import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === new URL("./next-server-verification-stub.mjs", import.meta.url).href) {
      return {
        format: "module",
        shortCircuit: true,
        source: `
          export class NextResponse extends Response {
            static json(body, init) {
              const response = new NextResponse(JSON.stringify(body), {
                ...init,
                headers: { "Content-Type": "application/json", ...init?.headers }
              });
              response.cookies = {
                set(...args) { globalThis.accountVerificationRouteTest.cookies.push(args); }
              };
              return response;
            }
          }`,
      };
    }
    if (url === new URL("./account-registration-verification-stub.mjs", import.meta.url).href) {
      return {
        format: "module",
        shortCircuit: true,
        source: `
          export async function consumeRateLimit() {
            globalThis.accountVerificationRouteTest.rateChecks++;
            return true;
          }
          export function requestAddress() { return "test-ip"; }
          export function verificationTokenHash(token) {
            return token === "valid-token" ? Buffer.alloc(32, 1) : null;
          }
          export async function completeVerifiedAccount() {
            globalThis.accountVerificationRouteTest.completionCalls++;
            return { userId: 5, email: "owner@example.com", displayName: "Owner" };
          }`,
      };
    }
    if (url === new URL("./auth-verification-stub.mjs", import.meta.url).href) {
      return {
        format: "module",
        shortCircuit: true,
        source: `
          export const SESSION_COOKIE_NAME = "test_session";
          export function signSessionToken() { return "signed-session"; }`,
      };
    }
    if (url === new URL("./account-verification-stub.mjs", import.meta.url).href) {
      return {
        format: "module",
        shortCircuit: true,
        source: `
          export async function getCurrentSession() {
            globalThis.accountVerificationRouteTest.sessionCalls++;
            return { userId: 5 };
          }`,
      };
    }
    return nextLoad(url, context);
  },
});

const { POST } = await import("../api/account/verify/route.ts");

function makeRequest(headers, body = { token: "valid-token", password: "mailbox-owner-password" }) {
  return {
    headers: new Headers(headers),
    async json() {
      this.jsonCalls = (this.jsonCalls ?? 0) + 1;
      return body;
    },
    jsonCalls: 0,
  };
}

function resetState() {
  state.rateChecks = 0;
  state.completionCalls = 0;
  state.sessionCalls = 0;
  state.cookies = [];
}

test("cross-origin form-compatible verification is rejected before token processing", async () => {
  resetState();
  const request = makeRequest({
    origin: "https://attacker.example",
    "sec-fetch-site": "cross-site",
    "content-type": "text/plain",
  });
  const response = await POST(request);
  assert.equal(response.status, 403);
  assert.equal(request.jsonCalls, 0);
  assert.equal(state.rateChecks, 0);
  assert.equal(state.completionCalls, 0);
  assert.equal(state.cookies.length, 0);
});

test("same-origin non-JSON verification is rejected before token processing", async () => {
  resetState();
  const request = makeRequest({
    origin: "https://overhead.example",
    "sec-fetch-site": "same-origin",
    "content-type": "text/plain",
  });
  const response = await POST(request);
  assert.equal(response.status, 415);
  assert.equal(request.jsonCalls, 0);
  assert.equal(state.rateChecks, 0);
  assert.equal(state.completionCalls, 0);
});

test("same-origin JSON verification proceeds and sets the new account session", async () => {
  resetState();
  const request = makeRequest({
    origin: "https://overhead.example",
    "sec-fetch-site": "same-origin",
    "content-type": "application/json; charset=utf-8",
  });
  const response = await POST(request);
  assert.equal(response.status, 200);
  assert.equal(state.rateChecks, 2);
  assert.equal(state.completionCalls, 1);
  assert.equal(state.sessionCalls, 1);
  assert.equal(state.cookies.length, 1);
  assert.equal(state.cookies[0][0].name, "test_session");
});
