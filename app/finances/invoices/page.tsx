import { getInvoiceProjectOptions, getInvoices } from "@/app/lib/invoices";
import InvoiceTable from "../invoice-table";
import { getCustomers } from "@/app/lib/customers";
import { redirect } from "next/navigation";
import { ProjectAccessError, requireProjectSession } from "@/app/lib/project-access";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  let session;
  try {
    session = await requireProjectSession(undefined, "finances.read");
  } catch (error) {
    if (error instanceof ProjectAccessError && error.status === 401) redirect("/login");
    if (error instanceof ProjectAccessError) return <p role="alert">{error.message}</p>;
    throw error;
  }
  const organizationId = session.organization.organizationId;
  const [invoices, projectOptions, customers] = await Promise.all([
    getInvoices({ organizationId }),
    getInvoiceProjectOptions(organizationId),
    getCustomers(organizationId),
  ]);

  return <InvoiceTable className="invoiceTable" invoices={invoices} projectOptions={projectOptions} customers={customers} />;
}
