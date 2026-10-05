import { getBillProjectOptions, getBills } from "@/app/lib/bills";
import BillsTable from "../bills-table";
import { getAllocationBills } from "@/app/lib/project-costs";

export const dynamic = "force-dynamic";

export default async function BillsPage() {
  const [bills, projectOptions, allocations] = await Promise.all([
    getBills(),
    getBillProjectOptions(),
    getAllocationBills(),
  ]);

  return <BillsTable bills={bills} projectOptions={projectOptions} allocations={allocations} />;
}
