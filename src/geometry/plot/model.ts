import type { PlotCorner, PlotEdgeName } from "../../types/plot";
import type { SurveyCoordinateUnit } from "./surveyCsv";

/** Domain geometry is stored in millimetres and does not depend on the editor or viewport. */
export type RoomKind = "room" | "stairs" | "lawn";
export type WallSide = "top" | "right" | "bottom" | "left";
export type SiteFeatureKind="building-footprint"|"driveway"|"parking"|"walkway"|"landscape"|"lawn"|"tree"|"utility"|"easement"|"other";
export type SiteFeatureStatus="existing"|"proposed"|"removed";
export interface SiteFeature { id:string; name:string; kind:SiteFeatureKind; status:SiteFeatureStatus; x:number; y:number; width:number; height:number; visible?:boolean }
export interface Room { id: string; name: string; x: number; y: number; width: number; height: number; points?:ProjectPoint[]; kind?: RoomKind; wallThicknesses?:Partial<Record<WallSide,number>>; labelOffset?:ProjectPoint }
export interface PlanOpening { id:string; roomId:string; type:"door"|"window"; side:WallSide; offset:number; width:number }
export type PlanObjectKind="dining-table"|"chair"|"vent-window"|"sofa"|"text";
export interface PlanObject {id:string;kind:PlanObjectKind;x:number;y:number;width:number;height:number;text?:string}
export interface FloorPlanLevel { id:string; name:string; rooms:Room[]; openings:PlanOpening[]; objects?:PlanObject[] }
export type FloorPlanPreset = "1bhk" | "2bhk" | "3bhk";
export interface ProjectPoint {x:number;y:number}
export interface MeasurementLine { start:ProjectPoint; end:ProjectPoint }
export interface SurveyMetadata { sourceFile:string; coordinateReference:string; coordinateUnit:SurveyCoordinateUnit; originX:number; originY:number; sourcePoints:Array<{name:string;x:number;y:number}>; importedAt:string; designBoundaryEditedAt?:string }
export interface PlotGeometry { corners:PlotCorner[]; building?:{x:number;y:number;width:number;height:number}; setbackMm?:number; setbacks?:Partial<Record<PlotEdgeName,number>>; edgeSetbacks?:Record<string,number>; survey?:SurveyMetadata; siteFeatures?:SiteFeature[]; rooms?:Room[]; openings?:PlanOpening[]; groundPlan?:FloorPlanLevel; floors?:FloorPlanLevel[]; activeFloorId?:string }
export interface ProjectDetails { clientName:string; siteAddress:string; projectNumber:string; preparedBy:string; revision:string; notes:string }
export interface ProjectAssumption {id:string;description:string;status:"assumed"|"confirmed";source?:string}
export interface ProjectIssue {id:string;revision:string;date:string;author:string;description:string}
export interface SavedProject { id:string; name:string; geometry:PlotGeometry; measurements:MeasurementLine[]; compassRotation:number; details?:ProjectDetails; assumptions?:ProjectAssumption[]; issues?:ProjectIssue[] }

/** Browser autosave collection format. Kept separate from a single-project share document. */
export interface ProjectCollectionDocumentV2 {
  documentType:"siteplan-designer-project-collection";
  schemaVersion:2;
  projects:SavedProject[];
}

export function createProjectCollectionDocument(projects:SavedProject[]):ProjectCollectionDocumentV2{
  return {documentType:"siteplan-designer-project-collection",schemaVersion:2,projects};
}

export function isProjectCollectionDocumentV2(value:unknown):value is ProjectCollectionDocumentV2{
  if(!value||typeof value!=="object")return false;
  const document=value as Record<string,unknown>;
  return document.documentType==="siteplan-designer-project-collection"&&document.schemaVersion===2&&Array.isArray(document.projects);
}

/** Legacy version 1 interchange document, retained for older v2 export envelopes. */
export interface ProjectDocumentV1 {
  documentType:"siteplan-designer-project-document";
  schemaVersion:1;
  units:"mm";
  project:SavedProject;
}

/** Canonical share format separates site geometry from building levels and editor state. */
export interface ProjectDocumentV2 {
  documentType:"siteplan-designer-project-document";
  schemaVersion:2;
  units:"mm";
  project:{
    id:string;
    name:string;
    details?:ProjectDetails;
    assumptions?:ProjectAssumption[];
    issues?:ProjectIssue[];
    compassRotation:number;
    site:{boundary:PlotCorner[];setbackMm?:number;setbacks?:Partial<Record<PlotEdgeName,number>>;edgeSetbacks?:Record<string,number>;survey?:SurveyMetadata;features?:SiteFeature[]};
    buildings:Array<{id:string;name:string;levels:FloorPlanLevel[];activeLevelId:string;envelope?:{x:number;y:number;width:number;height:number}}>;
    measurements:MeasurementLine[];
  };
}

