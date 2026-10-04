import assert from "node:assert/strict";
import { test } from "node:test";
import { ESTIMATE_NOTES_MAX_LENGTH, parseEstimateNotes } from "./estimate-notes.ts";

test("notes are optional and blank notes are stored as null", () => {
  for (const value of [undefined, null, "", " \r\n "]) {
    assert.equal(parseEstimateNotes(value), null);
  }
});

test("trims surrounding whitespace while preserving multiline plain text", () => {
  assert.equal(parseEstimateNotes("  Crew access\r\nGate code: 1234  "), "Crew access\r\nGate code: 1234");
  assert.equal(parseEstimateNotes("<script>not markup</script>"), "<script>not markup</script>");
});

test("accepts exactly the limit and rejects notes exceeding it", () => {
  const notes = "a".repeat(ESTIMATE_NOTES_MAX_LENGTH);
  assert.equal(parseEstimateNotes(notes), notes);
  assert.throws(() => parseEstimateNotes(`${notes}a`), /4000 characters or fewer/);
});

test("rejects non-text notes instead of silently losing them", () => {
  for (const value of [42, false, {}, []]) {
    assert.throws(() => parseEstimateNotes(value), /must be text/);
  }
});

test("validates each section independently with field-specific errors", () => {
  assert.equal(parseEstimateNotes(" Private ", "Internal notes"), "Private");
  assert.equal(parseEstimateNotes(" Public ", "Customer notes"), "Public");
  assert.throws(() => parseEstimateNotes(42, "Internal notes"), /Internal notes must be text/);
  assert.throws(
    () => parseEstimateNotes("a".repeat(4001), "Customer notes"),
    /Customer notes must be 4000 characters or fewer/,
  );
});
