import { getPool, sql } from "./db";
import { rollbackIfActive } from "./sql-transactions";
import { ProjectAccessError } from "./project-access-error";
import { billingCents } from "./project-billing-pricing";
import { ensureProjectBillingSnapshot } from "./project-billing";
import { insertScopesAndLines, type CreateEstimateInput, type EstimateLineInput } from "./estimates";
import { getUnitsOfMeasurement } from "./units-of-measurement";
import { requireUnitAbbreviation } from "./unit-presets";
import { allocateEstimateLineValues, calculateChange, type ChangeLineOperation } from "./contract-change-pricing";

export type ChangeContext = { estimateId?: number; projectId?: number };
export type ChangeInput = Omit<CreateEstimateInput,"lines"> & {
  lines: (EstimateLineInput & { operation: ChangeLineOperation; deductLineId: number | null })[];
};
export type ChangeDetails = Omit<ChangeInput, "lines"> & {
  lines: (ChangeInput["lines"][number] & { sellAmount: number })[];
};
export type InitialAlternateInput = Omit<ChangeInput, "lines"> & {
  lines: (Omit<ChangeInput["lines"][number], "deductLineId"> & { deductLineIndex: number | null })[];
};
export type ContractChange = {
  changeId: number; documentEstimateId: number; parentEstimateId: number; projectId: number | null;
  kind: "Alternate" | "ChangeOrder"; status: "Draft" | "Proposed" | "Approved" | "Rejected"; version: number;
  title: string; quotedTotal: number; approvedAt: string | null; approvalReference: string | null;
  sourceAlternateId: number | null;
  contractBefore:number|null;contractAfter:number|null;
};
export type ChangeSourceLine = EstimateLineInput & {
  lineId: number; revisionId: number; remainingQuantity: number; originalQuantity: number;
  sellAmount: number; landedAmount: number; deductedSell: number; deductedLanded: number;
  scopeId: number | null; taxPercent: number;
};
type Parent = { isSample?:boolean;estimateId: number; revisionId: number; organizationId: number; projectId: number | null;
  status: string; engagementType: string; projectStatus: string | null; title: string; quotedTotal: number };
function fail(message: string, status = 409): never { throw new ProjectAccessError(message, status); }

async function parentFor(request: sql.Request, context: ChangeContext, org: number): Promise<Parent> {
  const result = await request.input("estimate", sql.Int, context.estimateId ?? null)
    .input("project", sql.Int, context.projectId ?? null).input("org", sql.Int, org).query<Parent>(`
    SELECT e.EstimateID AS estimateId,r.EstimateRevisionID AS revisionId,e.OrganizationID AS organizationId,
      p.ProjectID AS projectId,e.EstimateStatus AS status,e.EngagementType AS engagementType,
      p.ProjectStatus AS projectStatus,e.EstimateName AS title,r.QuotedTotal AS quotedTotal,
      CONVERT(bit,CASE WHEN EXISTS(SELECT 1 FROM dbo.SampleDataRecords s WHERE s.OrganizationID=e.OrganizationID
        AND s.TableName='Estimates' AND s.RecordKey=CONVERT(nvarchar(100),e.EstimateID)) THEN 1 ELSE 0 END) AS isSample
    FROM dbo.Estimates e WITH(UPDLOCK,HOLDLOCK)
    CROSS APPLY(SELECT TOP(1) * FROM dbo.EstimateRevisions WHERE EstimateID=e.EstimateID ORDER BY RevisionNumber DESC) r
    LEFT JOIN dbo.Projects p ON p.AcceptedEstimateRevisionID=r.EstimateRevisionID
    WHERE e.OrganizationID=@org AND e.DocumentKind='Base'
      AND ((@project IS NOT NULL AND p.ProjectID=@project) OR (@project IS NULL AND e.EstimateID=@estimate))
  `);
  return result.recordset[0] ?? fail("Estimate or project not found.", 404);
}
async function lockParent(tx: sql.Transaction, context: ChangeContext, org: number) {
  const parent = await parentFor(tx.request(), context, org);
  if (parent.projectId) parent.projectStatus=(await tx.request().input("id", sql.Int, parent.projectId)
    .query<{status:string}>("SELECT ProjectStatus AS status FROM dbo.Projects WITH(UPDLOCK,HOLDLOCK) WHERE ProjectID=@id")).recordset[0].status;
  return parent;
}

