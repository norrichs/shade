# Tiled Pattern Editor — Design

**Date:** 2026-05-02
**Branch:** `feature-pattern-edit`
**Status:** Spec — pending implementation plan

## Summary

A new floating editor for editing tiled-pattern specifications. The first supported algorithm is the existing shield tesselation (`tiled-shield-tesselation-pattern.ts`). The editor lets the user edit the unit-pattern shape (M/L path segments today; arc/bezier later) **and** the post-tile adjustment rules (within-band point swaps, across-band swaps, partner matching, skip-edge removal) — every magic number in the current shield file becomes user-editable data.

Variants are persisted as named entries in the existing `shades_configs` Turso table. The variant id IS the pattern type — variants appear directly in the pattern picker. The forked shield file consumes a `TiledPatternSpec` config; its file-level constant (`defaultShieldSpec`) is the canonical built-in variant, byte-equivalent to the current hardcoded version.

## Goals

- Make the shield pattern's design data editable in-app, end to end.
- Persist user variants alongside the canonical default.
- Establish a generic `TiledPatternSpec` shape that other tiled patterns (hex, carnation, box, …) can adopt incrementally — each fork uses the same editor, same storage, same picker integration.
- Zero behavior change for existing projects: `type: 'tiledShieldTesselationPattern'` continues to render identically.

## Non-goals (v1)

- Editing arc/bezier _positions_ in the unit (renders read-only; M/L only is editable).
- Editing other tiled patterns (hex, carnation, etc.). The plumbing supports them; the actual fork of each pattern file is a follow-up.
- Live mid-drag preview into the main 3D viewport — Save triggers re-render; the editor's own viewport is always live.
- Multi-tab/multi-floater concurrent editing of the same variant (last save wins).
- Validation beyond "at least 1 segment per group".

## Decisions made during brainstorming

| #   | Question               | Choice                                                                      |
| --- | ---------------------- | --------------------------------------------------------------------------- |
| Q1  | Persistence model      | **B** — Named variants in storage                                           |
| Q2  | Editor scope           | **C** — All four spec categories editable                                   |
| Q3  | Adjustment editing UX  | **B** — Multi-mode adjacency viewport with ghost neighbors                  |
| Q4  | Spec data model        | **A** — Segments primary (`PathSegment[]`)                                  |
| Q4b | Unit grouping          | **A** — Keep explicit `start` / `middle` / `end`                            |
| Q5  | Storage + seeding      | **A1 + B1** — Turso `shades_configs`; built-in default constant in code     |
| Q6  | Variant ↔ pattern type | **B** — Variants ARE pattern types (variant id = `TiledPatternConfig.type`) |
| Q7  | Save model             | **B** — Draft + explicit save                                               |

## Data model

New types in `src/lib/types.ts` (or a new `src/lib/patterns/spec-types.ts`):

```ts
export type TiledPatternSpec = {
	id: string; // stable: existing TiledPattern enum value (e.g. 'tiledShieldTesselationPattern') for builtIn defaults; uuid for user variants
	name: string; // display label
	algorithm:
		| 'shield-tesselation'
		| 'hex'
		| 'box'
		| 'bowtie'
		| 'carnation'
		| 'grid'
		| 'multihex-tesselation'
		| 'triangle-panel'
		| 'tristar';
	builtIn: boolean; // true for the file-level canonical default; false otherwise
	unit: UnitDefinition;
	adjustments: AdjustmentRules;
};

export type UnitDefinition = {
	width: number; // unit width in raw design coords (current shield: 42)
	height: number; // unit height (current shield: 14)
	start: PathSegment[];
	middle: PathSegment[];
	end: PathSegment[];
};

// Indices are unit-flat: 0..start.length = start, then middle, then end
export type AdjustmentRules = {
	withinBand: { source: number; target: number }[];
	acrossBands: { source: number; target: number }[];
	partner: {
		startEnd: { source: number; target: number }[]; // when f === 0 and endsMatched
		endEnd: { source: number; target: number }[]; // when f === last and endsMatched
	};
	skipRemove: number[];
};
```

