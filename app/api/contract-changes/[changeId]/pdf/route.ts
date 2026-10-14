import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { getChangeInput, getContractChanges } from "@/app/lib/contract-changes";
import { getPool,sql } from "@/app/lib/db";
import { ProjectAccessError,requireProjectSession } from "@/app/lib/project-access";
export async function GET(request:NextRequest,{params}:{params:Promise<{changeId:string}>}) {
  try {
    const id=Number((await params).changeId);
    if(!Number.isSafeInteger(id)||id<1||id>2_147_483_647) throw new ProjectAccessError("Invalid change ID.",400);
    const session=await requireProjectSession(request,null);
    const pool=await getPool();
    const row=(await pool.request().input("id",sql.Int,id).input("org",sql.Int,session.organization.organizationId)
      .query<{parent:number;project:number|null;kind:string}>(`SELECT ParentEstimateID AS parent,ProjectID AS project,Kind AS kind
      FROM dbo.ContractChanges WHERE ChangeID=@id AND OrganizationID=@org`)).recordset[0];
    if(!row) throw new ProjectAccessError("Change not found.",404);
    if(!session.permissions.includes(row.kind==="ChangeOrder"?"projects.read":"sales.read"))
      throw new ProjectAccessError("You do not have permission to export this document.",403);
    const input=await getChangeInput(id,session.organization.organizationId);
    const data=await getContractChanges({estimateId:row.parent},session.organization.organizationId);
    const change=data.changes.find(c=>c.changeId===id)!;
    const amounts=(await pool.request().input("id",sql.Int,change.documentEstimateId).query<{sell:number;operation:string}>(`
      SELECT li.SellAmount AS sell,li.LineOperation AS operation FROM dbo.EstimateLineItems li
      JOIN dbo.EstimateRevisions r ON r.EstimateRevisionID=li.EstimateRevisionID WHERE r.EstimateID=@id ORDER BY li.LineNumber`)).recordset;
    const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);
    const pdf=await new Promise<Buffer>((resolve,reject)=>{
      const doc=new PDFDocument({size:"LETTER",margin:54});const chunks:Buffer[]=[];
      doc.on("data",chunk=>chunks.push(chunk));doc.on("end",()=>resolve(Buffer.concat(chunks)));doc.on("error",reject);
      doc.fontSize(18).text(`${change.kind==="Alternate"?"ALT":"CO"}-${String(id).padStart(6,"0")} / EST-${change.documentEstimateId}`);
      doc.fontSize(14).text(input.estimateName);doc.fontSize(11).text(`Project / bid: ${data.parent.title}`);
      doc.text(`Status: ${change.status} | Version: ${change.version}`).moveDown();
      doc.text(`Original bid: ${money(data.baseValue)}`);
      if(change.status==="Approved"&&change.contractBefore!==null&&change.contractAfter!==null){
        doc.text(`Contract before this approval: ${money(change.contractBefore)}`);
        doc.text(`Contract after this approval: ${money(change.contractAfter)}`).moveDown();
      }else{
        doc.text(`Initial contract: ${money(data.initialContract)}`);
        doc.text(`Current approved contract: ${money(data.currentContract)}`).moveDown();
      }
      for(const [index,line] of input.lines.entries()) {
        if(doc.y>650) doc.addPage();
        doc.font("Helvetica-Bold").text(`${line.operation}: ${line.scopeName}`);
        doc.font("Helvetica").text(`${line.description} / ${line.quantity} ${line.unitName??""}`);
        doc.text(money(amounts[index].sell*(line.operation==="Add"?1:-1)),{align:"right"}).moveDown(0.5);
      }
      doc.font("Helvetica-Bold").text(`Net contract change: ${money(change.quotedTotal)}`);
      doc.font("Helvetica").text(change.status==="Approved"?`Approved ${change.approvedAt}: ${change.approvalReference}`:"Proposal only: no contract adjustment until customer approval is recorded.");
      if(input.customerNotes) doc.moveDown().text(input.customerNotes);
      doc.end();
    });
    return new NextResponse(new Uint8Array(pdf),{headers:{"Content-Type":"application/pdf","Cache-Control":"private, no-store",
      "Content-Disposition":`inline; filename="change-${id}.pdf"`}});
  } catch(error) {
    if(error instanceof ProjectAccessError) return NextResponse.json({error:error.message},{status:error.status});
    console.error("Change document export failed",error);return NextResponse.json({error:"Unable to export the change document."},{status:500});
  }
}
