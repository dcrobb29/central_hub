import { getPool, sql } from "@/app/lib/db";
import {
  type OrganizationInvoiceSettings,
  getOrganizationInvoiceSettings,
} from "./invoice-settings";


export type AccountUser = {
  userId: number;
  email: string;
  displayName: string;
  phone: string | null;
  isActive: boolean;
};

export type AccountOrganization = {
  organizationId: number;
  organizationKey: string;
  organizationName: string;
  status: string;
  createdAt: string;
};

export type AccountSubscription = {
  planName: string;
  status: string;
  seatLimit: number | null;
  trialEndsAt: string | null;
};

export type AccountAccessRole = {
  accessRoleId: number;
  roleKey: string;
  roleName: string;
};

export type LinkedEmployee = {
  employeeId: number;
  name: string;
  roleId: number;
  roleName: string;
  managerId: number | null;
  managerName: string | null;
  isActive: boolean;
};

export type AccountSession = {
  user: AccountUser;
  organization: AccountOrganization;
  membership: {
    membershipId: number;
    isActive: boolean;
  };
  roles: AccountAccessRole[];
  permissions: string[];
  linkedEmployee: LinkedEmployee | null;
  subscription: AccountSubscription | null;
};

export type OrganizationMemberItem = {
  membershipId: number;
  userId: number;
  email: string;
  displayName: string;
  phone: string | null;
  isActive: boolean;
  roles: AccountAccessRole[];
  linkedEmployee: {
    employeeId: number;
    name: string;
    roleName: string;
    isActive: boolean;
  } | null;
};

export type OrganizationEmployeeItem = {
  employeeId: number;
  name: string;
  roleId: number;
  roleName: string;
  managerId: number | null;
  managerName: string | null;
  isActive: boolean;
  linkedMembershipId: number | null;
  linkedUserEmail: string | null;
  linkedUserDisplayName: string | null;
};

export type AccessRoleWithPermissions = {
  accessRoleId: number;
  roleKey: string;
  roleName: string;
  permissions: {
    permissionKey: string;
    description: string;
  }[];
};

export type OrganizationSettingsData = {
  organization: AccountOrganization;
  subscription: AccountSubscription | null;
  members: OrganizationMemberItem[];
  employees: OrganizationEmployeeItem[];
  accessRoles: AccessRoleWithPermissions[];
  allPermissions: { permissionKey: string; description: string }[];
  allPersonnelRoles: { id: number; name: string }[];
  invoiceSettings: OrganizationInvoiceSettings;
};

