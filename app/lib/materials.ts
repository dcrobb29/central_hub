import { getPool, sql } from "@/app/lib/db";
import { ProjectAccessError } from "@/app/lib/project-access-error";

export type MaterialWithLatestPrice = {
  materialId: number;
  materialName: string;
  unitName: string | null;
  isActive: boolean;
  latestUnitCost: number | null;
  latestQuotedDate: string | null;
  latestVendorName: string | null;
};

export type MaterialPriceEntry = {
  materialPriceId: number;
  unitCost: number;
  quotedDate: string;
  vendorName: string | null;
  notes: string | null;
};

export async function getMaterialsWithLatestPrice(organizationId: number): Promise<MaterialWithLatestPrice[]> {
  const pool = await getPool();
  const result = await pool.request().input("orgId", sql.Int, organizationId).query<MaterialWithLatestPrice>(`
    SELECT
      m.MaterialID AS materialId,
      m.MaterialName AS materialName,
      m.UnitName AS unitName,
      m.IsActive AS isActive,
      latest.UnitCost AS latestUnitCost,
      CONVERT(char(10), latest.QuotedDate, 23) AS latestQuotedDate,
      latest.VendorName AS latestVendorName
    FROM dbo.Materials m
    OUTER APPLY (
      SELECT TOP (1) UnitCost, QuotedDate, VendorName
      FROM dbo.MaterialPrices
      WHERE MaterialID = m.MaterialID AND OrganizationID = m.OrganizationID
      ORDER BY QuotedDate DESC, MaterialPriceID DESC
    ) latest
    WHERE m.IsActive = 1 AND m.OrganizationID = @orgId
    ORDER BY m.MaterialName
  `);
  return result.recordset;
}

export async function getMaterialPriceHistory(organizationId: number, materialId: number): Promise<MaterialPriceEntry[]> {
  const pool = await getPool();
  const result = await pool.request()
    .input("orgId", sql.Int, organizationId)
    .input("materialId", sql.Int, materialId)
    .query<MaterialPriceEntry>(`
      SELECT
        MaterialPriceID AS materialPriceId,
        UnitCost AS unitCost,
        CONVERT(char(10), QuotedDate, 23) AS quotedDate,
        VendorName AS vendorName,
        Notes AS notes
      FROM dbo.MaterialPrices
      WHERE MaterialID = @materialId AND OrganizationID = @orgId
      ORDER BY QuotedDate DESC, MaterialPriceID DESC
    `);
  return result.recordset;
}

export async function createMaterial(organizationId: number, input: {
  materialName: string;
  unitName: string | null;
  unitCost: number;
  quotedDate: string;
  vendorName: string | null;
  notes: string | null;
}): Promise<number> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const materialResult = await transaction.request()
      .input("orgId", sql.Int, organizationId)
      .input("materialName", sql.NVarChar(200), input.materialName)
      .input("unitName", sql.NVarChar(30), input.unitName)
      .query<{ MaterialID: number }>(`
        INSERT INTO dbo.Materials (MaterialName, UnitName, OrganizationID)
        OUTPUT inserted.MaterialID
        VALUES (@materialName, @unitName, @orgId)
      `);
    const materialId = materialResult.recordset[0].MaterialID;

    await transaction.request()
      .input("orgId", sql.Int, organizationId)
      .input("materialId", sql.Int, materialId)
      .input("unitCost", sql.Decimal(19, 4), input.unitCost)
      .input("quotedDate", sql.Date, new Date(`${input.quotedDate}T00:00:00.000Z`))
      .input("vendorName", sql.NVarChar(150), input.vendorName)
      .input("notes", sql.NVarChar(300), input.notes)
      .query(`
        INSERT INTO dbo.MaterialPrices (MaterialID, UnitCost, QuotedDate, VendorName, Notes, OrganizationID)
        VALUES (@materialId, @unitCost, @quotedDate, @vendorName, @notes, @orgId)
      `);

    await transaction.commit();
    return materialId;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function addMaterialPrice(organizationId: number, materialId: number, input: {
  unitCost: number;
  quotedDate: string;
  vendorName: string | null;
  notes: string | null;
}): Promise<void> {
  const pool = await getPool();
  // Inserting from the material row means a material in another organization (or an unknown ID) adds nothing.
  const result = await pool.request()
    .input("orgId", sql.Int, organizationId)
    .input("materialId", sql.Int, materialId)
    .input("unitCost", sql.Decimal(19, 4), input.unitCost)
    .input("quotedDate", sql.Date, new Date(`${input.quotedDate}T00:00:00.000Z`))
    .input("vendorName", sql.NVarChar(150), input.vendorName)
    .input("notes", sql.NVarChar(300), input.notes)
    .query(`
      INSERT INTO dbo.MaterialPrices (MaterialID, UnitCost, QuotedDate, VendorName, Notes, OrganizationID)
      SELECT m.MaterialID, @unitCost, @quotedDate, @vendorName, @notes, m.OrganizationID
      FROM dbo.Materials m
      WHERE m.MaterialID = @materialId AND m.OrganizationID = @orgId AND m.IsActive = 1
    `);
  if (!result.rowsAffected[0]) throw new ProjectAccessError("Material not found", 404);
}
