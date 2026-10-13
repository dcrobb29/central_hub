import assert from "node:assert/strict";
import { test } from "node:test";
import { capacityLabel, dayCapacityLabel, fullJobHours, resolvePlanningHours, resourceCapacity, taskGroupKey, visitLaborHours } from "./field-capacity.ts";

const dates = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];
let nextAssignment = 1;
const row = (overrides) => ({
  projectId: 1, isRecurring: false, taskId: 1, estimateLineItemId: null, plannedLaborHours: 8,
  assignmentId: nextAssignment++, kind: "employee", hoursMode: "Split", customHours: null, ...overrides,
});
const assignment = (employeeId, hours, equipmentId = null) => ({ assignmentId: nextAssignment++, employeeId, equipmentId, hours });
const visit = (date, assignments) => ({ serviceVisitId: 1, projectId: 1, visitDate: date, tasks: [{ taskId: 1, assignments }] });

test("split evenly shares the task's hours and recalculates per assignee", () => {
  const { assignmentHours, taskSummaries } = resolvePlanningHours([
    row({ assignmentId: 1 }), row({ assignmentId: 2 }), row({ assignmentId: 3 }),
  ]);
  assert.equal(assignmentHours.get(1), 2.67);
  assert.equal(assignmentHours.get(3), 2.66);
  assert.equal(taskSummaries.get(1).remainingHours, 0);
  const single = resolvePlanningHours([row({ assignmentId: 4, plannedLaborHours: 3 })]);
  assert.equal(single.assignmentHours.get(4), 3);
  assert.equal(single.taskSummaries.get(1).remainingHours, 0);
});

test("fixed modes are subtracted first, flexible modes share the remainder, overage is reported", () => {
  const { assignmentHours, taskSummaries } = resolvePlanningHours([
    row({ assignmentId: 1, plannedLaborHours: 20, hoursMode: "FullDay" }),
    row({ assignmentId: 2, plannedLaborHours: 20, hoursMode: "HalfDay" }),
    row({ assignmentId: 3, plannedLaborHours: 20, hoursMode: "Custom", customHours: 2.5 }),
    row({ assignmentId: 4, plannedLaborHours: 20, hoursMode: "Split" }),
    row({ assignmentId: 5, plannedLaborHours: 20, hoursMode: "FullJob" }),
  ]);
  assert.deepEqual([1, 2, 3, 4, 5].map((id) => assignmentHours.get(id)), [8, 4, 2.5, 2.75, 2.75]);
  assert.equal(taskSummaries.get(1).remainingHours, 0);
  const over = resolvePlanningHours([
    row({ assignmentId: 6, plannedLaborHours: 6, hoursMode: "FullDay" }),
    row({ assignmentId: 7, plannedLaborHours: 6, hoursMode: "Split" }),
  ]);
  assert.equal(over.assignmentHours.get(7), 0);
  assert.equal(over.taskSummaries.get(1).remainingHours, -2);
});

test("legacy assignments keep the task's planned hours and unstaffed tasks keep their full allotment", () => {
  const { assignmentHours, taskSummaries } = resolvePlanningHours([
    row({ taskId: 1, assignmentId: 1, plannedLaborHours: 1, hoursMode: null }),
    row({ taskId: 1, assignmentId: 2, plannedLaborHours: 1, hoursMode: null }),
    row({ taskId: 2, assignmentId: null, kind: null, hoursMode: null, plannedLaborHours: 5 }),
  ]);
  assert.equal(assignmentHours.get(1), 1);
  assert.equal(assignmentHours.get(2), 1);
  assert.equal(taskSummaries.get(1).remainingHours, -1);
  assert.equal(taskSummaries.get(2).remainingHours, 5);
});

