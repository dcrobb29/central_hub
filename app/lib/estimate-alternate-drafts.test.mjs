import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({resolve(specifier, context, next) {
  if (specifier.startsWith("./") && !/\.[a-z]+$/.test(specifier)) return next(`${specifier}.ts`, context);
  return next(specifier, context);
}});
const { draftAlternateSources, initialAlternateInputs } = await import("./estimate-alternate-drafts.ts");
const line = (draftLineId, scopeName, unitCost) => ({
  draftLineId, scopeName, description: `Work ${draftLineId}`, quantity: 10, unitCost, freightAmount: 0,
  lineMarkupPercent: 0, unitName: "EA", lineType: "Material",
});
const base = {
  markupMode: "perLine", estimateMarkupPercent: 0, taxPercent: 0, roundingIncrement: 0,
  groupingMode: "Scope", lines: [line(-1, "Base", 100), line(-2, "Other", 50)],
};
test("unsaved base lines expose separate contract-priced deduction sources without changing the bid", () => {
  const sources = draftAlternateSources(base);
  assert.deepEqual(sources.map(source => [source.lineId, source.sellAmount]), [[-1,1000],[-2,500]]);
  assert.equal(sources[0].remainingQuantity, 10);
  assert.equal(base.lines[0].quantity, 10);
});
test("deduction source values preserve rounded quote cents across grouped lines", () => {
  const sources = draftAlternateSources({...base, roundingIncrement:100, lines:[
    {...line(-1,"A",33.33),quantity:1}, {...line(-2,"A",33.33),quantity:1}, {...line(-3,"B",33.33),quantity:1},
  ]});
  assert.deepEqual(sources.map(source => source.sellAmount), [33.34,33.33,33.33]);
  assert.equal(sources.reduce((sum, source) => sum + Math.round(source.sellAmount*100), 0), 10000);
});
test("stable unsaved references survive line deletion and map to the correct saved position", () => {
  const draft={estimateName:"Deduction",lines:[{...line(-10," Alternate scope ",50),operation:"Deduct",deductLineId:-2,quantity:2}]};
  const [result] = initialAlternateInputs([draft],[base.lines[1]]);
  assert.equal(result.lines[0].deductLineIndex,0);
  assert.equal(result.lines[0].scopeName,"Alternate scope");
  assert.deepEqual(result.scopes,["Alternate scope"]);
});
test("deleting referenced base work blocks saving instead of deducting a different line", () => {
  const draft={lines:[{...base.lines[0],operation:"Deduct",deductLineId:-1}]};
  assert.throws(() => initialAlternateInputs([draft],[base.lines[1]]), /Alternate 1: choose an existing base-bid line/);
  const add={lines:[{...base.lines[0],operation:"Add",deductLineId:null}]};
  assert.equal(initialAlternateInputs([add],base.lines)[0].lines[0].deductLineIndex,null);
});
