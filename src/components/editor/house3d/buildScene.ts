import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { getRoomWallSegments } from "../../../geometry/plot/model";
import type { FloorPlanLevel, PlanOpening, Room, SiteFeature, WallSide } from "../../../geometry/plot/model";
import type { Point } from "../../../geometry/viewport";

/**
 * Builds a three.js model of the site and house from the 2D project data.
 *
 * Units: one scene unit is one metre. Plan X maps to scene X and plan Y (which grows
 * downward on screen) maps to scene Z, so the 3D view matches the 2D plan when seen
 * from above with plan-up pointing away from the camera. Height is scene Y.
 */

export interface SceneOptions {
  corners:Point[];
  setbackCorners:Point[];
  hasSetback:boolean;
  siteFeatures:SiteFeature[];
  groundLevel:FloorPlanLevel;
  upperLevels:FloorPlanLevel[];
  fallbackFootprint:{x:number;y:number;width:number;height:number};
  compassRotation:number;
  wallHeightMm:number;
  stiltHeightMm:number;
  plinthHeightMm:number;
  pillarLayout:"eight"|"grid";
  pillarSpacingMm:number;
  removedPillarIds:string[];
  selectedPillarId:string|null;
  showRoof:boolean;
  showSiteFeatures:boolean;
  showLabels:boolean;
  /** Highest level index to draw (0 = ground/stilt); levels above are cut away. */
  visibleLevelCount:number;
  formatLength:(mm:number)=>string;
}

export interface BuiltScene {
  root:THREE.Group;
  /** Meshes that can be clicked to select a pillar; `userData.pillarId` names it. */
  pickables:THREE.Object3D[];
  /** World-space bounds of the whole model, for camera framing. */
  bounds:THREE.Box3;
  pillarCount:number;
  totalPillars:number;
  removedCount:number;
  leanDegrees:number;
}

const M=1/1000;
const FLOOR_COLORS=["#e9d9bd","#cbdccf","#d5dce8","#e6d4cd","#d9d0e5"];
const SLAB_MM=150;
const DOOR_HEIGHT_MM=2100;

const materialCache=new Map<string,THREE.MeshStandardMaterial>();
function material(color:string,opacity=1,extra:Partial<THREE.MeshStandardMaterialParameters>={}):THREE.MeshStandardMaterial{
  const key=`${color}|${opacity}|${JSON.stringify(extra)}`;
  let cached=materialCache.get(key);
  if(!cached){
    cached=new THREE.MeshStandardMaterial({color,roughness:.85,metalness:0,transparent:opacity<1,opacity,depthWrite:opacity>=1,...extra});
    materialCache.set(key,cached);
  }
  return cached;
}

/** Axis-aligned box from plan-space extents (mm) and a height range (mm). */
function box(minX:number,minY:number,maxX:number,maxY:number,z0:number,z1:number,mat:THREE.Material):THREE.Mesh{
  const width=Math.max(1,maxX-minX)*M,depth=Math.max(1,maxY-minY)*M,height=Math.max(1,z1-z0)*M;
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),mat);
  mesh.position.set((minX+maxX)/2*M,(z0+z1)/2*M,(minY+maxY)/2*M);
  mesh.castShadow=true;mesh.receiveShadow=true;
  return mesh;
}

/** Horizontal slab with the outline of a plan polygon, from z0 to z1 (mm). */
function prism(points:Point[],z0:number,z1:number,mat:THREE.Material):THREE.Mesh{
  // Shape lives in the XY plane; rotating -90° about X maps shape Y to scene -Z, so negate plan Y.
  const shape=new THREE.Shape(points.map(point=>new THREE.Vector2(point.x*M,-point.y*M)));
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:Math.max(1,z1-z0)*M,bevelEnabled:false});
  geometry.rotateX(-Math.PI/2);
  geometry.translate(0,z0*M,0);
  const mesh=new THREE.Mesh(geometry,mat);
  mesh.castShadow=true;mesh.receiveShadow=true;
  return mesh;
}

function polyline(points:Point[],z:number,color:string,dashed=false):THREE.Line{
  const vertices=[...points,points[0]].map(point=>new THREE.Vector3(point.x*M,z*M,point.y*M));
  const geometry=new THREE.BufferGeometry().setFromPoints(vertices);
  const line=new THREE.Line(geometry,dashed?new THREE.LineDashedMaterial({color,dashSize:.6,gapSize:.35}):new THREE.LineBasicMaterial({color}));
  if(dashed)line.computeLineDistances();
  return line;
}

