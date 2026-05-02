# Tiled Pattern Editor — Phase 3: Editor Floater + Unit Mode

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a floating editor panel where users can drag-edit unit-pattern vertices for the currently-selected tile variant, save changes back to storage (or fork via Save As), and delete user variants. Adjustment-rule editing is Phase 4.

**Architecture:** A new `TileEditor.svelte` floater registers in the `patternConfigs` sidebar map. It owns local draft state (Svelte 5 runes), watches the active variant id from `$patternConfigStore.patternTypeConfig.type`, and loads the corresponding spec (built-in default from `algorithms` or user variant from `tilePatternSpecStore`). A new `SegmentPathEditor.svelte` (forked from the bezier-only `PathEditor.svelte`) renders the unit's `PathSegment[]` with draggable vertices that dedup coincident M/L pairs into single handles. CRUD passes through the existing `tilePatternSpecStore` from Phase 2. Save / Save As / Discard / Delete actions sit in a new `VariantBar.svelte` header.

**Tech Stack:** SvelteKit, Svelte 5 runes, TypeScript, the existing `Editor` / `Container` floater shell, `svelte-drag-and-drop-actions` for vertex dragging.

---

## File Structure

**Create:**
- `src/components/modal/editor/path-editor-shared.ts` — `PathEditorConfig`, `PathEditorCanvas`, `getCanvas` (extracted from `path-editor.ts`)
- `src/components/modal/editor/SegmentPathEditor.svelte` — `PathSegment[]` editor with vertex dedup
- `src/components/modal/editor/TileEditor.svelte` — top-level floater
- `src/components/modal/editor/tile-editor/VariantBar.svelte` — name input + dropdown + Save / Save As / Discard / Delete buttons
- `src/components/modal/editor/tile-editor/__tests__/segment-vertex-dedup.test.ts` — unit test for the vertex-dedup helper

**Modify:**
- `src/components/modal/editor/path-editor.ts` — re-export from `path-editor-shared.ts`; existing `PathEditor.svelte` continues to import from here (no behavior change for current consumers)
- `src/components/modal/sidebar-definitions.ts` — register `TileEditor` in `patternConfigs`

**No changes to runtime dispatch paths** — Phase 2's storage and registry plumbing handle everything the editor needs.

---

## Important note on draft state

Draft state lives **inside the `TileEditor` component** as Svelte 5 `$state` runes — not in a separate store. Reasons:
- The draft is only meaningful while the floater is open.
- The persistent state (saved variants) already lives in `tilePatternSpecStore`.
- Component-local state avoids needing to clean up a global store on close.

When `Save` is clicked, the draft is committed via `tilePatternSpecStore.update`. `Save As` calls `.create`. `Delete` calls `.remove`. `Discard` reloads from the source spec (built-in default or stored variant).

---

### Task 1: Extract path-editor-shared.ts

Pull the generic canvas/viewbox math out of `path-editor.ts` so `SegmentPathEditor` can depend on it without pulling in bezier-specific code.

**Files:**
- Create: `src/components/modal/editor/path-editor-shared.ts`
- Modify: `src/components/modal/editor/path-editor.ts`

- [x] **Step 1: Create the shared file**

Create `src/components/modal/editor/path-editor-shared.ts` with this content (use **tabs**):

```ts
export type PathEditorConfig = {
	padding: number;
	gutter: number;
	contentBounds: { top: number; left: number; width: number; height: number };
	size: { width: number; height: number };
};

export type PathEditorCanvas = {
	viewBox: string;
	viewBoxData: { top: number; left: number; width: number; height: number };
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	scale: number;
};

export const getCanvas = (pathEditorConfig: PathEditorConfig): PathEditorCanvas => {
	const { contentBounds, padding, gutter } = pathEditorConfig;
	const { top, left, width, height } = contentBounds;
	const minX = left - padding - gutter;
	const minY = top - padding - gutter;
	const maxX = left + width + padding + gutter * 2;
	const maxY = top + height + padding + gutter * 2;
	const viewBoxData = {
		top: top - padding,
		left: left - padding,
		width: width + padding * 2,
		height: height + padding * 2
	};
	const viewBox = `${viewBoxData.left} ${viewBoxData.top} ${viewBoxData.width} ${viewBoxData.height}`;
	const scale = (width + padding * 2) / pathEditorConfig.size.width;

	return { viewBox, viewBoxData, minX, minY, maxX, maxY, scale };
};
```

