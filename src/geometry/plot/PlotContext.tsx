import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  Plot,
  PlotCorner,
  PlotDimensions,
  PlotEdgeName,
  PlotMetrics,
} from "../../types/plot";
import { readStoredValue, writeStoredValue } from "../../lib/persistence";
import type { Point } from "../viewport";
import {
  computePlotMetrics,
  createPlot,
  DEFAULT_PLOT_DIMENSIONS_MM,
  distance,
} from "../plot";

export type RoomKind = "room" | "stairs";
export type WallSide = "top" | "right" | "bottom" | "left";
export interface Room { id: string; name: string; x: number; y: number; width: number; height: number; kind?: RoomKind }
export interface PlanOpening { id:string; roomId:string; type:"door"|"window"; side:WallSide; offset:number; width:number }
export type FloorPlanPreset = "1bhk" | "2bhk" | "3bhk";
export interface MeasurementLine { start:Point; end:Point }
export interface PlotGeometry { corners:PlotCorner[]; building?:{x:number;y:number;width:number;height:number}; rooms?:Room[]; openings?:PlanOpening[] }
export interface SavedProject { id:string; name:string; geometry:PlotGeometry; measurements:MeasurementLine[]; compassRotation:number }

const EXPORT_FORMAT = "siteplan-designer-project";

interface PlotContextValue {
  plot: Plot;
  dimensions: PlotDimensions;
  metrics: PlotMetrics;
  building: { x: number; y: number; width: number; height: number };
  rooms: Room[];
  openings: PlanOpening[];
  measurements: MeasurementLine[];
  setMeasurements: (update:MeasurementLine[] | ((current:MeasurementLine[])=>MeasurementLine[]))=>void;
  compassRotation:number;
  rotateCompass:(degrees:number)=>void;
  resetCompass:()=>void;
  projects:SavedProject[];
  activeProjectId:string;
  activeProjectName:string;
  switchProject:(id:string)=>void;
  createProject:()=>void;
  renameProject:(name:string)=>void;
  deleteProject:()=>void;
  exportProject:()=>unknown;
  importProject:(value:unknown)=>boolean;
  selectedEdgeId: string | null;
  selectedCornerId: string | null;
  updateEdgeDimension: (edgeName: PlotEdgeName, lengthMm: number) => void;
  updateCornerPosition: (cornerId: string, point: Point) => void;
  updateBuildingPosition: (point: Point) => void;
  updateBuildingSize: (width: number, height: number) => void;
  addRoom: (room: Omit<Room, "id">) => void;
  moveRoom: (id: string, point: Point) => void;
  moveFloorPlan: (delta: Point) => void;
  resizeRoom: (id: string, x: number, y: number, width: number, height: number) => void;
  removeRoom: (id: string) => void;
  addOpening: (roomId:string, type:PlanOpening["type"], side:WallSide) => void;
  removeOpening: (id:string) => void;
  removeFloorPlan: () => void;
  applyFloorPlanPreset: (preset:FloorPlanPreset, targetAreaSqMm?:number) => boolean;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  resetPlot: () => void;
  selectEdge: (id: string | null) => void;
  selectCorner: (id: string | null) => void;
}

interface LegacyPlotGeometry {
  dimensions: PlotDimensions;
  origin: Point;
  rotation: number;
}

const PlotContext = createContext<PlotContextValue | null>(null);
const PLOT_STORAGE_KEY = "siteplan-designer:plot-geometry:v4";
const PROJECTS_STORAGE_KEY = "siteplan-designer:projects:v1";
const LEGACY_GEOMETRY_KEY = "siteplan-designer:plot-geometry:v2";
const LEGACY_DIMENSIONS_KEY = "siteplan-designer:plot-dimensions:v1";
const CORNER_IDS = ["corner-tl", "corner-tr", "corner-br", "corner-bl"];