async function sourceLines(request: sql.Request, parent: Parent): Promise<ChangeSourceLine[]> {
  const result = await request.input("parent", sql.Int, parent.estimateId).input("project", sql.Int, parent.projectId)
    .input("revision", sql.Int, parent.revisionId).query<ChangeSourceLine & {
      quotedTotal: number; markupMode: "perLine" | "estimate"; estimateMarkupPercent: number; roundingIncrement: number;
      sourceScope: number | null; storedSell: number | null; storedLanded: number | null;
    }>(`
    SELECT li.EstimateLineItemID AS lineId,li.EstimateRevisionID AS revisionId,li.Description AS description,
      li.Quantity AS originalQuantity,li.Quantity AS quantity,li.UnitName AS unitName,li.UnitCost AS unitCost,
      li.FreightAmount AS freightAmount,li.LineMarkupPercent AS lineMarkupPercent,li.LineType AS lineType,
      s.ScopeName AS scopeName,li.EstimateScopeOfWorkID AS sourceScope,
      li.MaterialID AS materialId,li.CatalogUnitCostAtEntry AS catalogUnitCostAtEntry,
      li.SellAmount AS storedSell,li.LandedAmount AS storedLanded,
      CONVERT(char(10),li.CatalogPriceDate,23) AS catalogPriceDate,
      r.TaxPercent AS taxPercent,r.MarkupMode AS markupMode,r.EstimateMarkupPercent AS estimateMarkupPercent,
      r.RoundingIncrement AS roundingIncrement,r.QuotedTotal AS quotedTotal,
      li.Quantity-COALESCE(d.quantity,0) AS remainingQuantity,
      COALESCE(d.sell,0) AS deductedSell,COALESCE(d.landed,0) AS deductedLanded,
      bs.BillingScopeID AS scopeId
    FROM dbo.EstimateLineItems li JOIN dbo.EstimateRevisions r ON r.EstimateRevisionID=li.EstimateRevisionID
    LEFT JOIN dbo.EstimateScopesOfWork s ON s.EstimateScopeOfWorkID=li.EstimateScopeOfWorkID
    LEFT JOIN dbo.ContractChanges c ON c.DocumentEstimateID=r.EstimateID
    LEFT JOIN dbo.ProjectBillingUnits bu ON bu.ProjectID=@project AND bu.ServiceVisitID IS NULL
    LEFT JOIN dbo.ProjectBillingScopes bs ON bs.BillingUnitID=bu.BillingUnitID
      AND (bs.SourceScopeID=li.EstimateScopeOfWorkID OR (bs.SourceScopeID IS NULL AND li.EstimateScopeOfWorkID IS NULL AND c.ChangeID IS NULL))
    OUTER APPLY(SELECT SUM(d.Quantity) AS quantity,SUM(d.SellAmount) AS sell,SUM(d.LandedAmount) AS landed
      FROM dbo.ContractChangeDeductions d JOIN dbo.ContractChanges h ON h.ChangeID=d.ChangeID
      WHERE d.EstimateLineItemID=li.EstimateLineItemID AND h.Status='Approved') d
    WHERE (li.EstimateRevisionID=@revision OR (c.ProjectID=@project AND c.Status='Approved' AND li.LineOperation='Add'))
    ORDER BY li.EstimateRevisionID,li.LineNumber
  `);
  const lines = result.recordset;
  for (const revisionId of new Set(lines.map((line) => line.revisionId))) {
    const revisionLines = lines.filter((line) => line.revisionId === revisionId);
    if (revisionId !== parent.revisionId) {
      for (const line of revisionLines) {
        line.sellAmount = line.storedSell ?? fail("Approved line pricing is missing.");
        line.landedAmount = line.storedLanded ?? fail("Approved line cost is missing.");
      }
      continue;
    }
    const values = allocateEstimateLineValues({ ...revisionLines[0], lines: revisionLines });
    revisionLines.forEach((line, index) => {
      line.sellAmount = values[index].sellAmount;
      line.landedAmount = values[index].landedAmount;
    });
  }
  return lines;
}