test("equipment hours are tracked separately and never use up labor hours", () => {
  const { assignmentHours, taskSummaries } = resolvePlanningHours([
    row({ assignmentId: 1, plannedLaborHours: 6 }),
    row({ assignmentId: 2, plannedLaborHours: 6, kind: "equipment" }),
    row({ assignmentId: 3, plannedLaborHours: 6, kind: "equipment", hoursMode: "HalfDay" }),
  ]);
  assert.equal(assignmentHours.get(1), 6);
  assert.equal(assignmentHours.get(2), 2);
  assert.equal(taskSummaries.get(1).remainingHours, 0);
  assert.equal(taskSummaries.get(1).equipmentRemainingHours, 0);
});

test("estimate tasks on one-time projects draw down across visits; recurring and manual tasks do not", () => {
  const { assignmentHours, taskSummaries } = resolvePlanningHours([
    row({ taskId: 10, estimateLineItemId: 50, plannedLaborHours: 30, assignmentId: 1, hoursMode: "FullDay" }),
    row({ taskId: 11, estimateLineItemId: 50, plannedLaborHours: 30, assignmentId: 2, hoursMode: "FullDay" }),
    row({ taskId: 11, estimateLineItemId: 50, plannedLaborHours: 30, assignmentId: 3, hoursMode: "Split" }),
  ]);
  assert.equal(assignmentHours.get(3), 14);
  assert.equal(taskSummaries.get(10).remainingHours, 0);
  assert.equal(taskSummaries.get(10).sharedAcrossVisits, true);
  assert.equal(taskSummaries.get(11), taskSummaries.get(10));
  assert.equal(taskGroupKey({ projectId: 1, isRecurring: true, taskId: 10, estimateLineItemId: 50 }), "task:10");
  assert.equal(taskGroupKey({ projectId: 1, isRecurring: false, taskId: 10, estimateLineItemId: null }), "task:10");
  const recurring = resolvePlanningHours([
    row({ taskId: 20, isRecurring: true, estimateLineItemId: 60, plannedLaborHours: 4, assignmentId: 4 }),
    row({ taskId: 21, isRecurring: true, estimateLineItemId: 60, plannedLaborHours: 4, assignmentId: 5 }),
  ]);
  assert.equal(recurring.assignmentHours.get(4), 4);
  assert.equal(recurring.assignmentHours.get(5), 4);
  assert.equal(recurring.taskSummaries.get(20).sharedAcrossVisits, false);
});

test("full job hours are the task's remaining hours plus the resource's current share", () => {
  assert.equal(fullJobHours(3, 2), 5);
  assert.equal(fullJobHours(-4, 2), 0);
});

test("resource capacity sums per-assignment hours by day and kind, excluding dates outside the week", () => {
  const visits = [
    visit(dates[0], [assignment(1, 6), assignment(2, 1.5), assignment(null, 4, 9)]),
    visit(dates[0], [assignment(1, 2)]),
    visit(dates[5], [assignment(1, 3)]),
    visit("2026-10-12", [assignment(1, 40)]),
  ];
  const employees = resourceCapacity(visits, dates, "employee");
  assert.equal(employees.get(1).get(dates[0]), 8);
  assert.equal(employees.get(2).get(dates[0]), 1.5);
  assert.equal(employees.get(1).get(dates[5]), 3);
  assert.equal(employees.get(1).get("2026-10-12"), undefined);
  assert.equal(employees.has(9), false);
  const equipment = resourceCapacity(visits, dates, "equipment");
  assert.equal(equipment.get(9).get(dates[0]), 4);
  assert.equal(equipment.size, 1);
  assert.equal(visitLaborHours(visits[0]), 7.5);
  assert.equal(resourceCapacity([], dates, "employee").size, 0);
});

test("capacity labels preserve daily and weekly overages and do not invent weekend availability", () => {
  assert.equal(capacityLabel(0, 8), "8h free");
  assert.equal(capacityLabel(8, 8), "Full");
  assert.equal(capacityLabel(42.5, 40), "2.5h over");
  assert.equal(dayCapacityLabel(10, dates[1]), "2h over");
  assert.equal(dayCapacityLabel(0.75, dates[2]), "7.25h free");
  assert.equal(dayCapacityLabel(0, dates[5]), "Off / 0h planned");
  assert.equal(dayCapacityLabel(2, dates[6]), "2h weekend work");
});
