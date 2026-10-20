import crypto from "node:crypto";
import { isIP } from "node:net";
import sql from "mssql";
import { getPool } from "./db";
import { hashPassword } from "./auth";

const OWNER_PERMISSIONS = [
  "catalogs.read", "catalogs.write", "customers.read", "customers.write",
  "finances.read", "finances.write", "members.manage", "organization.manage",
  "personnel.read", "personnel.write", "planning.read", "planning.write",
  "projects.read", "projects.write", "sales.read", "sales.write", "subscription.manage",
] as const;

export type RegistrationInput = {
  email: string;
  displayName: string;
  organizationName: string;
};

export function parseRegistrationInput(value: unknown): RegistrationInput | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (typeof body.email !== "string" || typeof body.displayName !== "string"
    || typeof body.organizationName !== "string") return null;
  const email = body.email.trim().toLowerCase();
  const displayName = body.displayName.trim();
  const organizationName = body.organizationName.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || displayName.length < 1 || displayName.length > 150
    || organizationName.length < 1 || organizationName.length > 150) return null;
  return { email, displayName, organizationName };
}

function keyedRateHash(scope: string, identifier: string): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) throw new Error("SESSION_SECRET is not configured.");
  return crypto.createHmac("sha256", secret).update(`${scope}\0${identifier}`).digest();
}

export async function consumeRateLimit(scope: string, identifier: string, limit: number, windowSeconds: number): Promise<boolean> {
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowSeconds)
    || windowSeconds < 60 || windowSeconds % 60 !== 0) {
    throw new Error("Invalid authentication rate-limit configuration.");
  }
  const pool = await getPool();
  const result = await pool.request()
    .input("scope", sql.VarChar(32), scope)
    .input("keyHash", sql.VarBinary(32), keyedRateHash(scope, identifier))
    .input("limit", sql.Int, limit)
    .input("windowSeconds", sql.Int, windowSeconds)
    .query<{ Allowed: boolean }>(`
      SET XACT_ABORT ON;
      DECLARE @now datetime2(0) = SYSUTCDATETIME();
      DECLARE @windowMinutes int = @windowSeconds / 60;
      DECLARE @window datetime2(0) = DATEADD(minute,
        (DATEDIFF(minute, CONVERT(datetime2(0), '1970-01-01'), @now) / @windowMinutes) * @windowMinutes,
        CONVERT(datetime2(0), '1970-01-01'));
      BEGIN TRANSACTION;
      UPDATE dbo.AuthenticationRateLimits WITH (UPDLOCK, SERIALIZABLE)
        SET RequestCount = RequestCount + 1
        WHERE Scope = @scope AND KeyHash = @keyHash AND WindowStartedAt = @window;
      IF @@ROWCOUNT = 0
        INSERT INTO dbo.AuthenticationRateLimits (Scope, KeyHash, WindowStartedAt, RequestCount)
        VALUES (@scope, @keyHash, @window, 1);
      DECLARE @count int = (SELECT RequestCount FROM dbo.AuthenticationRateLimits
        WHERE Scope = @scope AND KeyHash = @keyHash AND WindowStartedAt = @window);
      DELETE TOP (1000) FROM dbo.AuthenticationRateLimits WHERE WindowStartedAt < DATEADD(day, -1, @now);
      COMMIT TRANSACTION;
      SELECT CONVERT(bit, CASE WHEN @count <= @limit THEN 1 ELSE 0 END) AS Allowed;
    `);
  return result.recordset[0]?.Allowed === true;
}

