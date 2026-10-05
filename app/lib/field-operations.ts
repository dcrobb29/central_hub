import { getPool, sql } from "@/app/lib/db";
import { ensureRecurringVisits } from "@/app/lib/recurring-schedule";
import type { RecurringFrequency } from "@/app/lib/recurring-dates";
import { getCurrentWeekRange } from "@/app/lib/field-operations-dates";
import { ACTIVE_PLANNER_MESSAGE, COMPLETED_PROJECT_MESSAGE } from "@/app/lib/project-status";
import { rollbackIfActive } from "@/app/lib/sql-transactions";
export type FieldOperationsEquipment = {
  equipmentId: number;
  equipmentName: string;
  equipmentType: string | null;
  assetTag: string | null;
};

export type FieldOperationsAssignment = {
  assignmentId: number;
  employeeId: number | null;
  employeeName: string | null;
  equipmentId: number | null;
  equipmentName: string | null;
};

export type FieldOperationsTask = {
  taskId: number;
  taskName: string;
  plannedLaborHours: number;
  assignments: FieldOperationsAssignment[];
};

export type FieldOperationsVisit = {
  serviceVisitId: number;
  projectId: number;
  visitDate: string;
  tasks: FieldOperationsTask[];
};

type ScheduleRow = {
  serviceVisitId: number;
  projectId: number;
  visitDate: string;
  taskId: number | null;
  taskName: string | null;
  plannedLaborHours: number | null;
  assignmentId: number | null;
  employeeId: number | null;
  employeeName: string | null;
  equipmentId: number | null;
  equipmentName: string | null;
};

export async function getFieldOperationsEquipment(): Promise<FieldOperationsEquipment[]> {
  const pool = await getPool();
  const result = await pool.request().query<FieldOperationsEquipment>(`
    SELECT EquipmentID AS equipmentId, EquipmentName AS equipmentName,
      EquipmentType AS equipmentType, AssetTag AS assetTag
    FROM dbo.Equipment
    ORDER BY EquipmentName, EquipmentID
  `);
  return result.recordset;
}

export async function getFieldOperationsSchedule(startDate: string, endDate: string): Promise<FieldOperationsVisit[]> {
  const pool = await getPool();
  const recurring = await pool.request()
    .input("startDate", sql.Date, asSqlDate(startDate))
    .input("endDate", sql.Date, asSqlDate(endDate))
    .query<{ projectId: number; startDate: string; endDate: string; frequency: RecurringFrequency }>(`
      SELECT ProjectID AS projectId, CONVERT(varchar(10), ExpectedStartDate, 23) AS startDate,
        CONVERT(varchar(10), ExpectedEndDate, 23) AS endDate, RecurrenceFrequency AS frequency
      FROM dbo.Projects
      WHERE EngagementType = 'Service' AND AcceptedEstimateRevisionID IS NOT NULL
        AND ProjectStatus = 'Active'
        AND ExpectedStartDate <= @endDate AND ExpectedEndDate >= @startDate
        AND RecurrenceFrequency IS NOT NULL
      ORDER BY ProjectID
    `);
  if (recurring.recordset.length > 0) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      for (const project of recurring.recordset) {
        await ensureRecurringVisits(transaction, project.projectId, project.startDate, project.endDate, project.frequency, startDate, endDate);
      }
      await transaction.commit();
    } catch (error) {
      await rollbackIfActive(transaction);
      throw error;
    }
  }
  const result = await pool.request()
    .input("startDate", sql.Date, new Date(`${startDate}T00:00:00.000Z`))
    .input("endDate", sql.Date, new Date(`${endDate}T00:00:00.000Z`))
    .query<ScheduleRow>(`
      SELECT
        v.ServiceVisitID AS serviceVisitId,
        v.ProjectID AS projectId,
        CONVERT(varchar(10), v.VisitDate, 23) AS visitDate,
        t.FieldOperationsTaskID AS taskId,
        t.TaskName AS taskName,
        t.PlannedLaborHours AS plannedLaborHours,
        a.FieldOperationsTaskAssignmentID AS assignmentId,
        a.EmployeeID AS employeeId,
        e.EmployeeName AS employeeName,
        a.EquipmentID AS equipmentId,
        q.EquipmentName AS equipmentName
      FROM dbo.ServiceVisits v
      JOIN dbo.Projects p ON p.ProjectID = v.ProjectID AND p.ProjectStatus = 'Active'
      LEFT JOIN dbo.FieldOperationsTasks t
        ON t.ServiceVisitID = v.ServiceVisitID AND t.IsActive = 1
      LEFT JOIN dbo.FieldOperationsTaskAssignments a
        ON a.FieldOperationsTaskID = t.FieldOperationsTaskID AND a.IsActive = 1
      LEFT JOIN dbo.Employees e ON e.EmployeeID = a.EmployeeID
      LEFT JOIN dbo.Equipment q ON q.EquipmentID = a.EquipmentID
      WHERE v.VisitDate >= @startDate AND v.VisitDate <= @endDate
        AND v.Status = 'Scheduled'
      ORDER BY v.VisitDate, v.ServiceVisitID, t.SortOrder, t.FieldOperationsTaskID,
        a.FieldOperationsTaskAssignmentID
    `);

  const visits = new Map<number, FieldOperationsVisit>();
  for (const row of result.recordset) {
    let visit = visits.get(row.serviceVisitId);
    if (!visit) {
      visit = {
        serviceVisitId: row.serviceVisitId,
        projectId: row.projectId,
        visitDate: row.visitDate,
        tasks: [],
      };
      visits.set(row.serviceVisitId, visit);
    }
    if (row.taskId === null || row.taskName === null || row.plannedLaborHours === null) continue;
    let task = visit.tasks.find((candidate) => candidate.taskId === row.taskId);
    if (!task) {
      task = {
        taskId: row.taskId,
        taskName: row.taskName,
        plannedLaborHours: row.plannedLaborHours,
        assignments: [],
      };
      visit.tasks.push(task);
    }
    if (row.assignmentId !== null) {
      task.assignments.push({
        assignmentId: row.assignmentId,
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        equipmentId: row.equipmentId,
        equipmentName: row.equipmentName,
      });
    }
  }
  return [...visits.values()];
}

function asSqlDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export async function scheduleProjectVisit(projectId: number, visitDate: string): Promise<void> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const project = await transaction.request()
      .input("projectId", sql.Int, projectId)
      .query<{ ProjectID: number; ProjectStatus: string }>("SELECT ProjectID, ProjectStatus FROM dbo.Projects WITH (UPDLOCK, HOLDLOCK) WHERE ProjectID = @projectId");
    if (!project.recordset[0]) throw new Error("project-not-found");
    if (project.recordset[0].ProjectStatus === "Complete") throw new Error(COMPLETED_PROJECT_MESSAGE);
    if (project.recordset[0].ProjectStatus !== "Active") throw new Error(ACTIVE_PLANNER_MESSAGE);

    const existing = await transaction.request()
      .input("projectId", sql.Int, projectId)
      .input("visitDate", sql.Date, asSqlDate(visitDate))
      .query<{ ServiceVisitID: number }>(`
        SELECT TOP (1) ServiceVisitID
        FROM dbo.ServiceVisits WITH (UPDLOCK, HOLDLOCK)
        WHERE ProjectID = @projectId AND VisitDate = @visitDate AND Status = 'Scheduled'
        ORDER BY ServiceVisitID
      `);

    let serviceVisitId = existing.recordset[0]?.ServiceVisitID;
    if (!serviceVisitId) {
      const inserted = await transaction.request()
        .input("projectId", sql.Int, projectId)
        .input("visitDate", sql.Date, asSqlDate(visitDate))
        .query<{ ServiceVisitID: number }>(`
          INSERT INTO dbo.ServiceVisits (ProjectID, VisitDate, Status)
          VALUES (@projectId, @visitDate, 'Scheduled');
          SELECT CONVERT(int, SCOPE_IDENTITY()) AS ServiceVisitID;
        `);
      serviceVisitId = inserted.recordset[0].ServiceVisitID;
    }

    const activeTask = await transaction.request()
      .input("serviceVisitId", sql.Int, serviceVisitId)
      .query<{ FieldOperationsTaskID: number }>(`
        SELECT TOP (1) FieldOperationsTaskID
        FROM dbo.FieldOperationsTasks
        WHERE ServiceVisitID = @serviceVisitId AND IsActive = 1
      `);
    if (!activeTask.recordset[0]) {
      await transaction.request()
        .input("serviceVisitId", sql.Int, serviceVisitId)
        .query(`
          INSERT INTO dbo.FieldOperationsTasks (ServiceVisitID, TaskName, PlannedLaborHours, SortOrder)
          VALUES (@serviceVisitId, N'General work', 0, 0)
        `);
    }
    await transaction.commit();
  } catch (error) {
    await rollbackIfActive(transaction);
    throw error;
  }
}

