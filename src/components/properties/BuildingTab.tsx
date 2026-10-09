import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { usePlot } from "../../geometry/plot/PlotContext";
import { useUnits } from "../../geometry/units/UnitContext";
import { getRoomWallInset } from "../../geometry/plot/model";
import type { FloorPlanPreset, PlanObjectKind, Room, WallSide } from "../../geometry/plot/model";
import { Disclosure, DraftInput, Heading, Notice, buttonClass, chipClass, inputClass, primaryButtonClass, selectClass } from "./panelKit";

const PRESETS:[FloorPlanPreset,string][]=[["1bhk","1 BHK"],["2bhk","2 BHK"],["3bhk","3 BHK"]];
const QUICK_ROOMS:[string,number,number][]=[["Living room",14,16],["Kitchen",12,12],["Dining",12,12],["Guest room",12,12],["Washroom",6,8],["Store",6,8],["Prayer room",10,10],["Porch",8,14]];
const STILT_ROOMS:[string,number,number][]=[["Parking bay",2.7,5.4],["Stilt lobby",3,3],["Security room",3,3],["Utility room",2,2]];
const FURNITURE:[PlanObjectKind,string][]=[["dining-table","Dining table"],["chair","Chair"],["sofa","Sofa"],["vent-window","Ventilation window"]];

function roomsUnionArea(rooms:{x:number;y:number;width:number;height:number}[]){
  const xs=[...new Set(rooms.flatMap(r=>[r.x,r.x+r.width]))].sort((a,b)=>a-b);
  let area=0;
  for(let i=0;i<xs.length-1;i++){
    const left=xs[i],right=xs[i+1],mid=(left+right)/2;
    const spans=rooms.filter(r=>r.x<mid&&r.x+r.width>mid).map(r=>[r.y,r.y+r.height] as [number,number]).sort((a,b)=>a[0]-b[0]);
    let covered=0,start:number|undefined,end:number|undefined;
    for(const [a,b] of spans){if(start===undefined){start=a;end=b;}else if(a<=end!){end=Math.max(end!,b);}else{covered+=end!-start;start=a;end=b;}}
    if(start!==undefined)covered+=end!-start;
    area+=(right-left)*covered;
  }
  return area;
}

function SizeInput({label,valueMm,scale,unit,onCommit}:{label:string;valueMm:number;scale:number;unit:string;onCommit:(valueMm:number)=>boolean}){
  const [error,setError]=useState("");
  const commit=(draft:string)=>{const numeric=Number(draft);if(!Number.isFinite(numeric)||numeric<=0){setError("");return;}setError(onCommit(numeric*scale)?"":"Does not fit inside the setback area.");};
  return <label className="text-[10px] text-slate-500">{label} ({unit})<DraftInput type="number" min="1" step="0.5" value={(valueMm/scale).toFixed(1)} onCommit={commit} onFocus={()=>setError("")} className={`mt-0.5 font-mono ${inputClass}`}/>{error&&<span role="status" className="block text-[10px] text-red-600">{error}</span>}</label>;
}

