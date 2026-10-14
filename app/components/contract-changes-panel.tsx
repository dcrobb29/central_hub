"use client";
import { useEffect,useState,type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ChangeContext,ChangeInput,ContractChange,ChangeSourceLine } from "@/app/lib/contract-changes";
import type { UnitPreset } from "@/app/lib/unit-presets";
import { defaultUnitAbbreviation } from "@/app/lib/unit-presets";
import { calculateChange } from "@/app/lib/contract-change-pricing";
import Modal from "./modal";
import { DocumentNotesFields } from "./document-notes";

type Data={
  parent:{title:string;engagementType:string;status:string;projectStatus:string|null;isSample?:boolean};
  changes:ContractChange[];sourceLines:ChangeSourceLine[];baseValue:number;initialContract:number;currentContract:number;
  unitPresets:UnitPreset[];canEdit:boolean;canApprove:boolean;
};
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);
const code=(c:ContractChange)=>`${c.kind==="Alternate"?"ALT":"CO"}-${String(c.changeId).padStart(6,"0")}`;
async function responseData(response:Response) {
  const result=await response.json();
  if(!response.ok) throw new Error(result.error??"Unable to update contract changes.");
  return result;
}
export default function ContractChangesPanel({context}:{context:ChangeContext}) {
  const router=useRouter();
  const query=context.projectId?`projectId=${context.projectId}`:`estimateId=${context.estimateId}`;
  const [data,setData]=useState<Data|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [editor,setEditor]=useState<{input:ChangeInput;change?:ContractChange;sourceId?:number;readOnly?:boolean}|null>(null);
  const [approval,setApproval]=useState<ContractChange|null>(null);
  const [approvalDate,setApprovalDate]=useState(new Date().toLocaleDateString("en-CA"));
  const [reference,setReference]=useState("");
  useEffect(()=>{
    const controller=new AbortController();
    void fetch(`/api/contract-changes?${query}`,{signal:controller.signal}).then(responseData)
      .then(setData).catch((e:unknown)=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Unable to load contract changes.");});
    return ()=>controller.abort();
  },[query]);
  async function reload(){
    setData(await responseData(await fetch(`/api/contract-changes?${query}`)));
    router.refresh();
  }
  function blank():ChangeInput {
    return {estimateName:"",customerName:null,internalNotes:null,customerNotes:null,engagementType:"Project",
      recurrenceFrequency:null,expectedStartDate:null,expectedEndDate:null,markupMode:"perLine",estimateMarkupPercent:0,
      taxPercent:0,roundingIncrement:0,groupingMode:"Scope",scopes:["Changed work"],lines:[{
        operation:"Add",deductLineId:null,description:"",quantity:1,unitName:defaultUnitAbbreviation(data?.unitPresets??[]),
        unitCost:0,freightAmount:0,lineMarkupPercent:0,lineType:"Material",scopeName:"Changed work",
        materialId:null,catalogUnitCostAtEntry:null,catalogPriceDate:null,
      }]};
  }
  function patch(patch:Partial<ChangeInput>){setEditor(e=>e?{...e,input:{...e.input,...patch}}:e);}
  function linePatch(index:number,patch:Partial<ChangeInput["lines"][number]>){
    setEditor(e=>e?{...e,input:{...e.input,lines:e.input.lines.map((l,i)=>i===index?{...l,...patch}:l)}}:e);
  }
  async function open(change:ContractChange,convert=false){
    setBusy(true);setError(null);
    try {
      const {input}=await responseData(await fetch(`/api/contract-changes?${query}&changeId=${change.changeId}`));
      setEditor({input,change:convert?undefined:change,sourceId:convert?change.changeId:undefined,
        readOnly:!convert&&(change.status==="Approved"||!data?.canEdit||change.kind!==(context.projectId?"ChangeOrder":"Alternate"))});
    } catch(e){setError(e instanceof Error?e.message:"Unable to open document.");}
    finally{setBusy(false);}
  }
  async function action(change:ContractChange,action:"propose"|"reject"|"approve"|"remove"){
    setBusy(true);setError(null);
    try {
      await responseData(await fetch("/api/contract-changes",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({...context,action,changeId:change.changeId,version:change.version,approvedAt:approvalDate,reference})}));
      setApproval(null);await reload();
    }catch(e){setError(e instanceof Error?e.message:"Unable to update document.");}
    finally{setBusy(false);}
  }
  async function save(event:FormEvent){
    event.preventDefault();if(!editor)return;setBusy(true);setError(null);
    try {
      const input={...editor.input,scopes:[...new Set(editor.input.lines.map(l=>l.scopeName?.trim()??"").filter(Boolean))]};
      await responseData(await fetch("/api/contract-changes",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({...context,action:"save",input,changeId:editor.change?.changeId,version:editor.change?.version,sourceAlternateId:editor.sourceId})}));
      setEditor(null);await reload();
    }catch(e){setError(e instanceof Error?e.message:"Unable to save document.");}
    finally{setBusy(false);}
  }
  const input=editor?.input;
  const pricing=input?calculateChange(input):null;
  const preview=input&&pricing?input.lines.reduce((sum,line,index)=>{
    if(line.operation==="Add")return sum+pricing.lines[index].sellAmount;
    const source=data?.sourceLines.find(s=>s.lineId===line.deductLineId);
    return source?sum-(line.quantity===source.remainingQuantity?source.sellAmount-source.deductedSell:
      Math.round(source.sellAmount*line.quantity/source.originalQuantity*100)/100):sum;
  },0):0;
  const editable=data?.canEdit&&data.parent.engagementType==="Project"&&data.parent.projectStatus!=="Complete"&&
    (context.projectId||data.parent.status==="Draft");
  return <section className="projectHubSection contractChangesPanel" aria-busy={busy}>
    <h2>{context.projectId?"Alternates & change orders":"Bid alternates"}</h2>
    <p>Draft and proposed values do not change the contract. Approved documents are locked; corrections require a new change order.</p>
    {error&&<p className="financeImportError" role="alert">{error}</p>}
    {!data?error?<button type="button" disabled={busy} onClick={()=>{
      setBusy(true);setError(null);void reload().catch((e:unknown)=>setError(e instanceof Error?e.message:"Unable to reload contract records."))
        .finally(()=>setBusy(false));
    }}>Retry loading contract records</button>:<p role="status">Loading contract records...</p>:<>
      {data.parent.isSample&&<p className="financeImportError" role="note">This is a sample job. Recording an approval creates permanent history and prevents sample-data exclusion. Leave proposals unapproved if you intend to remove the samples.</p>}
      <div className="projectHubMetrics">
        <div><span>Original base bid</span><strong>{money(data.baseValue)}</strong></div>
        <div><span>Accepted alternates</span><strong>{money(data.initialContract-data.baseValue)}</strong></div>
        <div><span>Initial contract</span><strong>{money(data.initialContract)}</strong></div>
        <div><span>Approved change orders</span><strong>{money(data.currentContract-data.initialContract)}</strong></div>
        <div><span>{context.projectId?"Current contract":"Base bid (alternates excluded)"}</span><strong>{money(data.currentContract)}</strong></div>
      </div>
      {data.parent.engagementType!=="Project"?<p>Alternates and change orders are not enabled for recurring agreements in this release.</p>:<>
        {editable&&<button type="button" disabled={busy} onClick={()=>{setError(null);setEditor({input:blank()});}}>
          {context.projectId?"New change order":"New alternate"}
        </button>}
        {!context.projectId&&<p>Select proposed alternates when marking the base bid won. Unselected alternates remain separate and can later become change-order proposals.</p>}
        <div className="projectScopeTableWrapper"><table className="invoiceTable">
          <thead><tr><th>Record</th><th>Description</th><th>Status</th><th>Net value</th><th>Approval</th><th>Actions</th></tr></thead>
          <tbody>{data.changes.map(c=><tr key={c.changeId}>
            <td>{code(c)}<br/>EST-{c.documentEstimateId}{c.sourceAlternateId&&<small>From ALT-{String(c.sourceAlternateId).padStart(6,"0")}</small>}</td>
            <td>{c.title}</td><td>{c.status} / v{c.version}</td><td>{money(c.quotedTotal)}</td>
            <td>{c.approvedAt?`${c.approvedAt}: ${c.approvalReference}`:"Not approved"}</td>
            <td className="contractActions">
              <button type="button" disabled={busy} onClick={()=>void open(c)}>{editable&&c.status!=="Approved"&&c.kind===(context.projectId?"ChangeOrder":"Alternate")?"Edit / View":"View"}</button>
              <a href={`/api/contract-changes/${c.changeId}/pdf`} target="_blank" rel="noreferrer">PDF</a>
              {editable&&c.kind===(context.projectId?"ChangeOrder":"Alternate")&&c.status!=="Approved"&&<>
                {c.status!=="Proposed"&&<button type="button" disabled={busy} onClick={()=>void action(c,"propose")}>Propose</button>}
                {c.status==="Proposed"&&context.projectId&&data.canApprove&&<button type="button" disabled={busy}
                  onClick={()=>{setError(null);setReference("");setApproval(c);}}>Record approval</button>}
                {c.status!=="Rejected"&&<button type="button" disabled={busy} onClick={()=>void action(c,"reject")}>Reject</button>}
                <button type="button" disabled={busy} onClick={()=>{if(window.confirm("Permanently remove this unapproved draft/proposal?"))void action(c,"remove");}}>Remove</button>
              </>}
              {editable&&context.projectId&&c.kind==="Alternate"&&c.status!=="Approved"&&!data.changes.some(d=>d.sourceAlternateId===c.changeId)&&
                <button type="button" disabled={busy} onClick={()=>void open(c,true)}>Create linked change order</button>}
            </td>
          </tr>)}{!data.changes.length&&<tr><td colSpan={6}>No alternates or change orders yet.</td></tr>}</tbody>
        </table></div>
      </>}
    </>}
    {editor&&input&&<Modal titleId="contractEditorTitle" title={editor.change?`${code(editor.change)}: ${editor.change.title}`:context.projectId?"New change order":"New alternate"}
      eyebrow="CONTRACT CHANGES" className="estimateDialog" onClose={()=>{if(!busy)setEditor(null);}} closeDisabled={busy}>
      <form onSubmit={save}>
        {error&&<p className="financeImportError" role="alert">{error}</p>}
        <fieldset disabled={busy||editor.readOnly} className="financeImportGroup">
          <legend>Estimate-style pricing</legend>
          <div className="financeImportFields">
            <label className="financeImportField">Name<input required maxLength={150} value={input.estimateName} onChange={e=>patch({estimateName:e.target.value})}/></label>
            <label className="financeImportField">Markup method<select value={input.markupMode} onChange={e=>patch({markupMode:e.target.value==="estimate"?"estimate":"perLine"})}>
              <option value="perLine">Markup per line</option><option value="estimate">Markup on additions</option></select></label>
            {input.markupMode==="estimate"&&<label className="financeImportField">Markup %<input type="number" min={0} max={1000} step="0.01" value={input.estimateMarkupPercent} onChange={e=>patch({estimateMarkupPercent:Number(e.target.value)})}/></label>}
            <label className="financeImportField">Tax % on added costs<input type="number" min={0} max={100} step="0.01" value={input.taxPercent} onChange={e=>patch({taxPercent:Number(e.target.value)})}/></label>
          </div>
          <p>Deductions use the existing line&apos;s contract pricing. Enter the quantity removed; add replacement work on a separate Add line.</p>
          <div className="projectScopeTableWrapper"><table className="invoiceTable contractLineTable">
            <thead><tr><th>Add / Deduct</th><th>Existing line reduced</th><th>Scope</th><th>Description</th><th>Type</th><th>Quantity</th><th>Unit</th><th>Unit cost</th><th>Freight</th><th>Markup %</th><th>Remove</th></tr></thead>
            <tbody>{input.lines.map((line,index)=><tr key={index}>
              <td><select aria-label={`Line ${index+1} operation`} value={line.operation} onChange={e=>linePatch(index,{operation:e.target.value==="Deduct"?"Deduct":"Add",deductLineId:null})}><option>Add</option><option>Deduct</option></select></td>
              <td>{line.operation==="Deduct"?<select required value={line.deductLineId??""} aria-label={`Line ${index+1} existing work`} onChange={e=>{
                const source=data?.sourceLines.find(s=>s.lineId===Number(e.target.value));
                if(source)linePatch(index,{deductLineId:source.lineId,quantity:Math.min(1,source.remainingQuantity),unitName:source.unitName,
                  unitCost:source.unitCost,freightAmount:Number((source.freightAmount/source.originalQuantity).toFixed(4)),
                  lineMarkupPercent:source.lineMarkupPercent,lineType:source.lineType,description:`Remove ${source.description}`});
              }}><option value="">Choose existing work</option>{data?.sourceLines.filter(s=>s.remainingQuantity>0).map(s=><option value={s.lineId} key={s.lineId}>
                {s.description} ({s.remainingQuantity} {s.unitName} remaining)</option>)}</select>:"New work"}</td>
              <td><input required maxLength={150} aria-label={`Line ${index+1} scope`} value={line.scopeName??""} onChange={e=>linePatch(index,{scopeName:e.target.value})}/></td>
              <td><input required maxLength={300} aria-label={`Line ${index+1} description`} value={line.description} onChange={e=>linePatch(index,{description:e.target.value})}/></td>
              <td><select disabled={line.operation==="Deduct"} value={line.lineType} onChange={e=>linePatch(index,{lineType:e.target.value==="Labor"?"Labor":e.target.value==="Equipment"?"Equipment":"Material"})}><option>Material</option><option>Labor</option><option>Equipment</option></select></td>
              <td><input required type="number" min="0.0001" step="0.0001" aria-label={`Line ${index+1} quantity`} value={line.quantity} onChange={e=>linePatch(index,{quantity:Number(e.target.value)})}/></td>
              <td><select required disabled={line.operation==="Deduct"} value={line.unitName??""} onChange={e=>linePatch(index,{unitName:e.target.value})}><option value="">Choose unit</option>
                {data?.unitPresets.map(u=><option key={u.abbreviation} value={u.abbreviation}>{u.abbreviation}</option>)}</select></td>
              <td><input type="number" min={0} step="0.0001" disabled={line.operation==="Deduct"} aria-label={`Line ${index+1} unit cost`} value={line.unitCost} onChange={e=>linePatch(index,{unitCost:Number(e.target.value)})}/></td>
              <td><input type="number" min={0} step="0.0001" disabled={line.operation==="Deduct"} value={line.freightAmount} onChange={e=>linePatch(index,{freightAmount:Number(e.target.value)})}/></td>
              <td><input type="number" min={0} max={1000} step="0.0001" disabled={line.operation==="Deduct"||input.markupMode==="estimate"} value={line.lineMarkupPercent} onChange={e=>linePatch(index,{lineMarkupPercent:Number(e.target.value)})}/></td>
              <td><button type="button" disabled={input.lines.length===1} onClick={()=>patch({lines:input.lines.filter((_,i)=>i!==index)})}>Remove</button></td>
            </tr>)}</tbody>
          </table></div>
          <button type="button" onClick={()=>patch({lines:[...input.lines,blank().lines[0]]})}>Add line</button>
          <DocumentNotesFields internalNotes={input.internalNotes??""} customerNotes={input.customerNotes??""}
            onInternalChange={value=>patch({internalNotes:value})} onCustomerChange={value=>patch({customerNotes:value})}/>
        </fieldset>
        <p><strong>Net contract change: {money(editor.readOnly&&editor.change?editor.change.quotedTotal:preview)}</strong></p>
        <p>Saving creates a draft, not an approval. Negotiated edits return proposals to Draft and require a new proposal.</p>
        <div className="financeImportActions"><button type="button" disabled={busy} onClick={()=>setEditor(null)}>Close</button>
          {!editor.readOnly&&<button type="submit" disabled={busy}>{busy?"Saving...":"Save draft"}</button>}</div>
      </form>
    </Modal>}
    {approval&&<Modal titleId="contractApprovalTitle" title={`Record customer approval / ${code(approval)}`} eyebrow="CONTRACT APPROVAL"
      onClose={()=>{if(!busy)setApproval(null);}} closeDisabled={busy} className="financeProjectDialog">
      <form onSubmit={e=>{e.preventDefault();void action(approval,"approve");}}>
        <p>{approval.title}: {money(approval.quotedTotal)}. Approval updates scope, budget, and future billing and permanently locks this version.</p>
        {error&&<p className="financeImportError" role="alert">{error}</p>}
        <label className="financeImportField">Customer approval date<input type="date" required value={approvalDate} onChange={e=>setApprovalDate(e.target.value)}/></label>
        <label className="financeImportField">Approval reference / evidence<textarea required maxLength={500} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Signed document reference or customer's written approval"/></label>
        <div className="financeImportActions"><button type="button" disabled={busy} onClick={()=>setApproval(null)}>Cancel</button><button type="submit" disabled={busy}>{busy?"Approving...":"Approve and lock"}</button></div>
      </form>
    </Modal>}
  </section>;
}
