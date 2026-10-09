import { useEffect, useRef, useState } from "react";
import { usePlot } from "../../geometry/plot/PlotContext";
import { useUnits } from "../../geometry/units/UnitContext";
import { sqMmToSqFeet, sqMmToSqMeters } from "../../geometry/units/units";
import { tryParseDimension } from "../../geometry/units/parser";
import type { PlotEdgeName } from "../../types/plot";
import { RotateCcw, ChevronRight, Undo2, Redo2, Trash2, Eye, EyeOff } from "lucide-react";
import { Button } from "../ui/button";
import { getRoomWallInset } from "../../geometry/plot/model";
import type { FloorPlanPreset, PlanObjectKind, SiteFeature, SiteFeatureKind, SiteFeatureStatus, WallSide } from "../../geometry/plot/model";
import { parseSurveyCoordinateCsv, type SurveyCoordinateUnit } from "../../geometry/plot/surveyCsv";

function roomsUnionArea(rooms: {x:number;y:number;width:number;height:number}[]) {
  const xs=[...new Set(rooms.flatMap(r=>[r.x,r.x+r.width]))].sort((a,b)=>a-b);
  let area=0;
  for(let i=0;i<xs.length-1;i++) {
    const left=xs[i],right=xs[i+1],mid=(left+right)/2;
    const spans=rooms.filter(r=>r.x<mid&&r.x+r.width>mid).map(r=>[r.y,r.y+r.height] as [number,number]).sort((a,b)=>a[0]-b[0]);
    let covered=0,start:number|undefined,end:number|undefined;
    for(const [a,b] of spans) { if(start===undefined){start=a;end=b;} else if(a<=end!){end=Math.max(end!,b);} else {covered+=end!-start;start=a;end=b;} }
    if(start!==undefined) covered+=end!-start;
    area+=(right-left)*covered;
  }
  return area;
}

interface EdgeInputProps {
  label: string;
  edgeId:string;
  currentMm: number;
}

function SiteFeatureCard({feature,scale,unit}:{feature:SiteFeature;scale:number;unit:string}){
  const {updateSiteFeature,removeSiteFeature,selectSiteFeature,selectedPropertyCardId}=usePlot();
  const [width,setWidth]=useState((feature.width/scale).toFixed(1));
  const [height,setHeight]=useState((feature.height/scale).toFixed(1));
  useEffect(()=>{setWidth((feature.width/scale).toFixed(1));setHeight((feature.height/scale).toFixed(1));},[feature.width,feature.height,scale]);
  const selected=selectedPropertyCardId===`site-feature-${feature.id}`;
  const commitSize=(axis:"width"|"height",value:string)=>{const numeric=Number(value);if(Number.isFinite(numeric)&&numeric>0)updateSiteFeature(feature.id,{[axis]:numeric*scale});};
  return <div id={`property-site-feature-${feature.id}`} onClick={()=>selectSiteFeature(feature.id)} className={`rounded border p-2 transition-colors ${selected?"border-teal-400 bg-teal-50 ring-2 ring-teal-200":"border-slate-200 bg-white"}`}>
    <div className="flex items-center gap-1.5"><input aria-label="Site feature name" value={feature.name} onChange={event=>updateSiteFeature(feature.id,{name:event.target.value})} className="min-w-0 flex-1 rounded border border-slate-200 px-1.5 py-1 text-[10px] font-medium"/><button type="button" aria-label={feature.visible===false?"Show site feature":"Hide site feature"} aria-pressed={feature.visible!==false} title={feature.visible===false?"Show on plan and report drawing":"Hide on plan and report drawing"} onClick={event=>{event.stopPropagation();updateSiteFeature(feature.id,{visible:feature.visible===false});}} className="rounded p-1 text-slate-500 hover:bg-slate-100">{feature.visible===false?<EyeOff className="size-3.5"/>:<Eye className="size-3.5"/>}</button><button type="button" onClick={event=>{event.stopPropagation();removeSiteFeature(feature.id);}} className="rounded px-1.5 py-1 text-[10px] text-red-600 hover:bg-red-50">Remove</button></div>
    <div className="mt-1.5 grid grid-cols-2 gap-1.5"><label className="text-[9px] text-slate-500">Condition<select aria-label="Feature condition" value={feature.status} onChange={event=>updateSiteFeature(feature.id,{status:event.target.value as SiteFeatureStatus})} className="mt-0.5 w-full rounded border border-slate-200 bg-white px-1 py-1 text-[10px]"><option value="existing">Existing</option><option value="proposed">Proposed</option><option value="removed">Removed</option></select></label>
      <label className="text-[9px] text-slate-500">Mapped size · {unit}<span className="mt-0.5 flex gap-1"><input aria-label="Feature width" type="number" min="0.1" step="0.1" value={width} onChange={event=>setWidth(event.target.value)} onBlur={()=>commitSize("width",width)} onKeyDown={event=>{if(event.key==="Enter")event.currentTarget.blur();}} className="w-1/2 min-w-0 rounded border border-slate-200 px-1 py-1 text-right font-mono text-[10px]"/><input aria-label="Feature depth" type="number" min="0.1" step="0.1" value={height} onChange={event=>setHeight(event.target.value)} onBlur={()=>commitSize("height",height)} onKeyDown={event=>{if(event.key==="Enter")event.currentTarget.blur();}} className="w-1/2 min-w-0 rounded border border-slate-200 px-1 py-1 text-right font-mono text-[10px]"/></span></label>
    </div>
  </div>;
}

function RoomDimensionInput({label,valueMm,scale,onCommit}:{label:string;valueMm:number;scale:number;onCommit:(valueMm:number)=>boolean}){
  const [draft,setDraft]=useState((valueMm/scale).toFixed(1));
  const [error,setError]=useState("");
  useEffect(()=>setDraft((valueMm/scale).toFixed(1)),[valueMm,scale]);
  const commit=()=>{const numeric=Number(draft);if(Number.isFinite(numeric)&&numeric>0){if(onCommit(numeric*scale)){setError("");}else{setDraft((valueMm/scale).toFixed(1));setError("This size does not fit inside the plot.");}}else{setDraft((valueMm/scale).toFixed(1));setError("");}};
  return <label className="text-[10px] capitalize text-slate-400">{label}<input type="number" min="1" step="0.5" value={draft} onChange={event=>{setDraft(event.target.value);setError("");}} onBlur={commit} onKeyDown={event=>{if(event.key==="Enter")event.currentTarget.blur();}} className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 font-mono text-xs text-slate-700"/>{error&&<span role="status" className="text-[9px] text-red-600">{error}</span>}</label>;
}

