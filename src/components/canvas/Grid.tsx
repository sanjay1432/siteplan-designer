import {
  DEFAULT_WORLD_BOUNDS,
  type Viewport,
} from "../../geometry/viewport";
import { useUnits } from "../../geometry/units/UnitContext";

interface GridProps {
  viewport: Viewport;
  width: number;
  height: number;
}

const IMPERIAL_CANDIDATES = [
  25.4,       // 1 inch
  76.2,       // 3 inch
  152.4,      // 6 inch
  304.8,      // 1 ft
  609.6,      // 2 ft
  1524,       // 5 ft
  3048,       // 10 ft
  6096,       // 20 ft
  15240,      // 50 ft
  30480,      // 100 ft
  60960,      // 200 ft
  152400,     // 500 ft
];

const METRIC_CANDIDATES = [
  10,         // 10 mm
  20,         // 20 mm
  50,         // 50 mm
  100,        // 100 mm (10 cm)
  200,        // 200 mm
  500,        // 500 mm (0.5 m)
  1000,       // 1 m
  2000,       // 2 m
  5000,       // 5 m
  10000,      // 10 m
  20000,      // 20 m
  50000,      // 50 m
  100000,     // 100 m
];

function getGridStep(
  zoom: number,
  unitSystem: "imperial" | "metric",
): number {
  const candidates =
    unitSystem === "metric" ? METRIC_CANDIDATES : IMPERIAL_CANDIDATES;

  const minimumScreenSpacing = 30;

  for (const candidate of candidates) {
    if (candidate * zoom >= minimumScreenSpacing) {
      return candidate;
    }
  }

  return candidates[candidates.length - 1];
}

export function Grid({
  viewport,
  width,
  height,
}: GridProps) {
  const { unitSystem, format } = useUnits();
  const step = getGridStep(viewport.zoom, unitSystem);

  const worldLeft = -viewport.panX / viewport.zoom;
  const worldTop = -viewport.panY / viewport.zoom;
  const worldRight = (width - viewport.panX) / viewport.zoom;
  const worldBottom = (height - viewport.panY) / viewport.zoom;

  const startX = Math.floor(worldLeft / step) * step;
  const startY = Math.floor(worldTop / step) * step;

  const verticalLines = [];
  const horizontalLines = [];

  for (let x = startX; x <= worldRight; x += step) {
    verticalLines.push(
      <line
        key={`x-${x}`}
        x1={x}
        y1={worldTop}
        x2={x}
        y2={worldBottom}
        stroke="#e2e8f0"
        strokeWidth={1 / viewport.zoom}
      />,
    );
  }

  for (let y = startY; y <= worldBottom; y += step) {
    horizontalLines.push(
      <line
        key={`y-${y}`}
        x1={worldLeft}
        y1={y}
        x2={worldRight}
        y2={y}
        stroke="#e2e8f0"
        strokeWidth={1 / viewport.zoom}
      />,
    );
  }

  const workspaceWidth =
    DEFAULT_WORLD_BOUNDS.maxX - DEFAULT_WORLD_BOUNDS.minX;
  const workspaceHeight =
    DEFAULT_WORLD_BOUNDS.maxY - DEFAULT_WORLD_BOUNDS.minY;

  return (
    <g>
      {/* Grid lines */}
      {verticalLines}
      {horizontalLines}

      {/* 100' x 100' Workspace boundary */}
      <rect
        x={DEFAULT_WORLD_BOUNDS.minX}
        y={DEFAULT_WORLD_BOUNDS.minY}
        width={workspaceWidth}
        height={workspaceHeight}
        fill="rgba(255, 255, 255, 0.5)"
        stroke="#94a3b8"
        strokeWidth={1.5 / viewport.zoom}
        strokeDasharray={`${8 / viewport.zoom} ${4 / viewport.zoom}`}
      />

      {/* Origin axes */}
      <line
        x1={0}
        y1={worldTop}
        x2={0}
        y2={worldBottom}
        stroke="#94a3b8"
        strokeWidth={2 / viewport.zoom}
      />

      <line
        x1={worldLeft}
        y1={0}
        x2={worldRight}
        y2={0}
        stroke="#94a3b8"
        strokeWidth={2 / viewport.zoom}
      />

      {/* Grid spacing label */}
      <text
        x={startX + 8 / viewport.zoom}
        y={startY + 18 / viewport.zoom}
        fontSize={12 / viewport.zoom}
        fill="#64748b"
        fontFamily="monospace"
      >
        Grid: {format(step)}
      </text>
    </g>
  );
}