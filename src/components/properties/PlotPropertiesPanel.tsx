import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { usePlot } from "../../geometry/plot/PlotContext";
import { useUnits } from "../../geometry/units/UnitContext";
import { sqMmToSqFeet, sqMmToSqMeters } from "../../geometry/units/units";
import { PlotTab } from "./PlotTab";
import { BuildingTab } from "./BuildingTab";
import { ProjectTab } from "./ProjectTab";

type Tab="plot"|"building"|"project";
const TABS:[Tab,string][]=[["plot","Plot"],["building","Building"],["project","Project"]];
const PLOT_SELECTIONS=["edge-","corner-","setback-","site-feature-"], BUILDING_SELECTIONS=["room-","opening-","plan-object-"];

export function PlotPropertiesPanel(){
  const {plot,metrics,rooms,roomsOutsideSetback,selectedPropertyCardId,activeFloorId,floorPlans}=usePlot();
  const {unitSystem,format}=useUnits();
  const [tab,setTab]=useState<Tab>("plot");
  // A selection on the canvas switches to the tab that edits it.
  const [lastSelection,setLastSelection]=useState(selectedPropertyCardId);
  if(selectedPropertyCardId!==lastSelection){
    setLastSelection(selectedPropertyCardId);
    if(selectedPropertyCardId){
      if(PLOT_SELECTIONS.some(prefix=>selectedPropertyCardId.startsWith(prefix)))setTab("plot");
      else if(BUILDING_SELECTIONS.some(prefix=>selectedPropertyCardId.startsWith(prefix)))setTab("building");
    }
  }
  const scrollRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!selectedPropertyCardId)return;
    // Wait a frame so a tab or disclosure revealed by this selection has rendered.
    const frame=requestAnimationFrame(()=>{
      const target=document.getElementById(`property-${selectedPropertyCardId}`);
      if(target&&scrollRef.current?.contains(target))target.scrollIntoView({behavior:"smooth",block:"nearest"});
    });
    return ()=>cancelAnimationFrame(frame);
  },[selectedPropertyCardId,tab]);
  const levelName=activeFloorId==="ground"?"Ground floor":floorPlans.find(floor=>floor.id===activeFloorId)?.name??"Floor";

  return <div className="flex h-full flex-col border-l border-slate-200 bg-slate-50">
    <div role="tablist" aria-label="Site properties" className="grid shrink-0 grid-cols-3 border-b border-slate-200 bg-white">
      {TABS.map(([id,label])=><button key={id} type="button" role="tab" aria-selected={tab===id} onClick={()=>setTab(id)} className={`relative flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold ${tab===id?"text-blue-700":"text-slate-500 hover:text-slate-800"}`}>
        {label}
        {id==="plot"&&roomsOutsideSetback.length>0&&<AlertTriangle className="size-3 text-red-600" aria-label={`${roomsOutsideSetback.length} rooms cross the setback line`}/>}
        {tab===id&&<span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-blue-600"/>}
      </button>)}
    </div>
    {tab==="plot"&&<div className="grid shrink-0 grid-cols-3 divide-x divide-slate-200 border-b border-slate-200 bg-white text-center">
      <div className="px-2 py-1.5"><p className="text-[9px] uppercase tracking-wide text-slate-400">Plot area</p><p className="font-mono text-xs font-semibold text-slate-800" title={unitSystem==="metric"?`${sqMmToSqFeet(metrics.areaSqMm).toFixed(1)} sq ft`:`${sqMmToSqMeters(metrics.areaSqMm).toFixed(2)} m²`}>{unitSystem==="metric"?`${sqMmToSqMeters(metrics.areaSqMm).toFixed(2)} m²`:`${sqMmToSqFeet(metrics.areaSqMm).toFixed(1)} sq ft`}</p></div>
      <div className="px-2 py-1.5"><p className="text-[9px] uppercase tracking-wide text-slate-400">Perimeter</p><p className="font-mono text-xs font-semibold text-slate-800">{format(metrics.perimeterMm)}</p></div>
      <div className="px-2 py-1.5"><p className="text-[9px] uppercase tracking-wide text-slate-400">Sides</p><p className="font-mono text-xs font-semibold text-slate-800">{plot.corners.length}</p></div>
    </div>}
    {tab==="building"&&<div className="shrink-0 border-b border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-500">Editing <b className="text-slate-800">{levelName}</b> · {rooms.length} {rooms.length===1?"room":"rooms"}</div>}
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-3">
      {tab==="plot"&&<PlotTab/>}
      {tab==="building"&&<BuildingTab/>}
      {tab==="project"&&<ProjectTab/>}
    </div>
  </div>;
}
