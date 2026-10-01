import { NextRequest, NextResponse } from "next/server";
import { getEstimateDetails } from "@/app/lib/estimates";
import { renderEstimatePdf } from "@/app/lib/estimate-pdf";

export async function GET(request: NextRequest, { params }: { params: Promise<{ estimateId: string }> }) {
  const estimateId = Number((await params).estimateId);
  if (!Number.isInteger(estimateId) || estimateId < 1) {
    return NextResponse.json({ error: "Invalid estimate ID" }, { status: 400 });
  }

  let details;
  try {
    details = await getEstimateDetails(estimateId);
  } catch {
    return NextResponse.json({ error: "Unable to load estimate" }, { status: 500 });
  }
  if (!details) return NextResponse.json({ error: "Estimate not found" }, { status: 404 });

  const pdfBuffer = await renderEstimatePdf(details);
  const fileName = details.estimateName.replace(/[^a-z0-9-_ ]/gi, "").trim() || "estimate";

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}.pdf"`,
    },
  });
}
