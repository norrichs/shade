# Tile Pattern Editor Phase 7: Distorted-Quad Partner Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show real distorted partner-quad geometry from the active model in the Tile Editor's `Partner Start` and `Partner End` modes, with chooser sidebar + 3D-viewport highlight + snapshot-on-selection semantics.

**Architecture:** A new `PartnerPairChooser.svelte` sidebar (mounted by `TileEditor.svelte` only in partner modes for shield variants) drives a `distortedGhost` prop on `RuleEditViewport.svelte`. The chooser owns a frozen snapshot of the chosen pair's `{ mainQuad, mainPath, ghostQuad, ghostPath, addresses }` — recomputed only when the user picks again or hits Refresh. A new `partnerHighlightStore` (parallel to `selectedProjection`) drives `Highlight.svelte`'s pair highlight via two distinct materials. A pure resolver module `partner-pair-resolver.ts` does the read-side work and is unit-tested.

**Tech Stack:** SvelteKit + Svelte 5 runes, Three.js (via Threlte), Jest + ts-jest ESM. Pre-existing TS error baseline ~427.

**Branch:** `feature-pattern-edit-phase-5` (Phase 7 continues there until merge; renaming on PR is fine).

---

## File Structure

**New files:**

| Path                                                                              | Responsibility                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/stores/partnerHighlightStore.ts`                                         | Writable holding the chooser-selected partner pair's two facet addresses (or null/null when cleared). Read by `Highlight.svelte`; written by `PartnerPairChooser`.                                                                                                                                                                           |
| `src/components/modal/editor/tile-editor/partner-pair-resolver.ts`                | Pure functions: `getEligibleBands(allBands, mode)` (returns BandCutPatterns whose meta has the relevant partner address); `resolvePair(allBands, mainAddress, mode)` (returns `{ mainQuad, mainPath, ghostQuad, ghostPath, mainAddress, ghostAddress }` or null); `pairsEqual(a, b)` (deep-compare two pair snapshots for change detection). |
| `src/components/modal/editor/tile-editor/PartnerPairChooser.svelte`               | Sidebar UI: dropdown of eligible bands, random button, model-changed banner, generalization caption. Owns `snapshot` rune, subscribes to `superGlobulePatternStore`, writes to `partnerHighlightStore`. Emits the `distortedGhost` prop value via a callback.                                                                                |
| `src/components/modal/editor/tile-editor/__tests__/partner-pair-resolver.test.ts` | Jest unit tests for `getEligibleBands`, `resolvePair`, `pairsEqual`.                                                                                                                                                                                                                                                                         |

**Modified files:**

| Path                                                              | Change                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/projection/Highlight.svelte`                      | Also render facets from `partnerHighlightStore` using `materials.numbered[1]` (start) and `materials.numbered[4]` (end). Existing `selectedProjectionGeometry` path preserved.                                                                                                                                        |
| `src/components/modal/editor/tile-editor/RuleEditViewport.svelte` | Accept optional `distortedGhost` prop. When non-null, render `mainPath` in `mainQuad`, `ghostPath` in `ghostQuad` (already includes baked partner transform), connection lines in distorted-frame coords. ViewBox extends to fit both quads' bounding boxes. When null, existing symmetric-mirror behavior unchanged. |
| `src/components/modal/editor/TileEditor.svelte`                   | In partner modes for shield variants, mount `PartnerPairChooser` and pass its emitted `distortedGhost` value through to `RuleEditViewport`. Other modes unchanged.                                                                                                                                                    |

**Pre-existing TS error baseline:** ~427. Don't grow significantly.

---

### Task 1: Create `partnerHighlightStore`

**Files:**

- Create: `src/lib/stores/partnerHighlightStore.ts`

A trivial writable. No tests — it's three lines of Svelte store boilerplate.

- [ ] **Step 1: Create the store**

Create `src/lib/stores/partnerHighlightStore.ts`:

```typescript
import { writable } from 'svelte/store';
import type { GlobuleAddress_Facet } from '$lib/projection-geometry/types';

export type PartnerHighlight = {
	start: GlobuleAddress_Facet | null;
	end: GlobuleAddress_Facet | null;
};

export const partnerHighlightStore = writable<PartnerHighlight>({ start: null, end: null });
```

- [ ] **Step 2: Re-export from `src/lib/stores/index.ts`**

Read `src/lib/stores/index.ts` first. Add a line that re-exports `partnerHighlightStore`. Match the existing re-export style (likely `export * from './partnerHighlightStore';` or `export { partnerHighlightStore } from './partnerHighlightStore';`).

- [ ] **Step 3: Run typecheck**

```bash
npm run check 2>&1 | tail -3
```

Expected: TS errors at ~427.

- [ ] **Step 4: Commit**

```bash
git add src/lib/stores/partnerHighlightStore.ts src/lib/stores/index.ts
git commit -m "Add partnerHighlightStore for chooser-driven 3D pair highlight"
```

---

### Task 2: Create `partner-pair-resolver` with TDD

**Files:**

- Create: `src/components/modal/editor/tile-editor/__tests__/partner-pair-resolver.test.ts`
- Create: `src/components/modal/editor/tile-editor/partner-pair-resolver.ts`

Pure functions. Comprehensive tests. The plan author has verified the data shapes (`BandCutPattern`, `band.meta.startPartnerBand`/`endPartnerBand`/`startPartnerTransform`/`endPartnerTransform`, `CutPattern.path`, `CutPattern.quad`).

- [ ] **Step 1: Write the test file**

Create `src/components/modal/editor/tile-editor/__tests__/partner-pair-resolver.test.ts`:

```typescript
import {
	getEligibleBands,
	resolvePair,
	pairsEqual,
	type ResolvedPair
} from '../partner-pair-resolver';
import type { BandCutPattern } from '$lib/types';
import type { GlobuleAddress_Band } from '$lib/projection-geometry/types';

const makeQuad = (id: number) => ({
	a: { x: id * 10, y: 0, z: 0 } as any,
	b: { x: id * 10 + 5, y: 0, z: 0 } as any,
	c: { x: id * 10 + 5, y: 5, z: 0 } as any,
	d: { x: id * 10, y: 5, z: 0 } as any
});

const makeFacet = (id: number) => ({
	path: [
		['M', id, id],
		['L', id + 1, id + 1]
	] as any,
	quad: makeQuad(id),
	label: `${id}`
});

const makeBand = (
	bandIdx: number,
	tube: number,
	options: {
		startPartnerBand?: GlobuleAddress_Band;
		endPartnerBand?: GlobuleAddress_Band;
		startPartnerTransform?: {
			translate: { x: number; y: number; z: number };
			rotate: { z: number };
		};
		endPartnerTransform?: { translate: { x: number; y: number; z: number }; rotate: { z: number } };
	} = {}
): BandCutPattern =>
	({
		projectionType: 'patterned',
		address: { globule: 0, tube, band: bandIdx },
		facets: [makeFacet(bandIdx * 10), makeFacet(bandIdx * 10 + 1), makeFacet(bandIdx * 10 + 2)],
		meta:
			options.startPartnerBand || options.endPartnerBand
				? {
						startPartnerBand: options.startPartnerBand ?? { globule: 0, tube: 0, band: 0 },
						endPartnerBand: options.endPartnerBand ?? { globule: 0, tube: 0, band: 0 },
						startPartnerTransform: options.startPartnerTransform,
						endPartnerTransform: options.endPartnerTransform
					}
				: undefined
	}) as any;

describe('getEligibleBands', () => {
	it('returns bands with meta.startPartnerBand for partnerStart mode', () => {
		const bands = [
			makeBand(0, 0, { startPartnerBand: { globule: 0, tube: 1, band: 0 } }),
			makeBand(1, 0),
			makeBand(2, 0, { endPartnerBand: { globule: 0, tube: 1, band: 1 } })
		];
		const result = getEligibleBands(bands, 'partnerStart');
		expect(result.map((b) => b.address.band)).toEqual([0]);
	});

	it('returns bands with meta.endPartnerBand for partnerEnd mode', () => {
		const bands = [
			makeBand(0, 0, { startPartnerBand: { globule: 0, tube: 1, band: 0 } }),
			makeBand(1, 0),
			makeBand(2, 0, { endPartnerBand: { globule: 0, tube: 1, band: 1 } })
		];
		const result = getEligibleBands(bands, 'partnerEnd');
		expect(result.map((b) => b.address.band)).toEqual([2]);
	});

	it('returns empty array if no bands have meta', () => {
		const bands = [makeBand(0, 0), makeBand(1, 0)];
		expect(getEligibleBands(bands, 'partnerStart')).toEqual([]);
		expect(getEligibleBands(bands, 'partnerEnd')).toEqual([]);
	});
});

describe('resolvePair', () => {
	it('returns null when band has no meta for the mode', () => {
		const bands = [makeBand(0, 0)];
		const result = resolvePair(bands, { globule: 0, tube: 0, band: 0 }, 'partnerStart');
		expect(result).toBeNull();
	});

	it('returns null when partner band cannot be resolved', () => {
		const bands = [makeBand(0, 0, { startPartnerBand: { globule: 0, tube: 99, band: 99 } })];
		const result = resolvePair(bands, { globule: 0, tube: 0, band: 0 }, 'partnerStart');
		expect(result).toBeNull();
	});

	it('resolves partner pair for partnerStart with no transform (identity)', () => {
		const partnerBand = makeBand(5, 1);
		const mainBand = makeBand(0, 0, {
			startPartnerBand: { globule: 0, tube: 1, band: 5 }
		});
		const result = resolvePair([mainBand, partnerBand], mainBand.address, 'partnerStart');
		expect(result).not.toBeNull();
		expect(result!.mainAddress).toEqual({ globule: 0, tube: 0, band: 0, facet: 0 });
		expect(result!.ghostAddress).toEqual({ globule: 0, tube: 1, band: 5, facet: 0 });
		expect(result!.mainPath).toEqual(mainBand.facets[0].path);
		expect(result!.ghostPath).toEqual(partnerBand.facets[0].path);
	});

	it('resolves partner pair for partnerEnd at last facet index', () => {
		const partnerBand = makeBand(5, 1);
		const mainBand = makeBand(0, 0, {
			endPartnerBand: { globule: 0, tube: 1, band: 5 }
		});
		const result = resolvePair([mainBand, partnerBand], mainBand.address, 'partnerEnd');
		expect(result).not.toBeNull();
		const lastIdx = mainBand.facets.length - 1;
		expect(result!.mainAddress).toEqual({ globule: 0, tube: 0, band: 0, facet: lastIdx });
		expect(result!.ghostAddress).toEqual({
			globule: 0,
			tube: 1,
			band: 5,
			facet: partnerBand.facets.length - 1
		});
	});

	it('applies startPartnerTransform to ghost path', () => {
		const partnerBand = makeBand(5, 1);
		const mainBand = makeBand(0, 0, {
			startPartnerBand: { globule: 0, tube: 1, band: 5 },
			startPartnerTransform: {
				translate: { x: 100, y: 200, z: 0 },
				rotate: { z: 0 }
			}
		});
		const result = resolvePair([mainBand, partnerBand], mainBand.address, 'partnerStart');
		expect(result).not.toBeNull();
		// Original partner facet[0] path is [['M', 50, 50], ['L', 51, 51]]
		// After translate(100, 200): [['M', 150, 250], ['L', 151, 251]]
		expect(result!.ghostPath).toEqual([
			['M', 150, 250],
			['L', 151, 251]
		]);
	});
});

describe('pairsEqual', () => {
	it('returns true for two null pairs', () => {
		expect(pairsEqual(null, null)).toBe(true);
	});

	it('returns false when one is null and the other is not', () => {
		const pair: ResolvedPair = {
			mainAddress: { globule: 0, tube: 0, band: 0, facet: 0 },
			ghostAddress: { globule: 0, tube: 1, band: 0, facet: 0 },
			mainQuad: makeQuad(0),
			ghostQuad: makeQuad(1),
			mainPath: [['M', 0, 0]],
			ghostPath: [['M', 1, 1]]
		};
		expect(pairsEqual(pair, null)).toBe(false);
		expect(pairsEqual(null, pair)).toBe(false);
	});

	it('returns true when paths and quads are deep-equal', () => {
		const a: ResolvedPair = {
			mainAddress: { globule: 0, tube: 0, band: 0, facet: 0 },
			ghostAddress: { globule: 0, tube: 1, band: 0, facet: 0 },
			mainQuad: makeQuad(0),
			ghostQuad: makeQuad(1),
			mainPath: [['M', 0, 0]],
			ghostPath: [['M', 1, 1]]
		};
		const b: ResolvedPair = {
			mainAddress: { globule: 0, tube: 0, band: 0, facet: 0 },
			ghostAddress: { globule: 0, tube: 1, band: 0, facet: 0 },
			mainQuad: makeQuad(0),
			ghostQuad: makeQuad(1),
			mainPath: [['M', 0, 0]],
			ghostPath: [['M', 1, 1]]
		};
		expect(pairsEqual(a, b)).toBe(true);
	});

	it('returns false when paths differ', () => {
		const a: ResolvedPair = {
			mainAddress: { globule: 0, tube: 0, band: 0, facet: 0 },
			ghostAddress: { globule: 0, tube: 1, band: 0, facet: 0 },
			mainQuad: makeQuad(0),
			ghostQuad: makeQuad(1),
			mainPath: [['M', 0, 0]],
			ghostPath: [['M', 1, 1]]
		};
		const b: ResolvedPair = { ...a, ghostPath: [['M', 999, 999]] };
		expect(pairsEqual(a, b)).toBe(false);
	});
});
```

