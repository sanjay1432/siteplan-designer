import { useState } from "react";
import { usePlot } from "../../geometry/plot/PlotContext";
import { useUnits } from "../../geometry/units/UnitContext";
import { sqMmToSqFeet, sqMmToSqMeters } from "../../geometry/units/units";
import { tryParseDimension } from "../../geometry/units/parser";
import type { PlotEdgeName } from "../../types/plot";
import { RotateCcw, ChevronRight, Undo2, Redo2, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import type { FloorPlanPreset, WallSide } from "../../geometry/plot/PlotContext";

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
  edgeName: PlotEdgeName;
  currentMm: number;
}

function EdgeInput({ label, edgeName, currentMm }: EdgeInputProps) {
  const { updateEdgeDimension, selectedEdgeId, selectEdge, plot } = usePlot();
  const { format, unitSystem } = useUnits();

  const edge = plot.edges.find((e) => e.name === edgeName);
  const isSelected = edge?.id === selectedEdgeId;

  const [editValue, setEditValue] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState("");

  const displayValue = format(currentMm);

  function startEditing() {
    setEditValue(displayValue);
    setIsEditing(true);
    setError("");
    if (edge) selectEdge(edge.id);
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

    updateEdgeDimension(edgeName, result.mm);
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
    <div
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

export function PlotPropertiesPanel() {
  const { plot, dimensions, metrics, resetPlot, rooms, openings, addRoom, addOpening, removeOpening, removeFloorPlan, applyFloorPlanPreset, resizeRoom, removeRoom, canUndo, canRedo, undo, redo, compassRotation, floorPlans, groundLevel, activeFloorId, setActiveFloor, addFloor, duplicateActiveFloor, removeActiveFloor, addStairwell, setbackMm, setSetbackMm } = usePlot();
  const { unitSystem, format } = useUnits();
  const [customName,setCustomName]=useState("");
  const [customWidth,setCustomWidth]=useState(unitSystem === "metric" ? "4" : "12");
  const [customDepth,setCustomDepth]=useState(unitSystem === "metric" ? "4" : "12");
  const [wallSides,setWallSides]=useState<Record<string,WallSide>>({});
  const [presetError,setPresetError]=useState("");
  const [targetPreset,setTargetPreset]=useState<FloorPlanPreset>("3bhk");
  const [vastuInspired,setVastuInspired]=useState(false);
  const [stairwellNotice,setStairwellNotice]=useState("");
  const [setbackNotice,setSetbackNotice]=useState("");
  const [targetAreaSqMm,setTargetAreaSqMm]=useState(1900*304.8*304.8);
  const scale = unitSystem === "metric" ? 1000 : 304.8;
  const footprint = roomsUnionArea(rooms);
  const remaining = Math.max(0, metrics.areaSqMm - footprint);
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

  return (
    <div className="flex h-full flex-col border-l border-slate-200 bg-slate-50">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Plot Properties</h2>
          <p className="text-xs text-slate-500">Irregular Quadrilateral</p>
        </div>
        <div className="flex items-center">
          <Button variant="ghost" size="icon-sm" onClick={undo} disabled={!canUndo} title="Undo last plot or room change" className="text-slate-400 hover:text-slate-700"><Undo2 className="size-4" /></Button>
          <Button variant="ghost" size="icon-sm" onClick={redo} disabled={!canRedo} title="Redo change" className="text-slate-400 hover:text-slate-700"><Redo2 className="size-4" /></Button>
          <Button variant="ghost" size="icon-sm" onClick={resetPlot} title="Reset plot" className="text-slate-400 hover:text-slate-700"><RotateCcw className="size-4" /></Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
        <section className="rounded-lg border border-teal-200 bg-teal-50/70 p-3">
          <div className="flex items-center justify-between gap-3">
            <div><h3 className="text-xs font-semibold text-teal-950">Setback from plot edges</h3><p className="mt-0.5 text-[10px] leading-relaxed text-teal-800">Reserved clearance around the building area, shown as a dotted boundary.</p></div>
            <label className="flex shrink-0 items-center gap-1.5 text-[10px] text-teal-900"><input aria-label={`Setback distance in ${unitSystem === "metric" ? "metres" : "feet"}`} type="number" min="0" step={unitSystem === "metric" ? "0.1" : "0.5"} value={(setbackMm/scale).toFixed(unitSystem === "metric" ? 2 : 1)} onChange={event=>{const accepted=setSetbackMm(Math.max(0,Number(event.target.value)||0)*scale);setSetbackNotice(accepted?"":"Setback not applied: one or more floor plans would fall outside the new boundary.")}} className="w-16 rounded border border-teal-300 bg-white px-1.5 py-1 text-right font-mono text-xs text-slate-800"/><span>{unitSystem === "metric" ? "m" : "ft"}</span></label>
          </div>
          <div className="mt-2 flex items-center justify-between"><span className="text-[9px] text-teal-700">{setbackMm>0?`Dotted line is ${format(setbackMm)} inside each edge.`:"Enter a distance to show the reserved zone."}</span><button type="button" onClick={()=>setSetbackNotice(setSetbackMm(3*304.8)?"":"Setback not applied: one or more floor plans would fall outside the new boundary.")} className="rounded border border-teal-300 bg-white px-2 py-1 text-[9px] font-semibold text-teal-800 hover:bg-teal-100">Set 3 ft</button></div>
          {setbackNotice&&<p role="status" className="mt-1 text-[9px] text-amber-800">{setbackNotice}</p>}
        </section>
        <section>
          <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{activeFloorId==="ground"?"Ground · Stilt parking":floorPlans.find(floor=>floor.id===activeFloorId)?.name} plan rooms</h3>{rooms.length>0 && <button type="button" onClick={removeFloorPlan} className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-red-600 hover:bg-red-50"><Trash2 className="size-3"/>Remove plan</button>}</div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              <div className="mb-2 flex items-center justify-between"><div><p className="text-xs font-semibold text-slate-800">Building levels</p><p className="text-[10px] text-slate-500">Stilt parking + {floorPlans.length} editable floors</p></div><button type="button" onClick={addFloor} className="rounded-md bg-blue-600 px-2.5 py-1.5 text-[10px] font-semibold text-white hover:bg-blue-700">+ Add floor</button></div>
              <button type="button" onClick={()=>setActiveFloor("ground")} aria-pressed={activeFloorId==="ground"} className={`mb-2 flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left ${activeFloorId==="ground"?"border-teal-300 bg-teal-50":"border-slate-200 bg-white hover:bg-slate-50"}`}><span className="grid size-6 place-items-center rounded bg-slate-100 text-xs">G</span><span className="min-w-0 flex-1"><b className="block text-[11px] text-slate-700">Ground · Stilt parking</b><small className="text-[9px] text-slate-500">{groundLevel.rooms.filter(room=>room.kind!=="stairs").length} spaces · click to edit in 2D</small></span>{activeFloorId==="ground"&&<span className="text-[9px] font-semibold text-teal-800">EDITING</span>}</button>
              <div className="space-y-1">{floorPlans.map(floor=><div key={floor.id} className={`flex items-center gap-1 rounded-md border p-1 ${floor.id===activeFloorId?"border-blue-300 bg-blue-50":"border-slate-200 bg-white"}`}>
                <button type="button" onClick={()=>setActiveFloor(floor.id)} aria-pressed={floor.id===activeFloorId} className="min-w-0 flex-1 px-2 py-1 text-left"><b className={`block text-[11px] ${floor.id===activeFloorId?"text-blue-800":"text-slate-700"}`}>{floor.name}</b><span className="text-[9px] text-slate-500">{floor.rooms.filter(room=>room.kind!=="stairs").length} spaces{floor.rooms.some(room=>room.kind==="stairs")?" · shared stairwell":""}</span></button>
                {floor.id===activeFloorId&&floorPlans.length>1&&<button type="button" onClick={removeActiveFloor} title="Remove this floor" className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50">×</button>}
              </div>)}</div>
              <div className="mt-2 flex gap-1.5"><button type="button" onClick={duplicateActiveFloor} disabled={activeFloorId==="ground"} title={activeFloorId==="ground"?"Choose an upper floor to duplicate":"Duplicate selected floor"} className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45">Duplicate current floor</button><button type="button" onClick={()=>setStairwellNotice(addStairwell()?"Shared enclosed stairwell added to every floor. Drag it to adjust its position and size.":"Could not fit a stairwell inside this plot.")} className="flex-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] font-medium text-amber-900 hover:bg-amber-100">+ Shared stairwell</button></div>
              {stairwellNotice&&<p role="status" className="mt-1 text-[9px] text-slate-600">{stairwellNotice}</p>}
              <p className="mt-1 text-[9px] leading-relaxed text-slate-500">Stairwell walls stay separate from room interiors. Its position and size stay aligned on every floor; add a door on each landing as needed.</p>
            </div>
            {rooms.length===0 && <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-center"><p className="text-xs font-medium text-slate-700">Start a new floor plan</p><p className="mt-1 text-[10px] text-slate-500">Choose a BHK template or add your first room below.</p></div>}
            <p className="text-[11px] text-slate-500">Add rooms and porch areas; drag each shape to arrange the plan. Dimensions in {unitSystem === "metric" ? "m" : "ft"}.</p>
            <div className="border-b border-slate-100 pb-2">
              <div className="mb-1 flex items-center justify-between"><p className="text-[10px] font-semibold text-slate-500">Generate a floor plan</p><label className="flex cursor-pointer items-center gap-1 text-[10px] font-medium text-teal-800"><input type="checkbox" checked={vastuInspired} onChange={event=>setVastuInspired(event.target.checked)} className="accent-teal-700"/>Vastu-inspired</label></div>
              {vastuInspired && <p className="mb-2 rounded-md bg-teal-50 px-2 py-1.5 text-[10px] leading-relaxed text-teal-900">Places prayer toward NE, kitchen SE, master bedroom SW, with living space toward north/east. Orientation follows the compass, rounded to the nearest 90° for this rectangular room editor. Traditions vary.</p>}
              <p className="mb-1 text-[10px] font-semibold text-slate-500">Scale to a target area</p>
              <div className="grid grid-cols-[1fr_1.2fr] gap-1.5">
                <select value={targetPreset} onChange={e=>setTargetPreset(e.target.value as FloorPlanPreset)} className="rounded border border-slate-200 bg-white px-1.5 py-1.5 text-xs text-slate-700"><option value="1bhk">1 BHK</option><option value="2bhk">2 BHK</option><option value="3bhk">3 BHK</option></select>
                <label className="flex items-center gap-1 rounded border border-slate-200 px-1.5 text-[10px] text-slate-400"><input type="number" min="1" step={unitSystem === "metric" ? "0.1" : "1"} value={(targetAreaSqMm/(scale*scale)).toFixed(unitSystem === "metric" ? 1 : 0)} onChange={e=>{const n=Number(e.target.value);if(n>0)setTargetAreaSqMm(n*scale*scale)}} className="min-w-0 flex-1 py-1 text-right font-mono text-xs text-slate-800 focus:outline-none"/><span>{unitSystem === "metric" ? "m²" : "sq ft"}</span></label>
              </div>
              <button type="button" onClick={()=>setPresetError(applyFloorPlanPreset(targetPreset,targetAreaSqMm,vastuInspired)?"":"This layout cannot fit at that area inside the current plot.")} className="mt-1.5 w-full rounded bg-blue-600 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700">Generate {vastuInspired?"Vastu-inspired":"standard"} layout</button>
              <p className="mt-1 text-[9px] text-slate-400">Scales all spaces proportionally; room-area total matches the target.</p>
              {presetError && <p className="mt-1 text-[10px] text-red-600">{presetError}</p>}
            </div>
            <div className="border-b border-slate-100 pb-2">
              <p className="mb-1 text-[10px] font-semibold text-slate-500">{vastuInspired?"Vastu-influenced templates":"Prebuilt floor plans"} · {floorPlans.find(floor=>floor.id===activeFloorId)?.name}</p>
              <div className="grid grid-cols-3 gap-1">{([["1bhk","1 BHK"],["2bhk","2 BHK"],["3bhk","3 BHK"]] as [FloorPlanPreset,string][]).map(([preset,label])=><button key={preset} type="button" onClick={()=>setPresetError(applyFloorPlanPreset(preset,undefined,vastuInspired)?"":"This layout does not fit inside the current plot.")} className={`rounded border px-1 py-1.5 text-[10px] font-semibold ${vastuInspired?"border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100":"border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"}`}>{label}</button>)}</div>
              <p className="mt-1 text-[9px] text-slate-400">North reference: {compassRotation}° from plan-up. A template replaces rooms on this floor only.</p>
            </div>
            {rooms.map(room => <div key={room.id} className="rounded border border-slate-100 p-2">
              <div className="mb-1 flex justify-between text-xs font-medium text-slate-700"><span>{room.name}</span>{rooms.length>1 && <button onClick={()=>removeRoom(room.id)} className="text-slate-400 hover:text-red-600">Remove</button>}</div>
              <div className="grid grid-cols-2 gap-2">{[{key:"width",value:room.width},{key:"depth",value:room.height}].map(({key,value})=><label key={key} className="text-[10px] capitalize text-slate-400">{key}<input type="number" min="1" step="0.5" value={(value/scale).toFixed(1)} onChange={e=>{const n=Number(e.target.value)*scale;if(n>0)resizeRoom(room.id,room.x,room.y,key==="width"?n:room.width,key==="depth"?n:room.height)}} className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 font-mono text-xs text-slate-700"/></label>)}</div>
              {room.kind==="stairs" && <p className="text-[9px] text-amber-700">Stairs · drag corners to resize</p>}
              <div className="mt-1 flex items-center gap-1"><select value={wallSides[room.id]??"top"} onChange={e=>setWallSides(v=>({...v,[room.id]:e.target.value as WallSide}))} className="rounded border border-slate-200 bg-white px-1 py-1 text-[10px] text-slate-600"><option value="top">Top wall</option><option value="right">Right wall</option><option value="bottom">Bottom wall</option><option value="left">Left wall</option></select><button type="button" onClick={()=>addOpening(room.id,"door",wallSides[room.id]??"top")} className="rounded bg-violet-50 px-1.5 py-1 text-[10px] text-violet-700 hover:bg-violet-100">+ Door</button><button type="button" onClick={()=>addOpening(room.id,"window",wallSides[room.id]??"top")} className="rounded bg-sky-50 px-1.5 py-1 text-[10px] text-sky-700 hover:bg-sky-100">+ Window</button></div>
              {openings.filter(item=>item.roomId===room.id).map(item=><div key={item.id} className="mt-1 flex justify-between pl-1 text-[9px] text-slate-500"><span>{item.type} · {item.side} wall · {format(item.width)}</span><button type="button" onClick={()=>removeOpening(item.id)} className="text-red-500 hover:text-red-700">Remove</button></div>)}
            </div>)}
            <div className="grid grid-cols-2 gap-1 pt-1">{[["Guest room",12,12],["Washroom",6,8],["Store",6,8],["Prayer room",10,10],["Kitchen",12,12],["Living room",14,16],["Dining",12,12],["Porch",8,14]].map(([name,w,h])=><button key={name} onClick={()=>{const index=rooms.length;const x=metrics.bounds.minX+1000+(index%3)*3500,y=metrics.bounds.minY+1000+Math.floor(index/3)*3500;addRoom({name:String(name),x,y,width:Number(w)*304.8,height:Number(h)*304.8})}} className="rounded border border-slate-200 px-1.5 py-1 text-[10px] text-slate-600 hover:border-blue-300 hover:bg-blue-50">+ {name}</button>)}</div>
            <div className="space-y-1.5 border-t border-slate-100 pt-2">
              <p className="text-[10px] font-semibold text-slate-500">Create a custom room</p>
              <input value={customName} onChange={e=>setCustomName(e.target.value)} placeholder="Room type (e.g. Study)" className="w-full rounded border border-slate-200 px-2 py-1 text-xs" />
              <div className="grid grid-cols-2 gap-2"><label className="text-[10px] text-slate-400">Width ({unitSystem === "metric" ? "m" : "ft"})<input type="number" min="1" step="0.5" value={customWidth} onChange={e=>setCustomWidth(e.target.value)} className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 font-mono text-xs text-slate-700"/></label><label className="text-[10px] text-slate-400">Depth ({unitSystem === "metric" ? "m" : "ft"})<input type="number" min="1" step="0.5" value={customDepth} onChange={e=>setCustomDepth(e.target.value)} className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 font-mono text-xs text-slate-700"/></label></div>
              <button type="button" onClick={()=>{const w=Number(customWidth)*scale,h=Number(customDepth)*scale,name=customName.trim();if(!name||!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)return;addRoom({name,x:metrics.bounds.minX+1000,y:metrics.bounds.minY+1000,width:w,height:h});setCustomName("");}} className="w-full rounded bg-blue-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-700">Add room</button>
            </div>
            <div className="space-y-1 border-t border-slate-100 pt-2 text-xs"><div className="flex justify-between"><span className="text-slate-500">Room area total</span><b className="font-mono">{(footprint/(scale*scale)).toFixed(1)} {unitSystem === "metric" ? "m²" : "sq ft"}</b></div><div className="flex justify-between"><span className="text-slate-500">Plot area remaining*</span><b className="font-mono text-emerald-700">{(remaining/(scale*scale)).toFixed(1)} {unitSystem === "metric" ? "m²" : "sq ft"}</b></div></div>
            {primaryRoom && <div className="grid grid-cols-2 gap-y-1 border-t border-slate-100 pt-2 text-[11px]">{clearances.map(item=><div key={item.label} className="flex justify-between pr-2"><span className="text-slate-500">{item.label} clearance</span><span className="font-mono">{format(item.value)}</span></div>)}</div>}
            <p className="text-[9px] text-slate-400">Room areas are unioned, so overlapping spaces are not double-counted.</p>
          </div>
        </section>
        {/* Dimension inputs */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Dimensions
          </h3>
          <div className="space-y-2">
            <EdgeInput label="Top" edgeName="top" currentMm={dimensions.top} />
            <EdgeInput label="Right" edgeName="right" currentMm={dimensions.right} />
            <EdgeInput label="Bottom" edgeName="bottom" currentMm={dimensions.bottom} />
            <EdgeInput label="Left" edgeName="left" currentMm={dimensions.left} />
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
            Corner Coordinates (mm)
          </h3>
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-3 py-1.5 text-left font-semibold text-slate-500">Corner</th>
                  <th className="px-3 py-1.5 text-right font-semibold text-slate-500">X (mm)</th>
                  <th className="px-3 py-1.5 text-right font-semibold text-slate-500">Y (mm)</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { id: "corner-tl", label: "TL (Top-Left)" },
                  { id: "corner-tr", label: "TR (Top-Right)" },
                  { id: "corner-br", label: "BR (Bottom-Right)" },
                  { id: "corner-bl", label: "BL (Bottom-Left)" },
                ].map(({ id, label }) => {
                  const corner = plot.corners.find((c) => c.id === id);
                  if (!corner) return null;
                  return (
                    <tr key={id} className="border-b border-slate-50 last:border-0">
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
          Geometry solved via circle-circle intersection (exact).
        </p>
      </div>
    </div>
  );
}
