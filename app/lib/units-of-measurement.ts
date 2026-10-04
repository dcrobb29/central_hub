import { getPool } from "@/app/lib/db";
import { prepareUnitPresets, type UnitPreset } from "@/app/lib/unit-presets";

export async function getUnitsOfMeasurement(): Promise<UnitPreset[]> {
  const pool = await getPool();
  const result = await pool.request().query<UnitPreset>(`
    SELECT [Unit Name] AS unitName, [Unit Abbreviation] AS abbreviation
    FROM dbo.UnitsOfMeasurement
    ORDER BY [Unit Abbreviation], [Unit Name]
  `);
  return prepareUnitPresets(result.recordset);
}
