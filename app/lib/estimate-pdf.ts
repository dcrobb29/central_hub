import PDFDocument from "pdfkit";
import type { EstimateDetails, EstimateLine } from "@/app/lib/estimates";
import { calculateEstimate } from "@/app/lib/estimate-pricing";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

const LINE_TYPE_LABELS: Record<EstimateLine["lineType"], string> = {
  Material: "Materials",
  Labor: "Labor",
  Equipment: "Equipment",
};

type LineGroup = {
  title: string | null;
  indexes: number[];
};

// Customer-facing export: never includes tax or freight breakdown, only sell prices/total.
export function renderEstimatePdf(estimate: EstimateDetails): Promise<Buffer> {
  const pricing = calculateEstimate({
    markupMode: estimate.markupMode,
    estimateMarkupPercent: estimate.estimateMarkupPercent,
    taxPercent: estimate.taxPercent,
    roundingIncrement: estimate.roundingIncrement,
    lines: estimate.lines,
  });

  // Quantity and unit always travel together as one toggle — a unit alone isn't useful.
  const showLineItems = estimate.showQuantities || estimate.showLineTotals;

  // Scope visibility is its own toggle (internal grouping can stay invisible to the customer);
  // type grouping is inherent to the chosen grouping mode and always renders when selected.
  const groups: LineGroup[] = [];
  if (estimate.groupingMode === "Scope" && estimate.showScopesOfWork) {
    const orderedScopes = [...estimate.scopes].sort((a, b) => a.sortOrder - b.sortOrder);
    for (const scope of orderedScopes) {
      const indexes = estimate.lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => line.estimateScopeOfWorkId === scope.estimateScopeOfWorkId)
        .map(({ index }) => index);
      if (indexes.length > 0) groups.push({ title: scope.scopeName, indexes });
    }
    const ungroupedIndexes = estimate.lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.estimateScopeOfWorkId === null)
      .map(({ index }) => index);
    if (ungroupedIndexes.length > 0) groups.push({ title: "Ungrouped", indexes: ungroupedIndexes });
  } else if (estimate.groupingMode === "Type") {
    (["Material", "Labor", "Equipment"] as const).forEach((lineType) => {
      const indexes = estimate.lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => line.lineType === lineType)
        .map(({ index }) => index);
      if (indexes.length > 0) groups.push({ title: LINE_TYPE_LABELS[lineType], indexes });
    });
  } else {
    groups.push({ title: null, indexes: estimate.lines.map((_, index) => index) });
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 54 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).text(estimate.estimateName, { continued: false });
    if (estimate.customerName) {
      doc.fontSize(11).fillColor("#555555").text(`Prepared for ${estimate.customerName}`);
    }
    doc.fillColor("#000000").fontSize(10).text(`Date: ${new Date(estimate.createdAt).toLocaleDateString()}`);
    doc.moveDown(1.2);

    if (showLineItems) {
      const colX = { description: 54, qty: 300, unit: 350, total: 420 };

      const renderColumnHeader = () => {
        doc.fontSize(10).font("Helvetica-Bold");
        doc.text("Description", colX.description, doc.y, { continued: false });
        if (estimate.showQuantities) {
          doc.text("Qty", colX.qty, doc.y - 12);
          doc.text("Unit", colX.unit, doc.y - 12);
        }
        if (estimate.showLineTotals) {
          doc.text("Amount", colX.total, doc.y - 12);
        }
        doc.moveDown(0.3);
        doc.moveTo(54, doc.y).lineTo(558, doc.y).strokeColor("#cccccc").stroke();
        doc.font("Helvetica");
      };

      renderColumnHeader();

      groups.forEach((group) => {
        if (group.title !== null) {
          doc.moveDown(0.3);
          doc.fontSize(11).font("Helvetica-Bold").fillColor("#000000").text(group.title, colX.description, doc.y);
          doc.font("Helvetica");
          doc.moveDown(0.1);
        }

        let groupTotal = 0;
        group.indexes.forEach((index) => {
          const line = estimate.lines[index];
          const rowY = doc.y + 6;
          doc.fontSize(10).text(line.description, colX.description, rowY, { width: 230 });
          if (estimate.showQuantities) {
            doc.text(String(line.quantity), colX.qty, rowY);
            doc.text(line.unitName ?? "", colX.unit, rowY);
          }
          const sellAmount = pricing.lines[index]?.sellAmount ?? 0;
          groupTotal += sellAmount;
          if (estimate.showLineTotals) {
            doc.text(money(sellAmount), colX.total, rowY);
          }
          doc.moveDown(0.4);
        });

        if (group.title !== null && estimate.showLineTotals) {
          doc.fontSize(10).font("Helvetica-Bold").text(`Subtotal: ${money(groupTotal)}`, colX.description, doc.y, {
            width: 504,
            align: "right",
          });
          doc.font("Helvetica");
          doc.moveDown(0.3);
        }
      });

      doc.moveDown(0.6);
      doc.moveTo(54, doc.y).lineTo(558, doc.y).strokeColor("#cccccc").stroke();
      doc.moveDown(0.4);
    }

    if (estimate.showSummaryTotal) {
      doc.moveDown(showLineItems ? 0.2 : 2);
      doc.fontSize(14).font("Helvetica-Bold").text(`Total: ${money(pricing.quotedTotal)}`, { align: "right" });
      doc.font("Helvetica");
    }

    doc.end();
  });
}
