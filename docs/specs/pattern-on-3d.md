# Mapping cut patterns back onto the 3D model: exploration

2026-11-22 · exploration only, nothing implemented

## TL;DR

**Recommendation: texture-map it, rasterising the SVG `d` strings straight into a canvas with `Path2D`. Derive UVs from the flatten step, which already produced them.**

The flattened band *is* a UV unwrap: flattening is isometric per triangle, keeps each vertex's `a/b/c` label, and the pattern paths are drawn in that same 2D space, up to one similarity transform per band. So each 3D band vertex gets UV = its flat position in path space. Draw that band's pattern into a canvas and set it as an `alphaMap` with `alphaTest`. You get see-through cut-outs on the model, the GPU clips the pattern to the band for free, and it doesn't need the multi-second Prepare Download union. Drawing the strokes at their stroke width already looks like the union on screen.

Clipping vector paths at facet boundaries and lifting them to 3D (option B) works and is exact, but it costs more to build and to run. It's worth doing only if you want real geometry: crisp close-ups, STL/glTF export, or paper thickness.

"SVG as a texture" isn't a separate option. Three.js only samples raster images, and `Path2D` accepts SVG path `d` strings directly, so the raster step is a single API call. Drawing an `<svg>` to an `Image` gets the same result with extra decode cost and main-thread blob-URL handling.

---

## What the code already provides

| Fact | Where |
|---|---|
| Flattening copies each 3D facet (`{ ...facet }`), so every flat facet keeps its 3D `address`, `orientation` and vertex labels. | `getFlatStripV2`, `src/lib/cut-pattern/generate-cut-pattern.ts:57` |
| `getFlatTriangle` writes `flat[p0]`, `flat[p1]` and `flat[p2]` from the matching 3D vertices, so flat `a/b/c` ↔ 3D `a/b/c`. | `src/lib/cut-pattern/generate-panel-pattern.ts:830` |
| `alignBands` rotates and translates bands *before* quads are built. Page layout is only an SVG `translate/rotate` applied at render time. | `generate-tiled-pattern.ts:547`, `band-transform.ts` |
| Quads = flat triangles × `pixelScale`, x-mirrored and shifted to x≥0 for `sideOrientation === 'inside'`. **Paths are built from the quads**, so path space ≠ `CutPattern.triangles` space. | `getQuadrilaterals`, `src/lib/patterns/quadrilateral.ts:124` |
| Every `CutPattern` carries `quad` (path space) and `triangles` (flat triangles `2i`, `2i+1`, pre-transform). | `generate-tiled-pattern.ts:470` |
| Pattern band ↔ real 3D band mapping, with pieces and hidden/fill bands, already exists. | `patternBandToReal` / `patternFacetToReal`, `src/lib/cut-pattern/pattern-band-space.ts` |
| A test already checks that each pattern quad is its 3D quad up to scale plus rigid motion. | `__tests__/pattern-band-space-geometry.test.ts` |
| 3D band meshes are non-indexed: vertices `3k..3k+2` are facet `k`'s `a,b,c`. A per-facet UV attribute lines up with no extra bookkeeping. | `collateAddressedBandGeometry`, `src/lib/projection-geometry/collate-geometry.ts` |
| All five pattern sources (globule tube, projection, surface, voronoi, voronoi surface) go through `generateProjectionPattern`, so one mechanism covers them all. | `run-pattern-generation.ts` |
| The prepared path is the union of stroke-expanded edges, so a filled merged path is the remaining **paper**. | `build-band-union-path.ts` |

## Spike numbers (default config, Shield pattern, projection source)

Ran a throwaway Jest spike in a worktree. It isn't kept; the numbers are below.

