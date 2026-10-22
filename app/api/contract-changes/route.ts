import { NextRequest, NextResponse } from "next/server";
import { getChangeInput, getContractChanges, saveContractChange, transitionContractChange, type ChangeContext, type ChangeInput } from "@/app/lib/contract-changes";
import { ProjectAccessError, requireProjectSession } from "@/app/lib/project-access";
import { InvalidUnitPresetError } from "@/app/lib/unit-presets";
import { isRecord, parseEstimate } from "@/app/api/sales/estimates/route";
import { isCalendarDate } from "@/app/lib/recurring-dates";
import { getUnitsOfMeasurement } from "@/app/lib/units-of-measurement";

function id(value: unknown) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > 2_147_483_647) throw new ProjectAccessError("Choose a valid record.",400);
  return number;
}
function context(value: Record<string, unknown>): ChangeContext {
  if ((value.projectId == null) === (value.estimateId == null)) throw new ProjectAccessError("Choose one estimate or project.",400);
  return value.projectId != null ? { projectId:id(value.projectId) } : { estimateId:id(value.estimateId) };
}
function failure(error: unknown) {
  if (error instanceof ProjectAccessError) return NextResponse.json({error:error.message},{status:error.status});
  if (error instanceof InvalidUnitPresetError) return NextResponse.json({error:error.message},{status:400});
  console.error("Contract change request failed",error);
  return NextResponse.json({error:"Unable to update contract changes. Check the database connection and migration."},{status:500});
}
export async function GET(request: NextRequest) {
  try {
    const ctx=context(Object.fromEntries(request.nextUrl.searchParams));
    const session=await requireProjectSession(request,ctx.projectId ? "projects.read" : "sales.read");
    const data=await getContractChanges(ctx,session.organization.organizationId);
    const changeId=request.nextUrl.searchParams.get("changeId");
    if(changeId) {
      if(!data.changes.some(c=>c.changeId===id(changeId))) throw new ProjectAccessError("Change not found.",404);
      return NextResponse.json({input:await getChangeInput(id(changeId),session.organization.organizationId)});
    }
    return NextResponse.json({...data,unitPresets:await getUnitsOfMeasurement(),
      canEdit:session.permissions.includes(ctx.projectId ? "projects.write" : "sales.write"),
      canApprove:session.permissions.includes("projects.write") && session.permissions.includes("finances.write"),
      canCreateCustomer:session.permissions.includes("sales.write") && session.permissions.includes("finances.write")});
  } catch(error) {return failure(error);}
}
export async function POST(request: NextRequest) {
  try {
    const body:unknown=await request.json().catch(()=>null);
    if(!isRecord(body)) throw new ProjectAccessError("Invalid change request.",400);
    const ctx=context(body);
    const session=await requireProjectSession(request,ctx.projectId ? "projects.write" : "sales.write");
    const org=session.organization.organizationId;
    if(body.action==="save") {
      if(!isRecord(body.input)) throw new ProjectAccessError("Enter estimate-style change details.",400);
      let input:ChangeInput;
      try {
        const parsed=parseEstimate({...body.input,engagementType:"Project",roundingIncrement:0});
        const rawLines=body.input.lines;
        if(!Array.isArray(rawLines)) throw new Error("Enter change lines.");
        input={...parsed,lines:parsed.lines.map((line,index)=>{
          const raw=rawLines[index];
          if(!isRecord(raw) || !["Add","Deduct"].includes(String(raw.operation))) throw new Error("Choose Add or Deduct for each line.");
          return {...line,operation:raw.operation==="Add" ? "Add" : "Deduct",
            deductLineId:raw.operation==="Deduct" ? id(raw.deductLineId) : null};
        })};
        if(input.lines.some(l=>!l.scopeName)) throw new Error("Assign every line to a scope.");
      } catch(error) {throw new ProjectAccessError(error instanceof Error ? error.message : "Invalid pricing.",400);}
      const changeId=await saveContractChange(ctx,org,input,body.changeId==null?undefined:id(body.changeId),
        body.version==null?undefined:id(body.version),body.sourceAlternateId==null?undefined:id(body.sourceAlternateId));
      return NextResponse.json({changeId},{status:201});
    }
    if(body.action!=="propose" && body.action!=="reject" && body.action!=="approve" && body.action!=="remove") throw new ProjectAccessError("Choose a valid action.",400);
    if(body.action==="approve") {
      if(!session.permissions.includes("finances.write")) throw new ProjectAccessError("Contract approval requires finance-write permission.",403);
      if(!isCalendarDate(body.approvedAt) || typeof body.reference!=="string" || !body.reference.trim() || body.reference.length>500)
        throw new ProjectAccessError("Record the customer's approval date and reference (up to 500 characters).",400);
    }
    await transitionContractChange(ctx,org,id(body.changeId),id(body.version),body.action,session.user.userId,
      typeof body.approvedAt==="string"?body.approvedAt:"",typeof body.reference==="string"?body.reference.trim():"");
    return NextResponse.json({success:true});
  } catch(error) {return failure(error);}
}
