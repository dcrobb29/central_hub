import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const state = {
  enabled: true,
  created: true,
  emailDelivered: true,
  sentUrl: "",
  afterCallback: null,
  removed: 0,
  rateChecks: 0,
};
globalThis.accountRegistrationRouteTest = state;
process.env.PUBLIC_APP_URL = "https://overhead.example";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") {
      return { url: new URL("./next-server-route-stub.mjs", import.meta.url).href, shortCircuit: true };
    }
    if (specifier === "@/app/lib/account-registration") {
      return { url: new URL("./account-registration-route-stub.mjs", import.meta.url).href, shortCircuit: true };
    }
    if (specifier === "@/app/lib/verification-email") {
      return { url: new URL("./verification-email-route-stub.mjs", import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === new URL("./next-server-route-stub.mjs", import.meta.url).href) {
      return {
        format: "module",
        shortCircuit: true,
        source: `
          export class NextResponse extends Response {
            static json(body, init) { return new NextResponse(JSON.stringify(body), init); }
          }
          export function after(callback) { globalThis.accountRegistrationRouteTest.afterCallback = callback; }`,
      };
    }
    if (url === new URL("./account-registration-route-stub.mjs", import.meta.url).href) {
      return {
        format: "module",
        shortCircuit: true,
        source: `
          export const accountSignupEnabled = () => globalThis.accountRegistrationRouteTest.enabled;
          export async function consumeRateLimit() { globalThis.accountRegistrationRouteTest.rateChecks++; return true; }
          export const createVerificationToken = () => ({ token: "a".repeat(43), hash: Buffer.alloc(32, 1) });
          export const parseRegistrationInput = value => value;
          export async function removePendingVerification() { globalThis.accountRegistrationRouteTest.removed++; }
          export async function requestAccountVerification() { return globalThis.accountRegistrationRouteTest.created; }
          export const requestAddress = () => "test-ip";`,
      };
    }
    if (url === new URL("./verification-email-route-stub.mjs", import.meta.url).href) {
      return {
        format: "module",
        shortCircuit: true,
        source: `
          export async function sendVerificationEmail(email, url) {
            globalThis.accountRegistrationRouteTest.sentUrl = url;
            return globalThis.accountRegistrationRouteTest.emailDelivered;
          }`,
      };
    }
    return nextLoad(url, context);
  },
});

const { POST } = await import("../api/account/register/route.ts");
const request = () => ({
  headers: new Headers({ "x-forwarded-for": "198.51.100.3" }),
  json: async () => ({
    email: "tester@example.com",
    displayName: "Test User",
    organizationName: "Test Company",
    password: "correct-horse-42",
  }),
});

test("registration sends the verification token in the URL fragment", async () => {
  state.enabled = true;
  state.created = true;
  state.sentUrl = "";
  state.afterCallback = null;
  const response = await POST(request());
  assert.equal(state.sentUrl, "");
  assert.equal(response.status, 202);
  await state.afterCallback();
  const link = new URL(state.sentUrl);
  assert.equal(link.pathname, "/verify-email");
  assert.equal(link.search, "");
  assert.equal(link.hash, `#token=${"a".repeat(43)}`);
});

test("registration is inaccessible when its runtime flag is disabled", async () => {
  state.enabled = false;
  state.rateChecks = 0;
  const response = await POST(request());
  assert.equal(response.status, 404);
  assert.equal(state.rateChecks, 0);
  state.enabled = true;
});

test("existing addresses and delivery failures receive the same generic response", async () => {
  state.enabled = true;
  state.created = false;
  state.emailDelivered = true;
  state.afterCallback = null;
  const existingResponse = await POST(request());
  assert.equal(state.afterCallback, null);
  state.created = true;
  state.emailDelivered = false;
  state.removed = 0;
  const deliveryFailureResponse = await POST(request());
  await state.afterCallback();
  assert.equal(existingResponse.status, 202);
  assert.equal(deliveryFailureResponse.status, 202);
  assert.deepEqual(await existingResponse.json(), await deliveryFailureResponse.json());
  assert.equal(state.removed, 1);
  state.created = true;
  state.emailDelivered = true;
});
