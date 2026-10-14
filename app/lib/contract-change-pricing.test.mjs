import assert from "node:assert/strict";
import {test} from "node:test";
import {registerHooks} from "node:module";
registerHooks({resolve(specifier,context,next){
  if(specifier.startsWith("./")&&!/\.[a-z]+$/.test(specifier))return next(`${specifier}.ts`,context);
  return next(specifier,context);
}});
const {calculateChange}=await import("./contract-change-pricing.ts");
const line=(operation,unitCost)=>({operation,quantity:1,unitCost,freightAmount:0,lineMarkupPercent:0});
test("additions and deductions remain separate from the base bid",()=>{
  const input={markupMode:"perLine",estimateMarkupPercent:0,taxPercent:0,roundingIncrement:0,lines:[line("Add",300),line("Deduct",200)]};
  assert.equal(calculateChange(input).quotedTotal,100);
  assert.equal(calculateChange({...input,lines:[line("Deduct",200)]}).quotedTotal,-200);
  assert.equal(calculateChange({...input,lines:[line("Add",200),line("Deduct",200)]}).quotedTotal,0);
});
test("estimate markup applies once and costs are kept distinct from sales prices",()=>{
  const result=calculateChange({markupMode:"estimate",estimateMarkupPercent:10,taxPercent:5,roundingIncrement:0,
    lines:[{...line("Add",100),freightAmount:20,lineMarkupPercent:99}]});
  assert.equal(result.landedCostTotal,126);
  assert.equal(result.quotedTotal,138.6);
});
