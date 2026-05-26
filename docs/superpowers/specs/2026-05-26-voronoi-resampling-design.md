# Voronoi Resampling Design

**Date:** 2026-05-26
**Status:** Approved
**Branch:** shades-feature-voronoi

## Overview

Voronoi resampling is a new geometry generation method, sibling to the existing `projection` method. Both produce the same output structures (bands, tubes, sections) from a surface mesh, but use different strategies for determining where tubes go on the surface.

- **Projection** uses polyhedra edge curves + raycasting from a center point to find surface intersection points.
- **Voronoi** uses a Voronoi tessellation of seed points on the surface. Cell boundary edges define tube paths.

The structural analogy is direct:

| Projection | Voronoi |
|---|---|
| Polyhedron face (polygon) | Voronoi cell (polygon) |
| Polyhedron vertex | Voronoi vertex |
| Polyhedron edge → tube | Voronoi edge → tube |
| Edge projected onto surface via raycasting | Edge mapped to 3D via UV → barycentric |
| Edge divisions = sample count along tube | Edge divisions = sample count along tube |
| 4 end partners per tube | 4 end partners per tube |

## Approach: Adapter Pattern

Voronoi produces `ProjectionEdge`-compatible output, then feeds into the existing downstream pipeline (`combineSections` → `generateProjectionBands` → Tubes). Steps 1–4 are Voronoi-specific; steps 5–7 are shared with projection.

### Pipeline

```
Voronoi-specific:
  1. VoronoiConfig → seed method generates 3D points on surface
  2. Project seeds to UV space → Lloyd relaxation
  3. d3-delaunay Voronoi in UV → extract edges
  4. Map edges to 3D, sample edgeDivisions points, generate offset curve points
     → ProjectionEdge-compatible structures

Shared with projection:
  5. Apply cross-sections at each sample point
  6. combineSections → complete section rings
  7. generateProjectionBands → Bands → Tubes
```

## Config Types

### VoronoiConfig

Sits alongside `BaseProjectionConfig` in `SuperGlobuleConfig` as a sibling array:

```typescript
type SuperGlobuleConfig = {
  // ...existing fields
  voronoiConfigs: VoronoiConfig[];
};

type VoronoiConfig = {
  type: 'VoronoiConfig';
  meta: { transform: TransformConfig };
  surfaceConfig: SurfaceConfig;            // Reuse: Sphere | Capsule | Globule
  seedConfig: VoronoiSeedConfig;
  crossSectionConfig: CrossSectionConfig;  // Reuse from projection
  bandConfig: ProjectionBandConfig;        // Reuse: orientation, symmetry
  edgeDivisions: number;                   // Sample count along each Voronoi edge
};
```

### VoronoiSeedConfig

Seed generation is a pluggable strategy. Everything downstream receives `Vector3[]` with no method-specific assumptions.

```typescript
type VoronoiSeedConfig = {
  type: 'VoronoiSeedConfig';
  seedMethod: SeedMethod;
  relaxationIterations: number;    // Lloyd relaxation (0 = pure random)
};

type SeedMethod = CenterProjectionSeedMethod;  // Extensible union

type CenterProjectionSeedMethod = {
  type: 'centerProjection';
  pointCount: number;
  seed: number;                    // PRNG seed for reproducibility
};
```

The pipeline boundary:

```
SeedMethod → generateSeeds(method, surface) → Vector3[]
                                                  ↓
                            (opaque 3D points — no method-specific assumptions)
                                                  ↓
                            UV project → Voronoi → sample edges → tubes
```

## Algorithm Details

### Step 1: Generate Seed Points

Using the `centerProjection` method:
- Initialize a seeded PRNG with `seedConfig.seedMethod.seed`
- Generate `pointCount` random direction vectors
- Cast rays from surface center in each direction
- Collect ray-surface intersection points → `Vector3[]`

The seed method is independent from downstream processing. Future methods (manual placement, fibonacci spiral, etc.) produce the same `Vector3[]` output.

### Step 2: UV Mapping + Lloyd Relaxation

**UV projection** (spherical mapping):
- Normalize each 3D point relative to surface center → unit sphere direction
- Convert to spherical coordinates `(theta, phi)` → UV `(u, v)`

**Lloyd relaxation** (applied in UV space):
- For `relaxationIterations` iterations:
  1. Compute Voronoi diagram of current UV seeds
  2. Move each seed to its cell's centroid