export async function moveFieldOperationsVisit(serviceVisitId: number, visitDate: string): Promise<boolean> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const result = await transaction.request()
      .input("serviceVisitId", sql.Int, serviceVisitId)
      .query<{ visitDate: string }>(`
        SELECT CONVERT(varchar(10), VisitDate, 23) AS visitDate
        FROM dbo.ServiceVisits WITH (UPDLOCK, HOLDLOCK)
        WHERE ServiceVisitID = @serviceVisitId AND Status = 'Scheduled'
      `);
    const visit = result.recordset[0];
    if (!visit) {
      await transaction.rollback();
      return false;
    }
    if (getCurrentWeekRange(asSqlDate(visit.visitDate)).startDate !== getCurrentWeekRange(asSqlDate(visitDate)).startDate) {
      throw new Error("visit-outside-week");
    }
    await transaction.request()
      .input("serviceVisitId", sql.Int, serviceVisitId)
      .input("visitDate", sql.Date, asSqlDate(visitDate))
      .query("UPDATE dbo.ServiceVisits SET VisitDate = @visitDate WHERE ServiceVisitID = @serviceVisitId");
    await transaction.commit();
    return true;
  } catch (error) {
    await rollbackIfActive(transaction);
    throw error;
  }
}

export async function unscheduleFieldOperationsVisit(serviceVisitId: number): Promise<boolean> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const visit = await transaction.request()
      .input("serviceVisitId", sql.Int, serviceVisitId)
      .query<{ ServiceVisitID: number }>(`
        SELECT ServiceVisitID FROM dbo.ServiceVisits WITH (UPDLOCK, HOLDLOCK)
        WHERE ServiceVisitID = @serviceVisitId AND Status = 'Scheduled'
      `);
    if (!visit.recordset[0]) {
      await transaction.rollback();
      return false;
    }
    await transaction.request()
      .input("serviceVisitId", sql.Int, serviceVisitId)
      .query(`
        UPDATE a SET IsActive = 0
        FROM dbo.FieldOperationsTaskAssignments a
        JOIN dbo.FieldOperationsTasks t ON t.FieldOperationsTaskID = a.FieldOperationsTaskID
        WHERE t.ServiceVisitID = @serviceVisitId AND t.IsActive = 1 AND a.IsActive = 1
      `);
    await transaction.request()
      .input("serviceVisitId", sql.Int, serviceVisitId)
      .query("UPDATE dbo.FieldOperationsTasks SET IsActive = 0 WHERE ServiceVisitID = @serviceVisitId AND IsActive = 1");
    await transaction.request()
      .input("serviceVisitId", sql.Int, serviceVisitId)
      .query("UPDATE dbo.ServiceVisits SET Status = 'Skipped' WHERE ServiceVisitID = @serviceVisitId AND Status = 'Scheduled'");
    await transaction.commit();
    return true;
  } catch (error) {
    await rollbackIfActive(transaction);
    throw error;
  }
}

export async function addFieldOperationsTask(serviceVisitId: number, taskName: string, plannedLaborHours: number): Promise<boolean> {
  const pool = await getPool();
  const result = await pool.request()
    .input("serviceVisitId", sql.Int, serviceVisitId)
    .input("taskName", sql.NVarChar(150), taskName)
    .input("plannedLaborHours", sql.Decimal(10, 2), plannedLaborHours)
    .query(`
      INSERT INTO dbo.FieldOperationsTasks (ServiceVisitID, TaskName, PlannedLaborHours, SortOrder)
      SELECT @serviceVisitId, @taskName, @plannedLaborHours,
        COALESCE(MAX(SortOrder), -1) + 1
      FROM dbo.FieldOperationsTasks
      WHERE ServiceVisitID = @serviceVisitId AND IsActive = 1
      HAVING EXISTS (SELECT 1 FROM dbo.ServiceVisits WHERE ServiceVisitID = @serviceVisitId AND Status = 'Scheduled')
    `);
  return (result.rowsAffected[0] ?? 0) === 1;
}

export async function updateFieldOperationsTask(taskId: number, taskName: string, plannedLaborHours: number): Promise<boolean> {
  const pool = await getPool();
  const result = await pool.request()
    .input("taskId", sql.Int, taskId)
    .input("taskName", sql.NVarChar(150), taskName)
    .input("plannedLaborHours", sql.Decimal(10, 2), plannedLaborHours)
    .query(`
      UPDATE t
      SET TaskName = @taskName, PlannedLaborHours = @plannedLaborHours
      FROM dbo.FieldOperationsTasks t
      JOIN dbo.ServiceVisits v ON v.ServiceVisitID = t.ServiceVisitID
      WHERE t.FieldOperationsTaskID = @taskId AND t.IsActive = 1 AND v.Status = 'Scheduled'
    `);
  return (result.rowsAffected[0] ?? 0) === 1;
}

