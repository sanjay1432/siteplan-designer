import { SiteCanvas } from "../canvas/SiteCanvas";
import { Ruler } from "../ruler/Ruler";
import { ViewportProvider } from "../../geometry/ViewportContext";
import { UnitProvider } from "../../geometry/units/UnitContext";
import { PlotProvider } from "../../geometry/plot/PlotContext";
import { ZoomControls } from "./ZoomControls";
import { UnitSelector } from "../toolbar/UnitSelector";
import { DimensionTester } from "../toolbar/DimensionTester";
import { PlotPropertiesPanel } from "../properties/PlotPropertiesPanel";
import { ProjectControls } from "../toolbar/ProjectControls";
import { GettingStartedTour } from "./GettingStartedTour";

export function SitePlanEditor() {
  return (
    <UnitProvider>
      <PlotProvider>
        <ViewportProvider>
          <div className="flex h-dvh min-h-[480px] w-screen flex-col overflow-hidden bg-slate-100">
            {/* Main CAD Toolbar */}
            <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-3 py-2 sm:px-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="font-semibold text-slate-900 tracking-tight">
                  SitePlan Designer
                </span>
                <span className="hidden rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500 font-mono md:inline">
                  100′ × 100′ Workspace
                </span>
              </div>

              <ProjectControls />
              <GettingStartedTour />

              <div className="ml-auto flex items-center gap-2 sm:gap-3">
                <UnitSelector />
                <div className="h-4 w-px bg-slate-200" />
                <DimensionTester />
              </div>

              <ZoomControls />
              <p className="basis-full text-[10px] leading-tight text-slate-500" title="Projects are stored in this browser only. Clearing browser site data removes them.">
                Autosaved in this browser. Clearing browser data can erase projects; export a JSON backup to keep them.
              </p>
            </div>

            {/* Main content: rulers + canvas + properties panel */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden xl:flex-row">
              {/* Left: ruler column + canvas rows */}
              <div className="flex min-h-[260px] min-w-0 flex-[0_0_55%] flex-col xl:min-h-0 xl:flex-1">
                {/* Top ruler row */}
                <div className="hidden shrink-0 grid-cols-[48px_1fr] sm:grid" style={{ height: 32 }}>
                  {/* Corner square */}
                  <div className="border-r border-b border-slate-200 bg-white" />
                  {/* Horizontal ruler */}
                  <div className="min-w-0 overflow-hidden">
                    <Ruler orientation="horizontal" />
                  </div>
                </div>

                {/* Canvas row */}
                <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[48px_1fr]">
                  {/* Vertical ruler */}
                  <div className="hidden min-h-0 overflow-hidden sm:block">
                    <Ruler orientation="vertical" />
                  </div>

                  {/* Canvas */}
                  <div className="relative min-h-0 min-w-0">
                    <SiteCanvas />
                  </div>
                </div>
              </div>

              {/* Right: Properties panel */}
              <div className="min-h-0 min-w-0 flex-1 xl:flex-initial xl:w-80 xl:shrink-0">
                <PlotPropertiesPanel />
              </div>
            </div>
          </div>
        </ViewportProvider>
      </PlotProvider>
    </UnitProvider>
  );
}