export async function getContractChanges(context: ChangeContext, organizationId: number) {
  const pool = await getPool();
  const parent = await parentFor(pool.request(), context, organizationId);
  const changes = (await pool.request().input("parent", sql.Int, parent.estimateId).input("org", sql.Int, organizationId)
    .query<ContractChange>(`
      SELECT c.ChangeID AS changeId,c.DocumentEstimateID AS documentEstimateId,c.ParentEstimateID AS parentEstimateId,
        c.ProjectID AS projectId,c.Kind AS kind,c.Status AS status,c.Version AS version,
        e.EstimateName AS title,r.QuotedTotal AS quotedTotal,CONVERT(char(10),c.ApprovedAt,23) AS approvedAt,
        c.ApprovalReference AS approvalReference,c.SourceAlternateID AS sourceAlternateId,
        c.ContractBeforeAmount AS contractBefore,c.ContractAfterAmount AS contractAfter
      FROM dbo.ContractChanges c JOIN dbo.Estimates e ON e.EstimateID=c.DocumentEstimateID
      JOIN dbo.EstimateRevisions r ON r.EstimateID=e.EstimateID
      WHERE c.ParentEstimateID=@parent AND c.OrganizationID=@org ORDER BY c.ChangeID
    `)).recordset;
  const approvedAlternates = changes.filter((c) => c.kind === "Alternate" && c.status === "Approved").reduce((s, c) => s + c.quotedTotal, 0);
  const approvedChanges = changes.filter((c) => c.kind === "ChangeOrder" && c.status === "Approved").reduce((s, c) => s + c.quotedTotal, 0);
  return { parent, changes, sourceLines: await sourceLines(pool.request(), parent),
    baseValue: parent.quotedTotal, initialContract: parent.quotedTotal + approvedAlternates,
    currentContract: parent.quotedTotal + approvedAlternates + approvedChanges };
}

export async function getChangeInput(changeId: number, org: number): Promise<ChangeDetails> {
  const pool = await getPool();
  const result = await pool.request().input("id", sql.Int, changeId).input("org", sql.Int, org)
    .query<CreateEstimateInput & { revisionId: number }>(`
      SELECT e.EstimateName AS estimateName,e.CustomerName AS customerName,e.InternalNotes AS internalNotes,
        e.CustomerNotes AS customerNotes,r.MarkupMode AS markupMode,r.EstimateMarkupPercent AS estimateMarkupPercent,
        r.TaxPercent AS taxPercent,r.RoundingIncrement AS roundingIncrement,r.GroupingMode AS groupingMode,
        r.EstimateRevisionID AS revisionId
      FROM dbo.ContractChanges c JOIN dbo.Estimates e ON e.EstimateID=c.DocumentEstimateID
      JOIN dbo.EstimateRevisions r ON r.EstimateID=e.EstimateID WHERE c.ChangeID=@id AND c.OrganizationID=@org
    `);
  const row = result.recordset[0] ?? fail("Change document not found.", 404);
  const lines = (await pool.request().input("id", sql.Int, row.revisionId).query<ChangeDetails["lines"][number]>(`
    SELECT li.Description AS description,li.Quantity AS quantity,li.UnitName AS unitName,li.UnitCost AS unitCost,
      li.FreightAmount AS freightAmount,li.LineMarkupPercent AS lineMarkupPercent,li.LineType AS lineType,
      li.MaterialID AS materialId,li.CatalogUnitCostAtEntry AS catalogUnitCostAtEntry,
      CONVERT(char(10),li.CatalogPriceDate,23) AS catalogPriceDate,s.ScopeName AS scopeName,
      li.LineOperation AS operation,li.DeductLineID AS deductLineId,li.SellAmount AS sellAmount
    FROM dbo.EstimateLineItems li LEFT JOIN dbo.EstimateScopesOfWork s ON s.EstimateScopeOfWorkID=li.EstimateScopeOfWorkID
    WHERE li.EstimateRevisionID=@id ORDER BY li.LineNumber
  `)).recordset;
  return { ...row, lines, scopes: [...new Set(lines.flatMap((l) => l.scopeName ? [l.scopeName] : []))],
    engagementType: "Project", recurrenceFrequency: null, expectedStartDate: null, expectedEndDate: null };
}

async function normalize(input: ChangeInput, sources: ChangeSourceLine[]) {
  const presets = await getUnitsOfMeasurement();
  const used = new Set<number>();
  return { ...input, roundingIncrement: 0, lines: input.lines.map((line, index) => {
    if (line.operation === "Add") return { ...line, deductLineId: null, unitName: requireUnitAbbreviation(line.unitName, presets, index + 1) };
    const source = sources.find((s) => s.lineId === line.deductLineId);
    if (!source || used.has(source.lineId)) fail("Each deduction must reference a distinct existing line.", 400);
    used.add(source.lineId);
    if (line.quantity > source.remainingQuantity) fail(`Deduction exceeds remaining quantity for ${source.description}.`);
    // Deduction pricing comes from the existing contract, never a caller's price.
    return { ...line, unitName: source.unitName, unitCost: source.unitCost,
      lineMarkupPercent: source.lineMarkupPercent, freightAmount: source.freightAmount * line.quantity / source.originalQuantity,
      lineType: source.lineType, materialId: source.materialId };
  }) };
}