function EdgeInput({ label, edgeId, currentMm }: EdgeInputProps) {
  const { updateEdgeLength, selectedEdgeId, selectEdge } = usePlot();
  const { format, unitSystem } = useUnits();

  const isSelected = edgeId === selectedEdgeId;

  const [editValue, setEditValue] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState("");

  const displayValue = format(currentMm);

  function startEditing() {
    setEditValue(displayValue);
    setIsEditing(true);
    setError("");
    selectEdge(edgeId);
  }

  function commitEdit() {
    const result = tryParseDimension(
      editValue,
      unitSystem === "metric" ? "m" : "ft",
    );

    if (!result.success) {
      setError(result.error);
      return;
    }

    if (result.mm <= 0) {
      setError("Dimension must be greater than zero");
      return;
    }

    if(!updateEdgeLength(edgeId, result.mm)){
      setError("That length would cross or collapse the boundary, or leave a floor plan outside the plot.");
      return;
    }
    setIsEditing(false);
    setError("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") commitEdit();
    if (e.key === "Escape") {
      setIsEditing(false);
      setError("");
    }
  }

  return (
    <div id={`property-edge-${edgeId}`}
      className={`group rounded-lg border px-3 py-2 transition-colors ${
        isSelected
          ? "border-blue-400 bg-blue-50"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-xs font-semibold uppercase tracking-wide ${
            isSelected ? "text-blue-700" : "text-slate-500"
          }`}
        >
          {label}
        </span>

        {isEditing ? (
          <div className="flex items-center gap-1 flex-1 justify-end">
            <input
              autoFocus
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              className="w-28 rounded border border-blue-400 bg-white px-2 py-0.5 text-right font-mono text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-slate-100 transition-colors cursor-pointer group/btn"
            title={`Edit ${label} dimension`}
          >
            <span className="font-mono text-sm font-semibold text-slate-800">
              {displayValue}
            </span>
            <ChevronRight className="size-3 text-slate-300 group-hover/btn:text-slate-500 transition-colors" />
          </button>
        )}
      </div>

      {error && (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      )}

      {isSelected && !isEditing && (
        <p className="mt-0.5 text-[10px] text-slate-400">
          {currentMm.toFixed(1)} mm · Click value to edit
        </p>
      )}
    </div>
  );
}

function SetbackEdgeControl({edge,distance,scale,decimals,unit,onInvalid}:{edge:PlotEdgeName;distance:number;scale:number;decimals:number;unit:string;onInvalid:()=>void}){
  const {setSetbackDistance,selectPropertyCard,selectedPropertyCardId}=usePlot();
  const [draft,setDraft]=useState((distance/scale).toFixed(decimals));
  const [editing,setEditing]=useState(false);
  useEffect(()=>{if(!editing)setDraft((distance/scale).toFixed(decimals));},[distance,scale,decimals,editing]);
  const commit=()=>{
    if(!editing)return;
    const numeric=Number(draft);
    const accepted=Number.isFinite(numeric)&&numeric>=0&&setSetbackDistance(edge,numeric*scale);
    if(!accepted)onInvalid();
    setEditing(false);
  };
  return <label id={`property-setback-${edge}`} className={`flex items-center justify-between gap-1 rounded text-[10px] capitalize text-teal-900 ${selectedPropertyCardId===`setback-${edge}`?"bg-teal-100 ring-1 ring-teal-400":""}`}>
    {edge}<span className="flex items-center gap-1"><input aria-label={`${edge} setback`} type="number" min="0" step={unit==="m"?"0.1":"0.5"} value={draft} onFocus={()=>{selectPropertyCard(`setback-${edge}`);setDraft((distance/scale).toFixed(decimals));setEditing(true);}} onChange={event=>setDraft(event.target.value)} onBlur={commit} onKeyDown={event=>{if(event.key==="Enter")event.currentTarget.blur();}} className="w-16 rounded border border-teal-300 bg-white px-1.5 py-1 text-right font-mono text-xs text-slate-800"/><span>{unit}</span></span>
  </label>;
}

