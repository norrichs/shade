# `view` and `ui` stores

## `view` — ViewControls (`src/lib/stores/viewControlStore.ts`)

Type at `viewControlStore.ts:36`, defaults at `:43-73`. There are four groups. Each
group's **`.any` flag is a pipeline gate**: it decides whether that geometry is
**generated at all**, not just whether it is shown (`pipelineGatesFromViewControls`,
`src/lib/stores/superGlobuleStores.ts:68-75`; used in `generate-superglobule.ts:62-114`).
The other flags only affect rendering.

| Path                                                    | Default              | Effect                                                                                                  |
| ------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------- |
| `showGlobuleGeometry.any`                               | false                | **Gate:** legacy globule pipeline (sub-globules with transforms). Also enables the legacy band pattern. |
| `showGlobuleTubeGeometry.any`                           | false                | **Gate:** globule-tube pipeline, needed for `patternSource: 'globule'`.                                 |
| `showGlobuleTubeGeometry.bands` / `facets` / `sections` | true / false / false | Render only.                                                                                            |
| `showProjectionGeometry.any`                            | false                | **Gate:** polyhedron projection, needed for `projection` and `surfaceProjection` sources.               |
| `showProjectionGeometry.surface`                        | false                | Render the surface mesh.                                                                                |
| `showProjectionGeometry.polygons`                       | false                | Render the polyhedron polygons.                                                                         |
| `showProjectionGeometry.projection`                     | false                | Render the projected edges and curves.                                                                  |
| `showProjectionGeometry.surfaceProjection`              | true                 | Render the surface-projection tubes.                                                                    |
| `showProjectionGeometry.sections` / `bands` / `facets`  | false                | Render the cross-section tubes.                                                                         |
| `showVoronoiGeometry.any`                               | **true**             | **Gate:** Voronoi pipeline, needed for `voronoi` and `voronoiSurface` sources.                          |
| `showVoronoiGeometry.bands` / `facets` / `sections`     | false                | Render the Voronoi tubes.                                                                               |
| `showVoronoiGeometry.surfaceProjection`                 | true                 | Render the Voronoi surface-projection tubes.                                                            |

`ShowProjectionGeometries` declares the keys above; the default also includes
`facets: false`.

### Gate behaviour

- Flipping an `.any` value re-runs 3D generation (`superGlobuleStores.ts:319-345`).
  Changing a render-only sub-flag does not.
- Pattern generation follows the gates. It also re-runs right away when a gate
  flips, before the new geometry exists, so check the result after a `wait`.
- **Projection only generates with `showProjectionGeometry.any = true`.** While it
  is off, edits to `projectionConfigs` change nothing visible.
- With `any` on, a projection that misses the surface (open globule, gaps)
  **throws**. The failure is caught per pipeline and reported as `pipelineErrors`
  and a toast; it does not abort the other pipelines
  (`generate-superglobule.ts:98-105`). Turning a pipeline's `.any` off is the
  remedy that the toast itself suggests.
- The 2D pane renders non-Voronoi patterns only when some group has `.any` true
  **and** some group has `bands` or `facets` true. Voronoi sources are exempt
  (`src/components/cut-pattern/CutPatternRenderer.svelte:226-237`). The `bands`
  and `facets` flags are ORed across all groups, so the default
  `showGlobuleTubeGeometry.bands: true` already satisfies that half.
- Gates are independent. Turn off the ones you don't need, because every gated
  pipeline costs generation time.

### Recipes

| Goal                                    | Patches                                                                                                                                                        |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Voronoi pattern (works on a fresh load) | `pattern` `patternViewConfig.patternSource` = `"voronoi"` (or `"voronoiSurface"`)                                                                              |
| Polyhedron projection only              | `view` `showProjectionGeometry.any`=true, `showVoronoiGeometry.any`=false; `pattern` `patternViewConfig.patternSource`=`"surfaceProjection"` or `"projection"` |
| Globule tubes                           | `view` `showGlobuleTubeGeometry.any`=true; `pattern` `patternViewConfig.patternSource`=`"globule"`                                                             |

### Known gotcha: empty pattern pane on a fresh load

By default, Voronoi is the only enabled pipeline (`showVoronoiGeometry.any: true`),
but `patternViewConfig.patternSource` defaults to `'surfaceProjection'`
(`src/lib/shades-config.ts:620`). An older persisted config may hold
`'projection'` instead. Neither source has tubes, so the 3D view shows Voronoi
geometry while the pattern pane has **0 bands**. That's expected config, not a
bug. Switch the source to Voronoi before debugging.

---

## `ui` — `src/lib/stores/uiStores.ts`

The bridge's `ui` store is virtual: the first path segment names one of three
stores. Both `computationMode` and `isManualMode` persist in localStorage.

| Path                    | Type                                                   | Default       | Meaning                            |
| ----------------------- | ------------------------------------------------------ | ------------- | ---------------------------------- |
| `computationMode`       | `'continuous'\|'3d-only'\|'2d-only'`                   | continuous    | See below.                         |
| `isManualMode`          | bool                                                   | false         | Freezes auto-generation.           |
| `designerPanels.layout` | `'model-pattern'\|'pattern-model'\|'model'\|'pattern'` | model-pattern | Visible panes.                     |
| `designerPanels.split`  | number 0.1–0.9                                         | 2/3           | Left pane fraction (`clampSplit`). |

### `computationMode`

| Value        | Effect                                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `continuous` | Geometry and pattern both regenerate on every change.                                                                                                                           |
| `3d-only`    | Geometry regenerates. The pattern result is set to **empty** (`superGlobuleStores.ts:589-592`).                                                                                 |
| `2d-only`    | 3D is frozen and patterns keep updating. **Any write to `super`, or any gate flip in `view`, switches the mode back to `continuous`** and regenerates (`:290-297`, `:336-340`). |

### Manual mode (`isManualMode = true`)

- A change to `super` or a gate only sets `hasPendingChanges`. No generation runs
  (`superGlobuleStores.ts:299-304`).
- The pattern also stops updating while changes are pending (`:586`).
- Generation runs only through `triggerManualRegeneration()` (`:99`), which is the
  Regenerate button, or by turning manual mode off while changes are pending
  (`:393-417`).
- The bridge's `patchConfig` and `undo` call `triggerManualRegeneration()`
  automatically when manual mode is on, unless you pass `regenerate:false`
  (`src/lib/agent-bridge/ops.ts:116`). The `regenerate` op forces it.
- `triggerManualRegeneration` does nothing if the worker is already busy. It shows
  a toast and returns.

### Other ephemeral UI stores (not exposed through `ui`)

`hasPendingChanges`, `pausePatternUpdates`, `isCameraInteracting`, `selectModeActive`.
