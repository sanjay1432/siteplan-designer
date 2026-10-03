import type { PlotCorner, PlotEdge } from "../../types/plot";
import type { Viewport } from "../../geometry/viewport";
import { midpoint } from "../../geometry/plot";
import { useUnits } from "../../geometry/units/UnitContext";
import { usePlot } from "../../geometry/plot/PlotContext";
import { offsetPolygonInward } from "../../geometry/plot/setback";
import type { PlanOpening, Room } from "../../geometry/plot/PlotContext";

interface PlotRendererProps {
  viewport: Viewport;
  onCornerPointerDown: (
    cornerId: string,
    event: React.PointerEvent<SVGCircleElement>,
  ) => void;
  rooms: Room[];
  openings: PlanOpening[];
  onOpeningPointerDown: (id:string,event:React.PointerEvent<SVGGElement>)=>void;
  onRoomPointerDown: (id: string, event: React.PointerEvent<SVGRectElement>) => void;
  onRoomResizePointerDown: (id: string, corner: number, event: React.PointerEvent<SVGCircleElement>) => void;
  selectedRoomId: string | null;
}

/**
 * Renders the plot polygon in SVG world-space (millimetres).
 * The parent <g> has the viewport transform applied, so all
 * coordinates here are canonical world-space millimetres.
 */
export function PlotRenderer({ viewport, onCornerPointerDown, rooms, openings, onOpeningPointerDown, onRoomPointerDown, onRoomResizePointerDown, selectedRoomId }: PlotRendererProps) {
  const { plot, setbackMm, selectedEdgeId, selectedCornerId, selectEdge, selectCorner } =
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
  const insetCorners=offsetPolygonInward(corners,setbackMm);
  const setbackPoints=insetCorners.map(point=>`${point.x},${point.y}`).join(" ");

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
  const compactRoomName = (name:string, widthPx:number) => {
    const maxChars=Math.max(1,Math.floor((widthPx-12)/7));
    if(name.length<=maxChars)return name;
    const normalized=name.toLowerCase();
    const short=normalized.includes("bathroom")||normalized.includes("washroom")?"WR"
      :normalized.includes("master bedroom")?"M. Bed"
      :normalized.includes("bedroom")?"Bed"
      :normalized.includes("living")?"Living"
      :normalized.includes("kitchen")?"Kit."
      :normalized.includes("dining")?"Din."
      :normalized.includes("passage")?"Pass."
      :normalized.includes("balcony")?"Balc."
      :normalized.includes("utility")?"Util."
      :normalized.includes("foyer")?"Foy."
      :name;
    if(short.length<=maxChars)return short;
    return maxChars<=1?"…":`${name.slice(0,maxChars-1)}…`;
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
      />
      {setbackMm>0&&<polygon points={setbackPoints} fill="rgba(20,184,166,.035)" stroke="#0f766e" strokeWidth={2*invZ} strokeDasharray={`${7*invZ} ${5*invZ}`} strokeLinejoin="round" pointerEvents="none"><title>Setback · {format(setbackMm)} from each plot edge</title></polygon>}

      {/* ── Edge lines ── */}
      {rooms.map((room,index) => <g key={room.id} data-room="true">
        <rect x={room.x} y={room.y} width={room.width} height={room.height}
          fill={room.kind==="stairs"?"rgba(245,158,11,.15)":index%2 ? "rgba(14,165,233,.14)" : "rgba(16,185,129,.16)"} stroke={room.kind==="stairs"?"#b45309":index%2 ? "#0369a1" : "#047857"} strokeWidth={2*invZ}
          style={{cursor:"move"}} onPointerDown={event=>onRoomPointerDown(room.id,event)} onClick={event=>event.stopPropagation()}>
          <title>{room.name} · Drag to move</title>
        </rect>
        {room.kind === "stairs" ? Array.from({length:7},(_,i)=><line key={`step-${i}`} x1={room.x+room.width*.15} x2={room.x+room.width*.85} y1={room.y+room.height*(i+1)/8} y2={room.y+room.height*(i+1)/8} stroke="#b45309" strokeWidth={1*invZ} pointerEvents="none" />) : null}
        <text x={room.x+room.width/2} y={room.y+room.height/2-7*invZ} textAnchor="middle" dominantBaseline="middle" fontSize={12*invZ} fill={room.kind==="stairs"?"#92400e":"#064e3b"} style={{pointerEvents:"none",userSelect:"none"}}>{compactRoomName(room.name,room.width*viewport.zoom)}</text>
        <text x={room.x+room.width/2} y={room.y+room.height/2+9*invZ} textAnchor="middle" dominantBaseline="middle" fontSize={10*invZ} fill="#475569" style={{pointerEvents:"none",userSelect:"none"}}>{simpleDimension(room.width)} × {simpleDimension(room.height)}</text>
        {selectedRoomId===room.id && [[room.x,room.y],[room.x+room.width,room.y],[room.x+room.width,room.y+room.height],[room.x,room.y+room.height]].map(([cx,cy],corner)=><circle key={corner} cx={cx} cy={cy} r={5*invZ} fill="white" stroke="#047857" strokeWidth={1.5*invZ} style={{cursor:corner%2===0?"nwse-resize":"nesw-resize"}} onPointerDown={event=>onRoomResizePointerDown(room.id,corner,event)} onClick={event=>event.stopPropagation()}><title>Drag to resize {room.name}</title></circle>)}
      </g>)}
      {setbackMm>0&&corners.map((corner,index)=>{
        const next=corners[(index+1)%corners.length],innerStart=insetCorners[index],innerEnd=insetCorners[(index+1)%insetCorners.length];
        const outerMid={x:(corner.x+next.x)/2,y:(corner.y+next.y)/2},innerMid={x:(innerStart.x+innerEnd.x)/2,y:(innerStart.y+innerEnd.y)/2};
        const labelX=(outerMid.x+innerMid.x)/2,labelY=(outerMid.y+innerMid.y)/2;
        return <g key={`setback-dimension-${index}`} pointerEvents="none"><line x1={outerMid.x} y1={outerMid.y} x2={innerMid.x} y2={innerMid.y} stroke="#0f766e" strokeWidth={1.25*invZ}/><circle cx={outerMid.x} cy={outerMid.y} r={2*invZ} fill="#0f766e"/><circle cx={innerMid.x} cy={innerMid.y} r={2*invZ} fill="#0f766e"/><rect x={labelX-48*invZ} y={labelY-9*invZ} width={96*invZ} height={18*invZ} rx={4*invZ} fill="white" fillOpacity={.96} stroke="#0f766e" strokeWidth={.8*invZ}/><text x={labelX} y={labelY+3*invZ} textAnchor="middle" fontSize={8.5*invZ} fontWeight="700" fill="#115e59"> {format(setbackMm)}</text></g>;
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
