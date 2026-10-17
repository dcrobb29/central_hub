import { getPool, sql } from "@/app/lib/db";

export type PersonnelRole = {
  id: string;
  name: string;
};

export type Person = {
  id: string;
  name: string;
  roleId: string;
  managerId: string | null;
};

export type EmployeeHistoryEntry = {
  id: string;
  employeeId: string;
  eventDate: string;
  notes: string;
};

export type PersonnelData = {
  roles: PersonnelRole[];
  people: Person[];
};

export class PersonnelRecordError extends Error {}

export async function getPersonnelData(organizationId: number): Promise<PersonnelData> {
  const pool = await getPool();
  const [rolesResult, employeesResult] = await Promise.all([
    pool.request().input("organizationId", sql.Int, organizationId).query<PersonnelRole>(`
      SELECT CAST(RoleID AS nvarchar(20)) AS id, RoleName AS name
      FROM dbo.Roles
      WHERE OrganizationID = @organizationId
      ORDER BY RoleName
    `),
    pool.request().input("organizationId", sql.Int, organizationId).query<Person>(`
      SELECT
        CAST(e.EmployeeID AS nvarchar(20)) AS id,
        e.EmployeeName AS name,
        CAST(e.RoleID AS nvarchar(20)) AS roleId,
        CAST(m.EmployeeID AS nvarchar(20)) AS managerId
      FROM dbo.Employees e
      JOIN dbo.Roles r ON r.RoleID = e.RoleID AND r.OrganizationID = e.OrganizationID
      LEFT JOIN dbo.Employees m ON m.EmployeeID = e.ManagerID AND m.OrganizationID = e.OrganizationID
      WHERE e.OrganizationID = @organizationId
      ORDER BY e.EmployeeName
    `),
  ]);

  return { roles: rolesResult.recordset, people: employeesResult.recordset };
}

export async function addRole(name: string, organizationId: number): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("name", sql.NVarChar(80), name)
    .input("organizationId", sql.Int, organizationId)
    .query("INSERT INTO dbo.Roles (RoleName, OrganizationID) VALUES (@name, @organizationId)");
}

export async function addPerson(input: {
  name: string;
  roleId: number;
  relationType: "none" | "reportsTo" | "manages";
  relationPersonId: number | null;
}, organizationId: number): Promise<number> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  let newEmployeeId = 0;

  try {
    const managerId = input.relationType === "reportsTo" ? input.relationPersonId : null;
    const role = await transaction.request().input("roleId", sql.Int, input.roleId).input("organizationId", sql.Int, organizationId)
      .query("SELECT RoleID FROM dbo.Roles WITH (UPDLOCK, HOLDLOCK) WHERE RoleID = @roleId AND OrganizationID = @organizationId");
    if (!role.recordset[0]) throw new PersonnelRecordError("Choose a role in your organization");
    if (input.relationPersonId !== null) {
      const relatedPerson = await transaction.request().input("employeeId", sql.Int, input.relationPersonId)
        .input("organizationId", sql.Int, organizationId)
        .query("SELECT EmployeeID FROM dbo.Employees WITH (UPDLOCK, HOLDLOCK) WHERE EmployeeID = @employeeId AND OrganizationID = @organizationId");
      if (!relatedPerson.recordset[0]) throw new PersonnelRecordError("Choose a person in your organization");
    }
    const inserted = await transaction
      .request()
      .input("name", sql.NVarChar(200), input.name)
      .input("roleId", sql.Int, input.roleId)
      .input("managerId", sql.Int, managerId)
      .input("organizationId", sql.Int, organizationId)
      .query<{ EmployeeID: number }>(`
        INSERT INTO dbo.Employees (EmployeeName, RoleID, ManagerID, OrganizationID)
        OUTPUT inserted.EmployeeID
        VALUES (@name, @roleId, @managerId, @organizationId)
      `);

    newEmployeeId = inserted.recordset[0].EmployeeID;
    if (input.relationType === "manages" && input.relationPersonId !== null) {
      await transaction
        .request()
        .input("employeeId", sql.Int, input.relationPersonId)
        .input("managerId", sql.Int, newEmployeeId)
        .input("organizationId", sql.Int, organizationId)
        .query("UPDATE dbo.Employees SET ManagerID = @managerId WHERE EmployeeID = @employeeId AND OrganizationID = @organizationId");
    }
    await transaction.commit();
    return newEmployeeId;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function updatePerson(input: {
  id: number;
  name: string;
  roleId: number;
  managerId: number | null;
}, organizationId: number): Promise<void> {
  const pool = await getPool();
  const result = await pool.request()
    .input("id", sql.Int, input.id)
    .input("name", sql.NVarChar(200), input.name)
    .input("roleId", sql.Int, input.roleId)
    .input("managerId", sql.Int, input.managerId)
    .input("organizationId", sql.Int, organizationId)
    .query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE RoleID = @roleId AND OrganizationID = @organizationId)
        THROW 51050, 'Choose a role in your organization', 1;
      IF @managerId IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM dbo.Employees WHERE EmployeeID = @managerId AND OrganizationID = @organizationId
      ) THROW 51051, 'Choose a person in your organization', 1;
      DECLARE @updated TABLE(EmployeeID int);
      UPDATE dbo.Employees
      SET EmployeeName = @name, RoleID = @roleId, ManagerID = @managerId
      OUTPUT inserted.EmployeeID INTO @updated
      WHERE EmployeeID = @id AND OrganizationID = @organizationId;
      SELECT EmployeeID FROM @updated;
    `);
  if (!result.recordset[0]) throw new PersonnelRecordError("Person not found");
}

export async function getEmployeeHistory(employeeId: number, organizationId: number): Promise<EmployeeHistoryEntry[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("employeeId", sql.Int, employeeId)
    .input("organizationId", sql.Int, organizationId)
    .query<EmployeeHistoryEntry>(`
      SELECT
        CAST(EmployeeHistoryID AS nvarchar(20)) AS id,
        CAST(EmployeeID AS nvarchar(20)) AS employeeId,
        CONVERT(varchar(10), EventDate, 23) AS eventDate,
        Notes AS notes
      FROM dbo.EmployeeHistory
      WHERE EmployeeID = @employeeId AND OrganizationID = @organizationId
      ORDER BY EventDate DESC, EmployeeHistoryID DESC
    `);
  return result.recordset;
}

export async function addEmployeeHistory(input: {
  employeeId: number;
  eventDate: string;
  notes: string;
}, organizationId: number): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("employeeId", sql.Int, input.employeeId)
    .input("eventDate", sql.Date, new Date(`${input.eventDate}T00:00:00`))
    .input("notes", sql.NVarChar(sql.MAX), input.notes)
    .input("organizationId", sql.Int, organizationId)
    .query(`
      INSERT INTO dbo.EmployeeHistory (EmployeeID, EventDate, Notes, OrganizationID)
      SELECT @employeeId, @eventDate, @notes, @organizationId
      FROM dbo.Employees WHERE EmployeeID = @employeeId AND OrganizationID = @organizationId;
      IF @@ROWCOUNT = 0 THROW 51052, 'Employee not found', 1;
    `);
}
