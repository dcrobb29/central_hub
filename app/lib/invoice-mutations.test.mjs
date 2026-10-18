import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import sql from "mssql";

const state = { rows: [], queries: [], permission: "finances.write", failure: null, disappear: false };
globalThis.invoiceMutationTest = state;
globalThis.invoiceMutationSql = sql;

function sqlError(number, message) {
  return Object.assign(new Error(message), { number });
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/app/lib/")) {
      return nextResolve(new URL(`./${specifier.slice("@/app/lib/".length)}.ts`, import.meta.url).href, context);
    }
    if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier) && context.parentURL?.includes("/app/")) {
      return nextResolve(`${specifier}.ts`, context);
    }
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === new URL("./db.ts", import.meta.url).href) return {
      format: "module", shortCircuit: true,
      source: `export const sql = globalThis.invoiceMutationSql;
        export const getPool = async () => globalThis.invoiceMutationTest.pool;`,
    };
    if (url === new URL("./project-access.ts", import.meta.url).href) return {
      format: "module", shortCircuit: true,
      source: `
        import { ProjectAccessError } from "./project-access-error.ts";
        export { ProjectAccessError };
        export async function requireProjectSession(request, permission) {
          const granted = globalThis.invoiceMutationTest.permission;
          if (!granted) throw new ProjectAccessError("Please sign in.", 401);
          if (granted !== permission) throw new ProjectAccessError("Forbidden", 403);
          return { organization: { organizationId: 2 } };
        }`,
    };
    return nextLoad(url, context);
  },
});

state.pool = {
  request() {
    const inputs = {};
    return {
      input(name, _type, value) { inputs[name] = value; return this; },
      async query(query) {
        state.queries.push({ query, inputs });
        const deleting = query.includes("DELETE FROM dbo.Invoices");
        // This mock models tenant selection; assertions also verify the submitted SQL contract.
        const row = state.rows.find((item) => item.id === inputs.id && item.organizationId === inputs.organizationId);
        const guard = "IF NOT EXISTS (SELECT 1 FROM dbo.Invoices WHERE [id] = @id AND OrganizationID = @organizationId)";
        assert.ok(query.includes(guard));
        assert.ok(query.indexOf(guard) < query.indexOf(deleting ? "FROM dbo.ProjectIssuedInvoices" : "FROM dbo.Projects"));
        assert.match(query, /WHERE \[id\] = @id AND OrganizationID = @organizationId;/);
        assert.match(query, deleting ? /OUTPUT deleted\.id INTO @deleted/ : /OUTPUT inserted\.id INTO @updated/);
        assert.match(query, deleting ? /IF NOT EXISTS \(SELECT 1 FROM @deleted\)/ : /IF NOT EXISTS \(SELECT 1 FROM @updated\)/);
        assert.equal((query.match(/THROW 51045/g) ?? []).length, 2);
        if (!row || state.disappear) throw sqlError(51045, "Invoice not found");
        if (state.failure) throw state.failure;
        if (deleting) state.rows = state.rows.filter((item) => item !== row);
        else row.invoiceAmount = inputs.invoiceAmount;
        // Trigger row counts must not determine whether the invoice existed.
        return { recordset: [], rowsAffected: [0, 1, 0] };
      },
    };
  },
};

const { PUT, DELETE } = await import("../api/finances/invoices/[id]/route.ts");
const { describeInvoiceSqlError } = await import("../api/finances/invoices/route.ts");
const { NextRequest } = await import("next/server.js");

function reset() {
  Object.assign(state, {
    rows: [
      { id: 13, organizationId: 2, invoiceAmount: "2500.00" },
      { id: 14, organizationId: 3, invoiceAmount: "2500.00" },
    ],
    queries: [], permission: "finances.write", failure: null, disappear: false,
  });
}

function request(method, id, extra = {}) {
  return new NextRequest(`http://localhost/api/finances/invoices/${id}`, {
    method,
    ...(method === "PUT" ? {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceNo: "SVA-261016", invoiceDate: "2026-10-17", invoiceDueDate: "2026-11-16",
        invoiceAmount: "2500.00", projectId: null, ...extra,
      }),
    } : {}),
  });
}
const params = (id) => ({ params: Promise.resolve({ id: String(id) }) });
const send = (method, id, extra) => (method === "PUT" ? PUT : DELETE)(request(method, id, extra), params(id));

test("foreign and nonexistent invoice IDs return identical 404s without changing either tenant", async () => {
  for (const method of ["PUT", "DELETE"]) {
    for (const id of [14, 999]) {
      reset();
      const before = structuredClone(state.rows);
      const response = await send(method, id);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "Invoice not found" });
      assert.deepEqual(state.rows, before);
      assert.equal(state.queries.length, 1);
      assert.equal(state.queries[0].inputs.organizationId, 2);
      assert.equal(state.queries[0].inputs.id, id);
    }
  }
});

test("missing invoice ownership is checked before project/customer reference validation", async () => {
  reset();
  const response = await send("PUT", 14, { projectId: 14, customerId: 14 });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Invoice not found" });
  assert.equal(state.rows[1].invoiceAmount, "2500.00");
});

test("same-tenant invoice updates and deletes succeed without touching the other tenant", async () => {
  reset();
  const updated = await send("PUT", 13, { invoiceAmount: "2600.00" });
  assert.equal(updated.status, 200);
  assert.deepEqual(await updated.json(), { id: 13 });
  assert.equal(state.rows[0].invoiceAmount, "2600.00");
  assert.equal(state.rows[1].invoiceAmount, "2500.00");
  const deleted = await send("DELETE", 13);
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), { id: 13 });
  assert.deepEqual(state.rows, [{ id: 14, organizationId: 3, invoiceAmount: "2500.00" }]);
});

test("a target disappearing before mutation is also reported as 404", async () => {
  for (const method of ["PUT", "DELETE"]) {
    reset();
    state.disappear = true;
    assert.equal((await send(method, 13)).status, 404);
  }
});

test("existing SQL conflicts retain their response mapping", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    for (const method of ["PUT", "DELETE"]) {
      reset();
      state.failure = sqlError(51041, "Existing invoice conflict");
      const response = await send(method, 13);
      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { error: "Existing invoice conflict" });
      assert.equal(state.rows.length, 2);
    }
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(describeInvoiceSqlError(sqlError(51045, "Internal detail")), { message: "Invoice not found", status: 404 });
});

test("anonymous and read-only users cannot mutate invoices or query the database", async () => {
  for (const permission of [null, "finances.read"]) {
    for (const method of ["PUT", "DELETE"]) {
      reset();
      state.permission = permission;
      const response = await send(method, 13);
      assert.equal(response.status, permission === null ? 401 : 403);
      assert.deepEqual(state.queries, []);
    }
  }
});
