import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { registerHooks } from "node:module";
import { test } from "node:test";

const state = { pools: [], connectError: null, connectGate: null, closeError: null };
class FakePool extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.connected = false;
    this.healthy = false;
    this.closeCalls = 0;
    state.pools.push(this);
  }
  async connect() {
    if (state.connectGate) await state.connectGate;
    if (state.connectError) throw state.connectError;
    this.connected = this.healthy = true;
    return this;
  }
  async close() {
    this.closeCalls++;
    if (state.closeError) throw state.closeError;
    this.connected = this.healthy = false;
  }
}
globalThis.dbPoolTest = { FakePool };
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "mssql") {
      return { url: new URL("./mssql-pool-test-stub.mjs", import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === new URL("./mssql-pool-test-stub.mjs", import.meta.url).href) {
      return {
        format: "module", shortCircuit: true,
        source: "export default { ConnectionPool: globalThis.dbPoolTest.FakePool };",
      };
    }
    return nextLoad(url, context);
  },
});

let moduleId = 0;
async function freshDb() {
  state.pools = [];
  state.connectError = state.connectGate = state.closeError = null;
  return import(`./db.ts?test=${moduleId++}`);
}

test("concurrent callers share one initial pool and healthy callers reuse it", async () => {
  const { getPool } = await freshDb();
  let release;
  state.connectGate = new Promise(resolve => { release = resolve; });
  const calls = Array.from({ length: 20 }, () => getPool());
  assert.equal(state.pools.length, 1);
  release();
  const pools = await Promise.all(calls);
  assert.ok(pools.every(pool => pool === pools[0]));
  assert.equal(await getPool(), pools[0]);
  assert.equal(pools[0].closeCalls, 0);
  assert.equal(pools[0].config.pool.acquireTimeoutMillis, 15000);
  assert.equal(pools[0].config.connectionTimeout, 15000);
  assert.equal(pools[0].config.requestTimeout, 15000);
});

test("failed initial connections reject and the next request can recover without restart", async () => {
  const { getPool } = await freshDb();
  state.connectError = Object.assign(new Error("private connection details"), { code: "ETIMEOUT" });
  await assert.rejects(getPool(), { code: "ETIMEOUT" });
  state.connectError = null;
  const recovered = await getPool();
  assert.equal(state.pools.length, 2);
  assert.equal(recovered.connected, true);
});

for (const failedProperty of ["connected", "healthy"]) {
  test(`a ${failedProperty} failure produces one replacement for concurrent requests`, async () => {
    const { getPool } = await freshDb();
    const old = await getPool();
    old[failedProperty] = false;
    const pools = await Promise.all(Array.from({ length: 20 }, () => getPool()));
    assert.equal(old.closeCalls, 1);
    assert.equal(state.pools.length, 2);
    assert.ok(pools.every(pool => pool === state.pools[1]));
  });
}

test("failed replacement rejects callers but a later request can reconnect", async () => {
  const { getPool } = await freshDb();
  const old = await getPool();
  old.healthy = false;
  state.connectError = Object.assign(new Error("offline"), { code: "ESOCKET" });
  await assert.rejects(getPool(), { code: "ESOCKET" });
  state.connectError = null;
  assert.equal((await getPool()).healthy, true);
  assert.equal(state.pools.length, 3);
});

test("pool errors have a listener, log only safe fields, and do not close a healthy pool", async () => {
  const { getPool } = await freshDb();
  const pool = await getPool();
  const original = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try {
    pool.emit("error", Object.assign(new Error("password=secret; SELECT private"), {
      code: "ESOCKET", number: 40613, query: "SELECT private",
    }));
    assert.deepEqual(logs, [["SQL pool error", { name: "Error", code: "ESOCKET", number: 40613 }]]);
    assert.equal(await getPool(), pool);
    assert.equal(pool.closeCalls, 0);
  } finally {
    console.error = original;
  }
});

test("a close failure is surfaced, not reported as successful recovery", async () => {
  const { getPool } = await freshDb();
  const pool = await getPool();
  pool.connected = false;
  state.closeError = new Error("close failed");
  await assert.rejects(getPool(), /close failed/);
  assert.equal(state.pools.length, 1);
});
