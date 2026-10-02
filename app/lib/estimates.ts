import { getPool, sql } from "@/app/lib/db";
import {
  calculateEstimate,
  type EstimateMarkupMode,
  type EstimatePricingLine,
} from "@/app/lib/estimate-pricing";

export type LineType = "Material" | "Labor" | "Equipment";
export type EstimateGroupingMode = "None" | "Scope" | "Type";

export type EstimateLineInput = EstimatePricingLine & {
  description: string;
  unitName: string | null;
  materialId: number | null;
  catalogUnitCostAtEntry: number | null;
  catalogPriceDate: string | null;
  lineType: LineType;
  scopeName: string | null;
};

export type CreateEstimateInput = {
  estimateName: string;
  customerName: string | null;
  markupMode: EstimateMarkupMode;
  estimateMarkupPercent: number;
  taxPercent: number;
  roundingIncrement: number;
  groupingMode: EstimateGroupingMode;
  scopes: string[];
  lines: EstimateLineInput[];
};

export type EstimatePrintOptions = {
  showQuantities: boolean;
  showLineTotals: boolean;
  showSummaryTotal: boolean;
  showScopesOfWork: boolean;
};

export type EstimateScope = {
  estimateScopeOfWorkId: number;
  scopeName: string;
  sortOrder: number;
};

export type EstimateSummary = {
  estimateId: number;
  estimateName: string;
  customerName: string | null;
  status: "Draft" | "Won" | "Lost";
  showQuantities: boolean;
  showLineTotals: boolean;
  showSummaryTotal: boolean;
  showScopesOfWork: boolean;
  createdAt: string;
  revisionId: number;
  revisionNumber: number;
  markupMode: EstimateMarkupMode;
  groupingMode: EstimateGroupingMode;
  estimateMarkupPercent: number;
  taxPercent: number;
  roundingIncrement: number;
  quotedTotal: number;
  lineCount: number;
  projectId: number | null;
};

export type EstimateLine = EstimateLineInput & {
  estimateLineItemId: number;
  lineNumber: number;
  estimateScopeOfWorkId: number | null;
};

export type EstimateDetails = EstimateSummary & {
  lines: EstimateLine[];
  scopes: EstimateScope[];
};

export type ProjectScopeLine = {
  lineNumber: number;
  description: string;
  quantity: number;
  unitName: string | null;
  unitCost: number;
  lineMarkupPercent: number;
};

export type ProjectWithEstimate = {
  projectId: number;
  projectName: string;
  projectStatus: string;
  estimateName: string | null;
  customerName: string | null;
  estimateRevisionNumber: number | null;
  quotedTotal: number | null;
  lines: ProjectScopeLine[];
};

export async function getEstimates(): Promise<EstimateSummary[]> {
  const pool = await getPool();
  const result = await pool.request().query<EstimateSummary>(`
    SELECT
      e.EstimateID AS estimateId,
      e.EstimateName AS estimateName,
      e.CustomerName AS customerName,
      e.EstimateStatus AS status,
      e.ShowQuantities AS showQuantities,
      e.ShowLineTotals AS showLineTotals,
      e.ShowSummaryTotal AS showSummaryTotal,
      e.ShowScopesOfWork AS showScopesOfWork,
      CONVERT(varchar(19), e.CreatedAt, 126) AS createdAt,
      r.EstimateRevisionID AS revisionId,
      r.RevisionNumber AS revisionNumber,
      r.MarkupMode AS markupMode,
      r.GroupingMode AS groupingMode,
      r.EstimateMarkupPercent AS estimateMarkupPercent,
      r.TaxPercent AS taxPercent,
      r.RoundingIncrement AS roundingIncrement,
      r.QuotedTotal AS quotedTotal,
      COALESCE(lines.LineCount, 0) AS lineCount,
      p.ProjectID AS projectId
    FROM dbo.Estimates e
    OUTER APPLY (
      SELECT TOP (1) r.*
      FROM dbo.EstimateRevisions r
      WHERE r.EstimateID = e.EstimateID
      ORDER BY r.RevisionNumber DESC
    ) r
    OUTER APPLY (
      SELECT COUNT(*) AS LineCount
      FROM dbo.EstimateLineItems li
      WHERE li.EstimateRevisionID = r.EstimateRevisionID
    ) lines
    LEFT JOIN dbo.Projects p ON p.AcceptedEstimateRevisionID = r.EstimateRevisionID
    ORDER BY e.CreatedAt DESC, e.EstimateID DESC
  `);
  return result.recordset;
}

