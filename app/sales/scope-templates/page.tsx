import { redirect } from "next/navigation";
import { getMaterialsWithLatestPrice } from "@/app/lib/materials";
import { ProjectAccessError, requireProjectSession } from "@/app/lib/project-access";
import { getScopeTemplates } from "@/app/lib/scope-templates";
import ScopeTemplateManager from "./scope-template-manager";

export const dynamic = "force-dynamic";

export default async function ScopeTemplatesPage() {
  let organizationId: number;
  try {
    organizationId = (await requireProjectSession(undefined, "sales.read")).organization.organizationId;
  } catch (error) {
    if (error instanceof ProjectAccessError && error.status === 401) redirect("/login");
    if (error instanceof ProjectAccessError) return <main className="body salesBody"><p role="alert">{error.message}</p></main>;
    throw error;
  }
  const [scopeTemplates, materials] = await Promise.all([getScopeTemplates(organizationId), getMaterialsWithLatestPrice(organizationId)]);
  return (
    <main className="body salesBody">
      <ScopeTemplateManager scopeTemplates={scopeTemplates} materials={materials} />
    </main>
  );
}
