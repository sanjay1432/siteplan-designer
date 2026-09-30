import { Minus, Plus, Maximize2, Crosshair, Frame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useViewport } from "../../geometry/ViewportContext";
import { formatZoom, fitBounds } from "../../geometry/viewport";
import { usePlot } from "../../geometry/plot/PlotContext";

export function ZoomControls() {
  const {
    viewport,
    zoomIn,
    zoomOut,
    fitToWorkspace,
    centerOrigin,
    setViewport,
    canvasSize,
  } = useViewport();

  const { metrics } = usePlot();

  const fitToPlot = () => {
    if (canvasSize.width > 0 && canvasSize.height > 0) {
      setViewport(
        fitBounds(metrics.bounds, canvasSize.width, canvasSize.height, 80),
      );
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-1 sm:gap-2">
      {/* Zoom in/out cluster */}
      <div className="flex items-center rounded-md border border-slate-200 bg-white p-0.5 shadow-xs">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={zoomOut}
          title="Zoom Out"
          aria-label="Zoom Out"
        >
          <Minus className="size-4 text-slate-600" />
        </Button>

        <button
          type="button"
          className="min-w-16 px-2 py-1 text-center font-mono text-xs font-medium text-slate-700 hover:bg-slate-100 rounded transition-colors cursor-pointer select-none"
          onClick={() => fitToWorkspace()}
          title="Click to Fit Workspace (100' × 100')"
        >
          {formatZoom(viewport.zoom)}
        </button>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={zoomIn}
          title="Zoom In"
          aria-label="Zoom In"
        >
          <Plus className="size-4 text-slate-600" />
        </Button>
      </div>

      {/* Fit to Plot */}
      <Button
        variant="outline"
        size="sm"
        onClick={fitToPlot}
        className="gap-1.5 text-xs font-medium text-slate-700"
        title="Fit view to plot boundary"
        aria-label="Fit view to plot boundary"
      >
        <Frame className="size-3.5" />
        <span className="hidden sm:inline">Plot</span>
      </Button>

      {/* Fit to Workspace */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => fitToWorkspace()}
        className="gap-1.5 text-xs font-medium text-slate-700"
        title="Fit to full 100' × 100' workspace"
        aria-label="Fit to workspace"
      >
        <Maximize2 className="size-3.5" />
        <span className="hidden sm:inline">Fit</span>
      </Button>

      {/* Center origin */}
      <Button
        variant="outline"
        size="sm"
        onClick={centerOrigin}
        className="gap-1.5 text-xs font-medium text-slate-700"
        title="Center on world origin (0, 0)"
        aria-label="Center on origin"
      >
        <Crosshair className="size-3.5" />
        <span className="hidden sm:inline">Origin</span>
      </Button>
    </div>
  );
}
