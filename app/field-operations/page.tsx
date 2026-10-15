import { getProjectsWithEstimates } from "@/app/lib/estimates";
import { getFieldOperationsEquipment, getFieldOperationsSchedule } from "@/app/lib/field-operations";
import { getCurrentWeekRange } from "@/app/lib/field-operations-dates";
import { getPersonnelData } from "@/app/lib/personnel";
import FieldOperationsWorkspace from "./field-operations-workspace";
import { requireProjectSession } from "@/app/lib/project-access";
import styles from "./field-operations-workspace.module.css";

export const dynamic = "force-dynamic";

export default async function FieldOperationsPage() {
  const session = await requireProjectSession(undefined, "planning.read");
  const organizationId = session.organization.organizationId;
  const week = getCurrentWeekRange(new Date());
  const [projects, personnel, equipment, visits] = await Promise.all([
    getProjectsWithEstimates({ organizationId }),
    getPersonnelData(organizationId),
    getFieldOperationsEquipment(organizationId),
    getFieldOperationsSchedule(week.startDate, week.endDate, organizationId),
  ]);
  return (
    <main className={`body fieldOperationsBody ${styles.page}`}>
      <FieldOperationsWorkspace
        projects={projects}
        employees={personnel.people}
        roleNames={Object.fromEntries(personnel.roles.map((role) => [role.id, role.name]))}
        equipment={equipment}
        initialWeek={week}
        initialVisits={visits}
        canEdit={session.permissions.includes("planning.write")}
      />
    </main>
  );
}
