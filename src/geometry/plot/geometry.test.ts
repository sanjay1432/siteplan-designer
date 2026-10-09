import { describe, expect, it } from "vitest";
import { interiorAngles, pointInPolygon, rectangleInsidePolygon, segmentBearing, validateBoundary } from "./boundary";
import { edgeInwardNormal, offsetPolygonInwardByEdgeDistances } from "./setback";
import { createProjectDocument, edgeSetbackRecord, getRoomWallSegments, resolveEdgeSetbacks, savedProjectFromDocumentV2, DEFAULT_EXTERIOR_WALL_THICKNESS_MM, DEFAULT_INTERIOR_WALL_THICKNESS_MM } from "./model";
import type { Room, SavedProject } from "./model";
import { parseSurveyCoordinateCsv } from "./surveyCsv";
import { computePlotMetrics, createPlot, distance, DEFAULT_PLOT_DIMENSIONS_MM } from "../plot";

const corner = (id: string, x: number, y: number) => ({ id, name: id, x, y });
const square = [corner("a", 0, 0), corner("b", 10000, 0), corner("c", 10000, 10000), corner("d", 0, 10000)];
// L-shape with a notch cut from the top-right quadrant.
const lShape = [corner("a", 0, 0), corner("b", 5000, 0), corner("c", 5000, 5000), corner("d", 10000, 5000), corner("e", 10000, 10000), corner("f", 0, 10000)];

describe("validateBoundary", () => {
  it("accepts a simple polygon", () => {
    expect(validateBoundary(square)).toEqual({ valid: true });
    expect(validateBoundary(lShape)).toEqual({ valid: true });
  });
  it("rejects crossed, degenerate and duplicate boundaries", () => {
    const bowtie = [corner("a", 0, 0), corner("b", 10, 10), corner("c", 10, 0), corner("d", 0, 10)];
    expect(validateBoundary(bowtie)).toEqual({ valid: false, reason: "self-intersection" });
    expect(validateBoundary([corner("a", 0, 0), corner("b", 0.5, 0), corner("c", 0, 10)])).toEqual({ valid: false, reason: "short-segment" });
    expect(validateBoundary([corner("a", 0, 0), corner("a", 10, 0), corner("c", 0, 10)])).toEqual({ valid: false, reason: "duplicate-id" });
    expect(validateBoundary(square.slice(0, 2))).toEqual({ valid: false, reason: "too-few-points" });
  });
});

describe("containment", () => {
  it("treats points on an edge as inside", () => {
    expect(pointInPolygon({ x: 0, y: 5000 }, square)).toBe(true);
    expect(pointInPolygon({ x: -1, y: 5000 }, square)).toBe(false);
  });
  it("rejects a rectangle that bridges a concave notch even with all corners inside", () => {
    expect(rectangleInsidePolygon(1000, 1000, 3000, 3000, lShape)).toBe(true);
    expect(rectangleInsidePolygon(4000, 4000, 2000, 2000, lShape)).toBe(false);
    // Corners at (1000,6000),(9000,6000),(9000,9000),(1000,9000) are all inside; the body is too.
    expect(rectangleInsidePolygon(1000, 6000, 8000, 3000, lShape)).toBe(true);
  });
});

