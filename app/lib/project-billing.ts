import { getPool, sql } from "@/app/lib/db";
import { rollbackIfActive } from "@/app/lib/sql-transactions";
import { calculateEstimate, type EstimatePricingLine, type EstimateMarkupMode } from "@/app/lib/estimate-pricing";
import { ensureRecurringVisits } from "@/app/lib/recurring-schedule";
import type { RecurringFrequency } from "@/app/lib/recurring-dates";
import type { ProjectStatus } from "@/app/lib/project-status";
import { parseNotes } from "@/app/lib/document-notes";
import {
  allocateCents, billingCents, BillingError, calculateBillingAllocations,
  type BillingMethod, type BillingSelection, type BillingUnit, type ScopeStatus,
} from "@/app/lib/project-billing-pricing";

type BillingProject = {
  projectId: number; projectName: string; customerId: number | null; projectStatus: ProjectStatus;
  engagementType: "Project" | "Service"; revisionId: number | null; startDate: string | null;
  endDate: string | null; frequency: RecurringFrequency | null;
};
export type BillingInvoice = {
  invoiceId: number; invoiceNo: string; invoiceDate: string; dueDate: string; amount: number | null;
  managed: boolean; showScopes: boolean; allocations: { scopeId: number; unitId: number; scopeName: string; visitDate: string | null; amount: number; completionStatusAtIssue: ScopeStatus | null }[];
  internalNotes: string | null; customerNotes: string | null; includesIncompleteWork: boolean; overrideReason: string | null;
};
export type ProjectBilling = {
  project: BillingProject; method: BillingMethod | null; units: BillingUnit[]; invoices: BillingInvoice[];
};

async function lockProject(transaction: sql.Transaction, projectId: number): Promise<BillingProject> {
  const result = await transaction.request().input("projectId", sql.Int, projectId).query<BillingProject>(`
    SELECT ProjectID AS projectId, ProjectName AS projectName, CustomerID AS customerId, ProjectStatus AS projectStatus,
      EngagementType AS engagementType, AcceptedEstimateRevisionID AS revisionId,
      CONVERT(char(10),ExpectedStartDate,23) AS startDate, CONVERT(char(10),ExpectedEndDate,23) AS endDate,
      RecurrenceFrequency AS frequency
    FROM dbo.Projects WITH (UPDLOCK,HOLDLOCK) WHERE ProjectID=@projectId
  `);
  if (!result.recordset[0]) throw new BillingError("Project not found");
  if (!result.recordset[0].revisionId) throw new BillingError("This project needs an accepted estimate before scope billing can be set up.");
  return result.recordset[0];
}

