import { useState } from "react";
import { useUnits } from "../../geometry/units/UnitContext";
import { formatDimension } from "../../geometry/units/formatter";
import { CheckCircle2, AlertCircle, Calculator } from "lucide-react";

export function DimensionTester() {
  const { tryParse } = useUnits();
  const [input, setInput] = useState("58'");
  const [isOpen, setIsOpen] = useState(false);

  const presets = ["58'", "58' 6\"", "58.5 ft", "17.6784 m", "17678.4 mm"];

  const result = tryParse(input);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 transition-colors cursor-pointer"
        title="Interactive Dimension Engine Tester"
      >
        <Calculator className="size-3.5 text-blue-600" />
        <span>Dimension Parser</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-10 z-50 w-[min(24rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] rounded-xl border border-slate-200 bg-white p-4 text-slate-800 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
            <span className="font-semibold text-xs tracking-tight text-slate-900">
              Unit / Dimension Engine Tester
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              ✕
            </button>
          </div>

          <p className="text-xs text-slate-500 mb-3">
            Test any dimension format to verify it resolves to the exact canonical millimetre value.
          </p>

          {/* Preset Buttons */}
          <div className="flex flex-wrap gap-1 mb-3">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setInput(preset)}
                className={`rounded border px-2 py-0.5 font-mono text-xs transition-colors cursor-pointer ${
                  input === preset
                    ? "border-blue-500 bg-blue-50 text-blue-700 font-semibold"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {preset}
              </button>
            ))}
          </div>

          {/* Input field */}
          <div className="relative mb-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. 58' 6&quot; or 17.6784 m"
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Results display */}
          {result.success ? (
            <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-200/80 space-y-1.5">
              <div className="flex items-center gap-1.5 text-emerald-700 font-semibold text-xs">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                <span>Canonical Geometry: {result.mm} mm</span>
              </div>

              <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-1.5 border-t border-slate-200 text-xs font-mono">
                <div>
                  <span className="text-slate-400 text-[10px] block">Architectural</span>
                  <span className="text-slate-700">{formatDimension(result.mm, "architectural")}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Decimal Feet</span>
                  <span className="text-slate-700">{formatDimension(result.mm, "decimal_feet")}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Meters</span>
                  <span className="text-slate-700">{formatDimension(result.mm, "meters")}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Millimetres</span>
                  <span className="text-slate-700">{formatDimension(result.mm, "millimetres")}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 p-2.5 border border-red-200 text-xs text-red-700">
              <AlertCircle className="size-4 shrink-0 text-red-600 mt-0.5" />
              <span>{result.error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