function label(text:string,className:string,position:THREE.Vector3):CSS2DObject{
  const element=document.createElement("div");
  element.className=className;
  element.textContent=text;
  const object=new CSS2DObject(element);
  object.position.copy(position);
  return object;
}

function rectPoints(room:{x:number;y:number;width:number;height:number}):Point[]{
  return [{x:room.x,y:room.y},{x:room.x+room.width,y:room.y},{x:room.x+room.width,y:room.y+room.height},{x:room.x,y:room.y+room.height}];
}

const OPPOSITE:Record<WallSide,WallSide>={top:"bottom",right:"left",bottom:"top",left:"right"};

/** Openings that cut a wall line, as absolute intervals along the wall axis. */
function wallOpenings(room:Room,side:WallSide,level:FloorPlanLevel,neighborIds:string[]){
  const horizontal=side==="top"||side==="bottom";
  const origin=(item:Room)=>horizontal?item.x:item.y;
  const own=level.openings.filter(opening=>opening.roomId===room.id&&opening.side===side).map(opening=>({opening,start:origin(room)+opening.offset}));
  const shared=level.openings.filter(opening=>neighborIds.includes(opening.roomId)&&opening.side===OPPOSITE[side]).flatMap(opening=>{
    const neighbor=level.rooms.find(item=>item.id===opening.roomId);
    return neighbor?[{opening,start:origin(neighbor)+opening.offset}]:[];
  });
  return [...own,...shared].map(({opening,start})=>({opening,start,end:start+opening.width}));
}

function openingHeights(opening:PlanOpening,base:number,height:number){
  return opening.type==="door"
    ?{bottom:base,top:base+Math.min(DOOR_HEIGHT_MM,height*.82)}
    :{bottom:base+height*.42,top:base+height*.72};
}