export async function ensureProjectBillingSnapshot(transaction: sql.Transaction, projectId: number): Promise<void> {
  const project = await lockProject(transaction, projectId);
  const existing = await transaction.request().input("projectId", sql.Int, projectId)
    .query<{ unitId: number }>("SELECT BillingUnitID AS unitId FROM dbo.ProjectBillingUnits WHERE ProjectID=@projectId AND ServiceVisitID IS NULL");
  if (!existing.recordset.length) {
    const revision = await transaction.request().input("revisionId", sql.Int, project.revisionId).query<{
      quotedTotal: number; markupMode: EstimateMarkupMode; estimateMarkupPercent: number; taxPercent: number; roundingIncrement: number;
    }>(`SELECT QuotedTotal AS quotedTotal, MarkupMode AS markupMode, EstimateMarkupPercent AS estimateMarkupPercent,
      TaxPercent AS taxPercent, RoundingIncrement AS roundingIncrement FROM dbo.EstimateRevisions WHERE EstimateRevisionID=@revisionId`);
    const pricing = revision.recordset[0];
    if (!pricing) throw new BillingError("Accepted estimate revision not found");
    const scopes = await transaction.request().input("revisionId", sql.Int, project.revisionId)
      .query<{ sourceScopeId: number; scopeName: string }>("SELECT EstimateScopeOfWorkID AS sourceScopeId, ScopeName AS scopeName FROM dbo.EstimateScopesOfWork WHERE EstimateRevisionID=@revisionId ORDER BY SortOrder,EstimateScopeOfWorkID");
    const lines = await transaction.request().input("revisionId", sql.Int, project.revisionId)
      .query<EstimatePricingLine & { sourceScopeId: number | null }>(`
        SELECT EstimateScopeOfWorkID AS sourceScopeId, Quantity AS quantity, UnitCost AS unitCost,
          FreightAmount AS freightAmount, LineMarkupPercent AS lineMarkupPercent
        FROM dbo.EstimateLineItems WHERE EstimateRevisionID=@revisionId ORDER BY LineNumber
      `);
    const definitions: { sourceScopeId: number | null; scopeName: string }[] = [...scopes.recordset];
    if (lines.recordset.some((line) => line.sourceScopeId === null) || !definitions.length) {
      definitions.push({ sourceScopeId: null, scopeName: "Ungrouped work" });
    }
    const calculated = calculateEstimate({ ...pricing, lines: lines.recordset });
    const weights = definitions.map((scope) => lines.recordset.reduce((sum, line, index) =>
      sum + (line.sourceScopeId === scope.sourceScopeId ? billingCents(calculated.lines[index].sellAmount) : 0), 0));
    if (!lines.recordset.length && definitions.length === 1) weights[0] = billingCents(pricing.quotedTotal);
    const values = allocateCents(billingCents(pricing.quotedTotal), weights);
    const status = project.engagementType === "Project" && project.projectStatus === "Complete" ? "Complete" : "Upcoming";
    const inserted = await transaction.request().input("projectId", sql.Int, projectId).input("revisionId", sql.Int, project.revisionId)
      .input("value", sql.Decimal(19, 2), pricing.quotedTotal).input("status", sql.VarChar(16), status)
      .query<{ unitId: number }>(`INSERT INTO dbo.ProjectBillingUnits(ProjectID,SourceRevisionID,ContractValue,CompletionStatus)
        OUTPUT inserted.BillingUnitID AS unitId VALUES(@projectId,@revisionId,@value,@status)`);
    for (const [index, scope] of definitions.entries()) {
      await transaction.request().input("unitId", sql.Int, inserted.recordset[0].unitId)
        .input("sourceScopeId", sql.Int, scope.sourceScopeId).input("name", sql.NVarChar(150), scope.scopeName)
        .input("sort", sql.Int, index).input("value", sql.Decimal(19, 2), values[index] / 100).input("status", sql.VarChar(16), status)
        .query(`INSERT INTO dbo.ProjectBillingScopes(BillingUnitID,SourceScopeID,ScopeName,SortOrder,ContractValue,CompletionStatus)
          VALUES(@unitId,@sourceScopeId,@name,@sort,@value,@status)`);
    }
  }
  if (project.engagementType === "Service") {
    await transaction.request().input("projectId", sql.Int, projectId).query(`
      INSERT INTO dbo.ProjectBillingUnits(ProjectID,ServiceVisitID,SourceRevisionID,ContractValue,CompletionStatus)
      SELECT v.ProjectID,v.ServiceVisitID,t.SourceRevisionID,t.ContractValue,
        CASE WHEN v.Status='Completed' THEN 'Complete' ELSE 'Upcoming' END
      FROM dbo.ServiceVisits v JOIN dbo.ProjectBillingUnits t ON t.ProjectID=v.ProjectID AND t.ServiceVisitID IS NULL
      WHERE v.ProjectID=@projectId AND NOT EXISTS (SELECT 1 FROM dbo.ProjectBillingUnits u WHERE u.ServiceVisitID=v.ServiceVisitID);
      INSERT INTO dbo.ProjectBillingScopes(BillingUnitID,SourceScopeID,ScopeName,SortOrder,ContractValue,CompletionStatus)
      SELECT u.BillingUnitID,s.SourceScopeID,s.ScopeName,s.SortOrder,s.ContractValue,u.CompletionStatus
      FROM dbo.ProjectBillingUnits u JOIN dbo.ProjectBillingUnits t ON t.ProjectID=u.ProjectID AND t.ServiceVisitID IS NULL
      JOIN dbo.ProjectBillingScopes s ON s.BillingUnitID=t.BillingUnitID
      WHERE u.ProjectID=@projectId AND u.ServiceVisitID IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM dbo.ProjectBillingScopes known WHERE known.BillingUnitID=u.BillingUnitID);
    `);
  }
}