export async function getCurrentSession(emailOverride: string): Promise<AccountSession> {
  const email = emailOverride.trim().toLowerCase();
  if (!email) throw new Error("An authenticated email is required.");
  const pool = await getPool();

  const userResult = await pool.request()
    .input("email", sql.NVarChar(254), email)
    .query<{
      UserID: number;
      Email: string;
      DisplayName: string;
      Phone: string | null;
      IsActive: boolean;
      OrganizationID: number;
      OrganizationKey: string;
      OrganizationName: string;
      OrgStatus: string;
      OrgCreatedAt: Date;
      MembershipID: number;
      MembershipIsActive: boolean;
    }>(`
      SELECT TOP (1)
        u.UserID, u.Email, u.DisplayName, u.Phone, u.IsActive,
        o.OrganizationID, o.OrganizationKey, o.OrganizationName, o.Status AS OrgStatus, o.CreatedAt AS OrgCreatedAt,
        m.MembershipID, m.IsActive AS MembershipIsActive
      FROM dbo.Users u
      JOIN dbo.OrganizationMemberships m ON m.UserID = u.UserID AND m.IsActive = 1
      JOIN dbo.Organizations o ON o.OrganizationID = m.OrganizationID
      WHERE u.NormalizedEmail = @email AND u.IsActive = 1
    `);

  const record = userResult.recordset[0];

  if (!record) {
    throw new Error("No active organization user session found in database.");
  }

  const [rolesResult, permsResult, employeeResult, subResult] = await Promise.all([
    pool.request()
      .input("membershipId", sql.Int, record.MembershipID)
      .query<{ AccessRoleID: number; RoleKey: string; RoleName: string }>(`
        SELECT ar.AccessRoleID, ar.RoleKey, ar.RoleName
        FROM dbo.MembershipAccessRoles mar
        JOIN dbo.AccessRoles ar ON ar.AccessRoleID = mar.AccessRoleID
        WHERE mar.MembershipID = @membershipId
      `),
    pool.request()
      .input("membershipId", sql.Int, record.MembershipID)
      .query<{ PermissionKey: string }>(`
        SELECT DISTINCT arp.PermissionKey
        FROM dbo.MembershipAccessRoles mar
        JOIN dbo.AccessRolePermissions arp ON arp.AccessRoleID = mar.AccessRoleID AND arp.OrganizationID = mar.OrganizationID
        WHERE mar.MembershipID = @membershipId
      `),
    pool.request()
      .input("organizationId", sql.Int, record.OrganizationID)
      .input("membershipId", sql.Int, record.MembershipID)
      .query<{
        EmployeeID: number;
        EmployeeName: string;
        RoleID: number;
        RoleName: string;
        ManagerID: number | null;
        ManagerName: string | null;
        IsActive: boolean;
      }>(`
        SELECT
          e.EmployeeID,
          e.EmployeeName,
          e.RoleID,
          r.RoleName,
          e.ManagerID,
          m.EmployeeName AS ManagerName,
          e.IsActive
        FROM dbo.OrganizationEmployeeUsers oeu
        JOIN dbo.Employees e ON e.OrganizationID = oeu.OrganizationID AND e.EmployeeID = oeu.EmployeeID
        LEFT JOIN dbo.Roles r ON r.RoleID = e.RoleID
        LEFT JOIN dbo.Employees m ON m.EmployeeID = e.ManagerID
        WHERE oeu.OrganizationID = @organizationId AND oeu.MembershipID = @membershipId
      `),
    pool.request()
      .input("organizationId", sql.Int, record.OrganizationID)
      .query<{
        PlanName: string;
        Status: string;
        SeatLimit: number | null;
        TrialEndsAt: Date | null;
      }>(`
        SELECT TOP (1)
          sp.PlanName, os.Status, os.SeatLimit, os.TrialEndsAt
        FROM dbo.OrganizationSubscriptions os
        JOIN dbo.SubscriptionPlans sp ON sp.PlanID = os.PlanID
        WHERE os.OrganizationID = @organizationId
      `),
  ]);

  const emp = employeeResult.recordset[0];
  const sub = subResult.recordset[0];

  return {
    user: {
      userId: record.UserID,
      email: record.Email,
      displayName: record.DisplayName,
      phone: record.Phone,
      isActive: record.IsActive,
    },
    organization: {
      organizationId: record.OrganizationID,
      organizationKey: record.OrganizationKey,
      organizationName: record.OrganizationName,
      status: record.OrgStatus,
      createdAt: record.OrgCreatedAt.toISOString(),
    },
    membership: {
      membershipId: record.MembershipID,
      isActive: record.MembershipIsActive,
    },
    roles: rolesResult.recordset.map((r) => ({
      accessRoleId: r.AccessRoleID,
      roleKey: r.RoleKey,
      roleName: r.RoleName,
    })),
    permissions: permsResult.recordset.map((p) => p.PermissionKey),
    linkedEmployee: emp
      ? {
          employeeId: emp.EmployeeID,
          name: emp.EmployeeName,
          roleId: emp.RoleID,
          roleName: emp.RoleName ?? "Unassigned",
          managerId: emp.ManagerID,
          managerName: emp.ManagerName,
          isActive: emp.IsActive,
        }
      : null,
    subscription: sub
      ? {
          planName: sub.PlanName,
          status: sub.Status,
          seatLimit: sub.SeatLimit,
          trialEndsAt: sub.TrialEndsAt ? sub.TrialEndsAt.toISOString() : null,
        }
      : null,
  };
}

