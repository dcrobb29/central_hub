import { getPool, sql } from "./db";
import { ProjectAccessError } from "./project-access";

export async function requireFieldActionAccess(body: Record<string, unknown>, organizationId: number) {
  const pool = await getPool();
  const identifiers = [
    ["projectId", "Projects", "ProjectID"],
    ["serviceVisitId", "ServiceVisits", "ServiceVisitID"],
    ["taskId", "FieldOperationsTasks", "FieldOperationsTaskID"],
    ["assignmentId", "FieldOperationsTaskAssignments", "FieldOperationsTaskAssignmentID"],
  ] as const;
  for (const [key, table, column] of identifiers) {
    if (!(key in body)) continue;
    const id = Number(body[key]);
    if (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647) throw new ProjectAccessError("Choose a valid scheduled item.", 400);
    const result = await pool.request().input("id", sql.Int, id).input("org", sql.Int, organizationId)
      .query(`SELECT 1 AS found FROM dbo.${table} WHERE ${column} = @id AND OrganizationID = @org`);
    if (!result.recordset[0]) throw new ProjectAccessError("Scheduled item not found.", 404);
  }
  if (body.action === "assign-resource") {
    if (body.resourceType !== "employee" && body.resourceType !== "equipment") throw new ProjectAccessError("Choose an employee or equipment.", 400);
    const id = Number(body.resourceId);
    if (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647) throw new ProjectAccessError("Choose a valid resource.", 400);
    const table = body.resourceType === "employee" ? "Employees" : "Equipment";
    const column = body.resourceType === "employee" ? "EmployeeID" : "EquipmentID";
    const result = await pool.request().input("id", sql.Int, id).input("org", sql.Int, organizationId)
      .query(`SELECT 1 AS found FROM dbo.${table} WHERE ${column} = @id AND OrganizationID = @org`);
    if (!result.recordset[0]) throw new ProjectAccessError("Resource not found.", 404);
  }
}