function buildLevel(level:FloorPlanLevel,index:number,base:number,height:number,showRoomLabels:boolean,group:THREE.Group){
  const rooms=level.rooms;
  rooms.forEach((room,roomIndex)=>{
    const floorColor=room.kind==="lawn"?"#86efac":room.kind==="stairs"?"#d8cbb7":FLOOR_COLORS[roomIndex%FLOOR_COLORS.length];
    const outline=room.points??rectPoints(room);
    // Upper levels get a structural slab; the stilt level sits on the plinth.
    const slab=prism(outline,base-(index>0?SLAB_MM:0),base+20,material(floorColor));
    group.add(slab);
    if(showRoomLabels){
      const centerX=room.x+room.width/2+(room.labelOffset?.x??0),centerY=room.y+room.height/2+(room.labelOffset?.y??0);
      group.add(label(room.name,"house3d-label",new THREE.Vector3(centerX*M,(base+120)*M,centerY*M)));
    }
  });

  const wallMaterial=material("#ece8e1"),stairWallMaterial=material("#d8c6a8",.45);
  const doorMaterial=material("#8a6244"),glassMaterial=material("#77c6df",.55,{roughness:.1,metalness:.1});
  rooms.forEach(room=>{
    if(room.kind==="lawn")return;
    const mat=room.kind==="stairs"?stairWallMaterial:wallMaterial;
    if(room.points){
      // Free-form rooms: walls follow each outline edge, set inside the outline.
      const points=room.points,signed=points.reduce((sum,p,i)=>{const n=points[(i+1)%points.length];return sum+p.x*n.y-n.x*p.y;},0),direction=signed>=0?1:-1;
      points.forEach((start,i)=>{
        const end=points[(i+1)%points.length],dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy);if(length<1)return;
        const thickness=room.wallThicknesses?.top??228.6,nx=-direction*dy/length,ny=direction*dx/length;
        const mesh=new THREE.Mesh(new THREE.BoxGeometry(length*M,height*M,thickness*M),mat);
        mesh.position.set((start.x+end.x)/2*M+nx*thickness/2*M,(base+height/2)*M,(start.y+end.y)/2*M+ny*thickness/2*M);
        mesh.rotation.y=-Math.atan2(dy,dx);
        mesh.castShadow=true;mesh.receiveShadow=true;
        group.add(mesh);
      });
      return;
    }
    (["top","right","bottom","left"] as WallSide[]).forEach(side=>{
      const horizontal=side==="top"||side==="bottom";
      const line=side==="top"?room.y:side==="bottom"?room.y+room.height:side==="left"?room.x:room.x+room.width;
      const origin=horizontal?room.x:room.y;
      getRoomWallSegments(room,side,rooms).forEach(segment=>{
        // A shared wall is drawn once, by the room with the smallest id, centred on the shared line.
        if(segment.shared&&segment.attachedRoomIds.some(id=>id<room.id))return;
        const t=segment.thickness;
        const inward=side==="top"||side==="left"?1:-1;
        const [across0,across1]=segment.shared?[line-t/2,line+t/2]:inward>0?[line,line+t]:[line-t,line];
        const from=origin+segment.start,to=origin+segment.end;
        const cuts=wallOpenings(room,side,level,segment.shared?segment.attachedRoomIds:[])
          .map(cut=>({...cut,start:Math.max(from,cut.start),end:Math.min(to,cut.end)}))
          .filter(cut=>cut.end-cut.start>1).sort((a,b)=>a.start-b.start);
        const piece=(a0:number,a1:number,z0:number,z1:number,pieceMaterial:THREE.Material=mat)=>{
          if(a1-a0<1||z1-z0<1)return;
          group.add(horizontal?box(a0,across0,a1,across1,z0,z1,pieceMaterial):box(across0,a0,across1,a1,z0,z1,pieceMaterial));
        };
        let cursor=from;
        cuts.forEach(cut=>{
          const {bottom,top}=openingHeights(cut.opening,base,height);
          piece(cursor,cut.start,base,base+height);
          piece(cut.start,cut.end,top,base+height);
          if(bottom>base)piece(cut.start,cut.end,base,bottom);
          // Door leaf or glazing sits in the middle of the wall thickness.
          const middle=(across0+across1)/2,thin=Math.min(60,t*.3);
          if(cut.opening.type==="window")piece(cut.start,cut.end,bottom,top,glassMaterial);
          else{const leaf=horizontal?box(cut.start,middle-thin/2,cut.end,middle+thin/2,bottom,top,doorMaterial):box(middle-thin/2,cut.start,middle+thin/2,cut.end,bottom,top,doorMaterial);leaf.scale.set(horizontal?.96:1,1,horizontal?1:.96);group.add(leaf);}
          cursor=Math.max(cursor,cut.end);
        });
        piece(cursor,to,base,base+height);
      });
    });
    if(room.kind==="stairs"){
      // Dog-leg stair: two flights side by side with a mid landing.
      const steps=8,run=room.height/2,half=room.width/2,treadMaterial=material("#c4b59e");
      for(let flight=0;flight<2;flight++)for(let step=0;step<steps;step++){
        const y0=flight===0?room.y+room.height-(step+1)*run/steps:room.y+step*run/steps,y1=y0+run/steps;
        const z=base+height*(flight*steps+step+1)/(steps*2);
        group.add(box(room.x+flight*half+100,y0,room.x+(flight+1)*half-100,y1,z-120,z,treadMaterial));
      }
      group.add(box(room.x+100,room.y,room.x+room.width-100,room.y+Math.min(900,run*.5),base+height/2-120,base+height/2,treadMaterial));
    }
  });

  (level.objects??[]).forEach(item=>{
    if(item.kind==="text")return;
    const furnitureHeight=item.kind==="dining-table"?750:item.kind==="sofa"?800:item.kind==="chair"?900:300;
    const color=item.kind==="dining-table"?"#c19a62":item.kind==="vent-window"?"#77c6df":"#9fb4d8";
    const z0=item.kind==="vent-window"?base+height*.75:base+20;
    group.add(box(item.x,item.y,item.x+item.width,item.y+item.height,z0,z0+(item.kind==="vent-window"?400:furnitureHeight),material(color,item.kind==="vent-window"?.6:1)));
  });
}

