import { getBillProjectOptions, getBills } from "@/app/lib/bills";
import BillsTable from "../bills-table";

export const dynamic = "force-dynamic";

export default async function BillsPage() {
  const [bills, projectOptions] = await Promise.all([
    getBills(),
    getBillProjectOptions(),
  ]);

  return <BillsTable bills={bills} projectOptions={projectOptions} />;
}