- [ ] **Step 2: Run the test (expect FAIL — module not found)**

```bash
npx jest src/components/modal/editor/tile-editor/__tests__/partner-pair-resolver.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../partner-pair-resolver'`.

- [ ] **Step 3: Implement the resolver**

Create `src/components/modal/editor/tile-editor/partner-pair-resolver.ts`:

```typescript
import type { BandCutPattern, PathSegment, Quadrilateral } from '$lib/types';
import type { GlobuleAddress_Band, GlobuleAddress_Facet } from '$lib/projection-geometry/types';
import { newTransformPS } from '$lib/patterns/tesselation/shield/helpers';

export type PartnerMode = 'partnerStart' | 'partnerEnd';

export type ResolvedPair = {
	mainAddress: GlobuleAddress_Facet;
	ghostAddress: GlobuleAddress_Facet;
	mainQuad: Quadrilateral;
	ghostQuad: Quadrilateral;
	mainPath: PathSegment[];
	ghostPath: PathSegment[];
};

export const getEligibleBands = (
	allBands: BandCutPattern[],
	mode: PartnerMode
): BandCutPattern[] => {
	const key = mode === 'partnerStart' ? 'startPartnerBand' : 'endPartnerBand';
	return allBands.filter((b) => b.meta && b.meta[key]);
};

const findBandByAddress = (
	allBands: BandCutPattern[],
	address: GlobuleAddress_Band
): BandCutPattern | undefined =>
	allBands.find(
		(b) =>
			b.address.globule === address.globule &&
			b.address.tube === address.tube &&
			b.address.band === address.band
	);

export const resolvePair = (
	allBands: BandCutPattern[],
	mainAddress: GlobuleAddress_Band,
	mode: PartnerMode
): ResolvedPair | null => {
	const mainBand = findBandByAddress(allBands, mainAddress);
	if (!mainBand?.meta) return null;

	const partnerKey = mode === 'partnerStart' ? 'startPartnerBand' : 'endPartnerBand';
	const transformKey = mode === 'partnerStart' ? 'startPartnerTransform' : 'endPartnerTransform';

	const partnerBandAddress = mainBand.meta[partnerKey];
	if (!partnerBandAddress) return null;

	const partnerBand = findBandByAddress(allBands, partnerBandAddress);
	if (!partnerBand) return null;

	const facetIndex = mode === 'partnerStart' ? 0 : mainBand.facets.length - 1;
	const ghostFacetIndex = mode === 'partnerStart' ? 0 : partnerBand.facets.length - 1;

	const mainFacet = mainBand.facets[facetIndex];
	const ghostFacet = partnerBand.facets[ghostFacetIndex];
	if (!mainFacet?.quad || !ghostFacet?.quad) return null;

	const transform = mainBand.meta[transformKey];
	const ghostPath = transform
		? newTransformPS(structuredClone(ghostFacet.path), transform)
		: structuredClone(ghostFacet.path);

	return {
		mainAddress: { ...mainAddress, facet: facetIndex },
		ghostAddress: { ...partnerBandAddress, facet: ghostFacetIndex },
		mainQuad: mainFacet.quad,
		ghostQuad: ghostFacet.quad,
		mainPath: structuredClone(mainFacet.path),
		ghostPath
	};
};

export const pairsEqual = (a: ResolvedPair | null, b: ResolvedPair | null): boolean => {
	if (a === null && b === null) return true;
	if (a === null || b === null) return false;
	return JSON.stringify(a) === JSON.stringify(b);
};
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx jest src/components/modal/editor/tile-editor/__tests__/partner-pair-resolver.test.ts --no-coverage
```

Expected: PASS — all 11 tests.

- [ ] **Step 5: Run typecheck**

```bash
npm run check 2>&1 | tail -3
```

Expected: TS errors at ~427.

- [ ] **Step 6: Commit**

```bash
git add src/components/modal/editor/tile-editor/partner-pair-resolver.ts src/components/modal/editor/tile-editor/__tests__/partner-pair-resolver.test.ts
git commit -m "Add partner-pair-resolver with eligibility, resolution, and equality helpers"
```

---

### Task 3: Update `Highlight.svelte` to render chooser-pair facets

**Files:**

- Modify: `src/components/projection/Highlight.svelte`

The component currently renders one selected facet + one combined `partner` BufferGeometry (both from `selectedProjectionGeometry`). For Phase 7 it ALSO renders the chooser-selected pair's two facets in distinct colors. The two highlight sources coexist — they don't replace each other.

