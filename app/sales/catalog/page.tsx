import { getMaterialsWithLatestPrice } from "@/app/lib/materials";
import MaterialCatalog from "./material-catalog";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const materials = await getMaterialsWithLatestPrice();
  return (
    <main className="body salesBody">
      <MaterialCatalog materials={materials} />
    </main>
  );
}
