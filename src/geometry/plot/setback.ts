export interface PlanPoint { x:number; y:number }
export type RectangleInsets={top:number;right:number;bottom:number;left:number};

/** Offset each ordered boundary edge inward by its own perpendicular setback. */
export function rectangularSetback(points:PlanPoint[],insets:RectangleInsets):PlanPoint[]{
  return offsetPolygonInwardByEdgeDistances(points,[insets.top,insets.right,insets.bottom,insets.left]);
}

/** Offset a simple polygon inward by a perpendicular distance in millimetres. */
export function offsetPolygonInward(points:PlanPoint[],distance:number):PlanPoint[]{
  if(points.length<3||distance<=0)return points;
  return offsetPolygonInwardByEdgeDistances(points,points.map(()=>distance));
}

/** Unit normal of edge `index` (from point index to index+1) pointing into the polygon. */
export function edgeInwardNormal(points:PlanPoint[],index:number):PlanPoint{
  const origin=points[0];
  const area=points.reduce((sum,p,i)=>{const next=points[(i+1)%points.length];return sum+(p.x-origin.x)*(next.y-origin.y)-(next.x-origin.x)*(p.y-origin.y);},0);
  const direction=area>=0?1:-1,start=points[index],end=points[(index+1)%points.length];
  const dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy)||1;
  return {x:-direction*dy/length,y:direction*dx/length};
}

/** Offset each polygon edge inward by its own perpendicular distance. */
export function offsetPolygonInwardByEdgeDistances(points:PlanPoint[],distances:number[]):PlanPoint[]{
  if(points.length<3||distances.every(distance=>distance<=0))return points;
  const origin=points[0];
  const area=points.reduce((sum,p,index)=>{const next=points[(index+1)%points.length];return sum+(p.x-origin.x)*(next.y-origin.y)-(next.x-origin.x)*(p.y-origin.y);},0)/2;
  const direction=area>=0?1:-1;
  const lines=points.map((start,index)=>{
    const end=points[(index+1)%points.length],dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy)||1,distance=Math.max(0,distances[index]??0);
    return {x:start.x-direction*dy/length*distance,y:start.y+direction*dx/length*distance,dx,dy};
  });
  return points.map((_,index)=>{
    const before=lines[(index+lines.length-1)%lines.length],after=lines[index];
    const cross=before.dx*after.dy-before.dy*after.dx;
    if(Math.abs(cross)<1e-9)return {x:(before.x+after.x)/2,y:(before.y+after.y)/2};
    const t=((after.x-before.x)*after.dy-(after.y-before.y)*after.dx)/cross;
    return {x:before.x+t*before.dx,y:before.y+t*before.dy};
  });
}
