import type { PlotCorner } from "../../types/plot";
import { validateBoundary } from "./boundary";

export type SurveyCoordinateUnit="mm"|"m"|"ft";
export interface ParsedSurveyBoundary {
  corners:PlotCorner[];
  originX:number;
  originY:number;
  unit:SurveyCoordinateUnit;
  sourcePoints:Array<{name:string;x:number;y:number}>;
}
export type SurveyCsvResult={success:true;boundary:ParsedSurveyBoundary}|{success:false;error:string};

function parseRow(line:string,delimiter:string):string[]|null{
  const cells:string[]=[];let value="",quoted=false;
  for(let i=0;i<line.length;i++){
    const char=line[i];
    if(char==='"'){
      if(quoted&&line[i+1]==='"'){value+='"';i++;}
      else quoted=!quoted;
    }else if(char===delimiter&&!quoted){cells.push(value.trim());value="";}
    else value+=char;
  }
  if(quoted)return null;
  cells.push(value.trim());return cells;
}

/** Parse a headered survey coordinate table and translate it to a local millimetre origin. */
export function parseSurveyCoordinateCsv(text:string,unit:SurveyCoordinateUnit):SurveyCsvResult{
  const lines=text.replace(/^\uFEFF/,"").split(/\r?\n/).map((line,index)=>({line:line.trim(),number:index+1})).filter(row=>row.line&&!row.line.startsWith("#"));
  if(lines.length<4)return {success:false,error:"Add a header and at least three survey point rows."};
  const first=lines[0].line;
  const delimiter=[",","\t",";"].map(value=>({value,count:first.split(value).length-1})).sort((a,b)=>b.count-a.count)[0];
  if(!delimiter.count)return {success:false,error:"Could not find delimited columns. Use CSV or tab-separated data."};
  const header=parseRow(first,delimiter.value);
  if(!header)return {success:false,error:"The header row has an unclosed quote."};
  const normalize=(value:string)=>value.toLowerCase().replace(/[\s_-]/g,"");
  const columns=header.map(normalize);
  const xIndex=columns.findIndex(value=>["x","easting","east","xcoordinate"].includes(value));
  const yIndex=columns.findIndex(value=>["y","northing","north","ycoordinate"].includes(value));
  const nameIndex=columns.findIndex(value=>["point","name","label","id"].includes(value));
  if(xIndex<0||yIndex<0||xIndex===yIndex)return {success:false,error:"Include coordinate headers named x/easting and y/northing."};
  const points:Array<{name:string;x:number;y:number;line:number}>=[];
  for(const row of lines.slice(1)){
    const values=parseRow(row.line,delimiter.value);
    if(!values)return {success:false,error:`Row ${row.number} has an unclosed quote.`};
    const rawX=values[xIndex],rawY=values[yIndex];
    const x=Number(rawX),y=Number(rawY);
    if(!rawX||!rawY||!Number.isFinite(x)||!Number.isFinite(y))return {success:false,error:`Row ${row.number} must contain finite numeric X and Y coordinates.`};
    points.push({name:(nameIndex>=0?values[nameIndex]:"")||`P${points.length+1}`,x,y,line:row.number});
  }
  const firstPoint=points[0],lastPoint=points[points.length-1];
  if(points.length>3&&Math.hypot(firstPoint.x-lastPoint.x,firstPoint.y-lastPoint.y)<1e-9)points.pop();
  if(points.length<3)return {success:false,error:"At least three distinct boundary points are required."};
  if(new Set(points.map(point=>point.name.toLowerCase())).size!==points.length)return {success:false,error:"Survey point names must be unique."};
  const scale=unit==="mm"?1:unit==="m"?1000:304.8;
  const corners=points.map(point=>({id:`corner-${crypto.randomUUID()}`,name:point.name,x:(point.x-firstPoint.x)*scale,y:-(point.y-firstPoint.y)*scale}));
  const validation=validateBoundary(corners);
  if(!validation.valid){
    const message=validation.reason==="self-intersection"?"Survey segments cross. Arrange rows in order around the parcel boundary."
      :validation.reason==="short-segment"?"Survey contains duplicate or near-duplicate consecutive points."
      :validation.reason==="zero-area"?"Survey points do not enclose a usable parcel area."
      :"Survey boundary points are invalid.";
    return {success:false,error:message};
  }
  return {success:true,boundary:{corners,originX:firstPoint.x,originY:firstPoint.y,unit,sourcePoints:points.map(({name,x,y})=>({name,x,y}))}};
}
