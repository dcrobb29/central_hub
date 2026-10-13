import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { registerHooks } from "node:module";
import { test } from "node:test";
import sql from "mssql";
import nextEnv from "@next/env";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/app/lib/")) return nextResolve(new URL(`./${specifier.slice("@/app/lib/".length)}.ts`, import.meta.url).href, context);
    if (specifier === "./validation" && context.parentURL?.endsWith("/customer-fields.ts")) return nextResolve("./validation.ts", context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === new URL("./db.ts", import.meta.url).href) return {
      format: "module", shortCircuit: true,
      source: "export const getPool = async () => globalThis.billingTestDb; export const sql = globalThis.billingTestSql;",
    };
    return nextLoad(url, context);
  },
});
const enabled = process.env.RUN_DB_TESTS === "1";

async function fixture(run, recurring = false) {
  nextEnv.loadEnvConfig(process.cwd());
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_SERVER, port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    options: { encrypt: process.env.DB_ENCRYPT !== "false", trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === "true" },
  }).connect();
  const transaction = new sql.Transaction(pool);
  let aborted = false;
  transaction.on("rollback", () => { aborted = true; });
  await transaction.begin();
  const facade = { request: () => transaction.request(), begin: async () => {}, commit: async () => {}, rollback: async () => {} };
  globalThis.billingTestDb = facade;
  globalThis.billingTestSql = { ...sql, Transaction: class { constructor() { return globalThis.billingTestDb; } } };
  try {
    const setup = await transaction.request().input("type", sql.VarChar(16), recurring ? "Service" : "Project").query(`
      INSERT INTO dbo.Customers(FirstName,CompanyName,BillingAddressLine1) VALUES(N'Billing fixture',N'Billing fixture company',N'Historical billing address');
      DECLARE @customerId int=SCOPE_IDENTITY();
      INSERT INTO dbo.Estimates(EstimateName,EngagementType,RecurrenceFrequency,ExpectedStartDate,ExpectedEndDate)
      VALUES(N'Billing fixture',@type,CASE WHEN @type='Service' THEN 'Weekly' ELSE NULL END,'2040-10-03','2040-10-17');
      DECLARE @estimateId int=SCOPE_IDENTITY();
      INSERT INTO dbo.EstimateRevisions(EstimateID,RevisionNumber,MarkupMode,GroupingMode,EstimateMarkupPercent,TaxPercent,RoundingIncrement,QuotedTotal)
      VALUES(@estimateId,1,'perLine','Scope',0,0,0,1000);
      DECLARE @revisionId int=SCOPE_IDENTITY();
      INSERT INTO dbo.EstimateScopesOfWork(EstimateRevisionID,ScopeName,SortOrder) VALUES(@revisionId,N'Scope A',0);
      DECLARE @scopeA int=SCOPE_IDENTITY();
      INSERT INTO dbo.EstimateScopesOfWork(EstimateRevisionID,ScopeName,SortOrder) VALUES(@revisionId,N'Scope B',1);
      DECLARE @scopeB int=SCOPE_IDENTITY();
      INSERT INTO dbo.EstimateLineItems(EstimateRevisionID,LineNumber,Description,Quantity,UnitName,UnitCost,LineType,EstimateScopeOfWorkID)
      VALUES(@revisionId,1,N'A',1,'EA',600,'Material',@scopeA),(@revisionId,2,N'B',1,'EA',300,'Material',@scopeB),(@revisionId,3,N'Other',1,'EA',100,'Material',NULL);
      INSERT INTO dbo.Projects(ProjectName,ProjectStatus,CustomerID,AcceptedEstimateRevisionID,EngagementType,RecurrenceFrequency,ExpectedStartDate,ExpectedEndDate)
      VALUES(N'Billing fixture','Active',@customerId,@revisionId,@type,CASE WHEN @type='Service' THEN 'Weekly' ELSE NULL END,'2040-10-03','2040-10-17');
      SELECT CONVERT(int,SCOPE_IDENTITY()) AS projectId,@customerId AS customerId,@revisionId AS revisionId;
    `);
    const ids = setup.recordset[0];
    const billing = await import("./project-billing.ts");
    const projects = await import("./projects.ts");
    const invoices = await import("./invoices.ts");
    const state = await billing.getProjectBilling(ids.projectId);
    const input = (selections, extra = {}) => ({
      projectId: ids.projectId, requestId: randomUUID(), method: "Scopes", showScopes: true,
      existingInvoiceId: null, invoiceNo: `B${randomUUID().replaceAll("-", "").slice(0, 9)}`,
      invoiceDate: new Date("2040-10-03T00:00:00Z"), dueDate: new Date("2040-11-03T00:00:00Z"), selections,
      includeIncompleteWork: true, internalNotes: "Customer requires advance billing for this test occurrence.", ...extra,
    });
    const select = (unit, scope = null, kind = "Full", value = null) => ({ unitId: unit.unitId, scopeId: scope?.scopeId ?? null, kind, value });
    await run({ ...billing, ...projects, ...invoices, ids, state, input, select, transaction, pool });
  } finally {
    if (!aborted) await transaction.rollback();
    await pool.close();
    delete globalThis.billingTestDb;
    delete globalThis.billingTestSql;
  }
}