export async function requestAccountVerification(input: RegistrationInput, tokenHash: Buffer): Promise<boolean> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    await transaction.request().query(`
      DELETE TOP (100) FROM dbo.PendingAccountVerifications
      WHERE ExpiresAt <= SYSUTCDATETIME()
    `);
    const exists = await transaction.request().input("email", sql.NVarChar(254), input.email)
      .query<{ UserID: number }>(`
        SELECT UserID FROM dbo.Users WITH (UPDLOCK, HOLDLOCK)
        WHERE NormalizedEmail = @email
      `);
    if (exists.recordset.length) {
      await transaction.commit();
      return false;
    }
    await transaction.request().input("email", sql.NVarChar(254), input.email)
      .query("DELETE FROM dbo.PendingAccountVerifications WHERE NormalizedEmail = @email");
    await transaction.request()
      .input("email", sql.NVarChar(254), input.email)
      .input("displayName", sql.NVarChar(150), input.displayName)
      .input("organizationName", sql.NVarChar(150), input.organizationName)
      .input("tokenHash", sql.VarBinary(32), tokenHash)
      .query(`
        INSERT INTO dbo.PendingAccountVerifications
          (NormalizedEmail, DisplayName, OrganizationName, TokenHash, ExpiresAt)
        VALUES (@email, @displayName, @organizationName, @tokenHash, DATEADD(minute, 30, SYSUTCDATETIME()))
      `);
    await transaction.commit();
    return true;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function removePendingVerification(tokenHash: Buffer): Promise<void> {
  const pool = await getPool();
  await pool.request().input("tokenHash", sql.VarBinary(32), tokenHash)
    .query("DELETE FROM dbo.PendingAccountVerifications WHERE TokenHash = @tokenHash");
}

export type VerifiedAccount = { userId: number; email: string; displayName: string };

