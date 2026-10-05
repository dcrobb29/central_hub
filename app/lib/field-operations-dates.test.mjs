import assert from "node:assert/strict";
import { test } from "node:test";
import { getCurrentWeekRange, getEstimatedLaborHours } from "./field-operations-dates.ts";

test("week range starts Monday and ends Sunday, including month and year boundaries", () => {
  assert.deepEqual(getCurrentWeekRange(new Date("2026-10-04T16:00:00Z")), {
    startDate: "2026-09-28",
    endDate: "2026-10-04",
  });
  assert.deepEqual(getCurrentWeekRange(new Date("2027-01-01T12:00:00Z")), {
    startDate: "2026-12-28",
    endDate: "2027-01-03",
  });
});

test("estimated labor includes only labor quantities measured in HR, case-insensitively", () => {
  assert.equal(getEstimatedLaborHours([
    { lineType: "Labor", unitName: "HR", quantity: 12 },
    { lineType: "Labor", unitName: "hr ", quantity: 4.5 },
    { lineType: "Labor", unitName: "EA", quantity: 8 },
    { lineType: "Material", unitName: "HR", quantity: 30 },
    { lineType: "Equipment", unitName: "HR", quantity: 10 },
    { lineType: "Labor", unitName: null, quantity: 100 },
  ]), 16.5);
});
