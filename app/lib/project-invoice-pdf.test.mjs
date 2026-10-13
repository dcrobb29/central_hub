import assert from "node:assert/strict";
import { test } from "node:test";
import { inflateSync } from "node:zlib";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/app/lib/")) return nextResolve(new URL(`./${specifier.slice("@/app/lib/".length)}.ts`, import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
});
const { renderProjectInvoicePdf } = await import("./project-invoice-pdf.ts");

function pdfText(pdf) {
  let text="";
  for(const match of pdf.toString("latin1").matchAll(/<<[^]*?\/Filter \/FlateDecode[^]*?>>\s*stream\r?\n([^]*?)\r?\nendstream/g)) {
    const stream=inflateSync(Buffer.from(match[1],"latin1")).toString("latin1");
    for(const encoded of stream.matchAll(/<([0-9a-f]+)>/gi)) text+=Buffer.from(encoded[1],"hex").toString("latin1");
  }
  return text;
}
const invoice={invoiceNo:"PDFTEST",projectName:"Invoice project",invoiceDate:"2026-10-12",invoiceDueDate:"2026-11-12",
  firstName:"Jane",lastName:"Doe",companyName:null,billingAddressLine1:"BILLINGSNAPSHOT",shippingAddressLine1:"SHIPPINGSNAPSHOT"};
const billing={amount:125,showScopes:true,allocations:[{scopeName:"SCOPEMARKER",visitDate:"2026-10-12",amount:125}]};
test("invoice PDF includes saved contacts/addresses and selected scopes",async()=>{
  const pdf=await renderProjectInvoicePdf(invoice,billing);
  assert.ok(pdf.toString("ascii",0,5)==="%PDF-");
  const text=pdfText(pdf);
  for(const marker of ["PDFTEST","Jane Doe","BILLINGSNAPSHOT","SHIPPINGSNAPSHOT","SCOPEMARKER","2026-10-12","$125.00"]) assert.ok(text.includes(marker));
});
test("summary-only invoice hides scope names and amounts but retains the final total",async()=>{
  const text=pdfText(await renderProjectInvoicePdf(invoice,{...billing,showScopes:false}));
  assert.ok(!text.includes("SCOPEMARKER"));
  assert.ok(!text.includes("Work invoiced"));
  assert.ok(text.includes("Invoice total: $125.00"));
});
test("large scope invoice paginates without losing final scope or total",async()=>{
  const scopes=Array.from({length:150},(_,index)=>({scopeName:`SCOPE${index}END`,visitDate:"2026-10-12",amount:1}));
  const pdf=await renderProjectInvoicePdf(invoice,{...billing,amount:150,allocations:scopes});
  assert.ok(pdfText(pdf).includes("SCOPE149END"));
  assert.ok(pdfText(pdf).includes("Invoice total: $150.00"));
  assert.ok((pdf.toString("latin1").match(/\/Type \/Page\b/g)?.length??0)>1);
});
test("invoice notes use public-only rendering in detailed and summary PDFs",async()=>{
  for (const showScopes of [true,false]) {
    const text=pdfText(await renderProjectInvoicePdf({...invoice,internalNotes:"PRIVATEINVOICEMARKER",customerNotes:"PUBLICINVOICEMARKER\nCustomer access instructions"},
      {...billing,showScopes,overrideReason:"PRIVATEOVERRIDEMARKER"}));
    assert.ok(text.includes("PUBLICINVOICEMARKER"));
    assert.ok(!text.includes("PRIVATEINVOICEMARKER"));
    assert.ok(!text.includes("PRIVATEOVERRIDEMARKER"));
  }
});
test("multiline customer invoice notes paginate and retain final total",async()=>{
  const customerNotes=Array.from({length:100},(_,index)=>`Note line ${index}`).join("\n")+"\nLASTCUSTOMERNOTE";
  const pdf=await renderProjectInvoicePdf({...invoice,customerNotes,internalNotes:"NEVERPUBLIC"},{...billing,showScopes:false});
  const text=pdfText(pdf);
  assert.ok(text.includes("LASTCUSTOMERNOTE")); assert.ok(text.includes("Invoice total: $125.00"));
  assert.ok(!text.includes("NEVERPUBLIC"));
});