function isPlotDimensions(value: unknown): value is PlotDimensions {
  if (!value || typeof value !== "object") return false;
  const dimensions = value as Record<string, unknown>;
  return ["top", "right", "bottom", "left"].every(
    (edge) =>
      typeof dimensions[edge] === "number" &&
      Number.isFinite(dimensions[edge]) &&
      dimensions[edge] > 0,
  );
}

function isLegacyPlotGeometry(value: unknown): value is LegacyPlotGeometry {
  if (!value || typeof value !== "object") return false;
  const geometry = value as Record<string, unknown>;
  const origin = geometry.origin as Record<string, unknown> | null;
  return (
    isPlotDimensions(geometry.dimensions) &&
    origin !== null &&
    typeof origin === "object" &&
    typeof origin.x === "number" && Number.isFinite(origin.x) &&
    typeof origin.y === "number" && Number.isFinite(origin.y) &&
    typeof geometry.rotation === "number" && Number.isFinite(geometry.rotation)
  );
}

function isPlotGeometry(value: unknown): value is PlotGeometry {
  if (!value || typeof value !== "object") return false;
  const geometry = value as Record<string, unknown>;
  const corners = geometry.corners;
  if (!Array.isArray(corners) || corners.length !== 4) return false;
  return CORNER_IDS.every((id) => {
    return corners.some(
      (item) =>
        item &&
        typeof item === "object" &&
        (item as Record<string, unknown>).id === id &&
        typeof (item as Record<string, unknown>).x === "number" &&
        Number.isFinite((item as Record<string, unknown>).x) &&
        typeof (item as Record<string, unknown>).y === "number" &&
        Number.isFinite((item as Record<string, unknown>).y),
    );
  });
}

function isPoint(value:unknown):value is Point {
  if(!value||typeof value!=="object")return false;const p=value as Record<string,unknown>;
  return typeof p.x==="number"&&Number.isFinite(p.x)&&typeof p.y==="number"&&Number.isFinite(p.y);
}
function isSavedProject(value:unknown):value is SavedProject {
  if(!value||typeof value!=="object")return false;const p=value as Record<string,unknown>;
  if(typeof p.id!=="string"||typeof p.name!=="string"||!isPlotGeometry(p.geometry)||!Array.isArray(p.measurements)||typeof p.compassRotation!=="number"||!Number.isFinite(p.compassRotation))return false;
  if(p.measurements.some(line=>!line||typeof line!=="object"||!isPoint((line as Record<string,unknown>).start)||!isPoint((line as Record<string,unknown>).end)))return false;
  const g=p.geometry as PlotGeometry;
  if(g.rooms!==undefined&&(!Array.isArray(g.rooms)||g.rooms.some(room=>!room||typeof room.id!=="string"||typeof room.name!=="string"||![room.x,room.y,room.width,room.height].every(n=>typeof n==="number"&&Number.isFinite(n)))))return false;
  if(g.openings!==undefined&&(!Array.isArray(g.openings)||g.openings.some(item=>!item||typeof item.id!=="string"||typeof item.roomId!=="string"||!(item.type==="door"||item.type==="window")||!(["top","right","bottom","left"].includes(item.side))||![item.width,item.offset].every(n=>typeof n==="number"&&Number.isFinite(n)))))return false;
  return true;
}
function isSavedProjectList(value:unknown):value is SavedProject[]{return Array.isArray(value)&&value.length>0&&value.every(isSavedProject);}

function getDimensions(corners: PlotCorner[]): PlotDimensions {
  const byId = new Map(corners.map((corner) => [corner.id, corner]));
  const topLeft = byId.get("corner-tl")!;
  const topRight = byId.get("corner-tr")!;
  const bottomRight = byId.get("corner-br")!;
  const bottomLeft = byId.get("corner-bl")!;
  return {
    top: distance(topLeft, topRight),
    right: distance(topRight, bottomRight),
    bottom: distance(bottomLeft, bottomRight),
    left: distance(topLeft, bottomLeft),
  };
}