The pair-arrays replace the existing `sourceIndices` / `targetIndices` parallel arrays — mismatched lengths becomes a type-level invariant rather than a runtime throw.

`algorithm` is a separate field (rather than encoding it as an id prefix) so that variants can be renamed without breaking dispatch.

## Storage

One row per variant in the existing Turso `shades_configs` JSON-blob table, with discriminator `kind: 'tiled-pattern-spec'`. The variant list view filters on this. The built-in `defaultShieldSpec` is **not** stored — it lives in the forked source file as a constant. Storage is exclusively for user-created variants.

Loading semantics:

- `getSpecById(id)`: try registry built-ins first, then storage. Returns `undefined` if not found.
- A pattern config referencing a missing variant id falls back to the algorithm's built-in default with a console warning.

## Pattern type system

`TiledPattern` (currently a string-literal union) widens to `string` — once user-generated UUIDs become valid type values, a closed union is no longer practical. Switch statements on `TiledPattern` get a `default` branch.

A new pattern registry is the single source of truth for both the picker and the dispatcher:

```ts
// src/lib/patterns/pattern-registry.ts
export type PatternAlgorithm = {
  id: string;                                                       // 'shield-tesselation', 'hex', …
  displayName: string;
  generator: (spec: TiledPatternSpec, props: Props) => PathSegment[];
  adjuster: (
    bands: BandCutPattern[],
    config: TiledPatternConfig,
    tubes: TubeCutPattern[],
    spec: TiledPatternSpec
  ) => BandCutPattern[];
  defaultSpec: TiledPatternSpec;                                    // the built-in variant
  supportsEditing: boolean;                                         // true for shield in v1
};

export const algorithms: PatternAlgorithm[] = [shieldAlgorithm, hexAlgorithm, …];
```

`generate-tiled-pattern.ts` dispatches via the registry:

```ts
const spec = getSpecById(config.type);
const algorithm = algorithms.find((a) => a.id === spec.algorithm);
const tile = algorithm.generator(spec, props);
const adjusted = algorithm.adjuster(bands, config, tubes, spec);
```

## Picker UI

`TilingControl.svelte` renders a grouped picker:

```
Pattern: [▼ Shield (default) ]
         ├─ Shield
         │   ├─ Shield (default)         ← builtIn
         │   └─ Shield – tighter         ← user variant
         ├─ Hex
         │   └─ Hex (default)            ← only default; supportsEditing=false
         └─ Box
```

Selection writes the variant id to `TiledPatternConfig.type`. Algorithms with `supportsEditing: false` show only their built-in default.

A "⚙ Edit / Duplicate" affordance next to the selected variant opens the Tile Editor floater preloaded with that variant.

## Editor architecture

**File layout:**

- `src/components/modal/editor/TileEditor.svelte` — top-level floater
- `src/components/modal/editor/SegmentPathEditor.svelte` — fork of `PathEditor.svelte` for `PathSegment[]`
- `src/components/modal/editor/path-editor-shared.ts` — extracted generic helpers (canvas/viewbox math, drag plumbing). Existing `PathEditor.svelte` refactored to use this; behavior preserved for current consumers (Silhouette, EdgeCurve, …).
- `src/components/modal/editor/tile-editor/`
  - `Viewport.svelte` — SVG canvas with mode-aware overlays
  - `AdjacencyGhost.svelte` — translucent neighbor unit positioned per mode
  - `RuleList.svelte` — sidebar list of adjustment rules
  - `VariantBar.svelte` — variant name, id, Save / Save As / Discard
  - `tile-editor-store.ts` — draft state (`Writable<TiledPatternSpec>`), dirty flag, undo stack

