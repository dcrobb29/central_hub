"use client";
import { Fragment,useEffect,useState,type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ChangeContext,ChangeInput,ChangeDetails,ContractChange,ChangeSourceLine } from "@/app/lib/contract-changes";
import type { UnitPreset } from "@/app/lib/unit-presets";
import { defaultUnitAbbreviation } from "@/app/lib/unit-presets";
import Modal from "./modal";
import { DocumentNotes } from "./document-notes";
import ContractChangeFields, { blankContractChange, contractChangePreview } from "./contract-change-fields";

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
function ContractChangeScope({query,change}:{query:string;change:ContractChange}) {
  const [input,setInput]=useState<ChangeDetails|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    void fetch(`/api/contract-changes?${query}&changeId=${change.changeId}`,{signal:controller.signal})
      .then(responseData).then(result=>{if(!controller.signal.aborted)setInput(result.input);})
      .catch((e:unknown)=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Unable to load scope.");});
    return ()=>controller.abort();
  },[query,change.changeId,attempt]);
  return <section className="contractChangeScope" aria-label={`${code(change)} scope`}>
    <h3>{code(change)}: {change.title}</h3>
    <p><strong>Separate net value: {money(change.quotedTotal)}</strong> / {change.status}</p>
    {error?<><p className="financeImportError" role="alert">{error}</p>
      <button type="button" onClick={()=>{setError(null);setAttempt(value=>value+1);}}>Retry loading scope</button></>:
      !input?<p role="status">Loading scope...</p>:<>
        <div className="projectScopeTableWrapper"><table className="invoiceTable">
          <thead><tr><th>Scope</th><th>Add / Deduct</th><th>Description</th><th>Type</th><th>Quantity</th><th>Unit</th><th>Sell value</th></tr></thead>
          <tbody>{input.lines.map((line,index)=><tr key={index}>
            <td>{line.scopeName??"Ungrouped"}</td><td>{line.operation}</td><td>{line.description}</td><td>{line.lineType}</td>
            <td>{line.quantity}</td><td>{line.unitName}</td>
            <td>{money(line.operation==="Deduct"?-line.sellAmount:line.sellAmount)}</td>
          </tr>)}</tbody>
        </table></div>
        <DocumentNotes internalNotes={input.internalNotes} customerNotes={input.customerNotes}/>
      </>}
  </section>;
}
export default function ContractChangesPanel({context}:{context:ChangeContext}) {
  const router=useRouter();
  const query=context.projectId?`projectId=${context.projectId}`:`estimateId=${context.estimateId}`;
  const [data,setData]=useState<Data|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [expandedChangeId,setExpandedChangeId]=useState<number|null>(null);
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
    return blankContractChange(defaultUnitAbbreviation(data?.unitPresets??[]));
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
  const preview=input?contractChangePreview(input,data?.sourceLines??[]):0;
  const editable=data?.canEdit&&data.parent.engagementType==="Project"&&data.parent.projectStatus!=="Complete"&&
    (context.projectId||data.parent.status==="Draft"||data.parent.status==="Sent");
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
          <tbody>{data.changes.map(c=><Fragment key={c.changeId}><tr>
            <td>{code(c)}<br/>EST-{c.documentEstimateId}{c.sourceAlternateId&&<small>From ALT-{String(c.sourceAlternateId).padStart(6,"0")}</small>}</td>
            <td>{c.title}</td><td>{c.status} / v{c.version}</td><td>{money(c.quotedTotal)}</td>
            <td>{c.approvedAt?`${c.approvedAt}: ${c.approvalReference}`:"Not approved"}</td>
            <td className="contractActions">
              <button type="button" aria-expanded={expandedChangeId===c.changeId} disabled={busy}
                onClick={()=>setExpandedChangeId(current=>current===c.changeId?null:c.changeId)}>
                {expandedChangeId===c.changeId?"Hide scope":"View scope"}
              </button>
              {editable&&c.status!=="Approved"&&c.kind===(context.projectId?"ChangeOrder":"Alternate")&&
                <button type="button" disabled={busy} onClick={()=>void open(c)}>Edit</button>}
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
          </tr>{expandedChangeId===c.changeId&&<tr><td colSpan={6}>
            <ContractChangeScope key={`${c.changeId}:${c.version}`} query={query} change={c}/>
          </td></tr>}</Fragment>)}{!data.changes.length&&<tr><td colSpan={6}>No alternates or change orders yet.</td></tr>}</tbody>
        </table></div>
      </>}
    </>}
    {editor&&input&&<Modal titleId="contractEditorTitle" title={editor.change?`${code(editor.change)}: ${editor.change.title}`:context.projectId?"New change order":"New alternate"}
      eyebrow="CONTRACT CHANGES" className="estimateDialog" onClose={()=>{if(!busy)setEditor(null);}} closeDisabled={busy}>
      <form onSubmit={save}>
        {error&&<p className="financeImportError" role="alert">{error}</p>}
        <ContractChangeFields input={input} sources={data?.sourceLines??[]} unitPresets={data?.unitPresets??[]}
          disabled={busy||editor.readOnly} onChange={value=>setEditor(current=>current?{...current,input:value}:current)}/>
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
