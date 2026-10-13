import PDFDocument from "pdfkit";
import type { Invoice } from "@/app/lib/invoices";
import type { BillingInvoice } from "@/app/lib/project-billing";
import { renderCustomerNotes } from "@/app/lib/pdf-customer-notes";

export function renderProjectInvoicePdf(invoice: Invoice, billing: BillingInvoice): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
    doc.fontSize(22).text(`Invoice ${invoice.invoiceNo}`);
    doc.moveDown().fontSize(11).text(`Project: ${invoice.projectName ?? ""}`);
    doc.text(`Invoice date: ${invoice.invoiceDate}    Due: ${invoice.invoiceDueDate}`);
    doc.moveDown().font("Helvetica-Bold").text("Bill to");
    doc.font("Helvetica");
    for (const value of [
      invoice.companyName, [invoice.firstName, invoice.lastName].filter(Boolean).join(" "),
      invoice.billingAddressLine1, invoice.billingAddressLine2,
      [invoice.billingAddressCity, invoice.billingAddressState, invoice.billingAddressZip].filter(Boolean).join(", "),
    ]) if (value) doc.text(value);
    if ([invoice.shippingAddressLine1, invoice.shippingAddressCity, invoice.shippingAddressZip].some(Boolean)) {
      doc.moveDown().font("Helvetica-Bold").text("Ship to").font("Helvetica");
      for (const value of [invoice.shippingAddressLine1, invoice.shippingAddressLine2,
        [invoice.shippingAddressCity, invoice.shippingAddressState, invoice.shippingAddressZip].filter(Boolean).join(", ")]) {
        if (value) doc.text(value);
      }
    }
    doc.moveDown();
    if (billing.showScopes) {
      doc.font("Helvetica-Bold").text("Work invoiced").font("Helvetica");
      for (const allocation of billing.allocations) {
        doc.text(`${allocation.visitDate ? `${allocation.visitDate} - ` : ""}${allocation.scopeName}: ${money.format(allocation.amount)}`);
      }
    }
    renderCustomerNotes(doc, invoice.customerNotes);
    doc.moveDown().font("Helvetica-Bold").fontSize(16).text(`Invoice total: ${money.format(billing.amount ?? 0)}`);
    doc.end();
  });
}
