# Shades Store / Derived-Store Architecture

> Map of the config + generated-3D + pattern store architecture.
> Source of truth: `src/lib/stores/`.

## The two reactive spines

Everything flows from **`superConfigStore`** (the geometry config). Note the key asymmetry:

- **3D geometry** is produced *imperatively* — a `.subscribe()` side-effect pushes config into a Web Worker, whose result lands in a plain `writable` (`superGlobuleInternal`). It is *not* a `derived` chain.
- **Patterns** are produced *declaratively* — a real `derived` chain off the resulting `SuperGlobule`.

```
                         ┌─────────────────────── PERSISTABLE CONFIG SOURCES ───────────────────────┐
                         │                                                                          │
  superConfigStore ◄─────┤  patternConfigStore   viewControlStore   uiStore   computationMode      │
  (SuperGlobuleConfig)   │  (GlobulePatternConfig)                            isManualMode          │
  normalizeVoronoiConfig │        │                                                                 │
         │               │        ▼ derived (JSON-diff gated)                                       │
         │               │  patternGenerationConfig  ◄── strips view-only fields (zoom/pan/toggles)│
         │               └────────┼─────────────────────────────────────────────────────────────┘
         │                        │
   ┌─────┴───────────┐            │            EPHEMERAL: pausePatternUpdates, hasPendingChanges,
   │ .subscribe()    │            │                       isCameraInteracting, selectModeActive
   │ side-effect     │            │            DEBUG:     overrideStore (hardcoded tubes)
   │ (NOT derived)   │            │
   ▼                 │            │
 triggerAsyncGeneration           │
   │  • 1st run: generateSuperGlobule() SYNC (fast first paint)
   │  • after:   generateSuperGlobuleAsync() → WORKER   [50ms debounce]
   │  • skipped in 2d-only / manual-with-pending
   ▼
╔══════════════ workerStore.ts ══════════════╗
║ super-globule.worker.ts (off-thread)        ║
║   → postMessage(JSON-cloned config)         ║
║   ← result → rehydrateSuperGlobule()        ║   rebuilds Vector3 / Triangle
║   ← regenerate surfaces on main thread      ║   (Object3D can't cross postMessage)
║   isWorking / workerError writables         ║
╚══════════════════════╤══════════════════════╝
                       ▼
        superGlobuleInternal  (writable<SuperGlobule|null>)
                       │
                       ▼
   superGlobuleStore = derived([superGlobuleInternal, superConfigStore])
        └── fallback: generateSuperGlobule() SYNC when internal is null (SSR / pre-first-result)
                       │
        ┌──────────────┼───────────────────────────────┬───────────────────────────────┐
        ▼              ▼                                ▼                                ▼
 superGlobuleGeometryStore   superGlobuleBandGeometryStore        superGlobulePatternStoreInternal (derived)
 (derived → 3D render geom)  (derived → band geom, also used      depends on: superGlobuleStore, superConfigStore,
        │                     by extractMeshData / 2d-only)        patternGenerationConfig, overrideStore,
        ▼                            │                             computationMode, pausePatternUpdates,
   ThreeRenderer / 3D viewport       │                             isManualMode, hasPendingChanges
                                     │                                         │
                                     │           switches on patternSource: ───┤
                                     │           projection | surfaceProjection │
                                     │           | voronoi | voronoiSurface |   │
                                     │           globule  → generateProjectionPattern / …
                                     │           returns 'paused' marker in paused/manual-pending; {} in 3d-only
                                     │                                         ▼
                                     │                   superGlobulePatternStore = derived(internal)
                                     │                       └── 300ms debounce + lastPatternResult cache
                                     │                                         │
                                     ▼                                         ▼
                          frozenMeshStore /                          PatternViewer / CutPatternSvg
                          persistedPatternStore (2d-only freeze)      (SVG export)
```

## Computation-mode control plane

Three `writable`/`persistable` flags gate the spines above, wired through `.subscribe()` handlers in `superGlobuleStores.ts`:

| Store | Effect |
|---|---|
| `computationMode` `continuous \| 3d-only \| 2d-only` | `2d-only` freezes the worker (3D stays as `frozenMeshStore` via `extractMeshData`); `3d-only` short-circuits the pattern derived to `null`s |
| `isManualMode` | Config changes only set `hasPendingChanges=true`; regen waits for `triggerManualRegeneration()` |
| `pausePatternUpdates` / `hasPendingChanges` | Make the internal pattern derived emit the `'paused'` sentinel → public store returns cached `lastPatternResult` |

Mode transitions are handled by dedicated `previousMode`/`previousManualMode` subscription guards (skip-initial pattern).

## Side systems (not in the main reactive chain)

- **`configStore0` → `configStore`** (derived): the *individual* `GlobuleConfig` (adds `isModified`, computes `levelCount`). Legacy single-globule path, separate from `superConfigStore`.
- **`selectionStores.ts`**: many `writable` selection addresses + `derived` stores (`selectedProjectionGeometry`, `selectedVoronoiSurfaceGeometry`, `selectedGlobuleConfig`, `partnerHighlightGeometry`…) that read `superGlobuleStore`/`superGlobulePatternStore` and emit Three.js `BufferGeometry` for highlight overlays.
- **`tilePatternSpecStore`**: DB-backed (`/api/config`) custom-object store; its real job is a **side-effect** — registering/unregistering variants into the `patterns` registry, which `generateProjectionPattern` reads. Not reactively linked.
- **`mergedPathStore`** (`mergedBandPaths`, `labelTextDimensions`): imperatively populated for "Prepare Download" SVG merging; invalidated by `$effect` in NavHeader.
- **`partnerHighlightStore`**, **`toastStore`** (worker errors surface here): supporting UI state.

## Key architectural notes

1. **Persistence**: all config sources use `persistable(...)` with `AUTO_PERSIST_KEY` (localStorage); bootstrap reads via `loadPersistedOrDefault` gated by `shouldUsePersisted`.
2. **Two debounces**: 50ms before the worker (geometry), 300ms on the public pattern store — independent.
3. **The split derive of `patternConfigStore`** exists specifically so view-only changes (zoom/pan/display toggles) don't re-run pattern generation — only `patternGenerationConfig` (JSON-diff gated) feeds the pattern derive.
4. **`superGlobuleStore` is a derived wrapper, but its input `superGlobuleInternal` is pushed imperatively** — so geometry generation is a subscribe-driven effect, while pattern generation downstream is pure `derived`. This is the central seam to understand before modifying anything.

## File reference

| File | Role |
|---|---|
| `stores/superGlobuleStores.ts` | Geometry subscribe-effect, `superGlobuleStore`, geometry + pattern derives, mode handlers |
| `stores/workerStore.ts` | Worker lifecycle, `generateSuperGlobuleAsync`, rehydration, surface regen |
| `workers/super-globule.worker.ts` | Off-thread geometry computation |
| `stores/globulePatternStores.ts` | `patternConfigStore`, `patternGenerationConfig` (JSON-diff gate) |
| `stores/uiStores.ts` | `computationMode`, `isManualMode`, `pausePatternUpdates`, `hasPendingChanges` |
| `stores/stores.ts` | `configStore0`/`configStore` (individual globule), `loadPersistedOrDefault` |
| `stores/viewControlStore.ts` | `viewControlStore` show-toggles |
| `stores/selectionStores.ts` | Selection writables + highlight-geometry derives |
| `stores/overrideStore.ts` | Debug hardcoded override tubes |
| `stores/tilePatternSpecStore.ts` | DB-backed pattern-variant registry side-effect |
| `stores/mergedPathStore.ts` | Download-prep merged band paths |
