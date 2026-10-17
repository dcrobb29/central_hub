import { getBillProjectOptions, getBills } from "@/app/lib/bills";
import BillsTable from "../bills-table";
import { getAllocationBills } from "@/app/lib/project-costs";
import { redirect } from "next/navigation";
import { ProjectAccessError, requireProjectSession } from "@/app/lib/project-access";

export const dynamic = "force-dynamic";

export default async function BillsPage() {
  let session;
  try {
    session = await requireProjectSession(undefined, "finances.read");
  } catch (error) {
    if (error instanceof ProjectAccessError && error.status === 401) redirect("/login");
    if (error instanceof ProjectAccessError) return <p role="alert">{error.message}</p>;
    throw error;
  }
  const organizationId = session.organization.organizationId;
  const [bills, projectOptions, allocations] = await Promise.all([
    getBills({ organizationId }),
    getBillProjectOptions(organizationId),
    getAllocationBills(organizationId),
  ]);

  return <BillsTable bills={bills} projectOptions={projectOptions} allocations={allocations} />;
}
