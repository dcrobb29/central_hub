import type PDFDocument from "pdfkit";

export function renderCustomerNotes(doc: InstanceType<typeof PDFDocument>, customerNotes: string | null | undefined) {
  if (!customerNotes?.trim()) return;
  doc.moveDown(1);
  if (doc.y > doc.page.height - doc.page.margins.bottom - 50) doc.addPage();
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  doc.fillColor("#000000").font("Helvetica-Bold").fontSize(11)
    .text("Notes", left, doc.y, { width, align: "left" });
  doc.moveDown(0.4);
  doc.font("Helvetica").fontSize(10).text(customerNotes, left, doc.y, { width, align: "left" });
}
