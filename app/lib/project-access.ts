import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getCurrentSession } from "./account";
import { SESSION_COOKIE_NAME, verifySessionToken } from "./auth";
import { getPool, sql } from "./db";

export class ProjectAccessError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function requireProjectSession(request?: NextRequest, permission = "projects.read") {
  const token = request
    ? request.cookies.get(SESSION_COOKIE_NAME)?.value
    : (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  let payload;
  try {
    payload = verifySessionToken(token);
  } catch {
    throw new ProjectAccessError("Please sign in again.", 401);
  }
  if (!payload) throw new ProjectAccessError("Please sign in.", 401);
  const session = await getCurrentSession(payload.email);
  if (!session.user.isActive || !session.membership.isActive || session.user.userId !== payload.userId) {
    throw new ProjectAccessError("Your account no longer has access.", 403);
  }
  if (!session.permissions.includes(permission)) throw new ProjectAccessError("You do not have permission for this action.", 403);
  return session;
}

export async function requireProject(projectId: number, organizationId: number) {
  if (!Number.isSafeInteger(projectId) || projectId < 1 || projectId > 2_147_483_647) {
    throw new ProjectAccessError("Project not found.", 404);
  }
  const pool = await getPool();
  const result = await pool.request().input("projectId", sql.Int, projectId)
    .input("organizationId", sql.Int, organizationId)
    .query<{ projectStatus: string }>(`
      SELECT ProjectStatus AS projectStatus FROM dbo.Projects
      WHERE ProjectID = @projectId AND OrganizationID = @organizationId
    `);
  if (!result.recordset[0]) throw new ProjectAccessError("Project not found.", 404);
  return result.recordset[0];
}
