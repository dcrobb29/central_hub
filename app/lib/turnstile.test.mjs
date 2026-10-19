import assert from "node:assert/strict";
import { test } from "node:test";

const originalSecret = process.env.TURNSTILE_SECRET_KEY;
const originalPublicUrl = process.env.PUBLIC_APP_URL;
const originalNodeEnv = process.env.NODE_ENV;
const originalFetch = globalThis.fetch;
process.env.TURNSTILE_SECRET_KEY = "test-turnstile-secret";
process.env.PUBLIC_APP_URL = "https://overhead.example";
process.env.NODE_ENV = "production";

const requests = [];
globalThis.fetch = async (url, options) => {
  requests.push({ url, options });
  return {
    ok: true,
    status: 200,
    async json() { return globalThis.turnstileTestResponse; },
  };
};

globalThis.turnstileTestResponse = { success: true, hostname: "overhead.example" };
const { verifyTurnstileToken } = await import("./turnstile.ts");

test.after(() => {
  globalThis.fetch = originalFetch;
  if (originalSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
  else process.env.TURNSTILE_SECRET_KEY = originalSecret;
  if (originalPublicUrl === undefined) delete process.env.PUBLIC_APP_URL;
  else process.env.PUBLIC_APP_URL = originalPublicUrl;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

test("Turnstile validates with the secret and enforces the configured hostname", async () => {
  requests.length = 0;
  globalThis.turnstileTestResponse = { success: true, hostname: "OVERHEAD.EXAMPLE" };
  assert.equal(await verifyTurnstileToken("opaque-turnstile-token"), true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  const body = new URLSearchParams(requests[0].options.body);
  assert.equal(body.get("secret"), "test-turnstile-secret");
  assert.equal(body.get("response"), "opaque-turnstile-token");
  assert.ok(body.get("idempotency_key"));
  assert.equal(requests[0].options.method, "POST");
});

test("Turnstile rejects failed challenges and successful tokens for another hostname", async () => {
  globalThis.turnstileTestResponse = { success: false, "error-codes": ["invalid-input-response"] };
  assert.equal(await verifyTurnstileToken("invalid-token"), false);
  globalThis.turnstileTestResponse = { success: true, hostname: "attacker.example" };
  assert.equal(await verifyTurnstileToken("wrong-host-token"), false);
});

test("Turnstile rejects missing or oversized tokens and fails closed without a secret", async () => {
  const requestCount = requests.length;
  assert.equal(await verifyTurnstileToken(""), false);
  assert.equal(await verifyTurnstileToken("x".repeat(2049)), false);
  assert.equal(requests.length, requestCount);
  delete process.env.TURNSTILE_SECRET_KEY;
  await assert.rejects(() => verifyTurnstileToken("valid-token"), /TURNSTILE_SECRET_KEY is not configured/);
  process.env.TURNSTILE_SECRET_KEY = "test-turnstile-secret";
});

test("Turnstile reports provider and response failures explicitly", async () => {
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  await assert.rejects(() => verifyTurnstileToken("valid-token"), /HTTP 503/);
  globalThis.fetch = async () => ({ ok: true, status: 200, async json() { return {}; } });
  await assert.rejects(() => verifyTurnstileToken("valid-token"), /invalid response/);
  globalThis.fetch = originalFetch;
});
