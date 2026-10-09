import { getRoomWallInset, getRoomWallSegments } from "../geometry/plot/model";
import type { FloorPlanLevel, MeasurementLine, ProjectAssumption, ProjectDetails, ProjectIssue, SiteFeature, SurveyMetadata, WallSide } from "../geometry/plot/model";
import { offsetPolygonInwardByEdgeDistances } from "../geometry/plot/setback";
import { interiorAngles, segmentBearing } from "../geometry/plot/boundary";
import type { PlotCorner, PlotMetrics } from "../types/plot";

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportProjectJson(projectName: string, data: unknown) {
  const safeName = projectName.trim().replace(/[^a-z0-9-_]+/gi, "-") || "site-plan";
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `${safeName}.siteplan.json`);
}

function serializeCanvas(svg: SVGSVGElement, multiplier = 1) {
  const rect = svg.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width * multiplier));
  clone.setAttribute("height", String(height * multiplier));
  clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  clone.style.background = "#f1f5f9";
  return { source: new XMLSerializer().serializeToString(clone), width, height };
}

export function exportCanvasSvg(svg: SVGSVGElement, name: string) {
  const { source } = serializeCanvas(svg);
  const safeName = name.trim().replace(/[^a-z0-9-_]+/gi, "-") || "site-plan";
  downloadBlob(new Blob([source], { type: "image/svg+xml;charset=utf-8" }), `${safeName}.svg`);
}

export function exportCanvasPng(svg: SVGSVGElement, name: string) {
  const { source, width, height } = serializeCanvas(svg, 2);
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * 2;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#f1f5f9";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const safeName = name.trim().replace(/[^a-z0-9-_]+/gi, "-") || "site-plan";
    canvas.toBlob(blob => {
      if (blob) downloadBlob(blob, `${safeName}.png`);
    }, "image/png");
  };
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
}

export function printCanvasPdf(svg: SVGSVGElement) {
  const popup = window.open("", "_blank");
  if (!popup) return false;
  const { source } = serializeCanvas(svg);
  popup.document.title = "Site plan PDF";
  popup.document.body.style.cssText = "margin:0;display:grid;place-items:center;min-height:100vh;background:white";
  const image = popup.document.createElement("img");
  image.alt = "Site plan";
  image.style.cssText = "width:100%;height:100%;max-width:100vw;max-height:100vh;object-fit:contain";
  image.onload = () => popup.print();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  popup.document.body.append(image);
  const style = popup.document.createElement("style");
  style.textContent = "@page{size:landscape;margin:10mm}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}@media print{img{width:100%;height:95vh}}";
  popup.document.head.append(style);
  return true;
}

export interface ProjectReportData {
  name:string;
  corners:PlotCorner[];
  /** Edge i runs from corner i to corner i+1. */
  boundaryEdges:{label:string;lengthMm:number;setbackMm:number}[];
  metrics:PlotMetrics;
  unitSystem:"imperial"|"metric";
  compassRotation:number;
  floors:FloorPlanLevel[];
  measurements:MeasurementLine[];
  details:ProjectDetails;
  assumptions?:ProjectAssumption[];
  issues?:ProjectIssue[];
  survey?:SurveyMetadata;
  siteFeatures?:SiteFeature[];
}

