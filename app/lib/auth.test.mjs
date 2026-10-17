import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import crypto from "node:crypto";

process.env.SESSION_SECRET = crypto.randomBytes(32).toString("hex");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "./db" || specifier === "./db.ts") {
      return nextResolve(new URL("./db.ts", import.meta.url).href, context);
    }
    if (specifier === "./auth" || specifier === "./auth.ts") {
      return nextResolve(new URL("./auth.ts", import.meta.url).href, context);
    }
    if (specifier === "./project-access-error") {
      return nextResolve(new URL("./project-access-error.ts", import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const {
  hashPassword,
  verifyPassword,
  signSessionToken,
  verifySessionToken,
} = await import("./auth.ts");

test("no practice password or plaintext fallback is accepted", () => {
  assert.equal(verifyPassword("Password1!", null), false);
  assert.equal(verifyPassword("Password1!", "arbitrary_hash"), false);
  assert.equal(verifyPassword("Password1!", "Password1!"), false);
  assert.equal(verifyPassword("WrongPassword", null), false);
  assert.equal(verifyPassword("WrongPassword", "some_stored_hash"), false);
});

test("custom pbkdf2 password hashing and verification", () => {
  const hash = hashPassword("Secret123!");
  assert.ok(hash.startsWith("pbkdf2:600000:"));
  assert.ok(verifyPassword("Secret123!", hash));
  assert.equal(verifyPassword("WrongPassword", hash), false);
  assert.equal(verifyPassword("Password1!", hash), false);
});

test("existing PBKDF2 hashes still work, malformed hashes fail closed", () => {
  const salt = "ab".repeat(16);
  const hash = crypto.pbkdf2Sync("Existing password", salt, 10000, 32, "sha256").toString("hex");
  assert.equal(verifyPassword("Existing password", `pbkdf2:10000:${salt}:${hash}`), true);
  for (const value of ["pbkdf2:0:x:x", "pbkdf2:NaN:x:x", `pbkdf2:9999999:${salt}:${hash}`, `pbkdf2:10000:${salt}:bad`]) {
    assert.equal(verifyPassword("Existing password", value), false);
  }
});

test("session secret has no default and rejects weak configuration", () => {
  const original = process.env.SESSION_SECRET;
  try {
    for (const value of [undefined, "", "too-short"]) {
      if (value === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = value;
      assert.throws(() => signSessionToken({ userId: 1, email: "owner@example.com", displayName: "Owner" }), /SESSION_SECRET/);
    }
  } finally {
    process.env.SESSION_SECRET = original;
  }
});

test("session token signing and verification", () => {
  const token = signSessionToken({
    userId: 1,
    email: "dcrobb29@gmail.com",
    displayName: "Contoso Owner",
  });

  assert.ok(typeof token === "string");
  assert.ok(token.includes("."));

  const payload = verifySessionToken(token);
  assert.ok(payload);
  assert.equal(payload?.userId, 1);
  assert.equal(payload?.email, "dcrobb29@gmail.com");
  assert.equal(payload?.displayName, "Contoso Owner");
  assert.ok(payload?.exp > Math.floor(Date.now() / 1000));
});

test("tampered session token is rejected", () => {
  const token = signSessionToken({
    userId: 1,
    email: "dcrobb29@gmail.com",
    displayName: "Contoso Owner",
  });

  const [b64, sig] = token.split(".");
  const tamperedToken = `${b64}x.${sig}`;
  assert.equal(verifySessionToken(tamperedToken), null);

  const tamperedSig = `${b64}.${sig.slice(0, -1)}a`;
  assert.equal(verifySessionToken(tamperedSig), null);
  assert.equal(verifySessionToken(""), null);
  assert.equal(verifySessionToken("not-a-token"), null);
  assert.equal(verifySessionToken(`${b64}.x`), null);
  assert.equal(verifySessionToken(`${b64}.${"x".repeat(100)}`), null);
  assert.equal(verifySessionToken(`${b64}.${"\u00e9".repeat(43)}`), null);
});