export async function updateProfile(
  userId: number,
  updates: { displayName?: string; phone?: string | null },
): Promise<void> {
  const pool = await getPool();
  const request = pool.request().input("userId", sql.Int, userId);

  const sets: string[] = [];
  if (updates.displayName !== undefined) {
    const trimmed = updates.displayName.trim();
    if (!trimmed) throw new Error("Display name cannot be empty");
    if (trimmed.length > 150) throw new Error("Display name cannot exceed 150 characters");
    request.input("displayName", sql.NVarChar(150), trimmed);
    sets.push("DisplayName = @displayName");
  }

  if (updates.phone !== undefined) {
    const phoneVal = updates.phone ? updates.phone.trim() : null;
    if (phoneVal && phoneVal.length > 50) throw new Error("Phone number cannot exceed 50 characters");
    request.input("phone", sql.NVarChar(50), phoneVal);
    sets.push("Phone = @phone");
  }

  if (sets.length > 0) {
    await request.query(`UPDATE dbo.Users SET ${sets.join(", ")} WHERE UserID = @userId`);
  }
}

export async function linkMembershipEmployee(
  organizationId: number,
  membershipId: number,
  employeeId: number,
): Promise<void> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const checkMem = await transaction.request()
      .input("organizationId", sql.Int, organizationId)
      .input("membershipId", sql.Int, membershipId)
      .query<{ MembershipID: number }>(`
        SELECT MembershipID FROM dbo.OrganizationMemberships
        WHERE OrganizationID = @organizationId AND MembershipID = @membershipId
      `);
    if (!checkMem.recordset[0]) throw new Error("Organization membership not found");

    const checkEmp = await transaction.request()
      .input("organizationId", sql.Int, organizationId)
      .input("employeeId", sql.Int, employeeId)
      .query<{ EmployeeID: number }>(`
        SELECT EmployeeID FROM dbo.Employees
        WHERE OrganizationID = @organizationId AND EmployeeID = @employeeId
      `);
    if (!checkEmp.recordset[0]) throw new Error("Employee not found in this organization");

    await transaction.request()
      .input("organizationId", sql.Int, organizationId)
      .input("membershipId", sql.Int, membershipId)
      .query(`
        DELETE FROM dbo.OrganizationEmployeeUsers
        WHERE OrganizationID = @organizationId AND MembershipID = @membershipId
      `);

    await transaction.request()
      .input("organizationId", sql.Int, organizationId)
      .input("employeeId", sql.Int, employeeId)
      .input("membershipId", sql.Int, membershipId)
      .query(`
        INSERT INTO dbo.OrganizationEmployeeUsers (OrganizationID, EmployeeID, MembershipID)
        VALUES (@organizationId, @employeeId, @membershipId)
      `);

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function unlinkMembershipEmployee(
  organizationId: number,
  membershipId: number,
): Promise<void> {
  const pool = await getPool();
  await pool.request()
    .input("organizationId", sql.Int, organizationId)
    .input("membershipId", sql.Int, membershipId)
    .query(`
      DELETE FROM dbo.OrganizationEmployeeUsers
      WHERE OrganizationID = @organizationId AND MembershipID = @membershipId
    `);
}

