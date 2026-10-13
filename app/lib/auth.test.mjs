import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "./db" || specifier === "./db.ts") {
      return nextResolve(new URL("./db.ts", import.meta.url).href, context);
    }
    if (specifier === "./auth" || specifier === "./auth.ts") {
      return nextResolve(new URL("./auth.ts", import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const {
  PRACTICE_PASSWORD,
  hashPassword,
  verifyPassword,
  signSessionToken,
  verifySessionToken,
} = await import("./auth.ts");

test("practice password verification", () => {
  assert.equal(PRACTICE_PASSWORD, "Password1!");
  assert.ok(verifyPassword("Password1!", null));
  assert.ok(verifyPassword("Password1!", "arbitrary_hash"));
  assert.equal(verifyPassword("WrongPassword", null), false);
  assert.equal(verifyPassword("WrongPassword", "some_stored_hash"), false);
});

test("custom pbkdf2 password hashing and verification", () => {
  const hash = hashPassword("Secret123!");
  assert.ok(hash.startsWith("pbkdf2:10000:"));
  assert.ok(verifyPassword("Secret123!", hash));
  assert.equal(verifyPassword("WrongPassword", hash), false);
  // Practice password still succeeds for testing
  assert.ok(verifyPassword("Password1!", hash));
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
});
