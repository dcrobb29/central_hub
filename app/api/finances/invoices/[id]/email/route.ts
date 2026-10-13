import { NextRequest, NextResponse } from "next/server";
import { getInvoices } from "@/app/lib/invoices";
import { getProjectInvoiceBilling } from "@/app/lib/project-billing";
import { renderProjectInvoicePdf } from "@/app/lib/project-invoice-pdf";
import { getCustomers } from "@/app/lib/customers";
import { sendEmail } from "@/app/lib/email";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647) {
    return NextResponse.json({ error: "Invalid invoice ID" }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const overrideEmail = typeof body?.recipientEmail === "string" && body.recipientEmail.trim() ? body.recipientEmail.trim() : null;

    const invoices = await getInvoices(id);
    const invoice = invoices[0];
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Determine recipient email
    let recipientEmail = overrideEmail;
    let customerName = [invoice.firstName, invoice.lastName].filter(Boolean).join(" ") || invoice.companyName || "Valued Customer";

    if (!recipientEmail && invoice.customerId) {
      const customers = await getCustomers();
      const customer = customers.find((c) => c.customerId === invoice.customerId);
      if (customer?.email) {
        recipientEmail = customer.email;
        if (customer.firstName || customer.lastName) {
          customerName = [customer.firstName, customer.lastName].filter(Boolean).join(" ");
        } else if (customer.companyName) {
          customerName = customer.companyName;
        }
      }
    }

    if (!recipientEmail) {
      return NextResponse.json(
        { error: "No customer email address on file. Please enter an email address." },
        { status: 400 }
      );
    }

    // Basic email format validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    // Render invoice PDF
    let pdfBuffer: Buffer;
    if (invoice.projectId && invoice.billingManaged) {
      const billing = await getProjectInvoiceBilling(invoice.projectId, id);
      if (!billing || billing.amount === null) {
        return NextResponse.json({ error: "Invoice billing details are unavailable" }, { status: 409 });
      }
      pdfBuffer = await renderProjectInvoicePdf(invoice, billing);
    } else {
      // Standalone manual invoice PDF render
      const standaloneBilling = {
        invoiceId: invoice.id,
        invoiceNo: invoice.invoiceNo,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.invoiceDueDate,
        amount: invoice.invoiceAmount ? parseFloat(invoice.invoiceAmount) : 0,
        managed: false,
        showScopes: false,
        allocations: [],
        internalNotes: invoice.internalNotes,
        customerNotes: invoice.customerNotes,
        includesIncompleteWork: false,
        overrideReason: null,
      };
      pdfBuffer = await renderProjectInvoicePdf(invoice, standaloneBilling);
    }

    const cleanInvoiceNo = invoice.invoiceNo.trim();
    const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
    const formattedAmount = invoice.invoiceAmount ? money.format(Number(invoice.invoiceAmount)) : "$0.00";

    const subject = `Invoice ${cleanInvoiceNo} from Resolution${invoice.projectName ? ` - ${invoice.projectName}` : ""}`;
    const textBody = `Hello ${customerName},

Please find attached Invoice ${cleanInvoiceNo} for ${formattedAmount}.
${invoice.projectName ? `Project: ${invoice.projectName}\n` : ""}
Due date: ${invoice.invoiceDueDate}

${invoice.customerNotes ? `Notes:\n${invoice.customerNotes}\n\n` : ""}Thank you for your business!

Sincerely,
Resolution Billing Team`;

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b;">
        <h2 style="color: #0f172a; margin-bottom: 8px;">Invoice ${cleanInvoiceNo}</h2>
        <p style="font-size: 16px; line-height: 1.5;">Hello <strong>${customerName}</strong>,</p>
        <p style="font-size: 15px; line-height: 1.5;">Please find attached your invoice for <strong>${formattedAmount}</strong>.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #f8fafc; border-radius: 8px; padding: 12px;">
          <tr>
            <td style="padding: 8px 12px; color: #64748b; font-size: 14px;"><strong>Invoice Number:</strong></td>
            <td style="padding: 8px 12px; font-size: 14px;">${cleanInvoiceNo}</td>
          </tr>
          ${invoice.projectName ? `
          <tr>
            <td style="padding: 8px 12px; color: #64748b; font-size: 14px;"><strong>Project:</strong></td>
            <td style="padding: 8px 12px; font-size: 14px;">${invoice.projectName}</td>
          </tr>` : ""}
          <tr>
            <td style="padding: 8px 12px; color: #64748b; font-size: 14px;"><strong>Invoice Date:</strong></td>
            <td style="padding: 8px 12px; font-size: 14px;">${invoice.invoiceDate}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; color: #64748b; font-size: 14px;"><strong>Due Date:</strong></td>
            <td style="padding: 8px 12px; font-size: 14px;">${invoice.invoiceDueDate}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; color: #64748b; font-size: 14px;"><strong>Total Amount:</strong></td>
            <td style="padding: 8px 12px; font-size: 16px; font-weight: bold; color: #0284c7;">${formattedAmount}</td>
          </tr>
        </table>

        ${invoice.customerNotes ? `
        <div style="background: #f1f5f9; padding: 12px 16px; border-left: 4px solid #0284c7; margin: 16px 0; border-radius: 4px;">
          <p style="margin: 0; font-size: 14px; color: #334155;"><strong>Note:</strong> ${invoice.customerNotes}</p>
        </div>` : ""}

        <p style="font-size: 14px; color: #64748b; margin-top: 24px;">A PDF copy of this invoice has been attached to this email.</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 13px; color: #94a3b8;">Thank you for your business!<br/><strong>Resolution Team</strong></p>
      </div>
    `;

    const sendResult = await sendEmail({
      to: recipientEmail,
      subject,
      text: textBody,
      html: htmlBody,
      attachments: [
        {
          filename: `Invoice-${cleanInvoiceNo}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    if (!sendResult.success) {
      return NextResponse.json(
        { error: sendResult.error || "Failed to dispatch email" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      recipientEmail,
      messageId: sendResult.messageId,
      simulated: sendResult.simulated ?? false,
    });
  } catch (error) {
    console.error("Invoice email delivery endpoint failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to send invoice email" },
      { status: 500 }
    );
  }
}