- [x] **Step 2: Re-export from path-editor.ts**

Edit `src/components/modal/editor/path-editor.ts`. At the top of the file, find the existing definitions of `PathEditorConfig`, `PathEditorCanvas`, and `getCanvas` (they currently live in this file).

Replace those three definitions with re-exports:

```ts
export type { PathEditorConfig, PathEditorCanvas } from './path-editor-shared';
export { getCanvas } from './path-editor-shared';
```

Keep all other exports in `path-editor.ts` (`LimitedPoint`, `LimitedBezierConfig`, `flattenPolygon`, `getPolygonPaths`, the limit functions, `addControlPoint`, `insertPoint`, etc.). Those are bezier-specific and stay.

- [x] **Step 3: Type-check + tests**

```bash
npm run check 2>&1 | tail -3
npm run test:unit 2>&1 | tail -5
```

Expected: error count stable (~427); 29/29 tests pass.

- [x] **Step 4: Commit**

```bash
git add src/components/modal/editor/path-editor-shared.ts src/components/modal/editor/path-editor.ts
git commit -m "Extract path-editor-shared.ts with generic canvas helpers"
git push
```

---

### Task 2: Vertex dedup helper + unit test

The core piece of the segment editor is grouping coincident M/L segments into shared "vertices" so a drag handle moves both segments at once. Build this as a pure function with a unit test before wiring it into the component.

**Files:**
- Create: `src/components/modal/editor/segment-vertices.ts`
- Create: `src/components/modal/editor/__tests__/segment-vertices.test.ts`

- [x] **Step 1: Write the failing test**

Create `src/components/modal/editor/__tests__/segment-vertices.test.ts`:

```ts
import { computeVertices } from '../segment-vertices';
import type { UnitDefinition } from '$lib/patterns/spec-types';

const makeUnit = (overrides: Partial<UnitDefinition> = {}): UnitDefinition => ({
	width: 42,
	height: 14,
	start: [],
	middle: [],
	end: [],
	...overrides
});

describe('computeVertices', () => {
	it('returns one vertex per unique (x, y) coordinate', () => {
		const unit = makeUnit({
			start: [
				['M', 0, 0],
				['L', 10, 2],
				['M', 10, 2],
				['L', 14, 0]
			]
		});
		const vertices = computeVertices(unit);
		expect(vertices).toHaveLength(3);
		expect(vertices[0]).toEqual({
			x: 0,
			y: 0,
			refs: [{ group: 'start', index: 0 }]
		});
		expect(vertices[1]).toEqual({
			x: 10,
			y: 2,
			refs: [
				{ group: 'start', index: 1 },
				{ group: 'start', index: 2 }
			]
		});
		expect(vertices[2]).toEqual({
			x: 14,
			y: 0,
			refs: [{ group: 'start', index: 3 }]
		});
	});

	it('groups coincident segments across start / middle / end', () => {
		const unit = makeUnit({
			start: [['M', 0, 0]],
			middle: [['L', 0, 0]],
			end: [['M', 0, 0]]
		});
		const vertices = computeVertices(unit);
		expect(vertices).toHaveLength(1);
		expect(vertices[0].refs).toEqual([
			{ group: 'start', index: 0 },
			{ group: 'middle', index: 0 },
			{ group: 'end', index: 0 }
		]);
	});

	it('treats Z and arc/bezier segments as ignored (not editable in v1)', () => {
		const unit = makeUnit({
			start: [
				['M', 0, 0],
				['Z']
			],
			middle: [['C', 1, 1, 2, 2, 3, 3]]
		});
		const vertices = computeVertices(unit);
		expect(vertices).toHaveLength(1);
		expect(vertices[0]).toEqual({
			x: 0,
			y: 0,
			refs: [{ group: 'start', index: 0 }]
		});
	});

	it('handles an empty unit', () => {
		const vertices = computeVertices(makeUnit());
		expect(vertices).toHaveLength(0);
	});
});
```

- [x] **Step 2: Run test to verify it fails**

```bash
npm run test:unit -- src/components/modal/editor/__tests__/segment-vertices.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../segment-vertices'`.

