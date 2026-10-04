import { getEstimates } from "@/app/lib/estimates";
import { getUnitsOfMeasurement } from "@/app/lib/units-of-measurement";
import EstimateWorkspace from "./estimate-workspace";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const [estimates, unitPresets] = await Promise.all([getEstimates(), getUnitsOfMeasurement()]);
  return (
    <main className="body salesBody">
      <EstimateWorkspace estimates={estimates} unitPresets={unitPresets} />
    </main>
  );
}