- 180 bands, 720 quads, 55,440 path segments. Pattern generation took 1.2 s in Jest.
- **Flat → path space is one similarity per band:** fitted from a single edge, every flat vertex of every facet lands on a quad corner, with a max residual of **1e-13**. Scale was 1.0 everywhere, and exactly 90 of 180 bands were mirrored (the "inside" bands).
- **5.8% of path vertices fall outside their band's quad footprint:** median 4.8 units outside, max 11.7, against band widths of ~120. This is real tessellation spilling onto the neighbouring band. The 3D view has to **clip to the band**. UVs do that automatically; the vector approach has to do it explicitly.
- Bands' path-space bboxes are ~117–126 × 293–563 units. The total bbox area is **8.5M units²** and the stroke width is 1 unit.

---

## Option A: Path2D raster texture (recommended)

### Pipeline

```
pattern generation (worker)              3D side (main thread)
──────────────────────────               ─────────────────────
per band: flatToPath = {s, mirror, tx, ty}  ──►  UV attribute on band BufferGeometry
per band: facet paths (raw)          ──► rasterise ──► Texture per band (or atlas)
or prepared merged path (post-processed)    │
                                            └─► MeshStandardMaterial{ alphaMap, alphaTest, DoubleSide }
```

1. **Emit the transform explicitly.** In `generateTiling` (and the outlined equivalent), store `flatToPath` on `BandCutPattern`: `{ scale: pixelScale, mirrorX: inside, tx: -minX·…, ty }`. It's plain numbers, so it survives `postMessage`. That's better than fitting it after the fact the way the spike did, which breaks on a degenerate first facet such as a globule pole.
2. **UVs.** For real band `B`, find pattern band `P` through `realBandToPattern`. For facet `k` of `B`, with pattern quad `q = floor(k/2) - parentQuadOffset`, take `P.facets[q].triangles[k%2]` (flat). Apply `flatToPath`, then normalise by `P`'s path-space bbox into [0,1], with v flipped. Write it into a `uv` attribute beside `position`. Split pieces become geometry groups, one material each, because each piece has its own alignment.
3. **Rasterise.** One canvas per band, sized `bbox × density`. Set `ctx.setTransform(density, …)`, then:
   - **Raw (live, no Prepare):** for each facet, `ctx.stroke(new Path2D(d))` with `lineWidth = strokeWidth`, round caps and joins. That matches what the union produces, visually.
   - **Prepared:** `ctx.fill(new Path2D(mergedD))` from `mergedBandPaths` (`TaggedPath[]`). This reflects dropped holes and other stage-2 post-processing.
   - **Outlined patterns:** fill `facets[0].path`.
   - Panel patterns have nothing to map; they're just the triangles.
4. **Material.** Clone the band material and set `alphaMap`, `alphaTest ≈ 0.5`, `side: DoubleSide`. The shared singletons in `materials.ts` can't hold per-band maps; an atlas avoids that by using one shared material.

### Cost

- Rasterising ~55k segments with Canvas2D should take tens of ms. Move it to a worker with `OffscreenCanvas`, transfer the `ImageBitmap`s, and wrap them in `THREE.Texture`. Note that `ImageBitmap` ignores `flipY`, so flip v in the UVs instead.
- **Texture memory is the real constraint.** Texels = 8.5M × density².

  | density (px/unit) | texels | RGBA + mips | R8 + mips |
  |---|---|---|---|
  | 1 | 8.5M | 45 MB | 11 MB |
  | 2 | 34M | 180 MB | 45 MB |
  | 4 | 137M | 730 MB | 180 MB |

  With the whole model in view, the screen density is roughly 1–2 px/unit, so a density of 2 matches it. A 1-unit stroke then covers 2 px, which is fine at full view and soft when zoomed in 2× or more.
- Mitigations, in order of effort:
  1. A single-channel texture: `RedFormat`, plus a one-line `onBeforeCompile` swapping alphaMap's `.g` for `.r`. That cuts memory 4×.
  2. Re-rasterise the bands in view at a higher density once the camera settles. Rasterising one band is cheap, so this is a simple version of virtual texturing.
  3. Store a signed distance field instead of coverage, for crisp edges under magnification. Lines one texel wide are marginal for an SDF.
- Draw calls don't change: bands are already one mesh each.

### Payoffs

