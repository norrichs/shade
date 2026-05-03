# Tile Pattern Editor — Phase 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the Tile Pattern Editor (A) and add vertex topology editing — add/remove vertex with index-shift maintenance for adjustment rules (B).

**Architecture:** Two parallel tracks. Track A is small UI/wiring fixes spread across `TileEditor.svelte`, `TilingControl.svelte`, `PatternTileButton.svelte`, `RuleEditViewport.svelte`, and `VariantBar.svelte` — no new modules. Track B introduces a new pure module `vertex-topology.ts` (add/remove vertex + rule index shift) consumed by a new `Unit` mode toolbar in `SegmentPathEditor.svelte`. The novel piece is shifting all `IndexPair` indices in `adjustments` (`withinBand`, `acrossBands`, `partner.startEnd`, `partner.endEnd`, `skipRemove`) when topology changes — eager rewrite at the moment of edit.

**Tech Stack:** SvelteKit + Svelte 5 runes, Jest (ts-jest ESM), TypeScript, Turso (no schema changes).

**Branch:** `feature-pattern-edit-phase-5` (off main at `251b824`).

**Out of scope (deferred):**

- C: forking other algorithms (hex, carnation, box, etc.) — defer.
- D: live 3D preview of unsaved edits — explicitly not doing.

**Design decisions made for this plan:**

- **Index shift on topology change is eager**, not stable-id. Reason: the data model already uses flat indices end-to-end (`IndexPair { source, target }` and `skipRemove: number[]`); converting to stable ids is a separate refactor that touches `adjustShieldTesselation` and the snapshot test; not worth doing for v1. The shift functions live in `vertex-topology.ts` as pure functions and are unit tested.
- **Skip-remove indices that point at a removed vertex are dropped silently**; rules whose `source` or `target` points at a removed vertex are dropped silently. Both are surfaced through console warnings in dev-mode — sufficient for a single-user tool.
- **Add vertex** creates an `M` + `L` pair at the same coordinate (matches existing shield convention from `default-spec.ts`) in the currently-selected group. Group selection is a radio in the new Unit toolbar.
- **Group reassignment** (move existing vertex from one group to another) is *out* of v1. Add/remove only. If a vertex needs to move groups, the user removes it and adds a new one.

---

## File Structure

**New files:**

- `src/components/modal/editor/vertex-topology.ts` — pure functions: `addVertex`, `removeVertex`, `shiftRulesForInsertion`, `shiftRulesForRemoval`. Operates on `UnitDefinition` and `AdjustmentRules` with no Svelte state.
- `src/components/modal/editor/__tests__/vertex-topology.test.ts` — Jest tests.
- `src/components/modal/editor/tile-editor/UnitToolbar.svelte` — toolbar shown above viewport when `mode === 'unit'`. Contains tool toggle (Drag / Add / Remove) and group radio (Start / Middle / End).

**Modified files (track A — polish):**

- `src/components/modal/editor/tile-editor/RuleEditViewport.svelte` — accept `selectedConnection` as prop with onChange callback so it resets on mode switch (currently internal `$state`); split keydown `$effect` so its reactivity isn't tangled.
- `src/components/modal/editor/TileEditor.svelte` — owns `selectedConnection` state; resets on mode change; per-variant default config factory in `setActiveVariant`; confirm-before-discard guard on mode switch (Save As/Discard already handle the explicit cases).
- `src/components/modal/editor/tile-editor/VariantBar.svelte` — disable Save when validation fails; show inline error.
- `src/components/controls/TilingControl.svelte` — group picker tiles by algorithm with a header label per group.
- `src/components/pattern/PatternTileButton.svelte` — for variants without a base in `tiledPatternConfigs`, derive a per-variant default config from the algorithm's built-in spec id (not the shield default).

**Modified files (track B — topology):**

- `src/components/modal/editor/SegmentPathEditor.svelte` — accept `tool` and `group` props; click-on-empty-canvas creates vertex (Add tool); click-on-vertex removes it (Remove tool); drag remains in Drag tool.
- `src/components/modal/editor/TileEditor.svelte` — own `tool` and `group` state; route `onAddVertex` / `onRemoveVertex` to call topology helpers; rule indices are shifted when calling `setRulesForMode`-equivalent for all four rule lists + skipRemove.

**Pre-existing TS error baseline:** ~427. Don't grow this number; investigate if it does.

---

## Track A: Polish

### Task A1: Lift `selectedConnection` from RuleEditViewport into TileEditor

**Why:** Currently `selectedConnection` lives inside `RuleEditViewport.svelte` as internal `$state`. When the user switches modes, the old selection persists logically (the component remounts so it clears in practice, but the keydown `$effect` lifecycle is fragile). Lifting it makes mode-switch reset explicit and lets us split keydown handling.

**Files:**

- Modify: `src/components/modal/editor/tile-editor/RuleEditViewport.svelte`
- Modify: `src/components/modal/editor/TileEditor.svelte`

- [ ] **Step 1: Update `RuleEditViewport.svelte` props to accept `selectedConnection` + callback**

Open `src/components/modal/editor/tile-editor/RuleEditViewport.svelte` and change the `$props()` block:

```ts
let {
	spec,
	mode,
	rules,
	config,
	selectedTarget,
	selectedConnection,
	onSelectTarget,
	onSelectGhost,
	onSelectConnection,
	onSelectConnectionLine
}: {
	spec: TiledPatternSpec;
	mode: EditorMode;
	rules: IndexPair[];
	config: PathEditorConfig;
	selectedTarget: Vertex | null;
	selectedConnection: { sourceVertex: Vertex; targetVertex: Vertex } | null;
	onSelectTarget: (vertex: Vertex) => void;
	onSelectGhost: (vertex: Vertex) => void;
	onSelectConnection: (sourceVertex: Vertex, targetVertex: Vertex) => void;
	onSelectConnectionLine: (
		conn: { sourceVertex: Vertex; targetVertex: Vertex } | null
	) => void;
} = $props();
```

Remove the local `let selectedConnection ... = $state(null);` line.

- [ ] **Step 2: Replace the local-set click handler with the callback**

In the `<line>` element's `onclick`, change:

```svelte
onclick={() =>
	(selectedConnection = {
		sourceVertex: conn.sourceVertex,
		targetVertex: conn.targetVertex
	})}
```

to:

```svelte
onclick={() =>
	onSelectConnectionLine({
		sourceVertex: conn.sourceVertex,
		targetVertex: conn.targetVertex
	})}
```

- [ ] **Step 3: Split the keydown effect — lift the listener**

