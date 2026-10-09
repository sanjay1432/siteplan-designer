import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileText, Image, Upload } from "lucide-react";
import { usePlot } from "../../geometry/plot/PlotContext";
import { useUnits } from "../../geometry/units/UnitContext";
import { exportCanvasPng, exportCanvasSvg, exportProjectJson, printCanvasPdf, printProjectReport } from "../../lib/sitePlanExport";

/** One menu for every way out of the app: report, plan images, and the JSON backup / restore. */
export function ExportMenu({planVisible}:{planVisible:boolean}){
  const {activeProjectName,exportProject,importProject,plot,metrics,setbackDistances,compassRotation,floorPlans,groundLevel,measurements,projectDetails,assumptions,issues,surveyMetadata,siteFeatures}=usePlot();
  const {unitSystem}=useUnits();
  const [open,setOpen]=useState(false);
  const [notice,setNotice]=useState("");
  const fileRef=useRef<HTMLInputElement>(null);
  const rootRef=useRef<HTMLDivElement>(null);

  useEffect(()=>{
    if(!open)return;
    const close=(event:PointerEvent)=>{if(!rootRef.current?.contains(event.target as Node))setOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false);};
    window.addEventListener("pointerdown",close);window.addEventListener("keydown",escape);
    return ()=>{window.removeEventListener("pointerdown",close);window.removeEventListener("keydown",escape);};
  },[open]);

  const canvas=()=>document.getElementById("site-plan-canvas") as SVGSVGElement|null;
  const run=(action:()=>string|void)=>{setNotice(action()??"");setOpen(false);};
  const report=()=>printProjectReport({name:activeProjectName,corners:plot.corners,boundaryEdges:plot.edges.map((edge,index)=>({label:edge.label,lengthMm:edge.actualLengthMm,setbackMm:setbackDistances[index]??0})),metrics,unitSystem,compassRotation,floors:[groundLevel,...floorPlans],measurements,details:projectDetails,assumptions,issues,survey:surveyMetadata,siteFeatures})?"":"Allow pop-ups to open the report.";

  async function importFile(file?:File){
    if(!file)return;
    try{
      const value:unknown=JSON.parse(await file.text());
      if(!importProject(value))throw new Error("This file is not a SitePlan project.");
      setNotice("Project imported.");
    }catch(error){setNotice(error instanceof Error?error.message:"Could not read this file.");}
    if(fileRef.current)fileRef.current.value="";
  }

  const item="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50";
  return <div ref={rootRef} className="relative flex items-center gap-2">
    {notice&&<span role="status" className="max-w-40 truncate text-[10px] text-slate-500">{notice}</span>}
    <button type="button" onClick={()=>setOpen(value=>!value)} aria-haspopup="menu" aria-expanded={open} className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"><Download className="size-3.5"/>Export<ChevronDown className="size-3"/></button>
    {open&&<div role="menu" className="absolute right-0 top-9 z-50 w-60 rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
      <button type="button" role="menuitem" onClick={()=>run(report)} className={item}><FileText className="size-3.5 text-teal-700"/><span><b className="block font-medium">Project report</b><small className="text-slate-500">Print or save as PDF</small></span></button>
      {planVisible&&<>
        <button type="button" role="menuitem" onClick={()=>run(()=>{const svg=canvas();if(svg)exportCanvasPng(svg,activeProjectName);})} className={item}><Image className="size-3.5 text-slate-500"/>Plan image (PNG)</button>
        <button type="button" role="menuitem" onClick={()=>run(()=>{const svg=canvas();if(svg)exportCanvasSvg(svg,activeProjectName);})} className={item}><Image className="size-3.5 text-slate-500"/>Plan drawing (SVG)</button>
        <button type="button" role="menuitem" onClick={()=>run(()=>{const svg=canvas();return svg&&!printCanvasPdf(svg)?"Allow pop-ups to print the plan.":"";})} className={item}><FileText className="size-3.5 text-slate-500"/>Print plan / save PDF</button>
      </>}
      <div className="my-1 border-t border-slate-100"/>
      <button type="button" role="menuitem" onClick={()=>run(()=>exportProjectJson(activeProjectName,exportProject()))} className={item}><Download className="size-3.5 text-slate-500"/><span><b className="block font-medium">Project backup (JSON)</b><small className="text-slate-500">Editable copy; keep it safe</small></span></button>
      <button type="button" role="menuitem" onClick={()=>{setOpen(false);fileRef.current?.click();}} className={item}><Upload className="size-3.5 text-slate-500"/>Import backup…</button>
    </div>}
    <input ref={fileRef} type="file" accept=".json,.siteplan.json,application/json" className="hidden" onChange={event=>void importFile(event.target.files?.[0])}/>
  </div>;
}
