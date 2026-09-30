# SitePlan Designer

An in-browser site-plan editor for defining an irregular four-sided plot. The editor stores geometry in millimetres, renders it as an SVG drawing, and lets you inspect and edit edge dimensions in imperial or metric units.

## Getting started

Requires Node.js and npm.

```sh
npm install
npm run dev
```

The development server prints the local URL. Use `npm run build` to create a production bundle, `npm run preview` to serve that bundle locally, and `npm run lint` to run ESLint.

## Editor capabilities

- Edit top, right, bottom, and left plot dimensions with architectural, decimal-feet, metric, or millimetre input.
- View the solved quadrilateral, edge labels, corner coordinates, area, and perimeter.
- Drag any plot corner independently; only that corner moves, and its adjoining edge lengths update.
- Pan by scrolling or with the middle or right mouse button; Shift+scroll pans horizontally. Ctrl+scroll zooms at the pointer.
- Fit the viewport to the plot or the 100 ft × 100 ft workspace, or center the world origin.
- Switch unit systems and display formats.
- Plot dimensions and unit/display preferences are saved in browser local storage on this device. Resetting the plot restores the default dimensions (58 ft, 59 ft, 58 ft, 65 ft).

## Source map

| Path | Responsibility |
| --- | --- |
| `src/App.tsx` | Application entry component |
| `src/components/editor/SitePlanEditor.tsx` | Editor shell and provider composition |
| `src/components/canvas/` | SVG canvas, grid, and plot rendering |
| `src/components/ruler/Ruler.tsx` | Viewport-aware horizontal and vertical rulers |
| `src/components/properties/PlotPropertiesPanel.tsx` | Dimension editing, plot metrics, and corner coordinates |
| `src/components/toolbar/` | Unit controls and dimension parser utility |
| `src/components/editor/ZoomControls.tsx` | Zoom and viewport fit controls |
| `src/geometry/plot.ts` | Quadrilateral solving, plot construction, area, perimeter, and bounds |
| `src/geometry/plot/PlotContext.tsx` | Plot dimensions and selection state |
| `src/geometry/viewport.ts` and `ViewportContext.tsx` | World/screen transforms and viewport state |
| `src/geometry/units/` | Unit types, parsing, formatting, and unit context |
| `src/lib/persistence.ts` | Validated, failure-safe local storage helpers |
| `src/types/plot.ts` | Plot and geometry data types |
| `src/index.css` and `src/App.css` | Global styles and app styles |

## Geometry and state model

Corner coordinates are the editable source of truth and remain in millimetres. Dragging one corner updates its coordinates directly while the other three corners stay fixed; the four edge dimensions are measured from the resulting geometry. Editing an edge length moves its endpoint along the edge's current direction. `computePlotMetrics` derives area with the shoelace formula and calculates perimeter, centroid, and axis-aligned bounds. The canvas maps world-space millimetres through the viewport transform into SVG screen coordinates. The original circle-intersection solver remains the source of the default plot shape and for migrating older saved dimensions.

React context providers own the plot, unit preferences, and viewport state. Persisted browser data is versioned by storage key and validated when read; malformed, missing, or unavailable storage falls back to the in-memory defaults.

## Current scope

The editor currently models one quadrilateral plot. It does not yet provide project files, multiple plots, undo/redo, or export. When four dimensions cannot form an exact quadrilateral, the geometry solver uses a fallback position for the final corner; dimension validation and a user-facing geometry warning are future improvements.

## Stack

React 19, TypeScript 6, Vite 8, Tailwind CSS 4, and lucide-react.
# siteplan-designer