function buildSiteFeature(feature:SiteFeature,group:THREE.Group,showLabels:boolean){
  const removed=feature.status==="removed",opacity=removed?.35:feature.status==="proposed"?.92:1;
  const cx=feature.x+feature.width/2,cy=feature.y+feature.height/2;
  switch(feature.kind){
    case "tree":{
      const radius=Math.min(feature.width,feature.height)/2;
      const trunk=new THREE.Mesh(new THREE.CylinderGeometry(radius*.1*M,radius*.14*M,2600*M,10),material("#7c5a3a",opacity));
      trunk.position.set(cx*M,1300*M,cy*M);trunk.castShadow=true;
      const canopy=new THREE.Mesh(new THREE.IcosahedronGeometry(Math.max(600,radius*1.3)*M,1),material(removed?"#b45309":"#3f8f4f",opacity,{flatShading:true}));
      canopy.position.set(cx*M,(2600+radius*.9)*M,cy*M);canopy.castShadow=true;canopy.receiveShadow=true;
      group.add(trunk,canopy);break;
    }
    case "utility":{
      const post=new THREE.Mesh(new THREE.CylinderGeometry(Math.min(feature.width,feature.height)*.25*M,Math.min(feature.width,feature.height)*.25*M,900*M,16),material("#3b82f6",opacity));
      post.position.set(cx*M,450*M,cy*M);post.castShadow=true;group.add(post);break;
    }
    case "building-footprint":
      group.add(box(feature.x,feature.y,feature.x+feature.width,feature.y+feature.height,0,3200,material(removed?"#fca5a5":"#cbd5e1",opacity)));break;
    case "easement":
      group.add(box(feature.x,feature.y,feature.x+feature.width,feature.y+feature.height,0,40,material("#c084fc",.35)));break;
    case "landscape":
    case "lawn":
      group.add(box(feature.x,feature.y,feature.x+feature.width,feature.y+feature.height,0,90,material("#6cc17a",opacity)));break;
    default:{
      const color=feature.kind==="walkway"?"#e8d9b0":feature.kind==="parking"?"#9aa3ad":"#b4bcc6";
      group.add(box(feature.x,feature.y,feature.x+feature.width,feature.y+feature.height,0,60,material(color,opacity)));
    }
  }
  if(showLabels)group.add(label(`${feature.name}${feature.status!=="proposed"?` · ${feature.status}`:""}`,"house3d-label house3d-label-site",new THREE.Vector3(cx*M,(feature.kind==="tree"?4200:feature.kind==="building-footprint"?3400:400)*M,cy*M)));
}