- [x] **Step 3: Create the implementation**

Create `src/components/modal/editor/segment-vertices.ts`:

```ts
import type { UnitDefinition } from '$lib/patterns/spec-types';
import { isLinePathSegment, isMovePathSegment } from '$lib/types';
import type { PathSegment } from '$lib/types';

export type VertexRef = {
	group: 'start' | 'middle' | 'end';
	index: number;
};

export type Vertex = {
	x: number;
	y: number;
	refs: VertexRef[];
};

const groups: VertexRef['group'][] = ['start', 'middle', 'end'];

export const computeVertices = (unit: UnitDefinition): Vertex[] => {
	const byKey = new Map<string, Vertex>();
	for (const group of groups) {
		const segments: PathSegment[] = unit[group];
		for (let i = 0; i < segments.length; i++) {
			const seg = segments[i];
			if (!isMovePathSegment(seg) && !isLinePathSegment(seg)) continue;
			const x = seg[1];
			const y = seg[2];
			const key = `${x}::${y}`;
			const existing = byKey.get(key);
			if (existing) {
				existing.refs.push({ group, index: i });
			} else {
				byKey.set(key, { x, y, refs: [{ group, index: i }] });
			}
		}
	}
	return Array.from(byKey.values());
};

export const updateUnitForVertexMove = (
	unit: UnitDefinition,
	vertex: Vertex,
	newX: number,
	newY: number
): UnitDefinition => {
	const next: UnitDefinition = {
		width: unit.width,
		height: unit.height,
		start: [...unit.start],
		middle: [...unit.middle],
		end: [...unit.end]
	};
	for (const ref of vertex.refs) {
		const seg = next[ref.group][ref.index];
		if (!isMovePathSegment(seg) && !isLinePathSegment(seg)) continue;
		next[ref.group] = [...next[ref.group]];
		next[ref.group][ref.index] = [seg[0], newX, newY];
	}
	return next;
};
```

- [x] **Step 4: Run test to verify it passes**

```bash
npm run test:unit -- src/components/modal/editor/__tests__/segment-vertices.test.ts 2>&1 | tail -10
```

Expected: PASS for all 4 cases.

- [x] **Step 5: Run full test suite**

```bash
npm run test:unit 2>&1 | tail -5
```

Expected: 33/33 pass (29 previous + 4 new).

- [x] **Step 6: Commit**

```bash
git add src/components/modal/editor/segment-vertices.ts src/components/modal/editor/__tests__/segment-vertices.test.ts
git commit -m "Add vertex dedup helper for segment-based path editing"
git push
```

---

### Task 3: SegmentPathEditor component

A drop-in component that takes a `UnitDefinition` and emits a new one when vertices are dragged.

**Files:**
- Create: `src/components/modal/editor/SegmentPathEditor.svelte`

- [x] **Step 1: Inspect DraggablePoint to understand the existing drag pattern**

```bash
cat src/components/modal/editor/DraggablePoint.svelte
```

You'll see it accepts `{ config, canv, point, handleDrag, handleDragEnd, ... }` props and uses `asDraggable` from `svelte-drag-and-drop-actions`. We'll reuse this component verbatim — just bind it to vertices instead of bezier control points.

- [x] **Step 2: Create the component**

Create `src/components/modal/editor/SegmentPathEditor.svelte` (use **tabs**):

```svelte
<script lang="ts">
	import type { UnitDefinition } from '$lib/patterns/spec-types';
	import type { PathSegment } from '$lib/types';
	import { svgPathStringFromSegments } from '$lib/patterns/utils';
	import { getCanvas, type PathEditorConfig } from './path-editor-shared';
	import { computeVertices, updateUnitForVertexMove, type Vertex } from './segment-vertices';
	import DraggablePoint from './DraggablePoint.svelte';

	let {
		unit,
		config,
		onChangeUnit
	}: {
		unit: UnitDefinition;
		config: PathEditorConfig;
		onChangeUnit: (unit: UnitDefinition) => void;
	} = $props();

	const canv = $derived(getCanvas(config));
	const vertices = $derived(computeVertices(unit));
	const allSegments = $derived<PathSegment[]>([...unit.start, ...unit.middle, ...unit.end]);
	const pathString = $derived(svgPathStringFromSegments(allSegments));

	const handleDrag = (vertex: Vertex, newX: number, newY: number) => {
		const scaledX = newX * canv.scale;
		const scaledY = newY * canv.scale;
		onChangeUnit(updateUnitForVertexMove(unit, vertex, scaledX, scaledY));
	};

	const handleDragEnd = () => {
		// Caller can persist on drag end if it batches; for now updates flow on every drag tick
	};
</script>

<div class="container">
	<svg width={config.size.width} height={config.size.height} viewBox={canv.viewBox} class="canvas">
		<rect x="0" y="0" width={unit.width} height={unit.height} class="unit-bounds" />
		<path d={pathString} class="segments" />
	</svg>
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
</div>

<style>
	.container {
		border: 1px dotted black;
		padding: 0;
		position: relative;
	}
	.canvas {
		background-color: beige;
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
</style>
```

