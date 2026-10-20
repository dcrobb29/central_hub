import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

process.env.SESSION_SECRET = "registration-test-secret-with-more-than-32-bytes";
process.env.ACCOUNT_SIGNUP_ENABLED = "true";
process.env.ACCOUNT_SIGNUP_ALLOWED_EMAILS = "new-owner@example.com,expired@example.com";

const state = {
  pending: null,
  existingUser: false,
  expired: false,
  permissionCount: 17,
  rateAllowed: true,
  queries: [],
  commits: 0,
  rollbacks: 0,
  nextIds: { OrganizationID: 42, UserID: 89, MembershipID: 23, AccessRoleID: 11 },
};
globalThis.accountRegistrationTest = state;

class Request {
  constructor() { this.inputs = {}; }
  input(name, type, value) { this.inputs[name] = value; return this; }
  async query(query) {
    state.queries.push({ query, inputs: { ...this.inputs } });
    if (query.includes("FROM dbo.AuthenticationRateLimits")) return { recordset: [{ Allowed: state.rateAllowed }] };
    if (query.includes("FROM dbo.PendingAccountVerifications WITH")) {
      return { recordset: state.pending ? [{ ...state.pending, IsExpired: state.expired }] : [] };
    }
    if (query.includes("FROM dbo.Users WITH") && query.includes("NormalizedEmail")) {
      return { recordset: state.existingUser ? [{ UserID: 7 }] : [] };
    }
    if (query.includes("FROM dbo.Permissions")) return { recordset: [{ PermissionCount: state.permissionCount }] };
    for (const [table, idColumn] of Object.entries({
      Organizations: "OrganizationID", Users: "UserID", OrganizationMemberships: "MembershipID", AccessRoles: "AccessRoleID",
    })) {
      if (query.includes(`INSERT INTO dbo.${table}`)) {
        const id = state.nextIds[idColumn];
        return { recordset: [{ [idColumn]: id }] };
      }
    }
    return { recordset: [] };
  }
}

class Transaction {
  constructor() { this.requests = []; }
  async begin(level) { this.level = level; }
  request() { const request = new Request(); this.requests.push(request); return request; }
  async commit() { state.commits++; }
  async rollback() { state.rollbacks++; }
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "mssql") return { url: new URL("./mssql-registration-stub.mjs", import.meta.url).href, shortCircuit: true };
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier.startsWith("@/app/lib/")) return nextResolve(new URL(`./${specifier.slice(10)}.ts`, import.meta.url).href, context);
    if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier) && context.parentURL?.includes("/app/")) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === new URL("./mssql-registration-stub.mjs", import.meta.url).href) {
      return { format: "module", shortCircuit: true, source: `
        class Transaction { constructor() { return globalThis.accountRegistrationTest.makeTransaction(); } }
        export default {
          Transaction,
          ISOLATION_LEVEL: { SERIALIZABLE: "SERIALIZABLE" },
          NVarChar: size => ({ type: "nvarchar", size }),
          VarBinary: size => ({ type: "varbinary", size }),
          VarChar: size => ({ type: "varchar", size }),
          Int: { type: "int" }
        };` };
    }
    if (url === new URL("./db.ts", import.meta.url).href) {
      return { format: "module", shortCircuit: true, source: `
        export const sql = {};
        export async function getPool() {
          return { request() { return new globalThis.accountRegistrationTest.Request(); } };
        }` };
    }
    return nextLoad(url, context);
  },
});
state.Request = Request;
state.makeTransaction = () => new Transaction();

const registration = await import("./account-registration.ts");

test("signup allowlist fails closed and matches only normalized exact email addresses", () => {
  const original = process.env.ACCOUNT_SIGNUP_ALLOWED_EMAILS;
  try {
    delete process.env.ACCOUNT_SIGNUP_ALLOWED_EMAILS;
    assert.equal(registration.registrationEmailAllowed("tester@example.com"), false);
    process.env.ACCOUNT_SIGNUP_ALLOWED_EMAILS = "  ";
    assert.equal(registration.registrationEmailAllowed("tester@example.com"), false);
    process.env.ACCOUNT_SIGNUP_ALLOWED_EMAILS = " Tester@Example.com , second@example.com ";
    assert.equal(registration.registrationEmailAllowed(" TESTER@example.com "), true);
    assert.equal(registration.registrationEmailAllowed("second@example.com"), true);
    for (const email of ["tester+alias@example.com", "other@example.com", "tester@example.com.attacker.test"]) {
      assert.equal(registration.registrationEmailAllowed(email), false);
    }
    for (const configuration of ["*", "@example.com", "tester@example.com,", "invalid"]) {
      process.env.ACCOUNT_SIGNUP_ALLOWED_EMAILS = configuration;
      assert.throws(() => registration.registrationEmailAllowed("tester@example.com"), /ACCOUNT_SIGNUP_ALLOWED_EMAILS/);
    }
  } finally {
    process.env.ACCOUNT_SIGNUP_ALLOWED_EMAILS = original;
  }
});

