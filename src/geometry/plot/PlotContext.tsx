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
import { rectangularSetback } from "./setback";
import { validateBoundary } from "./boundary";
import { createProjectCollectionDocument, createProjectDocument, getAttachedRoomWallSegments, getRoomWallInset, isProjectCollectionDocumentV2, isProjectDocumentV1, isProjectDocumentV2, savedProjectFromDocumentV2 } from "./model";
import type { FloorPlanLevel, FloorPlanPreset, MeasurementLine, PlanObject, PlanObjectKind, PlanOpening, PlotGeometry, ProjectAssumption, ProjectCollectionDocumentV2, ProjectDetails, ProjectIssue, Room, RoomKind, SavedProject, SiteFeature, SiteFeatureKind, SurveyMetadata, WallSide } from "./model";
export { DEFAULT_EXTERIOR_WALL_THICKNESS_MM, DEFAULT_INTERIOR_WALL_THICKNESS_MM, getAttachedRoomWall, getAttachedRoomWallSegments, getRoomWallInset, getRoomWallSegments, getRoomWallThickness } from "./model";
export type { FloorPlanLevel, FloorPlanPreset, MeasurementLine, PlanObject, PlanObjectKind, PlanOpening, PlotGeometry, ProjectAssumption, ProjectCollectionDocumentV2, ProjectDetails, ProjectDocumentV1, ProjectDocumentV2, ProjectIssue, Room, RoomKind, SavedProject, SiteFeature, SiteFeatureKind, SiteFeatureStatus, SurveyMetadata, WallSide } from "./model";

const EXPORT_FORMAT = "siteplan-designer-project";

interface PlotContextValue {
  plot: Plot;
  dimensions: PlotDimensions;
  metrics: PlotMetrics;
  building: { x: number; y: number; width: number; height: number };
  setbackMm:number;
  setbackDistances:Record<PlotEdgeName,number>;
  setSetbackDistance:(edge:PlotEdgeName,distance:number)=>boolean;
  setSetbackDistances:(distances:Record<PlotEdgeName,number>)=>boolean;
  setSetbackMm:(distance:number)=>boolean;
  rooms: Room[];
  siteFeatures:SiteFeature[];
  selectedSiteFeatureId:string|null;
  selectSiteFeature:(id:string|null)=>void;
  addSiteFeature:(kind:SiteFeatureKind)=>boolean;
  updateSiteFeature:(id:string,changes:Partial<Omit<SiteFeature,"id"|"kind">>)=>boolean;
  moveSiteFeature:(id:string,center:Point)=>boolean;
  removeSiteFeature:(id:string)=>void;
  openings: PlanOpening[];
  planObjects:PlanObject[];
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
  projectDetails:ProjectDetails;
  updateProjectDetails:(details:Partial<ProjectDetails>)=>void;
  assumptions:ProjectAssumption[];
  issues:ProjectIssue[];
  addProjectIssue:(description:string)=>boolean;
  addProjectAssumption:(description:string,source?:string)=>boolean;
  updateProjectAssumption:(id:string,changes:Partial<Omit<ProjectAssumption,"id">>)=>void;
  removeProjectAssumption:(id:string)=>void;
  switchProject:(id:string)=>void;
  createProject:()=>void;
  renameProject:(name:string)=>void;
  deleteProject:()=>void;
  exportProject:()=>unknown;
  importProject:(value:unknown)=>boolean;
  selectedEdgeId: string | null;
  selectedRoomWall:{roomId:string;side:WallSide}|null;
  selectRoomWall:(roomId:string,side:WallSide)=>void;
  selectedPropertyCardId:string|null;
  selectPropertyCard:(id:string|null)=>void;
  updateRoomWallThickness:(roomId:string,side:WallSide,thicknessMm:number)=>boolean;
  selectedCornerId: string | null;
  updateEdgeLength: (edgeId:string,lengthMm:number)=>boolean;
  splitBoundaryEdge:(edgeId:string)=>boolean;
  removeBoundaryCorner:(cornerId:string)=>boolean;
  surveyMetadata:SurveyMetadata|undefined;
  importSurveyBoundary:(corners:PlotCorner[],survey:Omit<SurveyMetadata,"importedAt">)=>boolean;
  updateCornerPosition: (cornerId: string, point: Point) => void;
  updateBuildingPosition: (point: Point) => void;
  updateBuildingSize: (width: number, height: number) => void;
  addRoom: (room: Omit<Room, "id">) => void;
  moveRoom: (id: string, point: Point) => void;
  moveRoomLabel: (id:string,offset:Point)=>void;
  moveFloorPlan: (delta: Point) => void;
  resizeRoom: (id: string, x: number, y: number, width: number, height: number) => boolean;
  setRoomPoints:(id:string,points:Point[])=>void;
  removeRoom: (id: string) => void;
  renameRoom: (id: string, name: string) => void;
  addOpening: (roomId:string, type:PlanOpening["type"], side:WallSide) => void;
  removeOpening: (id:string) => void;
  moveOpening: (id:string, point:Point) => void;
  addPlanObject:(kind:PlanObjectKind,text?:string)=>void;
  movePlanObject:(id:string,point:Point)=>void;
  removePlanObject:(id:string)=>void;
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
const PROJECTS_STORAGE_KEY = "siteplan-designer:projects:v2";
const LEGACY_PROJECTS_STORAGE_KEY = "siteplan-designer:projects:v1";
const LEGACY_GEOMETRY_KEY = "siteplan-designer:plot-geometry:v2";
const LEGACY_DIMENSIONS_KEY = "siteplan-designer:plot-dimensions:v1";
const CORNER_IDS = ["corner-tl", "corner-tr", "corner-br", "corner-bl"];

function hasValidBoundary(corners:PlotCorner[]):boolean{
  return validateBoundary(corners).valid;
}

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
  const building=geometry.building as Record<string,unknown>|undefined;
  if(building!==undefined&&(!building||typeof building!=="object"||![building.x,building.y,building.width,building.height].every(number=>typeof number==="number"&&Number.isFinite(number))||Number(building.width)<=0||Number(building.height)<=0))return false;
  const corners = geometry.corners;
  if (!Array.isArray(corners) || corners.length<3 || corners.some(item=>!item||typeof item!=="object"||typeof (item as Record<string,unknown>).id!=="string"||typeof (item as Record<string,unknown>).name!=="string"||typeof (item as Record<string,unknown>).x!=="number"||!Number.isFinite((item as Record<string,unknown>).x)||typeof (item as Record<string,unknown>).y!=="number"||!Number.isFinite((item as Record<string,unknown>).y)) || !hasValidBoundary(corners as PlotCorner[])) return false;
  const setbacks=geometry.setbacks as Record<string,unknown>|undefined;
  if(setbacks!==undefined&&(!setbacks||typeof setbacks!=="object"||!["top","right","bottom","left"].every(edge=>setbacks[edge]===undefined||typeof setbacks[edge]==="number"&&Number.isFinite(setbacks[edge])&&Number(setbacks[edge])>=0)))return false;
  const survey=geometry.survey as Record<string,unknown>|undefined;
  if(survey!==undefined&&(!survey||typeof survey!=="object"||typeof survey.sourceFile!=="string"||typeof survey.coordinateReference!=="string"||!["mm","m","ft"].includes(String(survey.coordinateUnit))||typeof survey.originX!=="number"||!Number.isFinite(survey.originX)||typeof survey.originY!=="number"||!Number.isFinite(survey.originY)||typeof survey.importedAt!=="string"||(survey.designBoundaryEditedAt!==undefined&&typeof survey.designBoundaryEditedAt!=="string")||!Array.isArray(survey.sourcePoints)||survey.sourcePoints.some(item=>!item||typeof item!=="object"||typeof (item as Record<string,unknown>).name!=="string"||typeof (item as Record<string,unknown>).x!=="number"||!Number.isFinite((item as Record<string,unknown>).x)||typeof (item as Record<string,unknown>).y!=="number"||!Number.isFinite((item as Record<string,unknown>).y))))return false;
  const features=geometry.siteFeatures;
  if(features!==undefined&&(!Array.isArray(features)||features.some(item=>!item||typeof item!=="object"||typeof item.id!=="string"||typeof item.name!=="string"||!["building-footprint","driveway","parking","walkway","landscape","lawn","tree","utility","easement","other"].includes(item.kind)||!["existing","proposed","removed"].includes(item.status)||(item.visible!==undefined&&typeof item.visible!=="boolean")||![item.x,item.y,item.width,item.height].every(value=>typeof value==="number"&&Number.isFinite(value))||item.width<=0||item.height<=0)))return false;
  return true;
}

