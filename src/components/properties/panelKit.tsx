import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

/** Text input that edits a local draft and commits on blur or Enter; Escape cancels. */
export function DraftInput({value,onCommit,className,...rest}:{value:string;onCommit:(value:string)=>boolean|void}&Omit<React.InputHTMLAttributes<HTMLInputElement>,"value"|"onChange"|"onBlur">){
  const [draft,setDraft]=useState<string|null>(null);
  const commit=()=>{if(draft!==null&&draft!==value)onCommit(draft);setDraft(null);};
  return <input {...rest} value={draft??value} onFocus={event=>{setDraft(value);rest.onFocus?.(event);}} onChange={event=>setDraft(event.target.value)} onBlur={commit} onKeyDown={event=>{const input=event.currentTarget;if(event.key==="Enter")input.blur();if(event.key==="Escape"){setDraft(null);requestAnimationFrame(()=>input.blur());}rest.onKeyDown?.(event);}} className={className}/>;
}

/** Collapsible block. `reveal` opens it whenever its value changes to a truthy one (e.g. a canvas selection inside it). */
export function Disclosure({id,title,hint,badge,reveal,defaultOpen=false,children}:{id?:string;title:string;hint?:string;badge?:ReactNode;reveal?:string|null;defaultOpen?:boolean;children:ReactNode}){
  const [open,setOpen]=useState(defaultOpen);
  const [lastReveal,setLastReveal]=useState(reveal);
  if(reveal!==lastReveal){setLastReveal(reveal);if(reveal&&!open)setOpen(true);}
  return <div id={id} className="rounded-lg border border-slate-200 bg-white">
    <button type="button" onClick={()=>setOpen(value=>!value)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2 text-left">
      {open?<ChevronDown className="size-3.5 shrink-0 text-slate-400"/>:<ChevronRight className="size-3.5 shrink-0 text-slate-400"/>}
      <span className="min-w-0 flex-1 text-xs font-semibold text-slate-800">{title}{hint&&<span className="ml-1.5 font-normal text-slate-400">{hint}</span>}</span>
      {badge}
    </button>
    {open&&<div className="border-t border-slate-100 px-3 pb-3 pt-2">{children}</div>}
  </div>;
}

/** Section heading inside a tab. */
export function Heading({children,action}:{children:ReactNode;action?:ReactNode}){
  return <div className="flex items-center justify-between gap-2 pt-1"><h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{children}</h3>{action}</div>;
}

export function Notice({tone="info",children}:{tone?:"info"|"warn"|"error"|"ok";children:ReactNode}){
  const tones={info:"bg-slate-50 text-slate-600",warn:"bg-amber-50 text-amber-800",error:"bg-red-50 text-red-700",ok:"bg-emerald-50 text-emerald-800"};
  return <p role="status" className={`rounded-md px-2 py-1.5 text-[11px] leading-snug ${tones[tone]}`}>{children}</p>;
}

export const inputClass="w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-blue-400 focus:outline-none";
export const selectClass="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-blue-400 focus:outline-none";
export const buttonClass="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";
export const primaryButtonClass="rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";
export const chipClass="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 hover:border-blue-300 hover:bg-blue-50";
