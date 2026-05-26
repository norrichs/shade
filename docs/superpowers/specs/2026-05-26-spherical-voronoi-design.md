# Spherical Voronoi Method Design

**Date:** 2026-05-26
**Status:** Approved

## Overview

Add `d3-geo-voronoi` as an alternative Voronoi computation method alongside the existing UV mapping + `d3-delaunay` approach. The spherical method computes Voronoi directly on the sphere surface — no UV unwrapping, no pole bunching, no seam discontinuity.

Both methods are toggleable via `voronoiMethod: 'spherical' | 'uv'` on `VoronoiConfig`. Default is `'spherical'`.

## Config Change

```typescript
type VoronoiMethod = 'spherical' | 'uv';

type VoronoiConfig = {
  // ...existing fields
  voronoiMethod: VoronoiMethod;
};
```

## Pipeline Branch

After seed generation, branch on `voronoiMethod`:

- **`'uv'`** (existing): `toUV()` → `lloydRelax()` → `computeVoronoi()` → UV edges → map to 3D
- **`'spherical'`** (new): `toLonLat()` → `lloydRelaxSpherical()` → `computeVoronoiSpherical()` → spherical edges → map to 3D

Both paths converge at the same output: Voronoi edges with 3D sample points and cell indices. Everything downstream (cross-sections, bands, tubes) is unchanged.

`relaxationIterations` applies to both methods. Users can set it to 0 if not needed.

## New File: `src/lib/voronoi/compute-voronoi-spherical.ts`

- `computeVoronoiSpherical(seedsLonLat: [number, number][])` → `VoronoiResult` — wraps `d3-geo-voronoi`
- `lloydRelaxSpherical(seedsLonLat: [number, number][], iterations: number)` → `[number, number][]` — Lloyd relaxation using spherical cell centroids
- `toLonLat(point: Vector3, center: Vector3)` → `[number, number]` — 3D point to `[longitude, latitude]` degrees
- `fromLonLat(lon: number, lat: number)` → `Vector3` — unit direction vector from lon/lat

## Existing Files Unchanged

- `compute-voronoi.ts` — remains the `'uv'` path
- `uv-mapping.ts` — remains the `'uv'` path

## Modified Files

- `src/lib/voronoi/types.ts` — add `VoronoiMethod`, add `voronoiMethod` to `VoronoiConfig`
- `src/lib/voronoi/generate-voronoi.ts` — branch on `voronoiMethod` after seed generation
- `src/lib/shades-config.ts` — update default to `voronoiMethod: 'spherical'`
- `src/components/controls/VoronoiControl.svelte` — add method toggle

## Dependencies

- `d3-geo-voronoi` — spherical Voronoi computation

## Edge Mapping (Spherical Path)

`d3-geo-voronoi` returns cell polygons as arrays of `[lon, lat]` coordinates. Edge extraction follows the same pattern as the UV path:
1. For each cell, iterate polygon edges
2. Find the neighbor sharing each edge
3. Deduplicate (only keep edge where `cellIdx < neighborIdx`)
4. Convert edge vertex coordinates from `[lon, lat]` to 3D via `fromLonLat()`

The 3D edge sampling then works the same as the UV path: interpolate along the edge, raycast to surface, apply cross-sections.

## UI

Add a select/toggle to `VoronoiControl.svelte`:
- Label: "Method"
- Options: "Spherical" / "UV"
- Default: "Spherical"
