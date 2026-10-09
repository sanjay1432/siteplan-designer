import type { Point } from "../viewport";
import type { PlotCorner } from "../../types/plot";

export type BoundaryValidationReason="too-few-points"|"invalid-point"|"duplicate-id"|"short-segment"|"self-intersection"|"zero-area";
export type BoundaryValidation={valid:true}|{valid:false;reason:BoundaryValidationReason};

function cross(a:Point,b:Point,c:Point){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
function onSegment(a:Point,b:Point,p:Point){return Math.abs(cross(a,b,p))<.01&&p.x>=Math.min(a.x,b.x)-.01&&p.x<=Math.max(a.x,b.x)+.01&&p.y>=Math.min(a.y,b.y)-.01&&p.y<=Math.max(a.y,b.y)+.01;}
function intersects(a:Point,b:Point,c:Point,d:Point){
  const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
  return abC*abD<0&&cdA*cdB<0||onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);
}

/** Validates a simple, non-degenerate, ordered parcel polygon. */
export function validateBoundary(corners:PlotCorner[]):BoundaryValidation{
  if(corners.length<3)return {valid:false,reason:"too-few-points"};
  if(corners.some(point=>typeof point.id!=="string"||typeof point.name!=="string"||!Number.isFinite(point.x)||!Number.isFinite(point.y)))return {valid:false,reason:"invalid-point"};
  if(new Set(corners.map(point=>point.id)).size!==corners.length)return {valid:false,reason:"duplicate-id"};
  for(let i=0;i<corners.length;i++){
    const a=corners[i],b=corners[(i+1)%corners.length];
    if(Math.hypot(b.x-a.x,b.y-a.y)<1)return {valid:false,reason:"short-segment"};
    for(let j=i+1;j<corners.length;j++){
      if(j===(i+1)%corners.length||(j+1)%corners.length===i)continue;
      if(intersects(a,b,corners[j],corners[(j+1)%corners.length]))return {valid:false,reason:"self-intersection"};
    }
  }
  const area=corners.reduce((sum,point,index)=>{const next=corners[(index+1)%corners.length];return sum+point.x*next.y-next.x*point.y;},0)/2;
  return Math.abs(area)>1?{valid:true}:{valid:false,reason:"zero-area"};
}

/** Even-odd point containment; points on an edge (within 0.1 mm) count as inside. */
export function pointInPolygon(point:Point,polygon:Point[]):boolean{
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    const crossValue=(point.x-a.x)*(b.y-a.y)-(point.y-a.y)*(b.x-a.x);
    if(Math.abs(crossValue)<0.1&&point.x>=Math.min(a.x,b.x)-0.1&&point.x<=Math.max(a.x,b.x)+0.1&&point.y>=Math.min(a.y,b.y)-0.1&&point.y<=Math.max(a.y,b.y)+0.1)return true;
    if(((a.y>point.y)!==(b.y>point.y))&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}

/** True when an axis-aligned rectangle lies entirely within a simple (possibly concave) polygon. */
export function rectangleInsidePolygon(x:number,y:number,width:number,height:number,polygon:Point[]):boolean{
  const rectangle:Point[]=[{x,y},{x:x+width,y},{x:x+width,y:y+height},{x,y:y+height}];
  if(!rectangle.every(point=>pointInPolygon(point,polygon)))return false;
  // A boundary crossing the rectangle means part of it lies outside, even when
  // all four rectangle corners happen to be inside a concave polygon.
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length];
    if(a.x>x&&a.x<x+width&&a.y>y&&a.y<y+height)return false;
    for(let j=0;j<rectangle.length;j++){
      const c=rectangle[j],d=rectangle[(j+1)%rectangle.length],denominator=(b.x-a.x)*(d.y-c.y)-(b.y-a.y)*(d.x-c.x);
      if(Math.abs(denominator)<1e-9)continue;
      const t=((c.x-a.x)*(d.y-c.y)-(c.y-a.y)*(d.x-c.x))/denominator;
      const u=((c.x-a.x)*(b.y-a.y)-(c.y-a.y)*(b.x-a.x))/denominator;
      if(t>1e-8&&t<1-1e-8&&u>1e-8&&u<1-1e-8)return false;
    }
  }
  // Sample interior points too so a rectangle cannot bridge a concave notch.
  for(let row=1;row<5;row++)for(let column=1;column<5;column++)if(!pointInPolygon({x:x+width*column/5,y:y+height*row/5},polygon))return false;
  return true;
}

/** Interior angle in degrees at each vertex of a simple polygon (any winding). */
export function interiorAngles(polygon:Point[]):number[]{
  const signedArea=polygon.reduce((sum,point,index)=>{const next=polygon[(index+1)%polygon.length];return sum+point.x*next.y-next.x*point.y;},0);
  const winding=signedArea>=0?1:-1;
  return polygon.map((point,index)=>{
    const previous=polygon[(index+polygon.length-1)%polygon.length],next=polygon[(index+1)%polygon.length];
    const incoming=Math.atan2(point.y-previous.y,point.x-previous.x),outgoing=Math.atan2(next.y-point.y,next.x-point.x);
    let turn=(outgoing-incoming)*180/Math.PI;
    while(turn<=-180)turn+=360;
    while(turn>180)turn-=360;
    return 180-turn*winding;
  });
}

/** Whole-circle bearing of a segment in degrees, clockwise from north, where north is plan-up rotated by `northRotation` degrees clockwise. */
export function segmentBearing(start:Point,end:Point,northRotation=0):number{
  // Plan Y grows downward, so plan-up is -Y.
  const planAngle=Math.atan2(end.x-start.x,-(end.y-start.y))*180/Math.PI;
  return ((planAngle-northRotation)%360+360)%360;
}
