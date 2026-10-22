import { NextResponse, type NextRequest } from "next/server";
import { ProjectAccessError, requireProjectSession } from "@/app/lib/project-access";

export type SalesPermission = "sales.read" | "sales.write";

// Returns the caller's organization, or a ready-made error response. Libraries are scoped to this
// organization, so callers must pass it into every catalog query.
export async function authorizeSalesApi(
  request: NextRequest,
  permission: SalesPermission,
): Promise<{ organizationId: number } | NextResponse> {
  try {
    const session = await requireProjectSession(request, permission);
    return { organizationId: session.organization.organizationId };
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function requireSalesApiPermission(
  request: NextRequest,
  permission: SalesPermission,
): Promise<NextResponse | null> {
  const result = await authorizeSalesApi(request, permission);
  return result instanceof NextResponse ? result : null;
}
