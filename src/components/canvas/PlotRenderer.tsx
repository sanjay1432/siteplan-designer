import type { PlotCorner, PlotEdge } from "../../types/plot";
import type { Viewport } from "../../geometry/viewport";
import type { PlotEdgeName } from "../../types/plot";
import { midpoint } from "../../geometry/plot";
import { useUnits } from "../../geometry/units/UnitContext";
import { usePlot } from "../../geometry/plot/PlotContext";
import { rectangularSetback } from "../../geometry/plot/setback";
import { getRoomWallInset, getRoomWallSegments } from "../../geometry/plot/model";
import type { PlanObject, PlanOpening, Room, SiteFeature, SiteFeatureKind, WallSide } from "../../geometry/plot/model";

interface PlotRendererProps {
  viewport: Viewport;
  onCornerPointerDown: (
    cornerId: string,
    event: React.PointerEvent<SVGCircleElement>,
  ) => void;
  rooms: Room[];
  openings: PlanOpening[];
  planObjects:PlanObject[];
  siteFeatures:SiteFeature[];
  selectedSiteFeatureId:string|null;
  onSiteFeaturePointerDown:(id:string,event:React.PointerEvent<SVGGElement>)=>void;
  onOpeningPointerDown: (id:string,event:React.PointerEvent<SVGGElement>)=>void;
  onPlanObjectPointerDown:(id:string,event:React.PointerEvent<SVGGElement>)=>void;
  onRoomPointerDown: (id: string, event: React.PointerEvent<SVGRectElement>) => void;
  onRoomLabelPointerDown:(id:string,event:React.PointerEvent<SVGGElement>)=>void;
  onRoomResizePointerDown: (id: string, corner: number, event: React.PointerEvent<SVGCircleElement>) => void;
  onRoomEdgeSelect:(id:string,edge:number,event:React.PointerEvent<SVGLineElement>)=>void;
  onSetbackPointerDown:(corner:number,event:React.PointerEvent<SVGGElement>)=>void;
  selectedRoomId: string | null;
}

/**
 * Renders the plot polygon in SVG world-space (millimetres).
 * The parent <g> has the viewport transform applied, so all
 * coordinates here are canonical world-space millimetres.
 */