test("snapshots include ungrouped work, sum to contract, and survive estimate changes", { skip: !enabled }, () => fixture(async (f) => {
  assert.deepEqual(f.state.units[0].scopes.map((scope) => [scope.scopeName, scope.contractValue]), [["Scope A",600],["Scope B",300],["Ungrouped work",100]]);
  await f.transaction.request().input("revisionId",sql.Int,f.ids.revisionId).query("UPDATE dbo.EstimateRevisions SET QuotedTotal=2000 WHERE EstimateRevisionID=@revisionId");
  assert.equal((await f.getProjectBilling(f.ids.projectId)).units[0].contractValue,1000);
}));
test("scope partial then parent remainder cannot rebill the scope", { skip: !enabled }, () => fixture(async (f) => {
  const unit=f.state.units[0];
  await f.issueProjectInvoice(f.input([f.select(unit,unit.scopes[0],"Percentage",50)]));
  let state=await f.getProjectBilling(f.ids.projectId);
  assert.equal(state.units[0].scopes[0].billed,300);
  assert.equal(state.method,"Scopes");
  await f.issueProjectInvoice(f.input([f.select(unit)]));
  state=await f.getProjectBilling(f.ids.projectId);
  assert.equal(state.units[0].billed,1000);
  assert.equal((await f.getProjectFinancialSummary()).find((project)=>project.projectId===f.ids.projectId).income,1000);
  await assert.rejects(()=>f.issueProjectInvoice(f.input([f.select(unit)])),/no billable/);
}));
test("first invoice locks method and percentage invoices use original contract", { skip: !enabled }, () => fixture(async (f) => {
  const unit=f.state.units[0];
  await f.issueProjectInvoice(f.input([f.select(unit,null,"Percentage",25)],{method:"Percentage"}));
  await f.issueProjectInvoice(f.input([f.select(unit,null,"Percentage",25)],{method:"Percentage"}));
  assert.equal((await f.getProjectBilling(f.ids.projectId)).units[0].billed,500);
  await assert.rejects(()=>f.issueProjectInvoice(f.input([f.select(unit)])),/locked/);
  await assert.rejects(()=>f.issueProjectInvoice(f.input([f.select(unit,null,"Percentage",75)],{method:"Percentage"})),/exceeds/);
}));
test("request retries return one invoice, not a second charge", { skip: !enabled }, () => fixture(async (f) => {
  const input=f.input([f.select(f.state.units[0],null,"Amount",250)],{method:"Amount"});
  const id=await f.issueProjectInvoice(input);
  assert.equal(await f.issueProjectInvoice(input),id);
  const state=await f.getProjectBilling(f.ids.projectId);
  assert.equal(state.invoices.length,1);
  assert.equal(state.units[0].billed,250);
}));
test("completion corrections do not rewrite invoices or auto-complete parents", { skip: !enabled }, () => fixture(async (f) => {
  const unit=f.state.units[0];
  for(const scope of unit.scopes) await f.setBillingCompletion(f.ids.projectId,unit.unitId,scope.scopeId,"Complete");
  assert.equal((await f.getProjectBilling(f.ids.projectId)).project.projectStatus,"Active");
  await f.issueProjectInvoice(f.input([f.select(unit,unit.scopes[0])]));
  await f.setBillingCompletion(f.ids.projectId,unit.unitId,unit.scopes[0].scopeId,"In Progress");
  const state=await f.getProjectBilling(f.ids.projectId);
  assert.equal(state.units[0].scopes[0].status,"In Progress");
  assert.equal(state.units[0].scopes[0].billed,600);
}));
test("completed one-time jobs auto-complete scopes and allow managed final invoices", { skip: !enabled }, () => fixture(async (f) => {
  await f.updateProjectStatus(f.ids.projectId,"Complete");
  let state=await f.getProjectBilling(f.ids.projectId);
  assert.ok(state.units[0].scopes.every((scope)=>scope.status==="Complete"));
  const id=await f.issueProjectInvoice(f.input([f.select(state.units[0])]));
  const invoice=(await f.getInvoices()).find((item)=>item.id===id);
  assert.equal(invoice.billingManaged,true);
  await f.updateInvoice(id,{...invoice,invoiceDate:new Date(invoice.invoiceDate),invoiceDueDate:new Date(invoice.invoiceDueDate),invoicePaidDate:new Date("2040-10-05T00:00:00Z")});
  state=await f.getProjectBilling(f.ids.projectId);
  assert.equal(state.units[0].billed,1000);
}));
test("issued invoice amount changes are blocked by the database", { skip: !enabled }, () => fixture(async (f) => {
  const id=await f.issueProjectInvoice(f.input([f.select(f.state.units[0])]));
  await assert.rejects(()=>f.transaction.request().input("id",sql.Int,id).query("UPDATE dbo.Invoices SET [Invoice Amount]='1.00' WHERE id=@id"),/locked/);
}));
test("existing invoices must be explicitly reconciled; reconciliation creates no new Finance row", { skip: !enabled }, () => fixture(async (f) => {
  const legacy=await f.transaction.request().input("projectId",sql.Int,f.ids.projectId).query(`INSERT INTO dbo.Invoices(ProjectID,[Invoice No],[Invoice Date],[Invoice Due Date],[Invoice Amount])
    VALUES(@projectId,'OLDTEST','2040-10-03','2040-11-03','200.00'); SELECT CONVERT(int,SCOPE_IDENTITY()) AS invoiceId;`);
  const unit=f.state.units[0];
  await assert.rejects(()=>f.issueProjectInvoice(f.input([f.select(unit)])),/Allocate existing/);
  await assert.rejects(()=>f.issueProjectInvoice(f.input([f.select(unit,null,"Amount",100)],{existingInvoiceId:legacy.recordset[0].invoiceId})),/exactly equal/);
  await f.issueProjectInvoice(f.input([f.select(unit,unit.scopes[0],"Amount",200)],{existingInvoiceId:legacy.recordset[0].invoiceId}));
  let state=await f.getProjectBilling(f.ids.projectId);
  assert.equal(state.invoices.length,1); assert.equal(state.units[0].scopes[0].billed,200);
  await f.issueProjectInvoice(f.input([f.select(unit,unit.scopes[0])]));
  state=await f.getProjectBilling(f.ids.projectId);
  assert.equal(state.units[0].scopes[0].billed,600);
  assert.equal(state.invoices.reduce((sum,invoice)=>sum+invoice.amount,0),600);
}));
test("recurring occurrence balances multiply and completion never completes the series", { skip: !enabled }, () => fixture(async (f) => {
  assert.equal(f.state.units.length,3);
  const [first,second]=f.state.units;
  await f.setBillingCompletion(f.ids.projectId,first.unitId,null,"Complete");
  let state=await f.getProjectBilling(f.ids.projectId);
  assert.equal(state.project.projectStatus,"Active");
  assert.equal(state.units[1].status,"Upcoming");
  await f.issueProjectInvoice(f.input([f.select(first),f.select(second)]));
  state=await f.getProjectBilling(f.ids.projectId);
  assert.deepEqual(state.units.map((unit)=>unit.billed),[1000,1000,0]);
  assert.equal((await f.getProjectFinancialSummary()).find((project)=>project.projectId===f.ids.projectId).income,2000);
},true));
test("moving a recurring visit retains its balance and original invoice occurrence date", { skip: !enabled }, () => fixture(async (f) => {
  const unit=f.state.units[0];
  await f.issueProjectInvoice(f.input([f.select(unit,unit.scopes[0])]));
  await f.transaction.request().input("id",sql.Int,unit.serviceVisitId).query("UPDATE dbo.ServiceVisits SET VisitDate='2040-10-05' WHERE ServiceVisitID=@id");
  const state=await f.getProjectBilling(f.ids.projectId);
  assert.equal(state.units.find((item)=>item.unitId===unit.unitId).billed,600);
  assert.equal(state.invoices[0].allocations[0].visitDate,"2040-10-03");
},true));
test("billed recurring occurrences cannot be skipped", { skip: !enabled }, () => fixture(async (f) => {
  const unit=f.state.units[0];
  await f.issueProjectInvoice(f.input([f.select(unit)]));
  await assert.rejects(()=>f.transaction.request().input("id",sql.Int,unit.serviceVisitId).query("UPDATE dbo.ServiceVisits SET Status='Skipped' WHERE ServiceVisitID=@id"),/billed occurrence/);
},true));
test("ending recurring agreement does not mark unperformed future occurrences complete", { skip: !enabled }, () => fixture(async (f) => {
  await f.updateProjectStatus(f.ids.projectId,"Complete");
  const state=await f.getProjectBilling(f.ids.projectId);
  assert.ok(state.units.every((unit)=>unit.status==="Upcoming"));
},true));
test("customer details are snapshotted from the saved billing customer", { skip: !enabled }, () => fixture(async (f) => {
  const id=await f.issueProjectInvoice(f.input([f.select(f.state.units[0])]));
  await f.transaction.request().input("id",sql.Int,f.ids.customerId).query("UPDATE dbo.Customers SET BillingAddressLine1='Changed address' WHERE CustomerID=@id");
  assert.equal((await f.getInvoices()).find((invoice)=>invoice.id===id).billingAddressLine1,"Historical billing address");
}));
test("database trigger prevents allocations over a scope even if application validation is bypassed", { skip: !enabled }, () => fixture(async (f) => {
  const unit=f.state.units[0];
  await f.issueProjectInvoice(f.input([f.select(unit,unit.scopes[0])]));
  await f.setBillingCompletion(f.ids.projectId,unit.unitId,unit.scopes[0].scopeId,"Complete");
  await assert.rejects(()=>f.transaction.request().input("projectId",sql.Int,f.ids.projectId).input("scopeId",sql.Int,unit.scopes[0].scopeId).query(`
    INSERT INTO dbo.Invoices(ProjectID,IsProjectBilling,[Invoice No],[Invoice Date],[Invoice Due Date],[Invoice Amount])
    VALUES(@projectId,1,'CAPTEST','2040-10-03','2040-11-03','1.00');
    DECLARE @invoiceId int=SCOPE_IDENTITY();
    INSERT INTO dbo.ProjectIssuedInvoices(InvoiceID,ProjectID,RequestID,BillingMethod) VALUES(@invoiceId,@projectId,NEWID(),'Scopes');
    INSERT INTO dbo.ProjectInvoiceAllocations(InvoiceID,BillingScopeID,Amount,CompletionStatusAtIssue) VALUES(@invoiceId,@scopeId,1,'Complete');
  `),/already been billed/);
}));
test("issued invoice deletion is explicitly rejected", { skip: !enabled }, () => fixture(async (f) => {
  const id=await f.issueProjectInvoice(f.input([f.select(f.state.units[0])]));
  await assert.rejects(()=>f.deleteInvoice(id),/cannot be deleted/);
}));
test("completion through the modal updates the one-time parent, but scope corrections do not", { skip: !enabled }, () => fixture(async (f) => {
  const unit=f.state.units[0];
  await f.setBillingCompletion(f.ids.projectId,unit.unitId,null,"Complete");
  let state=await f.getProjectBilling(f.ids.projectId);
  assert.equal(state.project.projectStatus,"Complete");
  await f.setBillingCompletion(f.ids.projectId,unit.unitId,unit.scopes[0].scopeId,"In Progress");
  state=await f.getProjectBilling(f.ids.projectId);
  assert.equal(state.project.projectStatus,"Complete");
  assert.equal(state.units[0].scopes[0].status,"In Progress");
}));
test("another database connection cannot acquire the invoice project lock concurrently", { skip: !enabled }, () => fixture(async (f) => {
  const concurrent=await new sql.ConnectionPool(f.pool.config).connect();
  try {
    await assert.rejects(()=>concurrent.request().input("id",sql.Int,f.ids.projectId).query(
      "SET LOCK_TIMEOUT 1000; SELECT ProjectID FROM dbo.Projects WITH(UPDLOCK,HOLDLOCK) WHERE ProjectID=@id"),/Lock request time out/);
  } finally { await concurrent.close(); }
}));
test("invoice export reads only the requested invoice without generating recurring visits", { skip: !enabled }, () => fixture(async (f) => {
  const id=await f.issueProjectInvoice(f.input([f.select(f.state.units[0])]));
  await f.transaction.request().input("id",sql.Int,f.ids.projectId).query("UPDATE dbo.Projects SET ExpectedEndDate='2040-10-24' WHERE ProjectID=@id");
  const invoice=await f.getProjectInvoiceBilling(f.ids.projectId,id);
  assert.equal(invoice.invoiceId,id);
  assert.equal(invoice.amount,1000);
  assert.equal(invoice.allocations.reduce((sum,allocation)=>sum+allocation.amount,0),1000);
  assert.deepEqual((await f.getInvoices(id)).map((item)=>item.id),[id]);
  assert.equal(await f.getProjectInvoiceBilling(f.ids.projectId,2_147_483_647),null);
  const count=await f.transaction.request().input("id",sql.Int,f.ids.projectId).query("SELECT COUNT(*) AS visits FROM dbo.ServiceVisits WHERE ProjectID=@id");
  assert.equal(count.recordset[0].visits,3);
},true));
test("advance billing requires a toggle and private reason, stores completion separately and never rebills", { skip: !enabled }, () => fixture(async (f) => {
  const unit=f.state.units[0];
  const selections=[f.select(unit,unit.scopes[0],"Percentage",50)];
  await assert.rejects(()=>f.issueProjectInvoice(f.input(selections,{includeIncompleteWork:false})),/Include incomplete work/);
  await assert.rejects(()=>f.issueProjectInvoice(f.input(selections,{internalNotes:" \n "})),/reason in internal invoice notes/);
  const id=await f.issueProjectInvoice(f.input(selections,{internalNotes:"  Client needs the entire month billed on May 15.  ",customerNotes:"May services"}));
  let state=await f.getProjectBilling(f.ids.projectId);
  const invoice=state.invoices.find((item)=>item.invoiceId===id);
  assert.equal(invoice.includesIncompleteWork,true);
  assert.equal(invoice.overrideReason,"Client needs the entire month billed on May 15.");
  assert.equal(invoice.internalNotes,invoice.overrideReason);
  assert.equal(invoice.customerNotes,"May services");
  assert.equal(invoice.allocations[0].completionStatusAtIssue,"Upcoming");
  assert.equal(state.units[0].scopes[0].status,"Upcoming");
  assert.equal(state.project.projectStatus,"Active");
  await f.setBillingCompletion(f.ids.projectId,unit.unitId,unit.scopes[0].scopeId,"Complete");
  await f.issueProjectInvoice(f.input([f.select(unit,unit.scopes[0])],{includeIncompleteWork:false,internalNotes:null}));
  state=await f.getProjectBilling(f.ids.projectId);
  assert.equal(state.units[0].scopes[0].billed,600);
  assert.equal(state.invoices.find((item)=>item.invoiceId===id).allocations[0].completionStatusAtIssue,"Upcoming");
  await assert.rejects(()=>f.issueProjectInvoice(f.input([f.select(unit,unit.scopes[0])])),/no billable/);
}));
test("completed-only parent amount is allocated exclusively to completed scopes", { skip: !enabled }, () => fixture(async (f) => {
  const unit=f.state.units[0];
  await f.setBillingCompletion(f.ids.projectId,unit.unitId,unit.scopes[0].scopeId,"Complete");
  const id=await f.issueProjectInvoice(f.input([f.select(unit,null,"Amount",300)],{method:"Amount",includeIncompleteWork:false,internalNotes:null}));
  const invoice=await f.getProjectInvoiceBilling(f.ids.projectId,id);
  assert.equal(invoice.includesIncompleteWork,false);
  assert.equal(invoice.overrideReason,null);
  assert.deepEqual(invoice.allocations.map((allocation)=>[allocation.scopeId,allocation.amount,allocation.completionStatusAtIssue]),
    [[unit.scopes[0].scopeId,300,"Complete"]]);
  await assert.rejects(()=>f.issueProjectInvoice(f.input([f.select(unit,null,"Amount",301)],{method:"Amount",includeIncompleteWork:false})),/completed work/);
}));
test("Finance notes remain editable without erasing the immutable approval reason", { skip: !enabled }, () => fixture(async (f) => {
  const id=await f.issueProjectInvoice(f.input([f.select(f.state.units[0])],{internalNotes:"Original approval",customerNotes:"Original public notes"}));
  const invoice=(await f.getInvoices(id))[0];
  const input={...invoice,invoiceDate:new Date(invoice.invoiceDate),invoiceDueDate:new Date(invoice.invoiceDueDate),invoicePaidDate:null,
    internalNotes:"Follow-up internal notes",customerNotes:"Updated customer notes"};
  await f.updateInvoice(id,input);
  let billing=await f.getProjectInvoiceBilling(f.ids.projectId,id);
  assert.equal(billing.overrideReason,"Original approval");
  assert.equal(billing.internalNotes,"Follow-up internal notes");
  assert.equal(billing.customerNotes,"Updated customer notes");
  delete input.internalNotes; delete input.customerNotes;
  await f.updateInvoice(id,input);
  billing=await f.getProjectInvoiceBilling(f.ids.projectId,id);
  assert.equal(billing.internalNotes,"Follow-up internal notes");
  await assert.rejects(()=>f.transaction.request().input("id",sql.Int,id).query("UPDATE dbo.ProjectIssuedInvoices SET OverrideReason='Changed' WHERE InvoiceID=@id"),/cannot be edited|UPDATE permission was denied/);
}));
test("database rejects unaudited billing of incomplete scopes", { skip: !enabled }, () => fixture(async (f) => {
  const unit=f.state.units[0];
  await f.issueProjectInvoice(f.input([f.select(unit,unit.scopes[0],"Percentage",50)]));
  await assert.rejects(()=>f.transaction.request().input("projectId",sql.Int,f.ids.projectId).input("scopeId",sql.Int,unit.scopes[1].scopeId).query(`
    INSERT INTO dbo.Invoices(ProjectID,IsProjectBilling,[Invoice No],[Invoice Date],[Invoice Due Date],[Invoice Amount])
    VALUES(@projectId,1,'NOAUDIT','2040-10-03','2040-11-03','1.00');
    DECLARE @invoiceId int=SCOPE_IDENTITY();
    INSERT INTO dbo.ProjectIssuedInvoices(InvoiceID,ProjectID,RequestID,BillingMethod) VALUES(@invoiceId,@projectId,NEWID(),'Scopes');
    INSERT INTO dbo.ProjectInvoiceAllocations(InvoiceID,BillingScopeID,Amount,CompletionStatusAtIssue) VALUES(@invoiceId,@scopeId,1,'Upcoming');
  `),/advance billing approval/);
}));
test("database also caps the whole occurrence when an extra scope is inserted directly", { skip: !enabled }, () => fixture(async (f) => {
  const unit=f.state.units[0];
  await f.issueProjectInvoice(f.input([f.select(unit)]));
  await assert.rejects(()=>f.transaction.request().input("projectId",sql.Int,f.ids.projectId).input("unitId",sql.Int,unit.unitId).query(`
    INSERT INTO dbo.ProjectBillingScopes(BillingUnitID,ScopeName,SortOrder,ContractValue,CompletionStatus)
    VALUES(@unitId,'Extra scope',99,1,'Complete');
    DECLARE @scopeId int=SCOPE_IDENTITY();
    INSERT INTO dbo.Invoices(ProjectID,IsProjectBilling,[Invoice No],[Invoice Date],[Invoice Due Date],[Invoice Amount])
    VALUES(@projectId,1,'UNITCAP','2040-10-03','2040-11-03','1.00');
    DECLARE @invoiceId int=SCOPE_IDENTITY();
    INSERT INTO dbo.ProjectIssuedInvoices(InvoiceID,ProjectID,RequestID,BillingMethod) VALUES(@invoiceId,@projectId,NEWID(),'Scopes');
    INSERT INTO dbo.ProjectInvoiceAllocations(InvoiceID,BillingScopeID,Amount,CompletionStatusAtIssue) VALUES(@invoiceId,@scopeId,1,'Complete');
  `),/contract balance cannot be exceeded/);
},true));