/** Compact room row; expands into the room editor when selected. */
function RoomRow({room,selected,violates,scale,unit}:{room:Room;selected:boolean;violates:boolean;scale:number;unit:string}){
  const {openings,addOpening,removeOpening,resizeRoom,removeRoom,renameRoom,selectPropertyCard,selectedPropertyCardId}=usePlot();
  const {format}=useUnits();
  const [wallSide,setWallSide]=useState<WallSide>("top");
  const roomOpenings=openings.filter(item=>item.roomId===room.id);
  const kindLabel=room.kind==="stairs"?"Stairwell":room.kind==="lawn"?"Lawn":null;
  return <div id={`property-room-${room.id}`} className={`rounded-md border ${selected?"border-blue-400 bg-blue-50/60":violates?"border-red-200 bg-red-50/40":"border-slate-200 bg-white"}`}>
    <button type="button" onClick={()=>selectPropertyCard(selected?null:`room-${room.id}`)} aria-expanded={selected} className="flex w-full items-center gap-2 px-2 py-1.5 text-left">
      {selected?<ChevronDown className="size-3.5 shrink-0 text-slate-400"/>:<ChevronRight className="size-3.5 shrink-0 text-slate-400"/>}
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800">{room.name}{kindLabel&&<span className="ml-1.5 text-[10px] font-normal text-slate-400">{kindLabel}</span>}</span>
      {violates&&<AlertTriangle className="size-3.5 shrink-0 text-red-600" aria-label="Crosses the setback line"/>}
      <span className="shrink-0 font-mono text-[10px] text-slate-500">{(room.width/scale).toFixed(1)} × {(room.height/scale).toFixed(1)} {unit}</span>
    </button>
    {selected&&<div className="space-y-2 border-t border-blue-100 px-2 pb-2 pt-2">
      <label className="block text-[10px] text-slate-500">Name<DraftInput aria-label={`Room label for ${room.name}`} value={room.name} onCommit={name=>renameRoom(room.id,name)} className={`mt-0.5 ${inputClass}`}/></label>
      <div className="grid grid-cols-2 gap-2"><SizeInput label="Width" valueMm={room.width} scale={scale} unit={unit} onCommit={value=>resizeRoom(room.id,room.x,room.y,value,room.height)}/><SizeInput label="Depth" valueMm={room.height} scale={scale} unit={unit} onCommit={value=>resizeRoom(room.id,room.x,room.y,room.width,value)}/></div>
      {violates&&<Notice tone="error">Crosses the setback line. Move or shrink it on the plan.</Notice>}
      {room.points&&<p className="text-[10px] text-slate-500">Custom shape · drag its corners on the plan to reshape.</p>}
      {room.kind!=="lawn"&&<div>
        <p className="mb-1 text-[10px] font-medium text-slate-500">Doors &amp; windows</p>
        {roomOpenings.length>0&&<ul className="mb-1 space-y-0.5">{roomOpenings.map(item=><li id={`property-opening-${item.id}`} key={item.id} onClick={()=>selectPropertyCard(`opening-${item.id}`)} className={`flex items-center justify-between rounded px-1.5 py-0.5 text-[11px] text-slate-600 ${selectedPropertyCardId===`opening-${item.id}`?"bg-blue-100":"bg-white"}`}><span><span className="capitalize">{item.type}</span> · {item.side} wall · {format(item.width)}</span><button type="button" onClick={event=>{event.stopPropagation();removeOpening(item.id);}} aria-label={`Remove ${item.type}`} className="rounded p-0.5 text-slate-400 hover:text-red-600"><Trash2 className="size-3"/></button></li>)}</ul>}
        <div className="flex items-center gap-1">
          <select aria-label="Wall for new opening" value={wallSide} onChange={event=>setWallSide(event.target.value as WallSide)} className={`${selectClass} py-1 text-[11px]`}><option value="top">Top wall</option><option value="right">Right wall</option><option value="bottom">Bottom wall</option><option value="left">Left wall</option></select>
          <button type="button" onClick={()=>addOpening(room.id,"door",wallSide)} className={`${buttonClass} py-1`}>+ Door</button>
          <button type="button" onClick={()=>addOpening(room.id,"window",wallSide)} className={`${buttonClass} py-1`}>+ Window</button>
        </div>
        <p className="mt-1 text-[10px] text-slate-400">Drag an opening along its wall on the plan.</p>
      </div>}
      <button type="button" onClick={()=>removeRoom(room.id)} aria-label={room.kind==="stairs"?"Remove stairwell from all floors":`Remove ${room.name}`} className="text-[11px] text-red-600 hover:underline">{room.kind==="stairs"?"Remove stairwell from all floors":"Remove room"}</button>
    </div>}
  </div>;
}

