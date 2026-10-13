import PDFDocument from "pdfkit";
import type { Invoice } from "@/app/lib/invoices";
import type { BillingInvoice } from "@/app/lib/project-billing";
import { renderCustomerNotes } from "@/app/lib/pdf-customer-notes";
import {
  type OrganizationInvoiceSettings,
  DEFAULT_INVOICE_SETTINGS,
} from "@/app/lib/invoice-settings";

export function renderProjectInvoicePdf(
  invoice: Invoice,
  billing: BillingInvoice,
  settings?: OrganizationInvoiceSettings | null
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const config: OrganizationInvoiceSettings = {
      organizationId: settings?.organizationId ?? 1,
      ...DEFAULT_INVOICE_SETTINGS,
      ...(settings ?? {}),
    };

    const style = config.templateStyle || "modern";
    const margin = style === "compact" ? 36 : 48;
    const accentColor = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(config.accentColor)
      ? config.accentColor
      : "#0284c7";

    const doc = new PDFDocument({
      margin,
      size: "LETTER",
      bufferPages: true,
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
    const contentWidth = doc.page.width - margin * 2;

    // Helper: Top decorative banner
    if (style === "modern") {
      doc.rect(0, 0, doc.page.width, 6).fill(accentColor);
      doc.y = margin;
    }

    // Company Header / Brand Block & Invoice Info
    const startY = doc.y;
    const colWidth = (contentWidth - 24) / 2;
    const rightColX = margin + colWidth + 24;

    // Left Column: Organization / Company Info
    doc.fillColor("#0f172a");
    const companyDisplayName = config.companyName || "Resolution";
    doc.font("Helvetica-Bold").fontSize(style === "compact" ? 14 : 16).text(companyDisplayName, margin, startY, {
      width: colWidth,
    });

    doc.font("Helvetica").fontSize(style === "compact" ? 8.5 : 9).fillColor("#475569");
    const companyLines = [
      config.companyAddressLine1,
      config.companyAddressLine2,
      [config.companyCity, config.companyState, config.companyZip].filter(Boolean).join(", "),
      config.companyPhone ? `Phone: ${config.companyPhone}` : null,
      config.companyEmail ? `Email: ${config.companyEmail}` : null,
      config.companyWebsite,
      config.taxNumber ? `Tax ID: ${config.taxNumber}` : null,
    ].filter(Boolean) as string[];

    for (const line of companyLines) {
      doc.text(line, margin, doc.y, { width: colWidth });
    }
    const leftColEndY = doc.y;

    // Right Column: Invoice Details
    doc.y = startY;
    const invoiceTitleText = config.invoiceTitle?.trim() || "INVOICE";
    doc.font("Helvetica-Bold").fontSize(style === "compact" ? 18 : 22).fillColor(accentColor)
      .text(invoiceTitleText, rightColX, doc.y, { width: colWidth, align: "right" });

    doc.font("Helvetica-Bold").fontSize(style === "compact" ? 11 : 12).fillColor("#0f172a")
      .text(`Invoice ${invoice.invoiceNo}`, rightColX, doc.y, { width: colWidth, align: "right" });

    doc.font("Helvetica").fontSize(style === "compact" ? 8.5 : 9).fillColor("#475569");
    doc.text(`Invoice date: ${invoice.invoiceDate}`, rightColX, doc.y, { width: colWidth, align: "right" });
    doc.text(`Due: ${invoice.invoiceDueDate}`, rightColX, doc.y, { width: colWidth, align: "right" });
    if (config.paymentTerms) {
      doc.text(`Payment terms: ${config.paymentTerms}`, rightColX, doc.y, { width: colWidth, align: "right" });
    }
    const rightColEndY = doc.y;

    // Align below top header
    doc.y = Math.max(leftColEndY, rightColEndY) + (style === "compact" ? 10 : 16);

    // Accent line divider
    if (style === "classic") {
      doc.rect(margin, doc.y, contentWidth, 1.5).fill(accentColor);
      doc.y += 10;
    } else if (style === "modern") {
      doc.rect(margin, doc.y, contentWidth, 1).fill("#e2e8f0");
      doc.y += 12;
    } else if (style === "minimal") {
      doc.rect(margin, doc.y, contentWidth, 0.5).fill("#cbd5e1");
      doc.y += 12;
    } else {
      doc.rect(margin, doc.y, contentWidth, 0.75).fill("#e2e8f0");
      doc.y += 8;
    }

    // Project Name Section (if enabled and present)
    if (config.showProjectName !== false && invoice.projectName) {
      doc.font("Helvetica-Bold").fontSize(style === "compact" ? 9.5 : 10.5).fillColor("#0f172a")
        .text(`Project: ${invoice.projectName}`, margin, doc.y, { width: contentWidth });
      doc.moveDown(0.5);
    }

    // Bill To & Ship To Sections (Two-column layout)
    const billToStartY = doc.y;
    doc.font("Helvetica-Bold").fontSize(style === "compact" ? 10 : 11).fillColor("#0f172a")
      .text("Bill to", margin, billToStartY, { width: colWidth });
    doc.font("Helvetica").fontSize(style === "compact" ? 8.5 : 9.5).fillColor("#334155");

    const billToLines = [
      invoice.companyName,
      [invoice.firstName, invoice.lastName].filter(Boolean).join(" "),
      invoice.billingAddressLine1,
      invoice.billingAddressLine2,
      [invoice.billingAddressCity, invoice.billingAddressState, invoice.billingAddressZip].filter(Boolean).join(", "),
    ].filter(Boolean) as string[];

    for (const line of billToLines) {
      doc.text(line, margin, doc.y, { width: colWidth });
    }
    const billToEndY = doc.y;

    // Ship To (if enabled and present)
    let shipToEndY = billToStartY;
    const hasShipping = Boolean(
      config.showShippingAddress !== false &&
      [invoice.shippingAddressLine1, invoice.shippingAddressCity, invoice.shippingAddressZip].some(Boolean)
    );

    if (hasShipping) {
      doc.y = billToStartY;
      doc.font("Helvetica-Bold").fontSize(style === "compact" ? 10 : 11).fillColor("#0f172a")
        .text("Ship to", rightColX, billToStartY, { width: colWidth });
      doc.font("Helvetica").fontSize(style === "compact" ? 8.5 : 9.5).fillColor("#334155");

      const shipToLines = [
        invoice.shippingAddressLine1,
        invoice.shippingAddressLine2,
        [invoice.shippingAddressCity, invoice.shippingAddressState, invoice.shippingAddressZip].filter(Boolean).join(", "),
      ].filter(Boolean) as string[];

      for (const line of shipToLines) {
        doc.text(line, rightColX, doc.y, { width: colWidth });
      }
      shipToEndY = doc.y;
    }

    doc.y = Math.max(billToEndY, shipToEndY) + (style === "compact" ? 12 : 18);

    // Work Invoiced / Allocations Section
    const shouldShowScopes = billing.showScopes && config.showItemizedScopes !== false;
    if (shouldShowScopes) {
      if (doc.y > doc.page.height - margin - 80) doc.addPage();

      doc.font("Helvetica-Bold").fontSize(style === "compact" ? 10.5 : 12).fillColor("#0f172a")
        .text("Work invoiced", margin, doc.y, { width: contentWidth });
      doc.moveDown(0.3);

      // Table Header Row
      const tableTop = doc.y;
      if (style === "modern") {
        doc.rect(margin, tableTop, contentWidth, 18).fill("#f1f5f9");
      }
      doc.font("Helvetica-Bold").fontSize(style === "compact" ? 8 : 9).fillColor("#475569");
      const amountColWidth = 100;
      const descColWidth = contentWidth - amountColWidth;

      doc.text("Description / Scope", margin + 6, tableTop + 4, { width: descColWidth - 12 });
      doc.text("Amount", margin + descColWidth, tableTop + 4, { width: amountColWidth - 6, align: "right" });
      doc.y = tableTop + (style === "modern" ? 22 : 18);

      // Line items
      doc.font("Helvetica").fontSize(style === "compact" ? 8.5 : 9.5).fillColor("#1e293b");
      let rowIndex = 0;
      for (const allocation of billing.allocations) {
        if (doc.y > doc.page.height - margin - 40) {
          doc.addPage();
        }

        const rowY = doc.y;
        if (style === "modern" && rowIndex % 2 === 1) {
          doc.rect(margin, rowY - 2, contentWidth, 16).fill("#f8fafc");
          doc.fillColor("#1e293b");
        }

        const datePrefix = allocation.visitDate ? `${allocation.visitDate} - ` : "";
        const descText = `${datePrefix}${allocation.scopeName}`;
        const amountText = money.format(allocation.amount);

        doc.text(
          `${descText}: ${amountText}`,
          margin + 6,
          rowY,
          { width: contentWidth - 12 }
        );
        doc.y += (style === "compact" ? 13 : 16);
        rowIndex++;
      }
      doc.moveDown(0.5);
    }

    // Customer Notes
    renderCustomerNotes(doc, invoice.customerNotes);

    // Payment Instructions / Remittance
    if (config.paymentInstructions?.trim()) {
      if (doc.y > doc.page.height - margin - 60) doc.addPage();
      doc.moveDown(0.8);
      doc.font("Helvetica-Bold").fontSize(style === "compact" ? 9 : 10).fillColor("#0f172a")
        .text("Payment instructions", margin, doc.y, { width: contentWidth });
      doc.moveDown(0.3);
      doc.font("Helvetica").fontSize(style === "compact" ? 8 : 8.5).fillColor("#475569")
        .text(config.paymentInstructions.trim(), margin, doc.y, { width: contentWidth });
    }

    // Default Customer Appreciation Notes (if present and not duplicate)
    if (config.defaultCustomerNotes?.trim() && config.defaultCustomerNotes !== invoice.customerNotes) {
      if (doc.y > doc.page.height - margin - 45) doc.addPage();
      doc.moveDown(0.6);
      doc.font("Helvetica-Oblique").fontSize(style === "compact" ? 8 : 8.5).fillColor("#64748b")
        .text(config.defaultCustomerNotes.trim(), margin, doc.y, { width: contentWidth });
    }

    // Invoice Total Block
    if (doc.y > doc.page.height - margin - 50) doc.addPage();
    doc.moveDown(0.8);

    const totalAmount = money.format(billing.amount ?? 0);
    const totalBoxY = doc.y;
    const totalBoxWidth = 220;
    const totalBoxX = margin + contentWidth - totalBoxWidth;

    if (style === "modern") {
      doc.rect(totalBoxX, totalBoxY, totalBoxWidth, 32).fillAndStroke("#f0fdf4", accentColor);
      doc.font("Helvetica-Bold").fontSize(15).fillColor(accentColor)
        .text(`Invoice total: ${totalAmount}`, totalBoxX + 10, totalBoxY + 8, {
          width: totalBoxWidth - 20,
          align: "right",
        });
      doc.y = totalBoxY + 38;
    } else if (style === "classic") {
      doc.rect(totalBoxX, totalBoxY, totalBoxWidth, 1).fill("#94a3b8");
      doc.rect(totalBoxX, totalBoxY + 28, totalBoxWidth, 1.5).fill("#0f172a");
      doc.font("Helvetica-Bold").fontSize(15).fillColor("#0f172a")
        .text(`Invoice total: ${totalAmount}`, totalBoxX, totalBoxY + 6, {
          width: totalBoxWidth,
          align: "right",
        });
      doc.y = totalBoxY + 36;
    } else {
      doc.font("Helvetica-Bold").fontSize(style === "compact" ? 13 : 15).fillColor("#0f172a")
        .text(`Invoice total: ${totalAmount}`, margin, totalBoxY, {
          width: contentWidth,
          align: "right",
        });
      doc.y = totalBoxY + 28;
    }

    // Add page numbers on all pages
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const footerY = doc.page.height - margin + (style === "compact" ? 14 : 20);
      doc.font("Helvetica").fontSize(8).fillColor("#94a3b8")
        .text(
          `Page ${i + 1} of ${range.count}`,
          margin,
          footerY,
          { width: contentWidth, align: "center" }
        );
    }

    doc.end();
  });
}