- It works the moment pattern generation finishes. Prepare Download only refines it.
- Real see-through holes. `alphaTest` also applies to the shadow-map depth materials, so a point light inside the shade should cast the lattice onto a backdrop. Verify that `castShadow` plus `alphaTest` carries through to Three's distance material for point lights.
- Seam mismatches between bands become visible on the model, which helps when developing pattern continuity.

### Pitfalls

- Keep textures and geometries out of Svelte `$state`. They hit the same proxy-loop problem as `GlobuleMesh`; use plain variables or `$state.raw`.
- Dispose of old textures on every regeneration, or GPU memory leaks quickly with 180 textures per run.
- Mirrored (inside) bands: the UVs come from the same transform as the paths, so the mirror is handled. Don't derive UVs from `CutPattern.triangles` directly.
- Content spilling past the band (the 5.8% above) is clipped by the UVs. In an atlas, it would bleed into the neighbouring cell, so `ctx.clip()` each cell to its band outline and leave a few texels of padding for mips.

## Option B: clip vector paths at facets and lift to 3D

1. Take the filled region: this needs the prepared merged path, because raw strokes have no fill semantics without the union. That means Prepare's seconds of boolean work.
2. Flatten curves to polylines, for example with paper.js `flatten(tolerance)`.
3. For each facet triangle in path space (bbox-prefiltered), intersect it with the band region using Clipper2 or `polygon-clipping`, then triangulate with earcut, holes included.
4. Lift each vertex through its facet's affine map (barycentric, exact, because facets are planar), and either offset along the normal or replace the band mesh outright, which gives real cut-out geometry.

- **Pros:** crisp at any zoom; exact; exportable as STL/glTF (3D printing, renders); can be extruded to model paper or wood thickness; correct shadows without alpha tricks.
- **Cons:** depends on the prepared union, or has to redo it; per-facet clipping plus triangulation probably runs into hundreds of ms in a worker; output is ~10⁵–10⁶ vertices; paper.js union output sometimes touches itself, and that has to survive clipping. It's several times more code than A.
- **Verdict:** keep it as a later "export 3D" or "inspect closely" mode. It can reuse A's `flatToPath` and facet mapping unchanged; the only difference is the step after the mapping.

## Option C (cheap aside): cut lines as 3D polylines

Map the raw path polylines (the centrelines) onto the surface as `LineSegments`, splitting each segment where it crosses a facet edge. It's crisp and cheap and needs no union, but it shows cut lines rather than material. Useful only as a debug overlay, and A covers most of that need.

## Comparison

| | A: Path2D texture | B: clip + lift | C: lines |
|---|---|---|---|
| Needs Prepare Download | no (better with it) | yes | no |
| Compute | ~10s of ms | ~100s of ms + union | ~10 ms |
| GPU memory | 11–180 MB, depending on density/format | geometry only | tiny |
| Close-up quality | soft beyond ~2× zoom (fixable) | perfect | perfect (lines) |
| See-through / shadows | yes (alphaTest) | yes (true geometry) | no |
| Exportable as 3D | no | yes | no |
| Build effort | small–medium | large | small |

## Proposed phases

1. **Mapping only:** emit `flatToPath`, build the UV attribute, and render a UV checker texture behind a View toggle ("Pattern on model"). Check it visually in designer2 on a projection, a globule tube and a voronoi source, including split pieces and inside bands.
2. **Raw strokes:** per-band canvas, `alphaMap` + `alphaTest`, `DoubleSide`, disposal on regeneration.
3. **Prepared:** when `isPrepared`, rasterise `mergedBandPaths` instead, so drop-holes and post-processing show up.
4. **Performance:** move rasterising to an `OffscreenCanvas` worker, add a density control, R8 format, and re-rasterising on zoom.
5. **(Optional) B** for export and close-ups.

## Open questions for Ben

- Is the main goal on-screen preview, or do you eventually want 3D export (STL/glTF)? Export is what would justify B.
- Should the raw (pre-Prepare) view be the default, with Prepare refining it? Or show the pattern only after Prepare, so the model always shows exactly what will be cut?
- Is the lit-from-inside shadow preview interesting? It's close to free with A.
