# `super` store — SuperGlobuleConfig

Store: `superConfigStore` (`src/lib/stores/superGlobuleStores.ts:202`). Type:
`SuperGlobuleConfig` (`src/lib/types.ts:1197`). Every write re-runs 3D generation
in the worker (50 ms debounce, `superGlobuleStores.ts:243`), unless manual mode or
`2d-only` is active (see `view-and-ui.md`).

All paths below are dotted paths from the store root, as the bridge takes them
(`src/lib/agent-bridge/paths.ts`).

## Bridge path rules

- `setAtPath` refuses to create missing **intermediate** keys, but the **last** key
  may be new. So `projectionConfigs.0.edgeSampling` = `{...}` works when
  `edgeSampling` is absent; `projectionConfigs.0.edgeSampling.curveSource` fails.
- Array index must be ≤ length (index == length appends).
- Each entry in `patches` is a separate `store.set`. Set coupled values (e.g.
  `[min,max]` pairs) as one value.

## Top level

| Path                | Type                     | Notes                                                                                                                     |
| ------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `type`              | `'SuperGlobuleConfig'`   | Don't change.                                                                                                             |
| `id`                | number \| temp-id string | DB id or `sup-…` temp id. Don't change.                                                                                   |
| `name`              | string?                  | Display name.                                                                                                             |
| `subGlobuleConfigs` | `SubGlobuleConfig[]`     | Globule definitions. Index 0 is the important one.                                                                        |
| `projectionConfigs` | `BaseProjectionConfig[]` | Polyhedron projections. **Index 0 is also the surface for Voronoi.**                                                      |
| `voronoiConfig`     | `VoronoiConfig`          | One Voronoi config. Always present after load (`normalizeVoronoiConfig`, `src/lib/voronoi/migrate-voronoi-config.ts:35`). |

Default: `generateDefaultSuperGlobuleConfig` (`src/lib/shades-config.ts:686`). It has
two sub-globules that share one `globuleConfig` (same `id`) and one icosahedron
projection on a sphere.

### Which pipeline reads what (`src/lib/generate-superglobule.ts:62-114`)

| Pipeline (gate)                             | Reads                                                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| globule (legacy, `showGlobuleGeometry.any`) | every `subGlobuleConfigs[i]`, including `transforms`                                                       |
| globuleTube (`showGlobuleTubeGeometry.any`) | each **distinct** `subGlobuleConfigs[i].globuleConfig.id`, first one wins; transforms are ignored (`:175`) |
| projection (`showProjectionGeometry.any`)   | every `projectionConfigs[i]`                                                                               |
| voronoi (`showVoronoiGeometry.any`)         | `voronoiConfig`, with `projectionConfigs[0].surfaceConfig` as the surface (`:108-113`)                     |

If `projectionConfigs[i].surfaceConfig.type === 'GlobuleConfig'`, generation swaps in
`subGlobuleConfigs[0].globuleConfig` at run time and keeps only the surface's
`transform` (`generate-superglobule.ts:84-96`). Editing the globule at
`subGlobuleConfigs.0.globuleConfig` is enough. The copy stored in the surface
config can go stale, and that's harmless.

---

## Bezier curves (used everywhere)

`BezierConfig` (`types.ts:1078`): one cubic segment.

```json
{
	"type": "BezierConfig",
	"points": [
		{ "type": "PointConfig2", "x": 0, "y": 65 }, // p0 start
		{ "type": "PointConfig2", "x": 85, "y": 65 }, // c1 control
		{ "type": "PointConfig2", "x": 20, "y": -100 }, // c2 control
		{ "type": "PointConfig2", "x": 0, "y": -65 } // p1 end
	]
}
```

- A curve config's `curves: BezierConfig[]` is a chain. Keep `curves[n].points[3]`
  equal to `curves[n+1].points[0]` so the chain stays continuous.
- `points` must have exactly 4 entries, and each needs `"type":"PointConfig2"`.
  `pointType?: 'smooth'|'angled'` is editor-only.
- Edit one coordinate: `subGlobuleConfigs.0.globuleConfig.silhouetteConfig.curves.0.points.1.x`.
- These arrays get large: a polyhedron model holds dozens of polygons. Read them
  with a small `depth`.

---

## Globule: `subGlobuleConfigs.N`

`SubGlobuleConfig` (`types.ts:1290`): `{type, id, name?, globuleConfig, transforms}`.

