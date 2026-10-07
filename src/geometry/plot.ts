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
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/**
 * Midpoint of a segment between two points.
 */
export function midpoint(p1: Point, p2: Point): Point {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
  };
}

/**
 * Solves the coordinates of an irregular quadrilateral oriented in standard CAD screen space:
 * - Corner TL (Top-Left): origin (x0, y0)
 * - Corner TR (Top-Right): (x0 + top, y0) -> Top edge length = top
 * - Corner BL (Bottom-Left): (x0, y0 + left) -> Left edge length = left
 * - The top and left edges are perpendicular; side lengths alone do not determine a general quadrilateral.
 * - Corner BR (Bottom-Right): solved analytically via circle-circle intersection:
 *   Circle at TR with radius = right; Circle at BL with radius = bottom.
 */
export function solveQuadrilateralCorners(
  dimensions: PlotDimensions,
  origin: Point = { x: 0, y: 0 },
  rotation = 0,
): PlotCorner[] {
  const { top, right, bottom, left } = dimensions;
  if (![top,right,bottom,left,origin.x,origin.y,rotation].every(Number.isFinite) || Math.min(top,right,bottom,left)<=0) {
    throw new RangeError("Plot side lengths must be finite and greater than zero.");
  }

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
    x: origin.x + top,
    y: origin.y,
  };

  // Corner BL: Bottom-Left
  const cornerBL: PlotCorner = {
    id: "corner-bl",
    name: "BL",
    x: origin.x,
    y: origin.y + left,
  };

  // Circle-circle intersection from TR and BL avoids subtracting large squared
  // coordinates in the quadratic discriminant.
  const dx=-top,dy=left,separation=Math.hypot(dx,dy);
  const tolerance=Number.EPSILON*Math.max(right,bottom,separation)*16;
  if(separation>right+bottom+tolerance||separation<Math.abs(right-bottom)-tolerance){
    throw new RangeError("These four side lengths cannot form a plot with perpendicular top and left sides.");
  }
  const along=(right*right-bottom*bottom+separation*separation)/(2*separation);
  const heightSquared=right*right-along*along;
  const heightTolerance=Number.EPSILON*Math.max(right*right,bottom*bottom,separation*separation)*32;
  if(heightSquared<=heightTolerance)throw new RangeError("These four side lengths produce a degenerate plot.");
  const height=Math.sqrt(heightSquared);
  const baseX=top+along*dx/separation,baseY=along*dy/separation;
  const candidates=[{x:baseX+height*left/separation,y:baseY+height*top/separation},{x:baseX-height*left/separation,y:baseY-height*top/separation}]
    .filter(point=>point.x>0&&point.y>0&&left*(point.x-top)+top*point.y>0);
  const solution=candidates.sort((a,b)=>b.y-a.y)[0];
  if(!solution) throw new RangeError("These four side lengths do not form a convex plot with perpendicular top and left sides.");
  const {x:localBRx,y:localBRy}=solution;

  const cornerBR: PlotCorner = {
    id: "corner-br",
    name: "BR",
    x: origin.x + localBRx,
    y: origin.y + localBRy,
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
      x: origin.x + localX * cos - localY * sin,
      y: origin.y + localX * sin + localY * cos,
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
  const origin=corners[0]??{x:0,y:0};

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
    const currentX=current.x-origin.x,currentY=current.y-origin.y;
    const nextX=next.x-origin.x,nextY=next.y-origin.y;
    const crossProduct = currentX * nextY - nextX * currentY;
    areaAccumulator += crossProduct;
    centroidX += (currentX + nextX) * crossProduct;
    centroidY += (currentY + nextY) * crossProduct;
  }

  const areaSqMm = Math.abs(areaAccumulator) / 2;
  const factor = 6 * (areaAccumulator / 2);

  const center: Point =
    factor !== 0
      ? {
          x: origin.x + centroidX / factor,
          y: origin.y + centroidY / factor,
        }
      : {
          x: (minX + maxX) / 2,
          y: (minY + maxY) / 2,
        };

  return {
    areaSqMm,
    perimeterMm: perimeter,
    bounds: {
      minX,
      minY,
      maxX,
      maxY,
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
