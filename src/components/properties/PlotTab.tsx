import { useRef, useState } from "react";
import { AlertTriangle, Eye, EyeOff, Trash2 } from "lucide-react";
import { usePlot } from "../../geometry/plot/PlotContext";
import { useUnits } from "../../geometry/units/UnitContext";
import { tryParseDimension } from "../../geometry/units/parser";
import { interiorAngles, segmentBearing } from "../../geometry/plot/boundary";
import type { SiteFeature, SiteFeatureKind, SiteFeatureStatus } from "../../geometry/plot/model";
import { parseSurveyCoordinateCsv, type SurveyCoordinateUnit } from "../../geometry/plot/surveyCsv";
import { Disclosure, DraftInput, Heading, Notice, buttonClass, inputClass, primaryButtonClass, selectClass } from "./panelKit";

const FEATURE_KINDS:[SiteFeatureKind,string][]=[["driveway","Driveway"],["parking","Parking"],["walkway","Walkway"],["building-footprint","Building footprint"],["landscape","Landscape"],["tree","Tree"],["utility","Utility"],["easement","Easement"],["other","Other"]];

/** One boundary side: its length (click to type) and its setback, side by side. */
function SideRow({index,edgeId,label,lengthMm,setbackMm,bearing,scale,unit,onSetbackResult}:{index:number;edgeId:string;label:string;lengthMm:number;setbackMm:number;bearing:number;scale:number;unit:string;onSetbackResult:(accepted:boolean)=>void}){
  const {updateEdgeLength,selectedEdgeId,selectEdge,setEdgeSetback,selectPropertyCard,selectedPropertyCardId}=usePlot();
  const {format,unitSystem}=useUnits();
  const selected=edgeId===selectedEdgeId;
  const setbackSelected=selectedPropertyCardId===`setback-${index}`;
  const [error,setError]=useState("");
  const commitLength=(text:string)=>{
    const result=tryParseDimension(text,unitSystem==="metric"?"m":"ft");
    if(!result.success){setError(result.error);return;}
    if(result.mm<=0){setError("Length must be greater than zero.");return;}
    setError(updateEdgeLength(edgeId,result.mm)?"":"That length would cross the boundary or push rooms outside the setback area.");
  };
  const commitSetback=(text:string)=>{const numeric=Number(text);onSetbackResult(Number.isFinite(numeric)&&numeric>=0&&setEdgeSetback(index,numeric*scale));};
  return <div id={`property-edge-${edgeId}`} className={`grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 rounded-md border px-2 py-1 ${selected?"border-blue-400 bg-blue-50":setbackSelected?"border-teal-400 bg-teal-50":"border-slate-200 bg-white"}`}>
    <button type="button" onClick={()=>selectEdge(selected?null:edgeId)} className="min-w-0 text-left" title="Select this side on the plan">
      <span className={`block truncate text-[11px] font-semibold ${selected?"text-blue-700":"text-slate-700"}`}>{label}</span>
      {selected&&<span className="block font-mono text-[9px] text-slate-400" title="Bearing clockwise from north">{bearing.toFixed(1)}° bearing</span>}
    </button>
    <DraftInput aria-label={`${label} length`} value={format(lengthMm)} onFocus={()=>{setError("");selectEdge(edgeId);}} onCommit={commitLength} className="w-20 rounded border border-transparent bg-transparent px-1 py-1 text-right font-mono text-xs font-semibold text-slate-800 hover:border-slate-200 focus:border-blue-400 focus:bg-white focus:outline-none"/>
    <span id={`property-setback-${index}`} className="flex items-center gap-1 text-[10px] text-slate-500"><DraftInput aria-label={`${label} setback`} type="number" min="0" step={unit==="m"?"0.1":"0.5"} value={(setbackMm/scale).toFixed(unit==="m"?2:1)} onFocus={()=>selectPropertyCard(`setback-${index}`)} onCommit={commitSetback} className="w-14 rounded border border-teal-200 bg-white px-1 py-1 text-right font-mono text-xs text-teal-900 focus:border-teal-500 focus:outline-none"/>{unit}</span>
    {error&&<p className="col-span-3 pt-0.5 text-[10px] text-red-600">{error}</p>}
  </div>;
}