- [x] **Step 3: Type-check**

```bash
npm run check 2>&1 | tail -3
```

Expected: error count stable. If new errors appear about `DraggablePoint` props or `PointConfig2`, inspect `src/components/modal/editor/DraggablePoint.svelte` for the exact prop shape and adjust (the prop names in the snippet match the existing PathEditor.svelte usage).

- [x] **Step 4: Run tests**

```bash
npm run test:unit 2>&1 | tail -5
```

Expected: 33/33 pass.

- [x] **Step 5: Commit**

```bash
git add src/components/modal/editor/SegmentPathEditor.svelte
git commit -m "Add SegmentPathEditor for PathSegment[] vertex editing"
git push
```

---

### Task 4: VariantBar component

The header strip with name input, variant dropdown, and Save / Save As / Discard / Delete buttons.

**Files:**
- Create: `src/components/modal/editor/tile-editor/VariantBar.svelte`

- [ ] **Step 1: Create the directory and component**

```bash
mkdir -p src/components/modal/editor/tile-editor
```

Create `src/components/modal/editor/tile-editor/VariantBar.svelte` (use **tabs**):

```svelte
<script lang="ts">
	import type { TiledPatternSpec } from '$lib/patterns/spec-types';
	import { algorithms } from '$lib/patterns/pattern-registry';

	let {
		draft,
		isDirty,
		isBuiltIn,
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
		availableVariants: TiledPatternSpec[];
		onSelectVariant: (variantId: string) => void;
		onSave: () => void;
		onSaveAs: (newName: string) => void;
		onDiscard: () => void;
		onDelete: () => void;
	} = $props();

	let saveAsName = $state('');
	let showSaveAsField = $state(false);

	const handleSaveAsClick = () => {
		if (!showSaveAsField) {
			saveAsName = draft ? `${draft.name} (copy)` : 'New variant';
			showSaveAsField = true;
			return;
		}
		if (saveAsName.trim().length === 0) return;
		onSaveAs(saveAsName.trim());
		showSaveAsField = false;
		saveAsName = '';
	};

	const handleSaveAsCancel = () => {
		showSaveAsField = false;
		saveAsName = '';
	};

	const builtInIds = $derived(new Set(algorithms.map((a) => a.defaultSpec.id)));
	const dropdownEntries = $derived([
		...algorithms.map((a) => a.defaultSpec),
		...availableVariants.filter((v) => !builtInIds.has(v.id))
	]);
</script>

<div class="variant-bar">
	<div class="row">
		<select
			value={draft?.id ?? ''}
			onchange={(e) => onSelectVariant((e.target as HTMLSelectElement).value)}
		>
			{#each dropdownEntries as variant}
				<option value={variant.id}>{variant.name}</option>
			{/each}
		</select>
		<button onclick={onSave} disabled={isBuiltIn || !isDirty}>Save</button>
		<button onclick={handleSaveAsClick} disabled={!draft}>Save As…</button>
		<button onclick={onDiscard} disabled={!isDirty}>Discard</button>
		<button onclick={onDelete} disabled={isBuiltIn || !draft}>Delete</button>
		{#if isDirty}
			<span class="dirty">●</span>
		{/if}
	</div>
	{#if showSaveAsField}
		<div class="row">
			<input bind:value={saveAsName} placeholder="Variant name" />
			<button onclick={handleSaveAsClick} disabled={saveAsName.trim().length === 0}>Confirm</button>
			<button onclick={handleSaveAsCancel}>Cancel</button>
		</div>
	{/if}
	{#if draft}
		<div class="row meta">
			<span class="label">id:</span>
			<code>{draft.id}</code>
			<span class="label">algorithm:</span>
			<code>{draft.algorithm}</code>
		</div>
	{/if}
</div>

<style>
	.variant-bar {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 6px;
		border-bottom: 1px dotted black;
	}
	.row {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.dirty {
		color: red;
		font-weight: bold;
	}
	.label {
		color: rgba(0, 0, 0, 0.5);
	}
	.meta code {
		font-size: 0.85em;
	}
</style>
```