async function readBilling(transaction: sql.Transaction, project: BillingProject): Promise<ProjectBilling> {
  const unitRows = await transaction.request().input("projectId", sql.Int, project.projectId)
    .input("recurring", sql.Bit, project.engagementType === "Service").input("projectStatus", sql.VarChar(24), project.projectStatus).query<{
    unitId: number; serviceVisitId: number | null; visitDate: string | null; recurrenceDate: string | null; status: ScopeStatus;
    skipped: boolean; unitValue: number; scopeId: number; scopeName: string; sortOrder: number; scopeStatus: ScopeStatus; scopeValue: number; billed: number;
  }>(`
    SELECT u.BillingUnitID AS unitId,u.ServiceVisitID AS serviceVisitId,CONVERT(char(10),v.VisitDate,23) AS visitDate,
      CONVERT(char(10),v.RecurrenceDate,23) AS recurrenceDate,
      CASE WHEN @recurring=0 THEN CASE @projectStatus WHEN 'Active' THEN 'In Progress' ELSE @projectStatus END ELSE u.CompletionStatus END AS status,
      CONVERT(bit,CASE WHEN v.Status='Skipped' THEN 1 ELSE 0 END) AS skipped,u.ContractValue AS unitValue,
      s.BillingScopeID AS scopeId,s.ScopeName AS scopeName,s.SortOrder AS sortOrder,s.CompletionStatus AS scopeStatus,
      s.ContractValue AS scopeValue,COALESCE((SELECT SUM(a.Amount) FROM dbo.ProjectInvoiceAllocations a WHERE a.BillingScopeID=s.BillingScopeID),0) AS billed
    FROM dbo.ProjectBillingUnits u JOIN dbo.ProjectBillingScopes s ON s.BillingUnitID=u.BillingUnitID
    LEFT JOIN dbo.ServiceVisits v ON v.ServiceVisitID=u.ServiceVisitID
    WHERE u.ProjectID=@projectId AND ((@recurring=1 AND u.ServiceVisitID IS NOT NULL) OR (@recurring=0 AND u.ServiceVisitID IS NULL))
    ORDER BY v.VisitDate,u.BillingUnitID,s.SortOrder
  `);
  const units = new Map<number, BillingUnit>();
  for (const row of unitRows.recordset) {
    let unit = units.get(row.unitId);
    if (!unit) {
      unit = { unitId: row.unitId, serviceVisitId: row.serviceVisitId, visitDate: row.visitDate, recurrenceDate: row.recurrenceDate,
        status: row.status, skipped: row.skipped, contractValue: row.unitValue, billed: 0, scopes: [] };
      units.set(row.unitId, unit);
    }
    unit.scopes.push({ scopeId: row.scopeId, scopeName: row.scopeName, sortOrder: row.sortOrder,
      status: row.scopeStatus, contractValue: row.scopeValue, billed: row.billed });
    unit.billed = (billingCents(unit.billed) + billingCents(row.billed)) / 100;
  }
  const settings = await transaction.request().input("projectId", sql.Int, project.projectId)
    .query<{ method: BillingMethod }>("SELECT BillingMethod AS method FROM dbo.ProjectBillingSettings WHERE ProjectID=@projectId");
  const invoices = await readBillingInvoices(transaction.request(), project.projectId);
  return { project, method: settings.recordset[0]?.method ?? null, units: [...units.values()], invoices };
}

