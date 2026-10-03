export interface PlanPoint { x:number; y:number }

/** Offset a simple polygon inward by a perpendicular distance in millimetres. */
export function offsetPolygonInward(points:PlanPoint[],distance:number):PlanPoint[]{
  if(points.length<3||distance<=0)return points;
  const area=points.reduce((sum,p,index)=>{const next=points[(index+1)%points.length];return sum+p.x*next.y-next.x*p.y;},0)/2;
  const direction=area>=0?1:-1;
  const lines=points.map((start,index)=>{
    const end=points[(index+1)%points.length],dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy)||1;
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
