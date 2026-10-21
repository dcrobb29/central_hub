import { redirect } from "next/navigation";
import { getMaterialsWithLatestPrice } from "@/app/lib/materials";
import { ProjectAccessError, requireProjectSession } from "@/app/lib/project-access";
import MaterialCatalog from "./material-catalog";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  try {
    await requireProjectSession(undefined, "sales.read");
  } catch (error) {
    if (error instanceof ProjectAccessError && error.status === 401) redirect("/login");
    if (error instanceof ProjectAccessError) return <main className="body salesBody"><p role="alert">{error.message}</p></main>;
    throw error;
  }
  const materials = await getMaterialsWithLatestPrice();
  return (
    <main className="body salesBody">
      <MaterialCatalog materials={materials} />
    </main>
  );
}
