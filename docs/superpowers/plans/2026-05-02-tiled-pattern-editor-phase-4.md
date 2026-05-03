# Tiled Pattern Editor — Phase 4: Adjustment-Rule Editing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four adjacency-aware editing modes (`Within Band`, `Across Bands`, `Partner Start`, `Partner End`) that show a translucent ghost neighbor unit and let the user click-pair vertices to create / delete adjustment rules, plus a `Skip Remove` mode that toggles vertices into / out of `spec.adjustments.skipRemove`. A `RuleList` sidebar mirrors viewport state.

**Architecture:** TileEditor gains a `mode` rune and a `ModeBar` UI. For `unit` mode, the existing `SegmentPathEditor` continues to render. For the four rule modes, a new `RuleEditViewport` renders the main unit + a transformed ghost + connection lines for existing rules. For `skipRemove`, a new `SkipRemoveViewport` renders the main unit with red-ring overlays on toggled vertices. Vertex interaction is plain SVG `<circle>` click handlers (not `DraggablePoint`) since there's no drag in non-Unit modes. A shared helper module (`vertex-addressing.ts`) maps between `Vertex` objects and the flat-segment indices used in `IndexPair[]`.

**Tech Stack:** SvelteKit, Svelte 5 runes, TypeScript. SVG transforms for ghost placement (`<g transform="...">`).

---

## File Structure

**Create:**
- `src/components/modal/editor/vertex-addressing.ts` — `flatIndex(unit, ref)`, `flatIndexes(unit, vertex)`, `findVertexByFlatIndex`, `computeConnections`, `addRuleForPairing`, `removeRulesForPairing`
- `src/components/modal/editor/__tests__/vertex-addressing.test.ts` — TDD tests for the helpers
- `src/components/modal/editor/tile-editor/ModeBar.svelte` — mode toggle button row
- `src/components/modal/editor/tile-editor/RuleEditViewport.svelte` — viewport for the four rule modes
- `src/components/modal/editor/tile-editor/SkipRemoveViewport.svelte` — viewport for skipRemove mode
- `src/components/modal/editor/tile-editor/RuleList.svelte` — sidebar list of rules for the current mode
- `src/components/modal/editor/tile-editor/editor-mode.ts` — `EditorMode` type, `ruleModes` const, `ghostTransform(mode, unit, point)`, `ghostSvgTransform(mode, unit)`

**Modify:**
- `src/components/modal/editor/TileEditor.svelte` — add `mode` rune, `selectedTarget` rune, render branch on mode, add rule-mutation handlers, integrate ModeBar + RuleList

---

## Important: rule semantics

The existing adjuster code defines:

```ts
replaceInPlace({ pairs, target: currentFacet.path, source: nextOrPrevOrPartner.path });
// then: target[pair.target] = source[pair.source].position
```

So in the visualization:

| Field | Meaning | UI side |
|---|---|---|
| `pair.target` | flat index in main unit (this facet) — the vertex whose position gets overwritten | **main** |
| `pair.source` | flat index in same flat space, addressing the neighbor's path — the vertex providing the position | **ghost** |

User flow:
1. Click a vertex in the **main** unit → `selectedTarget = vertex`.
2. Click a vertex in the **ghost** → creates rule(s): `{ source: ghostVertexFlatIdx, target: selectedTargetFlatIdx }`. Reset `selectedTarget`.

