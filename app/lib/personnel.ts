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

export async function getPersonnelData(): Promise<PersonnelData> {
  const pool = await getPool();
  const [rolesResult, employeesResult] = await Promise.all([
    pool.request().query<PersonnelRole>(`
      SELECT CAST(RoleID AS nvarchar(20)) AS id, RoleName AS name
      FROM dbo.Roles
      ORDER BY RoleName
    `),
    pool.request().query<Person>(`
      SELECT
        CAST(EmployeeID AS nvarchar(20)) AS id,
        EmployeeName AS name,
        CAST(RoleID AS nvarchar(20)) AS roleId,
        CAST(ManagerID AS nvarchar(20)) AS managerId
      FROM dbo.Employees
      ORDER BY EmployeeName
    `),
  ]);

  return { roles: rolesResult.recordset, people: employeesResult.recordset };
}

export async function addRole(name: string): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("name", sql.NVarChar(80), name)
    .query("INSERT INTO dbo.Roles (RoleName) VALUES (@name)");
}

export async function addPerson(input: {
  name: string;
  roleId: number;
  relationType: "none" | "reportsTo" | "manages";
  relationPersonId: number | null;
}): Promise<number> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  let newEmployeeId = 0;

  try {
    const managerId = input.relationType === "reportsTo" ? input.relationPersonId : null;
    const inserted = await transaction
      .request()
      .input("name", sql.NVarChar(200), input.name)
      .input("roleId", sql.Int, input.roleId)
      .input("managerId", sql.Int, managerId)
      .query<{ EmployeeID: number }>(`
        INSERT INTO dbo.Employees (EmployeeName, RoleID, ManagerID)
        OUTPUT inserted.EmployeeID
        VALUES (@name, @roleId, @managerId)
      `);

    newEmployeeId = inserted.recordset[0].EmployeeID;
    if (input.relationType === "manages" && input.relationPersonId !== null) {
      await transaction
        .request()
        .input("employeeId", sql.Int, input.relationPersonId)
        .input("managerId", sql.Int, newEmployeeId)
        .query("UPDATE dbo.Employees SET ManagerID = @managerId WHERE EmployeeID = @employeeId");
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
}): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("id", sql.Int, input.id)
    .input("name", sql.NVarChar(200), input.name)
    .input("roleId", sql.Int, input.roleId)
    .input("managerId", sql.Int, input.managerId)
    .query(`
      UPDATE dbo.Employees
      SET EmployeeName = @name, RoleID = @roleId, ManagerID = @managerId
      WHERE EmployeeID = @id
    `);
}

export async function getEmployeeHistory(employeeId: number): Promise<EmployeeHistoryEntry[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("employeeId", sql.Int, employeeId)
    .query<EmployeeHistoryEntry>(`
      SELECT
        CAST(EmployeeHistoryID AS nvarchar(20)) AS id,
        CAST(EmployeeID AS nvarchar(20)) AS employeeId,
        CONVERT(varchar(10), EventDate, 23) AS eventDate,
        Notes AS notes
      FROM dbo.EmployeeHistory
      WHERE EmployeeID = @employeeId
      ORDER BY EventDate DESC, EmployeeHistoryID DESC
    `);
  return result.recordset;
}

export async function addEmployeeHistory(input: {
  employeeId: number;
  eventDate: string;
  notes: string;
}): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("employeeId", sql.Int, input.employeeId)
    .input("eventDate", sql.Date, new Date(`${input.eventDate}T00:00:00`))
    .input("notes", sql.NVarChar(sql.MAX), input.notes)
    .query(`
      INSERT INTO dbo.EmployeeHistory (EmployeeID, EventDate, Notes)
      VALUES (@employeeId, @eventDate, @notes)
    `);
}