export function BuildingTab(){
  const {metrics,rooms,planObjects,addPlanObject,removePlanObject,addRoom,applyFloorPlanPreset,compassRotation,floorPlans,groundLevel,activeFloorId,setActiveFloor,addFloor,duplicateActiveFloor,removeActiveFloor,addStairwell,roomsOutsideSetback,selectedPropertyCardId,openings}=usePlot();
  const {unitSystem}=useUnits();
  const scale=unitSystem==="metric"?1000:304.8, unit=unitSystem==="metric"?"m":"ft", areaUnit=unitSystem==="metric"?"m²":"sq ft";
  const [vastu,setVastu]=useState(false);
  const [targetPreset,setTargetPreset]=useState<FloorPlanPreset>("3bhk");
  const [targetAreaSqMm,setTargetAreaSqMm]=useState(1900*304.8*304.8);
  const [presetNotice,setPresetNotice]=useState("");
  const [floorNotice,setFloorNotice]=useState("");
  const [customName,setCustomName]=useState("");
  const [customWidth,setCustomWidth]=useState(unitSystem==="metric"?"4":"12");
  const [customDepth,setCustomDepth]=useState(unitSystem==="metric"?"4":"12");
  const [noteText,setNoteText]=useState("Note");
  const ground=activeFloorId==="ground";
  const activeFloor=floorPlans.find(floor=>floor.id===activeFloorId);
  const levelName=ground?"Ground floor":activeFloor?.name??"Floor";
  const hasOwnRooms=rooms.some(room=>room.kind!=="stairs");
  const selectedRoomId=selectedPropertyCardId?.startsWith("room-")?selectedPropertyCardId.slice(5):selectedPropertyCardId?.startsWith("opening-")?openings.find(item=>item.id===selectedPropertyCardId.slice(8))?.roomId??null:null;
  const occupied=roomsUnionArea(rooms);
  const clear=roomsUnionArea(rooms.map(room=>{const left=getRoomWallInset(room,"left",rooms),right=getRoomWallInset(room,"right",rooms),top=getRoomWallInset(room,"top",rooms),bottom=getRoomWallInset(room,"bottom",rooms);return{x:room.x+left,y:room.y+top,width:Math.max(0,room.width-left-right),height:Math.max(0,room.height-top-bottom)};}));
  const nextSlot=()=>{const index=rooms.length;return{x:metrics.bounds.minX+1000+(index%3)*3500,y:metrics.bounds.minY+1000+Math.floor(index/3)*3500};};
  const addQuickRoom=(name:string,w:number,h:number,unitScale:number)=>addRoom({name,...nextSlot(),width:w*unitScale,height:h*unitScale});
  const applyPreset=(preset:FloorPlanPreset,area?:number)=>setPresetNotice(applyFloorPlanPreset(preset,area,vastu)?"":"This layout does not fit inside the setback area. Reduce the setbacks or enlarge the plot.");

  const templates=<div className="space-y-2">
    <div className="grid grid-cols-3 gap-1">{PRESETS.map(([preset,label])=><button key={preset} type="button" onClick={()=>applyPreset(preset)} className="rounded-md border border-blue-200 bg-blue-50 px-1 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100">{label}</button>)}</div>
    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-600"><input type="checkbox" checked={vastu} onChange={event=>setVastu(event.target.checked)} className="accent-teal-700"/>Vastu-inspired placement<span className="text-slate-400" title="Prayer toward NE, kitchen SE, master bedroom SW, living toward north/east, following the compass rounded to 90°.">ⓘ</span></label>
    <details className="text-[11px] text-slate-600"><summary className="cursor-pointer text-slate-500">Scale a layout to a target area</summary>
      <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-1.5">
        <select aria-label="Layout to scale" value={targetPreset} onChange={event=>setTargetPreset(event.target.value as FloorPlanPreset)} className={selectClass}>{PRESETS.map(([preset,label])=><option key={preset} value={preset}>{label}</option>)}</select>
        <label className="flex min-w-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 text-[10px] text-slate-400"><DraftInput aria-label="Target floor area" type="number" min="1" step="1" value={(targetAreaSqMm/(scale*scale)).toFixed(unitSystem==="metric"?1:0)} onCommit={value=>{const n=Number(value);if(n>0)setTargetAreaSqMm(n*scale*scale);}} className="min-w-0 flex-1 py-1 text-right font-mono text-xs text-slate-800 focus:outline-none"/>{areaUnit}</label>
      </div>
      <button type="button" onClick={()=>applyPreset(targetPreset,targetAreaSqMm)} className={`mt-1.5 w-full ${primaryButtonClass}`}>Generate scaled layout</button>
    </details>
    <p className="text-[10px] leading-snug text-slate-400">A template replaces the rooms on {levelName} only. North is {compassRotation}° from plan-up.</p>
    {presetNotice&&<Notice tone="error">{presetNotice}</Notice>}
  </div>;

  return <div className="space-y-3">
    <section className="space-y-1.5">
      <Heading action={<button type="button" onClick={addFloor} className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 hover:underline"><Plus className="size-3"/>Add floor</button>}>Floors</Heading>
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Floor to edit">
        <button type="button" role="tab" aria-selected={ground} onClick={()=>setActiveFloor("ground")} className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${ground?"border-teal-400 bg-teal-50 text-teal-900":"border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`} title="Stilt parking and ground-level spaces">Ground floor · Stilt plan{groundLevel.rooms.length>0&&<span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-[10px] font-normal text-slate-500">{groundLevel.rooms.filter(room=>room.kind!=="stairs").length}</span>}</button>
        {floorPlans.map(floor=><button key={floor.id} type="button" role="tab" aria-selected={floor.id===activeFloorId} onClick={()=>setActiveFloor(floor.id)} className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${floor.id===activeFloorId?"border-blue-400 bg-blue-50 text-blue-800":"border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{floor.name}{floor.rooms.length>0&&<span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-[10px] font-normal text-slate-500">{floor.rooms.filter(room=>room.kind!=="stairs").length}</span>}</button>)}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        {!ground&&<button type="button" onClick={duplicateActiveFloor} className="text-slate-600 hover:underline">Duplicate current floor</button>}
        <button type="button" onClick={()=>setFloorNotice(addStairwell()?"Stairwell added to every floor. Drag it into position; add a door on each landing.":"Could not fit a stairwell inside this plot.")} className="text-slate-600 hover:underline" title="One enclosed stairwell, aligned on every floor">+ Shared stairwell</button>
        {!ground&&activeFloor&&<button type="button" onClick={()=>{if(window.confirm(`Remove ${activeFloor.name} and its rooms? You can undo this.`))removeActiveFloor();}} className="text-red-600 hover:underline">Remove {activeFloor.name}</button>}
      </div>
      {floorNotice&&<Notice>{floorNotice}</Notice>}
    </section>

    {!hasOwnRooms?<section className="rounded-lg border border-dashed border-blue-300 bg-blue-50/40 p-3">
      <p className="text-xs font-semibold text-slate-800">{ground?"Create the ground floor":`Start ${levelName}`}</p>
      <p className="mb-2 mt-0.5 text-[11px] text-slate-500">{ground?"Add parking bays and service spaces, or draw any custom room below.":"Pick a layout to start with, then adjust every room."}</p>
      {ground?<div className="grid grid-cols-2 gap-1">{STILT_ROOMS.map(([name,w,h])=><button key={name} type="button" onClick={()=>addQuickRoom(name,w,h,1000)} className={chipClass}>+ {name}</button>)}</div>:templates}
    </section>:<Disclosure title={ground?"Stilt plan starters":"Replace with a template"}>{ground?<div className="grid grid-cols-2 gap-1">{STILT_ROOMS.map(([name,w,h])=><button key={name} type="button" onClick={()=>addQuickRoom(name,w,h,1000)} className={chipClass}>+ {name}</button>)}</div>:templates}</Disclosure>}

    <section className="space-y-1.5">
      <Heading>Rooms on {levelName}{rooms.length>0&&<span className="ml-1.5 font-normal normal-case tracking-normal text-slate-400">{rooms.length}</span>}</Heading>
      {rooms.length>0&&<div className="space-y-1">{rooms.map(room=><RoomRow key={room.id} room={room} selected={selectedRoomId===room.id} violates={roomsOutsideSetback.includes(room.id)} scale={scale} unit={unit}/>)}</div>}
      {rooms.length>0&&<p className="text-[10px] leading-snug text-slate-400">Click a room here or on the plan to edit it. Drag rooms to move them; drag a corner handle to resize.</p>}
    </section>

    <Disclosure title="Add a room" defaultOpen={rooms.length>0&&rooms.length<3}>
      <div className="grid grid-cols-2 gap-1">{QUICK_ROOMS.map(([name,w,h])=><button type="button" key={name} onClick={()=>addQuickRoom(name,w,h,304.8)} className={chipClass}>+ {name}</button>)}</div>
      <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
        <p className="text-[10px] font-medium text-slate-500">Custom room</p>
        <input aria-label="Custom room name" value={customName} onChange={event=>setCustomName(event.target.value)} placeholder="Name, e.g. Study" className={inputClass}/>
        <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-1.5">
          <label className="text-[10px] text-slate-500">Width ({unit})<input type="number" min="1" step="0.5" value={customWidth} onChange={event=>setCustomWidth(event.target.value)} className={`mt-0.5 font-mono ${inputClass}`}/></label>
          <label className="text-[10px] text-slate-500">Depth ({unit})<input type="number" min="1" step="0.5" value={customDepth} onChange={event=>setCustomDepth(event.target.value)} className={`mt-0.5 font-mono ${inputClass}`}/></label>
          <button type="button" onClick={()=>{const w=Number(customWidth)*scale,h=Number(customDepth)*scale,name=customName.trim();if(!name||!(w>0)||!(h>0))return;addRoom({name,...nextSlot(),width:w,height:h});setCustomName("");}} disabled={!customName.trim()} className={primaryButtonClass}>Add</button>
        </div>
        <button type="button" onClick={()=>{const w=unitSystem==="metric"?6000:20*304.8;addRoom({name:"Lawn",kind:"lawn",...nextSlot(),width:w,height:w});}} className={`w-full ${buttonClass} border-emerald-200 text-emerald-800 hover:bg-emerald-50`}>+ Lawn (open area, no walls)</button>
      </div>
    </Disclosure>

    <Disclosure title="Furniture & notes" hint={planObjects.length?String(planObjects.length):undefined} reveal={selectedPropertyCardId?.startsWith("plan-object-")?selectedPropertyCardId:null}>
      <div className="grid grid-cols-2 gap-1">{FURNITURE.map(([kind,label])=><button key={kind} type="button" onClick={()=>addPlanObject(kind)} className={chipClass}>+ {label}</button>)}</div>
      <div className="mt-1.5 flex gap-1"><input aria-label="Text to add to floor plan" value={noteText} onChange={event=>setNoteText(event.target.value)} className={inputClass}/><button type="button" onClick={()=>addPlanObject("text",noteText)} className={buttonClass}>+ Text</button></div>
      {planObjects.length>0&&<ul className="mt-1.5 space-y-0.5">{planObjects.map((item,index)=><li key={item.id} id={`property-plan-object-${item.id}`} className={`flex items-center justify-between rounded px-1.5 py-0.5 text-[11px] text-slate-600 ${selectedPropertyCardId===`plan-object-${item.id}`?"bg-violet-100":""}`}><span>{item.kind==="text"?item.text:`${item.kind.replaceAll("-"," ")} ${index+1}`}</span><button type="button" onClick={()=>removePlanObject(item.id)} aria-label={`Remove ${item.kind.replaceAll("-"," ")}`} className="rounded p-0.5 text-slate-400 hover:text-red-600"><Trash2 className="size-3"/></button></li>)}</ul>}
      <p className="mt-1 text-[10px] text-slate-400">Items appear on the plan; drag them into place.</p>
    </Disclosure>

    {rooms.length>0&&<p className="border-t border-slate-200 pt-2 text-[11px] text-slate-500">Rooms cover <b className="font-mono text-slate-700">{(occupied/(scale*scale)).toFixed(1)} {areaUnit}</b> ({metrics.areaSqMm>0?(occupied/metrics.areaSqMm*100).toFixed(0):"0"}% of the plot) · clear floor area <b className="font-mono text-slate-700">{(clear/(scale*scale)).toFixed(1)} {areaUnit}</b></p>}
  </div>;
}
