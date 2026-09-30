import type { Point, Bounds } from "../geometry/viewport";

export interface PlotCorner extends Point {
  id: string;
  name: string; // "A" (Bottom-Left), "B" (Bottom-Right), "C" (Top-Right), "D" (Top-Left)
}

export type PlotEdgeName = "top" | "right" | "bottom" | "left";

export interface PlotEdge {
  id: string;
  name: PlotEdgeName;
  label: string; // "Top", "Right", "Bottom", "Left"
  startCornerId: string;
  endCornerId: string;
  targetLengthMm: number; // Canonical target length in mm
  actualLengthMm: number; // Measured geometry length in mm
}

export interface Plot {
  id: string;
  name: string;
  corners: PlotCorner[];
  edges: PlotEdge[];
}

export interface PlotMetrics {
  areaSqMm: number;
  perimeterMm: number;
  bounds: Bounds;
  center: Point;
}

export interface PlotDimensions {
  top: number;    // mm
  right: number;  // mm
  bottom: number; // mm
  left: number;   // mm
}