function rectanglesArea(rectangles:{x:number;y:number;width:number;height:number}[]) {
  const xs=[...new Set(rectangles.flatMap(r=>[r.x,r.x+r.width]))].sort((a,b)=>a-b);
  let area=0;
  for(let i=0;i<xs.length-1;i++) {
    const left=xs[i],right=xs[i+1],mid=(left+right)/2;
    const spans=rectangles.filter(r=>r.x<mid&&r.x+r.width>mid).map(r=>[r.y,r.y+r.height] as [number,number]).sort((a,b)=>a[0]-b[0]);
    let covered=0,start:number|undefined,end:number|undefined;
    for(const [a,b] of spans){if(start===undefined){start=a;end=b;}else if(a<=end!){end=Math.max(end!,b);}else{covered+=end!-start;start=a;end=b;}}
    if(start!==undefined)covered+=end!-start;
    area+=(right-left)*covered;
  }
  return area;
}

function loadPlotGeometry(): PlotGeometry {
  const legacyDimensions = readStoredValue(
    LEGACY_DIMENSIONS_KEY,
    isPlotDimensions,
    DEFAULT_PLOT_DIMENSIONS_MM,
  );
  const legacyGeometry = readStoredValue(
    LEGACY_GEOMETRY_KEY,
    isLegacyPlotGeometry,
    { dimensions: legacyDimensions, origin: { x: 0, y: 0 }, rotation: 0 },
  );
  const migratedCorners = createPlot(
    legacyGeometry.dimensions,
    legacyGeometry.origin,
    legacyGeometry.rotation,
  ).corners;
  return readStoredValue(PLOT_STORAGE_KEY, isPlotGeometry, {
    corners: migratedCorners,
  });
}

function loadProjects():SavedProject[] {
  const saved=readStoredValue(PROJECTS_STORAGE_KEY,isSavedProjectList,[]);
  if(saved.length)return saved;
  return [{id:crypto.randomUUID(),name:"My site plan",geometry:loadPlotGeometry(),measurements:[],compassRotation:0}];
}

function createPlotFromCorners(corners: PlotCorner[]): Plot {
  const dimensions = getDimensions(corners);
  const plot = createPlot(dimensions);
  const cornersById = new Map(corners.map((corner) => [corner.id, corner]));
  const nextCorners = CORNER_IDS.map((id) => cornersById.get(id)!);
  const nextById = new Map(nextCorners.map((corner) => [corner.id, corner]));
  return {
    ...plot,
    corners: nextCorners,
    edges: plot.edges.map((edge) => {
      const start = nextById.get(edge.startCornerId)!;
      const end = nextById.get(edge.endCornerId)!;
      const lengthMm = distance(start, end);
      return { ...edge, targetLengthMm: lengthMm, actualLengthMm: lengthMm };
    }),
  };
}