- [ ] **Step 2: Type-check**

```bash
npm run check 2>&1 | tail -3
```

- [ ] **Step 3: Commit**

```bash
git add src/components/modal/editor/tile-editor/VariantBar.svelte
git commit -m "Add VariantBar with Save/Save As/Discard/Delete actions"
git push
```

---

### Task 5: TileEditor floater orchestrator

The top-level component that ties everything together. Owns the draft state, watches the active variant id, and wires CRUD through `tilePatternSpecStore`.

**Files:**
- Create: `src/components/modal/editor/TileEditor.svelte`

- [ ] **Step 1: Create the component**

Create `src/components/modal/editor/TileEditor.svelte` (use **tabs**):

```svelte
<script lang="ts">
	import { patternConfigStore } from '$lib/stores';
	import { tilePatternSpecStore } from '$lib/stores/tilePatternSpecStore';
	import { algorithms } from '$lib/patterns/pattern-registry';
	import type { TiledPatternSpec, UnitDefinition } from '$lib/patterns/spec-types';
	import Editor from './Editor.svelte';
	import Container from './Container.svelte';
	import SegmentPathEditor from './SegmentPathEditor.svelte';
	import VariantBar from './tile-editor/VariantBar.svelte';
	import type { PathEditorConfig } from './path-editor-shared';

	let draft: TiledPatternSpec | null = $state(null);
	let storedRowId: number | null = $state(null);
	let isBuiltIn: boolean = $state(false);
	let isDirty: boolean = $state(false);

	const activeVariantId = $derived($patternConfigStore.patternTypeConfig?.type ?? '');
	const variantList = $derived($tilePatternSpecStore.variants);

	const findSpec = (
		variantId: string
	): { spec: TiledPatternSpec; rowId: number | null; builtIn: boolean } | null => {
		const builtIn = algorithms.find((a) => a.defaultSpec.id === variantId);
		if (builtIn) return { spec: builtIn.defaultSpec, rowId: null, builtIn: true };
		const stored = variantList.find((v) => v.id === variantId);
		if (stored) {
			const { rowId, ...specOnly } = stored;
			return {
				spec: specOnly as TiledPatternSpec,
				rowId,
				builtIn: false
			};
		}
		return null;
	};

	$effect(() => {
		const found = findSpec(activeVariantId);
		if (!found) {
			draft = null;
			storedRowId = null;
			isBuiltIn = false;
			isDirty = false;
			return;
		}
		if (isDirty && draft && draft.id === found.spec.id) {
			// Don't clobber unsaved edits when an unrelated reactive update fires
			return;
		}
		draft = structuredClone(found.spec);
		storedRowId = found.rowId;
		isBuiltIn = found.builtIn;
		isDirty = false;
	});

	const handleUnitChange = (newUnit: UnitDefinition) => {
		if (!draft) return;
		draft = { ...draft, unit: newUnit };
		isDirty = true;
	};

	const handleSave = async () => {
		if (!draft || isBuiltIn || storedRowId === null) return;
		const ok = await tilePatternSpecStore.update(storedRowId, draft);
		if (ok) isDirty = false;
	};

	const handleSaveAs = async (newName: string) => {
		if (!draft) return;
		const newSpec: TiledPatternSpec = {
			...draft,
			id: crypto.randomUUID(),
			name: newName,
			builtIn: false
		};
		const variant = await tilePatternSpecStore.create(newSpec);
		if (!variant) return;
		patternConfigStore.update((s) => ({
			...s,
			patternTypeConfig: { ...s.patternTypeConfig, type: variant.id }
		}));
	};

	const handleDiscard = () => {
		const found = findSpec(activeVariantId);
		if (!found) return;
		draft = structuredClone(found.spec);
		storedRowId = found.rowId;
		isBuiltIn = found.builtIn;
		isDirty = false;
	};

	const handleDelete = async () => {
		if (!draft || isBuiltIn || storedRowId === null) return;
		const ok = await tilePatternSpecStore.remove(storedRowId);
		if (!ok) return;
		const fallbackId = algorithms[0]?.defaultSpec.id ?? '';
		patternConfigStore.update((s) => ({
			...s,
			patternTypeConfig: { ...s.patternTypeConfig, type: fallbackId }
		}));
	};

	const handleSelectVariant = (variantId: string) => {
		patternConfigStore.update((s) => ({
			...s,
			patternTypeConfig: { ...s.patternTypeConfig, type: variantId }
		}));
	};

	const editorConfig: PathEditorConfig = $derived({
		padding: 4,
		gutter: 0,
		contentBounds: {
			top: -2,
			left: -2,
			width: (draft?.unit.width ?? 42) + 4,
			height: (draft?.unit.height ?? 14) + 4
		},
		size: { width: 600, height: 220 }
	});
</script>

<Editor>
	<section>
		<header>Tile Editor</header>
		<Container direction="column">
			<VariantBar
				{draft}
				{isDirty}
				{isBuiltIn}
				availableVariants={variantList}
				onSelectVariant={handleSelectVariant}
				onSave={handleSave}
				onSaveAs={handleSaveAs}
				onDiscard={handleDiscard}
				onDelete={handleDelete}
			/>
			{#if draft}
				<div class="viewport-wrap">
					<SegmentPathEditor
						unit={draft.unit}
						config={editorConfig}
						onChangeUnit={handleUnitChange}
					/>
				</div>
			{:else}
				<div class="empty">No variant selected.</div>
			{/if}
		</Container>
	</section>
</Editor>

<style>
	.viewport-wrap {
		padding: 8px;
	}
	.empty {
		padding: 16px;
		color: rgba(0, 0, 0, 0.5);
	}
</style>
```

