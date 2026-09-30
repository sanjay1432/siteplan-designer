import { useUnits } from "../../geometry/units/UnitContext";
import { Button } from "../ui/button";

export function UnitSelector() {
  const {
    unitSystem,
    displayFormat,
    setUnitSystem,
    setDisplayFormat,
  } = useUnits();

  return (
    <div className="flex items-center gap-2">
      {/* Unit System Toggle */}
      <div className="flex items-center rounded-md border border-slate-200 bg-slate-100 p-0.5 text-xs">
        <button
          type="button"
          onClick={() => setUnitSystem("imperial")}
          className={`rounded px-2 py-1 font-medium transition-colors cursor-pointer ${
            unitSystem === "imperial"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
          title="Switch to decimal feet"
        >
          Feet (ft)
        </button>

        <button
          type="button"
          onClick={() => setUnitSystem("metric")}
          className={`rounded px-2 py-1 font-medium transition-colors cursor-pointer ${
            unitSystem === "metric"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
          title="Switch to Metric (Meters & Millimetres)"
        >
          Metric (m / mm)
        </button>
      </div>

      {/* Metric format selector */}
      <div className="flex items-center gap-1">
        {unitSystem === "metric" && (
          <>
            <Button
              variant={displayFormat === "meters" ? "secondary" : "ghost"}
              size="xs"
              onClick={() => setDisplayFormat("meters")}
              className="text-xs"
              title="Meters"
            >
              Meters (m)
            </Button>
            <Button
              variant={displayFormat === "millimetres" ? "secondary" : "ghost"}
              size="xs"
              onClick={() => setDisplayFormat("millimetres")}
              className="text-xs"
              title="Millimetres"
            >
              Millimetres (mm)
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
