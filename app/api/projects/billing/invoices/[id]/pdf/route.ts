import { NextRequest, NextResponse } from "next/server";
import { getInvoices } from "@/app/lib/invoices";
import { getProjectInvoiceBilling } from "@/app/lib/project-billing";
import { renderProjectInvoicePdf } from "@/app/lib/project-invoice-pdf";
import { getOrganizationInvoiceSettings } from "@/app/lib/invoice-settings";
import { ProjectAccessError, requireProject, requireProjectSession } from "@/app/lib/project-access";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647) return NextResponse.json({ error: "Invalid invoice ID" }, { status: 400 });
  try {
    const session = await requireProjectSession(request, "finances.read");
    const organizationId = session.organization.organizationId;
    const invoice = (await getInvoices({ invoiceId: id, organizationId })).find((item) => item.billingManaged);
    if (!invoice?.projectId) return NextResponse.json({ error: "Project invoice not found" }, { status: 404 });
    await requireProject(invoice.projectId, organizationId);
    const billing = await getProjectInvoiceBilling(invoice.projectId, id);
    if (!billing || billing.amount === null) return NextResponse.json({ error: "Invoice billing details are unavailable" }, { status: 409 });
    const settings = await getOrganizationInvoiceSettings(invoice.organizationId).catch(() => null);
    const pdf = await renderProjectInvoicePdf(invoice, billing, settings);
    const filename = invoice.invoiceNo.replace(/[^a-z0-9_-]/gi, "") || "invoice";
    return new NextResponse(new Uint8Array(pdf), { headers: {
      "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="invoice-${filename}.pdf"`,
      "Cache-Control": "private, no-store",
    } });
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Project invoice PDF failed", error);
    return NextResponse.json({ error: "Unable to export the project invoice" }, { status: 500 });
  }
}