async function writeDocument(tx: sql.Transaction, org: number, kind: string, input: ChangeInput, existingId?: number) {
  const totals = calculateChange(input);
  const estimateId = existingId ?? (await tx.request().input("org", sql.Int, org).input("kind", sql.VarChar(16), kind)
    .input("name", sql.NVarChar(150), input.estimateName).query<{ id: number }>(`
      INSERT dbo.Estimates(OrganizationID,DocumentKind,EstimateName,EngagementType) VALUES(@org,@kind,@name,'Project');
      SELECT CONVERT(int,SCOPE_IDENTITY()) AS id;
    `)).recordset[0].id;
  await tx.request().input("id", sql.Int, estimateId).input("name", sql.NVarChar(150), input.estimateName)
    .input("internal", sql.NVarChar(4000), input.internalNotes).input("customer", sql.NVarChar(4000), input.customerNotes)
    .query("UPDATE dbo.Estimates SET EstimateName=@name,InternalNotes=@internal,CustomerNotes=@customer WHERE EstimateID=@id");
  const revision = await tx.request().input("id", sql.Int, estimateId).query<{ id: number }>(
    "SELECT EstimateRevisionID AS id FROM dbo.EstimateRevisions WHERE EstimateID=@id");
  const revisionId = revision.recordset[0]?.id ?? (await tx.request().input("id", sql.Int, estimateId).input("org", sql.Int, org)
    .query<{ id: number }>(`INSERT dbo.EstimateRevisions(EstimateID,OrganizationID,RevisionNumber,MarkupMode,GroupingMode,QuotedTotal)
      VALUES(@id,@org,1,'perLine','None',0); SELECT CONVERT(int,SCOPE_IDENTITY()) AS id;`)).recordset[0].id;
  await tx.request().input("id", sql.Int, revisionId).query(
    "DELETE dbo.EstimateLineItems WHERE EstimateRevisionID=@id; DELETE dbo.EstimateScopesOfWork WHERE EstimateRevisionID=@id;");
  await tx.request().input("id", sql.Int, revisionId).input("mode", sql.VarChar(16), input.markupMode)
    .input("markup", sql.Decimal(9,4), input.estimateMarkupPercent).input("tax", sql.Decimal(9,4), input.taxPercent)
    .input("total", sql.Decimal(19,2), totals.quotedTotal).input("group", sql.VarChar(16), input.groupingMode)
    .query("UPDATE dbo.EstimateRevisions SET MarkupMode=@mode,EstimateMarkupPercent=@markup,TaxPercent=@tax,QuotedTotal=@total,GroupingMode=@group WHERE EstimateRevisionID=@id");
  await insertScopesAndLines(tx, revisionId, input);
  for (const [index, line] of input.lines.entries()) await tx.request().input("id", sql.Int, revisionId)
    .input("number", sql.Int, index + 1).input("operation", sql.VarChar(8), line.operation)
    .input("target", sql.Int, line.deductLineId).input("sell", sql.Decimal(19,2), totals.lines[index].sellAmount)
    .input("landed", sql.Decimal(19,2), totals.lines[index].landedCost)
    .query("UPDATE dbo.EstimateLineItems SET LineOperation=@operation,DeductLineID=@target,SellAmount=@sell,LandedAmount=@landed WHERE EstimateRevisionID=@id AND LineNumber=@number");
  return { estimateId, revisionId };
}

export async function saveContractChange(context: ChangeContext, org: number, input: ChangeInput,
  changeId?: number, version?: number, sourceAlternateId?: number) {
  const pool = await getPool(); const tx = new sql.Transaction(pool); await tx.begin();
  try {
    const id = await saveContractChangeInTransaction(tx, context, org, input, changeId, version, sourceAlternateId);
    await tx.commit();
    return id;
  } catch (error) { await rollbackIfActive(tx); throw error; }
}

