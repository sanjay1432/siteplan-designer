import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  screenToWorld,
  zoomAtPoint,
  formatZoom,
  fitBounds,
  DEFAULT_WORLD_BOUNDS,
  DEFAULT_PADDING,
  MIN_ZOOM,
  MAX_ZOOM,
  type Point,
} from "../../geometry/viewport";

import { useViewport } from "../../geometry/ViewportContext";
import { useUnits } from "../../geometry/units/UnitContext";
import { usePlot } from "../../geometry/plot/PlotContext";
import { Grid } from "./Grid";
import { PlotRenderer } from "./PlotRenderer";
import { exportCanvasPng, exportCanvasSvg, printCanvasPdf } from "../../lib/sitePlanExport";
import { tryParseDimension } from "../../geometry/units/parser";
import type { PlotEdgeName } from "../../types/plot";

export function SiteCanvas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const isInitializedRef = useRef(false);
  const draggingCornerRef = useRef<string | null>(null);
  const draggingRoomRef = useRef<{id:string; origin:Point; center:Point} | null>(null);
  const draggingPlanRef = useRef<Point|null>(null);
  const resizingRoomRef = useRef<{id:string; corner:number; room:{x:number;y:number;width:number;height:number}} | null>(null);
  const draggingOpeningRef = useRef<string|null>(null);
  const draggingPlanObjectRef=useRef<{id:string;offset:Point}|null>(null);
  const draggingSetbackRef=useRef<{corner:number;origin:Point;starts:Record<PlotEdgeName,number>}|null>(null);
  const draggingSiteFeatureRef=useRef<{id:string;offset:Point}|null>(null);

  const {
    viewport,
    setViewport,
    canvasSize,
    setCanvasSize,
  } = useViewport();

  const { format, unitSystem } = useUnits();
  const { plot, updateCornerPosition, rooms, openings, planObjects, movePlanObject, siteFeatures, moveSiteFeature, selectSiteFeature, moveOpening, moveRoom, moveFloorPlan, resizeRoom, measurements, setMeasurements, activeProjectId, activeProjectName, compassRotation, rotateCompass, resetCompass, setbackDistances, setSetbackDistances, selectPropertyCard, selectCorner, selectedSiteFeatureId } = usePlot();
  const [measureMode, setMeasureMode] = useState(false);
  const measurementPastRef = useRef<Array<Array<{start:Point;end:Point}>>>([]);
  const measurementFutureRef = useRef<Array<Array<{start:Point;end:Point}>>>([]);
  const [pendingMeasure, setPendingMeasure] = useState<Point|null>(null);
  const [measureLength, setMeasureLength] = useState("");
  const [selectedMeasurement, setSelectedMeasurement] = useState<number|null>(null);
  const [moveAxis, setMoveAxis] = useState<"free"|"x"|"y">("free");
  const [moveWholePlan, setMoveWholePlan] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string|null>(null);
  const [exportMenuOpen,setExportMenuOpen]=useState(false);
  const [exportNotice,setExportNotice]=useState("");
  const updateMeasurements = useCallback((update:(current:Array<{start:Point;end:Point}>)=>Array<{start:Point;end:Point}>) => setMeasurements(current=>{
    measurementPastRef.current=[...measurementPastRef.current.slice(-99),current];
    measurementFutureRef.current=[];
    return update(current);
  }),[setMeasurements]);
  const undoMeasurement = () => {
    const previous=measurementPastRef.current.pop();if(!previous)return;
    setMeasurements(current=>{measurementFutureRef.current=[current,...measurementFutureRef.current];return previous;});
  };
  const redoMeasurement = () => {
    const next=measurementFutureRef.current.shift();if(!next)return;
    setMeasurements(current=>{measurementPastRef.current=[...measurementPastRef.current,current];return next;});
  };

  useEffect(() => {
    const element = svgRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;

      setCanvasSize({ width, height });

      if (!isInitializedRef.current) {
        isInitializedRef.current = true;
        setViewport(
          fitBounds(DEFAULT_WORLD_BOUNDS, width, height, DEFAULT_PADDING),
        );
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [setCanvasSize, setViewport]);

  useEffect(()=>{
    measurementPastRef.current=[];measurementFutureRef.current=[];
  },[activeProjectId]);

  const [cursorWorld, setCursorWorld] = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastMouse, setLastMouse] = useState<Point>({ x: 0, y: 0 });

  const updateCursorPosition = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const screenPoint = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    setCursorWorld(screenToWorld(screenPoint, viewport));
    return screenPoint;
  };

  const handleMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const screenPoint = updateCursorPosition(event);
    if (!isPanning || !screenPoint) return;

    const dx = event.clientX - lastMouse.x;
    const dy = event.clientY - lastMouse.y;
    setViewport((c) => ({ ...c, panX: c.panX + dx, panY: c.panY + dy }));
    setLastMouse({ x: event.clientX, y: event.clientY });
  };

  const handleMouseDown = (event: React.MouseEvent<SVGSVGElement>) => {
    if (event.button !== 1 && event.button !== 2) return;
    setIsPanning(true);
    setLastMouse({ x: event.clientX, y: event.clientY });
  };

  const handleMouseUp = () => setIsPanning(false);

  const handleContextMenu = (event: React.MouseEvent) => event.preventDefault();

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (event.ctrlKey || event.metaKey) {
      const mousePoint = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      const factor = Math.exp(-event.deltaY * 0.002);
      setViewport((current) => {
        const nextZoom = Math.min(
          Math.max(current.zoom * factor, MIN_ZOOM),
          MAX_ZOOM,
        );
        return zoomAtPoint(current, mousePoint, nextZoom);
      });
      return;
    }

    const deltaX = event.shiftKey ? event.deltaY : event.deltaX;
    const deltaY = event.shiftKey ? 0 : event.deltaY;
    setViewport((current) => ({
      ...current,
      panX: current.panX - deltaX,
      panY: current.panY - deltaY,
    }));
  };

  const handleCornerPointerDown = (
    cornerId: string,
    event: React.PointerEvent<SVGCircleElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    selectCorner(cornerId);
    draggingCornerRef.current = cornerId;
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const cornerId = draggingCornerRef.current;
    if (!cornerId && !draggingRoomRef.current && !resizingRoomRef.current && !draggingPlanRef.current && !draggingOpeningRef.current && !draggingSetbackRef.current && !draggingSiteFeatureRef.current && !draggingPlanObjectRef.current) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const point = screenToWorld(
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        viewport,
      );
    if(draggingSiteFeatureRef.current){const drag=draggingSiteFeatureRef.current;moveSiteFeature(drag.id,{x:point.x+drag.offset.x,y:point.y+drag.offset.y});}
    else if(draggingPlanObjectRef.current){const drag=draggingPlanObjectRef.current;movePlanObject(drag.id,{x:point.x+drag.offset.x,y:point.y+drag.offset.y});}
    else if(draggingSetbackRef.current){const drag=draggingSetbackRef.current,dx=point.x-drag.origin.x,dy=point.y-drag.origin.y,next={...drag.starts};
      if(drag.corner===0){next.left=Math.max(0,drag.starts.left+dx);next.top=Math.max(0,drag.starts.top+dy);}
      if(drag.corner===1){next.right=Math.max(0,drag.starts.right-dx);next.top=Math.max(0,drag.starts.top+dy);}
      if(drag.corner===2){next.right=Math.max(0,drag.starts.right-dx);next.bottom=Math.max(0,drag.starts.bottom-dy);}
      if(drag.corner===3){next.left=Math.max(0,drag.starts.left+dx);next.bottom=Math.max(0,drag.starts.bottom-dy);}
      setSetbackDistances(next);
    }
    else if (draggingOpeningRef.current) moveOpening(draggingOpeningRef.current,point);
    else if (cornerId) updateCornerPosition(cornerId, point);
    else if(draggingPlanRef.current) {
      const previous=draggingPlanRef.current;
      moveFloorPlan({x:moveAxis==="y"?0:point.x-previous.x,y:moveAxis==="x"?0:point.y-previous.y});
      draggingPlanRef.current=point;
    }
    else if (resizingRoomRef.current) {
      const {id,corner,room}=resizingRoomRef.current; const min=500;
      if(corner===0) resizeRoom(id,Math.min(point.x,room.x+room.width-min),Math.min(point.y,room.y+room.height-min),Math.max(min,room.x+room.width-point.x),Math.max(min,room.y+room.height-point.y));
      if(corner===1) resizeRoom(id,room.x,Math.min(point.y,room.y+room.height-min),Math.max(min,point.x-room.x),Math.max(min,room.y+room.height-point.y));
      if(corner===2) resizeRoom(id,room.x,room.y,Math.max(min,point.x-room.x),Math.max(min,point.y-room.y));
      if(corner===3) resizeRoom(id,Math.min(point.x,room.x+room.width-min),room.y,Math.max(min,room.x+room.width-point.x),Math.max(min,point.y-room.y));
    } else if (draggingRoomRef.current) {
      const drag=draggingRoomRef.current;
      const dx=point.x-drag.origin.x,dy=point.y-drag.origin.y;
      moveRoom(drag.id,{x:drag.center.x+(moveAxis==="y"?0:dx),y:drag.center.y+(moveAxis==="x"?0:dy)});
    }
  };

  const handlePointerUp = () => {
    draggingCornerRef.current = null;
    draggingRoomRef.current = null;
    draggingPlanRef.current = null;
    resizingRoomRef.current = null;
    draggingOpeningRef.current = null;
    draggingPlanObjectRef.current=null;
    draggingSetbackRef.current=null;
    draggingSiteFeatureRef.current=null;
  };

  const pointFromPointer = (event: { clientX: number; clientY: number }) => {
    const rect=svgRef.current?.getBoundingClientRect();
    return rect ? screenToWorld({x:event.clientX-rect.left,y:event.clientY-rect.top},viewport) : null;
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key === "Delete" || event.key === "Backspace") && selectedMeasurement !== null) {
        const target = event.target as HTMLElement | null;
        if (target?.closest("input,textarea,select,[contenteditable=true]")) return;
        event.preventDefault();
        updateMeasurements(lines => lines.filter((_, index) => index !== selectedMeasurement));
        setSelectedMeasurement(null);
      }
      if (event.key === "Escape" && measureMode) { setMeasureMode(false); setPendingMeasure(null); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedMeasurement, measureMode, updateMeasurements]);

  // Show plot name if it exists
  const hasPlot = plot.corners.length > 0;

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-100">
      <svg
        id="site-plan-canvas"
        ref={svgRef}
        width="100%"
        height="100%"
        className="h-full w-full cursor-grab"
        onWheel={handleWheel}
        onPointerMove={handlePointerMove}
        onPointerDown={(event) => {
          if (!(event.target as Element).closest("[data-room]")) {setSelectedRoomId(null);selectPropertyCard(null);}
        }}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
        onClick={(event) => {
          if ((event.target as Element).closest("[data-room]")) return;
          if (!measureMode) return;
          const point=pointFromPointer(event); if(!point) return;
          if(!pendingMeasure) setPendingMeasure(point);
          else {
            const parsed = measureLength.trim() ? tryParseDimension(measureLength, unitSystem === "metric" ? "m" : "ft") : null;
            if (parsed && (!parsed.success || parsed.mm <= 0)) return;
            const dx=point.x-pendingMeasure.x,dy=point.y-pendingMeasure.y,raw=Math.hypot(dx,dy);
            const length=parsed?.success ? parsed.mm : raw;
            if (raw > 0 && length > 0) updateMeasurements(lines=>[...lines,{start:pendingMeasure,end:{x:pendingMeasure.x+dx/raw*length,y:pendingMeasure.y+dy/raw*length}}]);
            setPendingMeasure(null); setMeasureMode(false); setMeasureLength("");
          }
        }}
      >
        <g
          transform={`translate(${viewport.panX} ${viewport.panY}) scale(${viewport.zoom})`}
        >
          <Grid
            viewport={viewport}
            width={canvasSize.width}
            height={canvasSize.height}
          />
          {hasPlot && (
            <PlotRenderer
              viewport={viewport}
              onCornerPointerDown={handleCornerPointerDown}
              rooms={rooms}
              openings={openings}
              planObjects={planObjects}
              siteFeatures={siteFeatures}
              selectedSiteFeatureId={selectedSiteFeatureId}
              onOpeningPointerDown={(id,event)=>{event.preventDefault();selectPropertyCard(`opening-${id}`);draggingOpeningRef.current=id;svgRef.current?.setPointerCapture(event.pointerId);}}
              onPlanObjectPointerDown={(id,event)=>{event.preventDefault();event.stopPropagation();const item=planObjects.find(object=>object.id===id),origin=pointFromPointer(event);if(!item||!origin)return;selectPropertyCard(`plan-object-${id}`);draggingPlanObjectRef.current={id,offset:{x:item.x-origin.x,y:item.y-origin.y}};svgRef.current?.setPointerCapture(event.pointerId);}}
              onSiteFeaturePointerDown={(id,event)=>{
                event.preventDefault();event.stopPropagation();setSelectedRoomId(null);
                const feature=siteFeatures.find(item=>item.id===id),origin=pointFromPointer(event);if(!feature||!origin)return;
                selectSiteFeature(id);draggingSiteFeatureRef.current={id,offset:{x:feature.x+feature.width/2-origin.x,y:feature.y+feature.height/2-origin.y}};svgRef.current?.setPointerCapture(event.pointerId);
              }}
              onSetbackPointerDown={(corner,event)=>{
                event.preventDefault();event.stopPropagation();
                const origin=pointFromPointer(event);if(!origin)return;
                const edge=(['top','right','bottom','left'] as PlotEdgeName[])[corner];
                draggingSetbackRef.current={corner,origin,starts:{...setbackDistances}};
                selectPropertyCard(`setback-${edge}`);svgRef.current?.setPointerCapture(event.pointerId);
              }}
              selectedRoomId={selectedRoomId}
              onRoomPointerDown={(id,event) => {
                event.preventDefault();
                event.stopPropagation();
                setSelectedRoomId(id);
                selectPropertyCard(`room-${id}`);
                const room=rooms.find(item=>item.id===id);const origin=pointFromPointer(event);
                if(!room||!origin)return;
                if(moveWholePlan) draggingPlanRef.current=origin;
                else draggingRoomRef.current = {id,origin,center:{x:room.x+room.width/2,y:room.y+room.height/2}};
                svgRef.current?.setPointerCapture(event.pointerId);
              }}
              onRoomResizePointerDown={(id,corner,event)=>{
                event.preventDefault();event.stopPropagation();
                const room=rooms.find(item=>item.id===id);if(!room)return;
                resizingRoomRef.current={id,corner,room:{x:room.x,y:room.y,width:room.width,height:room.height}};
                svgRef.current?.setPointerCapture(event.pointerId);
              }}
            />
          )}
          {measurements.map((line,i)=>{
            const x=(line.start.x+line.end.x)/2,y=(line.start.y+line.end.y)/2;
            return <g key={i} onClick={event=>{event.stopPropagation();setSelectedMeasurement(i);}} style={{cursor:"pointer"}}>
              <line x1={line.start.x} y1={line.start.y} x2={line.end.x} y2={line.end.y} stroke="transparent" strokeWidth={14/viewport.zoom} />
              <line pointerEvents="none" x1={line.start.x} y1={line.start.y} x2={line.end.x} y2={line.end.y} stroke={selectedMeasurement===i?"#b45309":"#d97706"} strokeWidth={(selectedMeasurement===i?3:2)/viewport.zoom} strokeDasharray={`${6/viewport.zoom} ${3/viewport.zoom}`} />
              <rect pointerEvents="none" x={x-42/viewport.zoom} y={y-11/viewport.zoom} width={84/viewport.zoom} height={22/viewport.zoom} rx={4/viewport.zoom} fill="white" stroke={selectedMeasurement===i?"#b45309":"#f59e0b"} strokeWidth={1/viewport.zoom}/>
              <text pointerEvents="none" x={x} y={y+4/viewport.zoom} textAnchor="middle" fontSize={12/viewport.zoom} fill="#92400e">{format(Math.hypot(line.end.x-line.start.x,line.end.y-line.start.y))}</text>
            </g>;
          })}
          {measureMode && pendingMeasure && <g pointerEvents="none"><line x1={pendingMeasure.x} y1={pendingMeasure.y} x2={cursorWorld.x} y2={cursorWorld.y} stroke="#d97706" strokeWidth={2/viewport.zoom} strokeDasharray={`${6/viewport.zoom} ${3/viewport.zoom}`} /><rect x={(pendingMeasure.x+cursorWorld.x)/2-42/viewport.zoom} y={(pendingMeasure.y+cursorWorld.y)/2-11/viewport.zoom} width={84/viewport.zoom} height={22/viewport.zoom} rx={4/viewport.zoom} fill="white" stroke="#f59e0b" strokeWidth={1/viewport.zoom}/><text x={(pendingMeasure.x+cursorWorld.x)/2} y={(pendingMeasure.y+cursorWorld.y)/2+4/viewport.zoom} textAnchor="middle" fontSize={12/viewport.zoom} fill="#92400e">{format(Math.hypot(cursorWorld.x-pendingMeasure.x,cursorWorld.y-pendingMeasure.y))}</text></g>}
          {pendingMeasure && <circle cx={pendingMeasure.x} cy={pendingMeasure.y} r={6/viewport.zoom} fill="#f59e0b"/>}
        </g>
        <g transform={`translate(${Math.max(42,canvasSize.width-42)} 122)`} aria-label={`Compass, north rotated ${compassRotation} degrees`}>
          <circle r="22" fill="white" fillOpacity=".94" stroke="#cbd5e1" strokeWidth="1.5" />
          <text x="0" y="-27" textAnchor="middle" fontSize="11" fontWeight="700" fill="#334155">N</text>
          <g transform={`rotate(${compassRotation})`}>
            <path d="M 0 -16 L 6 5 L 0 2 L -6 5 Z" fill="#dc2626" />
            <path d="M 0 16 L 6 5 L 0 8 L -6 5 Z" fill="#94a3b8" />
          </g>
          <circle r="2.5" fill="#334155" />
        </g>
      </svg>

      {/* Zoom indicator */}
      <div className="absolute left-2 right-auto top-2 z-10 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white p-1 shadow-sm sm:left-4 sm:top-4">
        <button type="button" onClick={() => {setMeasureMode(v=>!v);setPendingMeasure(null);setSelectedMeasurement(null);}} className={`rounded px-2 py-1.5 text-xs font-medium ${measureMode ? "bg-amber-50 text-amber-800" : "text-slate-700 hover:bg-slate-50"}`}>
          {measureMode ? (pendingMeasure ? "Click second point…" : "Click first point…") : "Measure"}
        </button>
        {measureMode && <label className="flex items-center gap-1 border-l border-slate-200 pl-2 text-[10px] text-slate-500">Length <input aria-label="Exact line length" value={measureLength} onChange={event=>setMeasureLength(event.target.value)} placeholder={`free · ${unitSystem === "metric" ? "m" : "ft"}`} className="w-20 rounded border border-slate-200 px-1.5 py-1 font-mono text-xs text-slate-800" /></label>}
        <span className="mx-1 h-4 w-px bg-slate-200" />
        {([["free","Free"],["x","X only"],["y","Y only"]] as const).map(([axis,label])=><button key={axis} type="button" onClick={()=>{setMoveAxis(axis);setMoveWholePlan(false);}} className={`rounded px-2 py-1.5 text-[11px] ${moveAxis===axis&&!moveWholePlan?"bg-slate-800 text-white":"text-slate-600 hover:bg-slate-100"}`} title={`Move rooms on ${axis === "free" ? "both axes" : `${axis.toUpperCase()} axis only`}`}>{label}</button>)}
        <button type="button" onClick={()=>setMoveWholePlan(v=>!v)} className={`rounded px-2 py-1.5 text-[11px] ${moveWholePlan?"bg-emerald-700 text-white":"text-slate-600 hover:bg-slate-100"}`} title="Drag any room to move the entire floor plan">Whole plan</button>
      </div>
      {(measurements.length > 0 || measurementPastRef.current.length > 0 || measurementFutureRef.current.length > 0) && <div className="absolute left-2 top-20 z-10 flex items-center gap-1 rounded-md border border-slate-200 bg-white p-1 shadow-sm sm:left-4 sm:top-16">
        <button type="button" onClick={undoMeasurement} disabled={!measurementPastRef.current.length} className="rounded px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100 disabled:opacity-40">Undo line</button>
        <button type="button" onClick={redoMeasurement} disabled={!measurementFutureRef.current.length} className="rounded px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100 disabled:opacity-40">Redo line</button>
        <button type="button" onClick={()=>{if(selectedMeasurement===null)return;updateMeasurements(lines=>lines.filter((_,index)=>index!==selectedMeasurement));setSelectedMeasurement(null);}} disabled={selectedMeasurement===null} className="rounded px-2 py-1 text-[11px] text-red-600 hover:bg-red-50 disabled:opacity-40">Remove selected</button>
        <button type="button" onClick={()=>updateMeasurements(()=>[])} disabled={!measurements.length} className="rounded px-2 py-1 text-[11px] text-red-600 hover:bg-red-50 disabled:opacity-40">Clear lines</button>
      </div>}
      <div className="absolute right-2 top-2 z-10 flex max-w-[calc(100%-1rem)] flex-nowrap items-center justify-end gap-0.5 rounded-md border border-slate-200 bg-white/95 p-1 shadow-sm sm:right-4 sm:top-4">
        <button type="button" onClick={()=>rotateCompass(-15)} title="Rotate north counter-clockwise" aria-label="Rotate compass counter-clockwise" className="rounded px-1.5 py-1 text-xs text-slate-600 hover:bg-slate-100">↶15°</button>
        <span className="px-1 font-mono text-[10px] text-slate-600">N {compassRotation}°</span>
        <button type="button" onClick={()=>rotateCompass(15)} title="Rotate north clockwise" aria-label="Rotate compass clockwise" className="rounded px-1.5 py-1 text-xs text-slate-600 hover:bg-slate-100">↷15°</button>
        <button type="button" onClick={resetCompass} className="rounded px-1.5 py-1 text-[10px] text-blue-700 hover:bg-blue-50">Reset N</button>
      </div>
      <div className="absolute right-2 top-11 z-10 sm:right-4 sm:top-[3.25rem]">
        <button type="button" onClick={()=>setExportMenuOpen(v=>!v)} className="rounded-md border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-white">Export plan</button>
        {exportMenuOpen && <div className="absolute right-0 top-9 flex min-w-48 flex-col rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          <p className="px-2 py-1 text-[10px] text-slate-500">Exports the plot and floor plan together.</p>
          <button type="button" onClick={()=>{if(svgRef.current)exportCanvasPng(svgRef.current,activeProjectName);setExportMenuOpen(false);}} className="rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50">Download plan image (PNG)</button>
          <button type="button" onClick={()=>{if(svgRef.current)exportCanvasSvg(svgRef.current,activeProjectName);setExportMenuOpen(false);}} className="rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50">Download vector image (SVG)</button>
          <button type="button" onClick={()=>{if(svgRef.current&&!printCanvasPdf(svgRef.current))setExportNotice("Allow pop-ups to print or save as PDF.");else setExportNotice("");setExportMenuOpen(false);}} className="rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50">Print / Save PDF</button>
        </div>}
      </div>
      {exportNotice && <div role="status" className="absolute right-2 top-24 z-10 max-w-52 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-800">{exportNotice}</div>}
      <div className="absolute bottom-3 left-2 rounded-md border border-slate-200 bg-white/95 px-2 py-1.5 text-[10px] font-medium text-slate-700 shadow-sm backdrop-blur-xs select-none sm:bottom-4 sm:left-4 sm:px-3 sm:text-xs">
        Zoom: {formatZoom(viewport.zoom)}
      </div>

      <div className="absolute bottom-4 left-1/2 hidden -translate-x-1/2 rounded-md border border-slate-200 bg-white/95 px-3 py-1.5 text-xs text-slate-500 shadow-sm backdrop-blur-xs select-none md:block">
        Scroll to pan · Ctrl+scroll to zoom · Drag plot points or room shapes
      </div>

      {/* Real-world cursor coordinates */}
      <div className="absolute bottom-12 left-2 right-2 flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white/95 px-2 py-1.5 font-mono text-[10px] text-slate-700 shadow-sm backdrop-blur-xs select-none sm:bottom-4 sm:left-auto sm:right-4 sm:px-3 sm:text-xs">
        <span>X: {cursorWorld.x.toFixed(0)} mm ({format(cursorWorld.x)})</span>
        <span className="text-slate-300">|</span>
        <span>Y: {cursorWorld.y.toFixed(0)} mm ({format(cursorWorld.y)})</span>
      </div>
    </div>
  );
}
