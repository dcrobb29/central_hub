import { getInvoiceProjectOptions, getInvoices } from "@/app/lib/invoices";
import InvoiceTable from "../invoice-table";
import { getCustomers } from "@/app/lib/customers";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const [invoices, projectOptions, customers] = await Promise.all([
    getInvoices(),
    getInvoiceProjectOptions(),
    getCustomers(),
  ]);

  return <InvoiceTable className="invoiceTable" invoices={invoices} projectOptions={projectOptions} customers={customers} />;
}
