import crypto from "node:crypto";
import sql from "mssql";
import { getPool } from "./db";

export const PRACTICE_PASSWORD = "Password1!";
export const SESSION_COOKIE_NAME = "central_hub_session";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

const SECRET = process.env.SESSION_SECRET || "central-hub-dev-session-secret-key-2026";

export type SessionPayload = {
  userId: number;
  email: string;
  displayName: string;
  exp: number;
};

export type AuthenticatedUser = {
  userId: number;
  email: string;
  displayName: string;
  phone: string | null;
  isActive: boolean;
};

export type LocalLoginOption = {
  email: string;
  displayName: string;
  roleName: string | null;
  organizationName: string;
};

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 32, "sha256").toString("hex");
  return `pbkdf2:10000:${salt}:${hash}`;
}

export function verifyPassword(passwordInput: string, storedHash: string | null | undefined): boolean {
  if (passwordInput === PRACTICE_PASSWORD) {
    return true;
  }
  if (!storedHash) {
    return false;
  }
  if (storedHash.startsWith("pbkdf2:")) {
    const parts = storedHash.split(":");
    if (parts.length === 4) {
      const iterations = Number(parts[1]);
      const salt = parts[2];
      const originalHash = parts[3];
      const derived = crypto.pbkdf2Sync(passwordInput, salt, iterations, 32, "sha256").toString("hex");
      return crypto.timingSafeEqual(Buffer.from(derived, "utf8"), Buffer.from(originalHash, "utf8"));
    }
  }
  return storedHash === passwordInput;
}

export function signSessionToken(user: { userId: number; email: string; displayName: string }): string {
  const payload: SessionPayload = {
    userId: user.userId,
    email: user.email.trim().toLowerCase(),
    displayName: user.displayName,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
  return `${payloadB64}.${signature}`;
}

export function verifySessionToken(token: string | null | undefined): SessionPayload | null {
  if (!token || typeof token !== "string") return null;
  const dotIndex = token.indexOf(".");
  if (dotIndex === -1) return null;

  const payloadB64 = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);

  const expectedSignature = crypto.createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expectedSignature, "utf8"))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as SessionPayload;
    if (!payload || typeof payload !== "object") return null;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    if (!payload.userId || !payload.email) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function authenticateUser(
  emailInput: string,
  passwordInput: string,
): Promise<
  | { success: true; user: AuthenticatedUser }
  | { success: false; error: string }
> {
  const email = emailInput.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { success: false, error: "Please provide a valid email address." };
  }
  if (!passwordInput) {
    return { success: false, error: "Please enter your password." };
  }

  const pool = await getPool();
  const userRes = await pool.request()
    .input("email", sql.NVarChar(254), email)
    .query<{
      UserID: number;
      Email: string;
      DisplayName: string;
      Phone: string | null;
      IsActive: boolean;
      PasswordHash: string | null;
    }>(`
      SELECT TOP (1) UserID, Email, DisplayName, Phone, IsActive, PasswordHash
      FROM dbo.Users
      WHERE NormalizedEmail = LOWER(LTRIM(RTRIM(@email)))
    `);

  const user = userRes.recordset[0];
  if (!user) {
    return {
      success: false,
      error: "No account found with this email. (Practice password is 'Password1!')",
    };
  }

  if (!user.IsActive) {
    return {
      success: false,
      error: "This account has been deactivated. Please contact your organization administrator.",
    };
  }

  const isValidPassword = verifyPassword(passwordInput, user.PasswordHash);
  if (!isValidPassword) {
    return {
      success: false,
      error: "Incorrect password. (Practice password is 'Password1!')",
    };
  }

  return {
    success: true,
    user: {
      userId: user.UserID,
      email: user.Email,
      displayName: user.DisplayName,
      phone: user.Phone,
      isActive: user.IsActive,
    },
  };
}

export async function listLocalUsersForLogin(): Promise<LocalLoginOption[]> {
  try {
    const pool = await getPool();
    const result = await pool.request().query<{
      Email: string;
      DisplayName: string;
      RoleName: string | null;
      OrganizationName: string;
    }>(`
      SELECT
        u.Email,
        u.DisplayName,
        ar.RoleName,
        o.OrganizationName
      FROM dbo.Users u
      JOIN dbo.OrganizationMemberships m ON m.UserID = u.UserID AND m.IsActive = 1
      JOIN dbo.Organizations o ON o.OrganizationID = m.OrganizationID
      LEFT JOIN dbo.MembershipAccessRoles mar ON mar.MembershipID = m.MembershipID
      LEFT JOIN dbo.AccessRoles ar ON ar.AccessRoleID = mar.AccessRoleID
      WHERE u.IsActive = 1
      ORDER BY u.UserID ASC
    `);

    return result.recordset.map((r) => ({
      email: r.Email,
      displayName: r.DisplayName,
      roleName: r.RoleName,
      organizationName: r.OrganizationName,
    }));
  } catch {
    return [];
  }
}

export async function getActiveOrganizationId(
  request?: Request | { cookies?: { get(name: string): { value: string } | undefined } }
): Promise<number> {
  try {
    let token: string | undefined;
    if (request && "cookies" in request && typeof request.cookies?.get === "function") {
      token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    } else {
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    }
    if (token) {
      const payload = verifySessionToken(token);
      if (payload?.email) {
        const pool = await getPool();
        const userResult = await pool.request()
          .input("email", sql.NVarChar(254), payload.email.trim().toLowerCase())
          .query<{ OrganizationID: number }>(`
            SELECT TOP (1) m.OrganizationID
            FROM dbo.Users u
            JOIN dbo.OrganizationMemberships m ON m.UserID = u.UserID AND m.IsActive = 1
            WHERE u.NormalizedEmail = LOWER(LTRIM(RTRIM(@email)))
          `);
        if (userResult.recordset[0]?.OrganizationID) {
          return userResult.recordset[0].OrganizationID;
        }
      }
    }
  } catch {
    // In background scripts or unit tests without Next.js request context, ignore error and fall back
  }

  try {
    const pool = await getPool();
    const fallback = await pool.request().query<{ OrganizationID: number }>(`
      SELECT TOP (1) OrganizationID FROM dbo.Organizations WHERE Status != 'Archived' ORDER BY OrganizationID ASC
    `);
    if (fallback.recordset[0]?.OrganizationID) {
      return fallback.recordset[0].OrganizationID;
    }
  } catch {
    // ignore
  }

  return 1;
}