const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!));
interface ReportFormat {len:(mm:number)=>string;area:(sqMm:number)=>string;unitName:string}
function reportFormat(unitSystem:ProjectReportData["unitSystem"]):ReportFormat{
  return unitSystem==="metric"
    ?{len:mm=>`${(mm/1000).toFixed(2)} m`,area:sqMm=>`${(sqMm/1e6).toFixed(2)} m²`,unitName:"metres"}
    :{len:mm=>`${(mm/304.8).toFixed(2)} ft`,area:sqMm=>`${(sqMm/(304.8*304.8)).toFixed(1)} sq ft`,unitName:"feet"};
}
function rectangleUnionArea(rectangles:{x:number;y:number;width:number;height:number}[]):number{
  const valid=rectangles.filter(rect=>rect.width>0&&rect.height>0);
  const xs=[...new Set(valid.flatMap(rect=>[rect.x,rect.x+rect.width]))].sort((a,b)=>a-b);
  let area=0;
  for(let index=0;index<xs.length-1;index++){
    const left=xs[index],right=xs[index+1],middle=(left+right)/2;
    const spans=valid.filter(rect=>rect.x<middle&&rect.x+rect.width>middle).map(rect=>[rect.y,rect.y+rect.height] as [number,number]).sort((a,b)=>a[0]-b[0]);
    let covered=0,start:number|undefined,end:number|undefined;
    for(const [nextStart,nextEnd] of spans){if(start===undefined){start=nextStart;end=nextEnd;}else if(nextStart<=end!){end=Math.max(end!,nextEnd);}else{covered+=end!-start;start=nextStart;end=nextEnd;}}
    if(start!==undefined)covered+=end!-start;
    area+=(right-left)*covered;
  }
  return area;
}
function modeledFloorAreas(floor:FloorPlanLevel){
  const gross=floor.rooms.map(room=>({x:room.x,y:room.y,width:room.width,height:room.height}));
  const clear=floor.rooms.map(room=>{const left=getRoomWallInset(room,"left",floor.rooms),right=getRoomWallInset(room,"right",floor.rooms),top=getRoomWallInset(room,"top",floor.rooms),bottom=getRoomWallInset(room,"bottom",floor.rooms);return{x:room.x+left,y:room.y+top,width:Math.max(0,room.width-left-right),height:Math.max(0,room.height-top-bottom)};});
  return {gross:rectangleUnionArea(gross),clear:rectangleUnionArea(clear)};
}
function sitePlanSvg(data:ProjectReportData,{len}:ReportFormat){
  const xs=data.corners.map(point=>point.x),ys=data.corners.map(point=>point.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),pad=Math.max(maxX-minX,maxY-minY)*.12,font=Math.max(maxX-minX,maxY-minY)*.025;
  const outer=data.corners.map(point=>`${point.x},${point.y}`).join(" "),inner=offsetPolygonInwardByEdgeDistances(data.corners,data.boundaryEdges.map(edge=>edge.setbackMm)).map(point=>`${point.x},${point.y}`).join(" ");
  const palette:Record<SiteFeature["kind"],{fill:string;stroke:string}>={"building-footprint":{fill:"#dbeafe",stroke:"#1d4ed8"},driveway:{fill:"#e2e8f0",stroke:"#475569"},parking:{fill:"#f1f5f9",stroke:"#64748b"},walkway:{fill:"#fef3c7",stroke:"#b45309"},landscape:{fill:"#dcfce7",stroke:"#15803d"},lawn:{fill:"#bbf7d0",stroke:"#15803d"},tree:{fill:"#bbf7d0",stroke:"#15803d"},utility:{fill:"#ede9fe",stroke:"#6d28d9"},easement:{fill:"#fee2e2",stroke:"#dc2626"},other:{fill:"#e0f2fe",stroke:"#0369a1"}};
  const features=(data.siteFeatures??[]).filter(feature=>feature.visible!==false).map(feature=>{const colors=palette[feature.kind],opacity=feature.status==="removed"?.35:1,dash=feature.status==="proposed"||feature.status==="removed"?` stroke-dasharray="${font*.35} ${font*.2}"`:"",label=escapeHtml(feature.name);if(feature.kind==="tree")return `<g opacity="${opacity}"><circle cx="${feature.x+feature.width/2}" cy="${feature.y+feature.height/2}" r="${Math.min(feature.width,feature.height)*.42}" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="${font*.12}"${dash}/><text x="${feature.x+feature.width/2}" y="${feature.y+feature.height/2+font*.2}" text-anchor="middle" font-size="${font*.45}" fill="#14532d">${label}</text></g>`;return `<g opacity="${opacity}"><rect x="${feature.x}" y="${feature.y}" width="${feature.width}" height="${feature.height}" rx="${font*.1}" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="${font*.12}"${dash}/>${feature.kind==="parking"?`<path d="M ${feature.x+feature.width/3} ${feature.y} V ${feature.y+feature.height} M ${feature.x+2*feature.width/3} ${feature.y} V ${feature.y+feature.height}" stroke="${colors.stroke}" stroke-width="${font*.06}"/>`:""}<text x="${feature.x+feature.width/2}" y="${feature.y+feature.height/2+font*.18}" text-anchor="middle" font-size="${font*.48}" fill="#1e293b">${label}</text></g>`;}).join("");
  // Building footprint: every space on every level, so overhangs on upper floors show too.
  const buildingRooms=data.floors.flatMap(floor=>floor.rooms).filter(room=>room.kind!=="lawn");
  const building=buildingRooms.length?(()=>{const bx=Math.min(...buildingRooms.map(room=>room.x)),by=Math.min(...buildingRooms.map(room=>room.y)),bw=Math.max(...buildingRooms.map(room=>room.x+room.width))-bx,bh=Math.max(...buildingRooms.map(room=>room.y+room.height))-by;
    return `<g>${buildingRooms.map(room=>`<rect x="${room.x}" y="${room.y}" width="${room.width}" height="${room.height}" fill="#cbd5e1" fill-opacity=".55" stroke="#475569" stroke-width="${font*.05}"/>`).join("")}<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="none" stroke="#1e293b" stroke-width="${font*.12}"/><text x="${bx+bw/2}" y="${by+bh/2}" text-anchor="middle" font-size="${font*.6}" font-weight="700" fill="#1e293b">PROPOSED BUILDING</text><text x="${bx+bw/2}" y="${by+bh/2+font*.8}" text-anchor="middle" font-size="${font*.48}" fill="#334155">${len(bw)} × ${len(bh)}</text></g>`;})():"";
  const labels=data.corners.map((point,index)=>`<text x="${point.x+font*.35}" y="${point.y-font*.35}" font-size="${font}" font-weight="700" fill="#334155">${escapeHtml(point.name||String.fromCharCode(65+index))}</text>`).join("");
  const edges=data.corners.map((point,index)=>{const next=data.corners[(index+1)%data.corners.length];return `<text x="${(point.x+next.x)/2}" y="${(point.y+next.y)/2-font*.4}" text-anchor="middle" font-size="${font*.72}" fill="#1e293b">${len(Math.hypot(next.x-point.x,next.y-point.y))}</text>`;}).join("");
  const north=`<g transform="translate(${minX+pad*.55} ${minY+pad*.8})"><text x="0" y="${-font*.7}" text-anchor="middle" font-size="${font*.7}" font-weight="700" fill="#334155">N</text><g transform="rotate(${data.compassRotation})"><path d="M 0 ${-font*.5} L ${font*.22} ${font*.45} L 0 ${font*.26} L ${-font*.22} ${font*.45} Z" fill="#dc2626" stroke="#991b1b" stroke-width="${font*.025}"/></g></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX-pad} ${minY-pad} ${maxX-minX+2*pad} ${maxY-minY+2*pad}"><rect x="${minX-pad}" y="${minY-pad}" width="${maxX-minX+2*pad}" height="${maxY-minY+2*pad}" fill="white"/><polygon points="${outer}" fill="#f8fafc" stroke="#1e293b" stroke-width="${font*.2}"/><polygon points="${inner}" fill="#ccfbf1" fill-opacity=".48" stroke="#0f766e" stroke-width="${font*.16}" stroke-dasharray="${font*.6} ${font*.4}"/>${features}${building}${north}${labels}${edges}</svg>`;
}
function floorPlanSvg(floor:FloorPlanLevel,{len}:ReportFormat){
  const rooms=floor.rooms,objects=floor.objects??[];
  if(!rooms.length&&!objects.length)return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400"><rect width="800" height="400" fill="white"/><text x="400" y="200" text-anchor="middle" fill="#64748b" font-size="24">No spaces defined for this level</text></svg>`;
  const extents=[...rooms.map(room=>({x:room.x,y:room.y,width:room.width,height:room.height})),...objects.map(item=>({x:item.x,y:item.y,width:item.width,height:item.height}))];
  const minX=Math.min(...extents.map(item=>item.x)),minY=Math.min(...extents.map(item=>item.y)),maxX=Math.max(...extents.map(item=>item.x+item.width)),maxY=Math.max(...extents.map(item=>item.y+item.height)),pad=Math.max(maxX-minX,maxY-minY)*.1,font=Math.max(maxX-minX,maxY-minY)*.025;
  const shapes=rooms.map(room=>{const insideW=Math.max(0,room.width-getRoomWallInset(room,"left",rooms)-getRoomWallInset(room,"right",rooms)),insideH=Math.max(0,room.height-getRoomWallInset(room,"top",rooms)-getRoomWallInset(room,"bottom",rooms));return `<g><rect x="${room.x}" y="${room.y}" width="${room.width}" height="${room.height}" fill="${room.kind==="stairs"?"#fff7ed":room.kind==="lawn"?"#bbf7d0":"#f0fdfa"}"/><text x="${room.x+room.width/2}" y="${room.y+room.height/2-font*.2}" text-anchor="middle" font-size="${font*.72}" fill="#0f172a">${escapeHtml(room.name)}</text><text x="${room.x+room.width/2}" y="${room.y+room.height/2+font*.8}" text-anchor="middle" font-size="${font*.52}" fill="#475569">${len(insideW)} × ${len(insideH)}</text></g>`;}).join("");
  const objectShapes=objects.map(item=>item.kind==="text"?`<text x="${item.x+item.width/2}" y="${item.y+item.height/2}" text-anchor="middle" dominant-baseline="middle" font-size="${Math.min(item.height*.55,280)}" fill="#334155">${escapeHtml(item.text??"")}</text>`:item.kind==="vent-window"?`<g stroke="#0284c7" stroke-width="24"><line x1="${item.x}" y1="${item.y+item.height*.25}" x2="${item.x+item.width}" y2="${item.y+item.height*.25}"/><line x1="${item.x}" y1="${item.y+item.height*.75}" x2="${item.x+item.width}" y2="${item.y+item.height*.75}"/></g>`:item.kind==="chair"?`<g><rect x="${item.x+item.width*.16}" y="${item.y+item.height*.12}" width="${item.width*.68}" height="${item.height*.68}" rx="35" fill="#dbeafe" stroke="#475569" stroke-width="24"/><line x1="${item.x+item.width*.2}" y1="${item.y+item.height*.84}" x2="${item.x+item.width*.8}" y2="${item.y+item.height*.84}" stroke="#475569" stroke-width="24"/></g>`:`<rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" rx="${item.kind==="sofa"?100:60}" fill="${item.kind==="dining-table"?"#f5e6c8":"#dbeafe"}" stroke="#475569" stroke-width="24"/>`).join("");
  const walls=rooms.flatMap(room=>(["top","right","bottom","left"] as WallSide[]).flatMap(side=>{
    const horizontal=side==="top"||side==="bottom",start=horizontal?room.x:room.y,span=horizontal?room.width:room.height,coordinate=side==="top"?room.y:side==="bottom"?room.y+room.height:side==="left"?room.x:room.x+room.width;
    const openings=floor.openings.filter(item=>item.roomId===room.id&&item.side===side).map(item=>({start:Math.max(0,item.offset),end:Math.min(span,item.offset+item.width),item})).filter(interval=>interval.end>interval.start).sort((a,b)=>a.start-b.start);
    const segments=getRoomWallSegments(room,side,rooms);
    const lines=segments.map(segment=>{const breaks=[segment.start,...openings.flatMap(opening=>[Math.max(segment.start,opening.start),Math.min(segment.end,opening.end)]).filter(value=>value>segment.start&&value<segment.end),segment.end].sort((a,b)=>a-b),parts:string[]=[];
      for(let index=0;index<breaks.length-1;index++){const from=breaks[index],to=breaks[index+1],middle=(from+to)/2;if(openings.some(opening=>opening.start<=middle&&opening.end>=middle))continue;const a=start+from,b=start+to,attrs=horizontal?`x1="${a}" y1="${coordinate}" x2="${b}" y2="${coordinate}"`:`x1="${coordinate}" y1="${a}" x2="${coordinate}" y2="${b}"`;parts.push(`<line ${attrs} stroke="#334155" stroke-width="${segment.thickness}"/>`);}
      return parts.join("");
    }).join("");
    const marks=openings.map(({start:from,end:to,item})=>{const a=start+from,b=start+to,attrs=horizontal?`x1="${a}" y1="${coordinate}" x2="${b}" y2="${coordinate}"`:`x1="${coordinate}" y1="${a}" x2="${coordinate}" y2="${b}"`,color=item.type==="door"?"#7c3aed":"#0284c7",dash=item.type==="window"?` stroke-dasharray="${font*.12} ${font*.08}"`:"",wallThickness=Math.max(...segments.filter(segment=>segment.start<to&&segment.end>from).map(segment=>segment.thickness),font*.08);return `<line ${attrs} stroke="${color}" stroke-width="${Math.max(wallThickness*.45,font*.08)}"${dash}/>`;}).join("");
    return lines+marks;
  })).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX-pad} ${minY-pad} ${maxX-minX+2*pad} ${maxY-minY+2*pad}"><rect x="${minX-pad}" y="${minY-pad}" width="${maxX-minX+2*pad}" height="${maxY-minY+2*pad}" fill="white"/>${shapes}${walls}${objectShapes}</svg>`;
}
const svgData=(svg:string)=>`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Opens a print-ready, multi-section project report; the browser can save it as a PDF. */
export function printProjectReport(data:ProjectReportData){
  const popup=window.open("","_blank");
  if(!popup)return false;
  const format=reportFormat(data.unitSystem),{len,area}=format,angles=interiorAngles(data.corners);
  const dims=data.boundaryEdges.map((edge,index)=>{const start=data.corners[index],end=data.corners[(index+1)%data.corners.length];return `<tr><th>${escapeHtml(edge.label||`Boundary ${index+1}`)}</th><td>${len(edge.lengthMm)}</td><td>${start&&end?`${segmentBearing(start,end,data.compassRotation).toFixed(1)}°`:""}</td></tr>`;}).join("");
  const setbacks=data.boundaryEdges.map((edge,index)=>`<tr><th>${escapeHtml(edge.label||`Boundary ${index+1}`)}</th><td>${len(edge.setbackMm)}</td></tr>`).join("");
  const corners=data.corners.map((corner,index)=>`<tr><th>${escapeHtml(corner.name)}</th><td>${len(corner.x)}, ${len(corner.y)}</td><td>${angles[index].toFixed(2)}°</td></tr>`).join("");
  const totalModeledArea=data.floors.reduce((total,floor)=>total+modeledFloorAreas(floor).gross,0);
  const floorAreaRows=data.floors.map(floor=>{const areas=modeledFloorAreas(floor);return `<tr><td>${escapeHtml(floor.name)}</td><td>${area(areas.gross)}</td><td>${area(areas.clear)}</td><td>${floor.rooms.length}</td></tr>`;}).join("");
  const floors=data.floors.map(floor=>{
    const rows=floor.rooms.map(room=>{
      const doors=floor.openings.filter(item=>item.roomId===room.id&&item.type==="door").length;
      const windows=floor.openings.filter(item=>item.roomId===room.id&&item.type==="window").length;
      const insideWidth=Math.max(0,room.width-getRoomWallInset(room,"left",floor.rooms)-getRoomWallInset(room,"right",floor.rooms));
      const insideHeight=Math.max(0,room.height-getRoomWallInset(room,"top",floor.rooms)-getRoomWallInset(room,"bottom",floor.rooms));
      return `<tr><td>${escapeHtml(room.name)}</td><td>${room.kind==="stairs"?"Stairwell":room.kind==="lawn"?"Lawn area":"Room"}</td><td>${len(room.width)} × ${len(room.height)}</td><td>${len(insideWidth)} × ${len(insideHeight)}</td><td>${area(insideWidth*insideHeight)}</td><td>${doors}</td><td>${windows}</td></tr>`;
    }).join("");
    const wallRows=floor.rooms.flatMap(room=>(["top","right","bottom","left"] as WallSide[]).flatMap(side=>getRoomWallSegments(room,side,floor.rooms).map(segment=>`<tr><td>${escapeHtml(room.name)}</td><td>${side}</td><td>${len(segment.start)}–${len(segment.end)}</td><td>${segment.shared?"Shared interior wall":"Exposed wall"}</td><td>${len(segment.thickness)}</td></tr>`))).join("");
    const openingRows=floor.openings.map(opening=>{const room=floor.rooms.find(item=>item.id===opening.roomId);return `<tr><td>${escapeHtml(room?.name??"Unassigned space")}</td><td>${opening.type}</td><td>${opening.side}</td><td>${len(opening.offset)}</td><td>${len(opening.width)}</td></tr>`;}).join("");
    return `<section><h2>${escapeHtml(floor.name)}</h2>${rows?`<table><thead><tr><th>Space</th><th>Type</th><th>Overall dimensions</th><th>Clear inside dimensions</th><th>Clear area</th><th>Doors</th><th>Windows</th></tr></thead><tbody>${rows}</tbody></table>`:"<p>No rooms defined.</p>"}${wallRows?`<h3>Wall thickness schedule</h3><table><thead><tr><th>Space</th><th>Side</th><th>Side segment</th><th>Condition</th><th>Thickness</th></tr></thead><tbody>${wallRows}</tbody></table>`:""}${openingRows?`<h3>Opening schedule</h3><table><thead><tr><th>Space</th><th>Type</th><th>Wall side</th><th>Offset from side start</th><th>Width</th></tr></thead><tbody>${openingRows}</tbody></table>`:"<p>No door or window openings defined.</p>"}</section>`;
  }).join("");
  const drawing=`<section class="drawing"><h2>Site plan</h2><img alt="Site boundary, setback, and site feature plan" src="${svgData(sitePlanSvg(data,format))}"><p class="legend"><b>Legend:</b> heavy outline = plot boundary · teal dashed = setback line · grey = proposed building (all levels, overall extent noted) · features: solid outline = existing, dashed = proposed, pale dashed = removed. North arrow indicates project orientation.</p></section>`;
  const floorDrawings=data.floors.map(floor=>`<section class="drawing"><h2>${escapeHtml(floor.name)} plan</h2><img alt="${escapeHtml(floor.name)} floor plan" src="${svgData(floorPlanSvg(floor,format))}"><p class="legend"><b>Openings:</b> purple = door · blue dashed = window. Wall bands use their modeled thickness; each room is filled separately.</p></section>`).join("");
  const measured=data.measurements.length?`<section><h2>Measured references</h2><p>Endpoint coordinates are local plan X/Y values from the drawing origin. Survey coordinates, when present, are listed separately in their original units.</p><table><thead><tr><th>#</th><th>Start X / Y</th><th>End X / Y</th><th>Length</th></tr></thead><tbody>${data.measurements.map((item,index)=>`<tr><td>${index+1}</td><td>${len(item.start.x)}, ${len(item.start.y)}</td><td>${len(item.end.x)}, ${len(item.end.y)}</td><td>${len(Math.hypot(item.end.x-item.start.x,item.end.y-item.start.y))}</td></tr>`).join("")}</tbody></table></section>`:"";
  const projectInfo=[["Client / owner",data.details.clientName],["Project number",data.details.projectNumber],["Site address",data.details.siteAddress],["Prepared by",data.details.preparedBy],["Revision",data.details.revision]].filter(([,value])=>value.trim()).map(([label,value])=>`<tr><th>${label}</th><td>${escapeHtml(value)}</td></tr>`).join("");
  const surveyInfo=data.survey?`<tr><th>Survey source</th><td>${escapeHtml(data.survey.sourceFile)}</td></tr><tr><th>Coordinate reference</th><td>${escapeHtml(data.survey.coordinateReference)}</td></tr><tr><th>Coordinate units</th><td>${data.survey.coordinateUnit}</td></tr><tr><th>Survey origin</th><td>${data.survey.originX}, ${data.survey.originY}</td></tr>${data.survey.designBoundaryEditedAt?`<tr><th>Design boundary edited</th><td>${new Date(data.survey.designBoundaryEditedAt).toLocaleString()}</td></tr>`:""}`:"";
  const details=projectInfo||data.details.notes.trim()||surveyInfo?`<section><h2>Project information</h2>${projectInfo||surveyInfo?`<table>${projectInfo}${surveyInfo}</table>`:""}${data.details.notes.trim()?`<h3>Notes</h3><p class="notes">${escapeHtml(data.details.notes)}</p>`:""}</section>`:"";
  const assumptions=data.assumptions?.length?`<section><h2>Assumptions register</h2><p>Items marked assumed have not been recorded as confirmed in this project model.</p><table><thead><tr><th>Item</th><th>Status</th><th>Basis / source</th></tr></thead><tbody>${data.assumptions.map(item=>`<tr><td>${escapeHtml(item.description)}</td><td>${item.status==="assumed"?"Assumed":"Confirmed"}</td><td>${escapeHtml(item.source??"")}</td></tr>`).join("")}</tbody></table></section>`:"";
  const surveySchedule=data.survey?`<section><h2>Source survey coordinates</h2><p>Original coordinate values are retained in ${data.survey.coordinateUnit} before conversion to the drawing's local millimetre grid.${data.survey.designBoundaryEditedAt?" The current design boundary was edited after this survey import; these source coordinates remain unchanged.":""}</p><table><thead><tr><th>Point</th><th>Easting / X</th><th>Northing / Y</th></tr></thead><tbody>${data.survey.sourcePoints.map(point=>`<tr><td>${escapeHtml(point.name)}</td><td>${point.x}</td><td>${point.y}</td></tr>`).join("")}</tbody></table></section>`:"";
  const featureSchedule=data.siteFeatures?.length?`<section><h2>Site feature schedule</h2><p>Feature areas are mapped extents for coordination and are not a code or lot-coverage calculation. Hidden features remain listed here but do not appear in the site drawing.</p><table><thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Visibility</th><th>Mapped dimensions</th><th>Mapped extent</th></tr></thead><tbody>${data.siteFeatures.map(feature=>`<tr><td>${escapeHtml(feature.name)}</td><td>${escapeHtml(feature.kind.replaceAll("-"," "))}</td><td>${escapeHtml(feature.status)}</td><td>${feature.visible===false?"Hidden":"Shown"}</td><td>${len(feature.width)} × ${len(feature.height)}</td><td>${area(feature.width*feature.height)}</td></tr>`).join("")}</tbody></table></section>`:"";
  popup.document.title=`${data.name} · Site plan report`;
  popup.document.body.innerHTML=`<main><header><p class="eyebrow">SITE PLAN REPORT</p><h1>${escapeHtml(data.name)}</h1><p>Prepared ${new Date().toLocaleDateString()} · North orientation ${data.compassRotation.toFixed(0)}°</p></header>${details}${assumptions}<section><h2>Site summary</h2><div class="stats"><p><b>${area(data.metrics.areaSqMm)}</b><small>Plot area</small></p><p><b>${len(data.metrics.perimeterMm)}</b><small>Perimeter</small></p><p><b>${area(totalModeledArea)}</b><small>Modeled floor area</small></p></div><div class="columns"><div><h3>Boundary dimensions</h3><table><tr><th>Edge</th><th>Length</th><th>Bearing</th></tr>${dims}</table></div><div><h3>Setbacks</h3><table>${setbacks}</table></div><div><h3>Plot corners</h3><table><tr><th>Point</th><th>X, Y</th><th>Interior angle</th></tr>${corners}</table></div></div></section><section><h2>Modeled floor area</h2><p>Area is calculated from the union of modeled room rectangles at each level. It is a design quantity, not a code-defined gross floor area or an approval calculation.</p><table><thead><tr><th>Level</th><th>Room footprint union</th><th>Clear-space union</th><th>Spaces</th></tr></thead><tbody>${floorAreaRows}</tbody></table><p><b>Total room footprint across levels:</b> ${area(totalModeledArea)}</p></section>${surveySchedule}${drawing}${featureSchedule}${floorDrawings}${floors}${measured}<footer>Generated with SitePlan Designer · Dimensions are in ${format.unitName} unless noted. Bearings are clockwise from the project north arrow. Verify site conditions and applicable local requirements before construction.</footer></main><style>*{box-sizing:border-box}body{margin:0;color:#172033;font:13px/1.5 Arial,sans-serif}main{max-width:1000px;margin:auto;padding:36px}header{border-bottom:3px solid #0f766e;padding-bottom:18px;margin-bottom:24px}h1{font-size:30px;margin:3px 0}h2{font-size:18px;color:#0f4c5c;margin:24px 0 10px}h3{font-size:13px;margin:0 0 7px}.eyebrow{font-size:10px;letter-spacing:2px;color:#0f766e;font-weight:bold}.stats,.columns{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.stats p{margin:0;padding:13px;background:#f0fdfa;border:1px solid #ccfbf1;border-radius:6px}.stats b,.stats small{display:block}.stats b{font-size:20px}.stats small{color:#64748b}.notes{white-space:pre-wrap}table{width:100%;border-collapse:collapse;margin:8px 0 16px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e2e8f0}th{font-weight:600;color:#475569;text-transform:capitalize}.drawing img{width:100%;max-height:650px;object-fit:contain;border:1px solid #cbd5e1;background:#f8fafc}footer{margin-top:28px;padding-top:12px;border-top:1px solid #cbd5e1;color:#64748b;font-size:10px}@media print{main{max-width:none;padding:12mm}.drawing{break-before:page}section{break-inside:avoid}header{break-inside:avoid}}</style>`;
  const issueHeader=popup.document.querySelector("header p:last-child");
  if(issueHeader&&data.details.revision.trim())issueHeader.textContent=`Issue Rev ${data.details.revision.trim()} · ${issueHeader.textContent??""}`;
  if(data.issues?.length){
    const section=popup.document.createElement("section");
    section.innerHTML=`<h2>Issue history</h2><p>The latest recorded issue is shown in the report header; earlier issues are listed below.</p><table><thead><tr><th>Revision</th><th>Date</th><th>Prepared by</th><th>Description</th></tr></thead><tbody>${[...data.issues].reverse().map(issue=>`<tr><td>${escapeHtml(issue.revision)}</td><td>${escapeHtml(issue.date)}</td><td>${escapeHtml(issue.author)}</td><td>${escapeHtml(issue.description)}</td></tr>`).join("")}</tbody></table>`;
    const main=popup.document.querySelector("main"),firstSection=main?.querySelector(":scope > section");
    if(main)main.insertBefore(section,firstSection??null);
  }
  const style=popup.document.createElement("style");style.textContent="@page{size:A4 portrait;margin:12mm}";popup.document.head.append(style);
  const images=Array.from(popup.document.querySelectorAll("img"));
  void Promise.all(images.map(image=>new Promise<void>(resolve=>{
    if(image.complete){resolve();return;}
    image.onload=()=>resolve();image.onerror=()=>resolve();
  }))).then(()=>popup.print());
  return true;
}