export function PlotPropertiesPanel() {
  const { plot, metrics, resetPlot, rooms, openings, planObjects, addPlanObject, removePlanObject, siteFeatures, addSiteFeature, assumptions, addProjectAssumption, updateProjectAssumption, removeProjectAssumption, issues, addProjectIssue, addRoom, addOpening, removeOpening, applyFloorPlanPreset, resizeRoom, removeRoom, renameRoom, canUndo, canRedo, undo, redo, compassRotation, floorPlans, groundLevel, activeFloorId, setActiveFloor, addFloor, duplicateActiveFloor, removeActiveFloor, addStairwell, setbackDistances, setSetbackMm, selectedPropertyCardId, selectPropertyCard, selectedCornerId, selectedEdgeId, selectCorner, splitBoundaryEdge, removeBoundaryCorner, importSurveyBoundary, surveyMetadata, projectDetails, updateProjectDetails } = usePlot();
  const { unitSystem, format } = useUnits();
  const [customName,setCustomName]=useState("");
  const [customWidth,setCustomWidth]=useState(unitSystem === "metric" ? "4" : "12");
  const [customDepth,setCustomDepth]=useState(unitSystem === "metric" ? "4" : "12");
  const [planObjectText,setPlanObjectText]=useState("Note");
  const [wallSides,setWallSides]=useState<Record<string,WallSide>>({});
  const [presetError,setPresetError]=useState("");
  const [boundaryNotice,setBoundaryNotice]=useState("");
  const [surveyUnit,setSurveyUnit]=useState<SurveyCoordinateUnit>(unitSystem==="metric"?"m":"ft");
  const [surveyReference,setSurveyReference]=useState(surveyMetadata?.coordinateReference??"Local site grid");
  const [surveyNotice,setSurveyNotice]=useState("");
  const surveyFileRef=useRef<HTMLInputElement>(null);
  const [targetPreset,setTargetPreset]=useState<FloorPlanPreset>("3bhk");
  const [vastuInspired,setVastuInspired]=useState(false);
  const [stairwellNotice,setStairwellNotice]=useState("");
  const [setbackNotice,setSetbackNotice]=useState("");
  const [siteFeatureKind,setSiteFeatureKind]=useState<SiteFeatureKind>("driveway");
  const [siteFeatureNotice,setSiteFeatureNotice]=useState("");
  const [assumptionDraft,setAssumptionDraft]=useState("");
  const [assumptionSourceDraft,setAssumptionSourceDraft]=useState("");
  const [issueDescriptionDraft,setIssueDescriptionDraft]=useState("");
  const [targetAreaSqMm,setTargetAreaSqMm]=useState(1900*304.8*304.8);
  const scale = unitSystem === "metric" ? 1000 : 304.8;
  const footprint = roomsUnionArea(rooms.map(room=>{const left=getRoomWallInset(room,"left",rooms),right=getRoomWallInset(room,"right",rooms),top=getRoomWallInset(room,"top",rooms),bottom=getRoomWallInset(room,"bottom",rooms);return{x:room.x+left,y:room.y+top,width:Math.max(0,room.width-left-right),height:Math.max(0,room.height-top-bottom)};}));
  const occupied = roomsUnionArea(rooms);
  const remaining = Math.max(0, metrics.areaSqMm - occupied);
  const propertyPanelRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!selectedPropertyCardId)return;
    const target=document.getElementById(`property-${selectedPropertyCardId}`);
    if(target&&propertyPanelRef.current?.contains(target))target.scrollIntoView({behavior:"smooth",block:"center"});
  },[selectedPropertyCardId]);
  const primaryRoom=rooms[0];
  const clearances=primaryRoom ? plot.edges.map(edge=>{
    const a=plot.corners.find(c=>c.id===edge.startCornerId)!;const b=plot.corners.find(c=>c.id===edge.endCornerId)!;
    const points=[[primaryRoom.x,primaryRoom.y],[primaryRoom.x+primaryRoom.width,primaryRoom.y],[primaryRoom.x+primaryRoom.width,primaryRoom.y+primaryRoom.height],[primaryRoom.x,primaryRoom.y+primaryRoom.height]];
    const distanceTo=(p:number[])=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p[0]-a.x)*dx+(p[1]-a.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(p[0]-(a.x+t*dx),p[1]-(a.y+t*dy));};
    return {label:edge.label,value:Math.min(...points.map(distanceTo))};
  }) : [];

  const areaSqFt = sqMmToSqFeet(metrics.areaSqMm);
  const areaSqM = sqMmToSqMeters(metrics.areaSqMm);
  const perimeterFt = metrics.perimeterMm / 304.8;
  const perimeterM = metrics.perimeterMm / 1000;

  async function importSurveyFile(file?:File){
    if(!file)return;
    try{
      const parsed=parseSurveyCoordinateCsv(await file.text(),surveyUnit);
      if(!parsed.success){setSurveyNotice(parsed.error);return;}
      const boundary=parsed.boundary;
      const accepted=importSurveyBoundary(boundary.corners,{sourceFile:file.name,coordinateReference:surveyReference.trim()||"Local site grid",coordinateUnit:boundary.unit,originX:boundary.originX,originY:boundary.originY,sourcePoints:boundary.sourcePoints});
      setSurveyNotice(accepted?`Imported ${boundary.corners.length} ordered survey points. Coordinates are relative to the first point.`:"Import rejected. Move or remove floor plans that do not fit the surveyed boundary, then retry.");
    }catch{setSurveyNotice("Could not read this survey file.");}
    finally{if(surveyFileRef.current)surveyFileRef.current.value="";}
  }

  return (
    <div className="flex h-full flex-col border-l border-slate-200 bg-slate-50">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Site Properties</h2>
          <p className="text-xs text-slate-500">Parcel boundary and building plans</p>
        </div>
        <div className="flex items-center">
          <Button variant="ghost" size="icon-sm" onClick={undo} disabled={!canUndo} title="Undo last plot or room change" className="text-slate-400 hover:text-slate-700"><Undo2 className="size-4" /></Button>
          <Button variant="ghost" size="icon-sm" onClick={redo} disabled={!canRedo} title="Redo change" className="text-slate-400 hover:text-slate-700"><Redo2 className="size-4" /></Button>
          <Button variant="ghost" size="icon-sm" onClick={resetPlot} title="Reset plot" className="text-slate-400 hover:text-slate-700"><RotateCcw className="size-4" /></Button>
        </div>
      </div>

      <div ref={propertyPanelRef} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
        <section className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">Boundary vertices</h3><span className="text-[10px] text-slate-400">{plot.corners.length} points</span></div>
          <div className="mb-2 flex gap-1.5"><button type="button" disabled={!selectedEdgeId} onClick={()=>{if(selectedEdgeId&&!splitBoundaryEdge(selectedEdgeId))setBoundaryNotice("Could not split this edge while preserving the current floor plans.");else setBoundaryNotice("");}} className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40">Split selected edge</button><button type="button" disabled={!selectedCornerId||plot.corners.length<=3} onClick={()=>{if(selectedCornerId&&!removeBoundaryCorner(selectedCornerId))setBoundaryNotice("This point cannot be removed without invalidating the boundary or floor plans.");else setBoundaryNotice("");}} className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-40">Remove selected point</button></div>
          {boundaryNotice&&<p role="status" className="mb-2 text-[10px] text-amber-700">{boundaryNotice}</p>}
          <p className="text-[9px] text-slate-400">Select an edge to add a point; drag boundary points to trace the site.</p>
          <div className="mt-3 border-t border-slate-100 pt-2">
            <h4 className="text-[10px] font-semibold text-slate-700">Import surveyed coordinates</h4>
            <p className="mt-0.5 text-[9px] leading-relaxed text-slate-500">CSV columns: point, easting, northing. Points are connected in row order; northing increases upward. A repeated closing point is removed automatically.</p>
            <p className="mt-0.5 text-[9px] leading-relaxed text-amber-800">Use projected or local planar coordinates. Geographic latitude/longitude reprojection is not performed.</p>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <label className="text-[9px] text-slate-500">Coordinate units<select value={surveyUnit} onChange={event=>setSurveyUnit(event.target.value as SurveyCoordinateUnit)} className="mt-0.5 w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px]"><option value="m">Meters</option><option value="ft">Feet</option><option value="mm">Millimeters</option></select></label>
              <label className="text-[9px] text-slate-500">Coordinate reference<input type="text" value={surveyReference} onChange={event=>setSurveyReference(event.target.value)} placeholder="Local grid / EPSG code" className="mt-0.5 w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px]" /></label>
            </div>
            <input ref={surveyFileRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={event=>void importSurveyFile(event.target.files?.[0])}/>
            <button type="button" onClick={()=>surveyFileRef.current?.click()} className="mt-1.5 w-full rounded border border-blue-200 bg-blue-50 px-2 py-1.5 text-[10px] font-semibold text-blue-800 hover:bg-blue-100">Choose survey CSV</button>
            <a href="data:text/csv;charset=utf-8,point%2Ceasting%2Cnorthing%0AA%2C0%2C0%0AB%2C20%2C0%0AC%2C20%2C15%0AD%2C0%2C15%0A" download="site-boundary-template.csv" className="mt-1 inline-block text-[9px] text-blue-700 underline">Download CSV template</a>
            {surveyNotice&&<p role="status" className="mt-1 text-[9px] text-slate-600">{surveyNotice}</p>}
            {surveyMetadata&&<p className="mt-1 text-[9px] text-emerald-800">Survey source: {surveyMetadata.sourceFile} · {surveyMetadata.coordinateReference} · {surveyMetadata.sourcePoints.length} source points{surveyMetadata.designBoundaryEditedAt?" · design boundary edited":""}</p>}
          </div>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-3">
          <h3 className="text-xs font-semibold text-slate-800">Project information</h3>
          <p className="mt-0.5 text-[10px] text-slate-500">Included in the printable project report.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {([["clientName","Client / owner"],["projectNumber","Project number"],["siteAddress","Site address"],["preparedBy","Prepared by"],["revision","Revision"]] as const).map(([key,label])=><label key={key} className={key==="siteAddress"?"col-span-2 text-[10px] text-slate-500":"text-[10px] text-slate-500"}>{label}<input type="text" value={projectDetails[key]} onChange={event=>updateProjectDetails({[key]:event.target.value})} className="mt-0.5 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-blue-400 focus:outline-none" /></label>)}
            <label className="col-span-2 text-[10px] text-slate-500">Project notes<textarea value={projectDetails.notes} onChange={event=>updateProjectDetails({notes:event.target.value})} rows={3} className="mt-0.5 w-full resize-y rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-blue-400 focus:outline-none" /></label>
          </div>
        </section>
        <section className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
          <div className="flex items-center justify-between"><div><h3 className="text-xs font-semibold text-indigo-950">Issue history</h3><p className="text-[9px] text-indigo-800">Record what changed for each client issue.</p></div><span className="rounded bg-white px-1.5 py-0.5 text-[9px] text-slate-500">{issues.length}</span></div>
          <label className="mt-2 block text-[9px] text-slate-600">Issue description<textarea value={issueDescriptionDraft} onChange={event=>setIssueDescriptionDraft(event.target.value)} rows={2} placeholder="e.g. Initial site layout for client review" className="mt-0.5 w-full resize-y rounded border border-indigo-200 bg-white px-2 py-1.5 text-[10px] text-slate-800"/></label>
          <button type="button" disabled={!projectDetails.revision.trim()||!issueDescriptionDraft.trim()} onClick={()=>{if(addProjectIssue(issueDescriptionDraft))setIssueDescriptionDraft("");}} className="mt-1.5 rounded bg-indigo-700 px-2 py-1 text-[9px] font-semibold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50">Record current issue · Rev {projectDetails.revision.trim()||"—"}</button>
          {issues.length>0&&<ol className="mt-2 space-y-1.5">{[...issues].reverse().map(issue=><li key={issue.id} className="rounded border border-indigo-100 bg-white p-2"><div className="flex items-baseline justify-between gap-2"><span className="text-[10px] font-semibold text-slate-800">Rev {issue.revision}</span><time className="text-[9px] text-slate-500">{issue.date}</time></div><p className="mt-0.5 text-[10px] text-slate-700">{issue.description}</p>{issue.author&&<p className="mt-0.5 text-[9px] text-slate-500">By {issue.author}</p>}</li>)}</ol>}
        </section>
        <section className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
          <div className="flex items-center justify-between"><div><h3 className="text-xs font-semibold text-amber-950">Assumptions register</h3><p className="text-[9px] text-amber-800">Record items that still need confirmation.</p></div><span className="rounded bg-white px-1.5 py-0.5 text-[9px] text-slate-500">{assumptions.filter(item=>item.status==="assumed").length} open</span></div>
          <label className="mt-2 block text-[9px] text-slate-600">Assumption<textarea value={assumptionDraft} onChange={event=>setAssumptionDraft(event.target.value)} rows={2} placeholder="e.g. Existing utility location to be confirmed" className="mt-0.5 w-full resize-y rounded border border-amber-200 bg-white px-2 py-1.5 text-[10px] text-slate-800"/></label>
          <div className="mt-1 flex gap-1.5"><input value={assumptionSourceDraft} onChange={event=>setAssumptionSourceDraft(event.target.value)} aria-label="Assumption source" placeholder="Basis or source (optional)" className="min-w-0 flex-1 rounded border border-amber-200 bg-white px-2 py-1 text-[9px]"/><button type="button" onClick={()=>{if(addProjectAssumption(assumptionDraft,assumptionSourceDraft)){setAssumptionDraft("");setAssumptionSourceDraft("");}}} className="rounded bg-amber-700 px-2 py-1 text-[9px] font-semibold text-white hover:bg-amber-800">+ Add</button></div>
          {assumptions.length>0&&<div className="mt-2 space-y-1.5">{assumptions.map(item=><div key={item.id} className="rounded border border-amber-100 bg-white p-2"><div className="flex items-start gap-1.5"><textarea aria-label="Assumption description" value={item.description} onChange={event=>updateProjectAssumption(item.id,{description:event.target.value})} rows={2} className="min-w-0 flex-1 resize-y rounded border border-slate-200 px-1.5 py-1 text-[10px]"/><button type="button" onClick={()=>removeProjectAssumption(item.id)} aria-label="Remove assumption" className="px-1 text-[10px] text-red-600">×</button></div><div className="mt-1 flex gap-1.5"><select aria-label="Assumption status" value={item.status} onChange={event=>updateProjectAssumption(item.id,{status:event.target.value as "assumed"|"confirmed"})} className="rounded border border-slate-200 bg-white px-1 py-1 text-[9px]"><option value="assumed">Assumed · unconfirmed</option><option value="confirmed">Confirmed</option></select><input aria-label="Assumption source" value={item.source??""} onChange={event=>updateProjectAssumption(item.id,{source:event.target.value})} placeholder="Basis or source" className="min-w-0 flex-1 rounded border border-slate-200 px-1.5 py-1 text-[9px]"/></div></div>)}</div>}
          <p className="mt-1.5 text-[9px] leading-relaxed text-amber-900">Assumed items appear in the printable report until marked confirmed.</p>
        </section>
        <section id="property-setback" className={`rounded-lg border p-3 transition-colors ${selectedPropertyCardId?.startsWith("setback-")?"border-teal-500 bg-teal-100/80 ring-2 ring-teal-300":"border-teal-200 bg-teal-50/70"}`}>
          <div className="flex items-center justify-between gap-3">
            <div><h3 className="text-xs font-semibold text-teal-950">Setback by plot edge</h3><p className="mt-0.5 text-[10px] leading-relaxed text-teal-800">Set each side separately or drag its handle on the plan.</p></div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">{(["top","right","bottom","left"] as PlotEdgeName[]).map(edge=><SetbackEdgeControl key={edge} edge={edge} distance={setbackDistances[edge]} scale={scale} decimals={unitSystem==="metric"?2:1} unit={unitSystem==="metric"?"m":"ft"} onInvalid={()=>setSetbackNotice("Setback not applied: the plan would fall outside the reserved area.")}/>)}</div>
          <div className="mt-2 flex justify-end"><button type="button" onClick={()=>setSetbackNotice(setSetbackMm(3*304.8)?"":"Setback not applied: one or more floor plans would fall outside the new boundary.")} className="rounded border border-teal-300 bg-white px-2 py-1 text-[9px] font-semibold text-teal-800 hover:bg-teal-100">Set all to 3 ft</button></div>
          {setbackNotice&&<p role="status" className="mt-1 text-[9px] text-amber-800">{setbackNotice}</p>}
        </section>
        <section className={`rounded-lg border p-3 ${selectedPropertyCardId?.startsWith("site-feature-")?"border-cyan-400 bg-cyan-50 ring-2 ring-cyan-200":"border-slate-200 bg-slate-50"}`}>
          <div className="flex items-center justify-between"><div><h3 className="text-xs font-semibold text-slate-800">Site features</h3><p className="text-[9px] text-slate-500">Add and edit mapped site elements; drag them on the plan.</p></div><span className="rounded bg-white px-1.5 py-0.5 text-[9px] text-slate-500">{siteFeatures.length}</span></div>
          <div className="mt-2 flex gap-1.5"><select aria-label="Site feature type" value={siteFeatureKind} onChange={event=>setSiteFeatureKind(event.target.value as SiteFeatureKind)} className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-1.5 py-1.5 text-[10px]">
            <option value="building-footprint">Building footprint</option><option value="driveway">Driveway</option><option value="parking">Parking</option><option value="walkway">Walkway</option><option value="landscape">Landscape</option><option value="tree">Tree</option><option value="utility">Utility</option><option value="easement">Easement</option><option value="other">Other</option>
          </select><button type="button" onClick={()=>setSiteFeatureNotice(addSiteFeature(siteFeatureKind)?"":"Could not place this feature inside the plot.")} className="rounded bg-cyan-700 px-2.5 py-1.5 text-[10px] font-semibold text-white hover:bg-cyan-800">+ Add</button></div>
          {siteFeatureNotice&&<p role="status" className="mt-1 text-[9px] text-amber-800">{siteFeatureNotice}</p>}
          {siteFeatures.length>0&&<div className="mt-2 space-y-1.5">{siteFeatures.map(feature=><SiteFeatureCard key={feature.id} feature={feature} scale={scale} unit={unitSystem==="metric"?"m":"ft"}/>)}</div>}
          <p className="mt-1.5 text-[9px] text-slate-500">Existing, proposed, and removed states are included in the project report. Mapped extents are for coordination, not code coverage.</p>
        </section>
        <section>
          <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{activeFloorId==="ground"?"Ground · Stilt parking":floorPlans.find(floor=>floor.id===activeFloorId)?.name} plan rooms</h3>{activeFloorId!=="ground"&&<button type="button" onClick={removeActiveFloor} className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-red-600 hover:bg-red-50"><Trash2 className="size-3"/>Remove floor</button>}</div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              <div className="mb-2 flex items-center justify-between"><div><p className="text-xs font-semibold text-slate-800">Building levels</p><p className="text-[10px] text-slate-500">Ground / stilt + {floorPlans.length} upper floors</p></div><button type="button" onClick={addFloor} className="rounded-md bg-blue-600 px-2.5 py-1.5 text-[10px] font-semibold text-white hover:bg-blue-700">+ Add floor</button></div>
              <button type="button" onClick={()=>setActiveFloor("ground")} aria-pressed={activeFloorId==="ground"} className={`mb-2 flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left ${activeFloorId==="ground"?"border-teal-300 bg-teal-50":"border-slate-200 bg-white hover:bg-slate-50"}`}><span className="grid size-6 place-items-center rounded bg-slate-100 text-xs">G</span><span className="min-w-0 flex-1"><b className="block text-[11px] text-slate-700">Ground floor · Stilt plan</b><small className="text-[9px] text-slate-500">{groundLevel.rooms.filter(room=>room.kind!=="stairs").length} spaces · select to create or edit</small></span>{activeFloorId==="ground"&&<span className="text-[9px] font-semibold text-teal-800">EDITING</span>}</button>
              <div className="space-y-1">{floorPlans.map(floor=><div key={floor.id} className={`flex items-center gap-1 rounded-md border p-1 ${floor.id===activeFloorId?"border-blue-300 bg-blue-50":"border-slate-200 bg-white"}`}>
                <button type="button" onClick={()=>setActiveFloor(floor.id)} aria-pressed={floor.id===activeFloorId} className="min-w-0 flex-1 px-2 py-1 text-left"><b className={`block text-[11px] ${floor.id===activeFloorId?"text-blue-800":"text-slate-700"}`}>{floor.name}</b><span className="text-[9px] text-slate-500">{floor.rooms.filter(room=>room.kind!=="stairs").length} spaces{floor.rooms.some(room=>room.kind==="stairs")?" · shared stairwell":""}</span></button>
                {floor.id===activeFloorId&&<button type="button" onClick={removeActiveFloor} title="Remove this floor" aria-label={`Remove ${floor.name}`} className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50">×</button>}
              </div>)}</div>
              <div className="mt-2 flex gap-1.5"><button type="button" onClick={duplicateActiveFloor} disabled={activeFloorId==="ground"} title={activeFloorId==="ground"?"Choose an upper floor to duplicate":"Duplicate selected floor"} className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45">Duplicate current floor</button><button type="button" onClick={()=>setStairwellNotice(addStairwell()?"Shared enclosed stairwell added to every floor. Drag it to adjust its position and size.":"Could not fit a stairwell inside this plot.")} className="flex-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] font-medium text-amber-900 hover:bg-amber-100">+ Shared stairwell</button></div>
              {stairwellNotice&&<p role="status" className="mt-1 text-[9px] text-slate-600">{stairwellNotice}</p>}
              <p className="mt-1 text-[9px] leading-relaxed text-slate-500">Stairwell walls stay separate from room interiors. Its position and size stay aligned on every floor; add a door on each landing as needed.</p>
            </div>
            {rooms.length===0 && <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-center"><p className="text-xs font-medium text-slate-700">{activeFloorId==="ground"?"Create the ground floor stilt plan":"Start a new floor plan"}</p><p className="mt-1 text-[10px] text-slate-500">{activeFloorId==="ground"?"Add parking bays, a lobby, and utility spaces below, or draw any custom room.":"Choose a BHK template or add your first room below."}</p></div>}
            {activeFloorId==="ground"&&<div className="rounded-md border border-teal-200 bg-teal-50/50 p-2"><p className="mb-1.5 text-[10px] font-semibold text-teal-900">Stilt plan starters</p><div className="grid grid-cols-2 gap-1">{[["Parking bay",2.7,5.4],["Stilt lobby",3,3],["Security room",3,3],["Utility room",2,2]].map(([name,w,h])=><button key={String(name)} type="button" onClick={()=>{const index=rooms.length;addRoom({name:String(name),x:metrics.bounds.minX+1000+(index%3)*3500,y:metrics.bounds.minY+1000+Math.floor(index/3)*3500,width:Number(w)*1000,height:Number(h)*1000});}} className="rounded border border-teal-200 bg-white px-1.5 py-1.5 text-[10px] font-medium text-teal-900 hover:bg-teal-100">+ {name}</button>)}</div><p className="mt-1 text-[9px] text-teal-800">Add multiple parking bays, then drag and resize each space to fit your layout.</p></div>}
            <p className="text-[11px] text-slate-500">Add rooms and porch areas; drag each shape to arrange the plan. Dimensions in {unitSystem === "metric" ? "m" : "ft"}.</p>
            <div className="rounded-md border border-violet-200 bg-violet-50/60 p-2">
              <p className="mb-1.5 text-[10px] font-semibold text-violet-900">Floor plan toolkit · click to add, drag to arrange</p>
              <div className="grid grid-cols-2 gap-1">{([["dining-table","Dining table"],["chair","Chair"],["vent-window","Ventilation window"],["sofa","Sofa"]] as [PlanObjectKind,string][]).map(([kind,label])=><button key={kind} type="button" onClick={()=>addPlanObject(kind)} className="rounded border border-violet-200 bg-white px-2 py-1.5 text-[10px] font-medium text-violet-900 hover:bg-violet-100">+ {label}</button>)}</div>
              <div className="mt-1.5 flex gap-1"><input aria-label="Text to add to floor plan" value={planObjectText} onChange={event=>setPlanObjectText(event.target.value)} className="min-w-0 flex-1 rounded border border-violet-200 bg-white px-2 py-1 text-[10px]"/><button type="button" onClick={()=>addPlanObject("text",planObjectText)} className="rounded bg-violet-700 px-2 py-1 text-[10px] font-semibold text-white hover:bg-violet-800">+ Text</button></div>
              {planObjects.length>0&&<div className="mt-1.5 space-y-1">{planObjects.map((item,index)=><div key={item.id} className="flex items-center justify-between rounded bg-white/80 px-2 py-1 text-[9px] text-slate-600"><span>{item.kind==="text"?item.text:item.kind.replaceAll("-"," ")} {item.kind==="text"?"":index+1}</span><button type="button" onClick={()=>removePlanObject(item.id)} className="px-1 text-red-600 hover:text-red-800" aria-label={`Remove ${item.kind.replaceAll("-"," ")}`}>Remove</button></div>)}</div>}
            </div>
            <div className="border-b border-slate-100 pb-2">
              <div className="mb-1 flex items-center justify-between"><p className="text-[10px] font-semibold text-slate-500">Generate a floor plan</p><label className="flex cursor-pointer items-center gap-1 text-[10px] font-medium text-teal-800"><input type="checkbox" checked={vastuInspired} onChange={event=>setVastuInspired(event.target.checked)} className="accent-teal-700"/>Vastu-inspired</label></div>
              {vastuInspired && <p className="mb-2 rounded-md bg-teal-50 px-2 py-1.5 text-[10px] leading-relaxed text-teal-900">Places prayer toward NE, kitchen SE, master bedroom SW, with living space toward north/east. Orientation follows the compass, rounded to the nearest 90° for this rectangular room editor. Traditions vary.</p>}
              <p className="mb-1 text-[10px] font-semibold text-slate-500">Scale to a target area</p>
              <div className="grid grid-cols-[1fr_1.2fr] gap-1.5">
                <select value={targetPreset} onChange={e=>setTargetPreset(e.target.value as FloorPlanPreset)} className="rounded border border-slate-200 bg-white px-1.5 py-1.5 text-xs text-slate-700"><option value="1bhk">1 BHK</option><option value="2bhk">2 BHK</option><option value="3bhk">3 BHK</option></select>
                <label className="flex items-center gap-1 rounded border border-slate-200 px-1.5 text-[10px] text-slate-400"><input type="number" min="1" step={unitSystem === "metric" ? "0.01" : "0.01"} value={(targetAreaSqMm/(scale*scale)).toFixed(2)} onChange={e=>{const n=Number(e.target.value);if(n>0)setTargetAreaSqMm(n*scale*scale)}} className="min-w-0 flex-1 py-1 text-right font-mono text-xs text-slate-800 focus:outline-none"/><span>{unitSystem === "metric" ? "m²" : "sq ft"}</span></label>
              </div>
              <button type="button" onClick={()=>setPresetError(applyFloorPlanPreset(targetPreset,targetAreaSqMm,vastuInspired)?"":"This layout cannot fit at that area inside the current plot.")} className="mt-1.5 w-full rounded bg-blue-600 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700">Generate {vastuInspired?"Vastu-inspired":"standard"} layout</button>
              <p className="mt-1 text-[9px] text-slate-400">Scales all spaces proportionally; room-area total matches the target.</p>
              {presetError && <p className="mt-1 text-[10px] text-red-600">{presetError}</p>}
            </div>
            <div className="border-b border-slate-100 pb-2">
              <p className="mb-1 text-[10px] font-semibold text-slate-500">{vastuInspired?"Vastu-influenced templates":"Prebuilt floor plans"} · {activeFloorId==="ground"?"Ground · Stilt parking":floorPlans.find(floor=>floor.id===activeFloorId)?.name}</p>
              <div className="grid grid-cols-3 gap-1">{([["1bhk","1 BHK"],["2bhk","2 BHK"],["3bhk","3 BHK"]] as [FloorPlanPreset,string][]).map(([preset,label])=><button key={preset} type="button" onClick={()=>setPresetError(applyFloorPlanPreset(preset,undefined,vastuInspired)?"":"This layout does not fit inside the current plot.")} className={`rounded border px-1 py-1.5 text-[10px] font-semibold ${vastuInspired?"border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100":"border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"}`}>{label}</button>)}</div>
              <p className="mt-1 text-[9px] text-slate-400">North reference: {compassRotation}° from plan-up. A template replaces rooms on this floor only.</p>
            </div>
            {rooms.map(room => <div id={`property-room-${room.id}`} key={room.id} className={`rounded border p-2 transition-colors ${selectedPropertyCardId===`room-${room.id}`?"border-blue-400 bg-blue-50 ring-2 ring-blue-200":"border-slate-100"}`}>
              <div className="mb-1 flex items-center justify-between gap-2"><input aria-label={`Room label for ${room.name}`} value={room.name} onChange={event=>renameRoom(room.id,event.target.value)} onBlur={event=>{if(!event.currentTarget.value.trim())renameRoom(room.id,room.name);}} className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-medium text-slate-700 hover:border-slate-200 focus:border-blue-400 focus:bg-white focus:outline-none" />{<button type="button" onClick={()=>removeRoom(room.id)} aria-label={room.kind==="stairs"?"Remove enclosed stairwell from all floors":`Remove ${room.name}`} className="text-slate-400 hover:text-red-600">{room.kind==="stairs"?"Remove stairwell":"Remove"}</button>}</div>
              {room.kind==="lawn"&&<p className="mb-1 text-[9px] font-medium text-emerald-700">Lawn area · no walls</p>}
              <div className="grid grid-cols-2 gap-2"><RoomDimensionInput label="overall width" valueMm={room.width} scale={scale} onCommit={value=>resizeRoom(room.id,room.x,room.y,value,room.height)}/><RoomDimensionInput label="overall depth" valueMm={room.height} scale={scale} onCommit={value=>resizeRoom(room.id,room.x,room.y,room.width,value)}/></div>
              {room.kind==="stairs" && <p className="text-[9px] text-amber-700">Stairs · drag corners to resize</p>}
              {room.kind!=="lawn"&&<div className="mt-1 flex items-center gap-1"><select value={wallSides[room.id]??"top"} onChange={e=>setWallSides(v=>({...v,[room.id]:e.target.value as WallSide}))} className="rounded border border-slate-200 bg-white px-1 py-1 text-[10px] text-slate-600"><option value="top">Top wall</option><option value="right">Right wall</option><option value="bottom">Bottom wall</option><option value="left">Left wall</option></select><button type="button" onClick={()=>addOpening(room.id,"door",wallSides[room.id]??"top")} className="rounded bg-violet-50 px-1.5 py-1 text-[10px] text-violet-700 hover:bg-violet-100">+ Door</button><button type="button" onClick={()=>addOpening(room.id,"window",wallSides[room.id]??"top")} className="rounded bg-sky-50 px-1.5 py-1 text-[10px] text-sky-700 hover:bg-sky-100">+ Window</button></div>}
              {openings.filter(item=>item.roomId===room.id).map(item=><div id={`property-opening-${item.id}`} key={item.id} onClick={()=>selectPropertyCard(`opening-${item.id}`)} className={`mt-1 flex justify-between pl-1 text-[9px] text-slate-500 ${selectedPropertyCardId===`opening-${item.id}`?"rounded bg-blue-50 ring-1 ring-blue-300":""}`}><span>{item.type} · {item.side} wall · {format(item.width)}</span><button type="button" onClick={()=>removeOpening(item.id)} className="text-red-500 hover:text-red-700">Remove</button></div>)}
            </div>)}
            <div className="grid grid-cols-2 gap-1 pt-1">{[["Guest room",12,12],["Washroom",6,8],["Store",6,8],["Prayer room",10,10],["Kitchen",12,12],["Living room",14,16],["Dining",12,12],["Porch",8,14]].map(([name,w,h])=><button key={name} onClick={()=>{const index=rooms.length;const x=metrics.bounds.minX+1000+(index%3)*3500,y=metrics.bounds.minY+1000+Math.floor(index/3)*3500;addRoom({name:String(name),x,y,width:Number(w)*304.8,height:Number(h)*304.8})}} className="rounded border border-slate-200 px-1.5 py-1 text-[10px] text-slate-600 hover:border-blue-300 hover:bg-blue-50">+ {name}</button>)}</div>
            <div className="space-y-1.5 border-t border-slate-100 pt-2">
              <p className="text-[10px] font-semibold text-slate-500">Create a custom room</p>
              <input value={customName} onChange={e=>setCustomName(e.target.value)} placeholder="Room type (e.g. Study)" className="w-full rounded border border-slate-200 px-2 py-1 text-xs" />
              <div className="grid grid-cols-2 gap-2"><label className="text-[10px] text-slate-400">Width ({unitSystem === "metric" ? "m" : "ft"})<input type="number" min="1" step="0.5" value={customWidth} onChange={e=>setCustomWidth(e.target.value)} className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 font-mono text-xs text-slate-700"/></label><label className="text-[10px] text-slate-400">Depth ({unitSystem === "metric" ? "m" : "ft"})<input type="number" min="1" step="0.5" value={customDepth} onChange={e=>setCustomDepth(e.target.value)} className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 font-mono text-xs text-slate-700"/></label></div>
              <button type="button" onClick={()=>{const w=Number(customWidth)*scale,h=Number(customDepth)*scale,name=customName.trim();if(!name||!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)return;addRoom({name,x:metrics.bounds.minX+1000,y:metrics.bounds.minY+1000,width:w,height:h});setCustomName("");}} className="w-full rounded bg-blue-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-700">Add room</button>
              <button type="button" onClick={()=>{const index=rooms.length,w=(unitSystem==="metric"?6000:20*304.8),x=metrics.bounds.minX+1000+(index%3)*3500,y=metrics.bounds.minY+1000+Math.floor(index/3)*3500;addRoom({name:"Lawn",kind:"lawn",x,y,width:w,height:w});}} className="w-full rounded border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100">+ Lawn area · no walls</button>
            </div>
            <div className="space-y-1 border-t border-slate-100 pt-2 text-xs"><div className="flex justify-between"><span className="text-slate-500">Room area total</span><b className="font-mono">{(footprint/(scale*scale)).toFixed(1)} {unitSystem === "metric" ? "m²" : "sq ft"}</b></div><div className="flex justify-between"><span className="text-slate-500">Plot area remaining*</span><b className="font-mono text-emerald-700">{(remaining/(scale*scale)).toFixed(1)} {unitSystem === "metric" ? "m²" : "sq ft"}</b></div></div>
            {primaryRoom && <div className="grid grid-cols-2 gap-y-1 border-t border-slate-100 pt-2 text-[11px]">{clearances.map(item=><div key={item.label} className="flex justify-between pr-2"><span className="text-slate-500">{item.label} clearance</span><span className="font-mono">{format(item.value)}</span></div>)}</div>}
            <p className="text-[9px] text-slate-400">Room areas are unioned, so overlapping spaces are not double-counted.</p>
          </div>
        </section>
        {/* Dimension inputs */}
        <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Boundary segment dimensions
          </h3>
          <div className="space-y-2">
            {plot.edges.map(edge=><EdgeInput key={edge.id} label={edge.label} edgeId={edge.id} currentMm={edge.actualLengthMm} />)}
          </div>
        </div>

        {/* Metrics */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Calculated Metrics
          </h3>
          <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Area</span>
              <div className="text-right">
                {unitSystem === "metric" ? (
                  <span className="font-mono font-semibold text-slate-800">
                    {areaSqM.toFixed(2)} m²
                  </span>
                ) : (
                  <span className="font-mono font-semibold text-slate-800">
                    {areaSqFt.toFixed(1)} sq ft
                  </span>
                )}
                <div className="text-[10px] text-slate-400">
                  {unitSystem === "metric"
                    ? `${areaSqFt.toFixed(1)} sq ft`
                    : `${areaSqM.toFixed(2)} m²`}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-2 flex items-center justify-between text-xs">
              <span className="text-slate-500">Perimeter</span>
              <div className="text-right">
                {unitSystem === "metric" ? (
                  <span className="font-mono font-semibold text-slate-800">
                    {perimeterM.toFixed(2)} m
                  </span>
                ) : (
                  <span className="font-mono font-semibold text-slate-800">
                    {perimeterFt.toFixed(1)} ft
                  </span>
                )}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-2 flex items-center justify-between text-xs">
              <span className="text-slate-500">Perimeter (mm)</span>
              <span className="font-mono text-slate-600">
                {metrics.perimeterMm.toFixed(1)} mm
              </span>
            </div>

            <div className="border-t border-slate-100 pt-2 flex items-center justify-between text-xs">
              <span className="text-slate-500">Area (mm²)</span>
              <span className="font-mono text-slate-600">
                {(metrics.areaSqMm / 1e6).toFixed(4)} × 10⁶
              </span>
            </div>
          </div>
        </div>

        {/* Corner coordinates table */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Boundary Point Coordinates (mm)
          </h3>
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-3 py-1.5 text-left font-semibold text-slate-500">Point</th>
                  <th className="px-3 py-1.5 text-right font-semibold text-slate-500">X (mm)</th>
                  <th className="px-3 py-1.5 text-right font-semibold text-slate-500">Y (mm)</th>
                </tr>
              </thead>
              <tbody>
                {plot.corners.map((corner,index) => {
                  const {id}=corner,label=`${corner.name||`P${index+1}`} · ${index===0?"Start":`Point ${index+1}`}`;
                  return (
                    <tr id={`property-corner-${id}`} key={id} onClick={()=>selectCorner(id)} className={`cursor-pointer border-b border-slate-50 last:border-0 ${selectedCornerId===id?"bg-blue-50 ring-1 ring-inset ring-blue-300":""}`}>
                      <td className="px-3 py-1.5 font-medium text-slate-600">{label}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-700">
                        {corner.x.toFixed(1)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-700">
                        {corner.y.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Geometry hint */}
      <div className="border-t border-slate-200 bg-white px-4 py-3">
        <p className="text-[10px] text-slate-400 leading-tight">
          All dimensions stored in canonical millimetres.
          Boundary geometry is stored as ordered survey points in millimetres.
        </p>
      </div>
    </div>
  );
}
