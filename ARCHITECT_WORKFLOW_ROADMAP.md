# Architect workflow roadmap

The near-term product is a dependable site-planning and client-review tool. Contract preparation is deliberately a separate future phase.

## Current foundation

- Projects contain a plot, setbacks, multiple floor plans, rooms, wall widths, openings, measurements, compass orientation, and project identity fields.
- Project assumptions are stored with their source/basis and an assumed or confirmed state; they are included in the client report.
- Projects keep an issue history with revision, issue date, preparer, and description; exports preserve the entries and client reports identify the current revision and list recorded issues.
- Room walls split into shared and exposed segments; partial adjoining edges share one modeled wall. Width changes synchronize the opposing adjoining room walls.
- Add rectangular or symbolic site features for building footprints, drives, parking, walks, landscape, trees, utilities, easements, and other mapped elements; mark each existing, proposed, or removed, control its drawing visibility, and position/resize it in the plan.
- Room resizing repositions or narrows openings to keep them within their wall. Imported JSON validates positive room extents, wall thicknesses, and room-side opening bounds.
- Site boundaries support any number of ordered points; users can split segments, drag points, remove points, and edit every segment length. Invalid, crossed, or collapsed boundaries are rejected.
- Import ordered survey CSV points in feet, metres, or millimetres; retain the original coordinate rows, first-point origin, source file, and coordinate-reference label with the project and report.
- Projects autosave in a versioned browser collection. Existing version 1 project lists migrate on load, and the prior key stays available as a recovery copy.
- Domain geometry types and wall defaults live in an editor-independent model module. Current JSON exports separate project identity, site geometry, and building levels; older envelope versions 1 and 2 are normalized on import. The current editor serializes one primary building, while multi-building editing remains future work.
- The printable report is generated from project data and includes a site drawing with visible mapped features, a feature schedule that also identifies hidden features, per-level drawings with modeled wall bands and opening breaks, plot metrics, boundary and setback schedules, corner coordinates, project details, modeled per-level/total floor area unions, room clear dimensions and areas, wall segment offsets/conditions/thicknesses, opening schedules, and measured-reference endpoint coordinates and lengths. Model area quantities and feature extents are explicitly not represented as code-defined or approved calculations.

## Next architect workflow phases

### 1. Reliable survey geometry

- Add bearing/distance entry, survey format adapters, coordinate-reference definitions and transformations, and explicit survey/design coordinate provenance.
- Represent easements, right-of-way, existing structures, adjacent boundaries, and no-build zones as separate named geometry.
- Keep source survey measurements distinct from design edits and identify which values are assumed.
- Validate closed boundaries, self-intersections, degenerate edges, and area/perimeter calculations before accepting geometry.

### 2. Site design elements

- Extend the current rectangle and symbol tools into reusable layers for grading, drainage, routed utilities, and service areas with visibility, richer geometry, and quantities.
- Give every feature typed geometry, editable properties, visibility, and report quantities.
- Support multiple buildings and alternate site layout options within one project.
- Maintain a clear distinction between existing, proposed, and removed conditions.

### 3. Jurisdiction-aware checks

- Introduce project location and a selected, dated rule profile.
- Report checks for setbacks, lot coverage, floor area ratio, height, parking, access, and other configured requirements.
- Show rule source, measured value, expected value, pass/warning/fail state, and manual-review status for every result.
- Never present an unconfigured or unverified rule as legal approval; allow project teams to record reviewer and verification date.

### 4. Drawing sheets and issue control

- Replace the current browser print layout with configured drawing sheets: page size, scale, title block, legend, scale bar, north arrow, sheet number, and annotation styles.
- Generate separate site, ground, and upper-floor sheets with stable extents and readable dimension labels.
- Add immutable report snapshots to named issue/revision entries, with date, author, description, and a stable link to the exact project document used for issue.
- Provide reliable PDF export and retain editable project files; add CAD exchange formats after geometry and layer schemas are stable.

## Project model direction

Keep persistent project content independent of React components and the current viewport. Build toward a versioned document with:

- `project`: identity, client, site address, project number, contributors, units, and document version.
- `survey`: coordinate reference, origin, source metadata, measured boundary, and assumptions.
- `site`: named existing/proposed feature layers and multiple building footprints.
- `buildings`: levels, spaces, wall assemblies, openings, stairs, and vertical relationships.
- `checks`: jurisdiction profile, rule citations, results, reviewer, and verification dates.
- `sheets`: page setup, viewports, annotations, title blocks, and issue/revision history.

Changes to the document schema should include migration from saved browser projects and exported JSON. The current export envelope separates site and building-level data, and its importer retains legacy envelope migrations. Browser autosave also uses a versioned collection and migrates the former project-list format. Generated reports should be reproducible from a saved document version rather than depending on what happens to be visible in the editor.

## Future contract phase

After project data, reporting, and issue control are stable, a separate workflow can assemble scope, parties, fees, milestones, approvals, and contract attachments from approved project information. Contract text, signatures, and legal terms are outside the current site-planning/report phase.