function isPoint(value:unknown):value is Point {
  if(!value||typeof value!=="object")return false;const p=value as Record<string,unknown>;
  return typeof p.x==="number"&&Number.isFinite(p.x)&&typeof p.y==="number"&&Number.isFinite(p.y);
}
function isRoom(value:unknown):value is Room{
  if(!value||typeof value!=="object")return false;
  const room=value as Record<string,unknown>,walls=room.wallThicknesses as Record<string,unknown>|undefined;
  return typeof room.id==="string"&&typeof room.name==="string"&&room.name.trim().length>0&&(room.kind===undefined||room.kind==="room"||room.kind==="stairs"||room.kind==="lawn")&&(room.labelOffset===undefined||!!room.labelOffset&&typeof room.labelOffset.x==="number"&&Number.isFinite(room.labelOffset.x)&&typeof room.labelOffset.y==="number"&&Number.isFinite(room.labelOffset.y))&&[room.x,room.y,room.width,room.height].every(dimension=>typeof dimension==="number"&&Number.isFinite(dimension))&&Number(room.width)>0&&Number(room.height)>0&&
    (walls===undefined||!!walls&&["top","right","bottom","left"].every(side=>walls[side]===undefined||typeof walls[side]==="number"&&Number.isFinite(walls[side])&&Number(walls[side])>=0));
}
function isPlanObject(value:unknown):value is PlanObject{
  if(!value||typeof value!=="object")return false;
  const item=value as Record<string,unknown>;
  return typeof item.id==="string"&&["dining-table","chair","vent-window","sofa","text"].includes(String(item.kind))&&[item.x,item.y,item.width,item.height].every(n=>typeof n==="number"&&Number.isFinite(n))&&Number(item.width)>0&&Number(item.height)>0&&(item.kind!=="text"||typeof item.text==="string");
}
function openingsFitRooms(openings:unknown[],rooms:Room[]):boolean{
  return openings.every(value=>{
    if(!value||typeof value!=="object")return false;
    const opening=value as Record<string,unknown>;
    if(typeof opening.id!=="string"||typeof opening.roomId!=="string"||(opening.type!=="door"&&opening.type!=="window")||!( ["top","right","bottom","left"] as string[]).includes(String(opening.side))||typeof opening.width!=="number"||!Number.isFinite(opening.width)||opening.width<=0||typeof opening.offset!=="number"||!Number.isFinite(opening.offset)||opening.offset<0)return false;
    const room=rooms.find(item=>item.id===opening.roomId);if(!room)return false;
    const wallLength=opening.side==="top"||opening.side==="bottom"?room.width:room.height;
    return opening.offset+opening.width<=wallLength+1;
  });
}
function isFloorPlan(value:unknown):value is FloorPlanLevel{
  if(!value||typeof value!=="object")return false;
  const plan=value as Record<string,unknown>;
  return typeof plan.id==="string"&&typeof plan.name==="string"&&Array.isArray(plan.rooms)&&plan.rooms.every(isRoom)&&Array.isArray(plan.openings)&&openingsFitRooms(plan.openings,plan.rooms as Room[])&&(plan.objects===undefined||Array.isArray(plan.objects)&&plan.objects.every(isPlanObject));
}
function isSavedProject(value:unknown):value is SavedProject {
  if(!value||typeof value!=="object")return false;const p=value as Record<string,unknown>;
  if(typeof p.id!=="string"||typeof p.name!=="string"||!isPlotGeometry(p.geometry)||!Array.isArray(p.measurements)||typeof p.compassRotation!=="number"||!Number.isFinite(p.compassRotation))return false;
  if(p.details!==undefined&&(!p.details||typeof p.details!=="object"||["clientName","siteAddress","projectNumber","preparedBy","revision","notes"].some(key=>typeof (p.details as Record<string,unknown>)[key]!=="string")))return false;
  if(p.assumptions!==undefined&&(!Array.isArray(p.assumptions)||p.assumptions.some(item=>!item||typeof item!=="object"||typeof (item as Record<string,unknown>).id!=="string"||typeof (item as Record<string,unknown>).description!=="string"||!( ["assumed","confirmed"] as string[]).includes(String((item as Record<string,unknown>).status))||((item as Record<string,unknown>).source!==undefined&&typeof (item as Record<string,unknown>).source!=="string"))))return false;
  if(p.issues!==undefined&&(!Array.isArray(p.issues)||p.issues.some(item=>!item||typeof item!=="object"||["id","revision","date","author","description"].some(key=>typeof (item as Record<string,unknown>)[key]!=="string"))))return false;
  if(p.measurements.some(line=>!line||typeof line!=="object"||!isPoint((line as Record<string,unknown>).start)||!isPoint((line as Record<string,unknown>).end)))return false;
  const g=p.geometry as PlotGeometry;
  if(g.groundPlan!==undefined&&!isFloorPlan(g.groundPlan))return false;
  if(g.rooms!==undefined&&(!Array.isArray(g.rooms)||g.rooms.some(room=>!isRoom(room))))return false;
  if(g.openings!==undefined&&Array.isArray(g.openings)&&!openingsFitRooms(g.openings,g.rooms??[]))return false;
  if(g.floors!==undefined&&Array.isArray(g.floors)&&g.floors.some(floor=>!isFloorPlan(floor)))return false;
  if(g.openings!==undefined&&(!Array.isArray(g.openings)||g.openings.some(item=>!item||typeof item.id!=="string"||typeof item.roomId!=="string"||!(item.type==="door"||item.type==="window")||!(["top","right","bottom","left"].includes(item.side))||![item.width,item.offset].every(n=>typeof n==="number"&&Number.isFinite(n)))))return false;
  if(g.floors!==undefined&&(!Array.isArray(g.floors)||g.floors.some(floor=>!floor||typeof floor.id!=="string"||typeof floor.name!=="string"||!Array.isArray(floor.rooms)||floor.rooms.some(room=>!isRoom(room))||!Array.isArray(floor.openings)||floor.openings.some(item=>!item||typeof item.id!=="string"||typeof item.roomId!=="string"||!(item.type==="door"||item.type==="window")||!( ["top","right","bottom","left"].includes(item.side))||![item.width,item.offset].every(n=>typeof n==="number"&&Number.isFinite(n))))))return false;
  return true;
}
function isLegacyRoom(value:unknown):value is Room{
  if(!value||typeof value!=="object")return false;
  const room=value as Record<string,unknown>,walls=room.wallThicknesses as Record<string,unknown>|undefined;
  return typeof room.id==="string"&&typeof room.name==="string"&&(room.kind===undefined||room.kind==="room"||room.kind==="stairs"||room.kind==="lawn")&&[room.x,room.y,room.width,room.height].every(number=>typeof number==="number"&&Number.isFinite(number))&&Number(room.width)>0&&Number(room.height)>0&&
    (walls===undefined||!!walls&&["top","right","bottom","left"].every(side=>walls[side]===undefined||typeof walls[side]==="number"&&Number.isFinite(walls[side])&&Number(walls[side])>=0));
}
function isLegacyOpening(value:unknown):boolean{
  if(!value||typeof value!=="object")return false;
  const opening=value as Record<string,unknown>;
  return typeof opening.id==="string"&&typeof opening.roomId==="string"&&(opening.type==="door"||opening.type==="window")&&["top","right","bottom","left"].includes(String(opening.side))&&typeof opening.width==="number"&&Number.isFinite(opening.width)&&typeof opening.offset==="number"&&Number.isFinite(opening.offset);
}
function isLegacyFloorPlan(value:unknown):boolean{
  if(!value||typeof value!=="object")return false;
  const plan=value as Record<string,unknown>;
  return typeof plan.id==="string"&&typeof plan.name==="string"&&Array.isArray(plan.rooms)&&plan.rooms.every(isLegacyRoom)&&Array.isArray(plan.openings)&&plan.openings.every(isLegacyOpening);
}
function isLegacySavedProject(value:unknown):value is SavedProject{
  if(!value||typeof value!=="object")return false;
  const project=value as Record<string,unknown>;
  if(typeof project.id!=="string"||typeof project.name!=="string"||!isPlotGeometry(project.geometry)||!Array.isArray(project.measurements)||project.measurements.some(line=>!line||typeof line!=="object"||!isPoint((line as Record<string,unknown>).start)||!isPoint((line as Record<string,unknown>).end))||typeof project.compassRotation!=="number"||!Number.isFinite(project.compassRotation))return false;
  if(project.details!==undefined&&(!project.details||typeof project.details!=="object"||["clientName","siteAddress","projectNumber","preparedBy","revision","notes"].some(key=>typeof (project.details as Record<string,unknown>)[key]!=="string")))return false;
  if(project.assumptions!==undefined&&(!Array.isArray(project.assumptions)||project.assumptions.some(item=>!item||typeof item!=="object"||typeof (item as Record<string,unknown>).id!=="string"||typeof (item as Record<string,unknown>).description!=="string"||!( ["assumed","confirmed"] as string[]).includes(String((item as Record<string,unknown>).status))||((item as Record<string,unknown>).source!==undefined&&typeof (item as Record<string,unknown>).source!=="string"))))return false;
  if(project.issues!==undefined&&(!Array.isArray(project.issues)||project.issues.some(item=>!item||typeof item!=="object"||["id","revision","date","author","description"].some(key=>typeof (item as Record<string,unknown>)[key]!=="string"))))return false;
  const geometry=project.geometry as PlotGeometry;
  return (geometry.rooms===undefined||Array.isArray(geometry.rooms)&&geometry.rooms.every(isLegacyRoom))&&
    (geometry.openings===undefined||Array.isArray(geometry.openings)&&geometry.openings.every(isLegacyOpening))&&
    (geometry.groundPlan===undefined||isLegacyFloorPlan(geometry.groundPlan))&&
    (geometry.floors===undefined||Array.isArray(geometry.floors)&&geometry.floors.every(isLegacyFloorPlan));
}
function migrateLegacyProject(project:SavedProject):SavedProject{
  const geometry=normalizeFloorGeometry(project.geometry);
  const migrateFloor=(floor:FloorPlanLevel):FloorPlanLevel=>{
    const rooms=floor.rooms.filter(isLegacyRoom).map((room,index)=>({...room,name:room.name.trim()||`Space ${index+1}`}));
    const openings=floor.openings.flatMap(opening=>{
      if(!isLegacyOpening(opening)||opening.width<=0||opening.offset<0)return [];
      const room=rooms.find(item=>item.id===opening.roomId);if(!room)return [];
      const side=opening.side as WallSide,length=side==="top"||side==="bottom"?room.width:room.height,width=Math.min(opening.width,length);
      if(width<=0)return [];
      return [{...opening,width,offset:Math.min(opening.offset,length-width)}];
    });
    return {...floor,rooms,openings};
  };
  const groundPlan=migrateFloor(geometry.groundPlan??{id:"ground",name:"Ground · Stilt parking",rooms:[],openings:[]});
  const floors=(geometry.floors??[]).map(migrateFloor),activeFloorId=geometry.activeFloorId??floors[0]?.id??"floor-1";
  const active=activeFloorId==="ground"?groundPlan:floors.find(floor=>floor.id===activeFloorId)??floors[0]??{id:activeFloorId,name:"Floor 1",rooms:[],openings:[]};
  return {...project,geometry:{...geometry,groundPlan,floors,activeFloorId,rooms:active.rooms,openings:active.openings}};
}
function isUnknownArray(value:unknown):value is unknown[]{return Array.isArray(value);}
function isSavedProjectCollection(value:unknown):value is ProjectCollectionDocumentV2{
  return isProjectCollectionDocumentV2(value)&&value.projects.length>0&&value.projects.every(isSavedProject);
}

