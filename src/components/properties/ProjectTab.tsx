import { useState } from "react";
import { usePlot } from "../../geometry/plot/PlotContext";
import { Disclosure, Heading, Notice, inputClass, primaryButtonClass, selectClass } from "./panelKit";

const DETAIL_FIELDS=[["clientName","Client / owner"],["projectNumber","Project number"],["siteAddress","Site address"],["preparedBy","Prepared by"],["revision","Revision"]] as const;

export function ProjectTab(){
  const {projectDetails,updateProjectDetails,issues,addProjectIssue,assumptions,addProjectAssumption,updateProjectAssumption,removeProjectAssumption}=usePlot();
  const [issueDraft,setIssueDraft]=useState("");
  const [assumptionDraft,setAssumptionDraft]=useState("");
  const [assumptionSource,setAssumptionSource]=useState("");
  const openAssumptions=assumptions.filter(item=>item.status==="assumed").length;
  return <div className="space-y-3">
    <section className="space-y-1.5">
      <Heading>Project details</Heading>
      <p className="text-[10px] leading-snug text-slate-400">Printed on the project report title block.</p>
      <div className="grid grid-cols-2 gap-2">
        {DETAIL_FIELDS.map(([key,label])=><label key={key} className={`text-[10px] text-slate-500 ${key==="siteAddress"?"col-span-2":""}`}>{label}<input type="text" value={projectDetails[key]} onChange={event=>updateProjectDetails({[key]:event.target.value})} className={`mt-0.5 ${inputClass}`}/></label>)}
        <label className="col-span-2 text-[10px] text-slate-500">Notes<textarea value={projectDetails.notes} onChange={event=>updateProjectDetails({notes:event.target.value})} rows={3} className={`mt-0.5 resize-y ${inputClass}`}/></label>
      </div>
    </section>

    <Disclosure title="Issue history" hint={issues.length?`${issues.length} recorded`:undefined}>
      <p className="text-[10px] leading-snug text-slate-500">Record each revision you issue to the client. Set the revision above first.</p>
      <textarea value={issueDraft} onChange={event=>setIssueDraft(event.target.value)} rows={2} placeholder="e.g. Initial site layout for client review" className={`mt-1.5 resize-y ${inputClass}`}/>
      <button type="button" disabled={!projectDetails.revision.trim()||!issueDraft.trim()} onClick={()=>{if(addProjectIssue(issueDraft))setIssueDraft("");}} className={`mt-1.5 ${primaryButtonClass}`}>Record issue · Rev {projectDetails.revision.trim()||"—"}</button>
      {issues.length>0&&<ol className="mt-2 space-y-1">{[...issues].reverse().map(issue=><li key={issue.id} className="rounded border border-slate-200 bg-white p-2"><div className="flex items-baseline justify-between gap-2"><span className="text-[11px] font-semibold text-slate-800">Rev {issue.revision}</span><time className="text-[10px] text-slate-500">{issue.date}</time></div><p className="mt-0.5 text-[11px] text-slate-700">{issue.description}</p>{issue.author&&<p className="mt-0.5 text-[10px] text-slate-500">By {issue.author}</p>}</li>)}</ol>}
    </Disclosure>

    <Disclosure title="Assumptions" hint={openAssumptions?`${openAssumptions} open`:undefined}>
      <p className="text-[10px] leading-snug text-slate-500">Items still to be confirmed. Open assumptions are listed on the report.</p>
      <textarea value={assumptionDraft} onChange={event=>setAssumptionDraft(event.target.value)} rows={2} placeholder="e.g. Existing utility location to be confirmed" className={`mt-1.5 resize-y ${inputClass}`}/>
      <div className="mt-1.5 flex gap-1.5"><input value={assumptionSource} onChange={event=>setAssumptionSource(event.target.value)} aria-label="Assumption source" placeholder="Source (optional)" className={inputClass}/><button type="button" onClick={()=>{if(addProjectAssumption(assumptionDraft,assumptionSource)){setAssumptionDraft("");setAssumptionSource("");}}} disabled={!assumptionDraft.trim()} className={primaryButtonClass}>Add</button></div>
      {assumptions.length>0&&<div className="mt-2 space-y-1">{assumptions.map(item=><div key={item.id} className="rounded border border-slate-200 bg-white p-2">
        <div className="flex items-start gap-1.5"><textarea aria-label="Assumption description" value={item.description} onChange={event=>updateProjectAssumption(item.id,{description:event.target.value})} rows={2} className={`resize-y ${inputClass}`}/><button type="button" onClick={()=>removeProjectAssumption(item.id)} aria-label="Remove assumption" className="px-1 text-xs text-slate-400 hover:text-red-600">×</button></div>
        <div className="mt-1 flex gap-1.5"><select aria-label="Assumption status" value={item.status} onChange={event=>updateProjectAssumption(item.id,{status:event.target.value as "assumed"|"confirmed"})} className={`${selectClass} py-1 text-[11px]`}><option value="assumed">Unconfirmed</option><option value="confirmed">Confirmed</option></select><input aria-label="Assumption source" value={item.source??""} onChange={event=>updateProjectAssumption(item.id,{source:event.target.value})} placeholder="Source" className={`${inputClass} py-1 text-[11px]`}/></div>
      </div>)}</div>}
    </Disclosure>

    <Notice>Projects are saved in this browser only. Use <b>Export → Project backup (JSON)</b> to keep a copy or move to another device.</Notice>
    <p className="text-[10px] text-slate-400"><a href="/contact" className="underline hover:text-blue-700">Contact</a> · report a problem or suggest an improvement.</p>
  </div>;
}