test("registration input validation normalizes email and enforces field bounds without accepting a password", () => {
  const valid = registration.parseRegistrationInput({
    email: "  TEST@Example.com ", displayName: " Test User ", organizationName: " Test Co ",
  });
  assert.deepEqual(valid, {
    email: "test@example.com", displayName: "Test User", organizationName: "Test Co",
  });
  for (const body of [
    {}, { email: "invalid", displayName: "x", organizationName: "y" },
    { email: "a@example.com", displayName: "", organizationName: "y" },
    { email: `a${"x".repeat(254)}@example.com`, displayName: "x", organizationName: "y" },
  ]) assert.equal(registration.parseRegistrationInput(body), null);
  assert.deepEqual(registration.parseRegistrationInput({
    email: "a@example.com", displayName: "x", organizationName: "y", password: "attacker-chosen-password",
  }), { email: "a@example.com", displayName: "x", organizationName: "y" });
});

test("verification tokens are random, canonical, one-time input hashes and signup defaults are explicit", () => {
  const first = registration.createVerificationToken();
  const second = registration.createVerificationToken();
  assert.notEqual(first.token, second.token);
  assert.equal(first.hash.length, 32);
  assert.deepEqual(registration.verificationTokenHash(first.token), first.hash);
  assert.equal(registration.verificationTokenHash("invalid"), null);
  assert.equal(registration.accountSignupEnabled(), true);
  process.env.ACCOUNT_SIGNUP_ENABLED = "false";
  assert.equal(registration.accountSignupEnabled(), false);
  process.env.ACCOUNT_SIGNUP_ENABLED = "true";
  assert.equal(registration.requestAddress(new RequestWithHeaders("198.51.100.1, 203.0.113.7")), "203.0.113.7");
});

class RequestWithHeaders {
  constructor(forwarded) { this.headers = new Headers({ "x-forwarded-for": forwarded }); }
}

test("client IP rate-limit identifiers ignore source ports and normalize IPv6", () => {
  for (const address of [
    "198.51.100.3", "198.51.100.3:12345", "198.51.100.3:54321",
    "192.0.2.1, 198.51.100.3:443",
  ]) {
    assert.equal(registration.requestAddress(new RequestWithHeaders(address)), "198.51.100.3");
  }
  for (const address of [
    "2001:db8::1", "2001:0DB8:0:0:0:0:0:1",
    "[2001:db8::1]", "[2001:db8::1]:12345", "[2001:db8::1]:54321",
  ]) {
    assert.equal(registration.requestAddress(new RequestWithHeaders(address)), "2001:db8::1");
  }
  assert.equal(registration.requestAddress(new RequestWithHeaders("2001:db8::1234")), "2001:db8::1234");
  for (const address of ["not-an-ip", "198.51.100.3:65536", "[invalid]:443", "198.51.100.3:abc"]) {
    assert.throws(() => registration.requestAddress(new RequestWithHeaders(address)), /Invalid forwarded client address/);
  }
});