function levelsFromGeometry(geometry:PlotGeometry){
  const ground=geometry.groundPlan??{id:"ground",name:"Ground · Stilt parking",rooms:[],openings:[]};
  const hasNoUpperFloors=geometry.floors!==undefined&&geometry.floors.length===0&&geometry.activeFloorId==="ground";
  const floors=hasNoUpperFloors?[]:geometry.floors?.length?geometry.floors:[{id:geometry.activeFloorId??"floor-1",name:"Floor 1",rooms:geometry.rooms??[],openings:geometry.openings??[]}];
  const activeLevelId=geometry.activeFloorId??floors[0]?.id??"ground";
  const levels=[
    activeLevelId==="ground"?{...ground,rooms:geometry.rooms??ground.rooms,openings:geometry.openings??ground.openings}:ground,
    ...floors.map(level=>level.id===activeLevelId?{...level,rooms:geometry.rooms??level.rooms,openings:geometry.openings??level.openings}:level),
  ];
  return {levels,activeLevelId};
}

export function createProjectDocument(project:SavedProject):ProjectDocumentV2{
  const {geometry}=project,{levels,activeLevelId}=levelsFromGeometry(geometry);
  return {documentType:"siteplan-designer-project-document",schemaVersion:2,units:"mm",project:{
    id:project.id,name:project.name,details:project.details,assumptions:project.assumptions,issues:project.issues,compassRotation:project.compassRotation,
    site:{boundary:geometry.corners,setbackMm:geometry.setbackMm,setbacks:geometry.setbacks,edgeSetbacks:geometry.edgeSetbacks,survey:geometry.survey,features:geometry.siteFeatures},
    buildings:[{id:"building-primary",name:"Primary building",levels,activeLevelId,...(geometry.building?{envelope:geometry.building}:{})}],
    measurements:project.measurements,
  }};
}

export function savedProjectFromDocumentV2(document:ProjectDocumentV2):SavedProject{
  const project=document.project,building=project.buildings[0],groundPlan=building.levels.find(level=>level.id==="ground")??{id:"ground",name:"Ground · Stilt parking",rooms:[],openings:[]};
  const floors=building.levels.filter(level=>level.id!==groundPlan.id),activeLevelId=building.activeLevelId;
  const active=activeLevelId===groundPlan.id?groundPlan:floors.find(level=>level.id===activeLevelId)??floors[0]??groundPlan;
  const geometry:PlotGeometry={corners:project.site.boundary,setbackMm:project.site.setbackMm,setbacks:project.site.setbacks,edgeSetbacks:project.site.edgeSetbacks,survey:project.site.survey,siteFeatures:project.site.features,building:building.envelope,groundPlan,floors,activeFloorId:active.id,rooms:active.rooms,openings:active.openings};
  return {id:project.id,name:project.name,details:project.details,assumptions:project.assumptions,issues:project.issues,compassRotation:project.compassRotation,geometry,measurements:project.measurements};
}

export function isProjectDocumentV2(value:unknown):value is ProjectDocumentV2{
  if(!value||typeof value!=="object")return false;
  const document=value as Record<string,unknown>,project=document.project as Record<string,unknown>|undefined;
  if(document.documentType!=="siteplan-designer-project-document"||document.schemaVersion!==2||document.units!=="mm"||!project||typeof project!=="object"||typeof project.id!=="string"||typeof project.name!=="string"||typeof project.compassRotation!=="number"||!Number.isFinite(project.compassRotation)||!Array.isArray(project.measurements))return false;
  const site=project.site as Record<string,unknown>|undefined,buildings=project.buildings;
  if(!site||typeof site!=="object"||!Array.isArray(site.boundary)||!Array.isArray(buildings)||buildings.length!==1)return false;
  const building=buildings[0] as Record<string,unknown>|undefined;
  return !!building&&typeof building.id==="string"&&typeof building.name==="string"&&typeof building.activeLevelId==="string"&&Array.isArray(building.levels)&&building.levels.every(level=>!!level&&typeof level==="object"&&typeof (level as Record<string,unknown>).id==="string"&&typeof (level as Record<string,unknown>).name==="string"&&Array.isArray((level as Record<string,unknown>).rooms)&&Array.isArray((level as Record<string,unknown>).openings));
}

export function isProjectDocumentV1(value:unknown):value is ProjectDocumentV1{
  if(!value||typeof value!=="object")return false;
  const document=value as Record<string,unknown>;
  return document.documentType==="siteplan-designer-project-document"&&document.schemaVersion===1&&document.units==="mm"&&!!document.project&&typeof document.project==="object";
}

const LEGACY_SETBACK_EDGES:PlotEdgeName[]=["top","right","bottom","left"];

/**
 * Setback distance for every boundary edge, in boundary order. Edge i runs from
 * corner i to corner i+1 and is keyed by its start corner id, so setbacks survive
 * splitting or removing other points. Older projects stored four named values
 * (top/right/bottom/left) for the first four edges plus an optional uniform value.
 */