### `subGlobuleConfigs.N.transforms` (legacy pipeline only)

`ChainableTransform[]` (`types.ts:1407`). Each entry has `recurs: [{multiplier, ghost?, recombines?}]`
plus exactly one of:

- `translate: {x,y,z}`
- `rotate: {angle (radians), anchor:{x,y,z}, axis:{x,y,z}}`
- `reflect: {anchor, normal}`
- `scale: {anchor, scaleValue}`

Only the legacy globule pipeline uses these. The tube, projection and Voronoi
pipelines ignore them.

### `subGlobuleConfigs.N.globuleConfig` — `GlobuleConfig` (`types.ts:1415`)

#### Silhouette — profile of the sweep

Path: `…globuleConfig.silhouetteConfig.curves` (`SilhouetteConfig`, `types.ts:1108`).

- For each point on the curve, **y becomes the z height** and **x becomes the
  radius scale**. Radius = `x * |shapeVertex| * 2`, where the shape is normalised by
  1/200 (`generate-level.ts:326-338`, `generate-shape.ts:223`). In practice x is
  roughly the world radius for a shape point at distance 100.
- Default (`shades-config.ts:46`) runs from (0, 65) to (0, -65): a closed pod with
  poles at x = 0.
- **Gotcha:** if x ≠ 0 at an end, the surface has an open end. Projection
  ray-casting then throws "No intersection found … enable end caps"
  (`generate-projection.ts:635`), unless `endCaps` closes the end.
- x = 0 at a pole collapses the first facet. That is handled, but see
  concepts.md (flattening).

#### Shape — the cross-section ("level")

Path: `…globuleConfig.shapeConfig` (`ShapeConfig`, `types.ts:1148`).

| Field            | Type                                                                 | Meaning / range                                                                                                                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `symmetry`       | `'asymmetric'\|'radial'\|'lateral'\|'radial-lateral'`                | How the authored run repeats (`src/lib/geometry/radial-shape.ts`). Reflected kinds (`lateral`, `radial-lateral`) mirror the run.                                                                                                                 |
| `symmetryNumber` | int ≥ 1                                                              | Number of repeats. The authored run spans 2π/n, or π/n when reflected (`radial-shape.ts:26`). Default 5.                                                                                                                                         |
| `sampleMethod`   | `{method:'divideCurve'\|'divideCurvePath'\|'divideSide', divisions}` | Vertex count around the level, which equals the **band count around the globule**. `divideCurve`: divisions × total curves. `divideSide`: divisions × sides. `divideCurvePath`: exactly `divisions`. Default `divideCurve`/30 × 5 repeats = 150. |
| `curves`         | `BezierConfig[]`                                                     | The authored run, in ±100 units. Default radial: from (0,100) round to the rotated end (`shades-config.ts:158`).                                                                                                                                 |

**Gotchas**

- The run's end must equal its start rotated by the wedge angle. For asymmetric
  shapes the run must close itself. Otherwise the outline has a gap or overshoot.
- If you change `symmetryNumber`, re-author `curves` to the new wedge. The
  editor's default generator is `generateDefaultRadialShapeConfig(n, sampleMethod,
