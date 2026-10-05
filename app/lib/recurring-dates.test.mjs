import assert from "node:assert/strict";
import { test } from "node:test";
import { getRecurringDates, isCalendarDate, validateRecurringSchedule } from "./recurring-dates.ts";

test("weekly and biweekly dates stay anchored to the start and include the end date", () => {
  assert.deepEqual(getRecurringDates("2026-10-07", "2026-10-21", "Weekly"), ["2026-10-07", "2026-10-14", "2026-10-21"]);
  assert.deepEqual(getRecurringDates("2026-10-07", "2026-11-04", "Biweekly", "2026-10-12", "2026-10-18"), []);
  assert.deepEqual(getRecurringDates("2026-10-07", "2026-11-04", "Biweekly", "2026-10-19", "2026-10-25"), ["2026-10-21"]);
});

test("monthly clamping uses the original anchor rather than drifting after February", () => {
  assert.deepEqual(getRecurringDates("2026-01-31", "2026-05-31", "Monthly"), [
    "2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31",
  ]);
  assert.deepEqual(getRecurringDates("2028-01-31", "2028-03-31", "Monthly", "2028-02-28", "2028-03-05"), ["2028-02-29"]);
});

test("all longer frequencies use calendar months and preserve leap-year anchors", () => {
  assert.deepEqual(getRecurringDates("2026-01-31", "2026-10-31", "Quarterly"), ["2026-01-31", "2026-04-30", "2026-07-31", "2026-10-31"]);
  assert.deepEqual(getRecurringDates("2026-08-31", "2027-08-31", "SemiAnnually"), ["2026-08-31", "2027-02-28", "2027-08-31"]);
  assert.deepEqual(getRecurringDates("2028-02-29", "2032-02-29", "Annually"), ["2028-02-29", "2029-02-28", "2030-02-28", "2031-02-28", "2032-02-29"]);
});

test("no defaults before the start or after the inclusive end", () => {
  assert.deepEqual(getRecurringDates("2026-10-07", "2026-10-07", "Weekly"), ["2026-10-07"]);
  assert.deepEqual(getRecurringDates("2026-10-07", "2026-10-21", "Weekly", "2026-09-28", "2026-10-04"), []);
  assert.deepEqual(getRecurringDates("2026-10-07", "2026-10-21", "Weekly", "2026-10-26", "2026-11-01"), []);
  assert.deepEqual(getRecurringDates("9999-12-31", "9999-12-31", "Monthly"), ["9999-12-31"]);
});

test("required schedule validation rejects missing dates, impossible dates, and invalid frequencies", () => {
  for (const [start, end, frequency] of [
    [null, "2026-10-31", "Weekly"],
    ["2026-10-01", null, "Weekly"],
    ["2026-10-01", "", "Weekly"],
    ["2026-02-30", "2026-10-31", "Weekly"],
    ["2026-10-01", "2026-02-30", "Weekly"],
    ["2026-10-01", "2026-09-30", "Weekly"],
    ["2026-10-01", "2026-10-31", "Daily"],
  ]) assert.throws(() => validateRecurringSchedule(start, end, frequency));
  assert.equal(isCalendarDate("2028-02-29"), true);
  assert.equal(isCalendarDate("0000-01-01"), false);
  assert.throws(() => getRecurringDates("2026-10-01", "2026-10-31", "Weekly", "invalid", "2026-10-31"));
});
