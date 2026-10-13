import { NextRequest, NextResponse } from "next/server";
import { getActiveOrganizationId } from "@/app/lib/auth";
import { peekNextInvoiceNumber } from "@/app/lib/invoice-settings";

export async function GET(request: NextRequest) {
  try {
    const organizationId = await getActiveOrganizationId(request);
    const nextInvoiceNumber = await peekNextInvoiceNumber(organizationId);
    return NextResponse.json({
      nextInvoiceNumber,
      organizationId,
    });
  } catch (error) {
    console.error("Failed to peek next invoice number", error);
    return NextResponse.json(
      { error: "Unable to retrieve next invoice number" },
      { status: 500 }
    );
  }
}