export async function completeVerifiedAccount(tokenHash: Buffer, password: string): Promise<VerifiedAccount | null> {
  if (password.length < 12 || password.length > 128) throw new Error("Invalid account password length.");
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const pending = await transaction.request().input("tokenHash", sql.VarBinary(32), tokenHash)
      .query<{
        NormalizedEmail: string;
        DisplayName: string;
        OrganizationName: string;
        IsExpired: boolean;
      }>(`
        SELECT NormalizedEmail, DisplayName, OrganizationName,
          CONVERT(bit, CASE WHEN ExpiresAt <= SYSUTCDATETIME() THEN 1 ELSE 0 END) AS IsExpired
        FROM dbo.PendingAccountVerifications WITH (UPDLOCK, HOLDLOCK)
        WHERE TokenHash = @tokenHash
      `);
    const record = pending.recordset[0];
    if (!record) {
      await transaction.commit();
      return null;
    }
    if (record.IsExpired) {
      await transaction.request().input("tokenHash", sql.VarBinary(32), tokenHash)
        .query("DELETE FROM dbo.PendingAccountVerifications WHERE TokenHash = @tokenHash");
      await transaction.commit();
      return null;
    }
    const existing = await transaction.request().input("email", sql.NVarChar(254), record.NormalizedEmail)
      .query<{ UserID: number }>("SELECT UserID FROM dbo.Users WITH (UPDLOCK, HOLDLOCK) WHERE NormalizedEmail = @email");
    if (existing.recordset.length) {
      await transaction.request().input("tokenHash", sql.VarBinary(32), tokenHash)
        .query("DELETE FROM dbo.PendingAccountVerifications WHERE TokenHash = @tokenHash");
      await transaction.commit();
      return null;
    }
    const permissionsRequest = transaction.request();
    OWNER_PERMISSIONS.forEach((permission, index) => {
      permissionsRequest.input(`permission${index}`, sql.VarChar(64), permission);
    });
    const permissions = await permissionsRequest.query<{ PermissionCount: number }>(`
      SELECT COUNT(*) AS PermissionCount FROM dbo.Permissions
      WHERE PermissionKey IN (${OWNER_PERMISSIONS.map((_, index) => `@permission${index}`).join(",")})
    `);
    if (permissions.recordset[0]?.PermissionCount !== OWNER_PERMISSIONS.length) {
      throw new Error("The permission catalog is missing one or more required owner permissions.");
    }

    const organizationKey = crypto.randomUUID().replace(/-/g, "");
    const organization = await transaction.request()
      .input("organizationKey", sql.VarChar(80), organizationKey)
      .input("organizationName", sql.NVarChar(150), record.OrganizationName)
      .query<{ OrganizationID: number }>(`
        INSERT INTO dbo.Organizations (OrganizationKey, OrganizationName, Status)
        OUTPUT inserted.OrganizationID
        VALUES (@organizationKey, @organizationName, 'Trial')
      `);
    const organizationId = organization.recordset[0].OrganizationID;
    const passwordHash = hashPassword(password);
    const user = await transaction.request()
      .input("email", sql.NVarChar(254), record.NormalizedEmail)
      .input("displayName", sql.NVarChar(150), record.DisplayName)
      .input("passwordHash", sql.NVarChar(255), passwordHash)
      .query<{ UserID: number }>(`
        INSERT INTO dbo.Users (Email, DisplayName, IsActive, PasswordHash)
        OUTPUT inserted.UserID
        VALUES (@email, @displayName, 1, @passwordHash)
      `);
    const userId = user.recordset[0].UserID;
    const membership = await transaction.request()
      .input("organizationId", sql.Int, organizationId)
      .input("userId", sql.Int, userId)
      .query<{ MembershipID: number }>(`
        INSERT INTO dbo.OrganizationMemberships (OrganizationID, UserID, IsActive)
        OUTPUT inserted.MembershipID
        VALUES (@organizationId, @userId, 1)
      `);
    const role = await transaction.request().input("organizationId", sql.Int, organizationId)
      .query<{ AccessRoleID: number }>(`
        INSERT INTO dbo.AccessRoles (OrganizationID, RoleKey, RoleName)
        OUTPUT inserted.AccessRoleID
        VALUES (@organizationId, 'Owner', N'Owner')
      `);
    const roleId = role.recordset[0].AccessRoleID;
    const rolePermissionsRequest = transaction.request()
      .input("organizationId", sql.Int, organizationId)
      .input("roleId", sql.Int, roleId);
    OWNER_PERMISSIONS.forEach((permission, index) => {
      rolePermissionsRequest.input(`permission${index}`, sql.VarChar(64), permission);
    });
    await rolePermissionsRequest.query(`
        INSERT INTO dbo.AccessRolePermissions (OrganizationID, AccessRoleID, PermissionKey)
        SELECT @organizationId, @roleId, PermissionKey
        FROM dbo.Permissions
        WHERE PermissionKey IN (${OWNER_PERMISSIONS.map((_, index) => `@permission${index}`).join(",")})
      `);
    await transaction.request()
      .input("organizationId", sql.Int, organizationId)
      .input("membershipId", sql.Int, membership.recordset[0].MembershipID)
      .input("roleId", sql.Int, roleId)
      .query(`
        INSERT INTO dbo.MembershipAccessRoles (OrganizationID, MembershipID, AccessRoleID)
        VALUES (@organizationId, @membershipId, @roleId)
      `);
    await transaction.request().input("organizationId", sql.Int, organizationId)
      .input("companyName", sql.NVarChar(150), record.OrganizationName)
      .query(`
        INSERT INTO dbo.OrganizationInvoiceSettings (OrganizationID, CompanyName)
        VALUES (@organizationId, @companyName)
      `);
    await transaction.request().input("tokenHash", sql.VarBinary(32), tokenHash)
      .query("DELETE FROM dbo.PendingAccountVerifications WHERE TokenHash = @tokenHash");
    await transaction.commit();
    return { userId, email: record.NormalizedEmail, displayName: record.DisplayName };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export function verificationTokenHash(token: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const decoded = Buffer.from(token, "base64url");
  return decoded.length === 32 && decoded.toString("base64url") === token
    ? crypto.createHash("sha256").update(decoded).digest()
    : null;
}

export function createVerificationToken() {
  const bytes = crypto.randomBytes(32);
  return { token: bytes.toString("base64url"), hash: crypto.createHash("sha256").update(bytes).digest() };
}

export function accountSignupEnabled() {
  return process.env.ACCOUNT_SIGNUP_ENABLED === "true";
}

export function requestAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").map(value => value.trim()).filter(Boolean);
  const address = forwarded?.at(-1);
  if (!address) {
    console.warn("Client address is missing; using a shared authentication rate-limit bucket");
    return "unknown";
  }

  let ip = address;
  if (!isIP(ip)) {
    const endpoint = /^(?:\[([^\]]+)\]|([^:]+)):(\d{1,5})$/.exec(address);
    const bracketed = /^\[([^\]]+)\]$/.exec(address);
    if (endpoint && Number(endpoint[3]) <= 65535) {
      const host = endpoint[1] ?? endpoint[2];
      if (isIP(host) !== (endpoint[1] ? 6 : 4)) throw new Error("Invalid forwarded client address.");
      ip = host;
    } else if (bracketed && isIP(bracketed[1]) === 6) {
      ip = bracketed[1];
    } else {
      throw new Error("Invalid forwarded client address.");
    }
  }
  return isIP(ip) === 6 ? new URL(`http://[${ip}]/`).hostname.slice(1, -1) : ip;
}
