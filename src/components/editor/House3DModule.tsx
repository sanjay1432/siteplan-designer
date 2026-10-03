import { useEffect, useMemo, useRef, useState } from "react";
import { usePlot } from "../../geometry/plot/PlotContext";
import { useUnits } from "../../geometry/units/UnitContext";
import { offsetPolygonInward } from "../../geometry/plot/setback";

type Point3 = { x: number; y: number; z: number };
type Point2 = { x: number; y: number };
type Face = { key: string; points: Point2[]; fill: string; stroke: string; order: number; opacity?: number; pillarId?: string };
type PillarPoint = { id:string; x:number; y:number };

const FLOOR_COLORS = ["#e9d9bd", "#cbdccf", "#d5dce8", "#e6d4cd", "#d9d0e5"];

/** Separate isometric viewer generated from the active 2D room plan. */
export function House3DModule() {
  const { rooms, openings, building, plot, compassRotation, floorPlans, groundLevel, setbackMm } = usePlot();
  const { format } = useUnits();
  const [wallHeightFt, setWallHeightFt] = useState(10);
  const [foundationDepthFt, setFoundationDepthFt] = useState(1.5);
  const [pillarSpacingFt, setPillarSpacingFt] = useState(12);
  const [pillarLayout, setPillarLayout] = useState<"eight"|"grid">("eight");
  const [removedPillarIds, setRemovedPillarIds] = useState<string[]>([]);
  const [selectedPillarId, setSelectedPillarId] = useState<string|null>(null);
  const [stiltHeightFt, setStiltHeightFt] = useState(10);
  const floorCount = floorPlans.length;
  const [angle, setAngle] = useState(35);
  const [elevation, setElevation] = useState(32);
  const [showRoof, setShowRoof] = useState(false);
  const dragRef = useRef<{ pointerId:number; x:number; y:number } | null>(null);
  const wallHeight=wallHeightFt*304.8, foundationHeight=foundationDepthFt*304.8, pillarSpacing=pillarSpacingFt*304.8, stiltHeight=stiltHeightFt*304.8;
  const levels = floorPlans.length ? floorPlans : [{ id:"floor-1",name:"Floor 1",rooms,openings }];
  const modelLevels=[{...groundLevel,zBase:0,wallHeight:stiltHeightFt*304.8},...levels.map((level,index)=>({...level,zBase:stiltHeightFt*304.8+index*wallHeightFt*304.8,wallHeight:wallHeightFt*304.8}))];
  const allRooms = modelLevels.flatMap(level=>level.rooms);
  const plan = allRooms.length ? allRooms : [{ id: "building", name: "Building", ...building }];

  const model = useMemo(() => {
    const minX=Math.min(...plan.map(r=>r.x)), minY=Math.min(...plan.map(r=>r.y));
    const maxX=Math.max(...plan.map(r=>r.x+r.width)), maxY=Math.max(...plan.map(r=>r.y+r.height));
    const cos=Math.cos(angle*Math.PI/180), sin=Math.sin(angle*Math.PI/180), pitch=Math.sin(elevation*Math.PI/180), vertical=Math.cos(elevation*Math.PI/180);
    const project=({x,y,z}:Point3):Point2=>({x:x*cos-y*sin,y:(x*sin+y*cos)*pitch-z*vertical});
    const raw:Face[]=[];
    const face=(key:string,corners:Point3[],fill:string,stroke:string,opacity=1,pillarId?:string)=>{
      const points=corners.map(project);
      raw.push({key,points,fill,stroke,opacity,pillarId,order:points.reduce((s,p)=>s+p.y,0)/points.length});
    };
    const fullWidth=maxX-minX,fullHeight=maxY-minY;
    let allPillarPoints:PillarPoint[];
    if(pillarLayout==="eight"){
      const turn=((Math.round(compassRotation/90)%4)+4)%4;
      const normalized:[string,number,number][]=[["east-north",1,0],["east-middle",1,.5],["east-south",1,1],["west-north",0,0],["west-middle",0,.5],["west-south",0,1],["north-center",.5,0],["inner-center",.5,.5]];
      allPillarPoints=normalized.map(([id,u,v])=>{
        let rotated:[number,number]=[u,v];
        if(turn===1)rotated=[1-v,u];
        else if(turn===2)rotated=[1-u,1-v];
        else if(turn===3)rotated=[v,1-u];
        return {id,x:minX+rotated[0]*fullWidth,y:minY+rotated[1]*fullHeight};
      });
    } else {
      const xs:number[]=[];for(let x=minX;x<maxX;x+=pillarSpacing)xs.push(x);xs.push(maxX);
      const ys:number[]=[];for(let y=minY;y<maxY;y+=pillarSpacing)ys.push(y);ys.push(maxY);
      allPillarPoints=xs.flatMap((x,xi)=>ys.map((y,yi)=>({id:`grid-${xi}-${yi}`,x,y})));
    }
    const removedPoints=allPillarPoints.filter(point=>removedPillarIds.includes(point.id));
    const missingCenter=removedPoints.reduce((sum,point)=>({x:sum.x+point.x/Math.max(1,removedPoints.length),y:sum.y+point.y/Math.max(1,removedPoints.length)}),{x:(minX+maxX)/2,y:(minY+maxY)/2});
    let leanX=missingCenter.x-(minX+maxX)/2,leanY=missingCenter.y-(minY+maxY)/2;
    if(Math.hypot(leanX,leanY)<1){leanX=0;leanY=-1;}
    const leanLength=Math.hypot(leanX,leanY),leanDegrees=Math.min(12,removedPoints.length*2.5),leanPerMm=Math.tan(leanDegrees*Math.PI/180);
    leanX=leanX/leanLength*leanPerMm;leanY=leanY/leanLength*leanPerMm;
    const p=(x:number,y:number,z:number):Point3=>({x:x-minX+Math.max(0,z)*leanX,y:y-minY+Math.max(0,z)*leanY,z});

    // The site surface uses the actual editable plot corners, so its size and shape
    // stay in the same millimetre coordinate system as the 2D plan.
    const lotPoints=plot.corners.map(corner=>p(corner.x,corner.y,-foundationHeight));
    raw.push({key:"site-lot",points:lotPoints.map(project),fill:"#b8c9b2",stroke:"#47634d",opacity:.88,order:-Infinity});
    for(let index=0;index<plot.corners.length;index++){
      const a=plot.corners[index],b=plot.corners[(index+1)%plot.corners.length];
      face(`site-edge-${index}`,[p(a.x,a.y,-foundationHeight),p(b.x,b.y,-foundationHeight),p(b.x,b.y,-foundationHeight-180),p(a.x,a.y,-foundationHeight-180)],"#778779","#526357");
    }

    // Thick foundation plinth with a light concrete top.
    face("foundation-top",[p(minX,minY,0),p(maxX,minY,0),p(maxX,maxY,0),p(minX,maxY,0)],"#c8cdd2","#75808b");
    face("foundation-front",[p(minX,minY,-foundationHeight),p(maxX,minY,-foundationHeight),p(maxX,minY,0),p(minX,minY,0)],"#858f99","#59636e");
    face("foundation-side",[p(maxX,minY,-foundationHeight),p(maxX,maxY,-foundationHeight),p(maxX,maxY,0),p(maxX,minY,0)],"#707b86","#59636e");

    // Pillars support the raised house above the clear, open stilt parking level.
    const pillarPoints=allPillarPoints.filter(point=>!removedPillarIds.includes(point.id));
    pillarPoints.forEach(({id,x,y})=>{
      const w=pillarLayout==="eight"?220:Math.min(220,pillarSpacing*.1),xx=Math.min(x,maxX-w),yy=Math.min(y,maxY-w),z0=0,z1=stiltHeight+floorCount*wallHeight;
      const a=p(xx,yy,z0),b=p(xx+w,yy,z0),c=p(xx+w,yy+w,z0);
      const at=p(xx,yy,z1),bt=p(xx+w,yy,z1),ct=p(xx+w,yy+w,z1),dt=p(xx,yy+w,z1);
      face(`pillar-${id}-a`,[a,b,bt,at],selectedPillarId===id?"#f0b84b":"#d5bd97",selectedPillarId===id?"#a35408":"#806e50",1,id);
      face(`pillar-${id}-b`,[b,c,ct,bt],selectedPillarId===id?"#d69632":"#b99f78",selectedPillarId===id?"#a35408":"#806e50",1,id);
      face(`pillar-${id}-top`,[at,bt,ct,dt],selectedPillarId===id?"#ffdf91":"#eadcc4",selectedPillarId===id?"#a35408":"#806e50",1,id);
    });

    // Each level keeps its own room plan. A shared stair room is stored on every level.
    modelLevels.forEach((floor,level)=>{
      const levelBase=floor.zBase,levelWallHeight=floor.wallHeight;
      floor.rooms.forEach((room,index)=>{
        face(`floor-${level}-${room.id}`,[p(room.x,room.y,levelBase),p(room.x+room.width,room.y,levelBase),p(room.x+room.width,room.y+room.height,levelBase),p(room.x,room.y+room.height,levelBase)],FLOOR_COLORS[index%FLOOR_COLORS.length],"#9a8874",.98);
      });
      floor.rooms.forEach(room=>{
      const roomOpenings=floor.openings.filter(item=>item.roomId===room.id);
      const wall=(key:string,side:"top"|"right"|"bottom"|"left",length:number,pointAt:(along:number,z:number)=>Point3)=>{
        const holes=roomOpenings.filter(item=>item.side===side).map(item=>({start:Math.max(0,item.offset),end:Math.min(length,item.offset+item.width),base:item.type==="door"?levelBase:levelBase+levelWallHeight*.42,top:item.type==="door"?levelBase+Math.min(2100,levelWallHeight*.82):levelBase+levelWallHeight*.7})).filter(item=>item.end>item.start).sort((a,b)=>a.start-b.start);
        let cursor=0;
        const panel=(from:number,to:number,z0:number,z1:number,part:string)=>{
          if(to<=from||z1<=z0)return;
          face(`${key}-${part}`,[pointAt(from,z0),pointAt(to,z0),pointAt(to,z1),pointAt(from,z1)],room.kind==="stairs" ? "#d8c6a8" : "#e9e5de","#8d8c86",room.kind==="stairs" ? .42 : .96);
        };
        holes.forEach((hole,index)=>{panel(cursor,hole.start,levelBase,levelBase+levelWallHeight,`span-${index}`);panel(hole.start,hole.end,hole.top,levelBase+levelWallHeight,`lintel-${index}`);if(hole.base>levelBase)panel(hole.start,hole.end,levelBase,hole.base,`sill-${index}`);cursor=Math.max(cursor,hole.end);});
        panel(cursor,length,levelBase,levelBase+levelWallHeight,"end");
      };
      wall(`wall-${level}-${room.id}-top`,"top",room.width,(along,z)=>p(room.x+along,room.y,z));
      wall(`wall-${level}-${room.id}-right`,"right",room.height,(along,z)=>p(room.x+room.width,room.y+along,z));
      wall(`wall-${level}-${room.id}-bottom`,"bottom",room.width,(along,z)=>p(room.x+along,room.y+room.height,z));
      wall(`wall-${level}-${room.id}-left`,"left",room.height,(along,z)=>p(room.x,room.y+along,z));
      if(room.kind==="stairs"){
        const lower=levelBase,upper=levelBase+levelWallHeight,half=room.width/2,steps=8,run=room.height/2;
        for(let flight=0;flight<2;flight++)for(let step=0;step<steps;step++){
          const y0=flight===0?room.y+step*run/steps:room.y+room.height-step*run/steps;
          const y1=flight===0?room.y+(step+1)*run/steps:room.y+room.height-(step+1)*run/steps;
          const z=lower+(upper-lower)*(flight*steps+step+1)/(steps*2);
          const x0=room.x+flight*half+100,x1=room.x+(flight+1)*half-100;
          face(`stair-tread-${level}-${room.id}-${flight}-${step}`,[p(x0,y0,z),p(x1,y0,z),p(x1,y1,z),p(x0,y1,z)],"#c4b59e","#806f5a",.98);
        }
        face(`stair-landing-${level}-${room.id}`,[p(room.x,room.y+run,lower+(upper-lower)/2),p(room.x+room.width,room.y+run,lower+(upper-lower)/2),p(room.x+room.width,room.y+run+450,lower+(upper-lower)/2),p(room.x,room.y+run+450,lower+(upper-lower)/2)],"#d8cbb7","#806f5a",.98);
      }
      });
    });

    if(showRoof){
      const ridgeY=(minY+maxY)/2,eave=stiltHeight+floorCount*wallHeight,ridge=eave+Math.max(900,(maxY-minY)*.12);
      face("roof-front",[p(minX,minY,eave),p(maxX,minY,eave),p(maxX,ridgeY,ridge),p(minX,ridgeY,ridge)],"#9d5544","#63382e");
      face("roof-back",[p(minX,ridgeY,ridge),p(maxX,ridgeY,ridge),p(maxX,maxY,eave),p(minX,maxY,eave)],"#814638","#63382e");
      face("roof-left",[p(minX,minY,eave),p(minX,ridgeY,ridge),p(minX,maxY,eave)],"#aa6652","#63382e");
      face("roof-right",[p(maxX,minY,eave),p(maxX,ridgeY,ridge),p(maxX,maxY,eave)],"#754033","#63382e");
    }

    // Openings sit on their wall planes and remain visible in cutaway mode.
    modelLevels.forEach((floor,level)=>floor.rooms.forEach(room=>floor.openings.filter(item=>item.roomId===room.id).forEach(opening=>{
      const levelBase=floor.zBase,levelWallHeight=floor.wallHeight;
      const {side,offset:o,width:w,type}=opening,z0=type==="door"?levelBase:levelBase+levelWallHeight*.42,z1=type==="door"?levelBase+Math.min(2100,levelWallHeight*.82):levelBase+levelWallHeight*.7;
      let points:Point3[];
      if(side==="top")points=[p(room.x+o,room.y,z0),p(room.x+o+w,room.y,z0),p(room.x+o+w,room.y,z1),p(room.x+o,room.y,z1)];
      else if(side==="bottom")points=[p(room.x+o,room.y+room.height,z0),p(room.x+o+w,room.y+room.height,z0),p(room.x+o+w,room.y+room.height,z1),p(room.x+o,room.y+room.height,z1)];
      else if(side==="left")points=[p(room.x,room.y+o,z0),p(room.x,room.y+o+w,z0),p(room.x,room.y+o+w,z1),p(room.x,room.y+o,z1)];
      else points=[p(room.x+room.width,room.y+o,z0),p(room.x+room.width,room.y+o+w,z0),p(room.x+room.width,room.y+o+w,z1),p(room.x+room.width,room.y+o,z1)];
      const projected=points.map(project);
      raw.push({key:`opening-${level}-${opening.id}`,points:projected,fill:type==="door"?"#8a6244":"#77c6df",stroke:type==="door"?"#62452e":"#267a95",order:projected.reduce((sum,q)=>sum+q.y,0)/projected.length+.02});
    })));
    const stiltLabel=project(p((minX+maxX)/2,(minY+maxY)/2,stiltHeight*.48));
    // Roof and opening overlays should be drawn after structural faces.
    raw.sort((a,b)=>{
      const layer=(key:string)=>key==="site-lot"?0:key.startsWith("site-edge-")?1:key.startsWith("foundation-")||key==="foundation-top"?2:key.startsWith("roof-")?4:key.startsWith("opening-")?5:3;
      return layer(a.key)-layer(b.key)||a.order-b.order;
    });
    const coords=raw.flatMap(f=>f.points),minSX=Math.min(...coords.map(q=>q.x)),maxSX=Math.max(...coords.map(q=>q.x)),minSY=Math.min(...coords.map(q=>q.y)),maxSY=Math.max(...coords.map(q=>q.y));
    const scale=Math.min(820/Math.max(1,maxSX-minSX),500/Math.max(1,maxSY-minSY));
    const faces=raw.map(f=>({...f,points:f.points.map(q=>({x:480+(q.x-(minSX+maxSX)/2)*scale,y:310+(q.y-(minSY+maxSY)/2)*scale}))}));
    const setbackLine=offsetPolygonInward(plot.corners,setbackMm).map(point=>{const q=project(p(point.x,point.y,-foundationHeight+40));return {x:480+(q.x-(minSX+maxSX)/2)*scale,y:310+(q.y-(minSY+maxSY)/2)*scale};});
    const labels=modelLevels.flatMap((floor,level)=>floor.rooms.map((room,index)=>{const q=project(p(room.x+room.width/2,room.y+room.height/2,floor.zBase+8));return{id:`${floor.id}-${room.id}`,name:`${floor.name} · ${room.name}`,color:index%FLOOR_COLORS.length,x:480+(q.x-(minSX+maxSX)/2)*scale,y:310+(q.y-(minSY+maxSY)/2)*scale};}));
    const siteCenter=project(p((Math.min(...plot.corners.map(c=>c.x))+Math.max(...plot.corners.map(c=>c.x)))/2,(Math.min(...plot.corners.map(c=>c.y))+Math.max(...plot.corners.map(c=>c.y)))/2,-foundationHeight));
    const edgeLabels=plot.corners.map((corner,index)=>{
      const next=plot.corners[(index+1)%plot.corners.length],midX=(corner.x+next.x)/2,midY=(corner.y+next.y)/2;
      const projected=project(p(midX,midY,-foundationHeight+120));
      const dx=next.x-corner.x,dy=next.y-corner.y;
      const northRadians=compassRotation*Math.PI/180;
      const centerX=plot.corners.reduce((sum,item)=>sum+item.x,0)/plot.corners.length;
      const centerY=plot.corners.reduce((sum,item)=>sum+item.y,0)/plot.corners.length;
      const offsetX=midX-centerX,offsetY=midY-centerY;
      const east=offsetX*Math.cos(northRadians)+offsetY*Math.sin(northRadians);
      const north=offsetX*Math.sin(northRadians)-offsetY*Math.cos(northRadians);
      const bearing=(Math.atan2(east,north)*180/Math.PI+360)%360;
      const directions=["N","NE","E","SE","S","SW","W","NW"];
      const direction=directions[Math.round(bearing/45)%8];
      return {id:index,x:480+(projected.x-(minSX+maxSX)/2)*scale,y:310+(projected.y-(minSY+maxSY)/2)*scale,text:`${direction} · ${format(Math.hypot(dx,dy))}`};
    });
    return {faces,labels,edgeLabels,setbackLine,stiltLabel:{x:480+(stiltLabel.x-(minSX+maxSX)/2)*scale,y:310+(stiltLabel.y-(minSY+maxSY)/2)*scale},siteLabel:{x:480+(siteCenter.x-(minSX+maxSX)/2)*scale,y:310+(siteCenter.y-(minSY+maxSY)/2)*scale},hasRooms:allRooms.length>0,pillarCount:pillarPoints.length,totalPillars:allPillarPoints.length,removedCount:removedPoints.length,leanDegrees};
  },[angle,compassRotation,elevation,format,floorCount,foundationHeight,modelLevels,pillarLayout,pillarSpacing,plan,plot.corners,allRooms,removedPillarIds,selectedPillarId,showRoof,stiltHeight,wallHeight,setbackMm]);

  const onDragStart=(event:React.PointerEvent<SVGSVGElement>)=>{
    if(event.button!==0)return;
    dragRef.current={pointerId:event.pointerId,x:event.clientX,y:event.clientY};
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onDragMove=(event:React.PointerEvent<SVGSVGElement>)=>{
    const drag=dragRef.current;if(!drag||drag.pointerId!==event.pointerId)return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;drag.x=event.clientX;drag.y=event.clientY;
    setAngle(current=>((current+dx*.8)%360+360)%360);setElevation(current=>Math.max(12,Math.min(68,current-dy*.35)));
  };
  const onDragEnd=()=>{dragRef.current=null;};
  const removeSelectedPillar=()=>{
    if(!selectedPillarId)return;
    setRemovedPillarIds(current=>current.includes(selectedPillarId)?current:[...current,selectedPillarId]);
    setSelectedPillarId(null);
  };
  const restoreLastPillar=()=>setRemovedPillarIds(current=>current.slice(0,-1));
  useEffect(()=>{
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key!=="Delete"&&event.key!=="Backspace")return;
      const target=event.target as HTMLElement|null;
      if(target?.closest("input,select,textarea,[contenteditable=true]"))return;
      if(selectedPillarId){event.preventDefault();setRemovedPillarIds(current=>current.includes(selectedPillarId)?current:[...current,selectedPillarId]);setSelectedPillarId(null);}
    };
    window.addEventListener("keydown",onKeyDown);
    return ()=>window.removeEventListener("keydown",onKeyDown);
  },[selectedPillarId]);

  return <div className="flex h-full min-h-0 flex-col bg-[#eef1f4]">
    <div className="z-10 flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="min-w-40"><h1 className="text-sm font-semibold tracking-tight text-slate-900">3D Site & House</h1><p className="text-[11px] text-slate-500">The lot outline and house use the same scale as your 2D plan.</p></div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
        <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-slate-700">Ground: stilt parking · {floorCount} {floorCount===1?"floor":"floors"} above</span>
        <label className="flex items-center gap-2 text-slate-600">Wall height <input aria-label="Wall height in feet" type="number" min="7" max="20" step="0.5" value={wallHeightFt} onChange={e=>setWallHeightFt(Number(e.target.value)||10)} className="w-[4.5rem] rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-slate-800"/> ft</label>
        <label className="flex items-center gap-2 text-slate-600">Stilt height <input aria-label="Open stilt height in feet" type="number" min="6" max="20" step="0.5" value={stiltHeightFt} onChange={e=>setStiltHeightFt(Number(e.target.value)||10)} className="w-14 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-slate-800"/> ft</label>
        <label className="flex items-center gap-2 text-slate-600">Foundation depth <input aria-label="Foundation depth in feet" type="number" min="0.5" max="6" step="0.25" value={foundationDepthFt} onChange={e=>setFoundationDepthFt(Number(e.target.value)||1.5)} className="w-14 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-slate-800"/> ft</label>
        <label className="flex items-center gap-2 text-slate-600">Pillars <select aria-label="Pillar arrangement" value={pillarLayout} onChange={e=>setPillarLayout(e.target.value as "eight"|"grid")} className="max-w-52 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-slate-800"><option value="eight">8-column layout</option><option value="grid">Automatic grid</option></select></label>
        {pillarLayout==="eight"&&<span className="text-[10px] text-slate-500">3 east · 3 west · north center · inner center</span>}
        {selectedPillarId&&<span className="rounded bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-900">Selected: {selectedPillarId.replaceAll("-"," ")}</span>}
        {pillarLayout==="grid"&&<label className="flex items-center gap-2 text-slate-600">Grid spacing <input aria-label="Pillar spacing in feet" type="number" min="6" max="30" step="1" value={pillarSpacingFt} onChange={e=>setPillarSpacingFt(Number(e.target.value)||12)} className="w-14 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-slate-800"/> ft</label>}
        <button type="button" onClick={removeSelectedPillar} disabled={!selectedPillarId} className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40">Remove selected pillar</button>
        <button type="button" onClick={restoreLastPillar} disabled={!removedPillarIds.length} className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Restore last</button>
        <button type="button" aria-pressed={showRoof} onClick={()=>setShowRoof(v=>!v)} className={`rounded-md border px-3 py-1.5 font-medium transition ${showRoof?"border-amber-300 bg-amber-50 text-amber-900":"border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{showRoof?"Hide roof · cutaway":"Show roof"}</button>
      </div>
    </div>
    <div className="relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(ellipse_at_48%_42%,_#ffffff_0%,_#edf2f6_58%,_#dfe6ec_100%)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/35 to-transparent" />
      <svg viewBox="0 0 960 620" className="h-full w-full touch-none select-none" role="img" aria-label="Interactive isometric house model; drag to rotate 360 degrees and adjust elevation" onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd} onLostPointerCapture={onDragEnd} style={{cursor:dragRef.current?"grabbing":"grab"}}>
        <defs><filter id="model-shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="15" stdDeviation="12" floodColor="#334155" floodOpacity=".15"/></filter><linearGradient id="plinth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d8dde1"/><stop offset="1" stopColor="#aab2ba"/></linearGradient></defs>
        <style>{`@keyframes house-arrive{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}`}</style>
        <ellipse cx="480" cy="553" rx="340" ry="34" fill="#64748b" opacity=".12" />
        <g filter="url(#model-shadow)" style={{animation:"house-arrive 800ms cubic-bezier(.2,.75,.25,1) both"}}>{model.faces.map(face=><polygon key={face.key} points={face.points.map(p=>`${p.x},${p.y}`).join(" ")} fill={face.key==="foundation-top"?"url(#plinth)":face.fill} fillOpacity={face.opacity} stroke={face.stroke} strokeWidth={face.pillarId===selectedPillarId?2.2:1.25} strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={face.pillarId?{cursor:"pointer"}:undefined} onPointerDown={face.pillarId?event=>event.stopPropagation():undefined} onClick={face.pillarId?event=>{event.stopPropagation();setSelectedPillarId(face.pillarId!);}:undefined}><title>{face.pillarId?`Pillar ${face.pillarId.replaceAll("-"," ")} — click to select`:""}</title></polygon>)}</g>
        {setbackMm>0&&<polyline points={[...model.setbackLine,model.setbackLine[0]].map(point=>`${point.x},${point.y}`).join(" ")} fill="none" stroke="#0f766e" strokeWidth="2.5" strokeDasharray="7 5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" pointerEvents="none"><title>Setback · {format(setbackMm)} inside the plot boundary</title></polyline>}
        {!showRoof&&model.labels.map(label=><text key={label.id} x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle" fill="#39454e" fontSize="11" fontWeight="600" paintOrder="stroke" stroke="#fff" strokeWidth="3" strokeOpacity=".72" pointerEvents="none">{label.name.length>18?`${label.name.slice(0,17)}…`:label.name}</text>)}
        {model.edgeLabels.map(label=><g key={`dimension-${label.id}`} pointerEvents="none"><rect x={label.x-39} y={label.y-10} width="78" height="20" rx="7" fill="#fff" fillOpacity=".94" stroke="#52715a" strokeWidth="1"/><text x={label.x} y={label.y+3.5} textAnchor="middle" fill="#294632" fontSize="10" fontWeight="700">{label.text}</text></g>)}
        <text x={model.siteLabel.x} y={model.siteLabel.y+15} textAnchor="middle" dominantBaseline="middle" fill="#36523b" fontSize="11" fontWeight="700" letterSpacing="1.2" paintOrder="stroke" stroke="#e7efe4" strokeWidth="4" strokeOpacity=".85" pointerEvents="none">PLOT BOUNDARY</text>
        <text x={model.stiltLabel.x} y={model.stiltLabel.y} textAnchor="middle" dominantBaseline="middle" fill="#655235" fontSize="12" fontWeight="700" letterSpacing="1" paintOrder="stroke" stroke="#fff" strokeWidth="4" strokeOpacity=".75" pointerEvents="none">OPEN STILT · PARKING</text>
      </svg>
      <div className="absolute left-4 top-4 flex items-center gap-2 rounded-xl border border-white/80 bg-white/75 px-3 py-2 text-[11px] text-slate-600 shadow-sm backdrop-blur-md"><span className="grid size-6 place-items-center rounded-full bg-blue-50 text-blue-700">↻</span><span><b className="font-semibold text-slate-800">Drag to orbit</b><br/>horizontal: 360° · vertical: tilt</span></div>
      <div className="absolute right-4 top-4 flex items-center gap-3 rounded-xl border border-white/80 bg-white/85 px-3 py-2 shadow-sm backdrop-blur-md" aria-label={`North direction ${compassRotation} degrees clockwise from plan up`}>
        <svg viewBox="0 0 56 56" className="size-12" role="img" aria-label="North compass">
          <circle cx="28" cy="28" r="23" fill="#f8fafc" stroke="#cbd5e1"/>
          <text x="28" y="10" textAnchor="middle" fontSize="8" fontWeight="700" fill="#334155">N</text>
          <text x="47" y="31" textAnchor="middle" fontSize="7" fill="#64748b">E</text>
          <text x="28" y="52" textAnchor="middle" fontSize="7" fill="#64748b">S</text>
          <text x="9" y="31" textAnchor="middle" fontSize="7" fill="#64748b">W</text>
          <g transform={`rotate(${compassRotation+angle} 28 28)`}><path d="M28 14 L34 30 L28 27 L22 30 Z" fill="#dc2626"/><path d="M28 42 L22 26 L28 29 L34 26 Z" fill="#94a3b8"/></g>
          <circle cx="28" cy="28" r="2" fill="#334155"/>
        </svg>
        <div className="text-[10px] leading-tight text-slate-600"><b className="block text-xs text-slate-800">North reference</b><span>Plan: {compassRotation}° · Orbit: {angle.toFixed(0)}°</span></div>
      </div>
      <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/85 px-3 py-1.5 text-[10px] font-medium text-slate-700 shadow-sm backdrop-blur"><i className="size-2.5 rounded-sm border border-emerald-800 bg-[#b8c9b2]"/>Plot</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/85 px-3 py-1.5 text-[10px] font-medium text-slate-700 shadow-sm backdrop-blur"><i className="size-2.5 rounded-sm border border-amber-800 bg-[#c8cdd2]"/>House footprint</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/85 px-3 py-1.5 text-[10px] font-medium text-slate-700 shadow-sm backdrop-blur"><i className="size-2.5 rounded-sm border border-stone-500 bg-[#e9d9bd]"/>Room layout</span>
        <span className="rounded-full border border-white/80 bg-white/80 px-3 py-1.5 text-[10px] font-medium text-slate-600 shadow-sm backdrop-blur">Stilt + {floorCount} {floorCount===1?"floor":"floors"}</span>
        <span className="rounded-full border border-white/80 bg-white/80 px-3 py-1.5 text-[10px] font-medium text-slate-600 shadow-sm backdrop-blur">{model.hasRooms?`${allRooms.length} spaces`:"Building footprint"}</span>
        <span className="rounded-full border border-white/80 bg-white/80 px-3 py-1.5 text-[10px] font-medium text-slate-600 shadow-sm backdrop-blur">{model.pillarCount}/{model.totalPillars} pillars · {pillarLayout==="eight"?"fixed layout":"grid"}</span>
        <span className="rounded-full border border-white/80 bg-white/80 px-3 py-1.5 text-[10px] font-medium text-slate-600 shadow-sm backdrop-blur">{levels.reduce((sum,floor)=>sum+floor.openings.length,0)} openings</span>
        <span className="rounded-full border border-white/80 bg-white/80 px-3 py-1.5 text-[10px] font-medium text-slate-600 shadow-sm backdrop-blur">{angle.toFixed(0)}° orbit</span>
      </div>
      {model.removedCount>0&&<div role="status" className="absolute left-1/2 top-4 max-w-[min(34rem,calc(100%-2rem))] -translate-x-1/2 rounded-xl border border-amber-300 bg-amber-50/95 px-4 py-2 text-center text-[11px] font-medium text-amber-950 shadow-md backdrop-blur">Support removed · conceptual lean preview: {model.leanDegrees.toFixed(1)}° toward the missing supports. This visual is not a structural analysis.</div>}
      <div className="absolute bottom-4 right-4 max-w-64 rounded-lg border border-slate-200/70 bg-white/70 px-3 py-2 text-right text-[10px] leading-relaxed text-slate-500 backdrop-blur">Concept visualization. Structural member sizing and engineering calculations are not included.</div>
      {!model.hasRooms&&<div className="absolute left-1/2 top-24 -translate-x-1/2 rounded-lg border border-blue-100 bg-white/85 px-4 py-2 text-center text-xs text-slate-600 shadow-sm backdrop-blur">Add rooms in 2D Plan to create interior floors, partitions, doors, and windows.</div>}
    </div>
  </div>;
}