export function buildScene(options:SceneOptions):BuiltScene{
  const root=new THREE.Group(),pickables:THREE.Object3D[]=[];
  const {corners,wallHeightMm:wallHeight,stiltHeightMm:stiltHeight,plinthHeightMm:plinth}=options;

  // ── Site ──
  const site=new THREE.Group();site.name="site";root.add(site);
  const lot=prism(corners,-300,0,material("#a8c49c"));lot.castShadow=false;site.add(lot);
  site.add(polyline(corners,15,"#2f5d3a"));
  if(options.hasSetback)site.add(polyline(options.setbackCorners,25,"#0f766e",true));
  if(options.showSiteFeatures)options.siteFeatures.filter(feature=>feature.visible!==false).forEach(feature=>buildSiteFeature(feature,site,options.showLabels));
  if(options.showLabels){
    const cx=corners.reduce((sum,point)=>sum+point.x,0)/corners.length,cy=corners.reduce((sum,point)=>sum+point.y,0)/corners.length;
    corners.forEach((corner,index)=>{
      const next=corners[(index+1)%corners.length],midX=(corner.x+next.x)/2,midY=(corner.y+next.y)/2;
      const away=Math.hypot(midX-cx,midY-cy)||1,offset=900;
      site.add(label(options.formatLength(Math.hypot(next.x-corner.x,next.y-corner.y)),"house3d-label house3d-label-edge",new THREE.Vector3((midX+(midX-cx)/away*offset)*M,60*M,(midY+(midY-cy)/away*offset)*M)));
    });
  }

  // ── North arrow, placed just outside the plot ──
  const xs=corners.map(point=>point.x),ys=corners.map(point=>point.y);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const arrowSize=Math.max(1200,Math.min(maxX-minX,maxY-minY)*.12);
  const arrowShape=new THREE.Shape([new THREE.Vector2(0,arrowSize*M),new THREE.Vector2(arrowSize*.38*M,-arrowSize*.55*M),new THREE.Vector2(0,-arrowSize*.25*M),new THREE.Vector2(-arrowSize*.38*M,-arrowSize*.55*M)]);
  const arrow=new THREE.Mesh(new THREE.ShapeGeometry(arrowShape),new THREE.MeshBasicMaterial({color:"#dc2626",side:THREE.DoubleSide}));
  arrow.rotation.x=-Math.PI/2;
  arrow.rotation.z=-options.compassRotation*Math.PI/180;
  const arrowX=maxX+arrowSize*1.6,arrowY=minY+arrowSize,northRadians=options.compassRotation*Math.PI/180;
  arrow.position.set(arrowX*M,30*M,arrowY*M);
  site.add(arrow);
  // Plan-up is -Y; north is plan-up turned clockwise by the compass rotation.
  site.add(label("N","house3d-label house3d-label-north",new THREE.Vector3((arrowX+Math.sin(northRadians)*arrowSize*1.6)*M,60*M,(arrowY-Math.cos(northRadians)*arrowSize*1.6)*M)));

  // ── Building ──
  const levels=[options.groundLevel,...options.upperLevels];
  const allRooms=levels.flatMap(level=>level.rooms.filter(room=>room.kind!=="lawn"));
  const footprintRooms=allRooms.length?allRooms:[options.fallbackFootprint];
  const fMinX=Math.min(...footprintRooms.map(room=>room.x)),fMaxX=Math.max(...footprintRooms.map(room=>room.x+room.width));
  const fMinY=Math.min(...footprintRooms.map(room=>room.y)),fMaxY=Math.max(...footprintRooms.map(room=>room.y+room.height));
  root.add(box(fMinX,fMinY,fMaxX,fMaxY,0,plinth,material("#b9c0c7")));

  const levelBase=(index:number)=>plinth+(index===0?0:stiltHeight+(index-1)*wallHeight);
  const levelHeight=(index:number)=>index===0?stiltHeight:wallHeight;
  const visibleLevels=Math.max(1,Math.min(levels.length,options.visibleLevelCount));
  const topOfBuilding=levelBase(visibleLevels-1)+levelHeight(visibleLevels-1);
  const fullHeight=levelBase(levels.length-1)+levelHeight(levels.length-1);

  // The superstructure pivots about the footprint centre so a pillar-removal "lean" preview can tilt it.
  const pivot=new THREE.Vector3((fMinX+fMaxX)/2*M,plinth*M,(fMinY+fMaxY)/2*M);
  const superstructure=new THREE.Group();superstructure.position.copy(pivot);root.add(superstructure);
  const structure=new THREE.Group();structure.position.copy(pivot).multiplyScalar(-1);superstructure.add(structure);

  // Pillars
  const fullWidth=fMaxX-fMinX,fullDepth=fMaxY-fMinY;
  let pillarPoints:{id:string;x:number;y:number}[];
  if(options.pillarLayout==="eight"){
    const turn=((Math.round(options.compassRotation/90)%4)+4)%4;
    const normalized:[string,number,number][]=[["east-north",1,0],["east-middle",1,.5],["east-south",1,1],["west-north",0,0],["west-middle",0,.5],["west-south",0,1],["north-center",.5,0],["inner-center",.5,.5]];
    pillarPoints=normalized.map(([id,u,v])=>{
      let rotated:[number,number]=[u,v];
      if(turn===1)rotated=[1-v,u];else if(turn===2)rotated=[1-u,1-v];else if(turn===3)rotated=[v,1-u];
      return {id,x:fMinX+rotated[0]*fullWidth,y:fMinY+rotated[1]*fullDepth};
    });
  }else{
    const spacing=Math.max(1000,options.pillarSpacingMm),xsGrid:number[]=[],ysGrid:number[]=[];
    for(let x=fMinX;x<fMaxX-1;x+=spacing)xsGrid.push(x);xsGrid.push(fMaxX);
    for(let y=fMinY;y<fMaxY-1;y+=spacing)ysGrid.push(y);ysGrid.push(fMaxY);
    pillarPoints=xsGrid.flatMap((x,xi)=>ysGrid.map((y,yi)=>({id:`grid-${xi}-${yi}`,x,y})));
  }
  const removed=pillarPoints.filter(point=>options.removedPillarIds.includes(point.id));
  const pillarSize=options.pillarLayout==="eight"?300:Math.min(300,options.pillarSpacingMm*.1);
  pillarPoints.filter(point=>!options.removedPillarIds.includes(point.id)).forEach(point=>{
    const x=Math.min(Math.max(point.x-pillarSize/2,fMinX),fMaxX-pillarSize),y=Math.min(Math.max(point.y-pillarSize/2,fMinY),fMaxY-pillarSize);
    const selected=options.selectedPillarId===point.id;
    const mesh=box(x,y,x+pillarSize,y+pillarSize,plinth,topOfBuilding,material(selected?"#f0b84b":"#d5bd97",1,selected?{emissive:"#7c4a03",emissiveIntensity:.35}:{}));
    mesh.userData.pillarId=point.id;
    structure.add(mesh);pickables.push(mesh);
  });

  // Levels
  levels.slice(0,visibleLevels).forEach((level,index)=>{
    const group=new THREE.Group();group.name=`level-${level.id}`;
    // Only the top visible level is labelled; use the level filter to read lower floors.
    const roofed=options.showRoof&&visibleLevels===levels.length;
    buildLevel(level,index,levelBase(index),levelHeight(index),options.showLabels&&!roofed&&index===visibleLevels-1,group);
    structure.add(group);
  });
  if(options.showLabels&&visibleLevels===1&&options.groundLevel.rooms.length===0)structure.add(label("Open stilt · parking","house3d-label house3d-label-stilt",new THREE.Vector3(pivot.x,(plinth+stiltHeight*.45)*M,pivot.z)));

  // Roof over the full building, only when every level is shown.
  if(options.showRoof&&visibleLevels===levels.length){
    const eave=fullHeight,ridge=eave+Math.max(900,fullDepth*.18),overhang=450;
    const x0=(fMinX-overhang)*M,x1=(fMaxX+overhang)*M,z0=(fMinY-overhang)*M,z1=(fMaxY+overhang)*M,zm=(fMinY+fMaxY)/2*M;
    const positions=new Float32Array([
      x0,eave*M,z0, x1,eave*M,z0, x1,ridge*M,zm,  x0,eave*M,z0, x1,ridge*M,zm, x0,ridge*M,zm,
      x0,ridge*M,zm, x1,ridge*M,zm, x1,eave*M,z1,  x0,ridge*M,zm, x1,eave*M,z1, x0,eave*M,z1,
      x0,eave*M,z0, x0,ridge*M,zm, x0,eave*M,z1,   x1,eave*M,z0, x1,eave*M,z1, x1,ridge*M,zm,
    ]);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));geometry.computeVertexNormals();
    const roof=new THREE.Mesh(geometry,material("#9d5544",1,{side:THREE.DoubleSide}));roof.castShadow=true;roof.receiveShadow=true;
    structure.add(roof);
  }

  // Lean preview toward missing supports (a visual cue, not a structural analysis).
  const leanDegrees=Math.min(12,removed.length*2.5);
  if(removed.length){
    const centerX=(fMinX+fMaxX)/2,centerY=(fMinY+fMaxY)/2;
    let leanX=removed.reduce((sum,point)=>sum+point.x,0)/removed.length-centerX,leanY=removed.reduce((sum,point)=>sum+point.y,0)/removed.length-centerY;
    if(Math.hypot(leanX,leanY)<1){leanX=0;leanY=-1;}
    const length=Math.hypot(leanX,leanY),axis=new THREE.Vector3(leanY/length,0,-leanX/length);
    superstructure.quaternion.setFromAxisAngle(axis,leanDegrees*Math.PI/180);
  }

  root.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(lot).union(new THREE.Box3().setFromObject(superstructure));
  return {root,pickables,bounds,pillarCount:pillarPoints.length-removed.length,totalPillars:pillarPoints.length,removedCount:removed.length,leanDegrees};
}

/** Free GPU resources held by a built model. Cached materials are shared and kept. */
export function disposeScene(root:THREE.Object3D){
  root.traverse(object=>{
    if(object instanceof THREE.Mesh||object instanceof THREE.Line){
      object.geometry.dispose();
      const materials=Array.isArray(object.material)?object.material:[object.material];
      materials.forEach(item=>{if(!(item instanceof THREE.MeshStandardMaterial&&[...materialCache.values()].includes(item)))item.dispose();});
    }
    if(object instanceof CSS2DObject)object.element.remove();
  });
}
