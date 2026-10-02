import PDFDocument from "pdfkit";
import type { EstimateDetails } from "@/app/lib/estimates";
import { calculateEstimate } from "@/app/lib/estimate-pricing";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

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

      estimate.lines.forEach((line, index) => {
        const rowY = doc.y + 6;
        doc.fontSize(10).text(line.description, colX.description, rowY, { width: 230 });
        if (estimate.showQuantities) {
          doc.text(String(line.quantity), colX.qty, rowY);
          doc.text(line.unitName ?? "", colX.unit, rowY);
        }
        if (estimate.showLineTotals) {
          const sellAmount = pricing.lines[index]?.sellAmount ?? 0;
          doc.text(money(sellAmount), colX.total, rowY);
        }
        doc.moveDown(0.4);
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