**Floater registration** in `src/components/modal/sidebar-definitions.ts`, added to the `patternConfigs` map (which spreads into `projectionConfigs`):

```ts
['Tile Editor', { shortTitle: 'TE', title: 'Tile Editor', content: TileEditor }];
```

**Floater layout (sketch):**

```
┌─ Tile Editor ─────────────────────────────────────────────┐
│ [▼ Shield – tighter] [Save] [Save As] [Discard] [Delete] ●dirty │
│ name: [Shield – tighter]   id: shield-…                    │
│ ────────────────────────────────────────────────────────── │
│ [Unit] [Within Band] [Across Bands]                        │
│ [Partner Start] [Partner End] [Skip Remove]                │
│ ────────────────────────────────────────────────────────── │
│ ┌────────────────────────┐  ┌──────────────────────────┐  │
│ │                        │  │ width:  42               │  │
│ │      viewport          │  │ height: 14               │  │
│ │      (SVG)             │  │ ──────────────────────── │  │
│ │                        │  │ Rules (Within Band):     │  │
│ │                        │  │  1 → 67                  │  │
│ │                        │  │  2 → 68                  │  │
│ │                        │  │  …                       │  │
│ └────────────────────────┘  └──────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

## Adjustment-rule editing UX

The viewport renders the unit. A mode toggle determines what's overlaid and how clicks are interpreted.

| Mode          | Ghost placement (unit-local)  | Click behavior                                                          |
| ------------- | ----------------------------- | ----------------------------------------------------------------------- |
| Unit          | none                          | drag-edit vertex positions                                              |
| Within Band   | translate `(+unit.width, 0)`  | click main vertex → click ghost vertex → create `{source, target}` rule |
| Across Bands  | translate `(0, -unit.height)` | same — prev band above                                                  |
| Partner Start | mirror across left edge       | same — partnered band's end                                             |
| Partner End   | mirror across right edge      | same — other partnered band's end                                       |
| Skip Remove   | none                          | click vertex to toggle membership in `skipRemove[]`                     |

Existing rules render as connection lines. Clicking a connection line selects it; `Delete`/`Backspace` removes. The sidebar `RuleList` mirrors viewport state; clicking a row highlights its connection.

In Unit mode, a "+" tool adds a new vertex on click and creates an `M`+`L` pair connecting it to the previous vertex (matching the existing shield convention). New vertices land in the currently-selected group (start/middle/end), chosen via radio in the sidebar.

## SegmentPathEditor (the fork of PathEditor)

- Data shape: `PathSegment[]` instead of `BezierConfig[]`.
- Vertices rendered as drag handles. Coincident `M`+`L` pairs (same x,y, which is the shield convention) get **one** drag handle that moves both segments together.
- v1 supports editing `M` and `L` only. `A` / `C` / `Q` segments are accepted by the type signature and rendered (so we can already preview specs that contain them) but are read-only.
- Generic plumbing extracted to `path-editor-shared.ts`; existing `PathEditor.svelte` refactored to depend on it. Behavior of existing consumers preserved.

## Forking the shield file

**New folder:** `src/lib/patterns/shield-tesselation/`

- `index.ts` — exports `defaultShieldSpec`, `generateShieldTesselationTile(spec, props)`, `adjustShieldTesselation(bands, config, tubes, spec)`
- `default-spec.ts` — the literal `defaultShieldSpec` constant. The 80 PathSegments and the four adjustment-rule lists, mechanically translated from the current hardcoded arrays into pair-shape (`{source, target}`).
- `helpers.ts` — `retarget`, `replaceInPlace`, `removeInPlace`, `getTransformedPartnerCutPattern`, `newTransformPS`, `getAngle`. All generator-agnostic; `replaceInPlace` accepts `{source, target}[]` directly.

The current `src/lib/patterns/tiled-shield-tesselation-pattern.ts` is **deleted** in the same PR; imports are rewritten.

**Equivalence guarantee:** a golden test asserts that the new pipeline (`generateShieldTesselationTile(defaultShieldSpec, props)` + `adjustShieldTesselation(...)`) produces byte-identical output to a snapshot captured from the pre-fork code. This snapshot is checked in. Tested at multiple `(rows, columns, endsMatched, skipEdges)` combinations exercising every code path. This is the hard gate on the migration.

## Backward compatibility

Existing saved projects with `type: 'tiledShieldTesselationPattern'` (the current `TiledPattern` enum value) continue to work — that string is the id of the file-level default variant. No project-config migration.

If a saved project references a deleted user variant id, the generator falls back to the algorithm's built-in default and logs a console warning.

## Save model

Editor opens a draft copy of the variant. Edits are in-memory only.

- **Save** writes to storage (replacing the existing variant by id). The variant store is a Svelte writable; any consumer reading `getSpecById(id)` through reactive derivation re-derives, which triggers worker recomputation through the existing `superConfigStore` pipeline.
- **Save As** opens an inline name field in `VariantBar`. On confirm: mints a new uuid, writes to storage, and switches the editor (and the current pattern config, if it was using the source variant) to the new id.
- **Discard** reverts to the last-saved state.
- **Delete** (only available for non-built-in variants) removes the variant from storage. If the current pattern config was using it, `TiledPatternConfig.type` is reset to the algorithm's built-in default id with a console warning. Confirm dialog before delete.
- A dirty indicator appears whenever the draft differs from storage.
- The built-in `defaultShieldSpec` cannot be saved over or deleted (Save and Delete disabled; Save As is the only mutation path). This protects the canonical default from accidental edits.
- Closing the floater with unsaved changes is permitted without confirmation (single-user, low-stakes; can add a confirm later if it bites).

## Testing

- **Golden equivalence test** (the hard gate): pre-fork shield output = post-fork output for several rows/columns/endsMatched/skipEdges combinations.
- **Spec helpers unit tests**: `replaceInPlace` accepting `{source, target}[]` correctness; `retarget` correctness for various (rows, columns, index) inputs.
- **SegmentPathEditor unit tests**: vertex dedup for coincident M/L pairs; drag updates both segments; M-only or L-only segments aren't created erroneously.
- **No e2e tests for the editor in v1.** Manual exercise from `/designer2` is sufficient.

## Open scope (deferred / explicitly out of v1)

- Editing arc/bezier _positions_ in the unit (read-only render only).
- Forking other pattern files (hex, carnation, box, etc.). Each is its own future PR using this same plumbing.
- Live preview of in-progress edits to the main 3D viewport.
- Concurrency safety on the same variant across tabs/floaters.
- Variant validation beyond minimal structural checks.
- Variant import / export to JSON.
- Visual diff between two variants.

## Risks

1. **Migration of the four adjustment arrays into pair-shape**: mechanical but tedious; off-by-one errors here would break the golden test. Mitigation: the golden test catches it.
2. **Loosening `TiledPattern` to `string`**: weakens type checking in any code that switches on it. Mitigation: registry dispatch consolidates this; remaining switch sites get a `default` branch and a registry lookup fallback.
3. **PathEditor refactor regressions**: extracting shared helpers could subtly change behavior for existing consumers (Silhouette, EdgeCurve). Mitigation: visual smoke-test those screens after the refactor; behavior preservation is a stated requirement.
4. **The shield's `r === 0` / `r === rows - 1` row logic in `generateShieldTesselationTile` is non-obvious**. It needs careful preservation when generalizing the function signature to take a spec. Mitigation: golden test covers `rows > 1`.

## Open questions resolved during this brainstorm — none remaining

The user explicitly closed brainstorming after Section 2 review with "implement when you're ready, no more questions"; remaining sections (3–5) and all deferrals were authored unilaterally and are approved by that blanket statement. Push back on this spec doc itself if any of those choices are wrong.