symmetry)` (`shades-config.ts:158`).
- High `divisions` multiplies band and facet counts, which slows generation.

#### Levels

Path: `…globuleConfig.levelConfig` (`LevelConfig`, `types.ts:916`).

| Field                        | Type                                  | Meaning                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `silhouetteSampleMethod`     | `CurveSampleMethod` (`types.ts:1136`) | Sets how many levels are taken along the silhouette, which is the facet count along a band. `divideCurve`: curves × divisions + 1; otherwise divisions + 1 (`generate-level.ts:462`). `preserveAspectRatio` iterates the spacing so quads keep an even aspect ratio (`:199`). `spineCurve` is a stub with no implementation (`:171`). Default `divideCurve`/10. |
| `levelPrototypeSampleMethod` | `'shape'\|'curve'`                    | Default `'curve'`.                                                                                                                                                                                                                                                                                                                                              |
| `levelCount`                 | number?                               | **Derived only.** `countLevels` ignores it.                                                                                                                                                                                                                                                                                                                     |
| `levelOffsets`               | `LevelOffset[]` (`types.ts:903`)      | Cycled per level. x, y, rotX, rotY and rotZ (radians) are multiplied by the level index (`generate-level.ts:468-486`), so `rotZ` adds **twist per level**. `scaleX`/`scaleY` scale the cross-section directly. `z` and `depth` are overwritten to 1.                                                                                                            |

#### Depth curve

`…globuleConfig.depthCurveConfig` (`types.ts:1121`). The curve's x divided by
`depthCurveBaseline` (default 100) sets the depth at each height. depth = 1 keeps
the full shape. Below 1, the level relaxes toward its inscribed circle; above 1,
the lobes are exaggerated. Default is a vertical line at x = 100 (no effect).

#### Other GlobuleConfig fields

| Path suffix                      | Notes                                                                                                                                                                |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spineCurveConfigs`              | Array of `{type,id,angle,curves}`. Its consumer is commented out (`generate-level.ts:58`).                                                                           |
| `bandConfig` (`types.ts:1492`)   | `bandStyle: 'circumference'\|'helical-left'\|'helical-right'`, `offsetBy: -2..2`, `tabStyle`. Legacy pipeline.                                                       |
| `strutConfig` (`types.ts:1170`)  | Legacy struts.                                                                                                                                                       |
| `renderConfig` (`types.ts:1513`) | Legacy render ranges and show flags.                                                                                                                                 |
| `endCaps`                        | `{enabled, topCap, bottomCap, capOffset?}` (`src/lib/geometry/end-caps.ts:12`). Fan caps that close open globule ends **for ray-casting surfaces**. Default enabled. |

---

## Projection: `projectionConfigs.0`

`ProjectionConfig` (`src/lib/projection-geometry/types.ts:210`). Default:
`defaultProjectionConfig` (`src/lib/projection-geometry/configs.ts:61`).

| Path                                             | Type                                            | Meaning                                                                                                                                                            |
| ------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `projectionConfigs.0.meta.transform`             | `{translate, scale, rotate}` (each `{x,y,z}`)   | Used wherever a surface or polyhedron transform is `'inherit'` (`generate-projection.ts:116-124`).                                                                 |
| `projectionConfigs.0.surfaceConfig`              | `SurfaceConfig`                                 | The surface that rays hit. **Voronoi uses this too.**                                                                                                              |
| `projectionConfigs.0.projectorConfig.polyhedron` | `PolyhedronConfig`                              | Topology (polyhedron edges become tubes).                                                                                                                          |
| `projectionConfigs.0.bandConfig`                 | `{orientation, tubeSymmetry?}`                  | `orientation: 'circumferential'\|'axial-right'\|'axial-left'` (facet layout, `types.ts:998`); `tubeSymmetry: 'axial'\|'lateral'`. Default `axial-right`/`lateral`. |
| `projectionConfigs.0.surfaceProjectionConfig`    | `{divisions, fillAll?}` (optional)              | `divisions` (0–5 in the UI) adds rows between edge and inset curve in the surface-projection tubes. `fillAll` adds interior fill bands (outlined patterns only).   |
| `projectionConfigs.0.edgeSampling`               | `EdgeSamplingConfig` (optional, `types.ts:194`) | See below.                                                                                                                                                         |

### Surface (`surfaceConfig`) — pick one shape

Defaults are in `src/lib/projection-geometry/surface-definitions.ts`. Every variant
also has `transform: TransformConfig | 'inherit'`.

| `type`            | Fields                                                                | Default                                                    |
| ----------------- | --------------------------------------------------------------------- | ---------------------------------------------------------- |
| `'SphereConfig'`  | `radius`, `center{x,y,z}`                                             | r 400, center 0.001,0.001,0.001                            |
| `'CapsuleConfig'` | `radius, center, height, capSegments, radialSegments, heightSegments` | r 200, h 400, 10/20/1                                      |
| `'GlobuleConfig'` | an entire GlobuleConfig, plus `transform`                             | Taken from `subGlobuleConfigs.0.globuleConfig` at run time |

To switch type, set the **whole** `projectionConfigs.0.surfaceConfig` object, as the
editor does (`src/components/modal/editor/Surface.svelte:17-42`). For example:
`{"type":"SphereConfig","radius":400,"center":{"x":0.001,"y":0.001,"z":0.001},"transform":{"translate":{"x":0,"y":0,"z":0},"scale":{"x":1,"y":1,"z":1},"rotate":{"x":0,"y":0,"z":0}}}`.
For a globule surface you can copy the globule config and add `transform`.

