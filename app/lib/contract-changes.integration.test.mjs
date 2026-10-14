import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {registerHooks} from "node:module";
import {test} from "node:test";
import sql from "mssql";
import nextEnv from "@next/env";
test("alternates, signed changes, deductions and billing preserve approval history",{
  skip:process.env.RUN_DB_TESTS!=="1",
},async()=>{
  nextEnv.loadEnvConfig(process.cwd());
  const pool=await new sql.ConnectionPool({
    server:process.env.DB_SERVER,port:Number(process.env.DB_PORT||1433),database:process.env.DB_NAME,
    user:process.env.DB_USER,password:process.env.DB_PASSWORD,
    options:{encrypt:process.env.DB_ENCRYPT!=="false",trustServerCertificate:process.env.DB_TRUST_SERVER_CERTIFICATE==="true"},
  }).connect();
  const tx=new sql.Transaction(pool);await tx.begin();
  const facade={request:()=>tx.request(),
    begin:async()=>{await tx.request().query("SAVE TRANSACTION ContractService");},
    commit:async()=>{},
    rollback:async()=>{await tx.request().query("IF XACT_STATE()=1 ROLLBACK TRANSACTION ContractService");}};
  globalThis.contractTestDb={getPool:async()=>facade,sql:{...sql,Transaction:class{constructor(){return facade;}}}};
  const hooks=registerHooks({
    resolve(specifier,context,next){
      if(specifier.startsWith("@/app/lib/"))return next(new URL(`./${specifier.slice("@/app/lib/".length)}.ts`,import.meta.url).href,context);
      if(specifier.startsWith("./")&&!/\.[a-z]+$/.test(specifier)&&context.parentURL?.includes("/app/lib/"))return next(`${specifier}.ts`,context);
      return next(specifier,context);
    },
    load(url,context,next){
      if(url===new URL("./db.ts",import.meta.url).href)return {format:"module",shortCircuit:true,
        source:"export const sql=globalThis.contractTestDb.sql; export const getPool=globalThis.contractTestDb.getPool;"};
      return next(url,context);
    },
  });
  try{
    const estimates=await import("./estimates.ts");
    const changes=await import("./contract-changes.ts");
    const billing=await import("./project-billing.ts");
    const {getUnitsOfMeasurement}=await import("./units-of-measurement.ts");
    const unit=(await getUnitsOfMeasurement())[0].abbreviation;
    const {org,user}=(await tx.request().input("key",sql.NVarChar(100),randomUUID()).query(`
      INSERT dbo.Organizations(OrganizationKey,OrganizationName) VALUES(@key,'Contract fixture');
      SELECT CONVERT(int,SCOPE_IDENTITY()) AS org,(SELECT TOP(1) UserID FROM dbo.Users ORDER BY UserID) AS [user];`)).recordset[0];
    const base={estimateName:"Contract fixture",customerName:null,internalNotes:null,customerNotes:null,
      engagementType:"Project",recurrenceFrequency:null,expectedStartDate:null,expectedEndDate:null,
      markupMode:"perLine",estimateMarkupPercent:0,taxPercent:0,roundingIncrement:0,groupingMode:"Scope",scopes:["Base"],
      lines:[{description:"Original work",quantity:10,unitName:unit,unitCost:100,freightAmount:0,lineMarkupPercent:0,
        materialId:null,catalogUnitCostAtEntry:null,catalogPriceDate:null,lineType:"Material",scopeName:"Base"}]};
    const estimateId=await estimates.createEstimate(base,org);
    const detail=await estimates.getEstimateDetails(estimateId);
    const originalLine=detail.lines[0].estimateLineItemId;
    const context={estimateId};
    const make=(title,operation,quantity,unitCost,target=null)=>({...base,estimateName:title,scopes:["Changed work"],
      lines:[{...base.lines[0],description:title,quantity,unitCost,scopeName:"Changed work",operation,deductLineId:target}]});
    const plus=await changes.saveContractChange(context,org,make("Upgrade","Add",1,300));
    const minus=await changes.saveContractChange(context,org,make("Downgrade","Deduct",2,9999,originalLine));
    const later=await changes.saveContractChange(context,org,make("Unselected option","Add",1,150));
    await changes.transitionContractChange(context,org,plus,1,"propose",user);
    await changes.transitionContractChange(context,org,minus,1,"propose",user);
    await changes.transitionContractChange(context,org,later,1,"propose",user);
    let data=await changes.getContractChanges(context,org);
    assert.equal(data.baseValue,1000);
    assert.deepEqual(data.changes.map(c=>c.quotedTotal),[300,-200,150]);
    assert.equal(data.currentContract,1000);
    await assert.rejects(()=>changes.getContractChanges(context,1),e=>e.status===404);
    const projectId=await estimates.winEstimate(estimateId,{selections:[{changeId:plus,version:2},{changeId:minus,version:2}],
      userId:user,approvedAt:"2042-01-01",reference:"Signed base contract and selected options"});
    const projectContext={projectId};
    data=await changes.getContractChanges(projectContext,org);
    assert.equal(data.initialContract,1100);
    assert.equal(data.currentContract,1100);
    const project=(await estimates.getProjectsWithEstimates({projectId,organizationId:org}))[0];
    assert.equal(project.quotedTotal,1100);
    assert.equal(project.lines.find(l=>l.estimateLineItemId===originalLine).quantity,8);
    assert.equal(project.lines.length,2);
    let state=await billing.getProjectBilling(projectId);
    assert.equal(state.units[0].contractValue,1100);
    assert.equal(state.units[0].scopes.reduce((s,c)=>s+c.contractValue,0),1100);
    await assert.rejects(()=>changes.saveContractChange(projectContext,org,make("Tamper","Add",1,10),plus,3),/locked/);
    const co=await changes.saveContractChange(projectContext,org,make("New work","Add",1,100));
    await changes.transitionContractChange(projectContext,org,co,1,"propose",user);
    await changes.transitionContractChange(projectContext,org,co,2,"approve",user,"2042-01-02","Customer approved new work");
    assert.equal((await changes.getContractChanges(projectContext,org)).currentContract,1200);
    const coSnapshot=(await changes.getContractChanges(projectContext,org)).changes.find(c=>c.changeId===co);
    assert.equal(coSnapshot.contractBefore,1100);
    assert.equal(coSnapshot.contractAfter,1200);
    await assert.rejects(()=>changes.saveContractChange(projectContext,1,make("Foreign change","Add",1,1)),e=>e.status===404);
    const addedLine=(await estimates.getProjectsWithEstimates({projectId,organizationId:org}))[0].lines
      .find(l=>l.description==="New work").estimateLineItemId;
    const replacementInput=make("Zero-net replacement","Deduct",0.5,0,addedLine);
    replacementInput.lines.push(make("Replacement work","Add",1,50).lines[0]);
    const replacement=await changes.saveContractChange(projectContext,org,replacementInput);
    await changes.transitionContractChange(projectContext,org,replacement,1,"propose",user);
    await changes.transitionContractChange(projectContext,org,replacement,2,"approve",user,"2042-01-02","Approved replacement");
    const replaced=(await estimates.getProjectsWithEstimates({projectId,organizationId:org}))[0];
    assert.equal(replaced.quotedTotal,1200);
    assert.equal(replaced.lines.find(l=>l.estimateLineItemId===addedLine).quantity,0.5);
    assert.equal(replaced.lines.find(l=>l.description==="Replacement work").quantity,1);
    const converted=await changes.saveContractChange(projectContext,org,await changes.getChangeInput(later,org),undefined,undefined,later);
    await changes.transitionContractChange(projectContext,org,converted,1,"propose",user);
    await assert.rejects(()=>changes.saveContractChange(projectContext,org,make("Duplicate conversion","Add",1,150),undefined,undefined,later),/converted/);
    assert.equal((await changes.getContractChanges(projectContext,org)).currentContract,1200);
    const billId=randomUUID().replaceAll("-","").slice(0,10);
    await tx.request().input("bill",sql.NChar(10),billId).input("project",sql.Int,projectId).input("line",sql.Int,originalLine)
      .input("unit",sql.NVarChar(30),unit).input("org",sql.Int,org).query(`
      INSERT dbo.Bills(id,[Bill No],[Bill Date],[Bill Amount],ProjectID,OrganizationID)
        VALUES(@bill,'TEST','2042-01-02','800.00',@project,@org);
      INSERT dbo.ProjectBillCosts(ProjectID,BillID,EstimateLineItemID,Description,CostDate,Quantity,UnitName,UnitCost,FreightAmount,TaxAmount,Amount,OrganizationID)
        VALUES(@project,@bill,@line,'Recorded cost','2042-01-02',8,@unit,100,0,0,800,@org);`);
    const costConflict=await changes.saveContractChange(projectContext,org,make("Deduction with recorded costs","Deduct",1,0,originalLine));
    await changes.transitionContractChange(projectContext,org,costConflict,1,"propose",user);
    await assert.rejects(()=>changes.transitionContractChange(projectContext,org,costConflict,2,"approve",user,"2042-01-02","Attempt"),/recorded costs/);
    assert.equal((await changes.getContractChanges(projectContext,org)).currentContract,1200);
    await tx.request().input("bill",sql.NChar(10),billId).query("DELETE dbo.ProjectBillCosts WHERE BillID=@bill; DELETE dbo.Bills WHERE id=@bill;");
    await assert.rejects(()=>changes.transitionContractChange(projectContext,org,co,2,"approve",user,"2042-01-02","Retry"),/unchanged/);
    state=await billing.getProjectBilling(projectId);
    await tx.request().input("id",sql.Int,projectId).query(`
      INSERT dbo.Customers(FirstName,OrganizationID) SELECT 'Contract client',OrganizationID FROM dbo.Projects WHERE ProjectID=@id;
      UPDATE dbo.Projects SET CustomerID=SCOPE_IDENTITY() WHERE ProjectID=@id;`);
    const invoiceId=await billing.issueProjectInvoice({projectId,requestId:randomUUID(),method:"Amount",showScopes:true,
      selections:[{unitId:state.units[0].unitId,scopeId:null,kind:"Amount",value:1100}],existingInvoiceId:null,
      invoiceNo:"",invoiceDate:new Date("2042-01-02"),dueDate:new Date("2042-02-02"),
      includeIncompleteWork:true,internalNotes:"Customer approved advance billing"});
    const deduction=await changes.saveContractChange(projectContext,org,make("Remove remaining","Deduct",8,0,originalLine));
    await changes.transitionContractChange(projectContext,org,deduction,1,"propose",user);
    await assert.rejects(()=>changes.transitionContractChange(projectContext,org,deduction,2,"approve",user,"2042-01-03","Deduction request"),/invoiced/);
    assert.equal((await changes.getContractChanges(projectContext,org)).currentContract,1200);
    assert.equal((await billing.getProjectInvoiceBilling(projectId,invoiceId)).amount,1100);
    assert.equal((await estimates.getEstimateDetails(estimateId)).quotedTotal,1000);
    const scopedConflict=await changes.saveContractChange(projectContext,org,make("Scope balance conflict","Deduct",1,0,originalLine));
    await changes.transitionContractChange(projectContext,org,scopedConflict,1,"propose",user);
    await assert.rejects(()=>changes.transitionContractChange(projectContext,org,scopedConflict,2,"approve",user,"2042-01-03","Attempt"),/invoiced scope/);
    const afterConflict=await changes.getContractChanges(projectContext,org);
    assert.equal(afterConflict.currentContract,1200);
    assert.equal(afterConflict.changes.find(c=>c.changeId===scopedConflict).status,"Proposed");
    const permitted=await changes.saveContractChange(projectContext,org,make("Unbilled scope reduction","Deduct",0.5,0,originalLine));
    await changes.transitionContractChange(projectContext,org,permitted,1,"propose",user);
    await changes.transitionContractChange(projectContext,org,permitted,2,"approve",user,"2042-01-03","Approved remaining work reduction");
    const final=await changes.getContractChanges(projectContext,org);
    assert.equal(final.currentContract,1150);
    assert.equal(final.changes.find(c=>c.changeId===co).contractAfter,1200,"Earlier approval retains its original contract snapshot");
    assert.equal((await billing.getProjectInvoiceBilling(projectId,invoiceId)).amount,1100);
    // Trigger failures abort transactions; immutable direct-write assertions run last.
    const document=data.changes[0].documentEstimateId;
    await assert.rejects(()=>tx.request().input("id",sql.Int,document).query("UPDATE dbo.Estimates SET EstimateName='tampered' WHERE EstimateID=@id"),/immutable/);
  }finally{
    try{await tx.rollback();}catch(e){if(e.code!=="EABORT")throw e;}
    hooks.deregister();delete globalThis.contractTestDb;await pool.close();
  }
});
