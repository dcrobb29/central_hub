import { getProjectsWithEstimates } from "@/app/lib/estimates";
import { getFieldOperationsEquipment, getFieldOperationsSchedule } from "@/app/lib/field-operations";
import { getCurrentWeekRange } from "@/app/lib/field-operations-dates";
import { getPersonnelData } from "@/app/lib/personnel";
import FieldOperationsWorkspace from "./field-operations-workspace";

export const dynamic = "force-dynamic";

export default async function FieldOperationsPage() {
  const week = getCurrentWeekRange(new Date());
  const [projects, personnel, equipment, visits] = await Promise.all([
    getProjectsWithEstimates(),
    getPersonnelData(),
    getFieldOperationsEquipment(),
    getFieldOperationsSchedule(week.startDate, week.endDate),
  ]);
  return (
    <main className="body fieldOperationsBody">
      <FieldOperationsWorkspace
        projects={projects}
        employees={personnel.people}
        roleNames={Object.fromEntries(personnel.roles.map((role) => [role.id, role.name]))}
        equipment={equipment}
        initialWeek={week}
        initialVisits={visits}
      />
    </main>
  );
}
