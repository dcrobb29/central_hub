import { getPool, sql } from "@/app/lib/db";
import { ProjectAccessError } from "@/app/lib/project-access-error";
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

export async function getScopeTemplates(organizationId: number): Promise<ScopeTemplateSummary[]> {
  const pool = await getPool();
  const result = await pool.request().input("orgId", sql.Int, organizationId).query<ScopeTemplateSummary>(`
    SELECT
      t.ScopeTemplateID AS scopeTemplateId,
      t.TemplateName AS templateName,
      t.UnitName AS unitName,
      COUNT(c.ScopeTemplateComponentID) AS componentCount
    FROM dbo.ScopeTemplates t
    LEFT JOIN dbo.ScopeTemplateComponents c
      ON c.ScopeTemplateID = t.ScopeTemplateID AND c.OrganizationID = t.OrganizationID
    WHERE t.IsActive = 1 AND t.OrganizationID = @orgId
    GROUP BY t.ScopeTemplateID, t.TemplateName, t.UnitName
    ORDER BY t.TemplateName
  `);
  return result.recordset;
}

export async function getScopeTemplateDetails(organizationId: number, scopeTemplateId: number): Promise<ScopeTemplateDetails | null> {
  const pool = await getPool();
  const templateResult = await pool.request()
    .input("orgId", sql.Int, organizationId)
    .input("scopeTemplateId", sql.Int, scopeTemplateId)
    .query<{ ScopeTemplateID: number; TemplateName: string; UnitName: string }>(`
      SELECT ScopeTemplateID, TemplateName, UnitName
      FROM dbo.ScopeTemplates
      WHERE ScopeTemplateID = @scopeTemplateId AND OrganizationID = @orgId AND IsActive = 1
    `);
  const template = templateResult.recordset[0];
  if (!template) return null;

  const componentsResult = await pool.request()
    .input("orgId", sql.Int, organizationId)
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
      WHERE ScopeTemplateID = @scopeTemplateId AND OrganizationID = @orgId
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

export async function createScopeTemplate(organizationId: number, input: ScopeTemplateInput): Promise<number> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await requireOrganizationMaterials(transaction, organizationId, input.components);
    const templateResult = await transaction.request()
      .input("orgId", sql.Int, organizationId)
      .input("templateName", sql.NVarChar(150), input.templateName)
      .input("unitName", sql.NVarChar(30), input.unitName)
      .query<{ ScopeTemplateID: number }>(`
        INSERT INTO dbo.ScopeTemplates (TemplateName, UnitName, OrganizationID)
        OUTPUT inserted.ScopeTemplateID
        VALUES (@templateName, @unitName, @orgId)
      `);
    const scopeTemplateId = templateResult.recordset[0].ScopeTemplateID;

    await insertComponents(transaction, organizationId, scopeTemplateId, input.components);

    await transaction.commit();
    return scopeTemplateId;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function updateScopeTemplate(organizationId: number, scopeTemplateId: number, input: ScopeTemplateInput): Promise<void> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await requireOrganizationMaterials(transaction, organizationId, input.components);
    const updated = await transaction.request()
      .input("orgId", sql.Int, organizationId)
      .input("scopeTemplateId", sql.Int, scopeTemplateId)
      .input("templateName", sql.NVarChar(150), input.templateName)
      .input("unitName", sql.NVarChar(30), input.unitName)
      .query(`
        UPDATE dbo.ScopeTemplates
        SET TemplateName = @templateName, UnitName = @unitName
        WHERE ScopeTemplateID = @scopeTemplateId AND OrganizationID = @orgId AND IsActive = 1
      `);
    // Stop before touching components so another organization's template is never modified.
    if (!updated.rowsAffected[0]) throw new ProjectAccessError("Scope template not found", 404);

    // Components have no history to preserve (unlike material prices), so replacing them
    // wholesale on every edit keeps this simple: delete, then reinsert in the submitted order.
    await transaction.request()
      .input("orgId", sql.Int, organizationId)
      .input("scopeTemplateId", sql.Int, scopeTemplateId)
      .query(`DELETE FROM dbo.ScopeTemplateComponents WHERE ScopeTemplateID = @scopeTemplateId AND OrganizationID = @orgId`);

    await insertComponents(transaction, organizationId, scopeTemplateId, input.components);

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// Components may only reference materials from the same organization's library.
async function requireOrganizationMaterials(transaction: sql.Transaction, organizationId: number, components: ScopeTemplateComponentInput[]) {
  const ids = [...new Set(components.flatMap((component) => component.materialId == null ? [] : [component.materialId]))];
  for (const materialId of ids) {
    const found = await transaction.request()
      .input("orgId", sql.Int, organizationId)
      .input("materialId", sql.Int, materialId)
      .query("SELECT 1 AS found FROM dbo.Materials WHERE MaterialID = @materialId AND OrganizationID = @orgId");
    if (!found.recordset.length) throw new ProjectAccessError("Choose a material from your catalog", 400);
  }
}

async function insertComponents(transaction: sql.Transaction, organizationId: number, scopeTemplateId: number, components: ScopeTemplateComponentInput[]) {
  for (const [index, component] of components.entries()) {
    await transaction.request()
      .input("orgId", sql.Int, organizationId)
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
          ScopeTemplateID, Description, LineType, QuantityPerUnit, UnitName, UnitCost, MaterialID, SortOrder, OrganizationID
        )
        VALUES (@scopeTemplateId, @description, @lineType, @quantityPerUnit, @unitName, @unitCost, @materialId, @sortOrder, @orgId)
      `);
  }
}

// Soft-delete only (mirrors Materials.IsActive) — a template may have already been applied into
// existing estimates' line items, which have no live link back to it, so nothing else needs to change.
export async function deleteScopeTemplate(organizationId: number, scopeTemplateId: number): Promise<void> {
  const pool = await getPool();
  const result = await pool.request()
    .input("orgId", sql.Int, organizationId)
    .input("scopeTemplateId", sql.Int, scopeTemplateId)
    .query(`UPDATE dbo.ScopeTemplates SET IsActive = 0 WHERE ScopeTemplateID = @scopeTemplateId AND OrganizationID = @orgId AND IsActive = 1`);
  if (!result.rowsAffected[0]) throw new ProjectAccessError("Scope template not found", 404);
}

