import {
  useEffect,
  useRef,
  useState,
} from "react";

import { useViewport } from "../../geometry/ViewportContext";
import { useUnits } from "../../geometry/units/UnitContext";

interface RulerProps {
  orientation:
    | "horizontal"
    | "vertical";
}

const IMPERIAL_CANDIDATES = [
  25.4,      // 1"
  76.2,      // 3"
  152.4,     // 6"
  304.8,     // 1'
  609.6,     // 2'
  1524,      // 5'
  3048,      // 10'
  6096,      // 20'
  15240,     // 50'
  30480,     // 100'
  60960,     // 200'
  152400,    // 500'
];

const METRIC_CANDIDATES = [
  10,        // 10 mm
  20,        // 20 mm
  50,        // 50 mm
  100,       // 100 mm / 10 cm
  200,       // 200 mm
  500,       // 500 mm (0.5 m)
  1000,      // 1 m
  2000,      // 2 m
  5000,      // 5 m
  10000,     // 10 m
  20000,     // 20 m
  50000,     // 50 m
  100000,    // 100 m
];

function getRulerStep(
  zoom: number,
  unitSystem: "imperial" | "metric",
): number {
  const candidates =
    unitSystem === "metric" ? METRIC_CANDIDATES : IMPERIAL_CANDIDATES;

  const minimumSpacing = 60;

  for (const candidate of candidates) {
    if (candidate * zoom >= minimumSpacing) {
      return candidate;
    }
  }

  return candidates[candidates.length - 1];
}

export function Ruler({
  orientation,
}: RulerProps) {
  const rulerRef = useRef<HTMLDivElement>(null);

  const { viewport } = useViewport();
  const { unitSystem, format } = useUnits();

  const [size, setSize] = useState(0);

  useEffect(() => {
    const element = rulerRef.current;

    if (!element) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      const measuredSize =
        orientation === "horizontal"
          ? entry.contentRect.width
          : entry.contentRect.height;

      setSize(measuredSize);
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [orientation]);

  const step = getRulerStep(viewport.zoom, unitSystem);

  const worldStart =
    orientation === "horizontal"
      ? -viewport.panX / viewport.zoom
      : -viewport.panY / viewport.zoom;

  const worldEnd =
    orientation === "horizontal"
      ? (size - viewport.panX) / viewport.zoom
      : (size - viewport.panY) / viewport.zoom;

  const start = Math.floor(worldStart / step) * step;

  const ticks: number[] = [];

  for (let value = start; value <= worldEnd; value += step) {
    ticks.push(value);
  }

  return (
    <div
      ref={rulerRef}
      className={
        orientation === "horizontal"
          ? "h-full w-full overflow-hidden border-b border-slate-200 bg-white"
          : "h-full w-full overflow-hidden border-r border-slate-200 bg-white"
      }
    >
      <svg
        width="100%"
        height="100%"
        className="block"
      >
        {ticks.map((value) => {
          const position =
            value * viewport.zoom +
            (orientation === "horizontal"
              ? viewport.panX
              : viewport.panY);

          const formattedValue = format(value);

          if (orientation === "horizontal") {
            return (
              <g key={value}>
                <line
                  x1={position}
                  y1={18}
                  x2={position}
                  y2={31}
                  stroke="#64748b"
                  strokeWidth="1"
                />

                <text
                  x={position + 3}
                  y={13}
                  fontSize="10"
                  fill="#64748b"
                  fontFamily="monospace"
                >
                  {formattedValue}
                </text>
              </g>
            );
          }

          return (
            <g key={value}>
              <line
                x1={36}
                y1={position}
                x2={48}
                y2={position}
                stroke="#64748b"
                strokeWidth="1"
              />

              <text
                x={2}
                y={position - 3}
                fontSize="9"
                fill="#64748b"
                fontFamily="monospace"
              >
                {formattedValue}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}