export function resolveEdgeSetbacks(geometry:Pick<PlotGeometry,"corners"|"setbackMm"|"setbacks"|"edgeSetbacks">):number[]{
  const uniform=Math.max(0,geometry.setbackMm??0);
  return geometry.corners.map((corner,index)=>{
    const keyed=geometry.edgeSetbacks?.[corner.id];
    if(keyed!==undefined)return Math.max(0,keyed);
    if(geometry.edgeSetbacks)return 0;
    const legacy=index<4?geometry.setbacks?.[LEGACY_SETBACK_EDGES[index]]:undefined;
    return Math.max(0,legacy??uniform);
  });
}

/** Build the persisted per-edge setback map from distances in boundary order. */
export function edgeSetbackRecord(corners:PlotCorner[],distances:number[]):Record<string,number>{
  return Object.fromEntries(corners.map((corner,index)=>[corner.id,Math.max(0,distances[index]??0)]));
}

export const DEFAULT_EXTERIOR_WALL_THICKNESS_MM=9*25.4;
export const DEFAULT_INTERIOR_WALL_THICKNESS_MM=4.5*25.4;

export interface RoomWallSegment {start:number;end:number;shared:boolean;thickness:number;attachedRoomIds:string[]}

export function getRoomWallSegments(room:Room,side:WallSide,rooms:Room[]):RoomWallSegment[]{
  if(room.kind==="lawn")return [];
  const epsilon=1,sideLength=side==="top"||side==="bottom"?room.width:room.height;
  const opposite=({top:"bottom",right:"left",bottom:"top",left:"right"} as Record<WallSide,WallSide>)[side];
  const attached=rooms.flatMap(other=>{
    if(other.id===room.id)return [];
    let aligned=false,start=0,end=0;
    if(side==="right"){aligned=Math.abs(room.x+room.width-other.x)<epsilon;start=Math.max(room.y,other.y)-room.y;end=Math.min(room.y+room.height,other.y+other.height)-room.y;}
    if(side==="left"){aligned=Math.abs(room.x-(other.x+other.width))<epsilon;start=Math.max(room.y,other.y)-room.y;end=Math.min(room.y+room.height,other.y+other.height)-room.y;}
    if(side==="bottom"){aligned=Math.abs(room.y+room.height-other.y)<epsilon;start=Math.max(room.x,other.x)-room.x;end=Math.min(room.x+room.width,other.x+other.width)-room.x;}
    if(side==="top"){aligned=Math.abs(room.y-(other.y+other.height))<epsilon;start=Math.max(room.x,other.x)-room.x;end=Math.min(room.x+room.width,other.x+other.width)-room.x;}
    start=Math.max(0,start);end=Math.min(sideLength,end);
    return aligned&&end-start>epsilon?[{room:other,start,end}]:[];
  });
  const breaks=[...new Set([0,sideLength,...attached.flatMap(segment=>[segment.start,segment.end])])].sort((a,b)=>a-b),ownThickness=room.wallThicknesses?.[side];
  return breaks.slice(0,-1).flatMap((start,index)=>{
    const end=breaks[index+1];if(end-start<=epsilon)return [];
    const neighbors=attached.filter(segment=>segment.start<(start+end)/2&&segment.end>(start+end)/2).map(segment=>segment.room);
    const neighborOverrides=neighbors.map(neighbor=>neighbor.wallThicknesses?.[opposite]).filter((value):value is number=>value!==undefined);
    const thickness=neighbors.length?Math.max(ownThickness??DEFAULT_INTERIOR_WALL_THICKNESS_MM,...neighborOverrides):ownThickness??DEFAULT_EXTERIOR_WALL_THICKNESS_MM;
    return [{start,end,shared:neighbors.length>0,thickness,attachedRoomIds:neighbors.map(neighbor=>neighbor.id)}];
  });
}

export function getAttachedRoomWallSegments(room:Room,side:WallSide,rooms:Room[]):Array<{room:Room;start:number;end:number}>{
  return getRoomWallSegments(room,side,rooms).filter(segment=>segment.shared).flatMap(segment=>segment.attachedRoomIds.map(id=>{const attached=rooms.find(item=>item.id===id)!;return {room:attached,start:segment.start,end:segment.end};}));
}

export function getAttachedRoomWall(room:Room,side:WallSide,rooms:Room[]):Room|undefined{
  return getAttachedRoomWallSegments(room,side,rooms)[0]?.room;
}

export function getRoomWallThickness(room:Room,side:WallSide,rooms:Room[]=[room]):number{
  const segments=getRoomWallSegments(room,side,rooms);
  return Math.max(0,...segments.map(segment=>segment.thickness));
}

export function getRoomWallInset(room:Room,side:WallSide,rooms:Room[]=[room]):number{
  return Math.max(0,...getRoomWallSegments(room,side,rooms).map(segment=>segment.shared?segment.thickness/2:segment.thickness));
}
