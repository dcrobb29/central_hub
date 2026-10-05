import { getPool, sql } from "@/app/lib/db";
import { validateRecurringSchedule } from "@/app/lib/recurring-dates";
import { ensureRecurringVisits } from "@/app/lib/recurring-schedule";
import { getUnitsOfMeasurement } from "@/app/lib/units-of-measurement";
import { requireUnitAbbreviation } from "@/app/lib/unit-presets";
import {
  calculateEstimate,
  type EstimateMarkupMode,
  type EstimatePricingLine,
} from "@/app/lib/estimate-pricing";

export type LineType = "Material" | "Labor" | "Equipment";
export type EstimateGroupingMode = "None" | "Scope" | "Type";
export type EngagementType = "Project" | "Service";
export type RecurrenceFrequency = "Weekly" | "Biweekly" | "Monthly" | "Quarterly" | "SemiAnnually" | "Annually" | null;

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
  internalNotes: string | null;
  customerNotes: string | null;
  engagementType: EngagementType;
  recurrenceFrequency: RecurrenceFrequency;
  expectedStartDate: string | null;
  expectedEndDate: string | null;
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
  internalNotes: string | null;
  customerNotes: string | null;
  status: "Draft" | "Won" | "Lost";
  engagementType: EngagementType;
  recurrenceFrequency: RecurrenceFrequency;
  expectedStartDate: string | null;
  expectedEndDate: string | null;
  showQuantities: boolean;
  showLineTotals: boolean;
  showSummaryTotal: boolean;
  showScopesOfWork: boolean;
  createdAt: string;
  revisionId: number;
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
  estimateLineItemId: number;
  scopeName: string | null;
  freightAmount: number;
  lineNumber: number;
  description: string;
  lineType: LineType;
  quantity: number;
  unitName: string | null;
  unitCost: number;
  lineMarkupPercent: number;
};

export type ProjectWithEstimate = {
  projectId: number;
  projectName: string;
  projectStatus: string;
  internalNotes: string | null;
  customerNotes: string | null;
  engagementType: EngagementType;
  recurrenceFrequency: RecurrenceFrequency;
  expectedStartDate: string | null;
  expectedEndDate: string | null;
  estimateName: string | null;
  customerName: string | null;
  quotedTotal: number | null;
  taxPercent: number;
  lines: ProjectScopeLine[];
};