export async function deactivateFieldOperationsTask(taskId: number): Promise<boolean> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const task = await transaction.request()
      .input("taskId", sql.Int, taskId)
      .query<{ FieldOperationsTaskID: number }>(`
        SELECT t.FieldOperationsTaskID
        FROM dbo.FieldOperationsTasks t WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.ServiceVisits v ON v.ServiceVisitID = t.ServiceVisitID
        WHERE t.FieldOperationsTaskID = @taskId AND t.IsActive = 1 AND v.Status = 'Scheduled'
      `);
    if (!task.recordset[0]) {
      await transaction.rollback();
      return false;
    }
    await transaction.request()
      .input("taskId", sql.Int, taskId)
      .query("UPDATE dbo.FieldOperationsTaskAssignments SET IsActive = 0 WHERE FieldOperationsTaskID = @taskId AND IsActive = 1");
    await transaction.request()
      .input("taskId", sql.Int, taskId)
      .query("UPDATE dbo.FieldOperationsTasks SET IsActive = 0 WHERE FieldOperationsTaskID = @taskId");
    await transaction.commit();
    return true;
  } catch (error) {
    await rollbackIfActive(transaction);
    throw error;
  }
}

export async function assignResourceToTask(taskId: number, resource: { employeeId: number } | { equipmentId: number }): Promise<boolean> {
  const pool = await getPool();
  const request = pool.request().input("taskId", sql.Int, taskId);
  let resourceColumn: "EmployeeID" | "EquipmentID";
  if ("employeeId" in resource) {
    resourceColumn = "EmployeeID";
    request.input("resourceId", sql.Int, resource.employeeId);
  } else {
    resourceColumn = "EquipmentID";
    request.input("resourceId", sql.Int, resource.equipmentId);
  }
  const result = await request.query(`
    INSERT INTO dbo.FieldOperationsTaskAssignments (FieldOperationsTaskID, ${resourceColumn})
    SELECT @taskId, @resourceId
    WHERE EXISTS (
      SELECT 1 FROM dbo.FieldOperationsTasks t
      JOIN dbo.ServiceVisits v ON v.ServiceVisitID = t.ServiceVisitID
      WHERE t.FieldOperationsTaskID = @taskId AND t.IsActive = 1 AND v.Status = 'Scheduled'
    )
  `);
  return (result.rowsAffected[0] ?? 0) === 1;
}

export async function moveFieldOperationsAssignment(assignmentId: number, taskId: number): Promise<boolean> {
  const pool = await getPool();
  const result = await pool.request()
    .input("assignmentId", sql.Int, assignmentId)
    .input("taskId", sql.Int, taskId)
    .query(`
      UPDATE a
      SET FieldOperationsTaskID = @taskId
      FROM dbo.FieldOperationsTaskAssignments a
      JOIN dbo.FieldOperationsTasks sourceTask ON sourceTask.FieldOperationsTaskID = a.FieldOperationsTaskID
      JOIN dbo.ServiceVisits sourceVisit ON sourceVisit.ServiceVisitID = sourceTask.ServiceVisitID
      WHERE a.FieldOperationsTaskAssignmentID = @assignmentId AND a.IsActive = 1
        AND sourceTask.IsActive = 1 AND sourceVisit.Status = 'Scheduled'
        AND EXISTS (
          SELECT 1 FROM dbo.FieldOperationsTasks targetTask
          JOIN dbo.ServiceVisits targetVisit ON targetVisit.ServiceVisitID = targetTask.ServiceVisitID
          WHERE targetTask.FieldOperationsTaskID = @taskId AND targetTask.IsActive = 1 AND targetVisit.Status = 'Scheduled'
        )
    `);
  return (result.rowsAffected[0] ?? 0) === 1;
}

export async function deactivateFieldOperationsAssignment(assignmentId: number): Promise<boolean> {
  const pool = await getPool();
  const result = await pool.request()
    .input("assignmentId", sql.Int, assignmentId)
    .query(`
      UPDATE a SET IsActive = 0
      FROM dbo.FieldOperationsTaskAssignments a
      JOIN dbo.FieldOperationsTasks t ON t.FieldOperationsTaskID = a.FieldOperationsTaskID
      JOIN dbo.ServiceVisits v ON v.ServiceVisitID = t.ServiceVisitID
      WHERE a.FieldOperationsTaskAssignmentID = @assignmentId AND a.IsActive = 1
        AND t.IsActive = 1 AND v.Status = 'Scheduled'
    `);
  return (result.rowsAffected[0] ?? 0) === 1;
}