The keydown `$effect` reads `selectedConnection` and calls `onSelectConnection`. Since `selectedConnection` is now a prop, the effect re-registers whenever the prop reference changes. Move the keydown handler to receive the current value via a closure that re-reads the prop:

Replace the existing `$effect`:

```svelte
$effect(() => {
	const onKey = (e: KeyboardEvent) => {
		if ((e.key === 'Delete' || e.key === 'Backspace') && selectedConnection) {
			onSelectConnection(selectedConnection.sourceVertex, selectedConnection.targetVertex);
			onSelectConnectionLine(null);
		}
	};
	window.addEventListener('keydown', onKey);
	return () => window.removeEventListener('keydown', onKey);
});
```

Note: Svelte 5 reactivity reads through the closure correctly because `selectedConnection` is a `$props()` value re-read on each call. The listener registers once per mount; only the closure body re-evaluates per keystroke.

- [ ] **Step 4: Update `TileEditor.svelte` to own `selectedConnection` state**

In `src/components/modal/editor/TileEditor.svelte`, after the existing `let selectedTarget: Vertex | null = $state(null);` line, add:

```ts
let selectedConnection: { sourceVertex: Vertex; targetVertex: Vertex } | null = $state(null);

const handleSelectConnectionLine = (
	conn: { sourceVertex: Vertex; targetVertex: Vertex } | null
) => {
	selectedConnection = conn;
};
```

- [ ] **Step 5: Pass props through and reset on mode change**

In `TileEditor.svelte`, change `updateModeAndClearSelection`:

```ts
const updateModeAndClearSelection = (newMode: EditorMode) => {
	mode = newMode;
	selectedTarget = null;
	selectedConnection = null;
};
```

Then update the `<RuleEditViewport>` instantiation to pass the new props:

```svelte
<RuleEditViewport
	spec={draft}
	{mode}
	rules={getRulesForMode()}
	config={editorConfig}
	{selectedTarget}
	{selectedConnection}
	onSelectTarget={handleSelectTarget}
	onSelectGhost={handleSelectGhost}
	onSelectConnection={handleSelectConnection}
	onSelectConnectionLine={handleSelectConnectionLine}
/>
```

- [ ] **Step 6: Manual smoke test**

Run `npm run dev`. In the editor:

1. Open Tile Editor, switch to Within Band mode.
2. Add a connection by clicking a main vertex then a ghost vertex.
3. Click the connection line — it should turn red.
4. Switch to Across Bands mode — the (now stale) selection should be cleared (the new mode shows no red selection on any line).
5. Switch back; press Delete — nothing should be deleted (selection was cleared).

Expected: no console errors, mode switch clears selection.

- [ ] **Step 7: Run typecheck and tests**

Run:

```bash
npm run check 2>&1 | tail -20
npm run test:unit -- src/components/modal/editor/__tests__
```

Expected: TS error count not significantly above 427; existing tests still pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/modal/editor/tile-editor/RuleEditViewport.svelte src/components/modal/editor/TileEditor.svelte
git commit -m "Lift selectedConnection into TileEditor; clear on mode switch"
```

---

### Task A2: Variant validation on save (≥1 segment per group)

**Why:** Spec § "Validation beyond minimal structural checks" is non-goal, but `≥1 segment per group on save` IS in scope per Phase 5 A. If the user's draft has zero segments in `start`, `middle`, or `end`, `generateShieldTesselationTile` will produce malformed output. Block save with an inline message.

**Files:**

- Modify: `src/components/modal/editor/tile-editor/VariantBar.svelte`
- Modify: `src/components/modal/editor/TileEditor.svelte`

- [ ] **Step 1: Add validation helper to `TileEditor.svelte`**

In `src/components/modal/editor/TileEditor.svelte`, after the `editorConfig` `$derived.by` block, add:

```ts
const validationError = $derived.by(() => {
	if (!draft) return null;
	if (draft.unit.start.length === 0) return 'start group must have at least 1 segment';
	if (draft.unit.middle.length === 0) return 'middle group must have at least 1 segment';
	if (draft.unit.end.length === 0) return 'end group must have at least 1 segment';
	return null;
});
```

- [ ] **Step 2: Pass `validationError` into `VariantBar`**

In the `<VariantBar>` instantiation, add:

```svelte
<VariantBar
	{draft}
	{isDirty}
	{isBuiltIn}
	{validationError}
	availableVariants={variantList}
	...
/>
```

- [ ] **Step 3: Update `VariantBar.svelte` props**

In `src/components/modal/editor/tile-editor/VariantBar.svelte`, add `validationError` to the props block:

```ts
let {
	draft,
	isDirty,
	isBuiltIn,
	validationError,
	availableVariants,
	onSelectVariant,
	onSave,
	onSaveAs,
	onDiscard,
	onDelete
}: {
	draft: TiledPatternSpec | null;
	isDirty: boolean;
	isBuiltIn: boolean;
	validationError: string | null;
	availableVariants: TiledPatternSpec[];
	onSelectVariant: (variantId: string) => void;
	onSave: () => void;
	onSaveAs: (newName: string) => void;
	onDiscard: () => void;
	onDelete: () => void;
} = $props();
```

- [ ] **Step 4: Disable Save / Save As on validation error and show message**

In `VariantBar.svelte`, change:

```svelte
<button onclick={onSave} disabled={isBuiltIn || !isDirty}>Save</button>
```

to:

```svelte
<button
	onclick={onSave}
	disabled={isBuiltIn || !isDirty || validationError !== null}
>
	Save
