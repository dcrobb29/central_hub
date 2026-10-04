import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultUnitAbbreviation,
  findUnitPreset,
  InvalidUnitPresetError,
  prepareUnitPresets,
  requireUnitAbbreviation,
} from "./unit-presets.ts";

const presets = prepareUnitPresets([
  { unitName: "Hour                ", abbreviation: "hr        " },
  { unitName: "Each                ", abbreviation: "EA        " },
]);

test("trims nchar padding, sorts abbreviations, and preserves configured casing", () => {
  assert.deepEqual(presets, [
    { unitName: "Each", abbreviation: "EA" },
    { unitName: "Hour", abbreviation: "hr" },
  ]);
});

test("defaults to the EA preset's exact casing, never an invented preset", () => {
  assert.equal(defaultUnitAbbreviation(presets), "EA");
  assert.equal(defaultUnitAbbreviation([{ unitName: "Each", abbreviation: "ea" }]), "ea");
  assert.equal(defaultUnitAbbreviation([]), "");
  assert.equal(defaultUnitAbbreviation([{ unitName: "Hour", abbreviation: "hr" }]), "");
});

test("matches old, catalog, and template abbreviations regardless of case or padding", () => {
  assert.equal(requireUnitAbbreviation(" ea  ", presets, 1), "EA");
  assert.equal(requireUnitAbbreviation("HR", presets, 2), "hr");
  assert.equal(findUnitPreset("EA", presets)?.unitName, "Each");
});

test("rejects missing, unknown, and full-name units with a line-specific error", () => {
  for (const value of [null, "", "   ", "ft", "Each"]) {
    assert.throws(
      () => requireUnitAbbreviation(value, presets, 3),
      (error) => error instanceof InvalidUnitPresetError && error.message === "Choose a preset unit for line 3",
    );
    assert.equal(findUnitPreset(value, presets), undefined);
  }
});

test("rejects nonempty units when no presets exist", () => {
  assert.throws(() => requireUnitAbbreviation("EA", [], 1), InvalidUnitPresetError);
});

test("deduplicates identical abbreviations and rejects conflicting canonical casing", () => {
  assert.deepEqual(prepareUnitPresets([...presets, presets[0]]), presets);
  assert.throws(
    () => prepareUnitPresets([...presets, { unitName: "Each", abbreviation: "ea" }]),
    /conflicting casing/,
  );
});

test("rejects blank database preset names and abbreviations", () => {
  for (const row of [
    { unitName: " ", abbreviation: "EA" },
    { unitName: "Each", abbreviation: " " },
  ]) {
    assert.throws(() => prepareUnitPresets([row]), /blank name or abbreviation/);
  }
});