export async function saveContractChangeInTransaction(tx: sql.Transaction, context: ChangeContext, org: number, input: ChangeInput,
  changeId?: number, version?: number, sourceAlternateId?: number) {
    const parent = await lockParent(tx, context, org);
    if (parent.engagementType !== "Project") fail("Alternates and change orders are not enabled for recurring agreements.");
    if (parent.projectStatus === "Complete") fail("Reopen this project before changing its contract.");
    if (!context.projectId && parent.status !== "Draft") fail("Alternates can only be drafted before the bid is accepted.");
    const kind = context.projectId ? "ChangeOrder" : "Alternate";
    let existing: ContractChange | undefined;
    if (changeId) {
      existing = (await tx.request().input("id", sql.Int, changeId).input("parent", sql.Int, parent.estimateId).input("org", sql.Int, org)
        .query<ContractChange>(`SELECT DocumentEstimateID AS documentEstimateId,Status AS status,Version AS version,Kind AS kind
          FROM dbo.ContractChanges WITH(UPDLOCK,HOLDLOCK) WHERE ChangeID=@id AND ParentEstimateID=@parent AND OrganizationID=@org`)).recordset[0];
      if (!existing) fail("Change not found.", 404);
      if (existing.status === "Approved" || existing.version !== version || existing.kind !== kind) fail("This document changed or is locked. Reload before editing.");
    }
    if (sourceAlternateId) {
      const source = (await tx.request().input("id", sql.Int, sourceAlternateId).input("parent", sql.Int, parent.estimateId)
        .query(`SELECT ChangeID FROM dbo.ContractChanges WHERE ChangeID=@id AND ParentEstimateID=@parent AND Kind='Alternate' AND Status<>'Approved'
          AND NOT EXISTS(SELECT 1 FROM dbo.ContractChanges WHERE SourceAlternateID=@id)`)).recordset[0];
      if (!context.projectId || !source) fail("This alternate has already been accepted or converted.");
    }
    const sources = await sourceLines(tx.request(), parent);
    input = await normalize(input, sources);
    const document = await writeDocument(tx, org, kind, input, existing?.documentEstimateId);
    // Freeze deductible prices to their original allocated contract sell value.
    for (const [index, line] of input.lines.entries()) if (line.operation === "Deduct") {
      const source = sources.find((s) => s.lineId === line.deductLineId)!;
      const full = line.quantity === source.remainingQuantity;
      const sell = full ? source.sellAmount - source.deductedSell : source.sellAmount * line.quantity / source.originalQuantity;
      const landed = full ? source.landedAmount - source.deductedLanded : source.landedAmount * line.quantity / source.originalQuantity;
      await tx.request().input("id", sql.Int, document.revisionId).input("number", sql.Int, index + 1)
        .input("sell", sql.Decimal(19,2), sell).input("landed", sql.Decimal(19,2), landed)
        .query("UPDATE dbo.EstimateLineItems SET SellAmount=@sell,LandedAmount=@landed WHERE EstimateRevisionID=@id AND LineNumber=@number");
    }
    await tx.request().input("id", sql.Int, document.revisionId).query(`UPDATE dbo.EstimateRevisions SET QuotedTotal=
      (SELECT SUM(CASE LineOperation WHEN 'Add' THEN SellAmount ELSE -SellAmount END) FROM dbo.EstimateLineItems WHERE EstimateRevisionID=@id)
      WHERE EstimateRevisionID=@id`);
    const id = changeId ?? (await tx.request().input("org", sql.Int, org).input("document", sql.Int, document.estimateId)
      .input("parent", sql.Int, parent.estimateId).input("project", sql.Int, context.projectId ?? null)
      .input("kind", sql.VarChar(16), kind).input("source", sql.Int, sourceAlternateId ?? null)
      .query<{ id: number }>(`INSERT dbo.ContractChanges(OrganizationID,DocumentEstimateID,ParentEstimateID,ProjectID,Kind,SourceAlternateID)
        VALUES(@org,@document,@parent,@project,@kind,@source); SELECT CONVERT(int,SCOPE_IDENTITY()) AS id;`)).recordset[0].id;
    if (existing) await tx.request().input("id", sql.Int, id).query("UPDATE dbo.ContractChanges SET Status='Draft',Version=Version+1 WHERE ChangeID=@id");
    return id;
}