export async function getOrganizationSettings(organizationId: number): Promise<OrganizationSettingsData> {
  const pool = await getPool();

  const [orgRes, subRes, membersRes, empsRes, rolesRes, permsRes, pRolesRes, invoiceSettings] = await Promise.all([
    pool.request()
      .input("organizationId", sql.Int, organizationId)
      .query<{
        OrganizationID: number;
        OrganizationKey: string;
        OrganizationName: string;
        Status: string;
        CreatedAt: Date;
      }>(`
        SELECT OrganizationID, OrganizationKey, OrganizationName, Status, CreatedAt
        FROM dbo.Organizations
        WHERE OrganizationID = @organizationId
      `),
    pool.request()
      .input("organizationId", sql.Int, organizationId)
      .query<{
        PlanName: string;
        Status: string;
        SeatLimit: number | null;
        TrialEndsAt: Date | null;
      }>(`
        SELECT TOP (1) sp.PlanName, os.Status, os.SeatLimit, os.TrialEndsAt
        FROM dbo.OrganizationSubscriptions os
        JOIN dbo.SubscriptionPlans sp ON sp.PlanID = os.PlanID
        WHERE os.OrganizationID = @organizationId
      `),
    pool.request()
      .input("organizationId", sql.Int, organizationId)
      .query<{
        MembershipID: number;
        UserID: number;
        Email: string;
        DisplayName: string;
        Phone: string | null;
        IsActive: boolean;
        AccessRoleID: number | null;
        RoleKey: string | null;
        RoleName: string | null;
        EmployeeID: number | null;
        EmployeeName: string | null;
        EmployeeRoleName: string | null;
        EmployeeIsActive: boolean | null;
      }>(`
        SELECT
          m.MembershipID,
          u.UserID,
          u.Email,
          u.DisplayName,
          u.Phone,
          m.IsActive,
          ar.AccessRoleID,
          ar.RoleKey,
          ar.RoleName,
          e.EmployeeID,
          e.EmployeeName,
          er.RoleName AS EmployeeRoleName,
          e.IsActive AS EmployeeIsActive
        FROM dbo.OrganizationMemberships m
        JOIN dbo.Users u ON u.UserID = m.UserID
        LEFT JOIN dbo.MembershipAccessRoles mar ON mar.MembershipID = m.MembershipID
        LEFT JOIN dbo.AccessRoles ar ON ar.AccessRoleID = mar.AccessRoleID
        LEFT JOIN dbo.OrganizationEmployeeUsers oeu ON oeu.MembershipID = m.MembershipID
        LEFT JOIN dbo.Employees e ON e.EmployeeID = oeu.EmployeeID
        LEFT JOIN dbo.Roles er ON er.RoleID = e.RoleID
        WHERE m.OrganizationID = @organizationId
        ORDER BY u.DisplayName ASC
      `),
    pool.request()
      .input("organizationId", sql.Int, organizationId)
      .query<{
        EmployeeID: number;
        EmployeeName: string;
        RoleID: number;
        RoleName: string | null;
        ManagerID: number | null;
        ManagerName: string | null;
        IsActive: boolean;
        MembershipID: number | null;
        UserEmail: string | null;
        UserDisplayName: string | null;
      }>(`
        SELECT
          e.EmployeeID,
          e.EmployeeName,
          e.RoleID,
          r.RoleName,
          e.ManagerID,
          m.EmployeeName AS ManagerName,
          e.IsActive,
          oeu.MembershipID,
          u.Email AS UserEmail,
          u.DisplayName AS UserDisplayName
        FROM dbo.Employees e
        LEFT JOIN dbo.Roles r ON r.RoleID = e.RoleID
        LEFT JOIN dbo.Employees m ON m.EmployeeID = e.ManagerID
        LEFT JOIN dbo.OrganizationEmployeeUsers oeu ON oeu.OrganizationID = e.OrganizationID AND oeu.EmployeeID = e.EmployeeID
        LEFT JOIN dbo.OrganizationMemberships om ON om.MembershipID = oeu.MembershipID
        LEFT JOIN dbo.Users u ON u.UserID = om.UserID
        WHERE e.OrganizationID = @organizationId
        ORDER BY e.EmployeeName ASC
      `),
    pool.request()
      .input("organizationId", sql.Int, organizationId)
      .query<{
        AccessRoleID: number;
        RoleKey: string;
        RoleName: string;
        PermissionKey: string | null;
        PermissionDesc: string | null;
      }>(`
        SELECT
          ar.AccessRoleID,
          ar.RoleKey,
          ar.RoleName,
          p.PermissionKey,
          p.Description AS PermissionDesc
        FROM dbo.AccessRoles ar
        LEFT JOIN dbo.AccessRolePermissions arp ON arp.AccessRoleID = ar.AccessRoleID AND arp.OrganizationID = ar.OrganizationID
        LEFT JOIN dbo.Permissions p ON p.PermissionKey = arp.PermissionKey
        WHERE ar.OrganizationID = @organizationId
        ORDER BY ar.AccessRoleID ASC
      `),
    pool.request().query<{ PermissionKey: string; Description: string }>(`
      SELECT PermissionKey, Description FROM dbo.Permissions ORDER BY PermissionKey ASC
    `),
    pool.request().query<{ RoleID: number; RoleName: string }>(`
      SELECT RoleID, RoleName FROM dbo.Roles ORDER BY RoleName ASC
    `),
    getOrganizationInvoiceSettings(organizationId),
  ]);

  const orgRow = orgRes.recordset[0];
  if (!orgRow) throw new Error("Organization not found");

  const memberMap = new Map<number, OrganizationMemberItem>();
  for (const row of membersRes.recordset) {
    let item = memberMap.get(row.MembershipID);
    if (!item) {
      item = {
        membershipId: row.MembershipID,
        userId: row.UserID,
        email: row.Email,
        displayName: row.DisplayName,
        phone: row.Phone,
        isActive: row.IsActive,
        roles: [],
        linkedEmployee: row.EmployeeID
          ? {
              employeeId: row.EmployeeID,
              name: row.EmployeeName ?? "",
              roleName: row.EmployeeRoleName ?? "Unassigned",
              isActive: row.EmployeeIsActive ?? true,
            }
          : null,
      };
      memberMap.set(row.MembershipID, item);
    }
    if (row.AccessRoleID && row.RoleKey && row.RoleName) {
      if (!item.roles.some((r) => r.accessRoleId === row.AccessRoleID)) {
        item.roles.push({
          accessRoleId: row.AccessRoleID,
          roleKey: row.RoleKey,
          roleName: row.RoleName,
        });
      }
    }
  }

  const roleMap = new Map<number, AccessRoleWithPermissions>();
  for (const row of rolesRes.recordset) {
    let item = roleMap.get(row.AccessRoleID);
    if (!item) {
      item = {
        accessRoleId: row.AccessRoleID,
        roleKey: row.RoleKey,
        roleName: row.RoleName,
        permissions: [],
      };
      roleMap.set(row.AccessRoleID, item);
    }
    if (row.PermissionKey && row.PermissionDesc) {
      if (!item.permissions.some((p) => p.permissionKey === row.PermissionKey)) {
        item.permissions.push({
          permissionKey: row.PermissionKey,
          description: row.PermissionDesc,
        });
      }
    }
  }

  const sub = subRes.recordset[0];

  return {
    organization: {
      organizationId: orgRow.OrganizationID,
      organizationKey: orgRow.OrganizationKey,
      organizationName: orgRow.OrganizationName,
      status: orgRow.Status,
      createdAt: orgRow.CreatedAt.toISOString(),
    },
    subscription: sub
      ? {
          planName: sub.PlanName,
          status: sub.Status,
          seatLimit: sub.SeatLimit,
          trialEndsAt: sub.TrialEndsAt ? sub.TrialEndsAt.toISOString() : null,
        }
      : null,
    members: Array.from(memberMap.values()),
    employees: empsRes.recordset.map((e) => ({
      employeeId: e.EmployeeID,
      name: e.EmployeeName,
      roleId: e.RoleID,
      roleName: e.RoleName ?? "Unassigned",
      managerId: e.ManagerID,
      managerName: e.ManagerName,
      isActive: e.IsActive,
      linkedMembershipId: e.MembershipID,
      linkedUserEmail: e.UserEmail,
      linkedUserDisplayName: e.UserDisplayName,
    })),
    accessRoles: Array.from(roleMap.values()),
    allPermissions: permsRes.recordset.map((p) => ({
      permissionKey: p.PermissionKey,
      description: p.Description,
    })),
    allPersonnelRoles: pRolesRes.recordset.map((r) => ({
      id: r.RoleID,
      name: r.RoleName,
    })),
    invoiceSettings,
  };
}

