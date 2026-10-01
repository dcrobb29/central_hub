import { getEstimates } from "@/app/lib/estimates";
import EstimateWorkspace from "./estimate-workspace";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const estimates = await getEstimates();
  return (
    <main className="body salesBody">
      <EstimateWorkspace estimates={estimates} />
    </main>
  );
}
