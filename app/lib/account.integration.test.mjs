import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import sql from "mssql";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/app/lib/")) {
      return nextResolve(new URL(`./${specifier.slice("@/app/lib/".length)}.ts`, import.meta.url).href, context);
    }
    if (specifier === "./auth" || specifier === "./auth.ts") {
      return nextResolve(new URL("./auth.ts", import.meta.url).href, context);
    }
    if (specifier === "./db" || specifier === "./db.ts") {
      return nextResolve(new URL("./db.ts", import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const enabled = process.env.RUN_DB_TESTS === "1";

async function getTestPool() {
  return await new sql.ConnectionPool({
    server: process.env.DB_SERVER,
    port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
      encrypt: process.env.DB_ENCRYPT !== "false",
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === "true",
    },
  }).connect();
}

test("account session loads Contoso user, roles, and organization", { skip: !enabled }, async () => {
  const { getCurrentSession } = await import("./account.ts");
  const session = await getCurrentSession("dcrobb29@gmail.com");

  assert.equal(session.user.email, "dcrobb29@gmail.com");
  assert.equal(session.organization.organizationKey, "contoso-test");
  assert.equal(session.organization.organizationName, "Contoso");
  assert.ok(session.roles.some((r) => r.roleKey === "Owner"));
  assert.ok(session.permissions.includes("customers.read"));
  assert.ok(session.permissions.includes("projects.read"));
});

test("two-way linking between user membership and hierarchy employee", { skip: !enabled }, async () => {
  const pool = await getTestPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const { getCurrentSession, linkMembershipEmployee, unlinkMembershipEmployee, getOrganizationSettings } = await import("./account.ts");

    const session = await getCurrentSession("dcrobb29@gmail.com");
    const orgId = session.organization.organizationId;
    const memId = session.membership.membershipId;

    // Pick employee 1 (Ron)
    await linkMembershipEmployee(orgId, memId, 1);

    const linkedSession = await getCurrentSession("dcrobb29@gmail.com");
    assert.ok(linkedSession.linkedEmployee !== null);
    assert.equal(linkedSession.linkedEmployee?.employeeId, 1);
    assert.equal(linkedSession.linkedEmployee?.name, "Ron");

    const settings = await getOrganizationSettings(orgId);
    const member = settings.members.find((m) => m.membershipId === memId);
    assert.equal(member?.linkedEmployee?.employeeId, 1);

    const employee = settings.employees.find((e) => e.employeeId === 1);
    assert.equal(employee?.linkedMembershipId, memId);
    assert.equal(employee?.linkedUserEmail, "dcrobb29@gmail.com");

    // Unlink
    await unlinkMembershipEmployee(orgId, memId);
    const unlinkedSession = await getCurrentSession("dcrobb29@gmail.com");
    assert.equal(unlinkedSession.linkedEmployee, null);
  } finally {
    await transaction.rollback();
  }
});

test("archiving employee preserves historical data while toggling active status", { skip: !enabled }, async () => {
  const pool = await getTestPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const { setEmployeeActiveStatus, deleteOrArchiveEmployee, getOrganizationSettings } = await import("./account.ts");
    const orgId = 1;

    // Ron has reports (Bethany, Anthony)
    const result = await deleteOrArchiveEmployee(orgId, 1);
    assert.equal(result.deleted, false);
    assert.equal(result.archived, true);

    const settings = await getOrganizationSettings(orgId);
    const ron = settings.employees.find((e) => e.employeeId === 1);
    assert.equal(ron?.isActive, false);

    // Restore
    await setEmployeeActiveStatus(orgId, 1, true);
    const restoredSettings = await getOrganizationSettings(orgId);
    const ronRestored = restoredSettings.employees.find((e) => e.employeeId === 1);
    assert.equal(ronRestored?.isActive, true);
  } finally {
    await transaction.rollback();
  }
});