export function PlotRenderer({ viewport, onCornerPointerDown, rooms, openings, planObjects, siteFeatures, selectedSiteFeatureId, onSiteFeaturePointerDown, onOpeningPointerDown, onPlanObjectPointerDown, onRoomPointerDown, onRoomLabelPointerDown, onRoomResizePointerDown, onRoomEdgeSelect, onSetbackPointerDown, selectedRoomId }: PlotRendererProps) {
  const { plot, setbackDistances, selectedEdgeId, selectedCornerId, selectedPropertyCardId, selectEdge, selectCorner } =
    usePlot();
  const { format, unitSystem } = useUnits();

  const corners = plot.corners;
  const edges = plot.edges;
  const plotCenter = corners.reduce(
    (center, corner) => ({ x: center.x + corner.x / corners.length, y: center.y + corner.y / corners.length }),
    { x: 0, y: 0 },
  );

  if (corners.length < 3) return null;

  // Build SVG polygon points string from world-space corners
  const polygonPoints = corners
    .map((c) => `${c.x},${c.y}`)
    .join(" ");
  const insetCorners=rectangularSetback(corners,setbackDistances);
  const setbackPoints=insetCorners.map(point=>`${point.x},${point.y}`).join(" ");
  const signedArea=corners.reduce((sum,point,index)=>{const next=corners[(index+1)%corners.length];return sum+(point.x-corners[0].x)*(next.y-corners[0].y)-(next.x-corners[0].x)*(point.y-corners[0].y);},0)/2;

  // Inverse-scale helpers to keep labels/markers constant screen size
  const invZ = 1 / viewport.zoom;

  // Corner dot radius in screen pixels → divide by zoom for world size
  const cornerRadius = 5 * invZ;
  const cornerHitRadius = 10 * invZ;

  // Label font size in screen pixels
  const labelFontSize = 12 * invZ;
  const smallFontSize = 10 * invZ;
  const simpleDimension = (mm:number) => format(mm, {
    format: unitSystem === "metric" ? "meters" : "decimal_feet",
    decimals: 1,
  });
  const wallDimension=(mm:number)=>unitSystem==="metric"?`${format(mm,{format:"millimetres",decimals:0})} wall`:`${(mm/25.4).toFixed(1)} in`;
  const fitRoomLabel=(text:string,width:number,height:number,maxFontPx:number)=>{
    const usableWidth=Math.max(1,width*viewport.zoom-8),usableHeight=Math.max(1,height*viewport.zoom-8),estimatedTextWidth=Math.max(1,text.length)*.62;
    const horizontalSize=usableWidth/estimatedTextWidth,verticalSize=usableHeight/estimatedTextWidth,vertical=verticalSize>horizontalSize;
    return {fontSize:Math.min(maxFontPx,vertical?verticalSize:horizontalSize)*invZ,angle:vertical?90:0};
  };

  // Stroke widths
  const plotStroke = 2 * invZ;
  const selectedStroke = 3 * invZ;
  const dimLineOffset = 28 * invZ; // how far the dimension label sits off the edge

  function getEdgeCorners(edge: PlotEdge): [PlotCorner, PlotCorner] {
    const start = corners.find((c) => c.id === edge.startCornerId)!;
    const end = corners.find((c) => c.id === edge.endCornerId)!;
    return [start, end];
  }

  /**
   * Returns a point offset perpendicular to a segment (start→end),
   * shifted outward from the polygon centre by `distance`.
   */
  function perpendicularOffset(
    start: PlotCorner,
    end: PlotCorner,
    dist: number,
    outward: boolean,
  ) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return { nx: 0, ny: 0 };
    // Perpendicular unit vector (rotated 90° CW in screen space)
    const nx = (outward ? dy : -dy) / len;
    const ny = (outward ? -dx : dx) / len;
    return { nx: nx * dist, ny: ny * dist };
  }

  return (
    <g>
      {/* ── Fill ── */}
      <polygon
        points={polygonPoints}
        fill="rgba(59, 130, 246, 0.08)"
        stroke="none"
        pointerEvents="none"
      />
      {Object.values(setbackDistances).some(distance=>distance>0)&&<polygon points={setbackPoints} fill="rgba(20,184,166,.035)" stroke="#0f766e" strokeWidth={2*invZ} strokeDasharray={`${7*invZ} ${5*invZ}`} strokeLinejoin="round" pointerEvents="none"><title>Independent setbacks from each plot edge</title></polygon>}

      {siteFeatures.filter(feature=>feature.visible!==false).map(feature=>{
        const selected=selectedSiteFeatureId===feature.id;
        const palette:Record<SiteFeatureKind,{fill:string;stroke:string}>={
          "building-footprint":{fill:"#cbd5e1",stroke:"#334155"},driveway:{fill:"#e2e8f0",stroke:"#64748b"},parking:{fill:"#f1f5f9",stroke:"#475569"},walkway:{fill:"#fef3c7",stroke:"#b45309"},landscape:{fill:"#bbf7d0",stroke:"#15803d"},lawn:{fill:"#bbf7d0",stroke:"#15803d"},tree:{fill:"#86efac",stroke:"#166534"},utility:{fill:"#bfdbfe",stroke:"#1d4ed8"},easement:{fill:"#e9d5ff",stroke:"#7e22ce"},other:{fill:"#e2e8f0",stroke:"#475569"},
        };
        const color=palette[feature.kind],removed=feature.status==="removed",dash=feature.status==="proposed"?`${6*invZ} ${4*invZ}`:removed?`${2*invZ} ${3*invZ}`:undefined;
        const common={fill:color.fill,stroke:selected?"#2563eb":removed?"#dc2626":color.stroke,strokeWidth:(selected?3:2)*invZ,strokeDasharray:dash,opacity:removed?.62:1};
        return <g key={feature.id} data-site-feature="true" style={{cursor:"grab"}} onPointerDown={event=>onSiteFeaturePointerDown(feature.id,event)} onClick={event=>event.stopPropagation()}>
          {feature.kind==="tree"?<><circle cx={feature.x+feature.width/2} cy={feature.y+feature.height/2} r={Math.min(feature.width,feature.height)*.44} {...common}/><line x1={feature.x+feature.width/2} y1={feature.y+feature.height*.28} x2={feature.x+feature.width/2} y2={feature.y+feature.height*.72} stroke="#166534" strokeWidth={1.5*invZ} pointerEvents="none"/></>
            :feature.kind==="utility"?<><circle cx={feature.x+feature.width/2} cy={feature.y+feature.height/2} r={Math.min(feature.width,feature.height)*.3} {...common}/><text x={feature.x+feature.width/2} y={feature.y+feature.height/2+3*invZ} textAnchor="middle" fontSize={8*invZ} fill="#1e3a8a" pointerEvents="none">U</text></>
            :<rect x={feature.x} y={feature.y} width={feature.width} height={feature.height} rx={feature.kind==="walkway"?4*invZ:0} {...common}/>}
          {feature.kind==="parking"&&Array.from({length:3},(_,index)=><line key={index} x1={feature.x+feature.width*(index+1)/4} x2={feature.x+feature.width*(index+1)/4} y1={feature.y+feature.height*.12} y2={feature.y+feature.height*.88} stroke="#94a3b8" strokeWidth={1*invZ} pointerEvents="none"/>)}
          <text x={feature.x+feature.width/2} y={feature.y+feature.height/2+(feature.kind==="tree"?0:3*invZ)} textAnchor="middle" dominantBaseline="middle" fontSize={9*invZ} fontWeight="600" fill="#334155" pointerEvents="none">{feature.name}</text>
          <title>{feature.name} · {feature.status} · drag to move</title>
        </g>;
      })}

      {/* ── Edge lines ── */}
      {rooms.map((room,index) => {
        const wallSides:[WallSide,WallSide,WallSide,WallSide]=["left","right","top","bottom"];
        const wallSegments=wallSides.flatMap(side=>getRoomWallSegments(room,side,rooms));
        const exteriorWall=Math.max(0,...wallSegments.filter(segment=>!segment.shared).map(segment=>segment.thickness));
        const sharedWall=Math.max(0,...wallSegments.filter(segment=>segment.shared).map(segment=>segment.thickness));
        const insetLeft=getRoomWallInset(room,"left",rooms),insetRight=getRoomWallInset(room,"right",rooms),insetTop=getRoomWallInset(room,"top",rooms),insetBottom=getRoomWallInset(room,"bottom",rooms);
        const clearWidth=Math.max(0,room.width-insetLeft-insetRight),clearHeight=Math.max(0,room.height-insetTop-insetBottom);
        const clearArea=room.points?null:clearWidth*clearHeight/(unitSystem==="metric"?1_000_000:92_903.04);
        const centerX=room.x+room.width/2+(room.labelOffset?.x??0),centerY=room.y+room.height/2+(room.labelOffset?.y??0);
        const vertices=room.points??[{x:room.x,y:room.y},{x:room.x+room.width,y:room.y},{x:room.x+room.width,y:room.y+room.height},{x:room.x,y:room.y+room.height}];
        const outline=vertices.map(p=>`${p.x},${p.y}`).join(" ");
        const area=Math.abs(vertices.reduce((sum,p,i)=>{const n=vertices[(i+1)%vertices.length];return sum+p.x*n.y-n.x*p.y;},0))/2;
        const areaSqFt=(area/92903.04).toFixed(1);
        const dimensions=`${simpleDimension(room.width)} × ${simpleDimension(room.height)}`;
        const clearDimensions=`${room.kind==="lawn"?"Area":"Clear"} ${simpleDimension(clearWidth)} × ${simpleDimension(clearHeight)}${clearArea===null?"":` · ${clearArea.toFixed(unitSystem==="metric"?2:1)} ${unitSystem==="metric"?"m²":"sq ft"}`}`;
        const wallLabel=[exteriorWall?`Ext ${wallDimension(exteriorWall)}`:"",sharedWall?`Shared ${wallDimension(sharedWall)}`:""].filter(Boolean).join(" · ");
        const nameFit=fitRoomLabel(room.name,room.width,room.height,12),dimensionFit=fitRoomLabel(dimensions,room.width,room.height,10),clearFit=fitRoomLabel(clearDimensions,room.width,room.height,8),wallFit=fitRoomLabel(wallLabel,room.width,room.height,8);
        const nameX=centerX+(nameFit.angle? -12*invZ:0),nameY=centerY+(nameFit.angle?0:-12*invZ),dimensionX=centerX+(dimensionFit.angle? -3*invZ:0),dimensionY=centerY+(dimensionFit.angle?0:-3*invZ),clearX=centerX+(clearFit.angle?6*invZ:0),clearY=centerY+(clearFit.angle?0:6*invZ),wallX=centerX+(wallFit.angle?15*invZ:0),wallY=centerY+(wallFit.angle?0:15*invZ);
        return <g key={room.id} data-room="true">
        {room.points?<polygon points={outline}
          fill={room.kind==="stairs"?"rgba(245,158,11,.15)":room.kind==="lawn"?"rgba(34,197,94,.2)":index%2 ? "rgba(14,165,233,.14)" : "rgba(16,185,129,.16)"} stroke={room.kind==="stairs"?"#b45309":room.kind==="lawn"?"#15803d":index%2 ? "#0369a1" : "#047857"} strokeWidth={2*invZ}
          style={{cursor:"move"}} onPointerDown={event=>onRoomPointerDown(room.id,event)} onClick={event=>event.stopPropagation()}><title>{room.name} · {areaSqFt} sq ft · Drag to move</title></polygon>:<rect x={room.x} y={room.y} width={room.width} height={room.height} fill={room.kind==="stairs"?"rgba(245,158,11,.15)":room.kind==="lawn"?"rgba(34,197,94,.2)":index%2 ? "rgba(14,165,233,.14)" : "rgba(16,185,129,.16)"} stroke={room.kind==="stairs"?"#b45309":room.kind==="lawn"?"#15803d":index%2 ? "#0369a1" : "#047857"} strokeWidth={2*invZ} style={{cursor:"move"}} onPointerDown={event=>onRoomPointerDown(room.id,event)} onClick={event=>event.stopPropagation()}><title>{room.name} · {areaSqFt} sq ft · Drag to move</title></rect>}
        {room.kind === "stairs" ? Array.from({length:7},(_,i)=><line key={`step-${i}`} x1={room.x+room.width*.15} x2={room.x+room.width*.85} y1={room.y+room.height*(i+1)/8} y2={room.y+room.height*(i+1)/8} stroke="#b45309" strokeWidth={1*invZ} pointerEvents="none" />) : null}
        <g onPointerDown={event=>onRoomLabelPointerDown(room.id,event)} style={{cursor:"move",touchAction:"none"}}><title>Drag to reposition this room label</title>
        <text x={nameX} y={nameY} transform={nameFit.angle?`rotate(${nameFit.angle} ${nameX} ${nameY})`:undefined} textAnchor="middle" dominantBaseline="middle" fontSize={nameFit.fontSize} fill={room.kind==="stairs"?"#92400e":"#064e3b"} style={{pointerEvents:"all",userSelect:"none"}}>{room.name}</text>
        <text x={dimensionX} y={dimensionY} transform={dimensionFit.angle?`rotate(${dimensionFit.angle} ${dimensionX} ${dimensionY})`:undefined} textAnchor="middle" dominantBaseline="middle" fontSize={dimensionFit.fontSize} fill="#475569" style={{pointerEvents:"all",userSelect:"none"}}>{dimensions}</text>
        {clearWidth>0&&clearHeight>0&&<text x={clearX} y={clearY} transform={clearFit.angle?`rotate(${clearFit.angle} ${clearX} ${clearY})`:undefined} textAnchor="middle" dominantBaseline="middle" fontSize={clearFit.fontSize} fill="#475569" style={{pointerEvents:"all",userSelect:"none"}}>{clearDimensions}</text>}
        {wallLabel&&<text x={wallX} y={wallY} transform={wallFit.angle?`rotate(${wallFit.angle} ${wallX} ${wallY})`:undefined} textAnchor="middle" dominantBaseline="middle" fontSize={wallFit.fontSize} fill="#64748b" style={{pointerEvents:"all",userSelect:"none"}}>{wallLabel}</text>}
        </g>
        {selectedRoomId===room.id&&vertices.map((a,edge)=>{const b=vertices[(edge+1)%vertices.length];return <line key={`edge-hit-${edge}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={14*invZ} style={{cursor:"copy",pointerEvents:"stroke"}} onPointerDown={event=>{event.stopPropagation();onRoomEdgeSelect(room.id,edge,event);}}><title>Select this edge to add a corner</title></line>;})}
        {selectedRoomId===room.id && vertices.map(({x:cx,y:cy},corner)=><circle key={corner} cx={cx} cy={cy} r={7*invZ} fill="white" stroke="#047857" strokeWidth={2*invZ} style={{cursor:"move"}} onPointerDown={event=>onRoomResizePointerDown(room.id,corner,event)} onClick={event=>event.stopPropagation()}><title>Drag to reshape {room.name}. Hold Shift to lock to one axis; nearby edges snap into alignment.</title></circle>)}
      </g>;
      })}
      {(["top","right","bottom","left"] as PlotEdgeName[]).map((edgeName,index)=>{
        if(index>=corners.length||!setbackDistances[edgeName])return null;
        const start=corners[index],end=corners[(index+1)%corners.length],dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy)||1;
        const direction=signedArea>=0?1:-1,nx=-dy/length*direction,ny=dx/length*direction;
        const outerMid={x:(start.x+end.x)/2,y:(start.y+end.y)/2};
        const innerMid={x:outerMid.x+nx*setbackDistances[edgeName],y:outerMid.y+ny*setbackDistances[edgeName]};
        const labelX=(outerMid.x+innerMid.x)/2,labelY=(outerMid.y+innerMid.y)/2;
        let angle=Math.atan2(innerMid.y-outerMid.y,innerMid.x-outerMid.x)*180/Math.PI;
        if(angle>90||angle< -90)angle+=180;
        return <g key={`setback-dimension-${index}`} pointerEvents="none">
          <line x1={outerMid.x} y1={outerMid.y} x2={innerMid.x} y2={innerMid.y} stroke="#0f766e" strokeWidth={1.25*invZ}/>
          <text x={labelX} y={labelY} transform={`rotate(${angle} ${labelX} ${labelY})`} textAnchor="middle" dominantBaseline="middle" fontSize={9*invZ} fontWeight="700" fill="#115e59" paintOrder="stroke" stroke="white" strokeWidth={3*invZ} strokeLinejoin="round">{format(setbackDistances[edgeName])}</text>
        </g>;
      })}
      {openings.map(opening=>{
        const room=rooms.find(item=>item.id===opening.roomId);if(!room)return null;
        const s=opening.side,o=opening.offset,w=opening.width;
        let x1=room.x,y1=room.y,x2=room.x,y2=room.y,leafX=room.x,leafY=room.y,arc="";
        if(s==="top"){x1=room.x+o;y1=room.y;x2=x1+w;y2=y1;leafX=x1;leafY=y1+w;arc=`M ${x1} ${leafY} A ${w} ${w} 0 0 0 ${x2} ${y2}`;}
        if(s==="bottom"){x1=room.x+o;y1=room.y+room.height;x2=x1+w;y2=y1;leafX=x1;leafY=y1-w;arc=`M ${x1} ${leafY} A ${w} ${w} 0 0 1 ${x2} ${y2}`;}
        if(s==="left"){x1=room.x;y1=room.y+o;x2=x1;y2=y1+w;leafX=x1+w;leafY=y1;arc=`M ${leafX} ${leafY} A ${w} ${w} 0 0 0 ${x2} ${y2}`;}
        if(s==="right"){x1=room.x+room.width;y1=room.y+o;x2=x1;y2=y1+w;leafX=x1-w;leafY=y1;arc=`M ${leafX} ${leafY} A ${w} ${w} 0 0 1 ${x2} ${y2}`;}
        return <g key={opening.id} onPointerDown={event=>{event.stopPropagation();onOpeningPointerDown(opening.id,event);}} onClick={event=>{event.stopPropagation();}} style={{cursor:"grab"}}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={18*invZ} style={{pointerEvents:"stroke",cursor:"grab"}} />
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="white" strokeWidth={5*invZ}/>
          {opening.type==="door" ? <><line x1={x1} y1={y1} x2={leafX} y2={leafY} stroke="#7c3aed" strokeWidth={1.5*invZ}/><path d={arc} fill="none" stroke="#8b5cf6" strokeWidth={1*invZ} strokeDasharray={`${3*invZ} ${2*invZ}`}/></> : <><line x1={x1+(s==="left"||s==="right"?3*invZ:0)} y1={y1+(s==="top"||s==="bottom"?3*invZ:0)} x2={x2+(s==="left"||s==="right"?3*invZ:0)} y2={y2+(s==="top"||s==="bottom"?3*invZ:0)} stroke="#0284c7" strokeWidth={2*invZ}/><line x1={x1-(s==="left"||s==="right"?3*invZ:0)} y1={y1-(s==="top"||s==="bottom"?3*invZ:0)} x2={x2-(s==="left"||s==="right"?3*invZ:0)} y2={y2-(s==="top"||s==="bottom"?3*invZ:0)} stroke="#0284c7" strokeWidth={2*invZ}/></>}
          <title>{opening.type} — drag to any room wall; remove it in the room list</title>
        </g>;
      })}
      {planObjects.map(item=><g key={item.id} data-plan-object="true" onPointerDown={event=>{event.stopPropagation();onPlanObjectPointerDown(item.id,event);}} onClick={event=>event.stopPropagation()} style={{cursor:"grab"}}>
        {item.kind==="dining-table"&&<><rect x={item.x} y={item.y} width={item.width} height={item.height} rx={70} fill="#f5e6c8" stroke="#9a6a30" strokeWidth={2*invZ}/><line x1={item.x+item.width*.12} y1={item.y+item.height/2} x2={item.x+item.width*.88} y2={item.y+item.height/2} stroke="#c19a62" strokeWidth={1.5*invZ}/></>}
        {item.kind==="chair"&&<><rect x={item.x+item.width*.16} y={item.y+item.height*.12} width={item.width*.68} height={item.height*.68} rx={35} fill="#dbeafe" stroke="#475569" strokeWidth={2*invZ}/><rect x={item.x+item.width*.25} y={item.y+item.height*.23} width={item.width*.5} height={item.height*.42} fill="#eff6ff" stroke="#64748b" strokeWidth={1.5*invZ}/><line x1={item.x+item.width*.2} y1={item.y+item.height*.84} x2={item.x+item.width*.8} y2={item.y+item.height*.84} stroke="#475569" strokeWidth={2*invZ}/></>}
        {item.kind==="vent-window"&&<><line x1={item.x} y1={item.y+item.height*.25} x2={item.x+item.width} y2={item.y+item.height*.25} stroke="#0284c7" strokeWidth={3*invZ}/><line x1={item.x} y1={item.y+item.height*.75} x2={item.x+item.width} y2={item.y+item.height*.75} stroke="#0284c7" strokeWidth={3*invZ}/><line x1={item.x+item.width*.33} y1={item.y+item.height*.25} x2={item.x+item.width*.33} y2={item.y+item.height*.75} stroke="#38bdf8" strokeWidth={1.5*invZ}/><line x1={item.x+item.width*.67} y1={item.y+item.height*.25} x2={item.x+item.width*.67} y2={item.y+item.height*.75} stroke="#38bdf8" strokeWidth={1.5*invZ}/></>}
        {item.kind==="sofa"&&<><rect x={item.x} y={item.y} width={item.width} height={item.height} rx={100} fill="#dbeafe" stroke="#475569" strokeWidth={2*invZ}/><rect x={item.x+item.width*.12} y={item.y+item.height*.12} width={item.width*.76} height={item.height*.76} rx={70} fill="#eff6ff" stroke="#64748b" strokeWidth={1.5*invZ}/><line x1={item.x+item.width/2} y1={item.y+item.height*.16} x2={item.x+item.width/2} y2={item.y+item.height*.84} stroke="#94a3b8" strokeWidth={1.5*invZ}/></>}
        {item.kind==="text"&&<text x={item.x+item.width/2} y={item.y+item.height/2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(item.height*.55,280)} fontWeight="500" fill="#334155">{item.text}</text>}
        <title>{item.kind==="text"?item.text:item.kind.replaceAll("-"," ")} · drag to move</title>
      </g>)}
      {edges.map((edge) => {
        const [start, end] = getEdgeCorners(edge);
        const isSelected = edge.id === selectedEdgeId;

        return (
          <line
            key={edge.id}
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            stroke={isSelected ? "#2563eb" : "#1e40af"}
            strokeWidth={isSelected ? selectedStroke : plotStroke}
            strokeLinecap="round"
            style={{ cursor: "pointer" }}
            onClick={() => selectEdge(isSelected ? null : edge.id)}
          />
        );
      })}

      {/* ── Invisible hit-test lines (wider, transparent) ── */}
      {edges.map((edge) => {
        const [start, end] = getEdgeCorners(edge);
        return (
          <line
            key={`hit-${edge.id}`}
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            stroke="transparent"
            strokeWidth={12 * invZ}
            style={{ cursor: "pointer" }}
            pointerEvents="none"
            onClick={() =>
              selectEdge(edge.id === selectedEdgeId ? null : edge.id)
            }
          />
        );
      })}

      {/* ── Dimension labels on each edge ── */}
      {edges.map((edge) => {
        const [start, end] = getEdgeCorners(edge);
        const mid = midpoint(start, end);

        // Choose the perpendicular pointing away from the plot center so each
        // edge, including top and bottom, is outlined consistently at any angle.
        const midpointFromCenterX = mid.x - plotCenter.x;
        const midpointFromCenterY = mid.y - plotCenter.y;
        const outward = (end.y - start.y) * midpointFromCenterX -
          (end.x - start.x) * midpointFromCenterY > 0;
        const offset = perpendicularOffset(start, end, dimLineOffset, outward);

        const labelX = mid.x + offset.nx;
        const labelY = mid.y + offset.ny;
        // Keep dimension text parallel to its edge, while flipping the angle
        // where needed so labels remain readable from left to right.
        let angle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
        if (angle > 90) angle -= 180;
        if (angle < -90) angle += 180;

        const isSelected = edge.id === selectedEdgeId;
        const dimensionText = format(edge.actualLengthMm);
        const labelWidth = Math.max(56, dimensionText.length * 7.2 + 12) * invZ;

        return (
          <g key={`label-${edge.id}`}>
            {/* Small tick marks at each end */}
            <line
              x1={start.x}
              y1={start.y}
              x2={start.x + offset.nx * 0.6}
              y2={start.y + offset.ny * 0.6}
              stroke="#60a5fa"
              strokeWidth={1 * invZ}
            />
            <line
              x1={end.x}
              y1={end.y}
              x2={end.x + offset.nx * 0.6}
              y2={end.y + offset.ny * 0.6}
              stroke="#60a5fa"
              strokeWidth={1 * invZ}
            />

            <g transform={`rotate(${angle} ${labelX} ${labelY})`}>
            {/* Dimension text background */}
            <rect
              x={labelX - labelWidth / 2}
              y={labelY - labelFontSize * 0.8}
              width={labelWidth}
              height={labelFontSize * 1.6}
              rx={3 * invZ}
              fill={isSelected ? "#dbeafe" : "white"}
              fillOpacity={0.92}
              stroke={isSelected ? "#3b82f6" : "#bfdbfe"}
              strokeWidth={0.8 * invZ}
            />

            {/* Dimension value */}
            <text
              x={labelX}
              y={labelY + labelFontSize * 0.33}
              textAnchor="middle"
              fontSize={labelFontSize}
              fontFamily="monospace"
              fontWeight={isSelected ? "700" : "600"}
              fill={isSelected ? "#1d4ed8" : "#1e3a5f"}
              style={{ cursor: "pointer", userSelect: "none" }}
              onClick={() =>
                selectEdge(edge.id === selectedEdgeId ? null : edge.id)
              }
            >
              {dimensionText}
            </text>
            </g>
          </g>
        );
      })}

      {/* ── Corner markers ── */}
      {corners.map((corner) => {
        const isSelected = corner.id === selectedCornerId;
        return (
          <g key={corner.id}>
            {/* Hit target */}
            <circle
              cx={corner.x}
              cy={corner.y}
              r={cornerHitRadius}
              fill="transparent"
              style={{ cursor: "grab" }}
              onPointerDown={(event) => onCornerPointerDown(corner.id, event)}
              onClick={() =>
                selectCorner(corner.id === selectedCornerId ? null : corner.id)
              }
            >
              <title>Drag to move this plot corner</title>
            </circle>
            {/* Visual dot */}
            <circle
              cx={corner.x}
              cy={corner.y}
              r={cornerRadius}
              fill={isSelected ? "#2563eb" : "white"}
              stroke={isSelected ? "#1d4ed8" : "#3b82f6"}
              strokeWidth={1.5 * invZ}
              style={{ cursor: "crosshair", pointerEvents: "none" }}
            />
          </g>
        );
      })}
      {insetCorners.map((corner,index)=>{
        const edge=(['top','right','bottom','left'] as PlotEdgeName[])[index],selected=selectedPropertyCardId===`setback-${edge}`;
        return <g key={`setback-handle-${edge}`} style={{cursor:"nwse-resize",touchAction:"none"}} onPointerDown={event=>onSetbackPointerDown(index,event)}>
          <circle cx={corner.x} cy={corner.y} r={14*invZ} fill="transparent" pointerEvents="all" />
          <circle cx={corner.x} cy={corner.y} r={6*invZ} fill={selected?"#0f766e":"white"} stroke="#0f766e" strokeWidth={2*invZ} pointerEvents="none" />
          <title>Drag this corner inward to reduce the setback rectangle, or outward to enlarge it</title>
        </g>;
      })}

      {/* ── Corner coordinate labels (show when selected) ── */}
      {corners.map((corner) => {
        if (corner.id !== selectedCornerId) return null;
        return (
          <g key={`coord-${corner.id}`}>
            <rect
              x={corner.x + 8 * invZ}
              y={corner.y - 26 * invZ}
              width={80 * invZ}
              height={22 * invZ}
              rx={3 * invZ}
              fill="white"
              fillOpacity={0.95}
              stroke="#3b82f6"
              strokeWidth={0.8 * invZ}
            />
            <text
              x={corner.x + 10 * invZ}
              y={corner.y - 14 * invZ}
              fontSize={smallFontSize * 0.85}
              fontFamily="monospace"
              fill="#1e3a5f"
              style={{ userSelect: "none" }}
            >
              {format(corner.x)}, {format(corner.y)}
            </text>
          </g>
        );
      })}
    </g>
  );
}
