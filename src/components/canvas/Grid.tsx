import {
  DEFAULT_WORLD_BOUNDS,
  type Viewport,
} from "../../geometry/viewport";
import { useUnits } from "../../geometry/units/UnitContext";
import { getGridStep } from "../../geometry/grid";

interface GridProps {
  viewport: Viewport;
  width: number;
  height: number;
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
        x={worldLeft + 8 / viewport.zoom}
        y={worldTop + 14 / viewport.zoom}
        fontSize={12 / viewport.zoom}
        fill="#64748b"
        fontFamily="monospace"
      >
        Grid: {format(step)}
      </text>
    </g>
  );
}