async function readBillingInvoices(request: sql.Request, projectId: number, invoiceId: number | null = null, lock = true): Promise<BillingInvoice[]> {
  request.input("projectId", sql.Int, projectId).input("invoiceId", sql.Int, invoiceId);
  const invoiceRows = await request.query<{
    invoiceId: number; invoiceNo: string; invoiceDate: string; dueDate: string; amount: number | null; managed: boolean; showScopes: boolean;
    internalNotes: string | null; customerNotes: string | null; includesIncompleteWork: boolean; overrideReason: string | null;
  }>(`SELECT i.id AS invoiceId,RTRIM(i.[Invoice No]) AS invoiceNo,CONVERT(char(10),i.[Invoice Date],23) AS invoiceDate,
    CONVERT(char(10),i.[Invoice Due Date],23) AS dueDate,
    TRY_CONVERT(decimal(19,2),REPLACE(REPLACE(RTRIM(i.[Invoice Amount]),'$',''),',','')) AS amount,
    CONVERT(bit,CASE WHEN h.InvoiceID IS NULL THEN 0 ELSE 1 END) AS managed,COALESCE(h.ShowScopes,0) AS showScopes,
    i.InternalNotes AS internalNotes,i.CustomerNotes AS customerNotes,
    COALESCE(h.IncludesIncompleteWork,CONVERT(bit,0)) AS includesIncompleteWork,h.OverrideReason AS overrideReason
    FROM dbo.Invoices i ${lock ? "WITH(UPDLOCK,HOLDLOCK)" : ""} LEFT JOIN dbo.ProjectIssuedInvoices h ON h.InvoiceID=i.id
    WHERE i.ProjectID=@projectId AND (@invoiceId IS NULL OR i.id=@invoiceId)
    ORDER BY i.[Invoice Date] DESC,i.id DESC`);
  const allocations = await request.query<{
    invoiceId: number; scopeId: number; unitId: number; scopeName: string; visitDate: string | null; amount: number;
    completionStatusAtIssue: ScopeStatus | null;
  }>(`SELECT a.InvoiceID AS invoiceId,s.BillingScopeID AS scopeId,u.BillingUnitID AS unitId,s.ScopeName AS scopeName,
    CONVERT(char(10),a.OccurrenceDate,23) AS visitDate,a.Amount AS amount,a.CompletionStatusAtIssue AS completionStatusAtIssue
    FROM dbo.ProjectInvoiceAllocations a JOIN dbo.ProjectBillingScopes s ON s.BillingScopeID=a.BillingScopeID
    JOIN dbo.ProjectBillingUnits u ON u.BillingUnitID=s.BillingUnitID
    WHERE u.ProjectID=@projectId AND (@invoiceId IS NULL OR a.InvoiceID=@invoiceId)
    ORDER BY u.BillingUnitID,s.SortOrder`);
  return invoiceRows.recordset.map((invoice) => ({ ...invoice, allocations: allocations.recordset.filter((a) => a.invoiceId === invoice.invoiceId) }));
}

export async function getProjectInvoiceBilling(projectId: number, invoiceId: number): Promise<BillingInvoice | null> {
  const pool = await getPool();
  const invoices = await readBillingInvoices(pool.request(), projectId, invoiceId, false);
  return invoices.find((invoice) => invoice.managed) ?? null;
}

export async function getProjectBilling(projectId: number): Promise<ProjectBilling> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const project = await lockProject(transaction, projectId);
    if (project.engagementType === "Service" && project.projectStatus === "Active" && project.startDate && project.endDate && project.frequency) {
      await ensureRecurringVisits(transaction, projectId, project.startDate, project.endDate, project.frequency);
    }
    await ensureProjectBillingSnapshot(transaction, projectId);
    const result = await readBilling(transaction, project);
    await transaction.commit();
    return result;
  } catch (error) { await rollbackIfActive(transaction); throw error; }
}

export async function setBillingCompletion(projectId: number, unitId: number, scopeId: number | null, status: ScopeStatus): Promise<void> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const project = await lockProject(transaction, projectId);
    await ensureProjectBillingSnapshot(transaction, projectId);
    const state = await readBilling(transaction, project);
    const unit = state.units.find((item) => item.unitId === unitId);
    if (!unit || unit.skipped) throw new BillingError("Choose an available occurrence or project");
    if (scopeId !== null && !unit.scopes.some((scope) => scope.scopeId === scopeId)) throw new BillingError("Scope not found");
    const request = transaction.request().input("unitId", sql.Int, unitId).input("scopeId", sql.Int, scopeId).input("status", sql.VarChar(16), status);
    if (scopeId !== null) {
      await request.query("UPDATE dbo.ProjectBillingScopes SET CompletionStatus=@status WHERE BillingScopeID=@scopeId AND BillingUnitID=@unitId");
    } else {
      await request.query(`UPDATE dbo.ProjectBillingUnits SET CompletionStatus=@status WHERE BillingUnitID=@unitId;
        IF @status='Complete' UPDATE dbo.ProjectBillingScopes SET CompletionStatus='Complete' WHERE BillingUnitID=@unitId;`);
      if (project.engagementType === "Project") {
        await transaction.request().input("projectId", sql.Int, projectId).input("status", sql.VarChar(24), status === "In Progress" ? "Active" : status)
          .query("UPDATE dbo.Projects SET ProjectStatus=@status WHERE ProjectID=@projectId");
      }
    }
    await transaction.commit();
  } catch (error) { await rollbackIfActive(transaction); throw error; }
}

