import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const state = {
  enabled: true,
  allowed: true,
  created: true,
  emailDelivered: true,
  sendError: null,
  sentUrl: "",
  afterCallback: null,
  removed: 0,
  registrationInput: null,
  rateChecks: 0,
  captchaChecks: 0,
  captchaPassed: true,
  verifiedCaptchaToken: "",
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
    if (specifier === "@/app/lib/turnstile") {
      return { url: new URL("./turnstile-route-stub.mjs", import.meta.url).href, shortCircuit: true };
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
          export const registrationEmailAllowed = () => globalThis.accountRegistrationRouteTest.allowed;
          export async function consumeRateLimit() { globalThis.accountRegistrationRouteTest.rateChecks++; return true; }
          export const createVerificationToken = () => ({ token: "a".repeat(43), hash: Buffer.alloc(32, 1) });
          export function parseRegistrationInput(value) {
            if (!value || typeof value !== "object") return null;
            const { email, displayName, organizationName } = value;
            return { email, displayName, organizationName };
          }
          export async function removePendingVerification() { globalThis.accountRegistrationRouteTest.removed++; }
          export async function requestAccountVerification(input) {
            globalThis.accountRegistrationRouteTest.registrationInput = input;
            return globalThis.accountRegistrationRouteTest.created;
          }
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
            if (globalThis.accountRegistrationRouteTest.sendError) throw globalThis.accountRegistrationRouteTest.sendError;
            return globalThis.accountRegistrationRouteTest.emailDelivered;
          }`,
      };
    }
    if (url === new URL("./turnstile-route-stub.mjs", import.meta.url).href) {
      return {
        format: "module",
        shortCircuit: true,
        source: `
          export async function verifyTurnstileToken(token) {
            globalThis.accountRegistrationRouteTest.captchaChecks++;
            globalThis.accountRegistrationRouteTest.verifiedCaptchaToken = token;
            return globalThis.accountRegistrationRouteTest.captchaPassed;
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
    password: "attacker-chosen-password",
    turnstileToken: "valid-turnstile-token",
  }),
});

test("registration sends the verification token in the URL fragment", async () => {
  state.enabled = true;
  state.created = true;
  state.sentUrl = "";
  state.afterCallback = null;
  state.registrationInput = null;
  state.captchaChecks = 0;
  state.captchaPassed = true;
  const response = await POST(request());
  assert.equal(Object.hasOwn(state.registrationInput, "password"), false);
  assert.equal(state.captchaChecks, 1);
  assert.equal(state.verifiedCaptchaToken, "valid-turnstile-token");
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

test("registration rejects missing or invalid Turnstile proof before creating a pending account", async () => {
  state.enabled = true;
  state.created = true;
  state.captchaChecks = 0;
  state.registrationInput = null;
  const missing = await POST({
    ...request(),
    json: async () => {
      const body = await request().json();
      delete body.turnstileToken;
      return body;
    },
  });
  assert.equal(missing.status, 400);
  assert.equal(state.captchaChecks, 0);
  assert.equal(state.registrationInput, null);

  state.captchaPassed = false;
  state.registrationInput = null;
  const invalid = await POST(request());
  assert.equal(invalid.status, 400);
  assert.equal(state.captchaChecks, 1);
  assert.equal(state.registrationInput, null);
  state.captchaPassed = true;
});

test("unapproved addresses get the generic response without storing a token or scheduling email", async () => {
  state.allowed = false;
  state.registrationInput = null;
  state.afterCallback = null;
  state.sentUrl = "";
  state.rateChecks = 0;
  state.captchaChecks = 0;
  try {
    const response = await POST(request());
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), {
      message: "If registration is available for this address, verification instructions will be sent.",
    });
    assert.equal(state.rateChecks, 2);
    assert.equal(state.captchaChecks, 1);
    assert.equal(state.registrationInput, null);
    assert.equal(state.afterCallback, null);
    assert.equal(state.sentUrl, "");
  } finally {
    state.allowed = true;
  }
});

test("stage logs distinguish allowlist rejection and ACS outcomes without logging private inputs", async () => {
  const logs = [];
  const originalInfo = console.info;
  const originalError = console.error;
  console.info = (...args) => logs.push(args);
  console.error = (...args) => logs.push(args);
  const stages = () => logs.filter(([event]) => event === "Account registration").map(([, fields]) => fields.stage);
  try {
    state.allowed = false;
    await POST(request());
    assert.deepEqual(stages(), ["received", "allowlist_rejected"]);
    logs.length = 0;
    state.allowed = true;
    state.created = true;
    state.emailDelivered = true;
    await POST(request());
    await state.afterCallback();
    assert.deepEqual(stages(), [
      "received", "allowlist_accepted", "pending_created", "email_send_started", "email_send_succeeded",
    ]);
    const ids = logs.map(([, fields]) => fields.requestId);
    assert.equal(new Set(ids).size, 1);
    assert.match(ids[0], /^[a-f0-9-]{36}$/);
    logs.length = 0;
    state.sendError = Object.assign(new Error("private SDK message tester@example.com"), { code: "Denied" });
    await POST(request());
    await state.afterCallback();
    assert.ok(stages().includes("email_send_failed"));
    assert.ok(stages().includes("undelivered_pending_removed"));
    assert.equal(logs.find(([event]) => event === "Verification email request failed")[1].code, "Denied");
    const serialized = JSON.stringify(logs);
    for (const privateValue of [
      "tester@example.com", "Test User", "Test Company", "attacker-chosen-password",
      "valid-turnstile-token", state.sentUrl, "private SDK message",
    ]) assert.equal(serialized.includes(privateValue), false);
  } finally {
    console.info = originalInfo;
    console.error = originalError;
    state.allowed = true;
    state.sendError = null;
    state.emailDelivered = true;
  }
});
