import { useState } from "react";
import { HelpCircle, Home, Move, Ruler, Save, X } from "lucide-react";

const TOUR_KEY = "siteplan-designer:walkthrough-complete:v1";

const steps = [
  {
    icon: Home,
    title: "Start with your plot",
    body: "The blue outline is your land. In the Plot tab, type each side's length and setback, or drag a corner on the drawing (it snaps to the grid; hold Alt to place freely).",
    tip: "Switch between feet, metres and millimetres from the top bar.",
  },
  {
    icon: Home,
    title: "Add a floor plan",
    body: "In the Building tab, pick a 1, 2 or 3 BHK layout to start, or add rooms one at a time. Click a room to rename it, change its size, and add doors and windows.",
    tip: "Start from a layout; you can change every room afterwards.",
  },
  {
    icon: Move,
    title: "Arrange the rooms",
    body: "Drag a room to move it. Select a room to show its corner handles, then drag a handle to resize. Hold Shift while dragging to keep a room in a straight line, or turn on Move all to shift the whole floor.",
    tip: "A room that crosses the setback line is outlined in red.",
  },
  {
    icon: Ruler,
    title: "Measure and orient",
    body: "Choose Measure, then click two points on the drawing to see the distance. Use the compass arrows at the top right to rotate north.",
    tip: "Select a measurement and press Delete to remove it.",
  },
  {
    icon: Save,
    title: "Save and share your work",
    body: "Projects save automatically in this browser. Use Export in the top bar for a project report (PDF), a plan image, or an editable JSON backup you can import later.",
    tip: "Keep a JSON backup if you may clear browser data or switch devices.",
  },
];

function hasFinishedTour() {
  try {
    return window.localStorage.getItem(TOUR_KEY) === "true";
  } catch {
    return false;
  }
}

export function GettingStartedTour() {
  const [open, setOpen] = useState(() => !hasFinishedTour());
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex];
  const Icon = step.icon;

  function finish() {
    try {
      window.localStorage.setItem(TOUR_KEY, "true");
    } catch {
      // The guide remains available from the button if browser storage is disabled.
    }
    setOpen(false);
  }

  return <>
    <button
      type="button"
      onClick={() => { setStepIndex(0); setOpen(true); }}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
      aria-label="Open the getting started guide"
      title="Learn how to use the site plan editor"
    >
      <HelpCircle className="size-3.5" /> <span>Guide</span>
    </button>

    {open && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-3 sm:p-6" onKeyDown={event => { if (event.key === "Escape") finish(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-description" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Icon className="size-5" /></span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Getting started · {stepIndex + 1} of {steps.length}</p>
              <h2 id="tour-title" className="mt-0.5 text-lg font-semibold text-slate-900">{step.title}</h2>
            </div>
          </div>
          <button type="button" onClick={finish} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close guide"><X className="size-4" /></button>
        </div>

        <div className="mb-4 flex gap-1" aria-label={`Step ${stepIndex + 1} of ${steps.length}`}>
          {steps.map((item, index) => <span key={item.title} className={`h-1.5 flex-1 rounded-full ${index <= stepIndex ? "bg-blue-600" : "bg-slate-200"}`} />)}
        </div>

        <p id="tour-description" className="text-sm leading-6 text-slate-600">{step.body}</p>
        <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">{step.tip}</p>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button type="button" onClick={finish} className="text-xs font-medium text-slate-500 hover:text-slate-800">Skip guide</button>
          <div className="flex gap-2">
            {stepIndex > 0 && <button type="button" onClick={() => setStepIndex(index => index - 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Back</button>}
            {stepIndex < steps.length - 1
              ? <button type="button" onClick={() => setStepIndex(index => index + 1)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Next</button>
              : <button type="button" onClick={finish} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Start designing</button>}
          </div>
        </div>
      </section>
    </div>}
  </>;
}
