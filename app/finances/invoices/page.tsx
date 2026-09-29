import { getInvoices } from "@/app/lib/invoices";
import InvoiceTable from "../invoice-table";

export default async function InvoicesPage() {
  const invoices = await getInvoices();

  return <InvoiceTable className="invoiceTable" invoices={invoices} />;
}