- Produces more uniform cell sizes while preserving organic character

**Polar distortion handling:**
- Duplicate seed points across the UV boundary seam before computing Voronoi
- Clip Voronoi edges to UV bounds
- Handle wrap-around edges at the seam

**Future extensibility:** The UV projection strategy can be swapped (e.g., mesh parameterization instead of spherical projection) for non-convex surfaces without affecting the Voronoi computation or downstream pipeline.

### Step 3: Voronoi Computation

- Run `d3-delaunay` Delaunay triangulation on final UV seed positions
- Extract Voronoi diagram → cell polygons and edges
- Each Voronoi edge is a line segment between two Voronoi vertices in UV space
- Build edge-vertex connectivity graph for tube formation

### Step 4: Map Edges to 3D + Sample

For each Voronoi edge:
1. Interpolate `edgeDivisions` points along the edge in UV space
2. Map each UV point back to 3D:
   - Find which surface mesh triangle the UV point falls in (UV-space triangle lookup)
   - Compute barycentric coordinates within that triangle
   - Interpolate the 3D vertex positions → accurate point on surface
3. At each 3D sample point:
   - Compute surface normal and edge tangent direction
   - Generate offset "curve" points perpendicular to the edge (for cross-section width scaling)
4. Package as `ProjectionEdge`-compatible structures

### Steps 5–7: Shared Pipeline

Unchanged from projection:
- Apply cross-sections at each sample point (perpendicular profiles)
- `combineSections` pairs edges to form complete section rings
- `generateProjectionBands` converts sections to bands and tubes
- `getFacetEdgeMeta` computes partner/adjacency metadata

### Edge Topology

Voronoi edge topology maps directly to the projection model:
- Each Voronoi edge connects 2 Voronoi vertices → one tube
- Each Voronoi vertex has valence 3 (always, by Voronoi properties)
- Each tube has 4 end partners (2 per end)
- No branching — tubes join at vertices, identical to projection

## Dependencies

**New:**
- `d3-delaunay` — Voronoi/Delaunay computation (~15KB, tree-shakeable)

**Existing (reused):**
- Three.js — raycasting, Vector3, Triangle
- bezier-js — cross-section curves

## Worker Integration

- Voronoi generation runs inside the existing web worker
- `generate-superglobule.ts` iterates `voronoiConfigs` alongside `projectionConfigs`
- New function `makeVoronoi(config, address)` parallels `makeProjection(config, address)`
- Returns `{ tubes, surface }` — same shape as projection output
- No new Three.js types to rehydrate in `workerStore.ts`

## File Organization

### New files

```
src/lib/voronoi/
  generate-voronoi.ts          # Main pipeline: config → tubes
  generate-seeds.ts            # Seed methods (centerProjection)
  uv-mapping.ts                # 3D ↔ UV projection + barycentric lookup
  voronoi-to-edges.ts          # d3-delaunay → ProjectionEdge-compatible
  types.ts                     # VoronoiConfig, SeedMethod, etc.

src/components/controls/
  VoronoiControl.svelte        # Config UI panel
```

### Reused from projection (imported, not copied)

- `generateSurface()` — surface mesh creation
- Cross-section application logic
- `combineSections()` and `generateProjectionBands()`
- `getFacetEdgeMeta()` — partner/adjacency computation
- Band/Tube/Facet types

## UI & Editors

A new `VoronoiControl` panel, sibling to the existing projection controls:

- **Surface selector** — reuse existing surface config UI (sphere/capsule/globule)
- **Seed config section:**
  - Seed method selector (just "Center Projection" initially, extensible)
  - Point count slider
  - Random seed input + "randomize" button
  - Relaxation iterations slider (0–20 range)
- **Cross-section config** — reuse existing bezier curve editor
- **Band config** — reuse existing orientation/symmetry controls
- **Edge divisions** slider

3D viewport rendering uses the existing `GlobuleGeometryComponent` since output is standard Tubes/Bands/Facets.

## Testing

- Unit tests for seed generation (deterministic with fixed PRNG seed)
- Unit tests for UV round-trip accuracy (3D → UV → 3D ≈ identity)
- Unit tests for Voronoi edge extraction and sampling
- Integration test: full pipeline with sphere surface, verify output is valid Tubes with correct facet adjacency