- Rays are cast from `center` for sphere and capsule, and from the origin for a
  globule (`generate-projection.ts:270`). Keep the surface star-shaped around that
  point.
- The default center is 0.001 rather than 0, presumably to avoid degenerate rays.
  Keep it non-zero.

### Polyhedron (`projectorConfig.polyhedron`)

`PolyhedronConfig` (`types.ts:105`): `{name, id, vertices: Point3[], polygons, edgeCurves, crossSectionCurves, transform}`.
The models are in `src/lib/projection-geometry/models/`. The editor offers these
(`src/components/modal/editor/polyhedra-configs.ts`): tetrahedron, cube,
icosahedron (default), fullerene, p60 dodecahedron, truncated dodecahedron,
doubly-truncated icosahedron, geodesic. A model can't be chosen by name through the
store. You have to write the whole polyhedron object, which is large, so prefer the
UI or the existing value.

Each polygon edge is `{vertex1: index, widthCurve: edgeCurveIdx, crossSectionCurve: csIdx, isDirectionMatched}`.

**Useful small edits**

| Path                                    | Meaning                                                                                                                                                                                                                                                                     |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `…polyhedron.edgeCurves.0.curves`       | Edge (inset) curve. The bezier lives in the unit square: **y = position along the edge (0→1), x = fraction toward the polygon center**. Start at `{x:a, y:0}` and end at `{x:a, y:1}` (`types.ts:157`). Default `secondEdgeCurve`, 0.5→0.2→0.5 (`curve-definitions.ts:16`). |
| `…polyhedron.edgeCurves.0.sampleMethod` | `{method:'divideCurvePath', divisions}` (default 4) or `{method:'manualDivisions', divisions:n, divisionsArray:[n-1 values strictly in (0,1)]}`. A value outside (0,1) throws (`generate-projection.ts:507`).                                                               |
| `…polyhedron.crossSectionCurves.0`      | Tube cross-section; see the table below.                                                                                                                                                                                                                                    |
| `…polyhedron.transform`                 | `'inherit'`, or a TransformConfig (the editor converts it to identity).                                                                                                                                                                                                     |

### Edge sampling (`projectionConfigs.0.edgeSampling`)

These are resolved by `resolveEdgeSampling` (`src/lib/projection-geometry/edge-sampling.ts:29`). Every field is optional.

| Field                     | Values                                                                                        | Default     |
| ------------------------- | --------------------------------------------------------------------------------------------- | ----------- |
| `curveSource`             | `'edgeCurve'` (bezier above), `'offset'` (straight inset), `'curvedOffset'` (rounded corners) | `edgeCurve` |
| `curveOffset`             | 0.01–0.99 (clamped)                                                                           | 0.3         |
| `divisionsSource`         | `'edgeCurve'` \| `'adaptive'`                                                                 | `edgeCurve` |
| `edgeDivisions`           | `[min,max]` ints ≥ 1, min ≤ max (normalised)                                                  | [6,6]       |
| `edgeDivisionsMultiplier` | int ≥ 1                                                                                       | 1           |

---

## Cross-section config (shared by projection and Voronoi)

`CrossSectionConfig` (`types.ts:143`). Default `defaultCrossSection` (`curve-definitions.ts:58`).
Paths: `projectionConfigs.0.projectorConfig.polyhedron.crossSectionCurves.0` and
`voronoiConfig.crossSectionConfig`.

| Field             | Meaning                                                                                                                                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `curves`          | Profile bezier(s). x is the distance from the edge toward the inset curve, normalised by its max x. y is along the surface normal (`src/lib/voronoi/apply-cross-sections.ts:58-86`). Default (0,0)→(0.5,0)→(0.5,1)→(0,1): a bulge. |
| `center`          | `{x,y}`. Profile point placed on the edge. Default (0, 0.5).                                                                                                                                                                       |
| `sampleMethod`    | `divideCurvePath`/n or `manualDivisions`. Sets the **number of bands per tube**: more divisions means more bands. Default 3.                                                                                                       |
| `scaling.width`   | `'curve'` (edge-to-inset distance) or a number.                                                                                                                                                                                    |
| `scaling.height`  | `'curve'` (×1), `'matchWidth'`, or a number (world units). Default 250.                                                                                                                                                            |
| `shouldSkewCurve` | true: x axis points straight at the inset point. false: x is projected perpendicular to the normal.                                                                                                                                |