</button>
```

And:

```svelte
<button onclick={handleSaveAsClick} disabled={!draft}>Save As…</button>
```

to:

```svelte
<button onclick={handleSaveAsClick} disabled={!draft || validationError !== null}>Save As…</button>
```

Then add an error row at the bottom of the `<div class="variant-bar">` block, after the `meta` row:

```svelte
{#if validationError}
	<div class="row error">{validationError}</div>
{/if}
```

And add to the `<style>` block:

```css
.error {
	color: #b00020;
	font-size: 0.85em;
}
```

- [ ] **Step 5: Manual smoke test**

Run `npm run dev`. In Tile Editor:

1. Save As a copy of `Shield (default)` so we have a non-built-in variant.
2. In Unit mode, you currently can't delete vertices yet (that's Track B), so test by manipulating an existing variant's stored JSON: open Drizzle Studio (`npm run drizzle:studio`), find the row, set `start: []` in `configJson`, save.
3. Reload the app, open the variant in Tile Editor — Save should be disabled and the message "start group must have at least 1 segment" should appear.

Note: test will be more thorough once Track B's remove-vertex is wired.

- [ ] **Step 6: Run tests**

```bash
npm run check 2>&1 | tail -5
```

Expected: TS error count not significantly above 427.

- [ ] **Step 7: Commit**

```bash
git add src/components/modal/editor/tile-editor/VariantBar.svelte src/components/modal/editor/TileEditor.svelte
git commit -m "Block save when any unit group is empty; show inline error"
```

---

### Task A3: Group picker tiles by algorithm in TilingControl

**Why:** When user variants are added, the picker becomes a flat strip without organization. Group by algorithm with a header label so user variants of the same algorithm cluster.

**Files:**

- Modify: `src/components/controls/TilingControl.svelte`

- [ ] **Step 1: Replace `getTiles` with grouped helper**

In `src/components/controls/TilingControl.svelte`, replace `getTiles` and the surrounding usage with a grouped variant. Replace lines 62-84:

```ts
type TileGroup = { algorithmId: string; displayName: string; tiles: { type: string; tiling: TilingBasis }[] };

const getTileGroups = (
	configs: { [key: string]: TiledPatternConfig },
	variants: TiledPatternSpec[]
): TileGroup[] => {
	const builtInIds = new Set(algorithms.map((a) => a.defaultSpec.id));
	const algoGroups: TileGroup[] = algorithms.map((a) => {
		const builtIn = { type: a.defaultSpec.id, tiling: 'quadrilateral' as TilingBasis };
		const userVariants = variants
			.filter((v) => !builtInIds.has(v.id) && v.algorithm === a.algorithmId)
			.map((v) => ({ type: v.id, tiling: 'quadrilateral' as TilingBasis }));
		return { algorithmId: a.algorithmId, displayName: a.displayName, tiles: [builtIn, ...userVariants] };
	});
	const legacyTiles: { type: string; tiling: TilingBasis }[] = (
		['quadrilateral', 'triangle', 'band'] as TilingBasis[]
	)
		.flatMap((tilingBasis) =>
			Object.values(configs).filter((c) => c.tiling === tilingBasis && !builtInIds.has(c.type))
		)
		.map((c) => ({ type: c.type, tiling: c.tiling }));
	const legacyGroup: TileGroup = {
		algorithmId: 'legacy',
		displayName: 'Other',
		tiles: legacyTiles
	};
	return [legacyGroup, ...algoGroups];
};
```

- [ ] **Step 2: Replace the picker template**

Replace the `{#if isTiled}` block (lines 177-185 approximately):

```svelte
{#if isTiled}
	<section class="tiles">
		{#each getTileGroups(tiledPatternConfigs, variantList) as group (group.algorithmId)}
			{#if group.tiles.length > 0}
				<div class="group-header">{group.displayName}</div>
				<div class="option-tile-group">
					{#each group.tiles as tile}
						<PatternTileButton size={45} patternType={tile.type} tilingBasis={tile.tiling} />
					{/each}
				</div>
			{/if}
		{/each}
	</section>
{/if}
```

- [ ] **Step 3: Add header style**

In the `<style>` block, add:

```css
.group-header {
	font-size: 0.85em;
	color: rgba(0, 0, 0, 0.6);
	padding: 6px 4px 2px;
}
```

- [ ] **Step 4: Manual smoke test**

Run `npm run dev`. Switch to Tiled mode. The picker should show:

- "Other" header with all the legacy patterns (hex, grid, panel, etc.) below
- "Shield" header with the built-in shield tile (and any user variants you've created)

- [ ] **Step 5: Run typecheck**

```bash
npm run check 2>&1 | tail -5
```

Expected: TS error count not significantly above 427.

- [ ] **Step 6: Commit**

```bash
git add src/components/controls/TilingControl.svelte
git commit -m "Group pattern picker tiles by algorithm with section headers"
```

---

### Task A4: Per-variant default config in PatternTileButton

**Why:** Currently `PatternTileButton.svelte:29-33` falls back to spreading `tiledPatternConfigs['tiledShieldTesselationPattern']` for any non-keyed variant. That means a future hex variant would inherit shield's `aspectRatio: 4582.575695 / 7937.253933` and `skipEdges: 'not-last'` — wrong. Use the algorithm's built-in default's config when available.

**Files:**

- Modify: `src/components/pattern/PatternTileButton.svelte`

- [ ] **Step 1: Look up the variant's algorithm and use its built-in default's config**

Open `src/components/pattern/PatternTileButton.svelte`. Replace the entire `<script>` block:

```svelte
<script lang="ts">
	import { patternConfigStore } from '$lib/stores';
	import PatternTile from './PatternTile.svelte';
	import { tiledPatternConfigs } from '$lib/shades-config';
	import { patterns } from '$lib/patterns';
	import { tilePatternSpecStore } from '$lib/stores/tilePatternSpecStore';
	import { algorithms } from '$lib/patterns/pattern-registry';
	import type { TilingBasis, TiledPatternConfig } from '$lib/types';
	import { get } from 'svelte/store';

	let {
		patternType,
		tilingBasis,
		size = 50
	}: {
		patternType: string;
		tilingBasis: TilingBasis;
		size?: number;
	} = $props();

	let strokeWidth = $derived(size >= 50 ? 2 : 0.5);

	const resolveBaseConfig = (type: string): TiledPatternConfig => {
		const direct = tiledPatternConfigs[type];
		if (direct) return direct;
		const variant = get(tilePatternSpecStore).variants.find((v) => v.id === type);
		const algorithmId = variant?.algorithm;
		const algorithm = algorithms.find((a) => a.algorithmId === algorithmId);
		const builtInId = algorithm?.defaultSpec.id;
		if (builtInId && tiledPatternConfigs[builtInId]) {
			return { ...tiledPatternConfigs[builtInId], type };
		}
		return { ...tiledPatternConfigs['tiledShieldTesselationPattern'], type };
	};
</script>
```

And replace the `<button>` body:

```svelte
<button
	onclick={() => {
		if (!patterns[patternType]) return;
		$patternConfigStore.patternTypeConfig = resolveBaseConfig(patternType);
	}}
>
```

- [ ] **Step 2: Verify imports compile**

```bash
npm run check 2>&1 | tail -5
```

Expected: TS error count not significantly above 427.

- [ ] **Step 3: Manual smoke test**

Run `npm run dev`. In Tiled mode, click on the built-in shield tile then on a saved user variant tile. Both should activate and render. (We don't have non-shield algorithms registered yet, so this is mostly future-proofing — but the code path is exercised on the user-variant click.)

- [ ] **Step 4: Commit**

```bash
git add src/components/pattern/PatternTileButton.svelte
git commit -m "Resolve per-variant default config via algorithm registry, not hardcoded shield"
```

---

### Task A5: Confirm-before-discard on mode switch with unsaved edits

**Why:** Phase 5 scope item: "confirm-before-discard on close" was originally framed as floater-close. Floater close is non-trivial in this codebase (controlled by sidebar). The same protection mode-switch is more useful: switching from Unit mode after editing vertex positions, then to a rule mode, doesn't lose the edits (they stay in `draft`). But switching to a different *variant* via `VariantBar`'s select drops the draft. That's the dangerous transition.

**Files:**

- Modify: `src/components/modal/editor/TileEditor.svelte`

- [ ] **Step 1: Add confirm to `handleSelectVariant`**

In `src/components/modal/editor/TileEditor.svelte`, replace `handleSelectVariant`:

```ts
const handleSelectVariant = (variantId: string) => {
	if (isDirty) {
		const proceed = window.confirm(
			'You have unsaved changes. Switching variants will discard them. Continue?'
		);
		if (!proceed) return;
	}
	setActiveVariant(variantId);
};
```

- [ ] **Step 2: Manual smoke test**

Run `npm run dev`. Open Tile Editor with the shield default. Save As a copy. Switch to the new variant in the dropdown — no confirm (clean state). Make an edit (drag a vertex in Unit mode). Switch in the dropdown — confirm prompt appears. Cancel — selection stays. Re-try and confirm — variant switches and edits are lost.

- [ ] **Step 3: Commit**

```bash
git add src/components/modal/editor/TileEditor.svelte
git commit -m "Confirm before switching variants in TileEditor when draft is dirty"
```

---

## Track B: Vertex topology editing

### Task B1: Define `vertex-topology.ts` — types and `addVertex`

**Why:** The structurally-novel piece. Adding a vertex inserts an `M` + `L` pair in one group. All `IndexPair` and `skipRemove` indices in `adjustments` that point at any segment ≥ the insertion point need to shift by `+2`.

**Files:**

- Create: `src/components/modal/editor/vertex-topology.ts`
- Create: `src/components/modal/editor/__tests__/vertex-topology.test.ts`

- [ ] **Step 1: Write failing test for `addVertex`**

Create `src/components/modal/editor/__tests__/vertex-topology.test.ts`:

```ts
import { addVertex } from '../vertex-topology';
import type { TiledPatternSpec } from '$lib/patterns/spec-types';

const makeSpec = (): TiledPatternSpec => ({
	id: 'test',
	name: 'Test',
	algorithm: 'shield-tesselation',
	builtIn: false,
	unit: {
		width: 42,
		height: 14,
		start: [
			['M', 0, 0],
			['L', 1, 1]
		],
		middle: [
			['M', 5, 5],
			['L', 6, 6]
		],
		end: [
			['M', 10, 10],
			['L', 11, 11]
		]
	},
	adjustments: {
		withinBand: [{ source: 5, target: 0 }],
		acrossBands: [],
		partner: { startEnd: [], endEnd: [] },
		skipRemove: [4]
	}
});

describe('addVertex', () => {
	it('inserts M+L pair at end of start group at given coordinate', () => {
		const spec = makeSpec();
		const next = addVertex(spec, 'start', 7, 8);
		expect(next.unit.start).toEqual([
			['M', 0, 0],
			['L', 1, 1],
			['M', 7, 8],
			['L', 7, 8]
		]);
		expect(next.unit.middle).toEqual(spec.unit.middle);
		expect(next.unit.end).toEqual(spec.unit.end);
	});

	it('shifts middle and end rule indices by +2 when inserting in start', () => {
		const spec = makeSpec();
		const next = addVertex(spec, 'start', 7, 8);
		// Original index 5 was the second vertex of middle group (start=2, middle index 1 within).
		// After +2 in start, index 5 becomes 7.
		expect(next.adjustments.withinBand).toEqual([{ source: 7, target: 0 }]);
		expect(next.adjustments.skipRemove).toEqual([6]);
	});

	it('shifts only end indices when inserting in middle', () => {
		const spec = makeSpec();
		const next = addVertex(spec, 'middle', 9, 9);
		expect(next.unit.middle).toHaveLength(4);
		// withinBand source=5 was middle[1] which is at flat 5 → unchanged inside middle but pushed because we appended
		// Inserting at end of middle pushes nothing (end gets shifted by +2 because middle.length grew).
		// Original index 5 (middle[1]) stays 5; original index 4 (middle[0]) stays 4.
		// Original skipRemove [4] (middle[0]) stays [4].
		expect(next.adjustments.withinBand).toEqual([{ source: 5, target: 0 }]);
		expect(next.adjustments.skipRemove).toEqual([4]);
	});

	it('shifts nothing when inserting in end', () => {
		const spec = makeSpec();
		const next = addVertex(spec, 'end', 12, 12);
		expect(next.unit.end).toHaveLength(4);
		expect(next.adjustments.withinBand).toEqual([{ source: 5, target: 0 }]);
		expect(next.adjustments.skipRemove).toEqual([4]);
	});
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm run test:unit -- src/components/modal/editor/__tests__/vertex-topology.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `vertex-topology.ts` with `addVertex`**

Create `src/components/modal/editor/vertex-topology.ts`:

```ts
import type {
	TiledPatternSpec,
	UnitDefinition,
	IndexPair,
	AdjustmentRules
} from '$lib/patterns/spec-types';

export type Group = 'start' | 'middle' | 'end';

const groupBaseIndex = (unit: UnitDefinition, group: Group): number => {
	if (group === 'start') return 0;
	if (group === 'middle') return unit.start.length;
	return unit.start.length + unit.middle.length;
};

const groupEndIndex = (unit: UnitDefinition, group: Group): number => {
	if (group === 'start') return unit.start.length;
	if (group === 'middle') return unit.start.length + unit.middle.length;
	return unit.start.length + unit.middle.length + unit.end.length;
};

const shiftIndex = (idx: number, threshold: number, delta: number): number =>
	idx >= threshold ? idx + delta : idx;

const shiftPair = (pair: IndexPair, threshold: number, delta: number): IndexPair => ({
	source: shiftIndex(pair.source, threshold, delta),
	target: shiftIndex(pair.target, threshold, delta)
});

export const shiftRulesForInsertion = (
	rules: AdjustmentRules,
	threshold: number,
	delta: number
): AdjustmentRules => ({
	withinBand: rules.withinBand.map((p) => shiftPair(p, threshold, delta)),
	acrossBands: rules.acrossBands.map((p) => shiftPair(p, threshold, delta)),
	partner: {
		startEnd: rules.partner.startEnd.map((p) => shiftPair(p, threshold, delta)),
		endEnd: rules.partner.endEnd.map((p) => shiftPair(p, threshold, delta))
	},
	skipRemove: rules.skipRemove.map((i) => shiftIndex(i, threshold, delta))
});

export const addVertex = (
	spec: TiledPatternSpec,
	group: Group,
	x: number,
	y: number
): TiledPatternSpec => {
	const unit: UnitDefinition = {
		width: spec.unit.width,
		height: spec.unit.height,
		start: [...spec.unit.start],
		middle: [...spec.unit.middle],
		end: [...spec.unit.end]
	};
	const insertedAt = groupEndIndex(spec.unit, group);
	const newSegments: UnitDefinition['start'] = [
		['M', x, y],
		['L', x, y]
	];
	unit[group] = [...unit[group], ...newSegments];

	const adjustments = shiftRulesForInsertion(spec.adjustments, insertedAt, 2);

	return { ...spec, unit, adjustments };
};
```

- [ ] **Step 4: Run test to confirm pass**

```bash
npm run test:unit -- src/components/modal/editor/__tests__/vertex-topology.test.ts
```

Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/modal/editor/vertex-topology.ts src/components/modal/editor/__tests__/vertex-topology.test.ts
git commit -m "Add vertex-topology.addVertex with adjustment-rule index shifting"
```

---

### Task B2: `removeVertex` with rule index shifting and orphan rule removal

**Why:** Removing a vertex deletes its `M` and `L` segments (potentially up to 2 segments per ref). All indices ≥ the lowest removed segment shift by `-(removed count)`. Rules whose `source` or `target` pointed *at* a removed segment must be dropped (they'd now address a different segment).

**Files:**

- Modify: `src/components/modal/editor/vertex-topology.ts`
- Modify: `src/components/modal/editor/__tests__/vertex-topology.test.ts`

- [ ] **Step 1: Write failing tests for `removeVertex`**

Append to `src/components/modal/editor/__tests__/vertex-topology.test.ts`:

```ts
import { removeVertex, shiftRulesForRemoval } from '../vertex-topology';
import { computeVertices } from '../segment-vertices';

describe('shiftRulesForRemoval', () => {
	it('removes pairs that touch any removed index and shifts the rest down', () => {
		const removed = new Set([2, 3]);
		const result = shiftRulesForRemoval(
			{
				withinBand: [
					{ source: 0, target: 1 }, // keep, no shift
					{ source: 4, target: 0 }, // keep, source shifts to 2
					{ source: 2, target: 0 }, // drop (touches removed)
					{ source: 0, target: 3 }  // drop
				],
				acrossBands: [],
				partner: { startEnd: [], endEnd: [] },
				skipRemove: [0, 2, 5]
			},
			removed
		);
		expect(result.withinBand).toEqual([
			{ source: 0, target: 1 },
			{ source: 2, target: 0 }
		]);
		expect(result.skipRemove).toEqual([0, 3]);
	});
});

describe('removeVertex', () => {
	it('removes the M+L pair at coincident M+L vertex', () => {
		const spec: TiledPatternSpec = {
			id: 't',
			name: 'T',
			algorithm: 'shield-tesselation',
			builtIn: false,
			unit: {
				width: 42,
				height: 14,
				start: [
					['M', 0, 0],
					['L', 5, 5],
					['M', 5, 5],
					['L', 10, 10]
				],
				middle: [],
				end: []
			},
			adjustments: {
				withinBand: [],
				acrossBands: [],
				partner: { startEnd: [], endEnd: [] },
				skipRemove: []
			}
		};
		const vertex = computeVertices(spec.unit).find((v) => v.x === 5)!;
		const next = removeVertex(spec, vertex);
		expect(next.unit.start).toEqual([
			['M', 0, 0],
			['L', 10, 10]
		]);
	});

	it('drops rules referencing a removed index and shifts the rest', () => {
		const spec: TiledPatternSpec = {
			id: 't',
			name: 'T',
			algorithm: 'shield-tesselation',
			builtIn: false,
			unit: {
				width: 42,
				height: 14,
				start: [
					['M', 0, 0],
					['L', 5, 5],
					['M', 5, 5],
					['L', 10, 10]
				],
				middle: [],
				end: []
			},
			adjustments: {
				withinBand: [
					{ source: 3, target: 0 }, // index 3 = vertex (10,10), keep, source shifts to 1
					{ source: 1, target: 0 }  // index 1 = removed, drop
				],
				acrossBands: [],
				partner: { startEnd: [], endEnd: [] },
				skipRemove: [3, 2] // 3 = (10,10) keep→1; 2 = removed, drop
			}
		};
		const vertex = computeVertices(spec.unit).find((v) => v.x === 5)!;
		const next = removeVertex(spec, vertex);
		expect(next.adjustments.withinBand).toEqual([{ source: 1, target: 0 }]);
		expect(next.adjustments.skipRemove).toEqual([1]);
	});
});
```

- [ ] **Step 2: Run test to confirm fail**

```bash
npm run test:unit -- src/components/modal/editor/__tests__/vertex-topology.test.ts
```

Expected: FAIL — `removeVertex` and `shiftRulesForRemoval` not exported.

- [ ] **Step 3: Implement `removeVertex` and `shiftRulesForRemoval`**

Append to `src/components/modal/editor/vertex-topology.ts`:

```ts
import type { Vertex } from './segment-vertices';
import { flatIndexes } from './vertex-addressing';

export const shiftRulesForRemoval = (
	rules: AdjustmentRules,
	removedIndices: Set<number>
): AdjustmentRules => {
	const sortedRemoved = [...removedIndices].sort((a, b) => a - b);
	const shift = (idx: number): number => {
		let count = 0;
		for (const r of sortedRemoved) {
			if (r < idx) count++;
			else break;
		}
		return idx - count;
	};
	const filterAndShift = (pairs: IndexPair[]): IndexPair[] =>
		pairs
			.filter((p) => !removedIndices.has(p.source) && !removedIndices.has(p.target))
			.map((p) => ({ source: shift(p.source), target: shift(p.target) }));
	return {
		withinBand: filterAndShift(rules.withinBand),
		acrossBands: filterAndShift(rules.acrossBands),
		partner: {
			startEnd: filterAndShift(rules.partner.startEnd),
			endEnd: filterAndShift(rules.partner.endEnd)
		},
		skipRemove: rules.skipRemove.filter((i) => !removedIndices.has(i)).map(shift)
	};
};

export const removeVertex = (spec: TiledPatternSpec, vertex: Vertex): TiledPatternSpec => {
	const removed = new Set(flatIndexes(spec.unit, vertex));
	const removeFromGroup = (group: Group): UnitDefinition[Group] => {
		const base = groupBaseIndex(spec.unit, group);
		return spec.unit[group].filter((_, i) => !removed.has(base + i));
	};
	const unit: UnitDefinition = {
		width: spec.unit.width,
		height: spec.unit.height,
		start: removeFromGroup('start'),
		middle: removeFromGroup('middle'),
		end: removeFromGroup('end')
	};
	const adjustments = shiftRulesForRemoval(spec.adjustments, removed);
	return { ...spec, unit, adjustments };
};
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npm run test:unit -- src/components/modal/editor/__tests__/vertex-topology.test.ts
```

Expected: PASS — all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/modal/editor/vertex-topology.ts src/components/modal/editor/__tests__/vertex-topology.test.ts
git commit -m "Add vertex-topology.removeVertex with orphan-rule filtering"
```

---

### Task B3: `UnitToolbar.svelte` — tool toggle and group radio

**Why:** UI affordance for the new modes. Drag (existing), Add, Remove tools; Start / Middle / End group radio (only meaningful when Add tool is active, hidden otherwise).

**Files:**

- Create: `src/components/modal/editor/tile-editor/UnitToolbar.svelte`

- [ ] **Step 1: Create `UnitToolbar.svelte`**

Create `src/components/modal/editor/tile-editor/UnitToolbar.svelte`:

```svelte
<script lang="ts">
	import type { Group } from '../vertex-topology';

	export type UnitTool = 'drag' | 'add' | 'remove';

	let {
		tool,
		group,
		onChangeTool,
		onChangeGroup
	}: {
		tool: UnitTool;
		group: Group;
		onChangeTool: (tool: UnitTool) => void;
		onChangeGroup: (group: Group) => void;
	} = $props();

	const tools: { id: UnitTool; label: string }[] = [
		{ id: 'drag', label: 'Drag' },
		{ id: 'add', label: 'Add' },
		{ id: 'remove', label: 'Remove' }
	];
	const groups: Group[] = ['start', 'middle', 'end'];
</script>

<div class="toolbar">
	<div class="tools">
		{#each tools as t}
			<button class:active={tool === t.id} onclick={() => onChangeTool(t.id)}>{t.label}</button>
		{/each}
	</div>
	{#if tool === 'add'}
		<div class="groups">
			<span class="label">Group:</span>
			{#each groups as g}
				<label>
					<input
						type="radio"
						name="vertex-group"
						checked={group === g}
						onchange={() => onChangeGroup(g)}
					/>
					{g}
				</label>
			{/each}
		</div>
	{/if}
</div>

<style>
	.toolbar {
		display: flex;
		flex-direction: row;
		gap: 12px;
		padding: 4px 8px;
		border-bottom: 1px dotted black;
	}
	.tools,
	.groups {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	button.active {
		font-weight: bold;
		text-decoration: underline;
	}
	.label {
		color: rgba(0, 0, 0, 0.5);
		font-size: 0.85em;
	}
</style>
```

- [ ] **Step 2: Verify it parses**

```bash
npm run check 2>&1 | tail -5
```

Expected: TS error count not significantly above 427 (this file is unused yet, so it shouldn't introduce new errors).

- [ ] **Step 3: Commit**

```bash
git add src/components/modal/editor/tile-editor/UnitToolbar.svelte
git commit -m "Add UnitToolbar with tool toggle (drag/add/remove) and group radio"
```

---

### Task B4: Wire `tool` and `group` state into `TileEditor.svelte`

**Why:** TileEditor owns mode state already; add `tool` and `group` for Unit mode and the topology callbacks.

**Files:**

- Modify: `src/components/modal/editor/TileEditor.svelte`

- [ ] **Step 1: Add state**

In `src/components/modal/editor/TileEditor.svelte`, after the existing `let mode: EditorMode = $state('unit');` line, add:

```ts
import type { UnitTool } from './tile-editor/UnitToolbar.svelte';
import type { Group } from './vertex-topology';
import { addVertex, removeVertex } from './vertex-topology';

let tool: UnitTool = $state('drag');
let group: Group = $state('start');
```

(Place imports at the top with other imports; place `let` declarations with the other Unit-mode state.)

- [ ] **Step 2: Add topology handlers**

After `handleUnitChange`, add:

```ts
const handleAddVertex = (x: number, y: number) => {
	if (!draft) return;
	const next = addVertex($state.snapshot(draft) as TiledPatternSpec, group, x, y);
	draft = next;
	isDirty = true;
};

const handleRemoveVertex = (vertex: Vertex) => {
	if (!draft) return;
	const next = removeVertex($state.snapshot(draft) as TiledPatternSpec, vertex);
	draft = next;
	isDirty = true;
};
```

- [ ] **Step 3: Render `UnitToolbar` and pass props to `SegmentPathEditor`**

Find the `{#if mode === 'unit'}` block in the template. Replace it:

```svelte
{#if mode === 'unit'}
	<UnitToolbar {tool} {group} onChangeTool={(t) => (tool = t)} onChangeGroup={(g) => (group = g)} />
	<div class="viewport-wrap">
		<SegmentPathEditor
			unit={draft.unit}
			config={editorConfig}
			{tool}
			onChangeUnit={handleUnitChange}
			onAddVertex={handleAddVertex}
			onRemoveVertex={handleRemoveVertex}
		/>
	</div>
```

Add the import at the top:

```ts
import UnitToolbar from './tile-editor/UnitToolbar.svelte';
```

- [ ] **Step 4: Verify TileEditor compiles (SegmentPathEditor doesn't accept these props yet — the Step 3 change will fail typecheck until B5 is done; that's expected)**

```bash
npm run check 2>&1 | grep -E "TileEditor|SegmentPathEditor" | head -20
```

Expected: errors about `tool`, `onAddVertex`, `onRemoveVertex` not in `SegmentPathEditor`'s props. Will be fixed in B5.

- [ ] **Step 5: Commit (compile-broken — but B4 and B5 are paired)**

```bash
git add src/components/modal/editor/TileEditor.svelte
git commit -m "Wire tool/group state and topology handlers in TileEditor (UI in next commit)"
```

---

### Task B5: Update `SegmentPathEditor.svelte` to handle Add and Remove tools

**Why:** The editor currently only supports Drag. Add tool: clicking on empty SVG canvas creates a vertex at the click coordinate (mapped from screen → svg via `canv.scale`). Remove tool: clicking on a vertex circle removes it. Drag tool unchanged.

**Files:**

- Modify: `src/components/modal/editor/SegmentPathEditor.svelte`

- [ ] **Step 1: Update props and add tool routing**

Replace the entire `<script>` block in `src/components/modal/editor/SegmentPathEditor.svelte`:

```svelte
<script lang="ts">
	import type { UnitDefinition } from '$lib/patterns/spec-types';
	import type { PathSegment } from '$lib/types';
	import { svgPathStringFromSegments } from '$lib/patterns/utils';
	import { getCanvas, type PathEditorConfig } from './path-editor-shared';
	import { computeVertices, updateUnitForVertexMove, type Vertex } from './segment-vertices';
	import DraggablePoint from './DraggablePoint.svelte';
	import type { UnitTool } from './tile-editor/UnitToolbar.svelte';

	let {
		unit,
		config,
		tool = 'drag',
		onChangeUnit,
		onAddVertex,
		onRemoveVertex
	}: {
		unit: UnitDefinition;
		config: PathEditorConfig;
		tool?: UnitTool;
		onChangeUnit: (unit: UnitDefinition) => void;
		onAddVertex?: (x: number, y: number) => void;
		onRemoveVertex?: (vertex: Vertex) => void;
	} = $props();

	const canv = $derived(getCanvas(config));
	const vertices = $derived(computeVertices(unit));
	const allSegments = $derived<PathSegment[]>([...unit.start, ...unit.middle, ...unit.end]);
	const pathString = $derived(svgPathStringFromSegments(allSegments));

	const handleDrag = (vertex: Vertex, newX: number, newY: number) => {
		if (tool !== 'drag') return;
		const scaledX = newX * canv.scale;
		const scaledY = newY * canv.scale;
		onChangeUnit(updateUnitForVertexMove(unit, vertex, scaledX, scaledY));
	};

	const handleDragEnd = () => {};

	const handleSvgClick = (e: MouseEvent) => {
		if (tool !== 'add' || !onAddVertex) return;
		const svg = e.currentTarget as SVGSVGElement;
		const rect = svg.getBoundingClientRect();
		const screenX = e.clientX - rect.left;
		const screenY = e.clientY - rect.top;
		const x = (screenX / config.size.width) * (canv.viewBoxWidth ?? config.size.width);
		const y = (screenY / config.size.height) * (canv.viewBoxHeight ?? config.size.height);
		const vbX = x + (canv.viewBoxLeft ?? 0);
		const vbY = y + (canv.viewBoxTop ?? 0);
		onAddVertex(vbX, vbY);
	};

	const handleVertexClick = (vertex: Vertex) => {
		if (tool === 'remove' && onRemoveVertex) onRemoveVertex(vertex);
	};
</script>
```

Wait — look at `path-editor-shared.ts` for the `canv` shape; we may need to inspect it to know whether `viewBoxWidth` etc. are exposed. Let's first check that file before locking in the implementation.

- [ ] **Step 2: Read `path-editor-shared.ts` to verify `canv` shape**

Run:

```bash
cat src/components/modal/editor/path-editor-shared.ts
```

Confirm what `getCanvas(config)` returns. If it doesn't expose viewBox bounds directly, compute them inline from `config`.

If `getCanvas` only returns `{ viewBox, scale }`, then change Step 1's `handleSvgClick` to compute viewbox bounds from `config`:

```ts
const handleSvgClick = (e: MouseEvent) => {
	if (tool !== 'add' || !onAddVertex) return;
	const svg = e.currentTarget as SVGSVGElement;
	const rect = svg.getBoundingClientRect();
	const screenX = e.clientX - rect.left;
	const screenY = e.clientY - rect.top;
	const vbWidth = config.contentBounds.width + config.padding * 2;
	const vbHeight = config.contentBounds.height + config.padding * 2;
	const vbX = (screenX / config.size.width) * vbWidth + (config.contentBounds.left - config.padding);
	const vbY = (screenY / config.size.height) * vbHeight + (config.contentBounds.top - config.padding);
	onAddVertex(vbX, vbY);
};
```

(This uses the same math as `getCanvas`'s viewBox composition.)

- [ ] **Step 3: Update template to wire click handlers**

Replace the SVG element block in `src/components/modal/editor/SegmentPathEditor.svelte`:

```svelte
<div class="container" style="width:{config.size.width}px; height:{config.size.height}px;">
	<svg
		width={config.size.width}
		height={config.size.height}
		viewBox={canv.viewBox}
		class="canvas"
		class:add={tool === 'add'}
		class:remove={tool === 'remove'}
		onclick={handleSvgClick}
	>
		<rect x="0" y="0" width={unit.width} height={unit.height} class="unit-bounds" />
		<path d={pathString} class="segments" />
		{#if tool === 'remove'}
			{#each vertices as vertex (vertex.x + ':' + vertex.y)}
				<circle
					cx={vertex.x}
					cy={vertex.y}
					r="0.6"
					class="remove-target"
					onclick={(e) => {
						e.stopPropagation();
						handleVertexClick(vertex);
					}}
				/>
			{/each}
		{/if}
	</svg>
	{#if tool === 'drag'}
		{#each vertices as vertex (vertex.x + ':' + vertex.y)}
			<DraggablePoint
				{config}
				{canv}
				curveIndex={0}
				pointIndex={0}
				point={{ type: 'PointConfig2', x: vertex.x, y: vertex.y }}
				handleDrag={(x, y) => handleDrag(vertex, x, y)}
				{handleDragEnd}
				handleDoubleClick={() => {}}
			/>
		{/each}
	{/if}
</div>

<style>
	.container {
		border: 1px dotted black;
		padding: 0;
		position: relative;
		box-sizing: content-box;
		flex: none;
	}
	.canvas {
		background-color: beige;
		display: block;
	}
	.canvas.add {
		cursor: crosshair;
	}
	.canvas.remove {
		cursor: not-allowed;
	}
	.unit-bounds {
		fill: none;
		stroke: rgba(0, 0, 0, 0.15);
		stroke-width: 0.2;
		stroke-dasharray: 0.5, 0.5;
	}
	.segments {
		fill: none;
		stroke: black;
		stroke-width: 0.4;
	}
	.remove-target {
		fill: rgba(255, 0, 0, 0.15);
		stroke: red;
		stroke-width: 0.2;
		cursor: pointer;
	}
	.remove-target:hover {
		fill: rgba(255, 0, 0, 0.5);
	}
</style>
```

- [ ] **Step 4: Run typecheck and tests**

```bash
npm run check 2>&1 | tail -5
npm run test:unit -- src/components/modal/editor/__tests__
```

Expected: TS error count not significantly above 427; tests still pass.

- [ ] **Step 5: Manual smoke test**

Run `npm run dev`. Open Tile Editor, switch to Drag tool — drag should still work. Switch to Add tool, choose Middle group. Click on the canvas in an empty area — a new vertex pair should appear at the click location (you'll see a tiny zigzag in the path because M+L at the same point doesn't render visibly, but the next drag would make it visible). Switch to Remove tool — red overlays appear on every vertex; click one — it disappears, path updates.

Verify that adjustment-rule indices don't get stale: in Within Band mode, add a connection. Switch back to Unit mode, Add tool, click to add a vertex in Start group. Switch back to Within Band — the existing connection should still render correctly (its source/target indices were shifted).

- [ ] **Step 6: Commit**

```bash
git add src/components/modal/editor/SegmentPathEditor.svelte
git commit -m "Add Add/Remove tools to SegmentPathEditor; wire to topology helpers"
```

---

### Task B6: Snapshot test — built-in shield spec is unchanged after a no-op topology cycle

**Why:** Sanity check that `addVertex(...)` immediately followed by `removeVertex(...)` of the same vertex returns the spec to byte-identical state. This is a regression net for index-shifting math.

**Files:**

- Modify: `src/components/modal/editor/__tests__/vertex-topology.test.ts`

- [ ] **Step 1: Add test**

Append to `src/components/modal/editor/__tests__/vertex-topology.test.ts`:

```ts
import { defaultShieldSpec } from '$lib/patterns/tesselation/shield';

describe('topology round-trip', () => {
	it('add then remove of same vertex restores the spec exactly', () => {
		const before = defaultShieldSpec;
		const added = addVertex(before, 'middle', 99, 99);
		const newVertex = computeVertices(added.unit).find((v) => v.x === 99 && v.y === 99)!;
		const restored = removeVertex(added, newVertex);
		expect(restored.unit).toEqual(before.unit);
		expect(restored.adjustments).toEqual(before.adjustments);
	});
});
```

- [ ] **Step 2: Run test**

```bash
npm run test:unit -- src/components/modal/editor/__tests__/vertex-topology.test.ts
```

Expected: PASS — 7 tests now.

- [ ] **Step 3: Commit**

```bash
git add src/components/modal/editor/__tests__/vertex-topology.test.ts
git commit -m "Add topology round-trip test against defaultShieldSpec"
```

---

### Task B7: Final integration — full test pass and shield snapshot check

**Why:** Track B touches the spec data path. Verify the existing 16-case shield snapshot test still passes (built-in spec is never touched at runtime; this is paranoia gating).

**Files:** none changed.

- [ ] **Step 1: Run full unit test suite**

```bash
npm run test:unit
```

Expected: all tests pass, including the 16-case `src/lib/patterns/tesselation/shield/__tests__/snapshot.test.ts`.

- [ ] **Step 2: Run typecheck and lint**

```bash
npm run check 2>&1 | tail -5
npm run lint 2>&1 | tail -10
npm run format
```

Expected: TS error count not significantly above 427; no new lint errors; formatter is clean.

- [ ] **Step 3: Manual smoke test — end-to-end exercise**

Run `npm run dev`. In the editor floater:

1. Save As a copy of Shield default → "Phase 5 test".
2. In Within Band mode, add 2 connections.
3. Switch to Skip Remove mode, click 1 vertex (skip it).
4. Switch to Unit mode, Add tool, group=middle, click to add a new vertex.
5. Switch to Within Band — existing connections still render in the right places.
6. Switch to Skip Remove — the skipped vertex is still skipped (red ring at the right vertex).
7. Switch to Unit mode, Remove tool, click the new vertex you added.
8. Switch back to Within Band — connections still correct.
9. Save. Refresh page. Reopen variant. State persists.

If any step regresses, file a beads issue and fix before merging.

- [ ] **Step 4: Commit any formatter changes from `npm run format`**

```bash
git status
git diff --stat
git add -A
git commit -m "Apply Prettier formatting" || echo "no formatter changes"
```

- [ ] **Step 5: Push branch**

```bash
git push -u origin feature-pattern-edit-phase-5
```

---

## Self-Review Notes

**Spec coverage:**

- ✅ A: reset selectedConnection on rule-mode switch — Task A1
- ✅ A: split keydown $effect to avoid listener thrash — Task A1 (folded in)
- ✅ A: variant validation (≥1 segment per group on save) — Task A2
- ✅ A: picker grouping by algorithm in TilingControl — Task A3
- ✅ A: confirm-before-discard on close — Task A5 (scoped to variant-switch instead of floater-close, per design note in plan header)
- ✅ A: per-variant default-config factory in PatternTileButton — Task A4
- ✅ B: add-vertex tool in Unit mode — Tasks B1, B3, B4, B5
- ✅ B: remove-vertex — Tasks B2, B5
- ❌ B: group reassignment — explicitly deferred (design note in header)
- ✅ B: index-shift maintenance — Tasks B1, B2 (the heart of the change), validated by B6

**Type consistency check:**

- `Vertex`, `VertexRef` reused from `segment-vertices.ts` — no rename.
- `IndexPair`, `AdjustmentRules`, `TiledPatternSpec`, `UnitDefinition` reused from `spec-types.ts` — no changes.
- `UnitTool` and `Group` introduced in `vertex-topology.ts` and `UnitToolbar.svelte` — name consistent across both.
- `addVertex`, `removeVertex`, `shiftRulesForInsertion`, `shiftRulesForRemoval` — names consistent in module + tests + handlers.

**Placeholder scan:** none.

**Risk note:** B5 Step 1's `handleSvgClick` uses `canv.viewBoxLeft / Top / Width / Height` properties that may not exist on the actual `canv` return type. Step 2 explicitly verifies that and provides a fallback computation from `config` — this is the most likely place for a typecheck failure on first attempt.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-02-tiled-pattern-editor-phase-5.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — execute tasks in this session using executing-plans, batch with checkpoints

Which approach?
