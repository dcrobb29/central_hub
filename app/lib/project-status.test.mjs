import assert from "node:assert/strict";
import { test } from "node:test";
import { PROJECT_STATUSES, isCompletedProjectError, isInactivePlannerError, isProjectStatus } from "./project-status.ts";
import { rollbackIfActive } from "./sql-transactions.ts";

test("status accepts only the three lifecycle values", () => {
  assert.deepEqual(PROJECT_STATUSES, ["Upcoming", "Active", "Complete"]);
  for (const status of PROJECT_STATUSES) assert.equal(isProjectStatus(status), true);
  for (const status of [null, undefined, "Planning", "Completed", "complete", "", 1, {}]) assert.equal(isProjectStatus(status), false);
});

test("completed-job error recognizes the SQL trigger contract, not unrelated errors", () => {
  assert.equal(isCompletedProjectError({ number: 51030 }), true);
  for (const error of [null, "51030", new Error("Complete"), { number: 547 }]) assert.equal(isCompletedProjectError(error), false);
});

test("inactive-planner error recognizes its separate SQL contract", () => {
  assert.equal(isInactivePlannerError({ number: 51032 }), true);
  for (const error of [null, new Error("Upcoming"), { number: 51030 }, { number: 547 }]) {
    assert.equal(isInactivePlannerError(error), false);
  }
});

test("rollback tolerates trigger-ended transactions but surfaces unexpected failures", async () => {
  for (const code of ["EABORT", "ENOTBEGUN"]) {
    await rollbackIfActive({ rollback: async () => { throw Object.assign(new Error("Transaction ended"), { code }); } });
  }
  const error = new Error("Connection lost");
  await assert.rejects(() => rollbackIfActive({ rollback: async () => { throw error; } }), (caught) => caught === error);
  let rolledBack = false;
  await rollbackIfActive({ rollback: async () => { rolledBack = true; } });
  assert.equal(rolledBack, true);
});
