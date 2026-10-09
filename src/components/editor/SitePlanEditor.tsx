import { lazy, Suspense, useState } from "react";
import { SiteCanvas } from "../canvas/SiteCanvas";
import { Ruler } from "../ruler/Ruler";
import { ViewportProvider } from "../../geometry/ViewportContext";
import { UnitProvider } from "../../geometry/units/UnitContext";
import { PlotProvider } from "../../geometry/plot/PlotContext";
import { UnitSelector } from "../toolbar/UnitSelector";
import { PlotPropertiesPanel } from "../properties/PlotPropertiesPanel";
import { ProjectControls } from "../toolbar/ProjectControls";
import { ExportMenu } from "../toolbar/ExportMenu";
import { GettingStartedTour } from "./GettingStartedTour";
// three.js is large; load the 3D module only when it is opened.
const House3DModule = lazy(() => import("./House3DModule").then(module => ({ default: module.House3DModule })));

export function SitePlanEditor() {
  const [activeModule,setActiveModule]=useState<"2d"|"3d">("2d");
  return (
    <UnitProvider>
      <PlotProvider>
        <ViewportProvider>
          <div className="flex h-dvh min-h-[480px] w-screen flex-col overflow-hidden bg-slate-100">
            <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-slate-200 bg-white px-3 py-1.5 sm:px-4">
              <a href="/" className="text-sm font-semibold tracking-tight text-slate-900 hover:text-blue-700">SitePlan Designer</a>
              <ProjectControls />
              <div className="flex rounded-md border border-slate-200 bg-slate-100 p-0.5" role="tablist" aria-label="View">
                <button type="button" role="tab" aria-selected={activeModule==="2d"} onClick={()=>setActiveModule("2d")} className={`rounded px-2.5 py-1 text-xs font-medium ${activeModule==="2d"?"bg-white text-blue-700 shadow-xs":"text-slate-500 hover:text-slate-900"}`}>2D Plan</button>
                <button type="button" role="tab" aria-selected={activeModule==="3d"} onClick={()=>setActiveModule("3d")} className={`rounded px-2.5 py-1 text-xs font-medium ${activeModule==="3d"?"bg-white text-blue-700 shadow-xs":"text-slate-500 hover:text-slate-900"}`}>3D House</button>
              </div>
              <div className="ml-auto flex items-center gap-2 sm:gap-3">
                <UnitSelector />
                <ExportMenu planVisible={activeModule==="2d"} />
                <GettingStartedTour />
              </div>
            </header>

            {activeModule==="3d" ? <div className="min-h-0 flex-1"><Suspense fallback={<div className="grid h-full place-items-center text-sm text-slate-500">Loading 3D view…</div>}><House3DModule /></Suspense></div> : <div className="flex min-h-0 flex-1 flex-col overflow-hidden xl:flex-row">
              {/* Left: ruler column + canvas rows */}
              <div className="flex min-h-[260px] min-w-0 flex-[0_0_55%] flex-col xl:min-h-0 xl:flex-1">
                <div className="hidden shrink-0 grid-cols-[48px_1fr] sm:grid" style={{ height: 32 }}>
                  <div className="border-r border-b border-slate-200 bg-white" />
                  <div className="min-w-0 overflow-hidden"><Ruler orientation="horizontal" /></div>
                </div>
                <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[48px_1fr]">
                  <div className="hidden min-h-0 overflow-hidden sm:block"><Ruler orientation="vertical" /></div>
                  <div className="relative min-h-0 min-w-0"><SiteCanvas /></div>
                </div>
              </div>

              {/* Right: properties panel */}
              <div className="min-h-0 min-w-0 flex-1 xl:w-[22rem] xl:flex-initial xl:shrink-0">
                <PlotPropertiesPanel />
              </div>
            </div>}
          </div>
        </ViewportProvider>
      </PlotProvider>
    </UnitProvider>
  );
}
