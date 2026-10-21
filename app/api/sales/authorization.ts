import { NextResponse, type NextRequest } from "next/server";
import { ProjectAccessError, requireProjectSession } from "@/app/lib/project-access";

export type SalesPermission = "sales.read" | "sales.write";

export async function requireSalesApiPermission(
  request: NextRequest,
  permission: SalesPermission,
): Promise<NextResponse | null> {
  try {
    await requireProjectSession(request, permission);
    return null;
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