export type IssueProjectInvoice = {
  projectId: number; requestId: string; method: BillingMethod; showScopes: boolean; selections: BillingSelection[];
  existingInvoiceId: number | null; invoiceNo: string; invoiceDate: Date; dueDate: Date;
  includeIncompleteWork?: boolean; internalNotes?: string | null; customerNotes?: string | null;
};
export async function issueProjectInvoice(input: IssueProjectInvoice): Promise<number> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const project = await lockProject(transaction, input.projectId);
    const duplicate = await transaction.request().input("requestId", sql.UniqueIdentifier, input.requestId).query<{ invoiceId: number; projectId: number }>(
      "SELECT InvoiceID AS invoiceId,ProjectID AS projectId FROM dbo.ProjectIssuedInvoices WHERE RequestID=@requestId");
    if (duplicate.recordset[0]) {
      if (duplicate.recordset[0].projectId !== input.projectId) throw new BillingError("Invoice request belongs to a different project");
      await transaction.commit();
      return duplicate.recordset[0].invoiceId;
    }
    await ensureProjectBillingSnapshot(transaction, input.projectId);
    const state = await readBilling(transaction, project);
    if (state.method && state.method !== input.method) throw new BillingError("The billing method is locked by the first invoice.");
    const legacy = input.existingInvoiceId === null ? null : state.invoices.find((invoice) => invoice.invoiceId === input.existingInvoiceId && !invoice.managed);
    if (input.existingInvoiceId !== null && !legacy) throw new BillingError("Choose an unallocated invoice belonging to this project");
    if (legacy && (legacy.amount === null || legacy.amount <= 0)) throw new BillingError("The existing invoice needs a valid positive amount. Correct it in Finance before allocating.");
    if (!legacy && state.invoices.some((invoice) => !invoice.managed)) throw new BillingError("Allocate existing Finance invoices before issuing new invoices.");
    const internalNotes = parseNotes(input.internalNotes, "Internal notes");
    const customerNotes = parseNotes(input.customerNotes, "Customer notes");
    const allocations = calculateBillingAllocations(state.units, input.selections, input.method, legacy !== null, input.includeIncompleteWork === true)
      .map((allocation) => {
        const scope = state.units.find((unit) => unit.unitId === allocation.unitId)?.scopes.find((scope) => scope.scopeId === allocation.scopeId);
        if (!scope) throw new BillingError("Allocated scope is unavailable");
        return { ...allocation, completionStatusAtIssue: legacy ? null : scope.status };
      });
    const includesIncompleteWork = !legacy && allocations.some((allocation) => allocation.completionStatusAtIssue !== "Complete");
    if (includesIncompleteWork && !internalNotes) throw new BillingError("Enter the advance billing reason in internal invoice notes. This reason is not shown to the customer.");
    const total = allocations.reduce((sum, item) => sum + billingCents(item.amount), 0) / 100;
    if (legacy && (legacy.amount === null || billingCents(legacy.amount) !== billingCents(total))) {
      throw new BillingError("Allocations must exactly equal the existing invoice amount.");
    }
    if (!state.method) await transaction.request().input("projectId", sql.Int, input.projectId).input("method", sql.VarChar(16), input.method)
      .query("INSERT INTO dbo.ProjectBillingSettings(ProjectID,BillingMethod) VALUES(@projectId,@method)");
    let invoiceId: number;
    if (legacy) invoiceId = legacy.invoiceId;
    else {
      if (!project.customerId) throw new BillingError("Choose a billing customer on this project before issuing an invoice.");
      const customer = await transaction.request().input("customerId", sql.Int, project.customerId)
        .query("SELECT CustomerID FROM dbo.Customers WITH (HOLDLOCK) WHERE CustomerID=@customerId AND IsActive=1");
      if (!customer.recordset.length) throw new BillingError("The billing customer is archived. Choose an active billing customer first.");
      const result = await transaction.request().input("projectId", sql.Int, input.projectId).input("customerId", sql.Int, project.customerId)
        .input("invoiceNo", sql.NChar(10), input.invoiceNo).input("date", sql.Date, input.invoiceDate).input("due", sql.Date, input.dueDate)
        .input("amount", sql.NVarChar(32), total.toFixed(2))
        .input("internalNotes", sql.NVarChar(4000), internalNotes).input("customerNotes", sql.NVarChar(4000), customerNotes).query<{ invoiceId: number }>(`
          IF EXISTS (SELECT 1 FROM dbo.Invoices WITH (UPDLOCK,HOLDLOCK) WHERE [Invoice No]=@invoiceNo)
            THROW 51041, 'This invoice number already exists. Use a unique invoice number.', 1;
          INSERT INTO dbo.Invoices(ProjectID,CustomerID,IsProjectBilling,[Invoice No],[Invoice Date],[Invoice Due Date],[Invoice Amount],
            [First Name],[Last Name],[Company Name],[Billing Address Line 1],[Billing Address Line 2],[Billing Address City],
            [Billing Address State],[Billing Address Zip],[Shipping Address Line 1],[Shipping Address Line 2],[Shipping Address City],
            [Shipping Address State],[Shipping Address Zip],InternalNotes,CustomerNotes)
          SELECT @projectId,CustomerID,1,@invoiceNo,@date,@due,@amount,FirstName,LastName,CompanyName,
            BillingAddressLine1,BillingAddressLine2,BillingAddressCity,BillingAddressState,BillingAddressZip,
            ShippingAddressLine1,ShippingAddressLine2,ShippingAddressCity,ShippingAddressState,ShippingAddressZip,@internalNotes,@customerNotes
          FROM dbo.Customers WHERE CustomerID=@customerId;
          SELECT CONVERT(int,SCOPE_IDENTITY()) AS invoiceId;
        `);
      invoiceId = result.recordset[0].invoiceId;
    }
    await transaction.request().input("invoiceId", sql.Int, invoiceId).input("projectId", sql.Int, input.projectId)
      .input("requestId", sql.UniqueIdentifier, input.requestId).input("method", sql.VarChar(16), input.method)
      .input("showScopes", sql.Bit, input.showScopes).input("reconciled", sql.Bit, legacy !== null)
      .input("incomplete", sql.Bit, includesIncompleteWork).input("reason", sql.NVarChar(4000), includesIncompleteWork ? internalNotes : null)
      .query(`INSERT INTO dbo.ProjectIssuedInvoices(InvoiceID,ProjectID,RequestID,BillingMethod,ShowScopes,IsReconciled,IncludesIncompleteWork,OverrideReason)
        VALUES(@invoiceId,@projectId,@requestId,@method,@showScopes,@reconciled,@incomplete,@reason)`);
    await transaction.request().input("invoiceId", sql.Int, invoiceId).input("allocations", sql.NVarChar(sql.MAX), JSON.stringify(allocations))
      .query(`INSERT INTO dbo.ProjectInvoiceAllocations(InvoiceID,BillingScopeID,Amount,OccurrenceDate,CompletionStatusAtIssue)
        SELECT @invoiceId,j.scopeId,j.amount,v.VisitDate,j.completionStatusAtIssue
        FROM OPENJSON(@allocations) WITH(scopeId int,amount decimal(19,2),completionStatusAtIssue varchar(16)) j
        JOIN dbo.ProjectBillingScopes s ON s.BillingScopeID=j.scopeId
        JOIN dbo.ProjectBillingUnits u ON u.BillingUnitID=s.BillingUnitID
        LEFT JOIN dbo.ServiceVisits v ON v.ServiceVisitID=u.ServiceVisitID`);
    await transaction.commit();
    return invoiceId;
  } catch (error) { await rollbackIfActive(transaction); throw error; }
}