export async function getEstimateDetails(estimateId: number): Promise<EstimateDetails | null> {
  const pool = await getPool();
  const estimate = await pool.request()
    .input("estimateId", sql.Int, estimateId)
    .query<EstimateSummary>(`
      SELECT TOP (1)
        e.EstimateID AS estimateId,
        e.EstimateName AS estimateName,
        e.CustomerName AS customerName,
        e.EstimateStatus AS status,
        e.ShowQuantities AS showQuantities,
        e.ShowLineTotals AS showLineTotals,
        e.ShowSummaryTotal AS showSummaryTotal,
        e.ShowScopesOfWork AS showScopesOfWork,
        CONVERT(varchar(19), e.CreatedAt, 126) AS createdAt,
        r.EstimateRevisionID AS revisionId,
        r.RevisionNumber AS revisionNumber,
        r.MarkupMode AS markupMode,
        r.GroupingMode AS groupingMode,
        r.EstimateMarkupPercent AS estimateMarkupPercent,
        r.TaxPercent AS taxPercent,
        r.RoundingIncrement AS roundingIncrement,
        r.QuotedTotal AS quotedTotal,
        (SELECT COUNT(*) FROM dbo.EstimateLineItems li WHERE li.EstimateRevisionID = r.EstimateRevisionID) AS lineCount,
        p.ProjectID AS projectId
      FROM dbo.Estimates e
      LEFT JOIN dbo.EstimateRevisions r ON r.EstimateID = e.EstimateID
      LEFT JOIN dbo.Projects p ON p.AcceptedEstimateRevisionID = r.EstimateRevisionID
      WHERE e.EstimateID = @estimateId
      ORDER BY r.RevisionNumber DESC
    `);
  const summary = estimate.recordset[0];
  if (!summary) return null;
  const lines = await pool.request()
    .input("revisionId", sql.Int, summary.revisionId)
    .query<EstimateLine>(`
      SELECT
        EstimateLineItemID AS estimateLineItemId,
        LineNumber AS lineNumber,
        Description AS description,
        Quantity AS quantity,
        UnitName AS unitName,
        UnitCost AS unitCost,
        FreightAmount AS freightAmount,
        LineMarkupPercent AS lineMarkupPercent,
        MaterialID AS materialId,
        CatalogUnitCostAtEntry AS catalogUnitCostAtEntry,
        CONVERT(char(10), CatalogPriceDate, 23) AS catalogPriceDate,
        LineType AS lineType,
        EstimateScopeOfWorkID AS estimateScopeOfWorkId,
        NULL AS scopeName
      FROM dbo.EstimateLineItems
      WHERE EstimateRevisionID = @revisionId
      ORDER BY LineNumber
    `);
  const scopes = await pool.request()
    .input("revisionId", sql.Int, summary.revisionId)
    .query<EstimateScope>(`
      SELECT
        EstimateScopeOfWorkID AS estimateScopeOfWorkId,
        ScopeName AS scopeName,
        SortOrder AS sortOrder
      FROM dbo.EstimateScopesOfWork
      WHERE EstimateRevisionID = @revisionId
      ORDER BY SortOrder, ScopeName
    `);
  const scopeNameById = new Map(scopes.recordset.map((scope) => [scope.estimateScopeOfWorkId, scope.scopeName]));
  const linesWithScopeNames = lines.recordset.map((line) => ({
    ...line,
    scopeName: line.estimateScopeOfWorkId !== null ? scopeNameById.get(line.estimateScopeOfWorkId) ?? null : null,
  }));
  return { ...summary, lines: linesWithScopeNames, scopes: scopes.recordset };
}

