import { getCustomers } from "@/app/lib/customers";
import CustomerDirectory from "./customer-directory";
import { redirect } from "next/navigation";
import { ProjectAccessError, requireProjectSession } from "@/app/lib/project-access";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  let session;
  try {
    session = await requireProjectSession(undefined, "finances.read");
  } catch (error) {
    if (error instanceof ProjectAccessError && error.status === 401) redirect("/login");
    if (error instanceof ProjectAccessError) return <p role="alert">{error.message}</p>;
    throw error;
  }
  return <CustomerDirectory customers={await getCustomers(session.organization.organizationId)}
    canWrite={session.permissions.includes("finances.write")} />;
}
