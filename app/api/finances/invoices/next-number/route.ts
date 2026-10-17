import { NextRequest, NextResponse } from "next/server";
import { ProjectAccessError, requireProjectSession } from "@/app/lib/project-access";
import { peekNextInvoiceNumber } from "@/app/lib/invoice-settings";

export async function GET(request: NextRequest) {
  try {
    const session = await requireProjectSession(request, "finances.read");
    const organizationId = session.organization.organizationId;
    const nextInvoiceNumber = await peekNextInvoiceNumber(organizationId);
    return NextResponse.json({
      nextInvoiceNumber,
      organizationId,
    });
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Failed to peek next invoice number", error);
    return NextResponse.json(
      { error: "Unable to retrieve next invoice number" },
      { status: 500 }
    );
  }
}