export async function getEstimates(): Promise<EstimateSummary[]> {
  const pool = await getPool();
  const result = await pool.request().query<EstimateSummary>(`
    SELECT
      e.EstimateID AS estimateId,
      e.EstimateName AS estimateName,
      e.CustomerName AS customerName,
      e.InternalNotes AS internalNotes,
      e.CustomerNotes AS customerNotes,
      e.EstimateStatus AS status,
      e.EngagementType AS engagementType,
      e.RecurrenceFrequency AS recurrenceFrequency,
      CONVERT(varchar(10), e.ExpectedStartDate, 23) AS expectedStartDate,
      CONVERT(varchar(10), e.ExpectedEndDate, 23) AS expectedEndDate,
      e.ShowQuantities AS showQuantities,
      e.ShowLineTotals AS showLineTotals,
      e.ShowSummaryTotal AS showSummaryTotal,
      e.ShowScopesOfWork AS showScopesOfWork,
      CONVERT(varchar(19), e.CreatedAt, 126) AS createdAt,
      r.EstimateRevisionID AS revisionId,
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
        e.InternalNotes AS internalNotes,
        e.CustomerNotes AS customerNotes,
        e.EstimateStatus AS status,
        e.EngagementType AS engagementType,
        e.RecurrenceFrequency AS recurrenceFrequency,
        CONVERT(varchar(10), e.ExpectedStartDate, 23) AS expectedStartDate,
        CONVERT(varchar(10), e.ExpectedEndDate, 23) AS expectedEndDate,
        e.ShowQuantities AS showQuantities,
        e.ShowLineTotals AS showLineTotals,
        e.ShowSummaryTotal AS showSummaryTotal,
        e.ShowScopesOfWork AS showScopesOfWork,
        CONVERT(varchar(19), e.CreatedAt, 126) AS createdAt,
        r.EstimateRevisionID AS revisionId,
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
  input = await canonicalizeEstimateUnits(input);
  const pricing = calculateEstimate(input);
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const estimateResult = await transaction.request()
      .input("estimateName", sql.NVarChar(150), input.estimateName)
      .input("customerName", sql.NVarChar(150), input.customerName)
      .input("internalNotes", sql.NVarChar(4000), input.internalNotes)
      .input("customerNotes", sql.NVarChar(4000), input.customerNotes)
      .input("engagementType", sql.VarChar(16), input.engagementType)
      .input("recurrenceFrequency", sql.VarChar(16), input.recurrenceFrequency)
      .input("expectedStartDate", sql.Date, input.expectedStartDate)
      .input("expectedEndDate", sql.Date, input.expectedEndDate)
      .query<{ EstimateID: number }>(`
        INSERT INTO dbo.Estimates (
          EstimateName, CustomerName, InternalNotes, CustomerNotes, EngagementType, RecurrenceFrequency, ExpectedStartDate, ExpectedEndDate
        )
        OUTPUT inserted.EstimateID
        VALUES (@estimateName, @customerName, @internalNotes, @customerNotes, @engagementType, @recurrenceFrequency, @expectedStartDate, @expectedEndDate)
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

    await insertScopesAndLines(transaction, revisionId, input);

    await transaction.commit();
    return estimateId;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function canonicalizeEstimateUnits(input: CreateEstimateInput): Promise<CreateEstimateInput> {
  const presets = await getUnitsOfMeasurement();
  return {
    ...input,
    lines: input.lines.map((line, index) => ({
      ...line,
      unitName: requireUnitAbbreviation(line.unitName, presets, index + 1),
    })),
  };
}

// Shared by createEstimate (fresh revision) and updateEstimate (replacing an existing revision's
// scopes/lines in place), so the insert logic for a revision's children only lives in one place.
async function insertScopesAndLines(transaction: sql.Transaction, revisionId: number, input: CreateEstimateInput) {
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
}

// Replaces a draft estimate's name/customer/recurrence details and its current revision's pricing
// rules, scopes, and line items in place (no new revision number — revisioning only matters once
// an estimate is won). EngagementType itself is intentionally never updated here — it's locked in
// at creation; switching between Project and Recurring requires deleting and recreating.
export async function updateEstimate(estimateId: number, input: CreateEstimateInput): Promise<void> {
  input = await canonicalizeEstimateUnits(input);
  const pricing = calculateEstimate(input);
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const estimateResult = await transaction.request()
      .input("estimateId", sql.Int, estimateId)
      .query<{ EstimateStatus: string; EstimateRevisionID: number | null }>(`
        SELECT e.EstimateStatus, r.EstimateRevisionID
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
    if (estimate.EstimateStatus === "Won") throw new Error("not-editable");
    if (!estimate.EstimateRevisionID) throw new Error("no-revision");
    const revisionId = estimate.EstimateRevisionID;

    await transaction.request()
      .input("estimateId", sql.Int, estimateId)
      .input("estimateName", sql.NVarChar(150), input.estimateName)
      .input("customerName", sql.NVarChar(150), input.customerName)
      .input("internalNotes", sql.NVarChar(4000), input.internalNotes)
      .input("customerNotes", sql.NVarChar(4000), input.customerNotes)
      .input("recurrenceFrequency", sql.VarChar(16), input.recurrenceFrequency)
      .input("expectedStartDate", sql.Date, input.expectedStartDate)
      .input("expectedEndDate", sql.Date, input.expectedEndDate)
      .query(`
        UPDATE dbo.Estimates
        SET EstimateName = @estimateName, CustomerName = @customerName,
          InternalNotes = @internalNotes, CustomerNotes = @customerNotes, RecurrenceFrequency = @recurrenceFrequency,
          ExpectedStartDate = @expectedStartDate, ExpectedEndDate = @expectedEndDate
        WHERE EstimateID = @estimateId
      `);

    await transaction.request()
      .input("revisionId", sql.Int, revisionId)
      .input("markupMode", sql.VarChar(16), input.markupMode)
      .input("groupingMode", sql.VarChar(16), input.groupingMode)
      .input("estimateMarkupPercent", sql.Decimal(9, 4), input.estimateMarkupPercent)
      .input("taxPercent", sql.Decimal(9, 4), input.taxPercent)
      .input("roundingIncrement", sql.Decimal(19, 2), input.roundingIncrement)
      .input("quotedTotal", sql.Decimal(19, 2), pricing.quotedTotal)
      .query(`
        UPDATE dbo.EstimateRevisions
        SET MarkupMode = @markupMode, GroupingMode = @groupingMode, EstimateMarkupPercent = @estimateMarkupPercent,
          TaxPercent = @taxPercent, RoundingIncrement = @roundingIncrement, QuotedTotal = @quotedTotal
        WHERE EstimateRevisionID = @revisionId
      `);

    // Replace the revision's line items and scopes wholesale rather than diffing them — simplest
    // and matches how the create form hands the whole set back on every save.
    await transaction.request()
      .input("revisionId", sql.Int, revisionId)
      .query("DELETE FROM dbo.EstimateLineItems WHERE EstimateRevisionID = @revisionId");
    await transaction.request()
      .input("revisionId", sql.Int, revisionId)
      .query("DELETE FROM dbo.EstimateScopesOfWork WHERE EstimateRevisionID = @revisionId");

    await insertScopesAndLines(transaction, revisionId, input);

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// Only draft (never-won) estimates can be deleted. Children are removed in FK order since none of
// the Estimate* tables cascade deletes.
export async function deleteEstimate(estimateId: number): Promise<void> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const estimateResult = await transaction.request()
      .input("estimateId", sql.Int, estimateId)
      .query<{ EstimateStatus: string }>(`
        SELECT EstimateStatus FROM dbo.Estimates WITH (UPDLOCK, HOLDLOCK) WHERE EstimateID = @estimateId
      `);
    const estimate = estimateResult.recordset[0];
    if (!estimate) throw new Error("not-found");
    if (estimate.EstimateStatus === "Won") throw new Error("not-editable");

    await transaction.request()
      .input("estimateId", sql.Int, estimateId)
      .query(`
        DELETE li FROM dbo.EstimateLineItems li
        JOIN dbo.EstimateRevisions r ON r.EstimateRevisionID = li.EstimateRevisionID
        WHERE r.EstimateID = @estimateId
      `);
    await transaction.request()
      .input("estimateId", sql.Int, estimateId)
      .query(`
        DELETE sw FROM dbo.EstimateScopesOfWork sw
        JOIN dbo.EstimateRevisions r ON r.EstimateRevisionID = sw.EstimateRevisionID
        WHERE r.EstimateID = @estimateId
      `);
    await transaction.request()
      .input("estimateId", sql.Int, estimateId)
      .query("DELETE FROM dbo.EstimateRevisions WHERE EstimateID = @estimateId");
    await transaction.request()
      .input("estimateId", sql.Int, estimateId)
      .query("DELETE FROM dbo.Estimates WHERE EstimateID = @estimateId");

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function winEstimate(estimateId: number): Promise<number> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const estimateResult = await transaction.request()
      .input("estimateId", sql.Int, estimateId)
      .query<{
        EstimateName: string;
        EstimateStatus: string;
        InternalNotes: string | null;
        CustomerNotes: string | null;
        EstimateRevisionID: number | null;
        EngagementType: EngagementType;
        RecurrenceFrequency: RecurrenceFrequency;
        ExpectedStartDate: Date | null;
        ExpectedEndDate: Date | null;
      }>(`
        SELECT e.EstimateName, e.EstimateStatus, e.InternalNotes, e.CustomerNotes, e.EngagementType, e.RecurrenceFrequency,
          e.ExpectedStartDate, e.ExpectedEndDate, r.EstimateRevisionID
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
    if (estimate.EngagementType === "Service") {
      try {
        validateRecurringSchedule(
          estimate.ExpectedStartDate?.toISOString().slice(0, 10),
          estimate.ExpectedEndDate?.toISOString().slice(0, 10),
          estimate.RecurrenceFrequency,
        );
      } catch {
        throw new Error("invalid-recurring-schedule");
      }
    }

    // Engagement type, recurrence, and expected dates are decided when the estimate is created
    // (not here) — simply carried over onto the new Project.
    const projectResult = await transaction.request()
      .input("projectName", sql.NVarChar(150), estimate.EstimateName)
      .input("internalNotes", sql.NVarChar(4000), estimate.InternalNotes)
      .input("customerNotes", sql.NVarChar(4000), estimate.CustomerNotes)
      .input("revisionId", sql.Int, estimate.EstimateRevisionID)
      .input("engagementType", sql.VarChar(16), estimate.EngagementType)
      .input("recurrenceFrequency", sql.VarChar(16), estimate.RecurrenceFrequency)
      .input("expectedStartDate", sql.Date, estimate.ExpectedStartDate)
      .input("expectedEndDate", sql.Date, estimate.ExpectedEndDate)
      .query<{ ProjectID: number }>(`
        INSERT INTO dbo.Projects (
          ProjectName, ProjectStatus, InternalNotes, CustomerNotes, AcceptedEstimateRevisionID, EngagementType, RecurrenceFrequency,
          ExpectedStartDate, ExpectedEndDate
        )
        OUTPUT inserted.ProjectID
        VALUES (@projectName, 'Planning', @internalNotes, @customerNotes, @revisionId, @engagementType, @recurrenceFrequency,
          @expectedStartDate, @expectedEndDate)
      `);
    const projectId = projectResult.recordset[0].ProjectID;
    if (estimate.EngagementType === "Service" && estimate.ExpectedStartDate && estimate.ExpectedEndDate && estimate.RecurrenceFrequency) {
      await ensureRecurringVisits(
        transaction, projectId,
        estimate.ExpectedStartDate.toISOString().slice(0, 10),
        estimate.ExpectedEndDate.toISOString().slice(0, 10),
        estimate.RecurrenceFrequency,
      );
    }

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
  const result = await pool.request().query<ProjectWithEstimate & { estimateLineItemId: number | null; scopeName: string | null; freightAmount: number | null; lineNumber: number | null; description: string | null; lineType: LineType | null; quantity: number | null; unitName: string | null; unitCost: number | null; lineMarkupPercent: number | null }>(`
    SELECT
      p.ProjectID AS projectId,
      p.ProjectName AS projectName,
      p.ProjectStatus AS projectStatus,
      p.InternalNotes AS internalNotes,
      p.CustomerNotes AS customerNotes,
      p.EngagementType AS engagementType,
      p.RecurrenceFrequency AS recurrenceFrequency,
      CONVERT(varchar(10), p.ExpectedStartDate, 23) AS expectedStartDate,
      CONVERT(varchar(10), p.ExpectedEndDate, 23) AS expectedEndDate,
      e.EstimateName AS estimateName,
      e.CustomerName AS customerName,
      r.QuotedTotal AS quotedTotal,
      COALESCE(r.TaxPercent, 0) AS taxPercent,
      li.EstimateLineItemID AS estimateLineItemId,
      s.ScopeName AS scopeName,
      li.FreightAmount AS freightAmount,
      li.LineNumber AS lineNumber,
      li.Description AS description,
      li.LineType AS lineType,
      li.Quantity AS quantity,
      li.UnitName AS unitName,
      li.UnitCost AS unitCost,
      li.LineMarkupPercent AS lineMarkupPercent
    FROM dbo.Projects p
    LEFT JOIN dbo.EstimateRevisions r ON r.EstimateRevisionID = p.AcceptedEstimateRevisionID
    LEFT JOIN dbo.Estimates e ON e.EstimateID = r.EstimateID
    LEFT JOIN dbo.EstimateLineItems li ON li.EstimateRevisionID = r.EstimateRevisionID
    LEFT JOIN dbo.EstimateScopesOfWork s ON s.EstimateScopeOfWorkID = li.EstimateScopeOfWorkID
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
        internalNotes: row.internalNotes,
        customerNotes: row.customerNotes,
        engagementType: row.engagementType,
        recurrenceFrequency: row.recurrenceFrequency,
        expectedStartDate: row.expectedStartDate,
        expectedEndDate: row.expectedEndDate,
        estimateName: row.estimateName,
        customerName: row.customerName,
        quotedTotal: row.quotedTotal,
        taxPercent: row.taxPercent,
        lines: [],
      };
      projects.set(row.projectId, project);
    }
    if (row.estimateLineItemId !== null && row.lineNumber !== null && row.description !== null && row.quantity !== null && row.unitCost !== null) {
      project.lines.push({
        estimateLineItemId: row.estimateLineItemId,
        scopeName: row.scopeName,
        freightAmount: row.freightAmount ?? 0,
        lineNumber: row.lineNumber,
        description: row.description,
        lineType: row.lineType ?? "Material",
        quantity: row.quantity,
        unitName: row.unitName,
        unitCost: row.unitCost,
        lineMarkupPercent: row.lineMarkupPercent ?? 0,
      });
    }
  }
  return Array.from(projects.values());
}
