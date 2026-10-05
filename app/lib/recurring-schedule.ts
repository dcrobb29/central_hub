import { sql } from "@/app/lib/db";
import { getRecurringDates, type RecurringFrequency } from "@/app/lib/recurring-dates";

export async function ensureRecurringVisits(
  transaction: sql.Transaction,
  projectId: number,
  startDate: string,
  endDate: string,
  frequency: RecurringFrequency,
  rangeStart = startDate,
  rangeEnd = endDate,
): Promise<void> {
  const dates = getRecurringDates(startDate, endDate, frequency, rangeStart, rangeEnd);
  if (dates.length === 0) return;
  await transaction.request()
    .input("projectId", sql.Int, projectId)
    .input("dates", sql.NVarChar(sql.MAX), JSON.stringify(dates))
    .query(`
      DECLARE @datesToSchedule TABLE (RecurrenceDate date PRIMARY KEY);
      INSERT INTO @datesToSchedule SELECT CONVERT(date, [value]) FROM OPENJSON(@dates);

      -- Serialize per project, including adoption of previously manual visits.
      DECLARE @status varchar(24);
      SELECT @status = ProjectStatus FROM dbo.Projects WITH (UPDLOCK, HOLDLOCK) WHERE ProjectID = @projectId;
      -- Status may change between the planner's project query and this lock.
      IF @status IS NULL OR @status <> 'Active' RETURN;

      UPDATE v SET RecurrenceDate = d.RecurrenceDate
      FROM @datesToSchedule d
      CROSS APPLY (
        SELECT TOP (1) ServiceVisitID FROM dbo.ServiceVisits
        WHERE ProjectID = @projectId AND VisitDate = d.RecurrenceDate AND RecurrenceDate IS NULL
        ORDER BY ServiceVisitID
      ) existing
      JOIN dbo.ServiceVisits v ON v.ServiceVisitID = existing.ServiceVisitID
      WHERE NOT EXISTS (
        SELECT 1 FROM dbo.ServiceVisits known
        WHERE known.ProjectID = @projectId AND known.RecurrenceDate = d.RecurrenceDate
      );

      INSERT INTO dbo.ServiceVisits (ProjectID, VisitDate, RecurrenceDate, Status)
      SELECT @projectId, d.RecurrenceDate, d.RecurrenceDate, 'Scheduled'
      FROM @datesToSchedule d
      WHERE NOT EXISTS (
        SELECT 1 FROM dbo.ServiceVisits v
        WHERE v.ProjectID = @projectId AND v.RecurrenceDate = d.RecurrenceDate
      );

      INSERT INTO dbo.FieldOperationsTasks (ServiceVisitID, TaskName, PlannedLaborHours, SortOrder)
      SELECT v.ServiceVisitID, N'General work', 0, 0
      FROM dbo.ServiceVisits v
      JOIN @datesToSchedule d ON d.RecurrenceDate = v.RecurrenceDate
      WHERE v.ProjectID = @projectId AND v.Status = 'Scheduled'
        AND NOT EXISTS (
          SELECT 1 FROM dbo.FieldOperationsTasks t WHERE t.ServiceVisitID = v.ServiceVisitID
        );
    `);
}
