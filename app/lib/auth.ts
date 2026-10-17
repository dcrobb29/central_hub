import crypto from "node:crypto";
import sql from "mssql";
import { getPool } from "./db";
import { ProjectAccessError } from "./project-access-error";

export const SESSION_COOKIE_NAME = "central_hub_session";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("SESSION_SECRET must be configured with at least 32 bytes.");
  }
  return secret;
}

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

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 600000, 32, "sha256").toString("hex");
  return `pbkdf2:600000:${salt}:${hash}`;
}

export function verifyPassword(passwordInput: string, storedHash: string | null | undefined): boolean {
  if (!passwordInput || !storedHash) return false;
  const match = /^pbkdf2:([1-9][0-9]{0,6}):([a-f0-9]{32}):([a-f0-9]{64})$/.exec(storedHash);
  if (!match) return false;
  const iterations = Number(match[1]);
  if (iterations < 10000 || iterations > 1000000) return false;
  const derived = crypto.pbkdf2Sync(passwordInput, match[2], iterations, 32, "sha256");
  return crypto.timingSafeEqual(derived, Buffer.from(match[3], "hex"));
}

export function signSessionToken(user: { userId: number; email: string; displayName: string }): string {
  const payload: SessionPayload = {
    userId: user.userId,
    email: user.email.trim().toLowerCase(),
    displayName: user.displayName,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", sessionSecret()).update(payloadB64).digest("base64url");
  return `${payloadB64}.${signature}`;
}

export function verifySessionToken(token: string | null | undefined): SessionPayload | null {
  if (!token || typeof token !== "string") return null;
  const dotIndex = token.indexOf(".");
  if (dotIndex === -1) return null;

  const payloadB64 = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);

  const expectedSignature = crypto.createHmac("sha256", sessionSecret()).update(payloadB64).digest("base64url");
  const signatureBytes = Buffer.from(signature, "utf8");
  const expectedBytes = Buffer.from(expectedSignature, "utf8");
  if (signatureBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(signatureBytes, expectedBytes)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as SessionPayload;
    if (!payload || typeof payload !== "object") return null;
    if (!Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    if (!Number.isSafeInteger(payload.userId) || payload.userId < 1 ||
      typeof payload.email !== "string" || !payload.email.includes("@") ||
      typeof payload.displayName !== "string") return null;
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
      error: "Invalid email or password.",
    };
  }

  if (!user.IsActive) {
    return {
      success: false,
      error: "Invalid email or password.",
    };
  }

  const isValidPassword = verifyPassword(passwordInput, user.PasswordHash);
  if (!isValidPassword) {
    return {
      success: false,
      error: "Invalid email or password.",
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

export async function verifyActiveSessionToken(
  token: string | null | undefined,
): Promise<(SessionPayload & { organizationId: number }) | null> {
  const payload = verifySessionToken(token);
  if (!payload) return null;

  const pool = await getPool();
  const result = await pool.request()
    .input("userId", sql.Int, payload.userId)
    .input("email", sql.NVarChar(254), payload.email.trim().toLowerCase())
    .query<{ OrganizationID: number }>(`
      SELECT TOP (1) m.OrganizationID
      FROM dbo.Users u
      JOIN dbo.OrganizationMemberships m ON m.UserID = u.UserID AND m.IsActive = 1
      JOIN dbo.Organizations o ON o.OrganizationID = m.OrganizationID AND o.Status <> 'Archived'
      WHERE u.UserID = @userId AND u.NormalizedEmail = @email AND u.IsActive = 1
      ORDER BY m.OrganizationID, m.MembershipID
    `);
  const membership = result.recordset[0];
  return membership ? { ...payload, organizationId: membership.OrganizationID } : null;
}

export async function getActiveOrganizationId(
  request?: Request | { cookies?: { get(name: string): { value: string } | undefined } }
): Promise<number> {
  let token: string | undefined;
  if (request) {
    if ("cookies" in request && typeof request.cookies?.get === "function") {
      token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    } else if ("headers" in request) {
      token = request.headers.get("cookie")?.split(";")
        .map((cookie) => cookie.trim())
        .find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`))
        ?.slice(SESSION_COOKIE_NAME.length + 1);
    }
  } else {
    const { cookies } = await import("next/headers");
    token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  }

  const session = await verifyActiveSessionToken(token);
  if (!session) throw new ProjectAccessError("Please sign in with an active organization account.", 401);
  return session.organizationId;
}