- [ ] **Step 2: Type-check**

```bash
npm run check 2>&1 | tail -3
```

Expected: error count stable. Two new errors related to `PointConfig2` shape or `Editor`/`Container` are acceptable if they echo pre-existing patterns (those components have loose props). Major new error counts > 5 mean something is wrong.

- [ ] **Step 3: Run tests**

```bash
npm run test:unit 2>&1 | tail -5
```

Expected: 33/33 pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/modal/editor/TileEditor.svelte
git commit -m "Add TileEditor floater with Unit mode editing and CRUD wiring"
git push
```

---

### Task 6: Register TileEditor floater

**Files:**
- Modify: `src/components/modal/sidebar-definitions.ts`

- [ ] **Step 1: Read the current file**

```bash
cat src/components/modal/sidebar-definitions.ts
```

You'll see `patternConfigs: SidebarDefinition` is a `Map` containing entries for `'Pattern'` and `'Pattern Scale'`.

- [ ] **Step 2: Add the import**

In `src/components/modal/sidebar-definitions.ts`, add to the imports near the top:

```ts
import TileEditor from './editor/TileEditor.svelte';
```

- [ ] **Step 3: Register the floater**

In the `patternConfigs` map literal, add a new entry between the existing entries:

```ts
export const patternConfigs: SidebarDefinition = new Map([
	[
		'Pattern',
		{
			shortTitle: 'PV',
			title: 'Pattern View',
			content: PatternView
		}
	],
	[
		'Pattern Scale',
		{
			shortTitle: 'PS',
			title: 'Pattern Scale',
			content: PatternScale
		}
	],
	[
		'Tile Editor',
		{
			shortTitle: 'TE',
			title: 'Tile Editor',
			content: TileEditor
		}
	]
]);
```

- [ ] **Step 4: Type-check**

```bash
npm run check 2>&1 | tail -3
```

- [ ] **Step 5: Commit**

```bash
git add src/components/modal/sidebar-definitions.ts
git commit -m "Register Tile Editor floater in patternConfigs"
git push
```

---

### Task 7: End-to-end verification

- [ ] **Step 1: Run full test suite**

```bash
npm run test:unit 2>&1 | tail -5
```

Expected: 33/33 pass.

- [ ] **Step 2: Type-check**

```bash
npm run check 2>&1 | tail -3
```

Expected: error count stable (~427).

- [ ] **Step 3: Manual smoke test**

```bash
npm run dev
```

In the browser, on `/designer2`:

1. Open the sidebar and click `TE` (Tile Editor floater opens).
2. Confirm the shield default's unit pattern renders in the SVG viewport with the unit-boundary rectangle visible.
3. Drag a vertex — confirm the path updates live in the editor's viewport, the dirty indicator appears, and `Save` becomes enabled (but only if a non-built-in variant is selected; for the default it should remain disabled).
4. Click `Save As…`, enter a name like "Shield – test", click Confirm. Confirm:
   - The variant appears in the dropdown.
   - The picker (TilingControl) now shows the new variant.
   - The pattern config switches to it.
   - The dirty indicator clears.
5. Drag another vertex on the now-saved variant. Click `Save`. Confirm changes persist (refresh the page; the modified variant should still load with the edits).
6. Click `Discard` after another edit. Confirm the editor reverts to the last-saved state.
7. Click `Delete`. Confirm the variant is removed from the dropdown and the picker, and the pattern config falls back to the shield default.

If any step fails, file a bead and stop — investigation needed.

- [ ] **Step 4: Stop dev server**

- [ ] **Step 5: Update plan checkboxes + commit**

Edit `docs/superpowers/plans/2026-05-02-tiled-pattern-editor-phase-3.md`. Mark Task 7's steps `[x]` (Step 3 manual smoke marked only after performing).

```bash
git add docs/superpowers/plans/2026-05-02-tiled-pattern-editor-phase-3.md
git commit -m "Mark Phase 3 verification complete"
git push
```

---

## What's NOT in Phase 3 (deferred to Phase 4)

- Adjustment-rule editing modes: `Within Band`, `Across Bands`, `Partner Start`, `Partner End`, `Skip Remove`.
- `AdjacencyGhost.svelte` (translucent neighbor unit overlays).
- `RuleList.svelte` sidebar with click-to-highlight.
- Drag-line interaction for creating / deleting adjustment rules.
- Add / remove vertex tools in Unit mode.
- Group reassignment (move a segment from `start` to `middle`, etc.).
- Variant validation (structural minimum: at least 1 segment per group).
- Visual grouping of variants by algorithm in the picker.
- Confirm-before-discard on close-with-unsaved-edits.
- Concurrency safety (multi-tab editing of the same variant).

## Risk register

| Risk | Mitigation |
|---|---|
| `DraggablePoint` is bezier-shaped (expects `curveIndex`/`pointIndex`) and may not cleanly accept arbitrary vertex props | Task 3 inspects the existing component's prop shape first; if mismatch, adjust the SegmentPathEditor's call site or add a thin wrapper |
| `$effect` reload of draft when active variant id changes could clobber unsaved edits | Task 5's effect short-circuits when `isDirty && draft.id === found.spec.id` — a switch to a different variant still drops the draft (acceptable for v1; document in the deferred list) |
| Save As mints a UUID via `crypto.randomUUID()` — older browser support varies | All current evergreen browsers support it; failing back is out of v1 scope |
| Patterns map mutation lag: a Save As writes to storage, registers in patterns map, then switches the project's `type` to the new id — if the order races, the picker flashes "missing pattern" | `tilePatternSpecStore.create()` registers synchronously after the API resolves and BEFORE the patternConfigStore update — the order is sequential |
| Editor opens on `+layout.svelte` mount; `tilePatternSpecStore.hydrate()` is also called on mount; if hydration is slow, the dropdown may render with only built-ins for a tick | The dropdown is reactive — it re-renders when variants load. First-render flicker is acceptable; can move hydration into `+layout.ts`'s `load` for SSR-friendly behavior in a follow-up |
| Editing the unit doesn't trigger a re-tile of the main 3D / SVG view (per Phase 3 spec — "Save → main view re-renders") | Working as designed. The patternConfigStore update on Save As / Delete triggers re-tile via the existing reactive chain. Save (in-place update) re-renders because `tilePatternSpecStore.variants` is reactive and pattern dispatch resolves through `patterns[id]` which now points to the updated entry. Verify in Step 3.3 of Task 7. |
