import { NextRequest, NextResponse } from "next/server";
import { getInvoices, recordInvoiceEmailed } from "@/app/lib/invoices";
import { getProjectInvoiceBilling } from "@/app/lib/project-billing";
import { renderProjectInvoicePdf } from "@/app/lib/project-invoice-pdf";
import { getCustomers } from "@/app/lib/customers";
import { sendEmail } from "@/app/lib/email";
import { getActiveOrganizationId } from "@/app/lib/auth";
import {
  getOrganizationInvoiceSettings,
  interpolateEmailTemplate,
} from "@/app/lib/invoice-settings";

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
    const overrideSubject = typeof body?.subject === "string" && body.subject.trim() ? body.subject.trim() : null;
    const customMessage = typeof body?.customMessage === "string" && body.customMessage.trim() ? body.customMessage.trim() : null;

    const organizationId = await getActiveOrganizationId(request);
    const invoices = await getInvoices({ invoiceId: id, organizationId });
    const invoice = invoices[0];
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const orgSettings = await getOrganizationInvoiceSettings(invoice.organizationId).catch(() => null);
    const companyDisplayName = orgSettings?.companyName || "Resolution";
    const accentColor = orgSettings?.accentColor || "#0284c7";

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

    // Render invoice PDF with organization settings
    let pdfBuffer: Buffer;
    if (invoice.projectId && invoice.billingManaged) {
      const billing = await getProjectInvoiceBilling(invoice.projectId, id);
      if (!billing || billing.amount === null) {
        return NextResponse.json({ error: "Invoice billing details are unavailable" }, { status: 409 });
      }
      pdfBuffer = await renderProjectInvoicePdf(invoice, billing, orgSettings);
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
      pdfBuffer = await renderProjectInvoicePdf(invoice, standaloneBilling, orgSettings);
    }

    const cleanInvoiceNo = invoice.invoiceNo.trim();
    const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
    const formattedAmount = invoice.invoiceAmount ? money.format(Number(invoice.invoiceAmount)) : "$0.00";

    const templateVars: Record<string, string> = {
      invoiceNo: cleanInvoiceNo,
      companyName: companyDisplayName,
      projectName: invoice.projectName || "Standard Services",
      customerName,
      invoiceAmount: formattedAmount,
      amount: formattedAmount,
      dueDate: invoice.invoiceDueDate,
      invoiceDate: invoice.invoiceDate,
    };

    // Calculate subject
    const subject = overrideSubject || (orgSettings?.emailSubjectTemplate
      ? interpolateEmailTemplate(orgSettings.emailSubjectTemplate, templateVars)
      : `Invoice ${cleanInvoiceNo} from ${companyDisplayName}${invoice.projectName ? ` - ${invoice.projectName}` : ""}`);

    // Calculate body
    const baseBody = orgSettings?.emailBodyTemplate
      ? interpolateEmailTemplate(orgSettings.emailBodyTemplate, templateVars)
      : `Hello ${customerName},

Please find attached Invoice ${cleanInvoiceNo} for ${formattedAmount}.
${invoice.projectName ? `Project: ${invoice.projectName}\n` : ""}Due date: ${invoice.invoiceDueDate}

Thank you for your business!

Sincerely,
${companyDisplayName}`;

    const textBody = customMessage ? `${baseBody}\n\nAdditional Note:\n${customMessage}` : baseBody;

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
        <div style="border-top: 4px solid ${accentColor}; margin: -24px -24px 20px -24px; border-radius: 8px 8px 0 0;"></div>
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 20px;">
          <h2 style="color: #0f172a; margin: 0; font-size: 22px;">Invoice ${cleanInvoiceNo}</h2>
          <span style="font-size: 13px; color: #64748b;">${companyDisplayName}</span>
        </div>
        <p style="font-size: 15px; line-height: 1.6; margin-top: 0;">Hello <strong>${customerName}</strong>,</p>
        <p style="font-size: 15px; line-height: 1.6;">Please find attached your invoice for <strong style="color: ${accentColor};">${formattedAmount}</strong>.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
          <tr>
            <td style="padding: 10px 14px; color: #64748b; font-size: 13px; border-bottom: 1px solid #edf2f7;"><strong>Invoice Number:</strong></td>
            <td style="padding: 10px 14px; font-size: 14px; font-weight: 600; border-bottom: 1px solid #edf2f7;">${cleanInvoiceNo}</td>
          </tr>
          ${invoice.projectName ? `
          <tr>
            <td style="padding: 10px 14px; color: #64748b; font-size: 13px; border-bottom: 1px solid #edf2f7;"><strong>Project:</strong></td>
            <td style="padding: 10px 14px; font-size: 14px; border-bottom: 1px solid #edf2f7;">${invoice.projectName}</td>
          </tr>` : ""}
          <tr>
            <td style="padding: 10px 14px; color: #64748b; font-size: 13px; border-bottom: 1px solid #edf2f7;"><strong>Invoice Date:</strong></td>
            <td style="padding: 10px 14px; font-size: 14px; border-bottom: 1px solid #edf2f7;">${invoice.invoiceDate}</td>
          </tr>
          <tr>
            <td style="padding: 10px 14px; color: #64748b; font-size: 13px; border-bottom: 1px solid #edf2f7;"><strong>Due Date:</strong></td>
            <td style="padding: 10px 14px; font-size: 14px; border-bottom: 1px solid #edf2f7;">${invoice.invoiceDueDate}</td>
          </tr>
          ${orgSettings?.paymentTerms ? `
          <tr>
            <td style="padding: 10px 14px; color: #64748b; font-size: 13px; border-bottom: 1px solid #edf2f7;"><strong>Payment Terms:</strong></td>
            <td style="padding: 10px 14px; font-size: 14px; border-bottom: 1px solid #edf2f7;">${orgSettings.paymentTerms}</td>
          </tr>` : ""}
          <tr>
            <td style="padding: 12px 14px; color: #0f172a; font-size: 14px; font-weight: bold;">Total Amount Due:</td>
            <td style="padding: 12px 14px; font-size: 18px; font-weight: bold; color: ${accentColor};">${formattedAmount}</td>
          </tr>
        </table>

        ${customMessage ? `
        <div style="background: #eff6ff; padding: 12px 16px; border-left: 4px solid #3b82f6; margin: 16px 0; border-radius: 4px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: bold; color: #1e40af; text-transform: uppercase;">Message from Sender:</p>
          <p style="margin: 0; font-size: 14px; color: #1e3a8a; white-space: pre-line;">${customMessage}</p>
        </div>` : ""}

        ${invoice.customerNotes ? `
        <div style="background: #f1f5f9; padding: 12px 16px; border-left: 4px solid ${accentColor}; margin: 16px 0; border-radius: 4px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: bold; color: #475569; text-transform: uppercase;">Invoice Notes:</p>
          <p style="margin: 0; font-size: 14px; color: #334155; white-space: pre-line;">${invoice.customerNotes}</p>
        </div>` : ""}

        ${orgSettings?.paymentInstructions ? `
        <div style="background: #fafaf9; padding: 12px 16px; border: 1px dashed #d6d3d1; margin: 16px 0; border-radius: 4px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: bold; color: #57534e; text-transform: uppercase;">Payment Instructions:</p>
          <p style="margin: 0; font-size: 13px; color: #44403c; line-height: 1.5; white-space: pre-line;">${orgSettings.paymentInstructions}</p>
        </div>` : ""}

        <p style="font-size: 13px; color: #64748b; margin-top: 20px;">A PDF copy of this invoice has been attached to this email.</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 13px; color: #94a3b8; margin: 0;">Thank you for your business!<br/><strong>${companyDisplayName}</strong></p>
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

    // Record delivery timestamp and recipient in database
    await recordInvoiceEmailed(id, recipientEmail).catch((err) => {
      console.error("Failed to update LastEmailedAt for invoice:", err);
    });

    return NextResponse.json({
      success: true,
      recipientEmail,
      messageId: sendResult.messageId,
      simulated: sendResult.simulated ?? false,
      lastEmailedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Invoice email delivery endpoint failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to send invoice email" },
      { status: 500 }
    );
  }
}
