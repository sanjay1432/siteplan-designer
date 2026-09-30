import type { Point } from "./viewport";
import { normalizeMm, MM_PER_FOOT } from "./units/units";
import type { Plot, PlotCorner, PlotDimensions, PlotEdge, PlotMetrics } from "../types/plot";

/**
 * Standard default residential plot dimensions as requested:
 * Top: 58 ft (17678.4 mm)
 * Right: 59 ft (17983.2 mm)
 * Bottom: 58 ft (17678.4 mm)
 * Left: 65 ft (19812.0 mm)
 */
export const DEFAULT_PLOT_DIMENSIONS_FT = {
  top: 58,
  right: 59,
  bottom: 58,
  left: 65,
};

export const DEFAULT_PLOT_DIMENSIONS_MM: PlotDimensions = {
  top: normalizeMm(58 * MM_PER_FOOT),    // 17678.4 mm
  right: normalizeMm(59 * MM_PER_FOOT),  // 17983.2 mm
  bottom: normalizeMm(58 * MM_PER_FOOT), // 17678.4 mm
  left: normalizeMm(65 * MM_PER_FOOT),   // 19812.0 mm
};

/**
 * Euclidean distance between two 2D points in millimetres.
 */
export function distance(p1: Point, p2: Point): number {
  return normalizeMm(Math.hypot(p2.x - p1.x, p2.y - p1.y));
}

/**
 * Midpoint of a segment between two points.
 */
export function midpoint(p1: Point, p2: Point): Point {
  return {
    x: normalizeMm((p1.x + p2.x) / 2),
    y: normalizeMm((p1.y + p2.y) / 2),
  };
}

/**
 * Solves the coordinates of an irregular quadrilateral oriented in standard CAD screen space:
 * - Corner TL (Top-Left): origin (x0, y0)
 * - Corner TR (Top-Right): (x0 + top, y0) -> Top edge length = top
 * - Corner BL (Bottom-Left): (x0, y0 + left) -> Left edge length = left
 * - Corner BR (Bottom-Right): solved analytically via circle-circle intersection:
 *   Circle at TR with radius = right; Circle at BL with radius = bottom.
 */
export function solveQuadrilateralCorners(
  dimensions: PlotDimensions,
  origin: Point = { x: 0, y: 0 },
  rotation = 0,
): PlotCorner[] {
  const { top, right, bottom, left } = dimensions;

  // Corner TL: Top-Left
  const cornerTL: PlotCorner = {
    id: "corner-tl",
    name: "TL",
    x: origin.x,
    y: origin.y,
  };

  // Corner TR: Top-Right
  const cornerTR: PlotCorner = {
    id: "corner-tr",
    name: "TR",
    x: normalizeMm(origin.x + top),
    y: origin.y,
  };

  // Corner BL: Bottom-Left
  const cornerBL: PlotCorner = {
    id: "corner-bl",
    name: "BL",
    x: origin.x,
    y: normalizeMm(origin.y + left),
  };

  // Analytical circle-circle intersection for Corner BR (Bottom-Right):
  // Let local coordinates relative to Corner TL at (0, 0):
  // TR = (top, 0), BL = (0, left)
  // (x - top)^2 + (y - 0)^2 = right^2
  // (x - 0)^2 + (y - left)^2 = bottom^2
  //
  // Subtracting equations gives the linear radical line:
  // (x^2 - 2*top*x + top^2 + y^2) - (x^2 + y^2 - 2*left*y + left^2) = right^2 - bottom^2
  // -2*top*x + 2*left*y + top^2 - left^2 = right^2 - bottom^2
  // 2*top*x = 2*left*y + (bottom^2 - right^2 + top^2 - left^2)
  // x = alpha*y + beta
  const C = bottom * bottom - right * right + top * top - left * left;
  const alpha = left / top;
  const beta = C / (2 * top);

  // Substitute x into circle BL equation:
  // (alpha*y + beta)^2 + (y - left)^2 = bottom^2
  // (alpha^2 + 1)*y^2 + (2*alpha*beta - 2*left)*y + (beta^2 + left^2 - bottom^2) = 0
  const quadA = alpha * alpha + 1;
  const quadB = 2 * alpha * beta - 2 * left;
  const quadD = beta * beta + left * left - bottom * bottom;

  const discriminant = quadB * quadB - 4 * quadA * quadD;

  let localBRx: number;
  let localBRy: number;

  if (discriminant >= 0) {
    // Select the positive root for the bottom-right coordinate
    localBRy = (-quadB + Math.sqrt(discriminant)) / (2 * quadA);
    localBRx = alpha * localBRy + beta;
  } else {
    // Graceful fallback for non-constructible input dimensions
    localBRx = top;
    localBRy = (left + right) / 2;
  }

  const cornerBR: PlotCorner = {
    id: "corner-br",
    name: "BR",
    x: normalizeMm(origin.x + localBRx),
    y: normalizeMm(origin.y + localBRy),
  };

  // Return corners in clockwise order: TL -> TR -> BR -> BL
  const corners = [cornerTL, cornerTR, cornerBR, cornerBL];
  if (rotation === 0) return corners;

  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return corners.map((corner) => {
    const localX = corner.x - origin.x;
    const localY = corner.y - origin.y;
    return {
      ...corner,
      x: normalizeMm(origin.x + localX * cos - localY * sin),
      y: normalizeMm(origin.y + localX * sin + localY * cos),
    };
  });
}

