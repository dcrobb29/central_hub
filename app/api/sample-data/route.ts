import { NextRequest, NextResponse } from "next/server";
import { getActiveOrganizationId } from "@/app/lib/auth";
import {
  isSampleDataIncluded,
  includeSampleData,
  excludeSampleData,
} from "@/app/lib/sample-data";

export async function GET(request: NextRequest) {
  try {
    const orgId = await getActiveOrganizationId(request);
    const status = await isSampleDataIncluded(orgId);
    return NextResponse.json({
      organizationId: orgId,
      hasSampleData: status.hasSampleData,
      recordCount: status.recordCount,
    });
  } catch (error) {
    console.error("Failed to check sample data status", error);
    return NextResponse.json(
      { error: "Unable to check sample data status" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const orgId = await getActiveOrganizationId(request);
    const body = await request.json().catch(() => ({}));
    const action = body?.action;

    if (action !== "include" && action !== "exclude") {
      return NextResponse.json(
        { error: "Invalid action. Expected 'include' or 'exclude'." },
        { status: 400 }
      );
    }

    if (action === "include") {
      const result = await includeSampleData(orgId);
      return NextResponse.json(result);
    } else {
      const result = await excludeSampleData(orgId);
      return NextResponse.json(result);
    }
  } catch (error) {
    console.error("Sample data toggle failed", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Sample data operation failed",
      },
      { status: 500 }
    );
  }
}
