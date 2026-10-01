import { getInvoiceProjectOptions, getInvoices } from "@/app/lib/invoices";
import InvoiceTable from "../invoice-table";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const [invoices, projectOptions] = await Promise.all([
    getInvoices(),
    getInvoiceProjectOptions(),
  ]);

  return <InvoiceTable className="invoiceTable" invoices={invoices} projectOptions={projectOptions} />;
}
