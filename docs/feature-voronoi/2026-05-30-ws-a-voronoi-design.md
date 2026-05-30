# WS-A · Voronoi: area-weighted seeds, single config, floating editor

**Status:** Spec — approved design, pending implementation plan
**Items:** #2 (random-point algorithm) + #3 (voronoi UI)
**Depends on:** nothing
**Blocks:** nothing
**Worktree:** isolated; implementer = Sonnet

---

## Goal

Three independent-but-co-located changes to the Voronoi feature:

1. **Area-weighted seed sampling** as a new, default seed method — distributes seed
   points over the surface proportional to facet area (works for arbitrary topology),
   instead of only the center-ray-cast method.
2. **Collapse `voronoiConfigs[]` to a single `voronoiConfig`** throughout config, state,
   generation, and pattern routing.
3. **Floating editor** for the voronoi config (out of the SelectBar/menubar), and
   **initialize one default config on boot** with a random seed.

These touch the same files (`voronoi/types.ts`, `shades-config.ts`, the stores, the
control component), so they ship as one workstream.

---

## Current state

- `src/lib/voronoi/types.ts:27` — `SeedMethod = CenterProjectionSeedMethod` (single member union).
- `src/lib/voronoi/generate-seeds.ts:46` — `generateSeeds(method, center, intersect)`;
  only `centerProjection` implemented (ray-casts random unit vectors from center).
- `src/lib/voronoi/generate-voronoi.ts:283` — `makeVoronoi(...)`; calls `generateSeeds`
  (~line 298), then Lloyd relaxation (`lloydRelaxSpherical` / `lloydRelax`, ~lines 271–279),
  then computes the tessellation. **Lloyd relaxation already runs on the seeds** — the new
  method feeds into it unchanged.
- `src/lib/types.ts:913` — `voronoiConfigs: VoronoiConfig[]`.
- `src/lib/types.ts:929` — `SuperGlobule.voronoiResults` (array).
- `src/lib/shades-config.ts:684` — `defaultVoronoiConfig`; `:611,:665` — `voronoiConfigs: []`.
- `src/lib/generate-superglobule.ts:51-67` — `.map`s over `voronoiConfigs` producing
  `voronoiResults[]`.
- `src/lib/stores/superGlobuleStores.ts:136` — `superConfigStore`; `:478-515` — voronoi
  pattern routing (already uses the **first** result only).
- `src/components/controls/VoronoiControl.svelte` — config UI with add/remove buttons,
  mounted via SelectBar option "Voronoi" (`src/routes/designer2/+page.svelte:55,73-74`).

> Confirmed: multiple configs currently *do* render independently (each produces its own
> `voronoiResult`). Collapsing to one is a real behavior change, accepted.

---

## Design

### 1. Area-weighted seed method

**Type changes** (`voronoi/types.ts`):

```ts
export type SeedMethod = CenterProjectionSeedMethod | AreaWeightedSeedMethod;

export type AreaWeightedSeedMethod = {
  type: 'areaWeighted';
  pointCount: number;
  seed: number;
};
```

**Algorithm** (new `generateAreaWeightedSeeds` in `generate-seeds.ts`):

1. Receive the **surface triangles** (see signature change below).
2. Build a cumulative-area table: iterate every surface facet (triangle); compute its
   area; scale to an integer (`Math.max(1, Math.floor(area * AREA_SCALE))`); push an entry
   `{ keyStart, width, triangle }` where `keyStart` is the running cumulative total and
   `width` is the scaled integer area. Track `totalArea` = final cumulative.
3. For each of `pointCount` seeds: draw `r = floor(random() * totalArea)` (seeded
   `mulberry32`). Binary-search the table for the entry with
   `keyStart <= r < keyStart + width`. Compute `t = (r - keyStart) / width` and use it to
   pick a barycentric point on that triangle (cheap, low-res is fine — e.g. map `t` plus a
   second draw to barycentric coords, or a fixed deterministic scheme from `t`). The point
   is already on the surface — **no ray-cast needed**.
