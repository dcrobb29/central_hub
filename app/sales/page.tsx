import { getEstimates } from "@/app/lib/estimates";
import { getUnitsOfMeasurement } from "@/app/lib/units-of-measurement";
import EstimateWorkspace from "./estimate-workspace";
import {requireProjectSession,ProjectAccessError} from "@/app/lib/project-access";
import {redirect} from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  let session;
  try{session=await requireProjectSession(undefined,"sales.read");}
  catch(error){
    if(error instanceof ProjectAccessError&&error.status===401)redirect("/login");
    if(error instanceof ProjectAccessError)return <main className="body salesBody"><p role="alert">{error.message}</p></main>;
    throw error;
  }
  const [estimates, unitPresets] = await Promise.all([getEstimates(session.organization.organizationId), getUnitsOfMeasurement()]);
  return (
    <main className="body salesBody">
      <EstimateWorkspace estimates={estimates} unitPresets={unitPresets} canEdit={session.permissions.includes("sales.write")}/>
    </main>
  );
}