export function PlotProvider({ children }: { children: ReactNode }) {
  const [projects,setProjects]=useState<SavedProject[]>(loadProjects);
  const [activeProjectId,setActiveProjectId]=useState(()=>projects[0].id);
  const initialProject=projects.find(project=>project.id===activeProjectId)!;
  const [geometry, setGeometry] = useState<PlotGeometry>(initialProject.geometry);
  const geometryRef = useRef(geometry);
  const [measurements,setMeasurementsState]=useState<MeasurementLine[]>(initialProject.measurements);
  const measurementsRef=useRef(measurements);
  const [compassRotation,setCompassRotationState]=useState(initialProject.compassRotation);
  const compassRef=useRef(compassRotation);
  const historyRef = useRef<{past:PlotGeometry[];future:PlotGeometry[];lastAt:number}>({past:[],future:[],lastAt:0});
  const [,setHistoryVersion] = useState(0);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedCornerId, setSelectedCornerId] = useState<string | null>(null);

  const plot = useMemo(() => createPlotFromCorners(geometry.corners), [geometry.corners]);
  const dimensions = useMemo(() => getDimensions(geometry.corners), [geometry.corners]);
  const metrics = useMemo(() => computePlotMetrics(plot.corners), [plot.corners]);
  const building = geometry.building ?? {
    x: metrics.bounds.minX + (metrics.bounds.maxX - metrics.bounds.minX) * 0.2,
    y: metrics.bounds.minY + (metrics.bounds.maxY - metrics.bounds.minY) * 0.2,
    width: (metrics.bounds.maxX - metrics.bounds.minX) * 0.6,
    height: (metrics.bounds.maxY - metrics.bounds.minY) * 0.6,
  };
  const rooms: Room[] = geometry.rooms ?? [];
  const openings=geometry.openings ?? [];

  const setMeasurements=useCallback((update:MeasurementLine[]|((current:MeasurementLine[])=>MeasurementLine[]))=>setMeasurementsState(current=>{
    const next=typeof update==="function"?update(current):update;measurementsRef.current=next;return next;
  }),[]);
  const rotateCompass=useCallback((degrees:number)=>setCompassRotationState(current=>{
    const next=((current+degrees)%360+360)%360;compassRef.current=next;return next;
  }),[]);
  const resetCompass=useCallback(()=>{compassRef.current=0;setCompassRotationState(0);},[]);

  useEffect(() => {
    geometryRef.current = geometry;
    measurementsRef.current=measurements;
    compassRef.current=compassRotation;
    setProjects(current=>current.map(project=>project.id===activeProjectId?{...project,geometry,measurements,compassRotation}:project));
  }, [geometry,measurements,compassRotation,activeProjectId]);
  useEffect(()=>{writeStoredValue(PROJECTS_STORAGE_KEY,projects);},[projects]);

  const switchProject=useCallback((id:string)=>{
    if(id===activeProjectId)return;
    const next=projects.find(project=>project.id===id);if(!next)return;
    setProjects(current=>current.map(project=>project.id===activeProjectId?{...project,geometry:geometryRef.current,measurements:measurementsRef.current,compassRotation:compassRef.current}:project));
    setActiveProjectId(id);geometryRef.current=next.geometry;measurementsRef.current=next.measurements;compassRef.current=next.compassRotation;
    setGeometry(next.geometry);setMeasurementsState(next.measurements);setCompassRotationState(next.compassRotation);
    historyRef.current={past:[],future:[],lastAt:0};setHistoryVersion(v=>v+1);
  },[activeProjectId,projects]);
  const createProject=useCallback(()=>{
    const next:SavedProject={id:crypto.randomUUID(),name:`Project ${projects.length+1}`,geometry:{corners:createPlot(DEFAULT_PLOT_DIMENSIONS_MM).corners},measurements:[],compassRotation:0};
    setProjects(current=>[...current.map(project=>project.id===activeProjectId?{...project,geometry:geometryRef.current,measurements:measurementsRef.current,compassRotation:compassRef.current}:project),next]);
    setActiveProjectId(next.id);geometryRef.current=next.geometry;measurementsRef.current=[];compassRef.current=0;
    setGeometry(next.geometry);setMeasurementsState([]);setCompassRotationState(0);historyRef.current={past:[],future:[],lastAt:0};setHistoryVersion(v=>v+1);
  },[activeProjectId,projects.length]);
  const renameProject=useCallback((name:string)=>{const value=name.trim();if(!value)return;setProjects(current=>current.map(project=>project.id===activeProjectId?{...project,name:value}:project));},[activeProjectId]);
  const deleteProject=useCallback(()=>{
    const remaining=projects.filter(project=>project.id!==activeProjectId);
    if(remaining.length){
      const next=remaining[0];
      setProjects(remaining);setActiveProjectId(next.id);geometryRef.current=next.geometry;measurementsRef.current=next.measurements;compassRef.current=next.compassRotation;
      setGeometry(next.geometry);setMeasurementsState(next.measurements);setCompassRotationState(next.compassRotation);historyRef.current={past:[],future:[],lastAt:0};setHistoryVersion(v=>v+1);return;
    }
    const fresh:SavedProject={id:crypto.randomUUID(),name:"My site plan",geometry:{corners:createPlot(DEFAULT_PLOT_DIMENSIONS_MM).corners},measurements:[],compassRotation:0};
    setProjects([fresh]);setActiveProjectId(fresh.id);geometryRef.current=fresh.geometry;measurementsRef.current=[];compassRef.current=0;
    setGeometry(fresh.geometry);setMeasurementsState([]);setCompassRotationState(0);historyRef.current={past:[],future:[],lastAt:0};setHistoryVersion(v=>v+1);
  },[activeProjectId,projects]);
  const exportProject=useCallback(()=>{
    const current=projects.find(project=>project.id===activeProjectId);
    return {format:EXPORT_FORMAT,version:1,exportedAt:new Date().toISOString(),project:{...(current??{id:activeProjectId,name:"Site plan"}),geometry:geometryRef.current,measurements:measurementsRef.current,compassRotation:compassRef.current}};
  },[activeProjectId,projects]);
  const importProject=useCallback((value:unknown)=>{
    if(!value||typeof value!=="object")return false;
    const payload=value as Record<string,unknown>;
    if(payload.format!==EXPORT_FORMAT||payload.version!==1||!isSavedProject(payload.project))return false;
    const source=payload.project;
    const imported:SavedProject={...source,id:crypto.randomUUID(),name:`${source.name} (import)`};
    setProjects(current=>[...current.map(project=>project.id===activeProjectId?{...project,geometry:geometryRef.current,measurements:measurementsRef.current,compassRotation:compassRef.current}:project),imported]);
    setActiveProjectId(imported.id);geometryRef.current=imported.geometry;measurementsRef.current=imported.measurements;compassRef.current=imported.compassRotation;
    setGeometry(imported.geometry);setMeasurementsState(imported.measurements);setCompassRotationState(imported.compassRotation);historyRef.current={past:[],future:[],lastAt:0};setHistoryVersion(v=>v+1);
    return true;
  },[activeProjectId]);

  const commitGeometry = useCallback((update:(current:PlotGeometry)=>PlotGeometry) => {
    const now=Date.now();
    const newGroup=now-historyRef.current.lastAt>500;
    if(newGroup) setHistoryVersion(v=>v+1);
    historyRef.current.lastAt=now;
    historyRef.current.future=[];
    setGeometry(current => {
      if(newGroup) {
        historyRef.current.past=[...historyRef.current.past.slice(-99),current];
      }
      const next=update(current); geometryRef.current=next; return next;
    });
  },[]);
  const undo = useCallback(() => {
    const history=historyRef.current;if(!history.past.length)return;
    const previous=history.past[history.past.length-1];
    historyRef.current={past:history.past.slice(0,-1),future:[geometryRef.current,...history.future],lastAt:0};
    geometryRef.current=previous;setGeometry(previous);setHistoryVersion(v=>v+1);
  },[]);
  const redo = useCallback(() => {
    const history=historyRef.current;if(!history.future.length)return;
    const next=history.future[0];
    historyRef.current={past:[...history.past,geometryRef.current],future:history.future.slice(1),lastAt:0};
    geometryRef.current=next;setGeometry(next);setHistoryVersion(v=>v+1);
  },[]);

  const updateCornerPosition = useCallback((cornerId: string, point: Point) => {
    commitGeometry((current) => ({
      ...current,
      corners: current.corners.map((corner) =>
        corner.id === cornerId ? { ...corner, x: point.x, y: point.y } : corner,
      ),
    }));
  }, [commitGeometry]);

  const isInside = (x: number, y: number, width: number, height: number, corners: PlotCorner[]) => {
    return [[x,y],[x+width,y],[x+width,y+height],[x,y+height]].every(([px,py]) => {
      let inside = false;
      for (let i=0,j=corners.length-1;i<corners.length;j=i++) {
        const a=corners[i], b=corners[j];
        if (((a.y>py!) !== (b.y>py!)) && px! < (b.x-a.x)*(py!-a.y)/(b.y-a.y)+a.x) inside=!inside;
      }
      return inside;
    });
  };
  const updateBuildingPosition = useCallback((point: Point) => {
    commitGeometry(current => {
      const b=current.building ?? building;
      const x=point.x-b.width/2, y=point.y-b.height/2;
      return isInside(x,y,b.width,b.height,current.corners) ? {...current,building:{...b,x,y}} : current;
    });
  }, [building.x, building.y, building.width, building.height, commitGeometry]);
  const updateBuildingSize = useCallback((width: number, height: number) => {
    commitGeometry(current => {
      const b=current.building ?? building;
      const next={...b,width:Math.max(100,width),height:Math.max(100,height)};
      return isInside(next.x,next.y,next.width,next.height,current.corners) ? {...current,building:next} : current;
    });
  }, [building.x, building.y, building.width, building.height, commitGeometry]);

  const addRoom = useCallback((room: Omit<Room, "id">) => commitGeometry(current => {
    const existing = current.rooms ?? [];
    const next = { ...room, id: crypto.randomUUID() };
    if (isInside(next.x, next.y, next.width, next.height, current.corners)) return { ...current, rooms: [...existing, next] };
    const minX=Math.min(...current.corners.map(c=>c.x)), maxX=Math.max(...current.corners.map(c=>c.x));
    const minY=Math.min(...current.corners.map(c=>c.y)), maxY=Math.max(...current.corners.map(c=>c.y));
    const step=1000;
    for(let y=minY;y+next.height<=maxY;y+=step) for(let x=minX;x+next.width<=maxX;x+=step) {
      if(isInside(x,y,next.width,next.height,current.corners)) return {...current,rooms:[...existing,{...next,x,y}]};
    }
    return current;
  }), [building.x, building.y, building.width, building.height, commitGeometry]);
  const moveRoom = useCallback((id: string, point: Point) => commitGeometry(current => {
    const existing = current.rooms ?? [];
    return { ...current, rooms: existing.map(room => {
      if (room.id !== id) return room;
      const x = point.x - room.width / 2, y = point.y - room.height / 2;
      return isInside(x, y, room.width, room.height, current.corners) ? { ...room, x, y } : room;
    }) };
  }), [building.x, building.y, building.width, building.height, commitGeometry]);
  const moveFloorPlan = useCallback((delta:Point) => commitGeometry(current=>{
    const rooms=current.rooms ?? [];
    const moved=rooms.map(room=>({...room,x:room.x+delta.x,y:room.y+delta.y}));
    return moved.every(room=>isInside(room.x,room.y,room.width,room.height,current.corners)) ? {...current,rooms:moved} : current;
  }),[commitGeometry]);
  const resizeRoom = useCallback((id: string, x: number, y: number, width: number, height: number) => commitGeometry(current => {
    const existing = current.rooms ?? [];
    return { ...current, rooms: existing.map(room => room.id !== id ? room : isInside(x, y, width, height, current.corners) ? { ...room, x, y, width, height } : room) };
  }), [building.x, building.y, building.width, building.height, commitGeometry]);
  const removeRoom = useCallback((id: string) => commitGeometry(current => ({ ...current, rooms: (current.rooms ?? []).filter(room => room.id !== id), openings:(current.openings ?? []).filter(item=>item.roomId!==id) })), [commitGeometry]);
  const addOpening = useCallback((roomId:string,type:PlanOpening["type"],side:WallSide) => commitGeometry(current=>{
    const room=(current.rooms ?? []).find(item=>item.id===roomId);if(!room)return current;
    const width=(type==="door"?3:4)*304.8;
    const wallLength=side==="top"||side==="bottom"?room.width:room.height;
    if(wallLength<width)return current;
    const opening:PlanOpening={id:crypto.randomUUID(),roomId,type,side,width,offset:(wallLength-width)/2};
    return {...current,openings:[...(current.openings??[]),opening]};
  }),[commitGeometry]);
  const removeOpening=useCallback((id:string)=>commitGeometry(current=>({...current,openings:(current.openings??[]).filter(item=>item.id!==id)})),[commitGeometry]);
  const removeFloorPlan=useCallback(()=>commitGeometry(current=>({...current,rooms:[],openings:[]})),[commitGeometry]);
  const applyFloorPlanPreset=useCallback((preset:FloorPlanPreset,targetAreaSqMm?:number)=>{
    const layouts:Record<FloorPlanPreset,Array<{name:string;x:number;y:number;width:number;height:number;kind?:RoomKind}>>={
      "1bhk":[{name:"Living & dining",x:0,y:0,width:16,height:12},{name:"Kitchen",x:16,y:0,width:9,height:8},{name:"Balcony",x:25,y:0,width:4,height:8},{name:"Foyer",x:0,y:12,width:6,height:6},{name:"Bedroom",x:6,y:12,width:11,height:11},{name:"Passage",x:17,y:8,width:5,height:4},{name:"Bathroom",x:17,y:12,width:5,height:8}],
      "2bhk":[{name:"Living room",x:0,y:0,width:17,height:13},{name:"Kitchen",x:17,y:0,width:9,height:9},{name:"Balcony",x:26,y:0,width:4,height:6},{name:"Dining",x:17,y:9,width:9,height:8},{name:"Master bedroom",x:0,y:13,width:12,height:14},{name:"Foyer",x:12,y:13,width:5,height:8},{name:"Bathroom 1",x:12,y:21,width:5,height:8},{name:"Bedroom 2",x:17,y:17,width:11,height:12},{name:"Bathroom 2",x:28,y:17,width:5,height:8}],
      "3bhk":[{name:"Living room",x:0,y:0,width:18,height:16},{name:"Kitchen",x:18,y:0,width:10,height:10},{name:"Dining",x:18,y:10,width:10,height:8},{name:"Balcony",x:28,y:0,width:4,height:6},{name:"Utility",x:28,y:6,width:6,height:4},{name:"Master bedroom",x:0,y:16,width:13,height:14},{name:"Foyer",x:13,y:16,width:5,height:4},{name:"Master bathroom",x:13,y:20,width:5,height:8},{name:"Bedroom 2",x:18,y:16,width:11,height:12},{name:"Bedroom 3",x:18,y:28,width:11,height:12},{name:"Common bathroom",x:13,y:28,width:5,height:8}],
    };
    let raw=layouts[preset].map(item=>({...item,x:item.x*304.8,y:item.y*304.8,width:item.width*304.8,height:item.height*304.8}));
    const areaScale=targetAreaSqMm && targetAreaSqMm>0 ? Math.sqrt(targetAreaSqMm/rectanglesArea(raw)) : 1;
    raw=raw.map(item=>({...item,x:item.x*areaScale,y:item.y*areaScale,width:item.width*areaScale,height:item.height*areaScale}));
    const minX=Math.min(...geometry.corners.map(c=>c.x)),maxX=Math.max(...geometry.corners.map(c=>c.x));
    const minY=Math.min(...geometry.corners.map(c=>c.y)),maxY=Math.max(...geometry.corners.map(c=>c.y));
    const planWidth=Math.max(...raw.map(r=>r.x+r.width)),planHeight=Math.max(...raw.map(r=>r.y+r.height));
    let placed:Room[]|null=null;
    for(let y=minY;y+planHeight<=maxY&&!placed;y+=400)for(let x=minX;x+planWidth<=maxX&&!placed;x+=400){
      const candidate=raw.map((room,index)=>({...room,id:`${preset}-${index}-${crypto.randomUUID()}`,x:x+room.x,y:y+room.y}));
      if(candidate.every(room=>isInside(room.x,room.y,room.width,room.height,geometry.corners)))placed=candidate;
    }
    if(!placed)return false;
    const openingSpecs:[number,PlanOpening["type"],WallSide][]=preset==="1bhk"
      ? [[0,"door","top"],[4,"door","top"],[6,"door","left"],[6,"door","top"],[0,"window","left"],[4,"window","bottom"]]
      : preset==="2bhk"
        ? [[0,"door","top"],[4,"door","top"],[7,"door","top"],[6,"door","left"],[8,"door","left"],[0,"window","left"],[4,"window","bottom"],[7,"window","bottom"]]
        : [[0,"door","top"],[5,"door","top"],[8,"door","top"],[9,"door","top"],[7,"door","left"],[10,"door","right"],[0,"window","left"],[5,"window","bottom"],[9,"window","bottom"]];
    const nextOpenings=openingSpecs.filter(([roomIndex])=>placed![roomIndex]).map(([roomIndex,type,side])=>{
      const room=placed![roomIndex],length=side==="top"||side==="bottom"?room.width:room.height,width=type==="door"?3*304.8:4*304.8;
      return {id:crypto.randomUUID(),roomId:room.id,type,side,offset:(length-width*areaScale)/2,width:width*areaScale} as PlanOpening;
    });
    commitGeometry(current=>({...current,rooms:placed!,openings:nextOpenings}));
    return true;
  },[commitGeometry,geometry.corners]);

  const updateEdgeDimension = useCallback(
    (edgeName: PlotEdgeName, lengthMm: number) => {
      commitGeometry((current) => {
        const edgeByName: Record<PlotEdgeName, [string, string]> = {
          top: ["corner-tl", "corner-tr"],
          right: ["corner-tr", "corner-br"],
          bottom: ["corner-bl", "corner-br"],
          left: ["corner-tl", "corner-bl"],
        };
        const [startId, endId] = edgeByName[edgeName];
        const start = current.corners.find((corner) => corner.id === startId)!;
        const end = current.corners.find((corner) => corner.id === endId)!;
        const currentLength = Math.hypot(end.x - start.x, end.y - start.y);
        const directionX = currentLength > 0 ? (end.x - start.x) / currentLength : 1;
        const directionY = currentLength > 0 ? (end.y - start.y) / currentLength : 0;
        return {
          ...current,
          corners: current.corners.map((corner) =>
            corner.id === endId
              ? {
                  ...corner,
                  x: start.x + directionX * lengthMm,
                  y: start.y + directionY * lengthMm,
                }
              : corner,
          ),
        };
      });
    },
    [commitGeometry],
  );

  const resetPlot = useCallback(() => {
    commitGeometry(() => ({ corners: createPlot(DEFAULT_PLOT_DIMENSIONS_MM).corners }));
    setSelectedEdgeId(null);
    setSelectedCornerId(null);
  }, [commitGeometry]);

  return (
    <PlotContext.Provider
      value={{
        plot,
        dimensions,
        metrics,
        building,
        rooms,
        openings,
        measurements,
        setMeasurements,
        compassRotation,
        rotateCompass,
        resetCompass,
        projects,
        activeProjectId,
        activeProjectName:projects.find(project=>project.id===activeProjectId)?.name??"Site plan",
        switchProject,
        createProject,
        renameProject,
        deleteProject,
        exportProject,
        importProject,
        selectedEdgeId,
        selectedCornerId,
        updateEdgeDimension,
        updateCornerPosition,
        updateBuildingPosition,
        updateBuildingSize,
        addRoom,
        moveRoom,
        moveFloorPlan,
        resizeRoom,
        removeRoom,
        addOpening,
        removeOpening,
        removeFloorPlan,
        applyFloorPlanPreset,
        canUndo:historyRef.current.past.length>0,
        canRedo:historyRef.current.future.length>0,
        undo,
        redo,
        resetPlot,
        selectEdge: setSelectedEdgeId,
        selectCorner: setSelectedCornerId,
      }}
    >
      {children}
    </PlotContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePlot() {
  const context = useContext(PlotContext);
  if (!context) {
    throw new Error("usePlot must be used within a PlotProvider");
  }
  return context;
}