export async function updateOrganizationName(organizationId: number, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Organization name cannot be empty");
  if (trimmed.length > 150) throw new Error("Organization name cannot exceed 150 characters");

  const pool = await getPool();
  await pool.request()
    .input("organizationId", sql.Int, organizationId)
    .input("name", sql.NVarChar(150), trimmed)
    .query("UPDATE dbo.Organizations SET OrganizationName = @name WHERE OrganizationID = @organizationId");
}

export async function addOrganizationMember(
  organizationId: number,
  input: {
    email: string;
    displayName: string;
    phone?: string | null;
    accessRoleId: number;
    linkEmployeeId?: number | null;
  },
): Promise<number> {
  const trimmedEmail = input.email.trim();
  const trimmedName = input.displayName.trim();
  if (!trimmedEmail || !trimmedEmail.includes("@")) throw new Error("Enter a valid email address");
  if (!trimmedName) throw new Error("Enter a display name");

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const roleCheck = await transaction.request()
      .input("organizationId", sql.Int, organizationId)
      .input("accessRoleId", sql.Int, input.accessRoleId)
      .query<{ AccessRoleID: number }>(`
        SELECT AccessRoleID FROM dbo.AccessRoles
        WHERE OrganizationID = @organizationId AND AccessRoleID = @accessRoleId
      `);
    if (!roleCheck.recordset[0]) throw new Error("Selected access role does not exist in this organization");

    let userId: number;
    const existingUser = await transaction.request()
      .input("email", sql.NVarChar(254), trimmedEmail)
      .query<{ UserID: number }>(`
        SELECT UserID FROM dbo.Users WHERE NormalizedEmail = LOWER(LTRIM(RTRIM(@email)))
      `);

    if (existingUser.recordset[0]) {
      userId = existingUser.recordset[0].UserID;
    } else {
      const insertedUser = await transaction.request()
        .input("email", sql.NVarChar(254), trimmedEmail)
        .input("displayName", sql.NVarChar(150), trimmedName)
        .input("phone", sql.NVarChar(50), input.phone ? input.phone.trim() : null)
        .query<{ UserID: number }>(`
          INSERT INTO dbo.Users (Email, DisplayName, Phone, PasswordHash, IsActive)
          VALUES (@email, @displayName, @phone, NULL, 0);
          SELECT CONVERT(int, SCOPE_IDENTITY()) AS UserID;
        `);
      userId = insertedUser.recordset[0].UserID;
    }

    const existingMem = await transaction.request()
      .input("organizationId", sql.Int, organizationId)
      .input("userId", sql.Int, userId)
      .query<{ MembershipID: number; IsActive: boolean }>(`
        SELECT MembershipID, IsActive FROM dbo.OrganizationMemberships
        WHERE OrganizationID = @organizationId AND UserID = @userId
      `);

    let membershipId: number;
    if (existingMem.recordset[0]) {
      membershipId = existingMem.recordset[0].MembershipID;
      await transaction.request()
        .input("membershipId", sql.Int, membershipId)
        .query("UPDATE dbo.OrganizationMemberships SET IsActive = 1 WHERE MembershipID = @membershipId");
    } else {
      const insertedMem = await transaction.request()
        .input("organizationId", sql.Int, organizationId)
        .input("userId", sql.Int, userId)
        .query<{ MembershipID: number }>(`
          INSERT INTO dbo.OrganizationMemberships (OrganizationID, UserID, IsActive)
          VALUES (@organizationId, @userId, 1);
          SELECT CONVERT(int, SCOPE_IDENTITY()) AS MembershipID;
        `);
      membershipId = insertedMem.recordset[0].MembershipID;
    }

    await transaction.request()
      .input("membershipId", sql.Int, membershipId)
      .query("DELETE FROM dbo.MembershipAccessRoles WHERE MembershipID = @membershipId");

    await transaction.request()
      .input("organizationId", sql.Int, organizationId)
      .input("membershipId", sql.Int, membershipId)
      .input("accessRoleId", sql.Int, input.accessRoleId)
      .query(`
        INSERT INTO dbo.MembershipAccessRoles (OrganizationID, MembershipID, AccessRoleID)
        VALUES (@organizationId, @membershipId, @accessRoleId)
      `);

    if (input.linkEmployeeId) {
      await transaction.request()
        .input("organizationId", sql.Int, organizationId)
        .input("employeeId", sql.Int, input.linkEmployeeId)
        .input("membershipId", sql.Int, membershipId)
        .query(`
          DELETE FROM dbo.OrganizationEmployeeUsers
          WHERE OrganizationID = @organizationId AND (EmployeeID = @employeeId OR MembershipID = @membershipId);

          INSERT INTO dbo.OrganizationEmployeeUsers (OrganizationID, EmployeeID, MembershipID)
          VALUES (@organizationId, @employeeId, @membershipId);
        `);
    }

    await transaction.commit();
    return membershipId;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function updateOrganizationMember(
  organizationId: number,
  membershipId: number,
  input: {
    accessRoleId?: number;
    isActive?: boolean;
  },
): Promise<void> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    if (input.isActive !== undefined) {
      await transaction.request()
        .input("organizationId", sql.Int, organizationId)
        .input("membershipId", sql.Int, membershipId)
        .input("isActive", sql.Bit, input.isActive ? 1 : 0)
        .query(`
          UPDATE dbo.OrganizationMemberships
          SET IsActive = @isActive
          WHERE OrganizationID = @organizationId AND MembershipID = @membershipId
        `);
    }

    if (input.accessRoleId !== undefined) {
      const roleCheck = await transaction.request()
        .input("organizationId", sql.Int, organizationId)
        .input("accessRoleId", sql.Int, input.accessRoleId)
        .query<{ AccessRoleID: number }>(`
          SELECT AccessRoleID FROM dbo.AccessRoles
          WHERE OrganizationID = @organizationId AND AccessRoleID = @accessRoleId
        `);
      if (!roleCheck.recordset[0]) throw new Error("Selected access role does not exist in this organization");

      await transaction.request()
        .input("membershipId", sql.Int, membershipId)
        .query("DELETE FROM dbo.MembershipAccessRoles WHERE MembershipID = @membershipId");

      await transaction.request()
        .input("organizationId", sql.Int, organizationId)
        .input("membershipId", sql.Int, membershipId)
        .input("accessRoleId", sql.Int, input.accessRoleId)
        .query(`
          INSERT INTO dbo.MembershipAccessRoles (OrganizationID, MembershipID, AccessRoleID)
          VALUES (@organizationId, @membershipId, @accessRoleId)
        `);
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function setEmployeeActiveStatus(
  organizationId: number,
  employeeId: number,
  isActive: boolean,
): Promise<void> {
  const pool = await getPool();
  await pool.request()
    .input("organizationId", sql.Int, organizationId)
    .input("employeeId", sql.Int, employeeId)
    .input("isActive", sql.Bit, isActive ? 1 : 0)
    .query(`
      UPDATE dbo.Employees
      SET IsActive = @isActive
      WHERE OrganizationID = @organizationId AND EmployeeID = @employeeId
    `);
}

export async function deleteOrArchiveEmployee(
  organizationId: number,
  employeeId: number,
): Promise<{ deleted: boolean; archived: boolean; message: string }> {
  const pool = await getPool();

  const refCheck = await pool.request()
    .input("organizationId", sql.Int, organizationId)
    .input("employeeId", sql.Int, employeeId)
    .query<{
      hasProjects: number;
      hasTasks: number;
      hasHistory: number;
      hasReports: number;
      hasRoutes: number;
      hasAssignments: number;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM dbo.Projects WHERE OrganizationID = @organizationId AND ProjectManagerID = @employeeId) AS hasProjects,
        (SELECT COUNT(*) FROM dbo.FieldOperationsTaskAssignments WHERE OrganizationID = @organizationId AND EmployeeID = @employeeId) AS hasTasks,
        (SELECT COUNT(*) FROM dbo.EmployeeHistory WHERE OrganizationID = @organizationId AND EmployeeID = @employeeId) AS hasHistory,
        (SELECT COUNT(*) FROM dbo.Employees WHERE OrganizationID = @organizationId AND ManagerID = @employeeId) AS hasReports,
        (SELECT COUNT(*) FROM dbo.Routes WHERE OrganizationID = @organizationId AND CrewLeadEmployeeID = @employeeId) AS hasRoutes,
        (SELECT COUNT(*) FROM dbo.ProjectResourceAssignments WHERE OrganizationID = @organizationId AND EmployeeID = @employeeId) AS hasAssignments
    `);

  const r = refCheck.recordset[0];
  const totalRefs = (r?.hasProjects ?? 0) + (r?.hasTasks ?? 0) + (r?.hasHistory ?? 0) +
    (r?.hasReports ?? 0) + (r?.hasRoutes ?? 0) + (r?.hasAssignments ?? 0);

  if (totalRefs > 0) {
    await pool.request()
      .input("organizationId", sql.Int, organizationId)
      .input("employeeId", sql.Int, employeeId)
      .query(`
        UPDATE dbo.Employees
        SET IsActive = 0
        WHERE OrganizationID = @organizationId AND EmployeeID = @employeeId
      `);
    return {
      deleted: false,
      archived: true,
      message: "Employee has historical records or reports and was archived rather than deleted.",
    };
  }

  await pool.request()
    .input("organizationId", sql.Int, organizationId)
    .input("employeeId", sql.Int, employeeId)
    .query(`
      DELETE FROM dbo.OrganizationEmployeeUsers
      WHERE OrganizationID = @organizationId AND EmployeeID = @employeeId;

      DELETE FROM dbo.Employees
      WHERE OrganizationID = @organizationId AND EmployeeID = @employeeId;
    `);

  return {
    deleted: true,
    archived: false,
    message: "Employee was removed successfully.",
  };
}