---

## Voronoi: `voronoiConfig`

`VoronoiConfig` (`src/lib/voronoi/types.ts:13`). Default `defaultVoronoiConfig`
(`shades-config.ts:752`). The UI is `src/components/controls/VoronoiControl.svelte`
(ranges below come from its sliders).

| Path                                             | Type                                 | Default                   | Meaning / range                                                                                                                                                                                    |
| ------------------------------------------------ | ------------------------------------ | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `voronoiConfig.seedConfig.seedMethod.type`       | `'areaWeighted'\|'centerProjection'` | areaWeighted              | How seeds are placed on the surface.                                                                                                                                                               |
| `voronoiConfig.seedConfig.seedMethod.pointCount` | int                                  | 12                        | Cell count, 4–300. Cost grows quickly with this.                                                                                                                                                   |
| `voronoiConfig.seedConfig.seedMethod.seed`       | int                                  | 42 (random on first load) | RNG seed. Change it to reroll the layout.                                                                                                                                                          |
| `voronoiConfig.seedConfig.relaxationIterations`  | int                                  | 5                         | Lloyd relaxation, 0–20. Higher gives more even cells.                                                                                                                                              |
| `voronoiConfig.voronoiMethod`                    | `'spherical'\|'uv'\|'geodesic'`      | spherical                 | `geodesic` is center-free (handles non-star surfaces) and always uses localProjection insets (`generate-voronoi.ts:585`).                                                                          |
| `voronoiConfig.geodesicEdgeStyle`                | `'bisector'\|'smoothed'\|'geodesic'` | bisector                  | Geodesic only.                                                                                                                                                                                     |
| `voronoiConfig.geodesicSmoothing`                | 0–50                                 | 0                         | λ for `smoothed`.                                                                                                                                                                                  |
| `voronoiConfig.geodesicStraightenCap`            | 0–200                                | 60                        | Iterations for `geodesic` style.                                                                                                                                                                   |
| `voronoiConfig.insetMethod`                      | `'centerOut'\|'localProjection'`     | centerOut                 | How the inner (inset) curve of each cell is found.                                                                                                                                                 |
| `voronoiConfig.curvedInset`                      | bool                                 | false                     | localProjection or geodesic only. Rounds the inset corners.                                                                                                                                        |
| `voronoiConfig.curveOffsetFactor`                | 0.05–0.95                            | 0.3                       | How far the inset curve sits toward the cell seed, which sets **tube width**.                                                                                                                      |
| `voronoiConfig.edgeDivisions`                    | `[min,max]`                          | [6,6]                     | Divisions per cell edge, interpolated by length, which sets **facets along a tube**. Keep min ≤ max (`src/lib/voronoi/edge-divisions.ts:11`). UI: min 1–20, max 2–20. Write the pair as one value. |
| `voronoiConfig.edgeDivisionsMultiplier`          | int ≥ 1                              | 1                         | Multiplies the result.                                                                                                                                                                             |
| `voronoiConfig.surfaceProjectionDivisions`       | 0–5                                  | 0                         | Extra rows in `voronoiSurface` tubes.                                                                                                                                                              |
| `voronoiConfig.fillAll`                          | bool?                                | absent                    | Interior fill bands for `voronoiSurface`. Outlined patterns only.                                                                                                                                  |
| `voronoiConfig.crossSectionConfig`               | CrossSectionConfig                   | as above                  | Tube profile for `voronoi` source tubes.                                                                                                                                                           |
| `voronoiConfig.bandConfig`                       | `{orientation, tubeSymmetry}`        | axial-right/lateral       | Same meaning as for projections.                                                                                                                                                                   |
| `voronoiConfig.meta.transform`                   | TransformConfig                      | identity                  | Used when the surface transform is `'inherit'`.                                                                                                                                                    |

**Gotchas**

- When `voronoiMethod` is `geodesic`, `normalizeVoronoiConfig` forces
  `insetMethod: 'localProjection'` and `areaWeighted` seeds, **but only on page
  load** (`migrate-voronoi-config.ts:53`). A bridge patch skips that step, so set
  those fields yourself to stay consistent.
- To change the Voronoi surface, edit `projectionConfigs.0.surfaceConfig`.
- The spherical and uv methods cast rays from the surface center, so a strongly
  non-convex globule can produce misses or folds. Geodesic does not need a center.
