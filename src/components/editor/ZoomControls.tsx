import { Minus, Plus, Frame } from "lucide-react";
import { useViewport } from "../../geometry/ViewportContext";
import { formatZoom, fitBounds } from "../../geometry/viewport";
import { usePlot } from "../../geometry/plot/PlotContext";

/** Compact zoom cluster shown over the plan. */
export function ZoomControls(){
  const {viewport,zoomIn,zoomOut,fitToWorkspace,setViewport,canvasSize}=useViewport();
  const {metrics}=usePlot();
  const fitToPlot=()=>{if(canvasSize.width>0&&canvasSize.height>0)setViewport(fitBounds(metrics.bounds,canvasSize.width,canvasSize.height,80));};
  const icon="inline-flex size-7 items-center justify-center rounded text-slate-600 hover:bg-slate-100";
  return <div className="flex items-center rounded-md border border-slate-200 bg-white/95 p-0.5 shadow-sm backdrop-blur-xs">
    <button type="button" onClick={zoomOut} title="Zoom out" aria-label="Zoom out" className={icon}><Minus className="size-3.5"/></button>
    <button type="button" onClick={()=>fitToWorkspace()} title="Zoom level · click to show the whole workspace" className="min-w-14 px-1 text-center font-mono text-[11px] font-medium text-slate-700 hover:bg-slate-100 rounded">{formatZoom(viewport.zoom)}</button>
    <button type="button" onClick={zoomIn} title="Zoom in" aria-label="Zoom in" className={icon}><Plus className="size-3.5"/></button>
    <span className="mx-0.5 h-4 w-px bg-slate-200"/>
    <button type="button" onClick={fitToPlot} title="Fit view to plot boundary" aria-label="Fit view to plot boundary" className="inline-flex h-7 items-center gap-1 rounded px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-100"><Frame className="size-3.5"/>Fit plot</button>
  </div>;
}
