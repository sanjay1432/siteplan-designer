# SitePlan Designer

An in-browser site-plan editor for tracing polygonal parcel boundaries, preparing building floor plans, and generating printable project reports. Geometry is stored in millimetres and displayed in architectural, decimal-feet, metric, or millimetre units.

## Getting started

Requires Node.js and npm.

```sh
npm install
npm run dev
```

The development server prints the local URL. Use `npm run build` to create a production bundle, `npm run preview` to serve that bundle locally, `npm run lint` to run ESLint, and `npm test` to run the geometry and unit-parsing tests (Vitest).

## Public pages and deployment

- `/` is the public landing page, `/app` opens the editor, and `/contact` provides a validated contact form.
- The app remains free to use without signup. Project data is saved in the visitor's browser.
- The contact form uses Netlify Forms and a honeypot field for basic bot filtering. Deploy with Netlify to receive submissions in the site's Forms dashboard; local Vite previews do not process submissions.
- `netlify.toml` configures the production build and client-side route fallback. Connect this repository to a Netlify site and deploy the `main` branch (or deploy the generated `dist/` folder). Add a custom domain in Netlify if desired.

## Editor capabilities

- Edit every boundary segment length with architectural, decimal-feet, metric, or millimetre input.
- View the site boundary, labeled segment lengths, bearings, interior angles (with the closure check against (n−2)·180°), point coordinates, area, and perimeter.
- Type exact X/Y coordinates for any boundary point, or drag it on the plan; dragged points snap to the visible grid (hold Alt to place freely, or turn snapping off in the canvas toolbar). Split a selected segment to add a point or remove a point while preserving a valid boundary.
- Import an ordered survey CSV of easting/northing points in feet, metres, or millimetres. The source coordinates, origin, file name, and coordinate-reference label are retained with the project and included in reports.
- Pan by scrolling or with the middle or right mouse button; Shift+scroll pans horizontally. Ctrl+scroll zooms at the pointer.
- Fit the viewport to the plot with the zoom cluster over the plan, or click the zoom percentage to show the whole 100 ft × 100 ft workspace.
- Switch between feet, metres, and millimetres from the top bar.
- The side panel is organised into three tabs: **Plot** (sides with their setbacks, corner coordinates, survey import, site features), **Building** (floors, layout templates, a compact room list that expands into the selected room's editor, furniture and notes), and **Project** (report details, issue history, assumptions). Selecting something on the plan opens the tab that edits it.
- All exports (project report, plan PNG/SVG/PDF, JSON backup and import) live in the **Export** menu in the top bar.
- Plot dimensions and unit/display preferences are saved in browser local storage on this device. Resetting the plot restores the default dimensions (58 ft, 59 ft, 58 ft, 65 ft).
- Set a setback for every boundary edge, including polygonal parcels with more than four sides. Type each distance, apply one distance to all edges, or drag the diamond handle on each setback edge. Splitting an edge keeps its setback on both halves. Rooms that extend past the setback line are outlined in red, flagged in the room list, and listed under Sides & setbacks.
- Add and edit rectangular site features for building footprints, drives, parking, walks, landscape, trees, utilities, easements, and other mapped extents. Set each to existing, proposed, or removed; drag and resize features on the plan, or hide them from the drawing without removing them from the report schedule.
- Prepare multiple floor plans with rooms, segment-aware shared walls, doors, windows, and stairwells; shared portions draw as one wall even when adjoining room edges only overlap partially.
- Explore an interactive WebGL (three.js) model of the site and building: the plot, setback line, site features, stilt level, every floor with walls at their modeled thickness, door and window openings, stairs, pillars, and an optional roof. Orbit, pan, and zoom; jump to 3D/top/front/side views; show only the levels up to a chosen floor to look inside; and download the view as a PNG. The 3D module loads on demand so the 2D editor stays light.
- Undo and redo with Ctrl+Z and Ctrl+Y (or Ctrl+Shift+Z); a whole drag is one undo step, while button actions such as splitting a side are always their own step. Escape clears the selection. Hold Shift while dragging a room to keep it on one axis; turn on **Move all** to drag the whole floor plan.
- Resizing a room keeps its door/window openings within the edited wall. Imported project files are checked for positive room sizes, valid wall thicknesses, and openings that fit their referenced room side.
- Store client/owner, site address, project number, preparer, revision, and notes with each project; these fields appear in the printable report.
- Maintain a project assumptions register with a source/basis and assumed or confirmed status; the report carries the register forward for review.
- Keep an issue history with revision, date, preparer, and description; the printable report identifies the current revision and lists recorded issues.
- Create a printable project report, in the unit system you are working in, with a site drawing that includes the proposed building footprint, per-level drawings, boundary bearings and interior angles, assumptions register, site feature schedule, plot metrics, boundary dimensions, setbacks, corner coordinates, compass orientation, modeled per-level and total floor areas, room clear dimensions and areas, per-side wall thicknesses, detailed door/window locations and widths, and measured-reference endpoint coordinates and lengths. Area totals are clearly labeled as model quantities. Choose “Save as PDF” in the browser print dialog to share it.
- Autosave projects locally in a versioned collection; existing version 1 browser data is migrated to the current collection while its original key is retained as a recovery copy.
- Export editable project JSON as a schema-versioned project/site/buildings document in millimetres. Version 1 and 2 backups still import through migration into the current document model.

## Source map

| Path | Responsibility |
| --- | --- |
| `src/App.tsx` | Application entry component |
| `src/components/editor/SitePlanEditor.tsx` | Editor shell and provider composition |
| `src/components/canvas/` | SVG canvas, grid, and plot rendering |
| `src/components/ruler/Ruler.tsx` | Viewport-aware horizontal and vertical rulers |
| `src/components/properties/PlotPropertiesPanel.tsx` | Side panel shell with the Plot / Building / Project tabs |
| `src/components/properties/PlotTab.tsx`, `BuildingTab.tsx`, `ProjectTab.tsx` | Tab contents; `panelKit.tsx` holds the shared inputs and disclosure blocks |
| `src/components/toolbar/` | Project picker with undo/redo, unit switch, and the Export menu |
| `src/components/editor/ZoomControls.tsx` | Zoom and viewport fit controls |
| `src/components/editor/House3DModule.tsx` | 3D viewer: renderer, camera controls, view presets, pillar selection |
| `src/components/editor/house3d/buildScene.ts` | Builds the three.js site and building model from project data |
| `src/geometry/plot/boundary.ts` and `setback.ts` | Boundary validation, containment, angles/bearings, and per-edge inward offsets |
| `src/geometry/grid.ts` | Zoom-dependent grid spacing shared by the grid and snapping |
| `src/geometry/plot.ts` | Quadrilateral solving, plot construction, area, perimeter, and bounds |
| `src/geometry/plot/model.ts` | Editor-independent project geometry types, wall assembly defaults, and shared-wall segmentation |
| `src/geometry/plot/PlotContext.tsx` | Project persistence, editing actions, and selection state |
| `src/geometry/viewport.ts` and `ViewportContext.tsx` | World/screen transforms and viewport state |
| `src/geometry/units/` | Unit types, parsing, formatting, and unit context |
| `src/lib/persistence.ts` | Validated, failure-safe local storage helpers |
| `src/lib/sitePlanExport.ts` | Project backup, drawing export, printing, and client report generation |
| `src/types/plot.ts` | Plot and geometry data types |
| `src/index.css` and `src/App.css` | Global styles and app styles |

## Geometry and state model

Corner coordinates are the editable source of truth and remain in millimetres. Dragging or typing one point updates its coordinates directly while the other points stay fixed; edge lengths, bearings, and angles are measured from the resulting geometry. Editing an edge length moves its endpoint along the edge's current direction. Setbacks are stored per edge, keyed by the edge's start point, and older top/right/bottom/left setbacks are migrated onto the first four edges. `computePlotMetrics` derives area with the shoelace formula and calculates perimeter, centroid, and axis-aligned bounds. The canvas maps world-space millimetres through the viewport transform into SVG screen coordinates. The original circle-intersection solver remains the source of the default plot shape and for migrating older saved dimensions.

React context providers own the plot, unit preferences, and viewport state. Edits go through a single commit path that records undo history once per change and ignores rejected edits. Autosave is debounced and flushed when the page is hidden. Persisted browser data is versioned by storage key and validated when read; malformed, missing, or unavailable storage falls back to the in-memory defaults.

## Current scope and limitations

Projects are stored locally in the current browser; JSON files can be used to move project data between devices. Survey CSV import assumes a projected or local planar coordinate grid; it stores the coordinate-reference label but does not reproject latitude/longitude or bearings. Site features are currently editable rectangles or symbols; grading surfaces, routed utilities, richer geometry, quantity takeoffs, and multiple building objects remain future work. The report is a design summary generated from the current model, not a permit submission or code-compliance determination. Jurisdictional rule checks, drawing-sheet setup, immutable report snapshots, and contract preparation remain future work.

## Stack

React 19, TypeScript 6, Vite 8, Tailwind CSS 4, three.js, lucide-react, and Vitest.
# siteplan-designer
