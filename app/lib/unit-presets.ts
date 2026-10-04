export type UnitPreset = {
  unitName: string;
  abbreviation: string;
};

export function prepareUnitPresets(rows: UnitPreset[]): UnitPreset[] {
  const presets = new Map<string, UnitPreset>();
  for (const row of rows) {
    const unitName = row.unitName.trim();
    const abbreviation = row.abbreviation.trim();
    if (!unitName || !abbreviation) {
      throw new Error("UnitsOfMeasurement contains a blank name or abbreviation");
    }
    const key = abbreviation.toLowerCase();
    const existing = presets.get(key);
    if (existing && existing.abbreviation !== abbreviation) {
      throw new Error(`UnitsOfMeasurement contains conflicting casing for "${abbreviation}"`);
    }
    if (!existing) presets.set(key, { unitName, abbreviation });
  }
  return [...presets.values()].sort((a, b) => a.abbreviation.localeCompare(b.abbreviation));
}

export function findUnitPreset(value: string | null, presets: UnitPreset[]): UnitPreset | undefined {
  const key = value?.trim().toLowerCase();
  return key ? presets.find((preset) => preset.abbreviation.toLowerCase() === key) : undefined;
}

export function defaultUnitAbbreviation(presets: UnitPreset[]): string {
  return findUnitPreset("EA", presets)?.abbreviation ?? "";
}

export class InvalidUnitPresetError extends Error {}

export function requireUnitAbbreviation(value: string | null, presets: UnitPreset[], lineNumber: number): string {
  const preset = findUnitPreset(value, presets);
  if (!preset) {
    throw new InvalidUnitPresetError(`Choose a preset unit for line ${lineNumber}`);
  }
  return preset.abbreviation;
}