/**
 * Computes exact geometric metrics for a plot:
 * - Area via Shoelace Formula
 * - Perimeter via summed edge lengths
 * - Centroid / Center Point
 * - Axis-Aligned Bounding Box (AABB)
 */
export function computePlotMetrics(corners: PlotCorner[]): PlotMetrics {
  let areaAccumulator = 0;
  let perimeter = 0;
  let centroidX = 0;
  let centroidY = 0;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const n = corners.length;

  for (let i = 0; i < n; i++) {
    const current = corners[i];
    const next = corners[(i + 1) % n];

    // Bounding box
    if (current.x < minX) minX = current.x;
    if (current.y < minY) minY = current.y;
    if (current.x > maxX) maxX = current.x;
    if (current.y > maxY) maxY = current.y;

    // Perimeter
    perimeter += Math.hypot(next.x - current.x, next.y - current.y);

    // Shoelace formula terms
    const crossProduct = current.x * next.y - next.x * current.y;
    areaAccumulator += crossProduct;
    centroidX += (current.x + next.x) * crossProduct;
    centroidY += (current.y + next.y) * crossProduct;
  }

  const areaSqMm = Math.abs(areaAccumulator) / 2;
  const factor = 6 * (areaAccumulator / 2);

  const center: Point =
    factor !== 0
      ? {
          x: normalizeMm(centroidX / factor),
          y: normalizeMm(centroidY / factor),
        }
      : {
          x: (minX + maxX) / 2,
          y: (minY + maxY) / 2,
        };

  return {
    areaSqMm: normalizeMm(areaSqMm),
    perimeterMm: normalizeMm(perimeter),
    bounds: {
      minX: normalizeMm(minX),
      minY: normalizeMm(minY),
      maxX: normalizeMm(maxX),
      maxY: normalizeMm(maxY),
    },
    center,
  };
}

/**
 * Constructs a complete Plot entity with corners and edges.
 */
export function createPlot(
  dimensions: PlotDimensions = DEFAULT_PLOT_DIMENSIONS_MM,
  origin: Point = { x: 0, y: 0 },
  rotation = 0,
): Plot {
  const corners = solveQuadrilateralCorners(dimensions, origin, rotation);

  // Corners: [TL, TR, BR, BL]
  const [cornerTL, cornerTR, cornerBR, cornerBL] = corners;

  const edges: PlotEdge[] = [
    {
      id: "edge-top",
      name: "top",
      label: "Top",
      startCornerId: cornerTL.id,
      endCornerId: cornerTR.id,
      targetLengthMm: dimensions.top,
      actualLengthMm: distance(cornerTL, cornerTR),
    },
    {
      id: "edge-right",
      name: "right",
      label: "Right",
      startCornerId: cornerTR.id,
      endCornerId: cornerBR.id,
      targetLengthMm: dimensions.right,
      actualLengthMm: distance(cornerTR, cornerBR),
    },
    {
      id: "edge-bottom",
      name: "bottom",
      label: "Bottom",
      startCornerId: cornerBL.id,
      endCornerId: cornerBR.id,
      targetLengthMm: dimensions.bottom,
      actualLengthMm: distance(cornerBL, cornerBR),
    },
    {
      id: "edge-left",
      name: "left",
      label: "Left",
      startCornerId: cornerTL.id,
      endCornerId: cornerBL.id,
      targetLengthMm: dimensions.left,
      actualLengthMm: distance(cornerTL, cornerBL),
    },
  ];

  return {
    id: "residential-plot-1",
    name: "Residential Plot",
    corners,
    edges,
  };
}
