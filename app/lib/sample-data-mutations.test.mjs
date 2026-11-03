import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import sql from "mssql";

const state = { bills: [], tracked: [], calls: [], next: 0, random: 0, candidates: [], tail: Promise.resolve() };
globalThis.sampleMutationTest = state;
class Transaction {
  records = [];
  bills = [];
  release;
  removeOrg;
  async begin() {}
  request() {
    const inputs = {};
    return {
      input(name, _type, value) { inputs[name] = value; return this; },
      query: async (query) => {
        state.calls.push({ query, inputs: { ...inputs } });
        if (query.includes("sp_getapplock")) {
          assert.match(query, /@LockOwner = 'Transaction'/);
          assert.match(query, /IF @result < 0/);
          if (state.lockFailure) throw new Error("Sample data is busy. Please retry shortly.");
          const previous = state.tail;
          state.tail = new Promise(resolve => { this.release = resolve; });
          await previous;
          return { recordset: [] };
        }
        assert.ok(this.release, "all sample queries must follow the mutation lock");
        if (query.includes("COUNT(1)")) return {
          recordset: [{ total: state.tracked.filter(row => row.org === inputs.orgId).length }],
        };
        if (query.includes("SELECT TableName, RecordKey")) return {
          recordset: state.tracked.filter(row => row.org === inputs.orgId),
        };
        if (query.includes("SELECT id FROM dbo.Bills")) {
          assert.match(query, /WITH \(UPDLOCK, HOLDLOCK\)/);
          assert.ok(!query.includes("OrganizationID"), "bill IDs must be checked globally");
          return { recordset: [...state.bills, ...this.bills].filter(bill => bill.id === inputs.id) };
        }
        if (query.includes("SELECT RoleID, RoleName")) return { recordset: [] };
        if (query.includes("INSERT INTO dbo.Bills")) {
          assert.equal(inputs.id.length, 10);
          assert.ok(![...state.bills, ...this.bills].some(bill => bill.id === inputs.id));
          this.bills.push({ id: inputs.id, org: inputs.orgId });
        }
        if (query.includes("INSERT INTO dbo.SampleDataRecords")) {
          this.records.push({ org: inputs.orgId, TableName: inputs.table, RecordKey: inputs.key });
        }
        if (query.includes("DELETE FROM dbo.Bills")) {
          const keys = state.tracked.filter(row => row.org === inputs.orgId && row.TableName === "Bills");
          for (const key of keys) assert.ok(query.includes(`'${key.RecordKey}'`));
          this.removeOrg = inputs.orgId;
        }
        return { recordset: [{ id: ++state.next, estimate: state.next, revision: state.next,
          scope: state.next, line: state.next, change: state.next, count: 0 }] };
      },
    };
  }
  async commit() {
    if (this.removeOrg !== undefined) {
      const keys = state.tracked.filter(row => row.org === this.removeOrg && row.TableName === "Bills").map(row => row.RecordKey);
      state.bills = state.bills.filter(row => row.org !== this.removeOrg || !keys.includes(row.id));
      state.tracked = state.tracked.filter(row => row.org !== this.removeOrg);
    }
    state.bills.push(...this.bills);
    state.tracked.push(...this.records);
    this.release?.();
  }
  async rollback() { state.rollbacks++; this.release?.(); }
}
state.sql = { ...sql, Transaction };
state.pool = {};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "node:crypto" && context.parentURL?.endsWith("/sample-data.ts")) {
      return { url: "test:sample-crypto", shortCircuit: true };
    }
    if (specifier.startsWith("@/app/lib/")) return nextResolve(new URL(`./${specifier.slice(10)}.ts`, import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "test:sample-crypto") return {
      format: "module", shortCircuit: true,
      source: `export default { randomBytes(size) {
        if (size !== 5) throw new Error("Expected five random bytes");
        const state = globalThis.sampleMutationTest;
        return { toString() { return state.candidates.shift() ?? (++state.random).toString(16).padStart(10, "0"); } };
      } };`,
    };
    if (url === new URL("./db.ts", import.meta.url).href) return {
      format: "module", shortCircuit: true,
      source: "export const getPool = async () => globalThis.sampleMutationTest.pool; export const sql = globalThis.sampleMutationTest.sql;",
    };
    if (url === new URL("./auth.ts", import.meta.url).href) return {
      format: "module", shortCircuit: true,
      source: "export const getActiveOrganizationId = async () => { throw new Error('Explicit organization required'); };",
    };
    return nextLoad(url, context);
  },
});
const { includeSampleData, excludeSampleData } = await import("./sample-data.ts");

