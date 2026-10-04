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

const { renderEstimatePdf } = await import("./estimate-pdf.ts");

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
