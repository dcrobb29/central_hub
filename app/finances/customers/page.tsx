import { getCustomers } from "@/app/lib/customers";
import CustomerDirectory from "./customer-directory";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  return <CustomerDirectory customers={await getCustomers()} />;
}
