import assert from "node:assert/strict";
import test from "node:test";
import { getSafeRedirectTarget } from "../../app/lib/safe-redirect.ts";

const appOrigin = "https://overhead.example";

test("allows internal paths with query and fragment", () => {
  assert.equal(
    getSafeRedirectTarget("/projects/19?tab=scope#summary", appOrigin),
    "/projects/19?tab=scope#summary",
  );
});

test("rejects external and protocol-relative destinations", () => {
  assert.equal(getSafeRedirectTarget("https://example.invalid/qa", appOrigin), "/");
  assert.equal(getSafeRedirectTarget("//example.invalid/qa", appOrigin), "/");
});

test("rejects URL-normalization and backslash bypasses", () => {
  const encodedTabTarget = new URLSearchParams(
    "redirect=%2F%09%2Fexample.invalid%2Fqa",
  ).get("redirect");

  assert.equal(getSafeRedirectTarget(encodedTabTarget, appOrigin), "/");
  assert.equal(getSafeRedirectTarget("/\\example.invalid/qa", appOrigin), "/");
  assert.equal(getSafeRedirectTarget("/safe\n//example.invalid", appOrigin), "/");
});

test("uses the home page for missing or malformed destinations", () => {
  assert.equal(getSafeRedirectTarget(null, appOrigin), "/");
  assert.equal(getSafeRedirectTarget("", appOrigin), "/");
  assert.equal(getSafeRedirectTarget("/safe", "not an origin"), "/");
});
