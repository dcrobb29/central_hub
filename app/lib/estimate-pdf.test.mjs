import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { inflateSync } from "node:zlib";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/app/lib/")) {
      return nextResolve(new URL(`./${specifier.slice("@/app/lib/".length)}.ts`, import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const { renderEstimatePdf, includeAlternateInEstimatePdf } = await import("./estimate-pdf.ts");

function pdfText(pdf) {
  const source = pdf.toString("latin1");
  let text = "";
  for (const match of source.matchAll(/<<[^]*?\/Filter \/FlateDecode[^]*?>>\s*stream\r?\n([^]*?)\r?\nendstream/g)) {
    const stream = inflateSync(Buffer.from(match[1], "latin1")).toString("latin1");
    for (const encoded of stream.matchAll(/<([0-9a-f]+)>/gi)) {
      text += Buffer.from(encoded[1], "hex").toString("latin1");
    }
  }
  return text;
}

function estimate(overrides = {}) {
  return {
    estimateName: "PDF notes test",
    customerName: null,
    createdAt: "2026-10-04T12:00:00",
    internalNotes: "PRIVATEINTERNALMARKER",
    customerNotes: "CUSTOMERNOTESMARKER\nProject clarification",
    markupMode: "perLine",
    estimateMarkupPercent: 0,
    taxPercent: 0,
    roundingIncrement: 0,
    groupingMode: "None",
    showQuantities: false,
    showLineTotals: false,
    showSummaryTotal: false,
    showScopesOfWork: false,
    showAlternates: true,
    lines: [],
    scopes: [],
    ...overrides,
  };
}

test("PDF includes customer notes but never internal notes with all display options disabled", async () => {
  const text = pdfText(await renderEstimatePdf(estimate()));
  assert.ok(text.includes("CUSTOMERNOTESMARKER"));
  assert.ok(text.includes("Project clarification"));
  assert.ok(!text.includes("PRIVATEINTERNALMARKER"));
});

test("PDF excludes internal notes when customer notes are absent or blank", async () => {
  for (const customerNotes of [null, "", "   "]) {
    const text = pdfText(await renderEstimatePdf(estimate({ customerNotes })));
    assert.ok(text.includes("PDF notes test"));
    assert.ok(!text.includes("PRIVATEINTERNALMARKER"));
    assert.ok(!text.includes("Notes"));
  }
});

test("long customer notes paginate without losing text or exposing internal notes", async () => {
  const customerNotes = `${"Customer clarification\n".repeat(170)}FINALCUSTOMERMARKER`;
  assert.ok(customerNotes.length <= 4000);
  const pdf = await renderEstimatePdf(estimate({ customerNotes, showSummaryTotal: true }));
  const text = pdfText(pdf);
  assert.ok(text.includes("FINALCUSTOMERMARKER"));
  assert.equal(text.match(/Customer clarification/g)?.length, 170);
  assert.ok(!text.includes("PRIVATEINTERNALMARKER"));
  assert.ok((pdf.toString("latin1").match(/\/Type \/Page\b/g)?.length ?? 0) > 1);
});
test("alternates appear separately without changing the base bid total",async()=>{
  const base=estimate({showSummaryTotal:true,lines:[{
    quantity:1,unitCost:1000,freightAmount:0,lineMarkupPercent:0,description:"Base work",
  }]});
  const text=pdfText(await renderEstimatePdf(base,[
    {code:"ALT-000001",title:"Upgrade",status:"Proposed",value:300,notes:"Customer-facing upgrade",lines:[]},
    {code:"ALT-000002",title:"Downgrade",status:"Proposed",value:-200,notes:null,lines:[]},
  ]));
  assert.ok(text.includes("Total: $1,000.00"));
  assert.ok(text.includes("$300.00"));
  assert.ok(text.includes("-$200.00"));
  assert.ok(text.includes("Alternates (not included in base bid)"));
  assert.ok(!text.includes("PRIVATEINTERNALMARKER"));
});
test("PDF includes draft alternates but excludes rejected alternates and change orders",()=>{
  for(const status of ["Draft","Proposed","Approved"])assert.equal(includeAlternateInEstimatePdf({kind:"Alternate",status}),true);
  assert.equal(includeAlternateInEstimatePdf({kind:"Alternate",status:"Rejected"}),false);
  for(const status of ["Draft","Proposed","Approved","Rejected"])
    assert.equal(includeAlternateInEstimatePdf({kind:"ChangeOrder",status}),false);
});
test("draft alternates follow the base total before job notes without changing proposed pricing",async()=>{
  const base=estimate({showSummaryTotal:true,customerNotes:"BASECUSTOMERNOTESMARKER",lines:[
    {quantity:1,unitCost:1000,freightAmount:0,lineMarkupPercent:0,description:"Base work"},
  ]});
  const text=pdfText(await renderEstimatePdf(base,[
    {code:"ALT-000001",title:"Upgrade draft",status:"Draft",value:300,notes:null,lines:[]},
    {code:"ALT-000002",title:"Removal draft",status:"Draft",value:-200,notes:null,lines:[]},
  ]));
  assert.ok(text.indexOf("Total: $1,000.00")<text.indexOf("Alternates (not included in base bid)"));
  assert.ok(text.indexOf("Alternates (not included in base bid)")<text.indexOf("Upgrade draft"));
  assert.ok(text.indexOf("Removal draft")<text.indexOf("BASECUSTOMERNOTESMARKER"));
  assert.ok(text.includes("$300.00"));
  assert.ok(text.includes("-$200.00"));
  assert.ok(!text.includes("$1,100.00"));
});
test("alternates toggle hides the whole section without affecting the base bid",async()=>{
  const base=estimate({showSummaryTotal:true,showAlternates:false,lines:[
    {quantity:1,unitCost:1000,freightAmount:0,lineMarkupPercent:0,description:"Base work"},
  ]});
  const text=pdfText(await renderEstimatePdf(base,[{code:"ALT-000001",title:"OPTIONMARKER",status:"Proposed",
    value:300,notes:"OPTIONNOTESMARKER",lines:[{description:"OPTIONLINEMARKER",quantity:7,unitName:"each",operation:"Add",sellAmount:300,scopeName:"Option scope"}]}]));
  assert.ok(text.includes("Total: $1,000.00"));
  for(const marker of ["Alternates","OPTIONMARKER","OPTIONNOTESMARKER","OPTIONLINEMARKER","$300.00"])assert.ok(!text.includes(marker));
});
test("alternate scopes print alongside the base with signed frozen sell prices and shared detail toggles",async()=>{
  const alternates=[{code:"ALT-000001",title:"Upgrade",status:"Approved",value:100,notes:"OPTIONNOTESMARKER",
    lines:[
      {description:"ADDWORKMARKER",quantity:7,unitName:"UNIQUEUNIT",operation:"Add",sellAmount:300,scopeName:"OPTIONSCOPEMARKER",unitCost:12345},
      {description:"DEDUCTWORKMARKER",quantity:2,unitName:"UNIQUEUNIT",operation:"Deduct",sellAmount:200,scopeName:"OPTIONSCOPEMARKER",unitCost:54321},
    ]}];
  const full=pdfText(await renderEstimatePdf(estimate({showQuantities:true,showLineTotals:true,showScopesOfWork:true}),alternates));
  for(const marker of ["ADDWORKMARKER","DEDUCTWORKMARKER","OPTIONSCOPEMARKER","OPTIONNOTESMARKER","UNIQUEUNIT","$300.00","-$200.00"])assert.ok(full.includes(marker),marker);
  for(const marker of ["12345","54321","PRIVATEINTERNALMARKER"])assert.ok(!full.includes(marker));
  const minimal=pdfText(await renderEstimatePdf(estimate(),alternates));
  for(const marker of ["ADDWORKMARKER","DEDUCTWORKMARKER","OPTIONNOTESMARKER","$100.00"])assert.ok(minimal.includes(marker));
  for(const marker of ["OPTIONSCOPEMARKER","UNIQUEUNIT","$300.00","-$200.00"])assert.ok(!minimal.includes(marker));
});
