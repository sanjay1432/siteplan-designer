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
import { offsetPolygonInward } from "./setback";

export type RoomKind = "room" | "stairs";
export type WallSide = "top" | "right" | "bottom" | "left";
export interface Room { id: string; name: string; x: number; y: number; width: number; height: number; kind?: RoomKind }
export interface PlanOpening { id:string; roomId:string; type:"door"|"window"; side:WallSide; offset:number; width:number }
export interface FloorPlanLevel { id:string; name:string; rooms:Room[]; openings:PlanOpening[] }
export type FloorPlanPreset = "1bhk" | "2bhk" | "3bhk";
export interface MeasurementLine { start:Point; end:Point }
export interface PlotGeometry { corners:PlotCorner[]; building?:{x:number;y:number;width:number;height:number}; setbackMm?:number; rooms?:Room[]; openings?:PlanOpening[]; groundPlan?:FloorPlanLevel; floors?:FloorPlanLevel[]; activeFloorId?:string }
export interface SavedProject { id:string; name:string; geometry:PlotGeometry; measurements:MeasurementLine[]; compassRotation:number }

const EXPORT_FORMAT = "siteplan-designer-project";

interface PlotContextValue {
  plot: Plot;
  dimensions: PlotDimensions;
  metrics: PlotMetrics;
  building: { x: number; y: number; width: number; height: number };
  setbackMm:number;
  setSetbackMm:(distance:number)=>boolean;
  rooms: Room[];
  openings: PlanOpening[];
  floorPlans:FloorPlanLevel[];
  groundLevel:FloorPlanLevel;
  activeFloorId:string;
  setActiveFloor:(id:string)=>void;
  addFloor:()=>void;
  duplicateActiveFloor:()=>void;
  renameFloor:(id:string,name:string)=>void;
  removeActiveFloor:()=>void;
  addStairwell:()=>boolean;
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
  moveOpening: (id:string, point:Point) => void;
  removeFloorPlan: () => void;
  applyFloorPlanPreset: (preset:FloorPlanPreset, targetAreaSqMm?:number, vastuInspired?:boolean) => boolean;
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
function isFloorPlan(value:unknown):value is FloorPlanLevel{
  if(!value||typeof value!=="object")return false;
  const plan=value as Record<string,unknown>;
  const validRoom=(value:unknown)=>{
    if(!value||typeof value!=="object")return false;
    const room=value as Record<string,unknown>;
    return typeof room.id==="string"&&typeof room.name==="string"&&[room.x,room.y,room.width,room.height].every(dimension=>typeof dimension==="number"&&Number.isFinite(dimension));
  };
  const validOpening=(value:unknown)=>{
    if(!value||typeof value!=="object")return false;
    const opening=value as Record<string,unknown>;
    return typeof opening.id==="string"&&typeof opening.roomId==="string"&&(opening.type==="door"||opening.type==="window")&&["top","right","bottom","left"].includes(String(opening.side))&&[opening.width,opening.offset].every(dimension=>typeof dimension==="number"&&Number.isFinite(dimension));
  };
  return typeof plan.id==="string"&&typeof plan.name==="string"&&Array.isArray(plan.rooms)&&plan.rooms.every(validRoom)&&Array.isArray(plan.openings)&&plan.openings.every(validOpening);
}
function isSavedProject(value:unknown):value is SavedProject {
  if(!value||typeof value!=="object")return false;const p=value as Record<string,unknown>;
  if(typeof p.id!=="string"||typeof p.name!=="string"||!isPlotGeometry(p.geometry)||!Array.isArray(p.measurements)||typeof p.compassRotation!=="number"||!Number.isFinite(p.compassRotation))return false;
  if(p.measurements.some(line=>!line||typeof line!=="object"||!isPoint((line as Record<string,unknown>).start)||!isPoint((line as Record<string,unknown>).end)))return false;
  const g=p.geometry as PlotGeometry;
  if(g.groundPlan!==undefined&&!isFloorPlan(g.groundPlan))return false;
  if(g.rooms!==undefined&&(!Array.isArray(g.rooms)||g.rooms.some(room=>!room||typeof room.id!=="string"||typeof room.name!=="string"||![room.x,room.y,room.width,room.height].every(n=>typeof n==="number"&&Number.isFinite(n)))))return false;
  if(g.openings!==undefined&&(!Array.isArray(g.openings)||g.openings.some(item=>!item||typeof item.id!=="string"||typeof item.roomId!=="string"||!(item.type==="door"||item.type==="window")||!(["top","right","bottom","left"].includes(item.side))||![item.width,item.offset].every(n=>typeof n==="number"&&Number.isFinite(n)))))return false;
  if(g.floors!==undefined&&(!Array.isArray(g.floors)||g.floors.some(floor=>!floor||typeof floor.id!=="string"||typeof floor.name!=="string"||!Array.isArray(floor.rooms)||floor.rooms.some(room=>!room||typeof room.id!=="string"||typeof room.name!=="string"||![room.x,room.y,room.width,room.height].every(n=>typeof n==="number"&&Number.isFinite(n)))||!Array.isArray(floor.openings)||floor.openings.some(item=>!item||typeof item.id!=="string"||typeof item.roomId!=="string"||!(item.type==="door"||item.type==="window")||!( ["top","right","bottom","left"].includes(item.side))||![item.width,item.offset].every(n=>typeof n==="number"&&Number.isFinite(n))))))return false;
  return true;
}
function isSavedProjectList(value:unknown):value is SavedProject[]{return Array.isArray(value)&&value.length>0&&value.every(isSavedProject);}

function normalizeFloorGeometry(geometry:PlotGeometry):PlotGeometry{
  const groundPlan=geometry.groundPlan??{id:"ground",name:"Ground · Stilt parking",rooms:[],openings:[]};
  if(geometry.floors?.length){
    if(geometry.activeFloorId==="ground")return {...geometry,groundPlan,rooms:groundPlan.rooms,openings:groundPlan.openings};
    const active=geometry.floors.find(floor=>floor.id===geometry.activeFloorId)??geometry.floors[0];
    return {...geometry,groundPlan,activeFloorId:active.id,rooms:active.rooms,openings:active.openings};
  }
  const id="floor-1";
  return {...geometry,groundPlan,activeFloorId:id,floors:[{id,name:"Floor 1",rooms:geometry.rooms??[],openings:geometry.openings??[]}]};
}

function floorPlansForGeometry(geometry:PlotGeometry):FloorPlanLevel[]{
  const activeId=geometry.activeFloorId??"floor-1";
  const stored=geometry.floors?.length?geometry.floors:[{id:activeId,name:"Floor 1",rooms:geometry.rooms??[],openings:geometry.openings??[]}];
  return stored.map(floor=>floor.id===activeId?{...floor,rooms:geometry.rooms??floor.rooms,openings:geometry.openings??floor.openings}:floor);
}

function allPlansForGeometry(geometry:PlotGeometry):FloorPlanLevel[]{
  const stored=geometry.groundPlan??{id:"ground",name:"Ground · Stilt parking",rooms:[],openings:[]};
  const ground=geometry.activeFloorId==="ground"?{...stored,rooms:geometry.rooms??stored.rooms,openings:geometry.openings??stored.openings}:stored;
  const plans=floorPlansForGeometry(geometry);
  return [ground,...plans];
}

function syncStairwellGeometry(geometry:PlotGeometry,rooms:Room[]):PlotGeometry{
  const activeId=geometry.activeFloorId??"floor-1",stair=rooms.find(room=>room.kind==="stairs");
  if(!stair)return {...geometry,rooms};
  const plans=allPlansForGeometry({...geometry,rooms}).map(floor=>{
    if(floor.id===activeId)return {...floor,rooms};
    const existing=floor.rooms.find(room=>room.kind==="stairs");
    const synchronized={...stair,id:existing?.id??crypto.randomUUID()};
    return {...floor,rooms:existing?floor.rooms.map(room=>room.kind==="stairs"?{...room,x:stair.x,y:stair.y,width:stair.width,height:stair.height}:room):[...floor.rooms,synchronized]};
  });
  const groundPlan=plans[0];
  return {...geometry,rooms,groundPlan,floors:plans.slice(1)};
}

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

function setbackCorners(corners:PlotCorner[],distanceMm:number):PlotCorner[]{
  if(distanceMm<=0)return corners;
  return offsetPolygonInward(corners,distanceMm).map((point,index)=>({...corners[index],x:point.x,y:point.y}));
}
function signedPolygonArea(points:{x:number;y:number}[]):number{
  return points.reduce((sum,point,index)=>{const next=points[(index+1)%points.length];return sum+point.x*next.y-next.x*point.y;},0)/2;
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
  const [geometry, setGeometry] = useState<PlotGeometry>(()=>normalizeFloorGeometry(initialProject.geometry));
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
  const setbackMm=Math.max(0,geometry.setbackMm??0);
  const rooms: Room[] = geometry.rooms ?? [];
  const openings=geometry.openings ?? [];
  const activeFloorId=geometry.activeFloorId??"floor-1";
  const groundLevel=geometry.groundPlan??{id:"ground",name:"Ground · Stilt parking",rooms:[],openings:[]};
  const floorPlans=useMemo(()=>floorPlansForGeometry(geometry),[geometry]);

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
    const nextGeometry=normalizeFloorGeometry(next.geometry);
    setProjects(current=>current.map(project=>project.id===activeProjectId?{...project,geometry:geometryRef.current,measurements:measurementsRef.current,compassRotation:compassRef.current}:project));
    setActiveProjectId(id);geometryRef.current=nextGeometry;measurementsRef.current=next.measurements;compassRef.current=next.compassRotation;
    setGeometry(nextGeometry);setMeasurementsState(next.measurements);setCompassRotationState(next.compassRotation);
    historyRef.current={past:[],future:[],lastAt:0};setHistoryVersion(v=>v+1);
  },[activeProjectId,projects]);
  const createProject=useCallback(()=>{
    const floor:FloorPlanLevel={id:"floor-1",name:"Floor 1",rooms:[],openings:[]};
    const next:SavedProject={id:crypto.randomUUID(),name:`Project ${projects.length+1}`,geometry:{corners:createPlot(DEFAULT_PLOT_DIMENSIONS_MM).corners,rooms:[],openings:[],floors:[floor],activeFloorId:floor.id},measurements:[],compassRotation:0};
    setProjects(current=>[...current.map(project=>project.id===activeProjectId?{...project,geometry:geometryRef.current,measurements:measurementsRef.current,compassRotation:compassRef.current}:project),next]);
    setActiveProjectId(next.id);geometryRef.current=next.geometry;measurementsRef.current=[];compassRef.current=0;
    setGeometry(next.geometry);setMeasurementsState([]);setCompassRotationState(0);historyRef.current={past:[],future:[],lastAt:0};setHistoryVersion(v=>v+1);
  },[activeProjectId,projects.length]);
  const renameProject=useCallback((name:string)=>{const value=name.trim();if(!value)return;setProjects(current=>current.map(project=>project.id===activeProjectId?{...project,name:value}:project));},[activeProjectId]);
  const deleteProject=useCallback(()=>{
    const remaining=projects.filter(project=>project.id!==activeProjectId);
    if(remaining.length){
      const next=remaining[0];
      const nextGeometry=normalizeFloorGeometry(next.geometry);
      setProjects(remaining);setActiveProjectId(next.id);geometryRef.current=nextGeometry;measurementsRef.current=next.measurements;compassRef.current=next.compassRotation;
      setGeometry(nextGeometry);setMeasurementsState(next.measurements);setCompassRotationState(next.compassRotation);historyRef.current={past:[],future:[],lastAt:0};setHistoryVersion(v=>v+1);return;
    }
    const floor:FloorPlanLevel={id:"floor-1",name:"Floor 1",rooms:[],openings:[]};
    const fresh:SavedProject={id:crypto.randomUUID(),name:"My site plan",geometry:{corners:createPlot(DEFAULT_PLOT_DIMENSIONS_MM).corners,rooms:[],openings:[],floors:[floor],activeFloorId:floor.id},measurements:[],compassRotation:0};
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
    const imported:SavedProject={...source,id:crypto.randomUUID(),name:`${source.name} (import)`,geometry:normalizeFloorGeometry(source.geometry)};
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
      let next=update(current);
      if(current.activeFloorId==="ground"&&next.activeFloorId==="ground"&&(next.rooms!==current.rooms||next.openings!==current.openings)){
        const stored=next.groundPlan??{id:"ground",name:"Ground · Stilt parking",rooms:[],openings:[]};
        next={...next,groundPlan:{...stored,rooms:next.rooms??[],openings:next.openings??[]}};
      }
      geometryRef.current=next; return next;
    });
  },[]);
  const setActiveFloor=useCallback((id:string)=>commitGeometry(current=>{
    if(id==="ground"){
      const ground=current.groundPlan??{id:"ground",name:"Ground · Stilt parking",rooms:[],openings:[]};
      return {...current,groundPlan:ground,activeFloorId:"ground",rooms:ground.rooms,openings:ground.openings};
    }
    const plans=floorPlansForGeometry(current),target=plans.find(floor=>floor.id===id);
    if(!target)return current;
    return {...current,floors:plans,activeFloorId:id,rooms:target.rooms,openings:target.openings};
  }),[commitGeometry]);
  const addFloor=useCallback(()=>commitGeometry(current=>{
    const plans=floorPlansForGeometry(current),id=crypto.randomUUID(),next:FloorPlanLevel={id,name:`Floor ${plans.length+1}`,rooms:[],openings:[]};
    return {...current,floors:[...plans,next],activeFloorId:id,rooms:[],openings:[]};
  }),[commitGeometry]);
  const duplicateActiveFloor=useCallback(()=>commitGeometry(current=>{
    const plans=floorPlansForGeometry(current),active=plans.find(floor=>floor.id===(current.activeFloorId??"floor-1"));
    if(!active)return current;
    const id=crypto.randomUUID(),roomIds=new Map(active.rooms.map(room=>[room.id,crypto.randomUUID()]));
    const copy:FloorPlanLevel={id,name:`Floor ${plans.length+1}`,rooms:active.rooms.map(room=>({...room,id:roomIds.get(room.id)!})),openings:active.openings.map(opening=>({...opening,id:crypto.randomUUID(),roomId:roomIds.get(opening.roomId)??opening.roomId}))};
    const index=plans.findIndex(floor=>floor.id===active.id);
    return {...current,floors:[...plans.slice(0,index+1),copy,...plans.slice(index+1)],activeFloorId:id,rooms:copy.rooms,openings:copy.openings};
  }),[commitGeometry]);
  const renameFloor=useCallback((id:string,name:string)=>{
    const value=name.trim();if(!value)return;
    commitGeometry(current=>({...current,floors:floorPlansForGeometry(current).map(floor=>floor.id===id?{...floor,name:value}:floor)}));
  },[commitGeometry]);
  const removeActiveFloor=useCallback(()=>commitGeometry(current=>{
    if(current.activeFloorId==="ground")return current;
    const plans=floorPlansForGeometry(current);if(plans.length<=1)return current;
    const index=plans.findIndex(floor=>floor.id===(current.activeFloorId??"floor-1")),remaining=plans.filter(floor=>floor.id!==(current.activeFloorId??"floor-1")),target=remaining[Math.max(0,index-1)];
    return {...current,floors:remaining,activeFloorId:target.id,rooms:target.rooms,openings:target.openings};
  }),[commitGeometry]);
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

  const isInside = (x: number, y: number, width: number, height: number, corners: PlotCorner[]) => {
    const pointInside=(px:number,py:number)=>{
      let inside = false;
      for (let i=0,j=corners.length-1;i<corners.length;j=i++) {
        const a=corners[i], b=corners[j];
        const cross=(px-a.x)*(b.y-a.y)-(py-a.y)*(b.x-a.x);
        if(Math.abs(cross)<0.1&&px>=Math.min(a.x,b.x)-0.1&&px<=Math.max(a.x,b.x)+0.1&&py>=Math.min(a.y,b.y)-0.1&&py<=Math.max(a.y,b.y)+0.1)return true;
        if (((a.y>py) !== (b.y>py)) && px < (b.x-a.x)*(py-a.y)/(b.y-a.y)+a.x) inside=!inside;
      }
      return inside;
    };
    const rectangle:[[number,number],[number,number],[number,number],[number,number]]=[[x,y],[x+width,y],[x+width,y+height],[x,y+height]];
    if(!rectangle.every(([px,py])=>pointInside(px,py)))return false;
    // A plot boundary crossing the room rectangle means some of the room lies outside,
    // even when all four room corners happen to be inside a concave plot.
    for(let i=0;i<corners.length;i++){
      const a=[corners[i].x,corners[i].y],b=[corners[(i+1)%corners.length].x,corners[(i+1)%corners.length].y];
      if(a[0]>x&&a[0]<x+width&&a[1]>y&&a[1]<y+height)return false;
      for(let j=0;j<rectangle.length;j++){
        const c=rectangle[j],d=rectangle[(j+1)%rectangle.length],denominator=(b[0]-a[0])*(d[1]-c[1])-(b[1]-a[1])*(d[0]-c[0]);
        if(Math.abs(denominator)<1e-9)continue;
        const t=((c[0]-a[0])*(d[1]-c[1])-(c[1]-a[1])*(d[0]-c[0]))/denominator;
        const u=((c[0]-a[0])*(b[1]-a[1])-(c[1]-a[1])*(b[0]-a[0]))/denominator;
        if(t>1e-8&&t<1-1e-8&&u>1e-8&&u<1-1e-8)return false;
      }
    }
    // Check interior points too so a rectangle cannot bridge a concave plot edge.
    for(let row=1;row<5;row++)for(let column=1;column<5;column++)if(!pointInside(x+width*column/5,y+height*row/5))return false;
    return true;
  };
  const allRoomsFit=(geometry:PlotGeometry,corners:PlotCorner[])=>allPlansForGeometry(geometry).every(floor=>floor.rooms.every(room=>isInside(room.x,room.y,room.width,room.height,corners)));
  const updateCornerPosition = useCallback((cornerId: string, point: Point) => {
    commitGeometry(current=>{
      const corners=current.corners.map(corner=>corner.id===cornerId?{...corner,x:point.x,y:point.y}:corner);
      return allRoomsFit(current,setbackCorners(corners,current.setbackMm??0))?{...current,corners}:current;
    });
  }, [commitGeometry,isInside]);
  const addStairwell=useCallback(()=>{
    const plans=allPlansForGeometry(geometry),existing=plans.flatMap(floor=>floor.rooms).find(room=>room.kind==="stairs");
    let shaft=existing;
    if(!shaft){
      const width=7*304.8,height=14*304.8,minX=Math.min(...geometry.corners.map(c=>c.x)),maxX=Math.max(...geometry.corners.map(c=>c.x)),minY=Math.min(...geometry.corners.map(c=>c.y)),maxY=Math.max(...geometry.corners.map(c=>c.y));
      let best:{x:number;y:number;score:number}|null=null;
      const plansRooms=plans.flatMap(floor=>floor.rooms.filter(room=>room.kind!=="stairs"));
      for(let y=minY;y+height<=maxY;y+=600)for(let x=minX;x+width<=maxX;x+=600){
        if(!isInside(x,y,width,height,setbackCorners(geometry.corners,geometry.setbackMm??0)))continue;
        const overlap=plansRooms.reduce((sum,room)=>sum+Math.max(0,Math.min(x+width,room.x+room.width)-Math.max(x,room.x))*Math.max(0,Math.min(y+height,room.y+room.height)-Math.max(y,room.y)),0);
        const centerDistance=Math.hypot(x+width/2-(minX+maxX)/2,y+height/2-(minY+maxY)/2);
        const score=overlap+centerDistance*10;
        if(!best||score<best.score)best={x,y,score};
      }
      if(!best)return false;
      shaft={id:crypto.randomUUID(),name:"Enclosed stairwell",kind:"stairs",x:best.x,y:best.y,width,height};
    }
    const updated=plans.map(floor=>floor.rooms.some(room=>room.kind==="stairs")?floor:{...floor,rooms:[...floor.rooms,{...shaft!,id:crypto.randomUUID()}]});
    const groundPlan=updated[0],floors=updated.slice(1),active=updated.find(floor=>floor.id===activeFloorId)!;
    commitGeometry(current=>({...current,groundPlan,floors,rooms:active.rooms,openings:active.openings}));
    return true;
  },[activeFloorId,commitGeometry,geometry,geometry.corners,geometry.setbackMm,isInside]);
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
  const setSetbackMm=useCallback((distance:number):boolean=>{
    const nextDistance=Number.isFinite(distance)?Math.max(0,distance):0;
    const boundary=setbackCorners(geometryRef.current.corners,nextDistance);
    if(!boundary.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)))return false;
    const originalArea=signedPolygonArea(geometryRef.current.corners),insetArea=signedPolygonArea(boundary);
    if(nextDistance>0&&(Math.sign(originalArea)!==Math.sign(insetArea)||Math.abs(insetArea)<1||Math.abs(insetArea)>=Math.abs(originalArea)))return false;
    if(!allRoomsFit(geometryRef.current,boundary))return false;
    commitGeometry(current=>({...current,setbackMm:nextDistance}));
    return true;
  },[commitGeometry,isInside]);

  const addRoom = useCallback((room: Omit<Room, "id">) => commitGeometry(current => {
    const existing = current.rooms ?? [];
    const next = { ...room, id: crypto.randomUUID() };
    const boundary=setbackCorners(current.corners,current.setbackMm??0);
    if (isInside(next.x, next.y, next.width, next.height, boundary)) {
      const rooms=[...existing,next];return next.kind==="stairs"?syncStairwellGeometry(current,rooms):{...current,rooms};
    }
    const minX=Math.min(...boundary.map(c=>c.x)), maxX=Math.max(...boundary.map(c=>c.x));
    const minY=Math.min(...boundary.map(c=>c.y)), maxY=Math.max(...boundary.map(c=>c.y));
    const step=1000;
    for(let y=minY;y+next.height<=maxY;y+=step) for(let x=minX;x+next.width<=maxX;x+=step) {
      if(isInside(x,y,next.width,next.height,boundary)) {const rooms=[...existing,{...next,x,y}];return next.kind==="stairs"?syncStairwellGeometry(current,rooms):{...current,rooms};}
    }
    return current;
  }), [building.x, building.y, building.width, building.height, commitGeometry]);
  const moveRoom = useCallback((id: string, point: Point) => commitGeometry(current => {
    const existing = current.rooms ?? [];
    const rooms=existing.map(room => {
      if (room.id !== id) return room;
      const x = point.x - room.width / 2, y = point.y - room.height / 2;
      return isInside(x, y, room.width, room.height, setbackCorners(current.corners,current.setbackMm??0)) ? { ...room, x, y } : room;
    });
    return existing.find(room=>room.id===id)?.kind==="stairs"?syncStairwellGeometry(current,rooms):{...current,rooms};
  }), [building.x, building.y, building.width, building.height, commitGeometry]);
  const moveFloorPlan = useCallback((delta:Point) => commitGeometry(current=>{
    const rooms=current.rooms ?? [];
    const moved=rooms.map(room=>({...room,x:room.x+delta.x,y:room.y+delta.y}));
    const boundary=setbackCorners(current.corners,current.setbackMm??0);
    return moved.every(room=>isInside(room.x,room.y,room.width,room.height,boundary)) ? (rooms.some(room=>room.kind==="stairs")?syncStairwellGeometry(current,moved):{...current,rooms:moved}) : current;
  }),[commitGeometry]);
  const resizeRoom = useCallback((id: string, x: number, y: number, width: number, height: number) => commitGeometry(current => {
    const existing = current.rooms ?? [];
    const boundary=setbackCorners(current.corners,current.setbackMm??0);
    const rooms=existing.map(room => room.id !== id ? room : isInside(x, y, width, height, boundary) ? { ...room, x, y, width, height } : room);
    return existing.find(room=>room.id===id)?.kind==="stairs"?syncStairwellGeometry(current,rooms):{...current,rooms};
  }), [building.x, building.y, building.width, building.height, commitGeometry]);
  const removeRoom = useCallback((id: string) => commitGeometry(current => {
    const removed=(current.rooms??[]).find(room=>room.id===id),rooms=(current.rooms??[]).filter(room=>room.id!==id),openings=(current.openings??[]).filter(item=>item.roomId!==id);
    if(removed?.kind!=="stairs")return {...current,rooms,openings};
    const plans=allPlansForGeometry(current).map(floor=>({...floor,rooms:floor.rooms.filter(room=>room.kind!=="stairs"),openings:floor.openings.filter(item=>!floor.rooms.some(room=>room.id===item.roomId&&room.kind==="stairs"))}));
    return {...current,rooms,openings,groundPlan:plans[0],floors:plans.slice(1)};
  }), [commitGeometry]);
  const addOpening = useCallback((roomId:string,type:PlanOpening["type"],side:WallSide) => commitGeometry(current=>{
    const room=(current.rooms ?? []).find(item=>item.id===roomId);if(!room)return current;
    const width=(type==="door"?3:4)*304.8;
    const wallLength=side==="top"||side==="bottom"?room.width:room.height;
    if(wallLength<width)return current;
    const opening:PlanOpening={id:crypto.randomUUID(),roomId,type,side,width,offset:(wallLength-width)/2};
    return {...current,openings:[...(current.openings??[]),opening]};
  }),[commitGeometry]);
  const removeOpening=useCallback((id:string)=>commitGeometry(current=>({...current,openings:(current.openings??[]).filter(item=>item.id!==id)})),[commitGeometry]);
  const moveOpening=useCallback((id:string,point:Point)=>commitGeometry(current=>{
    const opening=(current.openings??[]).find(item=>item.id===id),room=(current.rooms??[]).find(item=>item.id===opening?.roomId);
    if(!opening||!room)return current;
    const candidates=([ 
      ["top",Math.abs(point.y-room.y),Math.max(0,Math.min(room.width-opening.width,point.x-room.x-opening.width/2))],
      ["bottom",Math.abs(point.y-(room.y+room.height)),Math.max(0,Math.min(room.width-opening.width,point.x-room.x-opening.width/2))],
      ["left",Math.abs(point.x-room.x),Math.max(0,Math.min(room.height-opening.width,point.y-room.y-opening.width/2))],
      ["right",Math.abs(point.x-(room.x+room.width)),Math.max(0,Math.min(room.height-opening.width,point.y-room.y-opening.width/2))],
    ] as [WallSide,number,number][]).filter(([side])=>opening.width<=(side==="top"||side==="bottom"?room.width:room.height));
    const [side,,offset]=candidates.sort((a,b)=>a[1]-b[1])[0]??[opening.side,0,opening.offset];
    return {...current,openings:(current.openings??[]).map(item=>item.id===id?{...item,side,offset}:item)};
  }),[commitGeometry]);
  const removeFloorPlan=useCallback(()=>commitGeometry(current=>({...current,rooms:(current.rooms??[]).filter(room=>room.kind==="stairs"),openings:(current.openings??[]).filter(opening=>(current.rooms??[]).some(room=>room.id===opening.roomId&&room.kind==="stairs"))})),[commitGeometry]);
  const applyFloorPlanPreset=useCallback((preset:FloorPlanPreset,targetAreaSqMm?:number,vastuInspired=false)=>{
    const layouts:Record<FloorPlanPreset,Array<{name:string;x:number;y:number;width:number;height:number;kind?:RoomKind}>>={
      "1bhk":[{name:"Living & dining",x:0,y:0,width:16,height:12},{name:"Kitchen",x:16,y:0,width:9,height:8},{name:"Balcony",x:25,y:0,width:4,height:8},{name:"Foyer",x:0,y:12,width:6,height:6},{name:"Bedroom",x:6,y:12,width:11,height:11},{name:"Passage",x:17,y:8,width:5,height:4},{name:"Bathroom",x:17,y:12,width:5,height:8}],
      "2bhk":[{name:"Living room",x:0,y:0,width:17,height:13},{name:"Kitchen",x:17,y:0,width:9,height:9},{name:"Balcony",x:26,y:0,width:4,height:6},{name:"Dining",x:17,y:9,width:9,height:8},{name:"Master bedroom",x:0,y:13,width:12,height:14},{name:"Foyer",x:12,y:13,width:5,height:8},{name:"Bathroom 1",x:12,y:21,width:5,height:8},{name:"Bedroom 2",x:17,y:17,width:11,height:12},{name:"Bathroom 2",x:28,y:17,width:5,height:8}],
      "3bhk":[{name:"Living room",x:0,y:0,width:18,height:16},{name:"Kitchen",x:18,y:0,width:10,height:10},{name:"Dining",x:18,y:10,width:10,height:8},{name:"Balcony",x:28,y:0,width:4,height:6},{name:"Utility",x:28,y:6,width:6,height:4},{name:"Master bedroom",x:0,y:16,width:13,height:14},{name:"Foyer",x:13,y:16,width:5,height:4},{name:"Master bathroom",x:13,y:20,width:5,height:8},{name:"Bedroom 2",x:18,y:16,width:11,height:12},{name:"Bedroom 3",x:18,y:28,width:11,height:12},{name:"Common bathroom",x:13,y:28,width:5,height:8}],
    };
    const vastuLayouts:Record<FloorPlanPreset,Array<{name:string;x:number;y:number;width:number;height:number;kind?:RoomKind}>>={
      "1bhk":[{name:"Living & dining",x:10,y:0,width:18,height:12},{name:"Prayer room",x:28,y:0,width:6,height:6},{name:"Kitchen",x:24,y:12,width:10,height:10},{name:"Dining",x:14,y:12,width:10,height:8},{name:"Foyer",x:6,y:12,width:8,height:8},{name:"Bathroom",x:0,y:12,width:6,height:8},{name:"Master bedroom",x:0,y:20,width:14,height:10}],
      "2bhk":[{name:"Living room",x:10,y:0,width:18,height:12},{name:"Prayer room",x:28,y:0,width:6,height:6},{name:"Kitchen",x:24,y:12,width:10,height:10},{name:"Dining",x:14,y:12,width:10,height:8},{name:"Foyer",x:6,y:12,width:8,height:8},{name:"Bathroom 1",x:0,y:12,width:6,height:8},{name:"Master bedroom",x:0,y:20,width:14,height:14},{name:"Bedroom 2",x:14,y:20,width:12,height:14},{name:"Bathroom 2",x:26,y:22,width:8,height:8}],
      "3bhk":[{name:"Bedroom 2",x:0,y:0,width:14,height:12},{name:"Living room",x:14,y:0,width:18,height:12},{name:"Prayer room",x:32,y:0,width:6,height:6},{name:"Bathroom 1",x:0,y:12,width:6,height:8},{name:"Foyer",x:6,y:12,width:8,height:8},{name:"Dining",x:14,y:12,width:10,height:8},{name:"Kitchen",x:24,y:12,width:12,height:10},{name:"Master bedroom",x:0,y:20,width:14,height:14},{name:"Bedroom 3",x:14,y:20,width:12,height:14},{name:"Bathroom 2",x:26,y:22,width:8,height:8},{name:"Utility",x:36,y:12,width:6,height:6}],
    };
    let raw=(vastuInspired?vastuLayouts[preset]:layouts[preset]).map(item=>({...item,x:item.x*304.8,y:item.y*304.8,width:item.width*304.8,height:item.height*304.8}));
    const areaScale=targetAreaSqMm && targetAreaSqMm>0 ? Math.sqrt(targetAreaSqMm/rectanglesArea(raw)) : 1;
    raw=raw.map(item=>({...item,x:item.x*areaScale,y:item.y*areaScale,width:item.width*areaScale,height:item.height*areaScale}));
    let vastuQuarterTurns=0;
    if(vastuInspired){
      vastuQuarterTurns=((Math.round(compassRotation/90)%4)+4)%4;
      const width=Math.max(...raw.map(item=>item.x+item.width)),height=Math.max(...raw.map(item=>item.y+item.height));
      raw=raw.map(item=>{
        if(vastuQuarterTurns===1)return {...item,x:height-item.y-item.height,y:item.x,width:item.height,height:item.width};
        if(vastuQuarterTurns===2)return {...item,x:width-item.x-item.width,y:height-item.y-item.height};
        if(vastuQuarterTurns===3)return {...item,x:item.y,y:width-item.x-item.width,width:item.height,height:item.width};
        return item;
      });
    }
    const minX=Math.min(...geometry.corners.map(c=>c.x)),maxX=Math.max(...geometry.corners.map(c=>c.x));
    const minY=Math.min(...geometry.corners.map(c=>c.y)),maxY=Math.max(...geometry.corners.map(c=>c.y));
    const planWidth=Math.max(...raw.map(r=>r.x+r.width)),planHeight=Math.max(...raw.map(r=>r.y+r.height));
    let placed:Room[]|null=null;
    const xCandidates:number[]=[],yCandidates:number[]=[];
    for(let x=minX;x+planWidth<=maxX;x+=300)xCandidates.push(x);
    for(let y=minY;y+planHeight<=maxY;y+=300)yCandidates.push(y);
    const centerX=(minX+maxX-planWidth)/2,centerY=(minY+maxY-planHeight)/2;
    xCandidates.sort((a,b)=>Math.abs(a-centerX)-Math.abs(b-centerX));
    yCandidates.sort((a,b)=>Math.abs(a-centerY)-Math.abs(b-centerY));
    for(const y of yCandidates){
      for(const x of xCandidates){
        const candidate=raw.map((room,index)=>({...room,id:`${preset}-${index}-${crypto.randomUUID()}`,x:x+room.x,y:y+room.y}));
        if(candidate.every(room=>isInside(room.x,room.y,room.width,room.height,setbackCorners(geometry.corners,geometry.setbackMm??0)))) {placed=candidate;break;}
      }
      if(placed)break;
    }
    if(!placed)return false;
    const openingSpecs:[number,PlanOpening["type"],WallSide][]=vastuInspired
      ? preset==="1bhk"
        ? [[0,"door","top"],[1,"door","left"],[2,"door","left"],[3,"door","top"],[4,"door","right"],[5,"door","bottom"],[6,"door","top"],[0,"window","left"],[6,"window","bottom"]]
        : preset==="2bhk"
          ? [[0,"door","top"],[1,"door","left"],[2,"door","left"],[3,"door","top"],[4,"door","right"],[5,"door","bottom"],[6,"door","top"],[7,"door","top"],[8,"door","left"],[0,"window","left"],[6,"window","right"],[7,"window","bottom"]]
          : [[1,"door","top"],[2,"door","left"],[4,"door","right"],[5,"door","top"],[6,"door","left"],[7,"door","top"],[8,"door","top"],[9,"door","left"],[0,"window","top"],[7,"window","bottom"],[8,"window","bottom"]]
      : preset==="1bhk"
      ? [[0,"door","top"],[4,"door","top"],[6,"door","left"],[6,"door","top"],[0,"window","left"],[4,"window","bottom"]]
      : preset==="2bhk"
        ? [[0,"door","top"],[4,"door","top"],[7,"door","top"],[6,"door","left"],[8,"door","left"],[0,"window","left"],[4,"window","bottom"],[7,"window","bottom"]]
        : [[0,"door","top"],[5,"door","top"],[8,"door","top"],[9,"door","top"],[7,"door","left"],[10,"door","right"],[0,"window","left"],[5,"window","bottom"],[9,"window","bottom"]];
    const sideAfterTurn=(side:WallSide)=>{
      let result=side;
      for(let turn=0;turn<vastuQuarterTurns;turn++)result=({top:"right",right:"bottom",bottom:"left",left:"top"} as Record<WallSide,WallSide>)[result];
      return result;
    };
    const nextOpenings=openingSpecs.filter(([roomIndex])=>placed![roomIndex]).map(([roomIndex,type,originalSide])=>{
      const side=sideAfterTurn(originalSide);
      const room=placed![roomIndex],length=side==="top"||side==="bottom"?room.width:room.height,width=Math.min(type==="door"?3*304.8:4*304.8,length*.72);
      if(length<600)return null;
      return {id:crypto.randomUUID(),roomId:room.id,type,side,offset:(length-width)/2,width} as PlanOpening;
    }).filter((opening):opening is PlanOpening=>opening!==null);
    const pairedOpenings=[...nextOpenings];
    for(const opening of nextOpenings.filter(item=>item.type==="door")){
      const room=placed.find(item=>item.id===opening.roomId);if(!room)continue;
      for(const other of placed){
        if(other.id===room.id)continue;
        let opposing:WallSide|null=null,start=0,neighborStart=0,neighborEnd=0;
        if(opening.side==="top"&&Math.abs(other.y+other.height-room.y)<1){opposing="bottom";start=room.x+opening.offset;neighborStart=other.x;neighborEnd=other.x+other.width;}
        else if(opening.side==="bottom"&&Math.abs(other.y-(room.y+room.height))<1){opposing="top";start=room.x+opening.offset;neighborStart=other.x;neighborEnd=other.x+other.width;}
        else if(opening.side==="left"&&Math.abs(other.x+other.width-room.x)<1){opposing="right";start=room.y+opening.offset;neighborStart=other.y;neighborEnd=other.y+other.height;}
        else if(opening.side==="right"&&Math.abs(other.x-(room.x+room.width))<1){opposing="left";start=room.y+opening.offset;neighborStart=other.y;neighborEnd=other.y+other.height;}
        if(!opposing||start<neighborStart-1||start+opening.width>neighborEnd+1)continue;
        const offset=start-neighborStart;
        if(!pairedOpenings.some(item=>item.roomId===other.id&&item.side===opposing&&Math.abs(item.offset-offset)<1))pairedOpenings.push({id:crypto.randomUUID(),roomId:other.id,type:"door",side:opposing,offset,width:opening.width});
        break;
      }
    }
    const stairRooms=rooms.filter(room=>room.kind==="stairs"),stairIds=new Set(stairRooms.map(room=>room.id));
    const generatedRooms=[...placed!,...stairRooms],generatedOpenings=[...pairedOpenings,...openings.filter(opening=>stairIds.has(opening.roomId))];
    commitGeometry(current=>syncStairwellGeometry({...current,openings:generatedOpenings},generatedRooms));
    return true;
  },[commitGeometry,compassRotation,geometry.corners,openings,rooms]);

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
        const corners=current.corners.map((corner) =>
            corner.id === endId
              ? {
                  ...corner,
                  x: start.x + directionX * lengthMm,
                  y: start.y + directionY * lengthMm,
                }
              : corner,
          );
        return allRoomsFit(current,setbackCorners(corners,current.setbackMm??0))?{...current,corners}:current;
      });
    },
    [commitGeometry,isInside],
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
        setbackMm,
        setSetbackMm,
        rooms,
        openings,
        floorPlans,
        groundLevel,
        activeFloorId,
        setActiveFloor,
        addFloor,
        duplicateActiveFloor,
        renameFloor,
        removeActiveFloor,
        addStairwell,
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
        moveOpening,
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
