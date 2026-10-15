import { notFound, redirect } from "next/navigation";
import { getEstimateDetails, getEstimates } from "@/app/lib/estimates";
import { getUnitsOfMeasurement } from "@/app/lib/units-of-measurement";
import { requireProjectSession, ProjectAccessError } from "@/app/lib/project-access";
import EstimateWorkspace from "./estimate-workspace";
import styles from "@/app/components/record-workspace.module.css";

export default async function SalesScreen({ estimateId, tab }: { estimateId?: number; tab?: string }) {
  let session;
  try {
    session = await requireProjectSession(undefined, "sales.read");
  } catch (error) {
    if (error instanceof ProjectAccessError && error.status === 401) redirect("/login");
    if (error instanceof ProjectAccessError) return <main className="body salesBody"><p role="alert">{error.message}</p></main>;
    throw error;
  }
  const [estimates, unitPresets] = await Promise.all([
    getEstimates(session.organization.organizationId), getUnitsOfMeasurement(),
  ]);
  // Only resolve details after confirming this is an organization-owned base estimate.
  if (estimateId !== undefined && !estimates.some((estimate) => estimate.estimateId === estimateId)) notFound();
  const selectedEstimate = estimateId !== undefined ? await getEstimateDetails(estimateId) : null;
  if (estimateId !== undefined && !selectedEstimate) notFound();
  return (
    <main className={`body salesBody ${styles.page}`}>
      <EstimateWorkspace estimates={estimates} unitPresets={unitPresets}
        canEdit={session.permissions.includes("sales.write")} selectedEstimate={selectedEstimate} selectedTab={tab} />
    </main>
  );
}