function normalizeFloorGeometry(geometry:PlotGeometry):PlotGeometry{
  const groundPlan=geometry.groundPlan??{id:"ground",name:"Ground · Stilt parking",rooms:[],openings:[]};
  if(geometry.floors!==undefined&&geometry.floors.length===0&&geometry.activeFloorId==="ground")return {...geometry,groundPlan,rooms:groundPlan.rooms,openings:groundPlan.openings};
  if(geometry.floors?.length){
    if(geometry.activeFloorId==="ground")return {...geometry,groundPlan,rooms:groundPlan.rooms,openings:groundPlan.openings};
    const active=geometry.floors.find(floor=>floor.id===geometry.activeFloorId)??geometry.floors[0];
    return {...geometry,groundPlan,activeFloorId:active.id,rooms:active.rooms,openings:active.openings};
  }
  const id="floor-1";
  return {...geometry,groundPlan,activeFloorId:id,floors:[{id,name:"Floor 1",rooms:geometry.rooms??[],openings:geometry.openings??[]}]};
}

function floorPlansForGeometry(geometry:PlotGeometry):FloorPlanLevel[]{
  if(geometry.floors!==undefined&&geometry.floors.length===0&&geometry.activeFloorId==="ground")return [];
  const activeId=geometry.activeFloorId??"floor-1";
  const stored=geometry.floors?.length?geometry.floors:[{id:activeId,name:"Floor 1",rooms:geometry.rooms??[],openings:geometry.openings??[]}];
  return stored.map(floor=>floor.id===activeId?{...floor,rooms:geometry.rooms??floor.rooms,openings:geometry.openings??floor.openings}:floor);
}