test("rate limits persist keyed hashes rather than raw identifiers", async () => {
  state.queries = [];
  state.rateAllowed = false;
  assert.equal(await registration.consumeRateLimit("signup-email", "private@example.com", 3, 3600), false);
  const entry = state.queries.at(-1);
  assert.match(entry.query, /UPDLOCK, SERIALIZABLE/);
  assert.equal(entry.inputs.scope, "signup-email");
  assert.equal(entry.inputs.keyHash.length, 32);
  assert.notEqual(entry.inputs.keyHash.toString(), "private@example.com");
  assert.match(entry.query, /DATEDIFF\(minute/);
  assert.doesNotMatch(entry.query, /DATEDIFF_BIG\(second/);
  await assert.rejects(() => registration.consumeRateLimit("signup-ip", "ip", 5, 61), /Invalid authentication rate-limit configuration/);
  state.rateAllowed = true;
});

test("pending verification stores no password before mailbox ownership is established", async () => {
  state.queries = [];
  state.commits = 0;
  state.rollbacks = 0;
  const token = registration.createVerificationToken();
  assert.equal(await registration.requestAccountVerification({
    email: "new-owner@example.com",
    displayName: "New Owner",
    organizationName: "Independent Company",
  }, token.hash), true);
  const pendingInsert = state.queries.find(({ query }) => query.includes("INSERT INTO dbo.PendingAccountVerifications"));
  assert.ok(pendingInsert);
  assert.doesNotMatch(pendingInsert.query, /PasswordHash/);
  assert.equal(Object.hasOwn(pendingInsert.inputs, "passwordHash"), false);
  assert.equal(state.commits, 1);
  assert.equal(state.rollbacks, 0);
});

test("account verification only provisions an isolated owner after an unexpired, unused token", async () => {
  state.pending = {
    NormalizedEmail: "new-owner@example.com",
    DisplayName: "New Owner",
    OrganizationName: "Independent Company",
  };
  state.expired = false;
  state.existingUser = false;
  state.permissionCount = 17;
  state.commits = 0;
  state.rollbacks = 0;
  state.queries = [];
  const token = registration.createVerificationToken();
  const created = await registration.completeVerifiedAccount(token.hash, "mailbox-owner-password");
  assert.deepEqual(created, { userId: 89, email: "new-owner@example.com", displayName: "New Owner" });
  assert.equal(state.commits, 1);
  assert.equal(state.rollbacks, 0);
  const organizationInsert = state.queries.find(({ query }) => query.includes("INSERT INTO dbo.Organizations"));
  assert.equal(organizationInsert.inputs.organizationName, "Independent Company");
  assert.match(organizationInsert.inputs.organizationKey, /^[a-f0-9]{32}$/);
  const ownerPermissions = state.queries.find(({ query }) => query.includes("INSERT INTO dbo.AccessRolePermissions"));
  assert.equal(ownerPermissions.inputs.organizationId, 42);
  assert.equal(ownerPermissions.inputs.roleId, 11);
  const membershipRole = state.queries.find(({ query }) => query.includes("INSERT INTO dbo.MembershipAccessRoles"));
  assert.deepEqual(membershipRole.inputs, { organizationId: 42, membershipId: 23, roleId: 11 });
  const userInsert = state.queries.find(({ query }) => query.includes("INSERT INTO dbo.Users"));
  assert.match(userInsert.inputs.passwordHash, /^pbkdf2:600000:/);
  assert.notEqual(userInsert.inputs.passwordHash, "attacker-chosen-password");
  assert.doesNotMatch(userInsert.inputs.passwordHash, /mailbox-owner-password/);
  assert.ok(state.queries.some(({ query }) => query.includes("DELETE FROM dbo.PendingAccountVerifications")));
});

test("expired, reused and permission-incomplete verifications never commit an account", async () => {
  state.queries = [];
  state.commits = 0;
  state.rollbacks = 0;
  const token = registration.createVerificationToken();
  state.pending = null;
  assert.equal(await registration.completeVerifiedAccount(token.hash, "mailbox-owner-password"), null);
  state.pending = {
    NormalizedEmail: "expired@example.com", DisplayName: "Expired", OrganizationName: "Expired Co",
  };
  state.expired = true;
  assert.equal(await registration.completeVerifiedAccount(token.hash, "mailbox-owner-password"), null);
  assert.equal(state.queries.some(({ query }) => query.includes("INSERT INTO dbo.Organizations")), false);
  state.expired = false;
  state.permissionCount = 16;
  await assert.rejects(() => registration.completeVerifiedAccount(token.hash, "mailbox-owner-password"), /permission catalog/);
  assert.equal(state.rollbacks, 1);
  assert.equal(state.commits, 2);
  state.permissionCount = 17;
  state.pending = null;
});

test("removing an address from the allowlist prevents an outstanding link from provisioning", async () => {
  state.pending = {
    NormalizedEmail: "removed@example.com", DisplayName: "Removed", OrganizationName: "Test",
  };
  state.expired = false;
  state.existingUser = false;
  state.queries = [];
  state.commits = 0;
  try {
    const token = registration.createVerificationToken();
    assert.equal(await registration.completeVerifiedAccount(token.hash, "mailbox-owner-password"), null);
    assert.equal(state.commits, 1);
    assert.ok(state.queries.some(({ query }) => query.includes("DELETE FROM dbo.PendingAccountVerifications")));
    assert.equal(state.queries.some(({ query }) => query.includes("INSERT INTO")), false);
  } finally {
    state.pending = null;
  }
});