The chooser writes two `GlobuleAddress_Facet` values to `partnerHighlightStore`. To convert these into renderable `BufferGeometry`, we need access to facet meshes from `superGlobuleStore`. The `selectedProjectionGeometry` derived store already does this transformation; we can derive a similar small helper for the chooser pair.

- [ ] **Step 1: Read the current Highlight.svelte and selectionStores.ts to understand patterns**

```bash
cat src/components/projection/Highlight.svelte
grep -n "selectedProjectionGeometry\|getSelectedFacet" src/lib/stores/selectionStores.ts | head -20
```

The pattern: `selectedProjectionGeometry` is a derived store that combines `selectedProjection` + `superGlobuleStore` and returns `BufferGeometry` instances. We'll add an analogous derived store for `partnerHighlightStore`.

- [ ] **Step 2: Add a derived store for chooser-pair geometry**

In `src/lib/stores/selectionStores.ts`, after the `selectedProjectionGeometry` export, add:

```typescript
import { partnerHighlightStore } from './partnerHighlightStore';

export type ChooserPairGeometry = {
	startGeometry: BufferGeometry | null;
	endGeometry: BufferGeometry | null;
} | null;

export const chooserPairGeometry = derived(
	[partnerHighlightStore, superGlobuleStore],
	([$partnerHighlightStore, $superGlobuleStore]): ChooserPairGeometry => {
		if (!$partnerHighlightStore.start && !$partnerHighlightStore.end) return null;

		const facetToGeometry = (addr: GlobuleAddress_Facet | null): BufferGeometry | null => {
			if (!addr) return null;
			const facet =
				$superGlobuleStore.projections[addr.globule]?.tubes[addr.tube]?.bands[addr.band]?.facets[
					addr.facet
				];
			if (!facet) return null;
			const geom = new BufferGeometry();
			const positions = new Float32Array([
				facet.triangle.a.x,
				facet.triangle.a.y,
				facet.triangle.a.z,
				facet.triangle.b.x,
				facet.triangle.b.y,
				facet.triangle.b.z,
				facet.triangle.c.x,
				facet.triangle.c.y,
				facet.triangle.c.z
			]);
			geom.setAttribute('position', new (require('three').Float32BufferAttribute)(positions, 3));
			geom.computeVertexNormals();
			return geom;
		};

		return {
			startGeometry: facetToGeometry($partnerHighlightStore.start),
			endGeometry: facetToGeometry($partnerHighlightStore.end)
		};
	}
);
```

NOTE: `require('three').Float32BufferAttribute` is awkward — replace with a top-of-file import:

```typescript
import { BufferGeometry, Float32BufferAttribute } from 'three';
```