4. Return `Vector3[]`.

**Signature change.** `generateSeeds` / `generateAreaWeightedSeeds` need the surface
geometry. `makeVoronoi` builds the surface mesh used by `intersect`; expose its triangle
list and thread it in:

```ts
generateSeeds(method, center, intersect, surfaceTriangles)
```

`centerProjection` ignores `surfaceTriangles`; `areaWeighted` ignores `intersect`. Pull the
triangle list from the same surface object `makeVoronoi` already constructs for ray-casting
(document the exact source when implementing).

**Relaxation:** unchanged. Area-weighted seeds flow into the existing Lloyd relaxation in
`makeVoronoi`. No index-space relaxation (rejected — index-adjacency ≠ geometric adjacency).

**Default:** `defaultVoronoiConfig.seedConfig.seedMethod` becomes
`{ type: 'areaWeighted', pointCount: 12, seed: <random> }`. `centerProjection` stays
selectable in the UI.

### 2. Single config

- `types.ts`: `voronoiConfigs: VoronoiConfig[]` → `voronoiConfig?: VoronoiConfig`.
  `SuperGlobule.voronoiResults` → `voronoiResult?: VoronoiResult` (singular).
- `generate-superglobule.ts:51-67`: drop the `.map`; build one result from `voronoiConfig`
  if present and a projection surface exists.
- `superGlobuleStores.ts:478-515`: read `voronoiResult` directly instead of `[0]`.
- `collate-tubes.ts` / `collate-geometry.ts`: update any `voronoiResults[...]` access.
- **Migration:** `superConfigStore` is persisted (localStorage). On load, normalize any
  persisted `voronoiConfigs: []`/`[a, b, ...]` into a single `voronoiConfig` (take `[0]` or
  the default). Add a one-time normalizer in the store hydration path so existing saved
  state doesn't crash.

### 3. Floating editor + boot default

- Move `VoronoiControl` rendering from the SelectBar branch into a **floating panel**,
  matching the existing floating-editor pattern in the codebase (identify the established
  pattern — e.g. `src/components/modal/` / path-edit floating panels — and reuse it; do not
  invent a new one). Remove the SelectBar "Voronoi" option wiring in `designer2/+page.svelte`
  if it's fully replaced, or repurpose it to toggle the floating panel's visibility.
- Remove add/remove-config buttons from `VoronoiControl.svelte` (lines ~6-22, 70-75); the
  component now edits the single `voronoiConfig`.
- **Boot default:** when `superConfigStore` hydrates with no `voronoiConfig`, initialize one
  from `defaultVoronoiConfig` with a freshly randomized seed
  (`Math.floor(Math.random() * 2**31)`). Do this in the store init/normalizer so it's
  deterministic per boot but random across boots.

---

## Testing

- Unit: `generateAreaWeightedSeeds` — given a small fixed triangle set + fixed `seed`,
  asserts (a) correct seed count, (b) deterministic output, (c) larger-area triangles
  receive proportionally more seeds over many draws, (d) every seed lies on a surface
  triangle.
- Unit: cumulative-area table builder — integer scaling, `width >= 1` floor, monotonic keys.
- Unit: config migration normalizer — `voronoiConfigs: []`, single, and multi inputs all
  yield exactly one `voronoiConfig`.
- Manual: floating editor opens/edits/persists; boot with cleared storage yields one config
  with a random seed; geometry regenerates on edit.

## Out of scope

- Edge curves (#1, deferred).
- Multi-config overlays (intentionally removed).
- Changing the Lloyd relaxation algorithm.

## Open implementation details (decide while building, no further sign-off needed)

- Exact source object for `surfaceTriangles` inside `makeVoronoi`.
- Barycentric point scheme from `t` (any cheap deterministic mapping).
- `AREA_SCALE` constant (pick so typical facet areas map to integers in the hundreds–thousands).
- Which existing floating-panel component to reuse.