function SiteFeatureCard({feature,scale,unit}:{feature:SiteFeature;scale:number;unit:string}){
  const {updateSiteFeature,removeSiteFeature,selectSiteFeature,selectedPropertyCardId}=usePlot();
  const selected=selectedPropertyCardId===`site-feature-${feature.id}`;
  const commitSize=(axis:"width"|"height",value:string)=>{const numeric=Number(value);if(Number.isFinite(numeric)&&numeric>0)updateSiteFeature(feature.id,{[axis]:numeric*scale});};
  return <div id={`property-site-feature-${feature.id}`} onClick={()=>selectSiteFeature(feature.id)} className={`rounded-md border p-2 ${selected?"border-teal-400 bg-teal-50":"border-slate-200 bg-white"}`}>
    <div className="flex items-center gap-1">
      <DraftInput aria-label="Site feature name" value={feature.name} onCommit={name=>name.trim()?updateSiteFeature(feature.id,{name:name.trim()}):false} className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-medium text-slate-800 hover:border-slate-200 focus:border-blue-400 focus:bg-white focus:outline-none"/>
      <button type="button" aria-label={feature.visible===false?"Show site feature":"Hide site feature"} aria-pressed={feature.visible!==false} title={feature.visible===false?"Hidden on the plan and report":"Shown on the plan and report"} onClick={event=>{event.stopPropagation();updateSiteFeature(feature.id,{visible:feature.visible===false});}} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">{feature.visible===false?<EyeOff className="size-3.5"/>:<Eye className="size-3.5"/>}</button>
      <button type="button" aria-label={`Remove ${feature.name}`} title="Remove" onClick={event=>{event.stopPropagation();removeSiteFeature(feature.id);}} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="size-3.5"/></button>
    </div>
    <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500">
      <select aria-label="Feature condition" value={feature.status} onChange={event=>updateSiteFeature(feature.id,{status:event.target.value as SiteFeatureStatus})} className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px]"><option value="existing">Existing</option><option value="proposed">Proposed</option><option value="removed">Removed</option></select>
      <span className="ml-auto flex items-center gap-1"><DraftInput aria-label="Feature width" type="number" min="0.1" step="0.1" value={(feature.width/scale).toFixed(1)} onCommit={value=>commitSize("width",value)} className="w-12 rounded border border-slate-200 px-1 py-0.5 text-right font-mono text-[10px]"/>×<DraftInput aria-label="Feature depth" type="number" min="0.1" step="0.1" value={(feature.height/scale).toFixed(1)} onCommit={value=>commitSize("height",value)} className="w-12 rounded border border-slate-200 px-1 py-0.5 text-right font-mono text-[10px]"/>{unit}</span>
    </div>
  </div>;
}