(There's already a `BufferGeometry` import — extend it.)

Also, **before** writing the geometry construction, READ how `selectedProjectionGeometry` constructs its `geometry.facet` BufferGeometry — the facet shape and vertex order may need to match (or you may discover that `Facet.triangle` doesn't have `.a/.b/.c` directly and you need `Vector3` instances). Adapt accordingly. The plan author has not verified the exact construction. If your construction looks substantially different from `selectedProjectionGeometry`'s, USE THE SAME PATTERN as that derived store — copy its shape verbatim.

If the selected-projection geometry construction lives in a private helper not exported, copy the helper as a private function near `chooserPairGeometry`.

If you can't get the geometry construction working in 10 minutes, REPORT AS DONE_WITH_CONCERNS — the highlight is a polish feature; the chooser still works without it. Don't burn a long debugging session here.

- [ ] **Step 3: Update `Highlight.svelte` to render the new geometry**

Replace `src/components/projection/Highlight.svelte` with:

```svelte
<script lang="ts">
	import { materials } from '../three-renderer/materials';
	import { selectedProjectionGeometry, chooserPairGeometry } from '$lib/stores';
	import { T } from '@threlte/core';
</script>

{#if $selectedProjectionGeometry}
	<T.Mesh
		geometry={$selectedProjectionGeometry.geometry.facet}
		material={materials.highlightedSecondary}
	/>
	{#if $selectedProjectionGeometry.geometry.partner}
		<T.Mesh
			geometry={$selectedProjectionGeometry.geometry.partner}
			material={materials.numbered[3]}
		/>
	{/if}
{/if}

{#if $chooserPairGeometry?.startGeometry}
	<T.Mesh geometry={$chooserPairGeometry.startGeometry} material={materials.numbered[1]} />
{/if}
{#if $chooserPairGeometry?.endGeometry}
	<T.Mesh geometry={$chooserPairGeometry.endGeometry} material={materials.numbered[4]} />
{/if}
```

- [ ] **Step 4: Re-export `chooserPairGeometry` from stores index**

Read `src/lib/stores/index.ts`. Add `chooserPairGeometry` to the exports — match the existing style for `selectedProjectionGeometry`.

- [ ] **Step 5: Run typecheck**

```bash
npm run check 2>&1 | tail -3
```

Expected: TS errors at ~427.

- [ ] **Step 6: Run tests**

```bash
npm run test:unit 2>&1 | tail -5
```

Expected: all tests still pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/projection/Highlight.svelte src/lib/stores/selectionStores.ts src/lib/stores/index.ts
git commit -m "Highlight chooser-selected partner pair in 3D viewport"
```

---

### Task 4: Create `PartnerPairChooser.svelte` (basic chooser without model-change banner)

**Files:**

- Create: `src/components/modal/editor/tile-editor/PartnerPairChooser.svelte`

This task implements the chooser's UI and pair-selection logic. The model-change detection / refresh banner is added in Task 5 to keep this task small.

- [ ] **Step 1: Create the component**

Create `src/components/modal/editor/tile-editor/PartnerPairChooser.svelte`:

```svelte
<script lang="ts">
	import { superGlobulePatternStore } from '$lib/stores/superGlobuleStores';
	import { partnerHighlightStore } from '$lib/stores/partnerHighlightStore';
	import {
		getEligibleBands,
		resolvePair,
		type PartnerMode,
		type ResolvedPair
	} from './partner-pair-resolver';
	import type { BandCutPattern } from '$lib/types';
	import type { GlobuleAddress_Band } from '$lib/projection-geometry/types';
	import { onDestroy } from 'svelte';

	let {
		mode,
		onChange
	}: {
		mode: PartnerMode;
		onChange: (snapshot: ResolvedPair | null) => void;
	} = $props();

	const bands = $derived<BandCutPattern[]>(
		$superGlobulePatternStore?.bandPatterns?.flatMap((bp: any) => bp) ?? []
	);
	const eligible = $derived(getEligibleBands(bands, mode));

	let selectedAddressJSON: string = $state('');

	const addressForOption = (b: BandCutPattern): string => JSON.stringify(b.address);
	const labelForOption = (b: BandCutPattern): string =>
		`Tube ${b.address.tube} / Band ${b.address.band}`;

	const handleSelect = (addrJSON: string) => {
		selectedAddressJSON = addrJSON;
		if (!addrJSON) {
			onChange(null);
			partnerHighlightStore.set({ start: null, end: null });
			return;
		}
		const addr = JSON.parse(addrJSON) as GlobuleAddress_Band;
		const snapshot = resolvePair(bands, addr, mode);
		onChange(snapshot);
		if (snapshot) {
			partnerHighlightStore.set({
				start: mode === 'partnerStart' ? snapshot.mainAddress : snapshot.ghostAddress,
				end: mode === 'partnerEnd' ? snapshot.mainAddress : snapshot.ghostAddress
			});
		} else {
			partnerHighlightStore.set({ start: null, end: null });
		}
	};

	const handleRandom = () => {
		if (eligible.length === 0) return;
		const random = eligible[Math.floor(Math.random() * eligible.length)];
		handleSelect(addressForOption(random));
	};

	const handleClear = () => {
		handleSelect('');
	};

	onDestroy(() => {
		partnerHighlightStore.set({ start: null, end: null });
	});
</script>

<div class="chooser">
	<div class="title">Pair</div>
	{#if eligible.length === 0}
		<div class="empty">{bands.length === 0 ? 'No model loaded' : 'No partner pairs in model'}</div>
	{:else}
		<div class="row">
			<select
				value={selectedAddressJSON}
				onchange={(e) => handleSelect((e.currentTarget as HTMLSelectElement).value)}
			>
				<option value="">— pick a pair —</option>
				{#each eligible as b (addressForOption(b))}
					<option value={addressForOption(b)}>{labelForOption(b)}</option>
				{/each}
			</select>
			<button onclick={handleRandom} title="Random pair">🎲</button>
			{#if selectedAddressJSON}
				<button onclick={handleClear} title="Clear selection">×</button>
			{/if}
		</div>
		<div class="caption">Showing one pair — rules apply to all</div>
	{/if}
</div>

<style>
	.chooser {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 6px 8px;
		border: 1px dotted black;
	}
	.title {
		font-weight: bold;
		font-size: 0.85em;
	}
	.row {
		display: flex;
		gap: 4px;
		align-items: center;
	}
	.row select {
		flex: 1;
	}
	.empty {
		color: rgba(0, 0, 0, 0.5);
		font-size: 0.85em;
	}
	.caption {
		color: rgba(0, 0, 0, 0.5);
		font-size: 0.8em;
	}
</style>
```

NOTE: The `bands` derivation `$superGlobulePatternStore?.bandPatterns?.flatMap(...)` is a guess at the store's actual shape — `superGlobulePatternStore`'s value type may have a different field name. **Read `src/lib/stores/superGlobuleStores.ts`** to find how the bands are exposed, and adapt the derivation accordingly. The plan author has not verified this exact path. If you find a different field name, fix the derivation here.

- [ ] **Step 2: Run typecheck**

```bash
npm run check 2>&1 | tail -3
```

Expected: TS errors at ~427 or slightly above (partner-pair-resolver imports compile; chooser may have a few "any"s if the store shape required them).

- [ ] **Step 3: Commit**

```bash
git add src/components/modal/editor/tile-editor/PartnerPairChooser.svelte
git commit -m "Add PartnerPairChooser sidebar UI (basic — no model-change banner yet)"
```

---

### Task 5: Add model-change detection and Refresh banner to `PartnerPairChooser`

**Files:**

- Modify: `src/components/modal/editor/tile-editor/PartnerPairChooser.svelte`

The chooser snapshots a pair on selection and freezes it. Whenever the underlying store ticks, we deep-compare the current pair (resolved live from the store) to the snapshot. If they differ, show "Model changed — Refresh?". Refresh re-resolves and re-snapshots.

- [ ] **Step 1: Add snapshot state and live-pair deriv**

In `PartnerPairChooser.svelte`, ADD AFTER the existing `selectedAddressJSON` state declaration:

```typescript
let snapshot: ResolvedPair | null = $state(null);

const livePair = $derived.by((): ResolvedPair | null => {
	if (!selectedAddressJSON) return null;
	const addr = JSON.parse(selectedAddressJSON) as GlobuleAddress_Band;
	return resolvePair(bands, addr, mode);
});

const isStale = $derived.by(() => {
	if (!snapshot) return false;
	if (!livePair) return true; // selected band disappeared
	return !pairsEqualImport(snapshot, livePair);
});
```

Add the import at the top:

```typescript
import {
	getEligibleBands,
	resolvePair,
	pairsEqual as pairsEqualImport,
	type PartnerMode,
	type ResolvedPair
} from './partner-pair-resolver';
```

- [ ] **Step 2: Update `handleSelect` to write the snapshot**

Replace the existing `handleSelect` body:

```typescript
const handleSelect = (addrJSON: string) => {
	selectedAddressJSON = addrJSON;
	if (!addrJSON) {
		snapshot = null;
		onChange(null);
		partnerHighlightStore.set({ start: null, end: null });
		return;
	}
	const addr = JSON.parse(addrJSON) as GlobuleAddress_Band;
	const fresh = resolvePair(bands, addr, mode);
	snapshot = fresh;
	onChange(fresh);
	if (fresh) {
		partnerHighlightStore.set({
			start: mode === 'partnerStart' ? fresh.mainAddress : fresh.ghostAddress,
			end: mode === 'partnerEnd' ? fresh.mainAddress : fresh.ghostAddress
		});
	} else {
		partnerHighlightStore.set({ start: null, end: null });
	}
};
```

- [ ] **Step 3: Add Refresh handler**

```typescript
const handleRefresh = () => {
	if (!selectedAddressJSON) return;
	const addr = JSON.parse(selectedAddressJSON) as GlobuleAddress_Band;
	const fresh = resolvePair(bands, addr, mode);
	snapshot = fresh;
	onChange(fresh);
	if (!fresh) {
		// Selected band gone; clear
		selectedAddressJSON = '';
		partnerHighlightStore.set({ start: null, end: null });
	}
};
```

- [ ] **Step 4: Render the banner**

Inside the `{#if eligible.length === 0}` ELSE branch, after the `.row` div with the select/buttons, add:

```svelte
{#if isStale && livePair}
	<div class="banner">
		⚠ Model changed
		<button onclick={handleRefresh}>Refresh</button>
	</div>
{:else if isStale && !livePair}
	<div class="banner">
		Pair no longer exists in model
		<button onclick={handleClear}>Clear</button>
	</div>
{/if}
```

Add to `<style>`:

```css
.banner {
	display: flex;
	gap: 6px;
	align-items: center;
	font-size: 0.85em;
	color: #b00020;
}
.banner button {
	font-size: 0.85em;
}
```

- [ ] **Step 5: Run typecheck**

```bash
npm run check 2>&1 | tail -3
```

Expected: TS errors at ~427.

- [ ] **Step 6: Commit**

```bash
git add src/components/modal/editor/tile-editor/PartnerPairChooser.svelte
git commit -m "Add model-change detection and Refresh banner to PartnerPairChooser"
```

---

### Task 6: Wire `distortedGhost` prop into `RuleEditViewport.svelte` (plumbing only, no rendering yet)

**Files:**

- Modify: `src/components/modal/editor/tile-editor/RuleEditViewport.svelte`

This task adds the prop without changing render behavior. Render comes in Task 7 to keep the diffs reviewable.

- [ ] **Step 1: Add `distortedGhost` to RuleEditViewport's props**

Read `src/components/modal/editor/tile-editor/RuleEditViewport.svelte`. Locate the `$props()` block. Add `distortedGhost` as an optional field:

```typescript
import type { ResolvedPair } from './partner-pair-resolver';

let {
	spec,
	mode,
	rules,
	config,
	selectedTarget,
	selectedConnection,
	distortedGhost,
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
	distortedGhost: ResolvedPair | null;
	onSelectTarget: (vertex: Vertex) => void;
	onSelectGhost: (vertex: Vertex) => void;
	onSelectConnection: (sourceVertex: Vertex, targetVertex: Vertex) => void;
	onSelectConnectionLine: (conn: { sourceVertex: Vertex; targetVertex: Vertex } | null) => void;
} = $props();
```

(Replicate the EXACT shape of the existing props block — only add the new line, do not reorder or remove existing props. The above is a guide; adapt to the actual existing structure.)

- [ ] **Step 2: Run typecheck**

```bash
npm run check 2>&1 | tail -3
```

The TileEditor.svelte will now show a TS error: `Property 'distortedGhost' is missing` because the call site doesn't pass it yet. We'll fix that in Task 8. For now, confirm no OTHER errors appeared.

- [ ] **Step 3: Commit**

```bash
git add src/components/modal/editor/tile-editor/RuleEditViewport.svelte
git commit -m "Add distortedGhost prop to RuleEditViewport (plumbing only)"
```

---

### Task 7: Implement distorted-ghost rendering in `RuleEditViewport.svelte`

**Files:**

- Modify: `src/components/modal/editor/tile-editor/RuleEditViewport.svelte`

When `distortedGhost` is non-null, the viewport replaces its synthetic-mirror rendering with the real pair. The unit-mode dashed bounding rect, ghost position, and connection lines all change.

This is the most complex task in the plan. It branches the render path on `distortedGhost`. The existing path (when `distortedGhost === null`) must remain byte-identical.

- [ ] **Step 1: Add a derived for distorted viewBox**

In the `<script>` block of `RuleEditViewport.svelte`, after the existing `canv` / `vertices` / `pathString` derivations, add:

```typescript
import { svgPathStringFromSegments } from '$lib/patterns/utils';

const distortedViewBox = $derived.by(() => {
	if (!distortedGhost) return null;
	const allCorners = [
		distortedGhost.mainQuad.a,
		distortedGhost.mainQuad.b,
		distortedGhost.mainQuad.c,
		distortedGhost.mainQuad.d,
		distortedGhost.ghostQuad.a,
		distortedGhost.ghostQuad.b,
		distortedGhost.ghostQuad.c,
		distortedGhost.ghostQuad.d
	];
	const xs = allCorners.map((p: any) => p.x);
	const ys = allCorners.map((p: any) => p.y);
	const padding = 4;
	const left = Math.min(...xs) - padding;
	const top = Math.min(...ys) - padding;
	const width = Math.max(...xs) - Math.min(...xs) + padding * 2;
	const height = Math.max(...ys) - Math.min(...ys) + padding * 2;
	return `${left} ${top} ${width} ${height}`;
});

const distortedMainPathStr = $derived(
	distortedGhost ? svgPathStringFromSegments(distortedGhost.mainPath) : ''
);
const distortedGhostPathStr = $derived(
	distortedGhost ? svgPathStringFromSegments(distortedGhost.ghostPath) : ''
);
```

- [ ] **Step 2: Branch the SVG render on `distortedGhost`**

Wrap the existing SVG element (the one that renders main + ghost in the synthetic-mirror style) in an `{#if distortedGhost}` / `{:else}` block. The `{#if}` branch renders the distorted view; the `{:else}` branch is the existing render verbatim.

The distorted branch (skeleton — adapt to actual existing render structure):

```svelte
{#if distortedGhost}
	<svg
		width={config.size.width}
		height={config.size.height}
		viewBox={distortedViewBox}
		class="canvas"
	>
		<!-- Main quad outline -->
		<polygon
			points="{distortedGhost.mainQuad.a.x},{distortedGhost.mainQuad.a.y} {distortedGhost.mainQuad.b
				.x},{distortedGhost.mainQuad.b.y} {distortedGhost.mainQuad.c.x},{distortedGhost.mainQuad.c
				.y} {distortedGhost.mainQuad.d.x},{distortedGhost.mainQuad.d.y}"
			class="unit-bounds"
		/>
		<!-- Ghost quad outline -->
		<polygon
			points="{distortedGhost.ghostQuad.a.x},{distortedGhost.ghostQuad.a.y} {distortedGhost
				.ghostQuad.b.x},{distortedGhost.ghostQuad.b.y} {distortedGhost.ghostQuad.c
				.x},{distortedGhost.ghostQuad.c.y} {distortedGhost.ghostQuad.d.x},{distortedGhost.ghostQuad
				.d.y}"
			class="ghost-bounds"
		/>
		<!-- Main pattern -->
		<path d={distortedMainPathStr} class="segments" />
		<!-- Ghost pattern (transform already baked) -->
		<path d={distortedGhostPathStr} class="ghost-segments" />
		<!-- Connection lines, vertices, ghost vertices, labels -->
		<!-- KEEP existing render code here, but use distorted vertex positions -->
	</svg>
{:else}
	<!-- EXISTING SVG render goes here unchanged -->
{/if}
```

The connection lines, vertices, ghost vertices, and labels need positions in the DISTORTED frame. To compute them:

- **Main vertices:** the spec's flat-index space maps 1:1 to vertex positions in `distortedGhost.mainPath`. Use `computeVerticesFromPath(distortedGhost.mainPath)` — a NEW helper to add to `segment-vertices.ts` if it doesn't exist already (the existing `computeVertices(unit)` works on a `UnitDefinition`, not a flat `PathSegment[]`). For this task: write a helper `computeVerticesFromFlatPath(path: PathSegment[]): Vertex[]` that walks the path, picks out M/L coordinates, dedupes by (x,y), and returns vertices with refs that match the flat indices of the path.

- **Ghost vertices:** `computeVerticesFromFlatPath(distortedGhost.ghostPath)` — same logic, but on the ghost path. The transform is already baked.

- **Connection lines:** for each rule, look up `distortedGhost.mainPath[rule.target]` and `distortedGhost.ghostPath[rule.source]`, draw a line between the two coordinates.

- **Vertex labels:** existing `UnitLabels.svelte` is unit-based. For the distorted branch, render labels inline (or extend `UnitLabels` to accept a vertices array directly). Use the inline approach to keep the existing `UnitLabels` interface stable.

The plan author has not implemented this branch fully because the rendering logic interlocks with the existing structure that this engineer needs to read first. The engineer must:

1. Read `RuleEditViewport.svelte` in full.
2. Read `segment-vertices.ts` and `vertex-addressing.ts` to see the helpers used.
3. Add `computeVerticesFromFlatPath` to `segment-vertices.ts`:

```typescript
export const computeVerticesFromFlatPath = (path: PathSegment[]): Vertex[] => {
	const byKey = new Map<string, Vertex>();
	for (let i = 0; i < path.length; i++) {
		const seg = path[i];
		if (!isMovePathSegment(seg) && !isLinePathSegment(seg)) continue;
		const x = seg[1];
		const y = seg[2];
		const key = `${x}::${y}`;
		const existing = byKey.get(key);
		if (existing) {
			// Single-group ref; flat index IS the path index for distorted rendering
			existing.refs.push({ group: 'middle', index: i });
		} else {
			byKey.set(key, { x, y, refs: [{ group: 'middle', index: i }] });
		}
	}
	return Array.from(byKey.values());
};
```

(The `group: 'middle'` and `index: i` here are nominal — distorted rendering uses the FLAT path index directly for rule lookups, not the unit's group-based addressing. Connection lines look up `path[rule.source]` / `path[rule.target]` with NO group offset.)

4. Implement the render for connection lines and vertices in the distorted branch using the new helper. Match the existing visual style (vertex circles, label sizes, line colors).

5. Use the existing `UnitLabels.svelte` for the main quad's vertices if possible; if `UnitLabels` requires a `UnitDefinition`, render labels inline in the distorted branch.

- [ ] **Step 3: Run typecheck**

```bash
npm run check 2>&1 | tail -3
```

Expected: TS errors at ~427 or slightly above. If significantly above, audit and fix.

- [ ] **Step 4: Run tests**

```bash
npm run test:unit 2>&1 | tail -5
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/modal/editor/tile-editor/RuleEditViewport.svelte src/components/modal/editor/segment-vertices.ts
git commit -m "Render distorted partner pair geometry in RuleEditViewport when distortedGhost is set"
```

---

### Task 8: Wire `PartnerPairChooser` and `distortedGhost` into `TileEditor.svelte`

**Files:**

- Modify: `src/components/modal/editor/TileEditor.svelte`

The TileEditor mounts the chooser only in `partnerStart` / `partnerEnd` modes for shield variants. It owns the `distortedGhost` rune and passes it through to `RuleEditViewport`.

- [ ] **Step 1: Add state and handler**

Read `src/components/modal/editor/TileEditor.svelte`. Near the other rune declarations, add:

```typescript
import PartnerPairChooser from './tile-editor/PartnerPairChooser.svelte';
import type { ResolvedPair } from './tile-editor/partner-pair-resolver';

let distortedGhost: ResolvedPair | null = $state(null);

const handleDistortedGhostChange = (snapshot: ResolvedPair | null) => {
	distortedGhost = snapshot;
};

const isShieldVariant = $derived(draft?.algorithm === 'shield-tesselation');
const isPartnerMode = $derived(mode === 'partnerStart' || mode === 'partnerEnd');
```

- [ ] **Step 2: Mount the chooser in partner modes**

Locate the template branch that renders `RuleEditViewport`. Wrap or extend it so that when `isPartnerMode && isShieldVariant`, the chooser is mounted alongside the viewport.

The existing layout uses a `.rule-row` flex container. Add the chooser as a sibling of the viewport — placement decision: chooser ABOVE the viewport (full-width row at the top of partner modes). The plan author's recommendation; engineer can deviate to "sidebar beside rule list" if it looks better visually:

```svelte
{#if isRuleMode(mode)}
	{#if isPartnerMode && isShieldVariant}
		<PartnerPairChooser {mode} onChange={handleDistortedGhostChange} />
	{/if}
	<div class="rule-row">
		<div class="viewport-wrap">
			<RuleEditViewport
				spec={draft}
				{mode}
				rules={getRulesForMode()}
				config={editorConfig}
				{selectedTarget}
				{selectedConnection}
				{distortedGhost}
				onSelectTarget={handleSelectTarget}
				onSelectGhost={handleSelectGhost}
				onSelectConnection={handleSelectConnection}
				onSelectConnectionLine={handleSelectConnectionLine}
			/>
		</div>
		<RuleList rules={getRulesForMode()} onDelete={handleDeleteRuleByIndex} />
	</div>
{:else if mode === 'skipRemove'}
	...
```

- [ ] **Step 3: Reset `distortedGhost` on mode change**

In `updateModeAndClearSelection`, add `distortedGhost = null;`:

```typescript
const updateModeAndClearSelection = (newMode: EditorMode) => {
	mode = newMode;
	tool = 'drag';
	selectedTarget = null;
	selectedConnection = null;
	distortedGhost = null;
};
```

Also reset in `handleDiscard` and `handleSelectVariant` (already reset selectedTarget/Connection there) for consistency:

```typescript
const handleDiscard = () => {
	selectedTarget = null;
	selectedConnection = null;
	distortedGhost = null;
	const found = findSpec(activeVariantId);
	...
};

const handleSelectVariant = (variantId: string) => {
	if (isDirty) {
		const proceed = window.confirm(...);
		if (!proceed) return;
	}
	selectedTarget = null;
	selectedConnection = null;
	distortedGhost = null;
	setActiveVariant(variantId);
};
```

- [ ] **Step 4: Run typecheck**

```bash
npm run check 2>&1 | tail -3
```

Expected: back to ~427 (Task 6's introduced "missing prop" error is now resolved).

- [ ] **Step 5: Run all tests**

```bash
npm run test:unit 2>&1 | tail -5
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/modal/editor/TileEditor.svelte
git commit -m "Mount PartnerPairChooser in shield partner modes; pass distortedGhost to viewport"
```

---

### Task 9: Final integration

**Files:** none changed — verification only.

- [ ] **Step 1: Run full unit test suite**

```bash
npm run test:unit 2>&1 | tail -7
```

Expected: 104 + 11 (new partner-pair-resolver tests) = 115 tests passing.

- [ ] **Step 2: Run typecheck**

```bash
npm run check 2>&1 | tail -3
```

Expected: TS errors at or near 427.

- [ ] **Step 3: Run lint, format**

```bash
npm run format
npm run lint 2>&1 | grep -E "(PartnerPairChooser|partner-pair-resolver|RuleEditViewport|TileEditor|Highlight|partnerHighlightStore)" | head -20
```

Expected: no NEW lint errors in the Phase 7 files. (Pre-existing errors in unrelated files are not Phase 7's concern.)

If `npm run format` modifies files, commit them:

```bash
git add -A
git commit -m "Apply Prettier formatting to Phase 7 files" || echo "no formatter changes"
```

- [ ] **Step 4: Manual smoke test**

Run `npm run dev`. Load a project that uses the shield pattern with `endsMatched: true` and at least one partner-pair (the existing default config produces this).

1. Open Tile Editor.
2. Switch to Partner Start mode → see the chooser sidebar above the viewport (or wherever you placed it).
3. Pick a pair from the dropdown → viewport renders the distorted geometry; 3D viewport highlights both partner facets in distinct colors.
4. Modify rowCount in TilingControl → "Model changed — Refresh?" banner appears.
5. Click Refresh → banner clears, geometry updates.
6. Switch to Within Band mode → chooser disappears, viewport shows synthetic ghost as before.
7. Switch back to Partner Start → chooser reappears with empty selection (default state, per spec Q3).
8. Pick a pair → click an existing connection line → press Delete → connection removed (existing rule editing flow works in distorted mode).
9. Switch to a non-shield variant (hex or box) → chooser does not render, partner mode shows synthetic mirror.

- [ ] **Step 5: Push branch**

```bash
git push 2>&1 | tail -3
```

---

## Self-Review Notes

**Spec coverage:**

- ✅ Real partner pair geometry (Tasks 2, 7)
- ✅ Chooser UI with dropdown + random + clear (Task 4)
- ✅ Snapshot semantics with model-change banner (Task 5)
- ✅ 3D pair highlighting via parallel store (Tasks 1, 3)
- ✅ Algorithm scoping — shield-only chooser (Task 8)
- ✅ Default state: empty chooser, symmetric mirror (Tasks 4, 8)
- ✅ Edge cases: no model, no partners, address resolution failure (Tasks 4, 5)
- ✅ Verification items (Task 9 manual smoke covers these)

**Type consistency check:**

- `ResolvedPair` defined in Task 2, used in Tasks 5, 6, 7, 8 with identical shape
- `PartnerMode` defined in Task 2, used in Task 4 chooser, mode is sourced from `EditorMode` in Task 8
- `partnerHighlightStore` (Task 1) writes `{start, end}` pair, read by Task 3's Highlight.svelte changes — consistent

**Acknowledged risks where the engineer must adapt:**

- Task 3 Step 2: BufferGeometry construction details may need adapting based on how `selectedProjectionGeometry` actually constructs facet geometry. Marked as escalation point.
- Task 4 Step 1: `superGlobulePatternStore` shape (`bandPatterns?.flatMap(...)`) is a guess. Engineer must verify the actual shape and adapt.
- Task 7 Step 2: distorted rendering interlocks with existing render structure. Engineer must read the existing component first and adapt the render branch to fit. The plan provides skeleton + helper code; the engineer fills the rendering logic.

These are not placeholders — they are explicit acknowledgments that the plan author hasn't verified those exact code paths. The engineer is instructed to read first and adapt with full context.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-03-tiled-pattern-editor-phase-7.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review, fast iteration
2. **Inline Execution** — execute tasks in this session using executing-plans, batch with checkpoints

Which approach?
