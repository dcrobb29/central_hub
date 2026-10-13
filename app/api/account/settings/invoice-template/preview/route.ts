import { NextRequest, NextResponse } from "next/server";
import { renderProjectInvoicePdf } from "@/app/lib/project-invoice-pdf";
import {
  getOrganizationInvoiceSettings,
  type OrganizationInvoiceSettings,
} from "@/app/lib/invoice-settings";
import type { Invoice } from "@/app/lib/invoices";
import type { BillingInvoice } from "@/app/lib/project-billing";

const SAMPLE_INVOICE: Invoice = {
  id: 99999,
  organizationId: 1,
  customerId: 1,
  billingManaged: true,
  internalNotes: "Internal review approved for sample preview",
  customerNotes: "Thank you for partnering with us on the Downtown Plaza renovation. Final cleanup and handover scheduled for next Friday.",
  projectId: 1,
  projectName: "Downtown Plaza Renovation - Phase II",
  invoiceNo: "INV-2026-0042",
  invoiceDate: "2026-10-15",
  invoiceDueDate: "2026-11-14",
  invoicePaidDate: null,
  invoiceAmount: "14850.00",
  firstName: "Sarah",
  lastName: "Jenkins",
  companyName: "Acme Commercial Properties",
  billingAddressLine1: "742 Evergreen Terrace, Suite 300",
  billingAddressLine2: null,
  billingAddressCity: "Springfield",
  billingAddressState: "OR",
  billingAddressZip: "97477",
  shippingAddressLine1: "1200 Downtown Plaza, Dock B",
  shippingAddressLine2: null,
  shippingAddressCity: "Springfield",
  shippingAddressState: "OR",
  shippingAddressZip: "97477",
};

const SAMPLE_BILLING: BillingInvoice = {
  invoiceId: 99999,
  invoiceNo: "INV-2026-0042",
  invoiceDate: "2026-10-15",
  dueDate: "2026-11-14",
  amount: 14850.0,
  managed: true,
  showScopes: true,
  allocations: [
    {
      scopeId: 101,
      unitId: 1,
      scopeName: "Structural Framing & Steel Stud Installation",
      visitDate: "2026-10-02",
      amount: 6200.0,
      completionStatusAtIssue: "Complete",
    },
    {
      scopeId: 102,
      unitId: 1,
      scopeName: "Rough-in Electrical & Conduit Routing",
      visitDate: "2026-10-06",
      amount: 4400.0,
      completionStatusAtIssue: "Complete",
    },
    {
      scopeId: 103,
      unitId: 1,
      scopeName: "Drywall Hanging & Level 4 Finishing",
      visitDate: "2026-10-11",
      amount: 4250.0,
      completionStatusAtIssue: "Complete",
    },
  ],
  internalNotes: null,
  customerNotes: "Thank you for partnering with us on the Downtown Plaza renovation. Final cleanup and handover scheduled for next Friday.",
  includesIncompleteWork: false,
  overrideReason: null,
};

export async function GET(request: NextRequest) {
  try {
    const orgId = Number(request.nextUrl.searchParams.get("organizationId")) || 1;
    const settings = await getOrganizationInvoiceSettings(orgId);
    const pdf = await renderProjectInvoicePdf(SAMPLE_INVOICE, SAMPLE_BILLING, settings);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="invoice-template-preview.pdf"',
      },
    });
  } catch (error) {
    console.error("Template preview PDF failed:", error);
    return NextResponse.json({ error: "Failed to generate preview PDF" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Partial<OrganizationInvoiceSettings>;
    const pdf = await renderProjectInvoicePdf(SAMPLE_INVOICE, SAMPLE_BILLING, body as OrganizationInvoiceSettings);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="invoice-template-preview.pdf"',
      },
    });
  } catch (error) {
    console.error("Template preview POST failed:", error);
    return NextResponse.json({ error: "Failed to render preview PDF" }, { status: 500 });
  }
}
