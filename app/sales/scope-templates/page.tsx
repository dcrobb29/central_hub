import { getMaterialsWithLatestPrice } from "@/app/lib/materials";
import { getScopeTemplates } from "@/app/lib/scope-templates";
import ScopeTemplateManager from "./scope-template-manager";

export const dynamic = "force-dynamic";

export default async function ScopeTemplatesPage() {
  const [scopeTemplates, materials] = await Promise.all([getScopeTemplates(), getMaterialsWithLatestPrice()]);
  return (
    <main className="body salesBody">
      <ScopeTemplateManager scopeTemplates={scopeTemplates} materials={materials} />
    </main>
  );
}
