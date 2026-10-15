import { NextRequest, NextResponse } from "next/server";
import { getEstimateDetails } from "@/app/lib/estimates";
import { includeAlternateInEstimatePdf,renderEstimatePdf,type EstimatePdfAlternate } from "@/app/lib/estimate-pdf";
import { getContractChanges,getChangeInput } from "@/app/lib/contract-changes";
import { ProjectAccessError,requireProjectSession } from "@/app/lib/project-access";

export async function GET(request: NextRequest, { params }: { params: Promise<{ estimateId: string }> }) {
  const estimateId = Number((await params).estimateId);
  if (!Number.isInteger(estimateId) || estimateId < 1) {
    return NextResponse.json({ error: "Invalid estimate ID" }, { status: 400 });
  }

  let details;
  let alternates:EstimatePdfAlternate[]=[];
  try {
    const session=await requireProjectSession(request,"sales.read");
    const changes=await getContractChanges({estimateId},session.organization.organizationId);
    details = await getEstimateDetails(estimateId);
    if(details?.showAlternates) {
      alternates=await Promise.all(changes.changes.filter(includeAlternateInEstimatePdf).map(async c=>{
        const input=await getChangeInput(c.changeId,session.organization.organizationId);
        return {code:`ALT-${String(c.changeId).padStart(6,"0")}`,title:c.title,status:c.status,value:c.quotedTotal,
          notes:input.customerNotes,lines:input.lines};
      }));
    }
  } catch(error) {
    if(error instanceof ProjectAccessError)return NextResponse.json({error:error.message},{status:error.status});
    console.error("Estimate PDF failed",error);
    return NextResponse.json({ error: "Unable to load estimate" }, { status: 500 });
  }
  if (!details) return NextResponse.json({ error: "Estimate not found" }, { status: 404 });

  const pdfBuffer = await renderEstimatePdf(details,alternates);
  const fileName = details.estimateName.replace(/[^a-z0-9-_ ]/gi, "").trim() || "estimate";

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