export async function approveChangeInTransaction(tx: sql.Transaction, parent: Parent, changeId: number, version: number,
  userId: number, approvedAt: string, reference: string, initial = false) {
  const row = (await tx.request().input("id", sql.Int, changeId).input("parent", sql.Int, parent.estimateId)
    .input("org", sql.Int, parent.organizationId).query<ContractChange>(`
    SELECT DocumentEstimateID AS documentEstimateId,Status AS status,Kind AS kind,Version AS version
    FROM dbo.ContractChanges WITH(UPDLOCK,HOLDLOCK) WHERE ChangeID=@id AND ParentEstimateID=@parent AND OrganizationID=@org
  `)).recordset[0];
  if (!row || row.status !== "Proposed" || row.version !== version || row.kind !== (initial ? "Alternate" : "ChangeOrder"))
    fail("Only an unchanged proposed document can be approved.");
  if (!parent.projectId || parent.engagementType !== "Project" || parent.projectStatus === "Complete")
    fail("An open one-time project is required.");
  await ensureProjectBillingSnapshot(tx, parent.projectId);
  const sources = await sourceLines(tx.request(), parent);
  const lines = (await tx.request().input("id", sql.Int, row.documentEstimateId).query<{
    id: number; operation: ChangeLineOperation; target: number | null; quantity: number; sell: number; landed: number;
    scope: number | null; scopeName: string | null;
  }>(`SELECT li.EstimateLineItemID AS id,li.LineOperation AS operation,li.DeductLineID AS target,
    li.Quantity AS quantity,li.SellAmount AS sell,li.LandedAmount AS landed,li.EstimateScopeOfWorkID AS scope,s.ScopeName AS scopeName
    FROM dbo.EstimateLineItems li JOIN dbo.EstimateRevisions r ON r.EstimateRevisionID=li.EstimateRevisionID
    LEFT JOIN dbo.EstimateScopesOfWork s ON s.EstimateScopeOfWorkID=li.EstimateScopeOfWorkID WHERE r.EstimateID=@id`)).recordset;
  for(const line of lines.filter(l=>l.operation==="Deduct")){
    const source=sources.find(s=>s.lineId===line.target);
    if(!source||line.quantity>source.remainingQuantity)fail("Existing work changed; revise and propose this deduction again.");
    const expected=line.quantity===source.remainingQuantity?source.sellAmount-source.deductedSell:source.sellAmount*line.quantity/source.originalQuantity;
    if(billingCents(expected)!==billingCents(line.sell))fail("The deduction price changed; revise and propose the document again.");
  }
  const unit = (await tx.request().input("id", sql.Int, parent.projectId).query<{ id: number; value: number; billed: number }>(`
    SELECT u.BillingUnitID AS id,u.ContractValue AS value,COALESCE((SELECT SUM(a.Amount) FROM dbo.ProjectInvoiceAllocations a
      JOIN dbo.ProjectBillingScopes s ON s.BillingScopeID=a.BillingScopeID WHERE s.BillingUnitID=u.BillingUnitID),0) AS billed
    FROM dbo.EffectiveProjectBillingUnits u WHERE u.ProjectID=@id AND u.ServiceVisitID IS NULL`)).recordset[0];
  const net = Math.round(lines.reduce((sum, l) => sum + (l.operation === "Add" ? l.sell : -l.sell), 0) * 100) / 100;
  const legacy = (await tx.request().input("id", sql.Int, parent.projectId).query<{ count: number }>(`
    SELECT COUNT(*) AS count FROM dbo.Invoices i WHERE ProjectID=@id AND NOT EXISTS(SELECT 1 FROM dbo.ProjectIssuedInvoices h WHERE h.InvoiceID=i.id)`)).recordset[0].count;
  if (lines.some((l) => l.operation === "Deduct") && legacy) fail("Reconcile legacy invoices through project billing before approving deductions.");
  if (billingCents(unit.value + net) < billingCents(unit.billed) || unit.value + net < 0) fail("The deduction would reduce the contract below amounts already invoiced.");
  const netCost=lines.reduce((sum,l)=>sum+(l.operation==="Add"?l.landed:-l.landed),0);
  if(netCost<0) {
    const recorded=(await tx.request().input("project",sql.Int,parent.projectId).query<{budget:number;actual:number;invalid:number}>(`
      SELECT (SELECT COALESCE(SUM(LandedCostAmount),0) FROM dbo.EffectiveProjectEstimateLines WHERE ProjectID=@project) AS budget,
        COALESCE(SUM(CASE WHEN b.IsSplit=1 THEN COALESCE(a.amount,0) ELSE
          TRY_CONVERT(decimal(19,2),REPLACE(REPLACE(RTRIM(b.[Bill Amount]),'$',''),',','')) END),0) AS actual,
        COALESCE(SUM(CASE WHEN b.IsSplit=0 AND TRY_CONVERT(decimal(19,2),REPLACE(REPLACE(RTRIM(b.[Bill Amount]),'$',''),',','')) IS NULL THEN 1 ELSE 0 END),0) AS invalid
      FROM dbo.Bills b OUTER APPLY(SELECT SUM(Amount) AS amount FROM dbo.ProjectBillCosts WHERE BillID=b.id AND ProjectID=@project AND IsActive=1) a
      WHERE b.ProjectID=@project OR (b.IsSplit=1 AND a.amount IS NOT NULL)
    `)).recordset[0];
    if(recorded.invalid||billingCents(recorded.budget+netCost)<billingCents(recorded.actual))
      fail("Reconcile supplier bills before reducing the project budget below recorded costs.");
  }
  for (const line of lines.filter((l) => l.operation === "Deduct")) {
    const source = sources.find((s) => s.lineId === line.target);
    if (!source?.scopeId || line.quantity > source.remainingQuantity) fail("Existing work changed; revise and propose this deduction again.");
    const remainingCost = source.landedAmount - source.deductedLanded - line.landed;
    if (remainingCost < -0.005 || source.sellAmount - source.deductedSell - line.sell < -0.005)
      fail("This deduction exceeds the remaining line budget.");
    const actual = (await tx.request().input("project", sql.Int, parent.projectId).input("line", sql.Int, source.lineId)
      .input("unit", sql.NVarChar(30), source.unitName)
      .query<{ amount: number; quantity: number }>(`SELECT COALESCE(SUM(Amount),0) AS amount,
        COALESCE(SUM(CASE WHEN UPPER(RTRIM(UnitName))=UPPER(@unit) THEN Quantity ELSE 0 END),0) AS quantity
        FROM dbo.ProjectBillCosts WHERE ProjectID=@project AND EstimateLineItemID=@line AND IsActive=1`)).recordset[0];
    if (billingCents(actual.amount) > billingCents(remainingCost) || actual.quantity > source.remainingQuantity - line.quantity)
      fail(`Reconcile recorded costs/quantities for "${source.description}" before approving this deduction.`);
    await tx.request().input("change", sql.Int, changeId).input("line", sql.Int, source.lineId)
      .input("scope", sql.Int, source.scopeId).input("quantity", sql.Decimal(19,4), line.quantity)
      .input("sell", sql.Decimal(19,2), line.sell).input("landed", sql.Decimal(19,2), line.landed)
      .query("INSERT dbo.ContractChangeDeductions(ChangeID,EstimateLineItemID,BillingScopeID,Quantity,SellAmount,LandedAmount) VALUES(@change,@line,@scope,@quantity,@sell,@landed)");
  }
  const addedGroups = [...new Set(lines.filter((l) => l.operation === "Add").map((l) => l.scope))];
  for (const scope of addedGroups) {
    const additions = lines.filter((l) => l.operation === "Add" && l.scope === scope);
    // Every addition has a source scope, including ungrouped work, for later deductions.
    if (scope === null) fail("Assign additions to a scope before proposing the document.", 400);
    await tx.request().input("unit", sql.Int, unit.id).input("scope", sql.Int, scope)
      .input("name", sql.NVarChar(150), `${row.kind === "Alternate" ? "ALT" : "CO"}-${changeId}: ${additions[0].scopeName}`.slice(0,150))
      .input("value", sql.Decimal(19,2), additions.reduce((sum, l) => sum + l.sell, 0))
      .input("org", sql.Int, parent.organizationId)
      .query(`INSERT dbo.ProjectBillingScopes(BillingUnitID,SourceScopeID,ScopeName,SortOrder,ContractValue,CompletionStatus,OrganizationID)
        SELECT @unit,@scope,@name,COALESCE(MAX(SortOrder),-1)+1,@value,'Upcoming',@org FROM dbo.ProjectBillingScopes WHERE BillingUnitID=@unit`);
  }
  await tx.request().input("id", sql.Int, row.documentEstimateId).query("UPDATE dbo.Estimates SET EstimateStatus='Won' WHERE EstimateID=@id");
  await tx.request().input("id", sql.Int, changeId).input("project", sql.Int, parent.projectId)
    .input("date", sql.Date, approvedAt).input("ref", sql.NVarChar(500), reference).input("user", sql.Int, userId)
    .input("before",sql.Decimal(19,2),unit.value).input("after",sql.Decimal(19,2),unit.value+net)
    .query("UPDATE dbo.ContractChanges SET Status='Approved',ProjectID=@project,ApprovedAt=@date,ApprovalReference=@ref,ApprovedByUserID=@user,ContractBeforeAmount=@before,ContractAfterAmount=@after,Version=Version+1 WHERE ChangeID=@id");
  const balances = (await tx.request().input("unit", sql.Int, unit.id).query<{ count: number }>(`
    SELECT COUNT(*) AS count FROM dbo.EffectiveProjectBillingScopes s WHERE s.BillingUnitID=@unit AND
      (s.ContractValue<0 OR s.ContractValue<COALESCE((SELECT SUM(a.Amount) FROM dbo.ProjectInvoiceAllocations a WHERE a.BillingScopeID=s.BillingScopeID),0))`)).recordset[0].count;
  if (balances) fail("Reconcile invoiced scope amounts before approving this deduction.");
}