export function PlotTab(){
  const {plot,metrics,rooms,resetPlot,compassRotation,setbackDistances,setAllSetbacks,roomsOutsideSetback,selectedPropertyCardId,selectedCornerId,selectedEdgeId,selectCorner,splitBoundaryEdge,removeBoundaryCorner,updateCornerPosition,importSurveyBoundary,surveyMetadata,siteFeatures,addSiteFeature}=usePlot();
  const {unitSystem,format}=useUnits();
  const scale=unitSystem==="metric"?1000:304.8, unit=unitSystem==="metric"?"m":"ft";
  const [setbackNotice,setSetbackNotice]=useState("");
  const [boundaryNotice,setBoundaryNotice]=useState("");
  const [coordinateNotice,setCoordinateNotice]=useState("");
  const [uniformSetback,setUniformSetback]=useState(unitSystem==="metric"?"1":"3");
  const [surveyUnit,setSurveyUnit]=useState<SurveyCoordinateUnit>(unitSystem==="metric"?"m":"ft");
  const [surveyReference,setSurveyReference]=useState(surveyMetadata?.coordinateReference??"Local site grid");
  const [surveyNotice,setSurveyNotice]=useState("");
  const surveyFileRef=useRef<HTMLInputElement>(null);
  const [featureKind,setFeatureKind]=useState<SiteFeatureKind>("driveway");
  const [featureNotice,setFeatureNotice]=useState("");
  const angles=interiorAngles(plot.corners);
  const angleSum=angles.reduce((sum,angle)=>sum+angle,0), expectedAngleSum=(plot.corners.length-2)*180;
  const reveal=(prefixes:string[])=>prefixes.some(prefix=>selectedPropertyCardId?.startsWith(prefix))?selectedPropertyCardId:null;
  const setbackFailure="Not applied: the buildable area would collapse or fall outside the plot.";

  const commitCoordinate=(cornerId:string,axis:"x"|"y",text:string)=>{
    const parsed=tryParseDimension(text.replace(/^\s*-\s*/,"-"),unitSystem==="metric"?"m":"ft");
    if(!parsed.success){setCoordinateNotice(parsed.error);return;}
    const corner=plot.corners.find(item=>item.id===cornerId);if(!corner)return;
    setCoordinateNotice(updateCornerPosition(cornerId,{x:axis==="x"?parsed.mm:corner.x,y:axis==="y"?parsed.mm:corner.y})?"":"That position would cross the boundary or push rooms outside the setback area.");
  };

  async function importSurveyFile(file?:File){
    if(!file)return;
    try{
      const parsed=parseSurveyCoordinateCsv(await file.text(),surveyUnit);
      if(!parsed.success){setSurveyNotice(parsed.error);return;}
      const boundary=parsed.boundary;
      const accepted=importSurveyBoundary(boundary.corners,{sourceFile:file.name,coordinateReference:surveyReference.trim()||"Local site grid",coordinateUnit:boundary.unit,originX:boundary.originX,originY:boundary.originY,sourcePoints:boundary.sourcePoints});
      setSurveyNotice(accepted?`Imported ${boundary.corners.length} survey points.`:"Import rejected: move or remove rooms that would fall outside the new boundary, then retry.");
    }catch{setSurveyNotice("Could not read this survey file.");}
    finally{if(surveyFileRef.current)surveyFileRef.current.value="";}
  }

  return <div className="space-y-3">
    <section className="space-y-1.5">
      <Heading>Sides &amp; setbacks</Heading>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-2 px-2 text-[10px] text-slate-400"><span>Side</span><span className="w-20 text-right">Length</span><span className="w-[4.1rem] text-right">Setback</span></div>
      <div className="space-y-1">
        {plot.edges.map((edge,index)=>{const start=plot.corners[index],end=plot.corners[(index+1)%plot.corners.length];return <SideRow key={edge.id} index={index} edgeId={edge.id} label={edge.label} lengthMm={edge.actualLengthMm} setbackMm={setbackDistances[index]??0} bearing={segmentBearing(start,end,compassRotation)} scale={scale} unit={unit} onSetbackResult={accepted=>setSetbackNotice(accepted?"":setbackFailure)}/>;})}
      </div>
      <div className="flex items-center justify-end gap-1.5 text-[11px] text-slate-600">
        <span>Same setback on all sides</span>
        <input aria-label="Setback for all edges" type="number" min="0" step={unitSystem==="metric"?"0.1":"0.5"} value={uniformSetback} onChange={event=>setUniformSetback(event.target.value)} className="w-14 rounded border border-slate-200 bg-white px-1.5 py-1 text-right font-mono text-xs"/>
        <span>{unit}</span>
        <button type="button" onClick={()=>{const value=Number(uniformSetback);setSetbackNotice(Number.isFinite(value)&&value>=0&&setAllSetbacks(value*scale)?"":setbackFailure);}} className={buttonClass}>Apply</button>
      </div>
      {setbackNotice&&<Notice tone="warn">{setbackNotice}</Notice>}
      {roomsOutsideSetback.length>0&&<Notice tone="error"><AlertTriangle className="mr-1 inline size-3 align-[-2px]"/>{roomsOutsideSetback.length===1?"1 room crosses":`${roomsOutsideSetback.length} rooms cross`} the setback line: {rooms.filter(room=>roomsOutsideSetback.includes(room.id)).map(room=>room.name).join(", ")}. Move or resize them on the plan.</Notice>}
      <div className="flex gap-1.5 pt-1">
        <button type="button" disabled={!selectedEdgeId} onClick={()=>{if(selectedEdgeId&&!splitBoundaryEdge(selectedEdgeId))setBoundaryNotice("Could not split this side while keeping the rooms inside the setback area.");else setBoundaryNotice("");}} className={`flex-1 ${buttonClass}`} title="Add a point in the middle of the selected side">Split selected side</button>
        <button type="button" disabled={!selectedCornerId||plot.corners.length<=3} onClick={()=>{if(selectedCornerId&&!removeBoundaryCorner(selectedCornerId))setBoundaryNotice("This point cannot be removed without breaking the boundary or the rooms.");else setBoundaryNotice("");}} className={`flex-1 ${buttonClass} text-red-700 hover:bg-red-50`}>Remove selected point</button>
      </div>
      {boundaryNotice&&<Notice tone="warn">{boundaryNotice}</Notice>}
      <p className="text-[10px] leading-snug text-slate-400">Click a side or a corner on the plan to select it. Drag corners to reshape the plot, or drag the diamond handles to change setbacks.</p>
    </section>

    <Disclosure id="property-corners" title="Corner coordinates" hint={`${plot.corners.length} points`} reveal={reveal(["corner-"])}>
      <div className="overflow-hidden rounded-md border border-slate-200">
        <table className="w-full table-fixed text-xs">
          <thead><tr className="border-b border-slate-100 bg-slate-50 text-[10px]"><th className="w-[22%] px-2 py-1 text-left font-semibold text-slate-500">Point</th><th className="px-1 py-1 text-right font-semibold text-slate-500">X</th><th className="px-1 py-1 text-right font-semibold text-slate-500">Y</th><th className="w-[22%] px-2 py-1 text-right font-semibold text-slate-500">Angle</th></tr></thead>
          <tbody>
            {plot.corners.map((corner,index)=><tr id={`property-corner-${corner.id}`} key={corner.id} onClick={()=>selectCorner(corner.id)} className={`cursor-pointer border-b border-slate-50 last:border-0 ${selectedCornerId===corner.id?"bg-blue-50":""}`}>
              <td className="truncate px-2 py-0.5 font-medium text-slate-600">{corner.name||`P${index+1}`}</td>
              <td className="px-0.5 py-0.5"><DraftInput aria-label="X coordinate" value={format(corner.x)} onCommit={text=>commitCoordinate(corner.id,"x",text)} className="w-full min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 text-right font-mono text-[11px] text-slate-700 hover:border-slate-200 focus:border-blue-400 focus:bg-white focus:outline-none"/></td>
              <td className="px-0.5 py-0.5"><DraftInput aria-label="Y coordinate" value={format(corner.y)} onCommit={text=>commitCoordinate(corner.id,"y",text)} className="w-full min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 text-right font-mono text-[11px] text-slate-700 hover:border-slate-200 focus:border-blue-400 focus:bg-white focus:outline-none"/></td>
              <td className={`px-2 py-0.5 text-right font-mono text-[11px] ${angles[index]>180?"text-amber-700":"text-slate-600"}`} title={angles[index]>180?"Reflex (inward) corner":"Interior angle"}>{angles[index].toFixed(2)}°</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {coordinateNotice&&<p role="status" className="mt-1 text-[10px] text-red-600">{coordinateNotice}</p>}
      <p className="mt-1.5 text-[10px] leading-snug text-slate-400">Click a value to type an exact coordinate. Y increases downward. Angles total {angleSum.toFixed(2)}° (expected {expectedAngleSum}°). Extent {format(metrics.bounds.maxX-metrics.bounds.minX)} × {format(metrics.bounds.maxY-metrics.bounds.minY)}.</p>
    </Disclosure>

    <Disclosure title="Import survey CSV">
      <p className="text-[10px] leading-snug text-slate-500">Columns: point, easting, northing. Points are joined in row order; northing increases upward. Use local or projected coordinates, not latitude/longitude.</p>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <label className="text-[10px] text-slate-500">Units<select value={surveyUnit} onChange={event=>setSurveyUnit(event.target.value as SurveyCoordinateUnit)} className={`mt-0.5 w-full ${selectClass}`}><option value="m">Meters</option><option value="ft">Feet</option><option value="mm">Millimeters</option></select></label>
        <label className="text-[10px] text-slate-500">Reference<input type="text" value={surveyReference} onChange={event=>setSurveyReference(event.target.value)} placeholder="Local grid / EPSG" className={`mt-0.5 ${inputClass}`}/></label>
      </div>
      <input ref={surveyFileRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={event=>void importSurveyFile(event.target.files?.[0])}/>
      <div className="mt-1.5 flex items-center gap-2"><button type="button" onClick={()=>surveyFileRef.current?.click()} className={primaryButtonClass}>Choose CSV file</button><a href="data:text/csv;charset=utf-8,point%2Ceasting%2Cnorthing%0AA%2C0%2C0%0AB%2C20%2C0%0AC%2C20%2C15%0AD%2C0%2C15%0A" download="site-boundary-template.csv" className="text-[10px] text-blue-700 underline">Template</a></div>
      {surveyNotice&&<p role="status" className="mt-1 text-[10px] text-slate-600">{surveyNotice}</p>}
      {surveyMetadata&&<p className="mt-1 text-[10px] text-emerald-800">Source: {surveyMetadata.sourceFile} · {surveyMetadata.coordinateReference} · {surveyMetadata.sourcePoints.length} points{surveyMetadata.designBoundaryEditedAt?" · edited since import":""}</p>}
    </Disclosure>

    <section className="space-y-1.5">
      <Heading>Site features{siteFeatures.length>0&&<span className="ml-1.5 font-normal normal-case tracking-normal text-slate-400">{siteFeatures.length}</span>}</Heading>
      <div className="flex gap-1.5">
        <select aria-label="Site feature type" value={featureKind} onChange={event=>setFeatureKind(event.target.value as SiteFeatureKind)} className={`min-w-0 flex-1 ${selectClass}`}>{FEATURE_KINDS.map(([kind,label])=><option key={kind} value={kind}>{label}</option>)}</select>
        <button type="button" onClick={()=>setFeatureNotice(addSiteFeature(featureKind)?"":"Could not place this feature inside the plot.")} className={primaryButtonClass}>+ Add</button>
      </div>
      {featureNotice&&<Notice tone="warn">{featureNotice}</Notice>}
      {siteFeatures.length>0?<div className="space-y-1">{siteFeatures.map(feature=><SiteFeatureCard key={feature.id} feature={feature} scale={scale} unit={unit}/>)}</div>:<p className="text-[10px] leading-snug text-slate-400">Driveways, parking, trees, utilities and easements. New features appear at the plot centre; drag them into place.</p>}
    </section>

    <div className="border-t border-slate-200 pt-2">
      <button type="button" onClick={()=>{if(window.confirm("Reset this project's site to the default plot? Rooms, floors, setbacks and site features are cleared. You can undo this."))resetPlot();}} className="text-[11px] text-slate-500 underline-offset-2 hover:text-red-700 hover:underline">Reset plot to default…</button>
    </div>
  </div>;
}
