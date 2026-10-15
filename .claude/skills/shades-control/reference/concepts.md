# Shades domain primer

Shades turns 3D parametric geometry into flat SVG cut files for paper, wood, or
metal. The pipeline is: **3D config → tubes of bands of facets → flattened bands →
pattern → SVG**. 3D geometry runs in a Web Worker (`src/lib/workers/`). The 2D
pattern also runs in a worker (`generatePatternAsync`, `src/lib/stores/workerStore.ts`).

## Geometry vocabulary

| Term                  | Meaning                                                                                                                                                                                                         | Defined                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Facet**             | One triangle (`triangle: THREE.Triangle`) plus `address`, `orientation`, and per-edge `meta` partners.                                                                                                          | `src/lib/types.ts:973`                     |
| **Band**              | A strip of connected facets. This is the unit that gets flattened and cut. `sideOrientation` is `'inside'\|'outside'\|'mixed'`. `isFill` marks synthetic fill bands. Pieces of a split band carry `pieceIndex`. | `types.ts:1041`                            |
| **Quad**              | Two adjacent facets that share an edge. Tiled patterns map one unit pattern per quad.                                                                                                                           | `src/lib/patterns/quadrilateral.ts:317`    |
| **Tube**              | `{bands, sections, orientation, address}`. A set of parallel bands: one per globule, or one per polyhedron or Voronoi edge.                                                                                     | `src/lib/projection-geometry/types.ts:248` |
| **Section**           | A ring of points across a tube. Bands run between consecutive section points.                                                                                                                                   | `projection-geometry/types.ts:244`         |
| **Facet orientation** | `'circumferential' \| 'axial-right' \| 'axial-left'`: how the triangles zig-zag along a band. There's an ASCII diagram at `types.ts:1000`.                                                                      | `types.ts:998`                             |

## Three ways to make tubes

All three produce `Tube[]`, and everything downstream treats them the same way.

1. **Globule.** A parametric sweep, like a lathe that you can also twist and scale
   level by level. The **shape** is the cross-section level (a radial bezier). The
   **silhouette** maps y to height and x to radius, and **levelOffsets** add twist,
   offset and scale per level. The "globule tube" pipeline makes one tube per
   distinct globule, with one band per shape vertex running pole to pole
   (`src/lib/generate-superglobule.ts:175`). The older **legacy globule pipeline**
   (`showGlobuleGeometry`) additionally applies sub-globule `transforms` and
   recombination.
2. **Projection.** A polyhedron's edge network is draped onto a **surface**
   (sphere, capsule, or the globule). Rays from the surface center through
   points sampled along each polyhedron edge, and along an **inset curve** toward
   the polygon center, hit the surface. A **cross-section** profile is placed at
   each hit, and the profiles build one tube per polyhedron edge (the two polygons
   sharing the edge supply its two halves). Two tube sets result:
   - `tubes`: the cross-section tubes, which stand off the surface
     (`patternSource: 'projection'`).
   - `surfaceProjectionTubes`: flat strips lying on the surface, running from edge
     to inset curve (`'surfaceProjection'`).
     Code: `src/lib/projection-geometry/generate-projection.ts` (`makeProjection` at `:1758`).
3. **Voronoi.** Seeds are scattered on the surface (`projectionConfigs[0].surfaceConfig`),
   Lloyd-relaxed, and turned into a Voronoi diagram (spherical, UV, or
   center-free geodesic). **Each cell edge becomes a tube.** Its two sides are the
   inset curves of the two cells it separates. `curveOffsetFactor` sets the inset,
   which is the tube width. Rim edges on open surfaces produce one-sided tubes.
   Like projections, Voronoi produces `tubes` (`'voronoi'`) and
   `surfaceProjectionTubes` (`'voronoiSurface'`).
   Code: `src/lib/voronoi/generate-voronoi.ts` (assembly at `:280-470`).

The **SuperGlobule** (`types.ts:1226`) is the container that carries all of these:
`subGlobules`, `globuleTubes`, `projections[]`, `voronoiResult`, and
`pipelineErrors?`. Each pipeline is gated by a view `.any` flag (see view-and-ui.md).
Voronoi is the default model.

## Addresses

Shapes from `src/lib/projection-geometry/types.ts:293-322`:

| Type                       | Fields                                                          |
| -------------------------- | --------------------------------------------------------------- |
| `GlobuleAddress_Globule`   | `{globule}`                                                     |
| `GlobuleAddress_Tube`      | `+ tube`                                                        |
| `GlobuleAddress_Band`      | `+ band`                                                        |
| `GlobuleAddress_BandPiece` | band `+ piece` (a split piece; `band` stays the parent's index) |
| `GlobuleAddress_Facet`     | band `+ facet`                                                  |
| `GlobuleAddress_FacetEdge` | facet `+ edge: 'ab'\|'bc'\|'ac'`                                |

String form comes from `concatAddress(addr, format)` (`src/lib/util.ts:331`):

| Address              | `'gtb'`     | `'gtbf'` (default) | `'tb'`               |
| -------------------- | ----------- | ------------------ | -------------------- |
| band {g0,t3,b7}      | `g0t3b7`    | `g0t3b7`           | `t3b7`               |
| piece {g0,t3,b7,p1}  | `g0t3b7p1`  | `g0t3b7p1`         | `t3b7p1`             |
| facet {g0,t3,b7,f12} | `g0t3b7f12` | `g0t3b7f12`        | `t3b7`               |
| tube {g0,t3}         | `g0t3`      | `g0t3`             | (default `'t'`) `t3` |

Other formats: `'tb-slash'` gives `t3/b7`, and `'t'`, `'b'`, `'f'` give the single
component. The bridge's `bands` and `band` ops use the `'gtb'` form, for example
`g0t3b7` or `g0t3b7p1`.

- `globule` is the pipeline-local globule index: the projection index, or 0 for
  Voronoi and globule tubes. **The same address string can exist in different
  sources.** The active `patternSource` decides which one you mean.
- Tube and band indexes are positions in the generated arrays. They change when
  the geometry changes (seed, point count, divisions).

## Partners

`facet.meta[edge].partner` is the `GlobuleAddress_FacetEdge` of the neighbouring
facet in an adjacent band, tube, or tube end. A missing key means that edge
borders open space, so it is cut solid (`types.ts:976-985`). Patterns use partners
to keep tiles continuous across seams (`adjustAfterMapping`, `adjustAfterTiling`)
and to generate matching tabs.

## Flattening

Each band is unrolled isometrically. Every 3D facet keeps its side lengths and
angles, and facet N+1 is chained off the shared edge of facet N, like unrolling a
paper strip (`getFlatStripV2`, `src/lib/cut-pattern/generate-cut-pattern.ts:652`;
panel version `getFlatTriangle`, `generate-panel-pattern.ts:840`). Flattened bands
are oriented with the long axis on Y.

- Globule bands start at a pole, where the first facet collapses (two coincident
  vertices). That case is guarded, but a zero-length edge used to poison the
  whole chain with NaN. A band where every coordinate is zero is that symptom.
- A band that curls back on itself in 3D can overlap itself once flattened. The
  bridge `bands` op reports flattened bounds and per-band `error`
  (`src/lib/cut-pattern/collect-band-errors.ts`).

## Cut vs panel output

|             | Cut patterns (paper)                                                                                                 | Panel patterns (wood/metal)                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Unit        | Whole flattened band                                                                                                 | One flat triangle per facet                                                      |
| Pattern     | Tiled unit pattern mapped into each quad (hex, grid, shield, …), or an **outlined** band with tabs and optional fill | None: raw geometry plus bolt holes (`panelHoleConfig`)                           |
| Selected by | any tiled `type`, or `'outlined'`                                                                                    | `tiledPanelPattern-0` with `tiling: 'triangle'` (`generate-panel-pattern.ts:82`) |
| Splits      | yes (`patternConfig.splits`)                                                                                         | no                                                                               |

**Splits** cut every band of a tube at given quad indices into **pieces**
(`g0t3b7p0`, `…p1`). This keeps pieces within the material size.

## Folds and flips

No runtime "fold count" telemetry exists in the app. What it does have:

- `band.sideOrientation` (`src/lib/projection-geometry/audit.ts:114-178`) is set
  by testing whether a band's middle facets face away from the center. **`'mixed'`
  means the band's facets disagree, which is a flipped or folded band.** Patterns
  read it (`getPattern(..., sideOrientation)`).
- Fold-back is checked only in unit tests (`src/lib/voronoi/__tests__/generate-voronoi.test.ts:269-290`):
  consecutive section segments with a direction dot product below −0.5. Those
  folds make `generateProjectionBands` emit overlapping bands.
- "Flipped Voronoi bands" are an ongoing issue. They show up as `mixed` sides,
  bands that overlap themselves once flattened, or visibly inverted strips. Judge
  them from a screenshot. Treat them as information for Ben, not as a
  pass/fail gate.

## Scale and units

- 3D world units are arbitrary. The default sphere radius is 400, and an
  icosahedron's vertices sit at about 95.
- The 2D physical size comes from `patternConfig.pageLayout.pageScale`
  (pattern units per mm, default 0.6562) and `patternConfig.pixelScale`.
- Label sizes are stored in mm.