export async function transitionContractChange(context: ChangeContext, org: number, id: number, version: number,
  action: "propose" | "reject" | "approve" | "remove", userId: number, approvedAt = "", reference = "") {
  const pool = await getPool(); const tx = new sql.Transaction(pool); await tx.begin();
  try {
    const parent = await lockParent(tx, context, org);
    if (parent.engagementType !== "Project" || parent.projectStatus === "Complete") fail("An open one-time job is required.");
    if(!context.projectId&&parent.status!=="Draft")fail("This bid is already accepted. Use a linked change order.");
    if (action === "approve") {
      await approveChangeInTransaction(tx, parent, id, version, userId, approvedAt, reference);
    } else if(action==="remove") {
      const row=(await tx.request().input("id",sql.Int,id).input("org",sql.Int,org).input("parent",sql.Int,parent.estimateId)
        .input("version",sql.Int,version).input("kind",sql.VarChar(16),context.projectId?"ChangeOrder":"Alternate")
        .query<{document:number}>(`SELECT DocumentEstimateID AS document FROM dbo.ContractChanges WITH(UPDLOCK,HOLDLOCK)
        WHERE ChangeID=@id AND OrganizationID=@org AND ParentEstimateID=@parent AND Version=@version AND Kind=@kind AND Status<>'Approved'
        AND NOT EXISTS(SELECT 1 FROM dbo.ContractChanges WHERE SourceAlternateID=@id)`)).recordset[0];
      if(!row)fail("Approved, converted, or changed documents cannot be removed.");
      await tx.request().input("id",sql.Int,id).input("doc",sql.Int,row.document).query(`
        DELETE dbo.ContractChanges WHERE ChangeID=@id;
        DELETE li FROM dbo.EstimateLineItems li JOIN dbo.EstimateRevisions r ON r.EstimateRevisionID=li.EstimateRevisionID WHERE r.EstimateID=@doc;
        DELETE s FROM dbo.EstimateScopesOfWork s JOIN dbo.EstimateRevisions r ON r.EstimateRevisionID=s.EstimateRevisionID WHERE r.EstimateID=@doc;
        DELETE dbo.EstimateRevisions WHERE EstimateID=@doc;
        DELETE dbo.Estimates WHERE EstimateID=@doc;`);
    } else {
      if(action==="propose") {
        const sources=await sourceLines(tx.request(),parent);
        const deductions=(await tx.request().input("id",sql.Int,id).input("org",sql.Int,org).query<{target:number;quantity:number;sell:number}>(`
          SELECT li.DeductLineID AS target,li.Quantity AS quantity,li.SellAmount AS sell
          FROM dbo.ContractChanges c JOIN dbo.EstimateRevisions r ON r.EstimateID=c.DocumentEstimateID
          JOIN dbo.EstimateLineItems li ON li.EstimateRevisionID=r.EstimateRevisionID
          WHERE c.ChangeID=@id AND c.OrganizationID=@org AND li.LineOperation='Deduct'`)).recordset;
        for(const line of deductions) {
          const source=sources.find(s=>s.lineId===line.target);
          if(!source||line.quantity>source.remainingQuantity)fail("Revise this deduction to reference current work and available quantities before proposing.");
          const expected=line.quantity===source.remainingQuantity?source.sellAmount-source.deductedSell:source.sellAmount*line.quantity/source.originalQuantity;
          if(billingCents(expected)!==billingCents(line.sell))fail("Revise the deduction's price before proposing this document.");
        }
      }
      const result = await tx.request().input("id", sql.Int, id).input("parent", sql.Int, parent.estimateId)
        .input("org", sql.Int, org).input("version", sql.Int, version)
        .input("status", sql.VarChar(16), action === "propose" ? "Proposed" : "Rejected")
        .input("kind",sql.VarChar(16),context.projectId?"ChangeOrder":"Alternate")
        .query(`UPDATE dbo.ContractChanges SET Status=@status,Version=Version+1
          WHERE ChangeID=@id AND ParentEstimateID=@parent AND OrganizationID=@org AND Version=@version
          AND Kind=@kind AND Status IN ('Draft','Proposed','Rejected')`);
      if (!result.rowsAffected[0]) fail("This document changed or is locked. Reload before updating.");
    }
    await tx.commit();
  } catch (error) { await rollbackIfActive(tx); throw error; }
}