describe("angles and bearings", () => {
  it("reports interior angles that sum to (n-2)·180", () => {
    expect(interiorAngles(square).map(angle => Math.round(angle))).toEqual([90, 90, 90, 90]);
    const angles = interiorAngles(lShape);
    expect(angles.reduce((sum, angle) => sum + angle, 0)).toBeCloseTo(720, 6);
    expect(Math.round(angles[2])).toBe(270);
    // Winding order does not change the interior angles.
    expect(interiorAngles([...lShape].reverse()).reduce((sum, angle) => sum + angle, 0)).toBeCloseTo(720, 6);
  });
  it("measures bearings clockwise from north, honouring the compass rotation", () => {
    expect(segmentBearing({ x: 0, y: 0 }, { x: 0, y: -10 })).toBeCloseTo(0);
    expect(segmentBearing({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(90);
    expect(segmentBearing({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(180);
    expect(segmentBearing({ x: 0, y: 0 }, { x: 10, y: 0 }, 90)).toBeCloseTo(0);
  });
});

describe("setbacks", () => {
  it("offsets each edge inward by its own distance", () => {
    const inset = offsetPolygonInwardByEdgeDistances(square, [1000, 2000, 3000, 4000]);
    expect(inset[0].x).toBeCloseTo(4000);
    expect(inset[0].y).toBeCloseTo(1000);
    expect(inset[2].x).toBeCloseTo(8000);
    expect(inset[2].y).toBeCloseTo(7000);
  });
  it("finds the inward normal for either winding", () => {
    const normal0 = edgeInwardNormal(square, 0);
    expect(normal0.x).toBeCloseTo(0);
    expect(normal0.y).toBeCloseTo(1);
    const reversed = [...square].reverse();
    const normal = edgeInwardNormal(reversed, 0);
    // Edge d→c runs along y=10000; inward is -y.
    expect(normal.y).toBeCloseTo(-1);
  });
  it("maps legacy top/right/bottom/left setbacks onto the first four edges", () => {
    const fiveSided = [...square, corner("e", -2000, 5000)];
    expect(resolveEdgeSetbacks({ corners: fiveSided, setbacks: { top: 1, right: 2, bottom: 3, left: 4 } })).toEqual([1, 2, 3, 4, 0]);
    expect(resolveEdgeSetbacks({ corners: fiveSided, setbackMm: 900 })).toEqual([900, 900, 900, 900, 900]);
    expect(resolveEdgeSetbacks({ corners: square, edgeSetbacks: edgeSetbackRecord(square, [5, 6, 7, 8]), setbacks: { top: 1 } })).toEqual([5, 6, 7, 8]);
  });
});

describe("room walls", () => {
  const left: Room = { id: "a", name: "A", x: 0, y: 0, width: 3000, height: 3000 };
  const right: Room = { id: "b", name: "B", x: 3000, y: 1000, width: 3000, height: 3000 };
  it("splits a side into shared and exposed segments", () => {
    const segments = getRoomWallSegments(left, "right", [left, right]);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ start: 0, end: 1000, shared: false, thickness: DEFAULT_EXTERIOR_WALL_THICKNESS_MM });
    expect(segments[1]).toMatchObject({ start: 1000, end: 3000, shared: true, thickness: DEFAULT_INTERIOR_WALL_THICKNESS_MM, attachedRoomIds: ["b"] });
  });
});

describe("plot construction and metrics", () => {
  it("solves the default plot with the requested edge lengths", () => {
    const plot = createPlot();
    const [tl, tr, br, bl] = plot.corners;
    expect(distance(tl, tr)).toBeCloseTo(DEFAULT_PLOT_DIMENSIONS_MM.top, 6);
    expect(distance(tr, br)).toBeCloseTo(DEFAULT_PLOT_DIMENSIONS_MM.right, 6);
    expect(distance(bl, br)).toBeCloseTo(DEFAULT_PLOT_DIMENSIONS_MM.bottom, 6);
    expect(distance(tl, bl)).toBeCloseTo(DEFAULT_PLOT_DIMENSIONS_MM.left, 6);
  });
  it("computes area, perimeter and centroid", () => {
    const metrics = computePlotMetrics(lShape);
    expect(metrics.areaSqMm).toBeCloseTo(75_000_000);
    expect(metrics.perimeterMm).toBeCloseTo(40_000);
    // Full 10 m square minus the 5 m notch at (7.5 m, 2.5 m).
    expect(metrics.center.x).toBeCloseTo(12_500 / 3, 6);
    expect(metrics.center.y).toBeCloseTo(17_500 / 3, 6);
  });
});

describe("survey CSV", () => {
  it("parses ordered points, drops a repeated closing point and flips northing", () => {
    const result = parseSurveyCoordinateCsv("point,easting,northing\nA,100,200\nB,120,200\nC,120,215\nD,100,215\nA2,100,200\n", "m");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.boundary.corners).toHaveLength(4);
    expect(result.boundary.corners[2]).toMatchObject({ x: 20000, y: -15000 });
    expect(result.boundary.originX).toBe(100);
  });
  it("explains crossed survey rows", () => {
    const result = parseSurveyCoordinateCsv("x,y\n0,0\n10,10\n10,0\n0,10\n", "m");
    expect(result).toMatchObject({ success: false, error: expect.stringContaining("cross") });
  });
});

describe("project document", () => {
  it("round-trips per-edge setbacks and levels through the share format", () => {
    const project: SavedProject = {
      id: "p", name: "Test", compassRotation: 30, measurements: [],
      geometry: { corners: square, edgeSetbacks: edgeSetbackRecord(square, [1, 2, 3, 4]), groundPlan: { id: "ground", name: "Ground", rooms: [], openings: [] }, floors: [{ id: "f1", name: "Floor 1", rooms: [{ id: "r", name: "Room", x: 1000, y: 1000, width: 3000, height: 3000 }], openings: [] }], activeFloorId: "f1" },
    };
    const restored = savedProjectFromDocumentV2(createProjectDocument(project));
    expect(resolveEdgeSetbacks(restored.geometry)).toEqual([1, 2, 3, 4]);
    expect(restored.geometry.floors?.[0].rooms[0].id).toBe("r");
    expect(restored.geometry.activeFloorId).toBe("f1");
  });
});