function updateActiveLevel(geometry:PlotGeometry,update:(level:FloorPlanLevel)=>FloorPlanLevel):PlotGeometry{
  if(geometry.activeFloorId==="ground"){
    const ground=geometry.groundPlan??{id:"ground",name:"Ground · Stilt parking",rooms:[],openings:[]};
    return {...geometry,groundPlan:update(ground)};
  }
  const id=geometry.activeFloorId??"floor-1";
  return {...geometry,floors:floorPlansForGeometry(geometry).map(level=>level.id===id?update(level):level)};
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
  if(corners.length!==4||!CORNER_IDS.every(id=>byId.has(id))){
    const minX=Math.min(...corners.map(point=>point.x)),maxX=Math.max(...corners.map(point=>point.x)),minY=Math.min(...corners.map(point=>point.y)),maxY=Math.max(...corners.map(point=>point.y));
    return {top:maxX-minX,right:maxY-minY,bottom:maxX-minX,left:maxY-minY};
  }
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

function getSetbackDistances(geometry:PlotGeometry):Record<PlotEdgeName,number>{
  return {top:Math.max(0,geometry.setbacks?.top??geometry.setbackMm??0),right:Math.max(0,geometry.setbacks?.right??geometry.setbackMm??0),bottom:Math.max(0,geometry.setbacks?.bottom??geometry.setbackMm??0),left:Math.max(0,geometry.setbacks?.left??geometry.setbackMm??0)};
}
function setbackCorners(corners:PlotCorner[],distances:number|Record<PlotEdgeName,number>):PlotCorner[]{
  const values=typeof distances==="number"?{top:distances,right:distances,bottom:distances,left:distances}:distances;
  if(Object.values(values).every(distance=>distance<=0))return corners;
  return rectangularSetback(corners,values).map((point,index)=>({...corners[index],x:point.x,y:point.y}));
}
function withEditedBoundary(geometry:PlotGeometry,corners:PlotCorner[]):PlotGeometry{
  return {...geometry,corners,...(geometry.survey?{survey:{...geometry.survey,designBoundaryEditedAt:new Date().toISOString()}}:{})};
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
  let migratedCorners:PlotCorner[];
  try {
    migratedCorners=createPlot(legacyGeometry.dimensions,legacyGeometry.origin,legacyGeometry.rotation).corners;
  } catch {
    // Older saved dimensions may be positive but geometrically impossible under
    // the right-angle assumption. Keep the app loadable and use a known-valid plot.
    migratedCorners=createPlot(DEFAULT_PLOT_DIMENSIONS_MM).corners;
  }
  return readStoredValue(PLOT_STORAGE_KEY, isPlotGeometry, {
    corners: migratedCorners,
  });
}

function loadProjects():SavedProject[] {
  const current=readStoredValue<ProjectCollectionDocumentV2|null>(PROJECTS_STORAGE_KEY,isSavedProjectCollection,null);
  if(current)return current.projects;
  const legacy=readStoredValue<unknown[]>(LEGACY_PROJECTS_STORAGE_KEY,isUnknownArray,[]);
  const migrated=legacy.filter(isLegacySavedProject).map(migrateLegacyProject).filter(isSavedProject);
  if(migrated.length)return migrated;
  return [{id:crypto.randomUUID(),name:"My site plan",geometry:loadPlotGeometry(),measurements:[],compassRotation:0}];
}

function createPlotFromCorners(corners: PlotCorner[]): Plot {
  const nextCorners=corners;
  const legacyNames:Record<string,string>={"corner-bl|corner-tl":"left","corner-br|corner-tr":"right","corner-bl|corner-br":"bottom","corner-tl|corner-tr":"top"};
  const cardinalLabels:Record<string,string>={top:"Top",right:"Right",bottom:"Bottom",left:"Left"};
  return {
    id:"residential-plot-1",
    name:"Site boundary",
    corners: nextCorners,
    edges:nextCorners.map((start,index)=>{
      const end=nextCorners[(index+1)%nextCorners.length],name=legacyNames[[start.id,end.id].sort().join("|")]??`edge-${index+1}`;
      return {id:`edge-${start.id}-${end.id}`,name,label:cardinalLabels[name]??`${start.name}–${end.name}`,startCornerId:start.id,endCornerId:end.id,targetLengthMm:distance(start,end),actualLengthMm:distance(start,end)};
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
  const [selectedRoomWall,setSelectedRoomWall]=useState<{roomId:string;side:WallSide}|null>(null);
  const [selectedSiteFeatureId,setSelectedSiteFeatureId]=useState<string|null>(null);
  const [selectedPropertyCardId,setSelectedPropertyCardId]=useState<string|null>(null);
  const activeProject=projects.find(project=>project.id===activeProjectId);
  const projectDetails=activeProject?.details??{clientName:"",siteAddress:"",projectNumber:"",preparedBy:"",revision:"",notes:""};
  const assumptions=activeProject?.assumptions??[];
  const issues=activeProject?.issues??[];

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
  const setbackDistances=getSetbackDistances(geometry);
  const surveyMetadata=geometry.survey;
  const rooms: Room[] = geometry.rooms ?? [];
  const siteFeatures=geometry.siteFeatures??[];
  const openings=geometry.openings ?? [];
  const activeFloorId=geometry.activeFloorId??"floor-1";
  const groundLevel=geometry.groundPlan??{id:"ground",name:"Ground · Stilt parking",rooms:[],openings:[]};
  const floorPlans=useMemo(()=>floorPlansForGeometry(geometry),[geometry]);
  const planObjects=(activeFloorId==="ground"?groundLevel:floorPlans.find(level=>level.id===activeFloorId))?.objects??[];

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
  useEffect(()=>{writeStoredValue(PROJECTS_STORAGE_KEY,createProjectCollectionDocument(projects));},[projects]);

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
  const updateProjectDetails=useCallback((details:Partial<ProjectDetails>)=>{setProjects(current=>current.map(project=>project.id===activeProjectId?{...project,details:{clientName:"",siteAddress:"",projectNumber:"",preparedBy:"",revision:"",notes:"",...project.details,...details}}:project));},[activeProjectId]);
  const addProjectAssumption=useCallback((description:string,source?:string):boolean=>{
    const clean=description.trim();if(!clean)return false;
    const assumption:ProjectAssumption={id:crypto.randomUUID(),description:clean,status:"assumed",...(source?.trim()?{source:source.trim()}:{})};
    setProjects(current=>current.map(project=>project.id===activeProjectId?{...project,assumptions:[...(project.assumptions??[]),assumption]}:project));return true;
  },[activeProjectId]);
  const updateProjectAssumption=useCallback((id:string,changes:Partial<Omit<ProjectAssumption,"id">>)=>{
    setProjects(current=>current.map(project=>project.id===activeProjectId?{...project,assumptions:(project.assumptions??[]).map(item=>item.id===id?{...item,...changes}:item)}:project));
  },[activeProjectId]);
  const removeProjectAssumption=useCallback((id:string)=>{
    setProjects(current=>current.map(project=>project.id===activeProjectId?{...project,assumptions:(project.assumptions??[]).filter(item=>item.id!==id)}:project));
  },[activeProjectId]);
  const addProjectIssue=useCallback((description:string):boolean=>{
    const clean=description.trim(),project=projects.find(item=>item.id===activeProjectId);if(!clean||!project)return false;
    const details=project.details,revision=details?.revision.trim()??"";if(!revision)return false;
    const now=new Date(),date=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
    const issue:ProjectIssue={id:crypto.randomUUID(),revision,date,author:details?.preparedBy.trim()??"",description:clean};
    setProjects(current=>current.map(item=>item.id===activeProjectId?{...item,issues:[...(item.issues??[]),issue]}:item));return true;
  },[activeProjectId,projects]);
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
    const project={...(current??{id:activeProjectId,name:"Site plan"}),geometry:geometryRef.current,measurements:measurementsRef.current,compassRotation:compassRef.current};
    return {format:EXPORT_FORMAT,version:3,exportedAt:new Date().toISOString(),document:createProjectDocument(project)};
  },[activeProjectId,projects]);
  const importProject=useCallback((value:unknown)=>{
    if(!value||typeof value!=="object")return false;
    const payload=value as Record<string,unknown>;
    if(payload.format!==EXPORT_FORMAT)return false;
    const source=payload.version===1&&isLegacySavedProject(payload.project)?migrateLegacyProject(payload.project):
      payload.version===2&&isProjectDocumentV1(payload.document)&&isLegacySavedProject(payload.document.project)?migrateLegacyProject(payload.document.project):
      payload.version===3&&isProjectDocumentV2(payload.document)?savedProjectFromDocumentV2(payload.document):undefined;
    if(!source||!isSavedProject(source))return false;
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
    const copy:FloorPlanLevel={id,name:`Floor ${plans.length+1}`,rooms:active.rooms.map(room=>({...room,id:roomIds.get(room.id)!})),openings:active.openings.map(opening=>({...opening,id:crypto.randomUUID(),roomId:roomIds.get(opening.roomId)??opening.roomId})),objects:active.objects?.map(item=>({...item,id:crypto.randomUUID()}))};
    const index=plans.findIndex(floor=>floor.id===active.id);
    return {...current,floors:[...plans.slice(0,index+1),copy,...plans.slice(index+1)],activeFloorId:id,rooms:copy.rooms,openings:copy.openings};
  }),[commitGeometry]);
  const renameFloor=useCallback((id:string,name:string)=>{
    const value=name.trim();if(!value)return;
    commitGeometry(current=>({...current,floors:floorPlansForGeometry(current).map(floor=>floor.id===id?{...floor,name:value}:floor)}));
  },[commitGeometry]);
  const removeActiveFloor=useCallback(()=>commitGeometry(current=>{
    if(current.activeFloorId==="ground")return current;
    const plans=floorPlansForGeometry(current),activeId=current.activeFloorId??"floor-1";
    const index=plans.findIndex(floor=>floor.id===activeId),remaining=plans.filter(floor=>floor.id!==activeId);
    if(remaining.length===0){const ground=current.groundPlan??{id:"ground",name:"Ground · Stilt parking",rooms:[],openings:[]};return {...current,floors:[],activeFloorId:"ground",groundPlan:ground,rooms:ground.rooms,openings:ground.openings};}
    const target=remaining[Math.max(0,index-1)];
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
      const target=current.corners.find(corner=>corner.id===cornerId);
      if(!target||target.x===point.x&&target.y===point.y)return current;
      const corners=current.corners.map(corner=>corner.id===cornerId?{...corner,x:point.x,y:point.y}:corner);
      return hasValidBoundary(corners)&&allRoomsFit(current,setbackCorners(corners,getSetbackDistances(current)))?withEditedBoundary(current,corners):current;
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
        if(!isInside(x,y,width,height,setbackCorners(geometry.corners,getSetbackDistances(geometry))))continue;
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
  const validateSetback=(geometry:PlotGeometry,distances:Record<PlotEdgeName,number>)=>{
    const boundary=setbackCorners(geometry.corners,distances);
    if(!boundary.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)))return false;
    if(!validateBoundary(boundary).valid)return false;
    const inside=(point:Point)=>{
      let contained=false;
      for(let i=0,j=geometry.corners.length-1;i<geometry.corners.length;j=i++){
        const a=geometry.corners[i],b=geometry.corners[j];
        const cross=(point.x-a.x)*(b.y-a.y)-(point.y-a.y)*(b.x-a.x);
        if(Math.abs(cross)<.1&&point.x>=Math.min(a.x,b.x)-.1&&point.x<=Math.max(a.x,b.x)+.1&&point.y>=Math.min(a.y,b.y)-.1&&point.y<=Math.max(a.y,b.y)+.1)return true;
        if(((a.y>point.y)!==(b.y>point.y))&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)contained=!contained;
      }
      return contained;
    };
    return boundary.every(inside);
  };
  const setSetbackMm=useCallback((distance:number):boolean=>{
    const nextDistance=Number.isFinite(distance)?Math.max(0,distance):0;
    const values={top:nextDistance,right:nextDistance,bottom:nextDistance,left:nextDistance};
    if(!validateSetback(geometryRef.current,values))return false;
    commitGeometry(current=>({...current,setbackMm:nextDistance,setbacks:values}));
    return true;
  },[commitGeometry,isInside]);
  const setSetbackDistance=useCallback((edge:PlotEdgeName,distance:number):boolean=>{
    if(!Number.isFinite(distance)||distance<0)return false;
    const values={...getSetbackDistances(geometryRef.current),[edge]:distance};
    if(!validateSetback(geometryRef.current,values))return false;
    commitGeometry(current=>({...current,setbacks:values}));
    return true;
  },[commitGeometry,isInside]);
  const setSetbackDistances=useCallback((distances:Record<PlotEdgeName,number>):boolean=>{
    if(Object.values(distances).some(distance=>!Number.isFinite(distance)||distance<0))return false;
    const values={...distances};
    if(!validateSetback(geometryRef.current,values))return false;
    commitGeometry(current=>({...current,setbacks:values}));
    return true;
  },[commitGeometry,isInside]);
  const selectEdge=useCallback((id:string|null)=>{setSelectedEdgeId(id);setSelectedPropertyCardId(id?`edge-${id}`:null);},[]);
  const selectCorner=useCallback((id:string|null)=>{setSelectedCornerId(id);setSelectedPropertyCardId(id?`corner-${id}`:null);},[]);
  const selectSiteFeature=useCallback((id:string|null)=>{setSelectedSiteFeatureId(id);setSelectedRoomWall(null);setSelectedPropertyCardId(id?`site-feature-${id}`:null);},[]);
  const selectRoomWall=useCallback((roomId:string,side:WallSide)=>{setSelectedRoomWall({roomId,side});setSelectedPropertyCardId(`room-${roomId}`);},[]);

  const addRoom = useCallback((room: Omit<Room, "id">) => commitGeometry(current => {
    const existing = current.rooms ?? [];
    const next = { ...room, id: crypto.randomUUID() };
    const boundary=setbackCorners(current.corners,getSetbackDistances(current));
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
      const dx=x-room.x,dy=y-room.y;
      return isInside(x, y, room.width, room.height, setbackCorners(current.corners,getSetbackDistances(current))) ? { ...room, x, y, ...(room.points?{points:room.points.map(p=>({x:p.x+dx,y:p.y+dy}))}:{}) } : room;
    });
    return existing.find(room=>room.id===id)?.kind==="stairs"?syncStairwellGeometry(current,rooms):{...current,rooms};
  }), [building.x, building.y, building.width, building.height, commitGeometry]);
  const setRoomPoints=useCallback((id:string,points:Point[])=>commitGeometry(current=>{
    if(points.length<3||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return current;
    const existing=current.rooms??[];const room=existing.find(item=>item.id===id);if(!room)return current;
    const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
    const rooms=existing.map(item=>item.id===id?{...item,points,x:minX,y:minY,width:maxX-minX,height:maxY-minY}:item);
    return {...current,rooms};
  }),[commitGeometry]);
  const moveFloorPlan = useCallback((delta:Point) => commitGeometry(current=>{
    const rooms=current.rooms ?? [];
    const moved=rooms.map(room=>({...room,x:room.x+delta.x,y:room.y+delta.y,...(room.points?{points:room.points.map(point=>({x:point.x+delta.x,y:point.y+delta.y}))}:{})}));
    const boundary=setbackCorners(current.corners,getSetbackDistances(current));
    if(!moved.every(room=>isInside(room.x,room.y,room.width,room.height,boundary)))return current;
    const next=rooms.some(room=>room.kind==="stairs")?syncStairwellGeometry(current,moved):{...current,rooms:moved};
    return updateActiveLevel(next,level=>({...level,objects:(level.objects??[]).map(item=>({...item,x:item.x+delta.x,y:item.y+delta.y}))}));
  }),[commitGeometry]);
  const resizeRoom = useCallback((id: string, x: number, y: number, width: number, height: number):boolean => {
    if(![x,y,width,height].every(Number.isFinite)||width<=0||height<=0)return false;
    const current=geometryRef.current,existing=current.rooms??[],room=existing.find(item=>item.id===id);
    if(!room||!isInside(x,y,width,height,setbackCorners(current.corners,getSetbackDistances(current))))return false;
    commitGeometry(value=>{
      const rooms=(value.rooms??[]).map(item=>{
        if(item.id!==id)return item;
        const points=item.points?.map(point=>({x:x+(item.width?(point.x-item.x)/item.width:0)*width,y:y+(item.height?(point.y-item.y)/item.height:0)*height}));
        return {...item,x,y,width,height,...(points?{points}:{})};
      });
      const resized=rooms.find(item=>item.id===id)!;
      const openings=(value.openings??[]).map(opening=>{
        if(opening.roomId!==id)return opening;
        const length=opening.side==="top"||opening.side==="bottom"?resized.width:resized.height;
        const previousLength=opening.side==="top"||opening.side==="bottom"?room.width:room.height;
        const openingWidth=Math.min(opening.width,length),offsetRatio=previousLength>0?opening.offset/previousLength:0;
        return {...opening,width:openingWidth,offset:Math.min(Math.max(0,offsetRatio*length),length-openingWidth)};
      });
      return resized.kind==="stairs"?syncStairwellGeometry({...value,openings},rooms):{...value,rooms,openings};
    });
    return true;
  },[commitGeometry,isInside]);
  const removeRoom = useCallback((id: string) => commitGeometry(current => {
    const removed=(current.rooms??[]).find(room=>room.id===id),rooms=(current.rooms??[]).filter(room=>room.id!==id),openings=(current.openings??[]).filter(item=>item.roomId!==id);
    if(removed?.kind!=="stairs")return {...current,rooms,openings};
    const plans=allPlansForGeometry(current).map(floor=>({...floor,rooms:floor.rooms.filter(room=>room.kind!=="stairs"),openings:floor.openings.filter(item=>!floor.rooms.some(room=>room.id===item.roomId&&room.kind==="stairs"))}));
    return {...current,rooms,openings,groundPlan:plans[0],floors:plans.slice(1)};
  }), [commitGeometry]);
  const moveRoomLabel=useCallback((id:string,offset:Point)=>commitGeometry(current=>{
    const update=(items:Room[]|undefined)=>items?.map(room=>room.id===id?{...room,labelOffset:offset}:room);
    return {...current,rooms:update(current.rooms),groundPlan:current.groundPlan?{...current.groundPlan,rooms:update(current.groundPlan.rooms)!}:undefined,floors:current.floors?.map(floor=>({...floor,rooms:update(floor.rooms)!}))};
  }),[commitGeometry]);
  const renameRoom = useCallback((id:string,name:string)=>commitGeometry(current=>{
    const trimmed=name.trim();
    if(!trimmed)return current;
    const rooms=(current.rooms??[]).map(room=>room.id===id?{...room,name:trimmed}:room);
    const updatePlan=(plan:FloorPlanLevel)=>({...plan,rooms:plan.rooms.map(room=>room.id===id?{...room,name:trimmed}:room)});
    return {...current,rooms,groundPlan:current.groundPlan?updatePlan(current.groundPlan):undefined,floors:current.floors?.map(updatePlan)};
  }),[commitGeometry]);
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
  const addPlanObject=useCallback((kind:PlanObjectKind,text="Text")=>commitGeometry(current=>{
    const sizes:Record<PlanObjectKind,{width:number;height:number}>={"dining-table":{width:1400,height:800},chair:{width:460,height:460},"vent-window":{width:900,height:120},sofa:{width:1900,height:850},text:{width:1600,height:500}};
    const size=sizes[kind],room=(current.rooms??[]).find(item=>item.kind!=="stairs"),bounds=computePlotMetrics(current.corners).bounds;
    const center=room?{x:room.x+room.width/2,y:room.y+room.height/2}:{x:(bounds.minX+bounds.maxX)/2,y:(bounds.minY+bounds.maxY)/2};
    const objects=((current.activeFloorId==="ground"?current.groundPlan:floorPlansForGeometry(current).find(level=>level.id===current.activeFloorId))?.objects??[]);
    const offset=(objects.length%5)*250;
    const item:PlanObject={id:crypto.randomUUID(),kind,x:center.x-size.width/2+offset,y:center.y-size.height/2+offset,...size,...(kind==="text"?{text:text.trim()||"Text"}:{})};
    return updateActiveLevel(current,level=>({...level,objects:[...(level.objects??[]),item]}));
  }),[commitGeometry]);
  const movePlanObject=useCallback((id:string,point:Point)=>commitGeometry(current=>updateActiveLevel(current,level=>({...level,objects:(level.objects??[]).map(item=>item.id===id?{...item,x:point.x,y:point.y}:item)}))),[commitGeometry]);
  const removePlanObject=useCallback((id:string)=>commitGeometry(current=>updateActiveLevel(current,level=>({...level,objects:(level.objects??[]).filter(item=>item.id!==id)}))),[commitGeometry]);
  const removeFloorPlan=useCallback(()=>commitGeometry(current=>updateActiveLevel({...current,rooms:(current.rooms??[]).filter(room=>room.kind==="stairs"),openings:(current.openings??[]).filter(opening=>(current.rooms??[]).some(room=>room.id===opening.roomId&&room.kind==="stairs"))},level=>({...level,objects:[]}))),[commitGeometry]);
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
        if(candidate.every(room=>isInside(room.x,room.y,room.width,room.height,setbackCorners(geometry.corners,getSetbackDistances(geometry))))) {placed=candidate;break;}
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

  const updateEdgeLength = useCallback((edgeId:string,lengthMm:number):boolean=>{
    if(!Number.isFinite(lengthMm)||lengthMm<1)return false;
    const current=geometryRef.current,index=current.corners.findIndex((corner,i)=>`edge-${corner.id}-${current.corners[(i+1)%current.corners.length].id}`===edgeId);
    if(index<0)return false;
    const start=current.corners[index],end=current.corners[(index+1)%current.corners.length],oldLength=Math.hypot(end.x-start.x,end.y-start.y)||1;
    if(Math.abs(oldLength-lengthMm)<.01)return true;
    const ratio=lengthMm/oldLength;
    const corners=current.corners.map((corner,i)=>i===(index+1)%current.corners.length?{...corner,x:start.x+(end.x-start.x)*ratio,y:start.y+(end.y-start.y)*ratio}:corner);
    if(!hasValidBoundary(corners)||!allRoomsFit(current,setbackCorners(corners,getSetbackDistances(current))))return false;
    commitGeometry(value=>withEditedBoundary(value,corners));return true;
  },[commitGeometry,isInside]);
  const splitBoundaryEdge=useCallback((edgeId:string):boolean=>{
    const current=geometryRef.current,index=current.corners.findIndex((corner,i)=>`edge-${corner.id}-${current.corners[(i+1)%current.corners.length].id}`===edgeId);
    if(index<0)return false;
    const start=current.corners[index],end=current.corners[(index+1)%current.corners.length],letter=String.fromCharCode(65+current.corners.length);
    const addedCorner={id:`corner-${crypto.randomUUID()}`,name:letter,x:(start.x+end.x)/2,y:(start.y+end.y)/2};
    const next=[...current.corners.slice(0,index+1),addedCorner,...current.corners.slice(index+1)];
    if(!hasValidBoundary(next)||!allRoomsFit(current,setbackCorners(next,getSetbackDistances(current))))return false;
    commitGeometry(value=>withEditedBoundary(value,next));setSelectedEdgeId(null);setSelectedCornerId(addedCorner.id);setSelectedPropertyCardId(`corner-${addedCorner.id}`);return true;
  },[commitGeometry,isInside]);
  const removeBoundaryCorner=useCallback((cornerId:string):boolean=>{
    const current=geometryRef.current;if(current.corners.length<=3)return false;
    const next=current.corners.filter(corner=>corner.id!==cornerId);
    if(next.length===current.corners.length||!hasValidBoundary(next)||!allRoomsFit(current,setbackCorners(next,getSetbackDistances(current))))return false;
    commitGeometry(value=>withEditedBoundary(value,next));setSelectedEdgeId(null);setSelectedCornerId(null);setSelectedPropertyCardId(null);return true;
  },[commitGeometry,isInside]);
  const importSurveyBoundary=useCallback((corners:PlotCorner[],survey:Omit<SurveyMetadata,"importedAt">):boolean=>{
    const current=geometryRef.current;
    if(!hasValidBoundary(corners)||!allRoomsFit(current,setbackCorners(corners,getSetbackDistances(current))))return false;
    const metadata:SurveyMetadata={...survey,importedAt:new Date().toISOString()};
    commitGeometry(value=>({...value,corners,survey:metadata}));
    setSelectedEdgeId(null);setSelectedCornerId(null);setSelectedPropertyCardId(null);return true;
  },[commitGeometry,isInside]);

  const updateRoomWallThickness=useCallback((roomId:string,side:WallSide,thicknessMm:number)=>{
    if(!Number.isFinite(thicknessMm)||thicknessMm<0)return false;
    const activeRoom=geometryRef.current.rooms?.find(room=>room.id===roomId);
    if(!activeRoom)return false;
    const activeRooms=geometryRef.current.rooms??[];
    const otherSide=({top:"bottom",right:"left",bottom:"top",left:"right"} as Record<WallSide,WallSide>)[side];
    const adjoiningIds=new Set(getAttachedRoomWallSegments(activeRoom,side,activeRooms).map(segment=>segment.room.id));
    const affectedIds=new Set([roomId,...adjoiningIds]);
    const candidateRooms=activeRooms.map(room=>room.id===roomId
      ?{...room,wallThicknesses:{...room.wallThicknesses,[side]:thicknessMm}}
      :adjoiningIds.has(room.id)?{...room,wallThicknesses:{...room.wallThicknesses,[otherSide]:thicknessMm}}:room);
    if(candidateRooms.filter(room=>affectedIds.has(room.id)).some(room=>room.width-getRoomWallInset(room,"left",candidateRooms)-getRoomWallInset(room,"right",candidateRooms)<300||room.height-getRoomWallInset(room,"top",candidateRooms)-getRoomWallInset(room,"bottom",candidateRooms)<300))return false;
    commitGeometry(current=>{
      const rooms=(current.rooms??[]).map(room=>room.id===roomId
        ?{...room,wallThicknesses:{...room.wallThicknesses,[side]:thicknessMm}}
        :adjoiningIds.has(room.id)?{...room,wallThicknesses:{...room.wallThicknesses,[otherSide]:thicknessMm}}:room);
      const activeId=current.activeFloorId??"floor-1";
      return {...current,rooms,floors:current.floors?.map(floor=>floor.id===activeId?{...floor,rooms}:floor)};
    });
    return true;
  },[commitGeometry]);

  const addSiteFeature=useCallback((kind:SiteFeatureKind):boolean=>{
    const sizes:Record<SiteFeatureKind,{width:number;height:number;name:string}>={
      "building-footprint":{width:10000,height:8000,name:"Building footprint"},driveway:{width:3500,height:7000,name:"Driveway"},parking:{width:2700,height:5400,name:"Parking bay"},walkway:{width:1500,height:5000,name:"Walkway"},landscape:{width:5000,height:3000,name:"Landscape area"},lawn:{width:6000,height:6000,name:"Lawn"},tree:{width:1200,height:1200,name:"Tree"},utility:{width:1200,height:1200,name:"Utility point"},easement:{width:5000,height:3000,name:"Easement"},other:{width:3000,height:2000,name:"Site feature"},
    };
    const size=sizes[kind],current=geometryRef.current;
    const minX=Math.min(...current.corners.map(point=>point.x)),maxX=Math.max(...current.corners.map(point=>point.x)),minY=Math.min(...current.corners.map(point=>point.y)),maxY=Math.max(...current.corners.map(point=>point.y));
    const step=Math.max(500,(Math.max(maxX-minX,maxY-minY))/60);let position:{x:number;y:number}|null=null;
    const center={x:(minX+maxX-size.width)/2,y:(minY+maxY-size.height)/2};
    if(isInside(center.x,center.y,size.width,size.height,current.corners))position=center;
    for(let y=minY;!position&&y+size.height<=maxY;y+=step)for(let x=minX;!position&&x+size.width<=maxX;x+=step)if(isInside(x,y,size.width,size.height,current.corners))position={x,y};
    if(!position)return false;
    const sameKind=(current.siteFeatures??[]).filter(feature=>feature.kind===kind).length;
    const feature:SiteFeature={id:crypto.randomUUID(),kind,name:`${size.name}${sameKind?` ${sameKind+1}`:""}`,status:"proposed",...position,width:size.width,height:size.height};
    commitGeometry(value=>({...value,siteFeatures:[...(value.siteFeatures??[]),feature]}));selectSiteFeature(feature.id);return true;
  },[commitGeometry,isInside,selectSiteFeature]);
  const updateSiteFeature=useCallback((id:string,changes:Partial<Omit<SiteFeature,"id"|"kind">>):boolean=>{
    const current=geometryRef.current,feature=(current.siteFeatures??[]).find(item=>item.id===id);if(!feature)return false;
    const next={...feature,...changes};
    if(!next.name.trim()||![next.x,next.y,next.width,next.height].every(Number.isFinite)||next.width<=0||next.height<=0||!["existing","proposed","removed"].includes(next.status)||!isInside(next.x,next.y,next.width,next.height,current.corners))return false;
    commitGeometry(value=>({...value,siteFeatures:(value.siteFeatures??[]).map(item=>item.id===id?next:item)}));return true;
  },[commitGeometry,isInside]);
  const moveSiteFeature=useCallback((id:string,center:Point):boolean=>{
    const feature=(geometryRef.current.siteFeatures??[]).find(item=>item.id===id);if(!feature)return false;
    return updateSiteFeature(id,{x:center.x-feature.width/2,y:center.y-feature.height/2});
  },[updateSiteFeature]);
  const removeSiteFeature=useCallback((id:string)=>{
    commitGeometry(current=>({...current,siteFeatures:(current.siteFeatures??[]).filter(feature=>feature.id!==id)}));
    if(selectedSiteFeatureId===id)selectSiteFeature(null);
  },[commitGeometry,selectedSiteFeatureId,selectSiteFeature]);

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
        setbackDistances,
        setSetbackMm,
        setSetbackDistance,
        setSetbackDistances,
        rooms,
        siteFeatures,
        selectedSiteFeatureId,
        selectSiteFeature,
        addSiteFeature,
        updateSiteFeature,
        moveSiteFeature,
        removeSiteFeature,
        openings,
        planObjects,
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
        projectDetails,
        updateProjectDetails,
        assumptions,
        issues,
        addProjectIssue,
        addProjectAssumption,
        updateProjectAssumption,
        removeProjectAssumption,
        switchProject,
        createProject,
        renameProject,
        deleteProject,
        exportProject,
        importProject,
        selectedEdgeId,
        selectedRoomWall,
        selectRoomWall,
        selectedPropertyCardId,
        selectPropertyCard:setSelectedPropertyCardId,
        updateRoomWallThickness,
        selectedCornerId,
        updateEdgeLength,
        splitBoundaryEdge,
        removeBoundaryCorner,
        surveyMetadata,
        importSurveyBoundary,
        updateCornerPosition,
        updateBuildingPosition,
        updateBuildingSize,
        addRoom,
        moveRoom,
        moveRoomLabel,
        moveFloorPlan,
        resizeRoom,
        setRoomPoints,
        removeRoom,
        renameRoom,
        addOpening,
        removeOpening,
        moveOpening,
        addPlanObject,
        movePlanObject,
        removePlanObject,
        removeFloorPlan,
        applyFloorPlanPreset,
        canUndo:historyRef.current.past.length>0,
        canRedo:historyRef.current.future.length>0,
        undo,
        redo,
        resetPlot,
        selectEdge,
        selectCorner,
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