function reset() {
  Object.assign(state, { bills: [{ id: "SMP-B01", org: 99 }, { id: "SMP-B02", org: 99 }],
    tracked: [], calls: [], next: 0, random: 0, candidates: [], tail: Promise.resolve(), lockFailure: false, rollbacks: 0 });
}

test("sample bills coexist across organizations and legacy IDs; cost links and cleanup use allocated keys", async () => {
  reset();
  state.candidates = ["SMP-B01", "aaaaaaaaaa", "aaaaaaaaaa", "bbbbbbbbbb"];
  await Promise.all([includeSampleData(11), includeSampleData(22)]);
  assert.equal(state.bills.length, 6);
  assert.equal(new Set(state.bills.map(bill => bill.id)).size, 6);
  for (const org of [11, 22]) {
    const bills = state.bills.filter(bill => bill.org === org);
    const tracked = state.tracked.filter(row => row.org === org && row.TableName === "Bills");
    assert.deepEqual(tracked.map(row => row.RecordKey), bills.map(bill => bill.id));
    const costs = state.calls.filter(call => call.query.includes("INSERT INTO dbo.ProjectBillCosts") && call.inputs.orgId === org);
    assert.deepEqual(costs.map(call => call.inputs.billId), bills.map(bill => bill.id));
  }
  await excludeSampleData(11);
  assert.equal(state.bills.filter(bill => bill.org === 11).length, 0);
  assert.equal(state.bills.filter(bill => bill.org === 22).length, 2);
  assert.equal(state.bills.filter(bill => bill.org === 99).length, 2);
});

test("simultaneous and repeated inclusion for one organization creates only one set", async () => {
  reset();
  const results = await Promise.all([includeSampleData(11), includeSampleData(11)]);
  assert.equal(state.bills.filter(bill => bill.org === 11).length, 2);
  assert.ok(results.some(result => result.message === "Sample data is already included."));
  const count = state.tracked.length;
  await includeSampleData(11);
  assert.equal(state.tracked.length, count);
  await Promise.all([excludeSampleData(11), includeSampleData(11)]);
  assert.equal(state.bills.filter(bill => bill.org === 11).length, 2);
});

test("allocation exhaustion and mutation lock failures surface errors and roll back", async () => {
  reset();
  state.candidates = Array(10).fill("SMP-B01");
  await assert.rejects(includeSampleData(11), /unique sample bill ID/);
  assert.equal(state.tracked.length, 0);
  assert.equal(state.bills.length, 2);
  assert.equal(state.rollbacks, 1);
  state.lockFailure = true;
  await assert.rejects(includeSampleData(11), /busy/);
  await assert.rejects(excludeSampleData(11), /busy/);
  assert.equal(state.rollbacks, 3);
});

test("legacy sample bills remain removable through their original tracked IDs", async () => {
  reset();
  state.tracked = state.bills.map(bill => ({ org: 99, TableName: "Bills", RecordKey: bill.id }));
  await includeSampleData(11);
  await excludeSampleData(99);
  assert.equal(state.bills.filter(bill => bill.org === 99).length, 0);
  assert.equal(state.bills.filter(bill => bill.org === 11).length, 2);
});
