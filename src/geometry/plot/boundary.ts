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
