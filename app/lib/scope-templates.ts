import { getPool, sql } from "@/app/lib/db";
import type { LineType } from "@/app/lib/estimates";

export type ScopeTemplateComponent = {
  scopeTemplateComponentId: number;
  description: string;
  lineType: LineType;
  quantityPerUnit: number;
  unitName: string | null;
  unitCost: number;
  materialId: number | null;
  sortOrder: number;
};

export type ScopeTemplateComponentInput = {
  description: string;
  lineType: LineType;
  quantityPerUnit: number;
  unitName: string | null;
  unitCost: number;
  materialId: number | null;
};

export type ScopeTemplateSummary = {
  scopeTemplateId: number;
  templateName: string;
  unitName: string;
  componentCount: number;
};

export type ScopeTemplateDetails = ScopeTemplateSummary & {
  components: ScopeTemplateComponent[];
};

export type ScopeTemplateInput = {
  templateName: string;
  unitName: string;
  components: ScopeTemplateComponentInput[];
};

export async function getScopeTemplates(): Promise<ScopeTemplateSummary[]> {
  const pool = await getPool();
  const result = await pool.request().query<ScopeTemplateSummary>(`
    SELECT
      t.ScopeTemplateID AS scopeTemplateId,
      t.TemplateName AS templateName,
      t.UnitName AS unitName,
      COUNT(c.ScopeTemplateComponentID) AS componentCount
    FROM dbo.ScopeTemplates t
    LEFT JOIN dbo.ScopeTemplateComponents c ON c.ScopeTemplateID = t.ScopeTemplateID
    WHERE t.IsActive = 1
    GROUP BY t.ScopeTemplateID, t.TemplateName, t.UnitName
    ORDER BY t.TemplateName
  `);
  return result.recordset;
}

export async function getScopeTemplateDetails(scopeTemplateId: number): Promise<ScopeTemplateDetails | null> {
  const pool = await getPool();
  const templateResult = await pool.request()
    .input("scopeTemplateId", sql.Int, scopeTemplateId)
    .query<{ ScopeTemplateID: number; TemplateName: string; UnitName: string }>(`
      SELECT ScopeTemplateID, TemplateName, UnitName
      FROM dbo.ScopeTemplates
      WHERE ScopeTemplateID = @scopeTemplateId AND IsActive = 1
    `);
  const template = templateResult.recordset[0];
  if (!template) return null;

  const componentsResult = await pool.request()
    .input("scopeTemplateId", sql.Int, scopeTemplateId)
    .query<ScopeTemplateComponent>(`
      SELECT
        ScopeTemplateComponentID AS scopeTemplateComponentId,
        Description AS description,
        LineType AS lineType,
        QuantityPerUnit AS quantityPerUnit,
        UnitName AS unitName,
        UnitCost AS unitCost,
        MaterialID AS materialId,
        SortOrder AS sortOrder
      FROM dbo.ScopeTemplateComponents
      WHERE ScopeTemplateID = @scopeTemplateId
      ORDER BY SortOrder
    `);

  return {
    scopeTemplateId: template.ScopeTemplateID,
    templateName: template.TemplateName,
    unitName: template.UnitName,
    componentCount: componentsResult.recordset.length,
    components: componentsResult.recordset,
  };
}

export async function createScopeTemplate(input: ScopeTemplateInput): Promise<number> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const templateResult = await transaction.request()
      .input("templateName", sql.NVarChar(150), input.templateName)
      .input("unitName", sql.NVarChar(30), input.unitName)
      .query<{ ScopeTemplateID: number }>(`
        INSERT INTO dbo.ScopeTemplates (TemplateName, UnitName)
        OUTPUT inserted.ScopeTemplateID
        VALUES (@templateName, @unitName)
      `);
    const scopeTemplateId = templateResult.recordset[0].ScopeTemplateID;

    await insertComponents(transaction, scopeTemplateId, input.components);

    await transaction.commit();
    return scopeTemplateId;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function updateScopeTemplate(scopeTemplateId: number, input: ScopeTemplateInput): Promise<void> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await transaction.request()
      .input("scopeTemplateId", sql.Int, scopeTemplateId)
      .input("templateName", sql.NVarChar(150), input.templateName)
      .input("unitName", sql.NVarChar(30), input.unitName)
      .query(`
        UPDATE dbo.ScopeTemplates
        SET TemplateName = @templateName, UnitName = @unitName
        WHERE ScopeTemplateID = @scopeTemplateId AND IsActive = 1
      `);

    // Components have no history to preserve (unlike material prices), so replacing them
    // wholesale on every edit keeps this simple: delete, then reinsert in the submitted order.
    await transaction.request()
      .input("scopeTemplateId", sql.Int, scopeTemplateId)
      .query(`DELETE FROM dbo.ScopeTemplateComponents WHERE ScopeTemplateID = @scopeTemplateId`);

    await insertComponents(transaction, scopeTemplateId, input.components);

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function insertComponents(transaction: sql.Transaction, scopeTemplateId: number, components: ScopeTemplateComponentInput[]) {
  for (const [index, component] of components.entries()) {
    await transaction.request()
      .input("scopeTemplateId", sql.Int, scopeTemplateId)
      .input("description", sql.NVarChar(300), component.description)
      .input("lineType", sql.VarChar(16), component.lineType)
      .input("quantityPerUnit", sql.Decimal(19, 6), component.quantityPerUnit)
      .input("unitName", sql.NVarChar(30), component.unitName)
      .input("unitCost", sql.Decimal(19, 4), component.unitCost)
      .input("materialId", sql.Int, component.materialId)
      .input("sortOrder", sql.Int, index)
      .query(`
        INSERT INTO dbo.ScopeTemplateComponents (
          ScopeTemplateID, Description, LineType, QuantityPerUnit, UnitName, UnitCost, MaterialID, SortOrder
        )
        VALUES (@scopeTemplateId, @description, @lineType, @quantityPerUnit, @unitName, @unitCost, @materialId, @sortOrder)
      `);
  }
}

// Soft-delete only (mirrors Materials.IsActive) — a template may have already been applied into
// existing estimates' line items, which have no live link back to it, so nothing else needs to change.
export async function deleteScopeTemplate(scopeTemplateId: number): Promise<void> {
  const pool = await getPool();
  await pool.request()
    .input("scopeTemplateId", sql.Int, scopeTemplateId)
    .query(`UPDATE dbo.ScopeTemplates SET IsActive = 0 WHERE ScopeTemplateID = @scopeTemplateId`);
}