For **coincident-vertex pairs** (M+L at the same coord, e.g., shield's vertex at index 1+2): clicking that vertex represents *all* its refs. Pairing two coincident vertices generates `min(refs.length)` rule entries, matching refs by index order.

**Connection lines**: rules with the same `(sourceVertex, targetVertex)` collapse to one visible connection line; deleting that line removes all matching rules.

---

### Task 1: EditorMode types + ghost transforms + tests

**Files:**
- Create: `src/components/modal/editor/tile-editor/editor-mode.ts`
- Create: `src/components/modal/editor/__tests__/editor-mode.test.ts`

- [x] **Step 1: Write the failing test**

Create `src/components/modal/editor/__tests__/editor-mode.test.ts`:

```ts
import { ghostTransform } from '../tile-editor/editor-mode';

describe('ghostTransform', () => {
	const unit = { width: 42, height: 14, start: [], middle: [], end: [] };

	it('translates +unit.width for withinBand', () => {
		expect(ghostTransform('withinBand', unit, { x: 10, y: 2 })).toEqual({ x: 52, y: 2 });
	});

	it('translates -unit.height for acrossBands', () => {
		expect(ghostTransform('acrossBands', unit, { x: 10, y: 2 })).toEqual({ x: 10, y: -12 });
	});

	it('mirrors across x=0 for partnerStart', () => {
		expect(ghostTransform('partnerStart', unit, { x: 10, y: 2 })).toEqual({ x: -10, y: 2 });
	});

	it('mirrors across x=unit.width for partnerEnd', () => {
		expect(ghostTransform('partnerEnd', unit, { x: 10, y: 2 })).toEqual({ x: 74, y: 2 });
	});
});
```

- [x] **Step 2: Run test to verify it fails**

```bash
npm run test:unit -- src/components/modal/editor/__tests__/editor-mode.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../tile-editor/editor-mode'`.

- [x] **Step 3: Implement**

Create `src/components/modal/editor/tile-editor/editor-mode.ts` (use **tabs**):

```ts
import type { UnitDefinition } from '$lib/patterns/spec-types';

export type EditorMode =
	| 'unit'
	| 'withinBand'
	| 'acrossBands'
	| 'partnerStart'
	| 'partnerEnd'
	| 'skipRemove';

export const ruleModes: EditorMode[] = ['withinBand', 'acrossBands', 'partnerStart', 'partnerEnd'];

export const isRuleMode = (mode: EditorMode): boolean =>
	(ruleModes as EditorMode[]).includes(mode);

export type Point = { x: number; y: number };

export const ghostTransform = (mode: EditorMode, unit: UnitDefinition, p: Point): Point => {
	switch (mode) {
		case 'withinBand':
			return { x: p.x + unit.width, y: p.y };
		case 'acrossBands':
			return { x: p.x, y: p.y - unit.height };
		case 'partnerStart':
			return { x: -p.x, y: p.y };
		case 'partnerEnd':
			return { x: 2 * unit.width - p.x, y: p.y };
		default:
			return p;
	}
};

export const ghostSvgTransform = (mode: EditorMode, unit: UnitDefinition): string => {
	switch (mode) {
		case 'withinBand':
			return `translate(${unit.width}, 0)`;
		case 'acrossBands':
			return `translate(0, ${-unit.height})`;
		case 'partnerStart':
			return `scale(-1, 1)`;
		case 'partnerEnd':
			return `translate(${2 * unit.width}, 0) scale(-1, 1)`;
		default:
			return '';
	}
};

export const ruleArrayKey: Record<
	'withinBand' | 'acrossBands' | 'partnerStart' | 'partnerEnd',
	'withinBand' | 'acrossBands' | 'partner.startEnd' | 'partner.endEnd'
> = {
	withinBand: 'withinBand',
	acrossBands: 'acrossBands',
	partnerStart: 'partner.startEnd',
	partnerEnd: 'partner.endEnd'
};
```

- [x] **Step 4: Run test to verify it passes**

```bash
npm run test:unit -- src/components/modal/editor/__tests__/editor-mode.test.ts 2>&1 | tail -10
```

Expected: PASS for all 4 cases.

- [x] **Step 5: Run full test suite**

```bash
npm run test:unit 2>&1 | tail -5
```

Expected: 37/37 pass (33 previous + 4 new).

- [x] **Step 6: Commit**

```bash
git add src/components/modal/editor/tile-editor/editor-mode.ts src/components/modal/editor/__tests__/editor-mode.test.ts
git commit -m "Add EditorMode types and ghost transforms with tests"
git push
```

---

### Task 2: Vertex addressing helpers + tests

These map between the `Vertex` objects (one per unique x,y) and the flat segment indices used in `IndexPair[]`. Plus connection grouping.

**Files:**
- Create: `src/components/modal/editor/vertex-addressing.ts`
- Create: `src/components/modal/editor/__tests__/vertex-addressing.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/modal/editor/__tests__/vertex-addressing.test.ts`:

```ts
import {
	flatIndex,
	flatIndexes,
	findVertexByFlatIndex,
	computeConnections,
	addRuleForPairing,
	removeRulesForPairing
} from '../vertex-addressing';
import { computeVertices } from '../segment-vertices';
import type { UnitDefinition } from '$lib/patterns/spec-types';
import type { IndexPair } from '$lib/patterns/spec-types';

const makeUnit = (overrides: Partial<UnitDefinition> = {}): UnitDefinition => ({
	width: 42,
	height: 14,
	start: [],
	middle: [],
	end: [],
	...overrides
});

describe('flatIndex', () => {
	const unit = makeUnit({
		start: [['M', 0, 0], ['L', 1, 1]], // length 2
		middle: [['M', 2, 2], ['L', 3, 3], ['M', 4, 4]], // length 3
		end: [['L', 5, 5]] // length 1
	});

	it('returns ref.index for start group', () => {
		expect(flatIndex(unit, { group: 'start', index: 0 })).toBe(0);
		expect(flatIndex(unit, { group: 'start', index: 1 })).toBe(1);
	});

	it('offsets by start.length for middle group', () => {
		expect(flatIndex(unit, { group: 'middle', index: 0 })).toBe(2);
		expect(flatIndex(unit, { group: 'middle', index: 2 })).toBe(4);
	});

	it('offsets by start.length + middle.length for end group', () => {
		expect(flatIndex(unit, { group: 'end', index: 0 })).toBe(5);
	});
});

describe('flatIndexes', () => {
	it('maps each ref to its flat index', () => {
		const unit = makeUnit({
			start: [['M', 0, 0], ['L', 0, 0]]
		});
		const vertices = computeVertices(unit);
		expect(flatIndexes(unit, vertices[0])).toEqual([0, 1]);
	});
});

describe('findVertexByFlatIndex', () => {
	const unit = makeUnit({
		start: [['M', 0, 0], ['L', 1, 1], ['M', 1, 1]]
	});
	const vertices = computeVertices(unit);

	it('finds vertex containing the flat index', () => {
		const v0 = findVertexByFlatIndex(unit, vertices, 0);
		expect(v0?.x).toBe(0);

		const v1 = findVertexByFlatIndex(unit, vertices, 1);
		expect(v1?.x).toBe(1);

		const v2 = findVertexByFlatIndex(unit, vertices, 2);
		expect(v2?.x).toBe(1);
	});

	it('returns undefined for out-of-range index', () => {
		expect(findVertexByFlatIndex(unit, vertices, 99)).toBeUndefined();
	});
});

describe('computeConnections', () => {
	it('groups rules by (sourceVertex, targetVertex)', () => {
		const unit = makeUnit({
			start: [['M', 0, 0], ['L', 0, 0], ['M', 5, 5], ['L', 5, 5]]
		});
		const vertices = computeVertices(unit);
		const rules: IndexPair[] = [
			{ source: 2, target: 0 }, // (5,5) → (0,0)
			{ source: 3, target: 1 } // (5,5) → (0,0) — same vertices as previous
		];
		const connections = computeConnections(rules, unit, vertices);
		expect(connections).toHaveLength(1);
		expect(connections[0].sourceVertex.x).toBe(5);
		expect(connections[0].targetVertex.x).toBe(0);
		expect(connections[0].rules).toEqual(rules);
	});
});

describe('addRuleForPairing', () => {
	it('appends one rule per matched ref pair', () => {
		const unit = makeUnit({
			start: [['M', 0, 0], ['L', 0, 0], ['M', 5, 5], ['L', 5, 5]]
		});
		const vertices = computeVertices(unit);
		const targetVertex = vertices.find((v) => v.x === 0)!; // refs [0, 1]
		const sourceVertex = vertices.find((v) => v.x === 5)!; // refs [2, 3]

		const rules = addRuleForPairing([], unit, targetVertex, sourceVertex);
		expect(rules).toEqual([
			{ source: 2, target: 0 },
			{ source: 3, target: 1 }
		]);
	});
});

describe('removeRulesForPairing', () => {
	it('removes rules between two vertices', () => {
		const unit = makeUnit({
			start: [['M', 0, 0], ['M', 5, 5]]
		});
		const vertices = computeVertices(unit);
		const targetVertex = vertices.find((v) => v.x === 0)!;
		const sourceVertex = vertices.find((v) => v.x === 5)!;

		const rules: IndexPair[] = [
			{ source: 1, target: 0 },
			{ source: 0, target: 1 } // reverse — should be kept
		];
		const remaining = removeRulesForPairing(rules, unit, targetVertex, sourceVertex);
		expect(remaining).toEqual([{ source: 0, target: 1 }]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:unit -- src/components/modal/editor/__tests__/vertex-addressing.test.ts 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/modal/editor/vertex-addressing.ts`:

```ts
import type { IndexPair, UnitDefinition } from '$lib/patterns/spec-types';
import type { Vertex, VertexRef } from './segment-vertices';

export const flatIndex = (unit: UnitDefinition, ref: VertexRef): number => {
	if (ref.group === 'start') return ref.index;
	if (ref.group === 'middle') return unit.start.length + ref.index;
	return unit.start.length + unit.middle.length + ref.index;
};

export const flatIndexes = (unit: UnitDefinition, vertex: Vertex): number[] =>
	vertex.refs.map((ref) => flatIndex(unit, ref));

export const findVertexByFlatIndex = (
	unit: UnitDefinition,
	vertices: Vertex[],
	index: number
): Vertex | undefined => vertices.find((v) => flatIndexes(unit, v).includes(index));

export type Connection = {
	sourceVertex: Vertex;
	targetVertex: Vertex;
	rules: IndexPair[];
};

export const computeConnections = (
	rules: IndexPair[],
	unit: UnitDefinition,
	vertices: Vertex[]
): Connection[] => {
	const byKey = new Map<string, Connection>();
	for (const rule of rules) {
		const sourceVertex = findVertexByFlatIndex(unit, vertices, rule.source);
		const targetVertex = findVertexByFlatIndex(unit, vertices, rule.target);
		if (!sourceVertex || !targetVertex) continue;
		const key = `${sourceVertex.x}::${sourceVertex.y}->${targetVertex.x}::${targetVertex.y}`;
		const existing = byKey.get(key);
		if (existing) {
			existing.rules.push(rule);
		} else {
			byKey.set(key, { sourceVertex, targetVertex, rules: [rule] });
		}
	}
	return Array.from(byKey.values());
};

export const addRuleForPairing = (
	rules: IndexPair[],
	unit: UnitDefinition,
	targetVertex: Vertex,
	sourceVertex: Vertex
): IndexPair[] => {
	const targetIdxs = flatIndexes(unit, targetVertex);
	const sourceIdxs = flatIndexes(unit, sourceVertex);
	const n = Math.min(targetIdxs.length, sourceIdxs.length);
	const newRules: IndexPair[] = [];
	for (let i = 0; i < n; i++) {
		newRules.push({ source: sourceIdxs[i], target: targetIdxs[i] });
	}
	return [...rules, ...newRules];
};

export const removeRulesForPairing = (
	rules: IndexPair[],
	unit: UnitDefinition,
	targetVertex: Vertex,
	sourceVertex: Vertex
): IndexPair[] => {
	const targetIdxs = new Set(flatIndexes(unit, targetVertex));
	const sourceIdxs = new Set(flatIndexes(unit, sourceVertex));
	return rules.filter((r) => !(targetIdxs.has(r.target) && sourceIdxs.has(r.source)));
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:unit -- src/components/modal/editor/__tests__/vertex-addressing.test.ts 2>&1 | tail -10
```

Expected: PASS for all 6 describe blocks.

- [ ] **Step 5: Run full test suite + type-check**

```bash
npm run test:unit 2>&1 | tail -5
npm run check 2>&1 | tail -3
```

Expected: tests pass; type-check stable.

- [ ] **Step 6: Commit**

```bash
git add src/components/modal/editor/vertex-addressing.ts src/components/modal/editor/__tests__/vertex-addressing.test.ts
git commit -m "Add vertex addressing + connection helpers with tests"
git push
```

---

### Task 3: ModeBar component

**Files:**
- Create: `src/components/modal/editor/tile-editor/ModeBar.svelte`

- [ ] **Step 1: Create the component**

Create `src/components/modal/editor/tile-editor/ModeBar.svelte` (use **tabs**):

```svelte
<script lang="ts">
	import type { EditorMode } from './editor-mode';

	let {
		mode,
		onChangeMode
	}: {
		mode: EditorMode;
		onChangeMode: (mode: EditorMode) => void;
	} = $props();

	type ModeOption = { id: EditorMode; label: string };
	const options: ModeOption[] = [
		{ id: 'unit', label: 'Unit' },
		{ id: 'withinBand', label: 'Within Band' },
		{ id: 'acrossBands', label: 'Across Bands' },
		{ id: 'partnerStart', label: 'Partner Start' },
		{ id: 'partnerEnd', label: 'Partner End' },
		{ id: 'skipRemove', label: 'Skip Remove' }
	];
</script>

<div class="mode-bar">
	{#each options as option}
		<button
			class:active={mode === option.id}
			onclick={() => onChangeMode(option.id)}
		>
			{option.label}
		</button>
	{/each}
</div>

<style>
	.mode-bar {
		display: flex;
		gap: 4px;
		padding: 6px;
		border-bottom: 1px dotted black;
	}
	.mode-bar button.active {
		background-color: rgba(0, 0, 0, 0.15);
		font-weight: bold;
	}
</style>
```

- [ ] **Step 2: Type-check**

```bash
npm run check 2>&1 | tail -3
```

- [ ] **Step 3: Commit**

```bash
git add src/components/modal/editor/tile-editor/ModeBar.svelte
git commit -m "Add ModeBar component for switching editor mode"
git push
```

---

### Task 4: TileEditor wiring for mode + ModeBar (Unit only for now)

Wire up the `mode` rune and ModeBar without changing the actual rendering yet — the upcoming tasks add the mode-specific viewports.

**Files:**
- Modify: `src/components/modal/editor/TileEditor.svelte`

- [ ] **Step 1: Add mode state + import + ModeBar**

In `src/components/modal/editor/TileEditor.svelte`, add to the imports (after the existing local-folder imports):

```ts
import ModeBar from './tile-editor/ModeBar.svelte';
import type { EditorMode } from './tile-editor/editor-mode';
```

Add a `$state` rune near the existing `let draft: TiledPatternSpec | null = $state(null);` declarations:

```ts
let mode: EditorMode = $state('unit');
```

Add a handler near the other handlers:

```ts
const handleChangeMode = (newMode: EditorMode) => {
	mode = newMode;
};
```

In the template, add `<ModeBar>` between `<VariantBar>` and the `{#if draft}` block:

```svelte
<ModeBar {mode} onChangeMode={handleChangeMode} />
```

Leave the `{#if draft}` block as-is for now — it still renders SegmentPathEditor unconditionally. The mode-specific branch comes in Tasks 5+.

- [ ] **Step 2: Run tests + type-check**

```bash
npm run test:unit 2>&1 | tail -5
npm run check 2>&1 | tail -3
```

Expected: 41/41 pass (37 + 4 from Task 1); type-check stable.

- [ ] **Step 3: Commit**

```bash
git add src/components/modal/editor/TileEditor.svelte
git commit -m "Wire mode rune and ModeBar into TileEditor"
git push
```

---

### Task 5: RuleEditViewport (read-only render)

The viewport for the four rule modes — main unit + ghost + connection lines for existing rules. No interaction yet (clicks come in Task 6).

**Files:**
- Create: `src/components/modal/editor/tile-editor/RuleEditViewport.svelte`

- [ ] **Step 1: Create the component**

Create `src/components/modal/editor/tile-editor/RuleEditViewport.svelte` (use **tabs**):

```svelte
<script lang="ts">
	import type { IndexPair, TiledPatternSpec } from '$lib/patterns/spec-types';
	import { svgPathStringFromSegments } from '$lib/patterns/utils';
	import { getCanvas, type PathEditorConfig } from '../path-editor-shared';
	import { computeVertices, type Vertex } from '../segment-vertices';
	import { computeConnections } from '../vertex-addressing';
	import { ghostSvgTransform, ghostTransform, type EditorMode } from './editor-mode';

	let {
		spec,
		mode,
		rules,
		config,
		selectedTarget,
		onSelectTarget,
		onSelectGhost,
		onSelectConnection
	}: {
		spec: TiledPatternSpec;
		mode: EditorMode;
		rules: IndexPair[];
		config: PathEditorConfig;
		selectedTarget: Vertex | null;
		onSelectTarget: (vertex: Vertex) => void;
		onSelectGhost: (vertex: Vertex) => void;
		onSelectConnection: (sourceVertex: Vertex, targetVertex: Vertex) => void;
	} = $props();

	const canv = $derived(getCanvas(config));
	const vertices = $derived(computeVertices(spec.unit));
	const allSegments = $derived([...spec.unit.start, ...spec.unit.middle, ...spec.unit.end]);
	const pathString = $derived(svgPathStringFromSegments(allSegments));
	const ghostTransformStr = $derived(ghostSvgTransform(mode, spec.unit));
	const connections = $derived(computeConnections(rules, spec.unit, vertices));
	const ghostPositions = $derived(
		vertices.map((v) => ({ vertex: v, ...ghostTransform(mode, spec.unit, { x: v.x, y: v.y }) }))
	);
</script>

<div class="container" style="width:{config.size.width}px; height:{config.size.height}px;">
	<svg
		width={config.size.width}
		height={config.size.height}
		viewBox={canv.viewBox}
		class="canvas"
	>
		<rect x="0" y="0" width={spec.unit.width} height={spec.unit.height} class="unit-bounds" />
		<g transform={ghostTransformStr} class="ghost">
			<rect x="0" y="0" width={spec.unit.width} height={spec.unit.height} class="ghost-bounds" />
			<path d={pathString} class="ghost-segments" />
		</g>
		<path d={pathString} class="segments" />

		{#each connections as conn}
			<line
				x1={conn.targetVertex.x}
				y1={conn.targetVertex.y}
				x2={ghostPositions.find((g) => g.vertex === conn.sourceVertex)?.x ?? 0}
				y2={ghostPositions.find((g) => g.vertex === conn.sourceVertex)?.y ?? 0}
				class="connection"
				onclick={() => onSelectConnection(conn.sourceVertex, conn.targetVertex)}
			/>
		{/each}

		{#each vertices as vertex (vertex.x + ':' + vertex.y)}
			<circle
				cx={vertex.x}
				cy={vertex.y}
				r="0.5"
				class:selected={selectedTarget === vertex}
				class="main-vertex"
				onclick={() => onSelectTarget(vertex)}
			/>
		{/each}

		{#each ghostPositions as gp (gp.vertex.x + ':' + gp.vertex.y)}
			<circle
				cx={gp.x}
				cy={gp.y}
				r="0.5"
				class="ghost-vertex"
				onclick={() => onSelectGhost(gp.vertex)}
			/>
		{/each}
	</svg>
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
	.unit-bounds {
		fill: none;
		stroke: rgba(0, 0, 0, 0.15);
		stroke-width: 0.2;
		stroke-dasharray: 0.5, 0.5;
	}
	.ghost-bounds {
		fill: none;
		stroke: rgba(0, 0, 0, 0.1);
		stroke-width: 0.2;
		stroke-dasharray: 0.5, 0.5;
	}
	.segments {
		fill: none;
		stroke: black;
		stroke-width: 0.4;
	}
	.ghost-segments {
		fill: none;
		stroke: rgba(0, 0, 0, 0.3);
		stroke-width: 0.4;
	}
	.main-vertex {
		fill: white;
		stroke: black;
		stroke-width: 0.15;
		cursor: pointer;
	}
	.main-vertex.selected {
		fill: orange;
	}
	.ghost-vertex {
		fill: rgba(255, 255, 255, 0.6);
		stroke: rgba(0, 0, 0, 0.5);
		stroke-width: 0.15;
		cursor: pointer;
	}
	.connection {
		stroke: rgba(0, 100, 200, 0.7);
		stroke-width: 0.3;
		cursor: pointer;
	}
	.connection:hover {
		stroke: rgba(0, 100, 200, 1);
		stroke-width: 0.5;
	}
</style>
```

- [ ] **Step 2: Type-check**

```bash
npm run check 2>&1 | tail -3
```

Expected: error count stable. >3 new errors directly traceable to this file → report **DONE_WITH_CONCERNS**.

- [ ] **Step 3: Commit**

```bash
git add src/components/modal/editor/tile-editor/RuleEditViewport.svelte
git commit -m "Add RuleEditViewport with main + ghost + connection rendering"
git push
```

---

### Task 6: TileEditor branches to RuleEditViewport for rule modes

Wire up the four rule modes to render the new viewport. Plus add the `selectedTarget` rune and the rule-mutation handlers.

**Files:**
- Modify: `src/components/modal/editor/TileEditor.svelte`

- [ ] **Step 1: Update imports**

Add to the imports:

```ts
import RuleEditViewport from './tile-editor/RuleEditViewport.svelte';
import { isRuleMode, ruleArrayKey } from './tile-editor/editor-mode';
import type { Vertex } from './segment-vertices';
import { addRuleForPairing, removeRulesForPairing } from './vertex-addressing';
import type { IndexPair } from '$lib/patterns/spec-types';
```

- [ ] **Step 2: Add selectedTarget rune + helpers**

After the existing `let mode: EditorMode = $state('unit');`:

```ts
let selectedTarget: Vertex | null = $state(null);

const getRulesForMode = (): IndexPair[] => {
	if (!draft) return [];
	if (mode === 'withinBand') return draft.adjustments.withinBand;
	if (mode === 'acrossBands') return draft.adjustments.acrossBands;
	if (mode === 'partnerStart') return draft.adjustments.partner.startEnd;
	if (mode === 'partnerEnd') return draft.adjustments.partner.endEnd;
	return [];
};

const setRulesForMode = (newRules: IndexPair[]) => {
	if (!draft) return;
	const updated: TiledPatternSpec = $state.snapshot(draft) as TiledPatternSpec;
	// Strip any reactive-proxy carryover from rule elements that may have come from the live draft
	const cleanRules: IndexPair[] = newRules.map((r) => ({ source: r.source, target: r.target }));
	if (mode === 'withinBand') updated.adjustments.withinBand = cleanRules;
	else if (mode === 'acrossBands') updated.adjustments.acrossBands = cleanRules;
	else if (mode === 'partnerStart') updated.adjustments.partner.startEnd = cleanRules;
	else if (mode === 'partnerEnd') updated.adjustments.partner.endEnd = cleanRules;
	draft = updated;
	isDirty = true;
};

const handleSelectTarget = (vertex: Vertex) => {
	selectedTarget = vertex;
};

const handleSelectGhost = (vertex: Vertex) => {
	if (!draft || !selectedTarget) return;
	const newRules = addRuleForPairing(getRulesForMode(), draft.unit, selectedTarget, vertex);
	setRulesForMode(newRules);
	selectedTarget = null;
};

const handleSelectConnection = (sourceVertex: Vertex, targetVertex: Vertex) => {
	if (!draft) return;
	const newRules = removeRulesForPairing(getRulesForMode(), draft.unit, targetVertex, sourceVertex);
	setRulesForMode(newRules);
};

const updateModeAndClearSelection = (newMode: EditorMode) => {
	mode = newMode;
	selectedTarget = null;
};
```

Replace the existing `handleChangeMode` with `updateModeAndClearSelection`:

In `<ModeBar onChangeMode={...}>`, change to:

```svelte
<ModeBar {mode} onChangeMode={updateModeAndClearSelection} />
```

(And delete the now-unused `handleChangeMode`.)

- [ ] **Step 3: Branch the viewport render**

Replace the existing `{#if draft}` block with:

```svelte
{#if draft}
	{#if mode === 'unit'}
		<div class="viewport-wrap">
			<SegmentPathEditor
				unit={draft.unit}
				config={editorConfig}
				onChangeUnit={handleUnitChange}
			/>
		</div>
	{:else if isRuleMode(mode)}
		<div class="viewport-wrap">
			<RuleEditViewport
				spec={draft}
				{mode}
				rules={getRulesForMode()}
				config={editorConfig}
				{selectedTarget}
				onSelectTarget={handleSelectTarget}
				onSelectGhost={handleSelectGhost}
				onSelectConnection={handleSelectConnection}
			/>
		</div>
	{/if}
{:else}
	<div class="empty">No variant selected.</div>
{/if}
```

(The `skipRemove` branch is added in Task 9.)

- [ ] **Step 4: Update editorConfig for rule modes**

The viewBox needs to expand to include the ghost. Replace the existing `editorConfig` with:

```ts
const editorConfig: PathEditorConfig = $derived.by(() => {
	const currentDraft: TiledPatternSpec | null = draft;
	const unitWidth = currentDraft?.unit.width ?? 42;
	const unitHeight = currentDraft?.unit.height ?? 14;
	const padding = 4;

	let left = -2;
	let top = -2;
	let contentWidth = unitWidth + 4;
	let contentHeight = unitHeight + 4;

	if (mode === 'withinBand' || mode === 'partnerEnd') {
		contentWidth = 2 * unitWidth + 4;
	} else if (mode === 'partnerStart') {
		left = -unitWidth - 2;
		contentWidth = 2 * unitWidth + 4;
	} else if (mode === 'acrossBands') {
		top = -unitHeight - 2;
		contentHeight = 2 * unitHeight + 4;
	}

	const viewBoxWidth = contentWidth + padding * 2;
	const viewBoxHeight = contentHeight + padding * 2;
	const maxSizeWidth = 800;
	const maxSizeHeight = 500;
	const aspect = viewBoxWidth / viewBoxHeight;
	let sizeWidth = maxSizeWidth;
	let sizeHeight = sizeWidth / aspect;
	if (sizeHeight > maxSizeHeight) {
		sizeHeight = maxSizeHeight;
		sizeWidth = sizeHeight * aspect;
	}

	return {
		padding,
		gutter: 0,
		contentBounds: { top, left, width: contentWidth, height: contentHeight },
		size: { width: sizeWidth, height: sizeHeight }
	};
});
```

- [ ] **Step 5: Run tests + type-check**

```bash
npm run test:unit 2>&1 | tail -5
npm run check 2>&1 | tail -3
```

Expected: 41/41 pass. Type-check stable.

- [ ] **Step 6: Commit**

```bash
git add src/components/modal/editor/TileEditor.svelte
git commit -m "Wire RuleEditViewport for the four rule modes; add selectedTarget rune"
git push
```

---

### Task 7: Keyboard delete for selected connection

A clicked connection currently triggers `onSelectConnection` which immediately deletes it. Spec calls for a two-step: click selects, Delete key removes. Add a `selectedConnection` rune in `RuleEditViewport` so click selects-and-deselects, and Delete removes.

Actually, given the connection has a single visual representation and the click already targets a specific connection, we can keep the immediate-delete behavior — it's simpler. But the spec calls for click-to-select + Delete-to-remove, so to match the spec:

- [ ] **Step 1: Modify RuleEditViewport for two-step delete**

In `src/components/modal/editor/tile-editor/RuleEditViewport.svelte`, add internal state:

```ts
let selectedConnection: { sourceVertex: Vertex; targetVertex: Vertex } | null = $state(null);
```

Replace the `onclick` on the line:

```svelte
<line
	...
	class:selected={selectedConnection?.sourceVertex === conn.sourceVertex &&
		selectedConnection?.targetVertex === conn.targetVertex}
	onclick={() => (selectedConnection = { sourceVertex: conn.sourceVertex, targetVertex: conn.targetVertex })}
/>
```

Add a window-level keydown effect:

```ts
$effect(() => {
	const onKey = (e: KeyboardEvent) => {
		if ((e.key === 'Delete' || e.key === 'Backspace') && selectedConnection) {
			onSelectConnection(selectedConnection.sourceVertex, selectedConnection.targetVertex);
			selectedConnection = null;
		}
	};
	window.addEventListener('keydown', onKey);
	return () => window.removeEventListener('keydown', onKey);
});
```

Add CSS for selected line:

```css
.connection.selected {
	stroke: red;
	stroke-width: 0.5;
}
```

- [ ] **Step 2: Type-check + tests**

```bash
npm run check 2>&1 | tail -3
npm run test:unit 2>&1 | tail -5
```

Expected: stable.

- [ ] **Step 3: Commit**

```bash
git add src/components/modal/editor/tile-editor/RuleEditViewport.svelte
git commit -m "Add click-select + Delete-key removal for connections"
git push
```

---

### Task 8: RuleList sidebar

Lists rules for the current rule mode, with a delete button per row. Click row → highlights connection in viewport (via the shared selectedConnection state — but for v1, the sidebar is just a viewer + delete).

**Files:**
- Create: `src/components/modal/editor/tile-editor/RuleList.svelte`
- Modify: `src/components/modal/editor/TileEditor.svelte`

- [ ] **Step 1: Create RuleList**

Create `src/components/modal/editor/tile-editor/RuleList.svelte` (use **tabs**):

```svelte
<script lang="ts">
	import type { IndexPair } from '$lib/patterns/spec-types';

	let {
		rules,
		onDelete
	}: {
		rules: IndexPair[];
		onDelete: (index: number) => void;
	} = $props();
</script>

<div class="rule-list">
	<div class="header">Rules ({rules.length})</div>
	{#if rules.length === 0}
		<div class="empty">No rules in this mode.</div>
	{:else}
		<ul>
			{#each rules as rule, i (i + ':' + rule.source + ':' + rule.target)}
				<li>
					<code>{rule.source} → {rule.target}</code>
					<button onclick={() => onDelete(i)}>×</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.rule-list {
		flex: 0 0 200px;
		padding: 8px;
		border-left: 1px dotted black;
	}
	.header {
		font-weight: bold;
		margin-bottom: 4px;
	}
	.empty {
		color: rgba(0, 0, 0, 0.5);
		font-size: 0.85em;
	}
	ul {
		list-style: none;
		padding: 0;
		margin: 0;
		max-height: 400px;
		overflow-y: auto;
	}
	li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.85em;
		padding: 2px 4px;
	}
	li:hover {
		background-color: rgba(0, 0, 0, 0.05);
	}
	button {
		background: none;
		border: none;
		color: rgba(0, 0, 0, 0.5);
		cursor: pointer;
		font-weight: bold;
	}
	button:hover {
		color: red;
	}
</style>
```

- [ ] **Step 2: Wire in TileEditor**

In `src/components/modal/editor/TileEditor.svelte`, add the import:

```ts
import RuleList from './tile-editor/RuleList.svelte';
```

Add a handler:

```ts
const handleDeleteRuleByIndex = (index: number) => {
	const rules = getRulesForMode();
	const newRules = rules.filter((_, i) => i !== index);
	setRulesForMode(newRules);
};
```

Update the rule-mode branch to wrap viewport + RuleList in a flex row:

```svelte
{:else if isRuleMode(mode)}
	<div class="rule-row">
		<div class="viewport-wrap">
			<RuleEditViewport ... />
		</div>
		<RuleList rules={getRulesForMode()} onDelete={handleDeleteRuleByIndex} />
	</div>
{/if}
```

Add CSS in TileEditor:

```css
.rule-row {
	display: flex;
	flex-direction: row;
}
```

- [ ] **Step 3: Run tests + type-check**

```bash
npm run test:unit 2>&1 | tail -5
npm run check 2>&1 | tail -3
```

- [ ] **Step 4: Commit**

```bash
git add src/components/modal/editor/tile-editor/RuleList.svelte src/components/modal/editor/TileEditor.svelte
git commit -m "Add RuleList sidebar to TileEditor for rule modes"
git push
```

---

### Task 9: SkipRemoveViewport

Renders the unit with red rings on vertices whose flat-indices appear in `spec.adjustments.skipRemove`. Click a vertex toggles all its flat-indices in/out of `skipRemove`.

**Files:**
- Create: `src/components/modal/editor/tile-editor/SkipRemoveViewport.svelte`

- [ ] **Step 1: Create the component**

Create `src/components/modal/editor/tile-editor/SkipRemoveViewport.svelte` (use **tabs**):

```svelte
<script lang="ts">
	import type { TiledPatternSpec } from '$lib/patterns/spec-types';
	import { svgPathStringFromSegments } from '$lib/patterns/utils';
	import { getCanvas, type PathEditorConfig } from '../path-editor-shared';
	import { computeVertices, type Vertex } from '../segment-vertices';
	import { flatIndexes } from '../vertex-addressing';

	let {
		spec,
		config,
		onToggleVertex
	}: {
		spec: TiledPatternSpec;
		config: PathEditorConfig;
		onToggleVertex: (vertex: Vertex) => void;
	} = $props();

	const canv = $derived(getCanvas(config));
	const vertices = $derived(computeVertices(spec.unit));
	const allSegments = $derived([...spec.unit.start, ...spec.unit.middle, ...spec.unit.end]);
	const pathString = $derived(svgPathStringFromSegments(allSegments));
	const skipSet = $derived(new Set(spec.adjustments.skipRemove));

	const isVertexSkipped = (vertex: Vertex): boolean =>
		flatIndexes(spec.unit, vertex).some((idx) => skipSet.has(idx));
</script>

<div class="container" style="width:{config.size.width}px; height:{config.size.height}px;">
	<svg
		width={config.size.width}
		height={config.size.height}
		viewBox={canv.viewBox}
		class="canvas"
	>
		<rect x="0" y="0" width={spec.unit.width} height={spec.unit.height} class="unit-bounds" />
		<path d={pathString} class="segments" />

		{#each vertices as vertex (vertex.x + ':' + vertex.y)}
			{@const skipped = isVertexSkipped(vertex)}
			<circle
				cx={vertex.x}
				cy={vertex.y}
				r="0.7"
				class:skipped
				class="vertex"
				onclick={() => onToggleVertex(vertex)}
			/>
		{/each}
	</svg>
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
	.vertex {
		fill: white;
		stroke: black;
		stroke-width: 0.15;
		cursor: pointer;
	}
	.vertex.skipped {
		fill: rgba(255, 0, 0, 0.4);
		stroke: red;
		stroke-width: 0.3;
	}
</style>
```

- [ ] **Step 2: Type-check**

```bash
npm run check 2>&1 | tail -3
```

- [ ] **Step 3: Commit**

```bash
git add src/components/modal/editor/tile-editor/SkipRemoveViewport.svelte
git commit -m "Add SkipRemoveViewport for skipRemove mode"
git push
```

---

### Task 10: Wire SkipRemoveViewport into TileEditor

**Files:**
- Modify: `src/components/modal/editor/TileEditor.svelte`

- [ ] **Step 1: Import + handler**

In `src/components/modal/editor/TileEditor.svelte`, add to imports:

```ts
import SkipRemoveViewport from './tile-editor/SkipRemoveViewport.svelte';
import { flatIndexes } from './vertex-addressing';
```

Add a handler near the other rule handlers:

```ts
const handleToggleSkip = (vertex: Vertex) => {
	if (!draft) return;
	const indices = flatIndexes(draft.unit, vertex);
	const current = new Set(draft.adjustments.skipRemove);
	const allIn = indices.every((i) => current.has(i));
	for (const i of indices) {
		if (allIn) current.delete(i);
		else current.add(i);
	}
	const updated: TiledPatternSpec = $state.snapshot(draft) as TiledPatternSpec;
	updated.adjustments.skipRemove = Array.from(current).sort((a, b) => a - b);
	draft = updated;
	isDirty = true;
};
```

- [ ] **Step 2: Add the branch**

Update the mode-branch in the template:

```svelte
{#if mode === 'unit'}
	<div class="viewport-wrap">
		<SegmentPathEditor ... />
	</div>
{:else if isRuleMode(mode)}
	<div class="rule-row">
		<div class="viewport-wrap">
			<RuleEditViewport ... />
		</div>
		<RuleList rules={getRulesForMode()} onDelete={handleDeleteRuleByIndex} />
	</div>
{:else if mode === 'skipRemove'}
	<div class="viewport-wrap">
		<SkipRemoveViewport spec={draft} config={editorConfig} onToggleVertex={handleToggleSkip} />
	</div>
{/if}
```

- [ ] **Step 3: Run tests + type-check**

```bash
npm run test:unit 2>&1 | tail -5
npm run check 2>&1 | tail -3
```

- [ ] **Step 4: Commit**

```bash
git add src/components/modal/editor/TileEditor.svelte
git commit -m "Wire SkipRemoveViewport into TileEditor for skipRemove mode"
git push
```

---

### Task 11: End-to-end verification

- [ ] **Step 1: Run full test suite**

```bash
npm run test:unit 2>&1 | tail -5
```

Expected: 41/41 pass.

- [ ] **Step 2: Type-check**

```bash
npm run check 2>&1 | tail -3
```

Expected: error count stable (~427).

- [ ] **Step 3: Manual smoke (deferred to controller)**

The controller will run `npm run dev` and exercise:
- Open Tile Editor (`TE` in sidebar).
- Switch to `Within Band`. Confirm: ghost unit appears to the right; existing connections render as blue lines from main vertices to ghost vertices.
- Click a main vertex (highlights orange). Click a ghost vertex. Confirm: a new connection appears, dirty indicator turns on, RuleList shows new entries.
- Click a connection line. Press `Delete`. Confirm: it disappears, RuleList shrinks.
- Click a row's `×` in the RuleList. Confirm: corresponding connection in viewport disappears.
- Repeat for `Across Bands`, `Partner Start`, `Partner End`. Verify ghost is positioned correctly per mode.
- Switch to `Skip Remove`. Click vertices to toggle red overlay; dirty turns on.
- Save. Reload. Confirm changes persisted.

- [ ] **Step 4: Update plan checkboxes + commit**

Edit `docs/superpowers/plans/2026-05-02-tiled-pattern-editor-phase-4.md`. Mark Task 11 Steps 1, 2, 4 `[x]`. Step 3 manual smoke marked `[ ]` (deferred).

```bash
git add docs/superpowers/plans/2026-05-02-tiled-pattern-editor-phase-4.md
git commit -m "Mark Phase 4 automated verification complete"
git push
```

---

## What's NOT in Phase 4

- Add / remove vertex tools in Unit mode (deferred — Phase 5 candidate).
- Group reassignment (move a segment from `start` to `middle`).
- Tolerance-based vertex key (relevant when add-vertex tool lands).
- Variant validation.
- Visual grouping of variants by algorithm in the picker.
- Confirm-before-discard on close.
- Concurrency safety.

## Risk register

| Risk | Mitigation |
|---|---|
| `RuleEditViewport`'s connection-line click is over the line stroke (~0.3 SVG units, very thin); easy to miss-click | Stroke widens on hover; can be widened further if it bites |
| `selectedConnection` lives inside `RuleEditViewport` while `selectedTarget` lives in `TileEditor` — split state could cause confusion if a future feature wants both | Acceptable in v1; refactor only if a use case arises |
| Coincident-vertex pairing creates multiple rules; user can't fine-tune individual entries via viewport | RuleList sidebar provides per-entry deletion; for fine-grained control of M-vs-L pairing, add per-segment view in a future phase |
| `acrossBands` mode's `top` viewBox shift may confuse users (the path still renders at y > 0 but the viewport is now centered around y = 0) | The unit-bounds dotted rect anchors the user's reference; ghost-bounds at `y < 0` makes the spatial relationship clear |
| `partnerStart` / `partnerEnd` mirror transforms make ghost text/labels backwards | No labels in v1; if labels added later, apply counter-transform on labels only |
| Window-level keydown listener for Delete may interfere with text inputs elsewhere | Listener checks `selectedConnection !== null` before acting; if a future input is focused while a connection is selected, Delete is captured — acceptable; can scope to viewport `keydown` if it bites |