export async function createEstimate(input: CreateEstimateInput): Promise<number> {
  const pricing = calculateEstimate(input);
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const estimateResult = await transaction.request()
      .input("estimateName", sql.NVarChar(150), input.estimateName)
      .input("customerName", sql.NVarChar(150), input.customerName)
      .query<{ EstimateID: number }>(`
        INSERT INTO dbo.Estimates (EstimateName, CustomerName)
        OUTPUT inserted.EstimateID
        VALUES (@estimateName, @customerName)
      `);
    const estimateId = estimateResult.recordset[0].EstimateID;

    const revisionResult = await transaction.request()
      .input("estimateId", sql.Int, estimateId)
      .input("markupMode", sql.VarChar(16), input.markupMode)
      .input("groupingMode", sql.VarChar(16), input.groupingMode)
      .input("estimateMarkupPercent", sql.Decimal(9, 4), input.estimateMarkupPercent)
      .input("taxPercent", sql.Decimal(9, 4), input.taxPercent)
      .input("roundingIncrement", sql.Decimal(19, 2), input.roundingIncrement)
      .input("quotedTotal", sql.Decimal(19, 2), pricing.quotedTotal)
      .query<{ EstimateRevisionID: number }>(`
        INSERT INTO dbo.EstimateRevisions (
          EstimateID, RevisionNumber, MarkupMode, GroupingMode, EstimateMarkupPercent,
          TaxPercent, RoundingIncrement, QuotedTotal
        )
        OUTPUT inserted.EstimateRevisionID
        VALUES (@estimateId, 1, @markupMode, @groupingMode, @estimateMarkupPercent,
          @taxPercent, @roundingIncrement, @quotedTotal)
      `);
    const revisionId = revisionResult.recordset[0].EstimateRevisionID;

    const scopeIdByName = new Map<string, number>();
    for (const [index, scopeName] of input.scopes.entries()) {
      const scopeResult = await transaction.request()
        .input("revisionId", sql.Int, revisionId)
        .input("scopeName", sql.NVarChar(150), scopeName)
        .input("sortOrder", sql.Int, index)
        .query<{ EstimateScopeOfWorkID: number }>(`
          INSERT INTO dbo.EstimateScopesOfWork (EstimateRevisionID, ScopeName, SortOrder)
          OUTPUT inserted.EstimateScopeOfWorkID
          VALUES (@revisionId, @scopeName, @sortOrder)
        `);
      scopeIdByName.set(scopeName, scopeResult.recordset[0].EstimateScopeOfWorkID);
    }

    for (const [index, line] of input.lines.entries()) {
      const scopeOfWorkId = line.scopeName !== null ? scopeIdByName.get(line.scopeName) ?? null : null;
      await transaction.request()
        .input("revisionId", sql.Int, revisionId)
        .input("lineNumber", sql.Int, index + 1)
        .input("description", sql.NVarChar(300), line.description)
        .input("quantity", sql.Decimal(19, 4), line.quantity)
        .input("unitName", sql.NVarChar(30), line.unitName)
        .input("unitCost", sql.Decimal(19, 4), line.unitCost)
        .input("freightAmount", sql.Decimal(19, 4), line.freightAmount)
        .input("lineMarkupPercent", sql.Decimal(9, 4), line.lineMarkupPercent)
        .input("materialId", sql.Int, line.materialId)
        .input("catalogUnitCostAtEntry", sql.Decimal(19, 4), line.catalogUnitCostAtEntry)
        .input("catalogPriceDate", sql.Date, line.catalogPriceDate ? new Date(`${line.catalogPriceDate}T00:00:00.000Z`) : null)
        .input("lineType", sql.VarChar(16), line.lineType)
        .input("estimateScopeOfWorkId", sql.Int, scopeOfWorkId)
        .query(`
          INSERT INTO dbo.EstimateLineItems (
            EstimateRevisionID, LineNumber, Description, Quantity, UnitName, UnitCost, FreightAmount, LineMarkupPercent,
            MaterialID, CatalogUnitCostAtEntry, CatalogPriceDate, LineType, EstimateScopeOfWorkID
          )
          VALUES (@revisionId, @lineNumber, @description, @quantity, @unitName, @unitCost, @freightAmount, @lineMarkupPercent,
            @materialId, @catalogUnitCostAtEntry, @catalogPriceDate, @lineType, @estimateScopeOfWorkId)
        `);
    }

    await transaction.commit();
    return estimateId;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export type EngagementType = "Project" | "Service";
export type RecurrenceFrequency = "Weekly" | "Biweekly" | "Monthly" | null;

export async function winEstimate(
  estimateId: number,
  engagementType: EngagementType,
  recurrenceFrequency: RecurrenceFrequency,
): Promise<number> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const estimateResult = await transaction.request()
      .input("estimateId", sql.Int, estimateId)
      .query<{ EstimateName: string; EstimateStatus: string; EstimateRevisionID: number | null }>(`
        SELECT e.EstimateName, e.EstimateStatus, r.EstimateRevisionID
        FROM dbo.Estimates e WITH (UPDLOCK, HOLDLOCK)
        OUTER APPLY (
          SELECT TOP (1) EstimateRevisionID
          FROM dbo.EstimateRevisions
          WHERE EstimateID = e.EstimateID
          ORDER BY RevisionNumber DESC
        ) r
        WHERE e.EstimateID = @estimateId
      `);
    const estimate = estimateResult.recordset[0];
    if (!estimate) throw new Error("not-found");
    if (estimate.EstimateStatus !== "Draft") throw new Error("not-draft");
    if (!estimate.EstimateRevisionID) throw new Error("no-revision");

    const projectResult = await transaction.request()
      .input("projectName", sql.NVarChar(150), estimate.EstimateName)
      .input("revisionId", sql.Int, estimate.EstimateRevisionID)
      .input("engagementType", sql.VarChar(16), engagementType)
      .input("recurrenceFrequency", sql.VarChar(16), recurrenceFrequency)
      .query<{ ProjectID: number }>(`
        INSERT INTO dbo.Projects (ProjectName, ProjectStatus, AcceptedEstimateRevisionID, EngagementType, RecurrenceFrequency)
        OUTPUT inserted.ProjectID
        VALUES (@projectName, 'Planning', @revisionId, @engagementType, @recurrenceFrequency)
      `);
    const projectId = projectResult.recordset[0].ProjectID;

    await transaction.request()
      .input("estimateId", sql.Int, estimateId)
      .query("UPDATE dbo.Estimates SET EstimateStatus = 'Won' WHERE EstimateID = @estimateId");

    await transaction.commit();
    return projectId;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function setEstimatePrintOptions(estimateId: number, options: EstimatePrintOptions): Promise<void> {
  const pool = await getPool();
  await pool.request()
    .input("estimateId", sql.Int, estimateId)
    .input("showQuantities", sql.Bit, options.showQuantities)
    .input("showLineTotals", sql.Bit, options.showLineTotals)
    .input("showSummaryTotal", sql.Bit, options.showSummaryTotal)
    .input("showScopesOfWork", sql.Bit, options.showScopesOfWork)
    .query(`
      UPDATE dbo.Estimates
      SET ShowQuantities = @showQuantities, ShowLineTotals = @showLineTotals, ShowSummaryTotal = @showSummaryTotal,
        ShowScopesOfWork = @showScopesOfWork
      WHERE EstimateID = @estimateId
    `);
}

export async function getProjectsWithEstimates(): Promise<ProjectWithEstimate[]> {
  const pool = await getPool();
  const result = await pool.request().query<ProjectWithEstimate & { lineNumber: number | null; description: string | null; quantity: number | null; unitName: string | null; unitCost: number | null; lineMarkupPercent: number | null }>(`
    SELECT
      p.ProjectID AS projectId,
      p.ProjectName AS projectName,
      p.ProjectStatus AS projectStatus,
      e.EstimateName AS estimateName,
      e.CustomerName AS customerName,
      r.RevisionNumber AS estimateRevisionNumber,
      r.QuotedTotal AS quotedTotal,
      li.LineNumber AS lineNumber,
      li.Description AS description,
      li.Quantity AS quantity,
      li.UnitName AS unitName,
      li.UnitCost AS unitCost,
      li.LineMarkupPercent AS lineMarkupPercent
    FROM dbo.Projects p
    LEFT JOIN dbo.EstimateRevisions r ON r.EstimateRevisionID = p.AcceptedEstimateRevisionID
    LEFT JOIN dbo.Estimates e ON e.EstimateID = r.EstimateID
    LEFT JOIN dbo.EstimateLineItems li ON li.EstimateRevisionID = r.EstimateRevisionID
    ORDER BY p.ProjectID DESC, li.LineNumber
  `);

  const projects = new Map<number, ProjectWithEstimate>();
  for (const row of result.recordset) {
    let project = projects.get(row.projectId);
    if (!project) {
      project = {
        projectId: row.projectId,
        projectName: row.projectName,
        projectStatus: row.projectStatus,
        estimateName: row.estimateName,
        customerName: row.customerName,
        estimateRevisionNumber: row.estimateRevisionNumber,
        quotedTotal: row.quotedTotal,
        lines: [],
      };
      projects.set(row.projectId, project);
    }
    if (row.lineNumber !== null && row.description !== null && row.quantity !== null && row.unitCost !== null) {
      project.lines.push({
        lineNumber: row.lineNumber,
        description: row.description,
        quantity: row.quantity,
        unitName: row.unitName,
        unitCost: row.unitCost,
        lineMarkupPercent: row.lineMarkupPercent ?? 0,
      });
    }
  }
  return Array.from(projects.values());
}
