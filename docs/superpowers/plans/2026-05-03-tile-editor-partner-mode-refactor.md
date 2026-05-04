# Tile Editor: Partner Mode Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the 6-mode Tile Editor (Unit / Within Band / Across Bands / Partner Start / Partner End / Skip Remove) into 2 editors (Unit, Partner). The Partner editor renders a chosen base quad with up to 4 real-model partner quads around it, all editable in one viewport.

**Architecture:** New `PartnerEditor.svelte` orchestrates a cascading `BaseQuadSelector`, a fresh `PartnersViewport` that renders the base + partners with in-JS coordinate transforms, and a `PartnerRulesPanel` with subsections per rule set. A new pure module `partner-neighbors.ts` resolves the 4 partners around a base address, reusing `partner-pair-resolver` for cross-tube partners.

**Tech Stack:** SvelteKit, Svelte 5 (runes), TypeScript, Three.js / Threlte, Jest for unit tests.

**Spec:** `docs/superpowers/specs/2026-05-03-tile-editor-partner-mode-refactor-design.md`

---

## File Inventory

### Created
- `src/components/modal/editor/tile-editor/partner-neighbors.ts`
- `src/components/modal/editor/tile-editor/PartnerEditor.svelte`
- `src/components/modal/editor/tile-editor/BaseQuadSelector.svelte`
- `src/components/modal/editor/tile-editor/PartnersViewport.svelte`
- `src/components/modal/editor/tile-editor/PartnerRulesPanel.svelte`
- `src/components/modal/editor/tile-editor/__tests__/partner-neighbors.test.ts`

### Modified
- `src/components/modal/editor/TileEditor.svelte`
- `src/components/modal/editor/tile-editor/editor-mode.ts`
- `src/components/modal/editor/tile-editor/partner-pair-resolver.ts`
- `src/components/modal/editor/tile-editor/UnitToolbar.svelte`
- `src/components/modal/editor/SegmentPathEditor.svelte`
- `src/lib/stores/partnerHighlightStore.ts`
- `src/lib/stores/selectionStores.ts`
- `src/lib/stores/index.ts` (re-exports)
- `src/components/projection/Highlight.svelte`
- `src/components/three-renderer/materials.ts`

### Deleted
- `src/components/modal/editor/tile-editor/PartnerPairChooser.svelte`
- `src/components/modal/editor/tile-editor/RuleEditViewport.svelte`
- `src/components/modal/editor/tile-editor/ModeBar.svelte`
- `src/components/modal/editor/tile-editor/SkipRemoveViewport.svelte`
- `src/components/modal/editor/tile-editor/UnitLabels.svelte` (verify no other consumer first)

---

## Task 1: `partner-neighbors.ts` skeleton + types + first test

**Files:**
- Create: `src/components/modal/editor/tile-editor/partner-neighbors.ts`
- Test: `src/components/modal/editor/tile-editor/__tests__/partner-neighbors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/modal/editor/tile-editor/__tests__/partner-neighbors.test.ts
import { resolveBaseAndPartners } from '../partner-neighbors';
import type { BandCutPattern } from '$lib/types';

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
	facetCount = 3,
	options: any = {}
): BandCutPattern =>
	({
		projectionType: 'patterned',
		address: { globule: 0, tube, band: bandIdx },
		facets: Array.from({ length: facetCount }, (_, i) => makeFacet(bandIdx * 100 + i)),
		meta: options.meta
	}) as any;

describe('resolveBaseAndPartners', () => {
	it('returns null base when address is invalid', () => {
		const bands = [makeBand(0, 0)];
		const result = resolveBaseAndPartners(bands, {
			globule: 0,
			tube: 0,
			band: 99,
			facet: 0
		});
		expect(result).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/components/modal/editor/tile-editor/__tests__/partner-neighbors.test.ts`
Expected: FAIL with "Cannot find module '../partner-neighbors'"

- [ ] **Step 3: Create the module with types and stub**

```ts
// src/components/modal/editor/tile-editor/partner-neighbors.ts
import type { BandCutPattern, PathSegment, Quadrilateral } from '$lib/types';
import type { GlobuleAddress_Facet } from '$lib/projection-geometry/types';

export type PartnerRole = 'top' | 'bottom' | 'left' | 'right';
export type RuleSetKey = 'withinBand' | 'acrossBands' | 'partner.startEnd' | 'partner.endEnd';

export type ResolvedBase = {
	address: GlobuleAddress_Facet;
	quad: Quadrilateral;
	path: PathSegment[];
	originalPath?: PathSegment[];
};

export type ResolvedPartner = {
	role: PartnerRole;
	ruleSet: RuleSetKey;
	address: GlobuleAddress_Facet;
	quad: Quadrilateral;
	path: PathSegment[];
	originalPath?: PathSegment[];
};

export type PartnerBundle = {
	base: ResolvedBase;
	top: ResolvedPartner | null;
	bottom: ResolvedPartner | null;
	left: ResolvedPartner | null;
	right: ResolvedPartner | null;
};

const findBand = (
	bands: BandCutPattern[],
	tube: number,
	band: number
): BandCutPattern | undefined =>
	bands.find((b) => b.address.tube === tube && b.address.band === band);

export const resolveBaseAndPartners = (
	allBands: BandCutPattern[],
	baseAddress: GlobuleAddress_Facet
): PartnerBundle | null => {
	const baseBand = findBand(allBands, baseAddress.tube, baseAddress.band);
	if (!baseBand) return null;
	const baseFacet = baseBand.facets[baseAddress.facet];
	if (!baseFacet?.quad) return null;

	const base: ResolvedBase = {
		address: baseAddress,
		quad: baseFacet.quad,
		path: structuredClone(baseFacet.path),
		originalPath: baseFacet.meta?.originalPath
			? structuredClone(baseFacet.meta.originalPath)
			: undefined
	};

	return { base, top: null, bottom: null, left: null, right: null };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/components/modal/editor/tile-editor/__tests__/partner-neighbors.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/components/modal/editor/tile-editor/partner-neighbors.ts src/components/modal/editor/tile-editor/__tests__/partner-neighbors.test.ts
git commit -m "feat: add partner-neighbors skeleton with base resolution"
git push
```

---

## Task 2: Same-band top/bottom partner resolution

**Files:**
- Modify: `src/components/modal/editor/tile-editor/partner-neighbors.ts`
- Test: `src/components/modal/editor/tile-editor/__tests__/partner-neighbors.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/partner-neighbors.test.ts`:

```ts
describe('same-band top/bottom resolution', () => {
	it('resolves top as facet+1 within same band when not at end', () => {
		const bands = [makeBand(0, 0, 3)];
		const result = resolveBaseAndPartners(bands, { globule: 0, tube: 0, band: 0, facet: 1 });
		expect(result?.top?.role).toBe('top');
		expect(result?.top?.ruleSet).toBe('withinBand');
		expect(result?.top?.address.facet).toBe(2);
	});

	it('resolves bottom as facet-1 within same band when not at start', () => {
		const bands = [makeBand(0, 0, 3)];
		const result = resolveBaseAndPartners(bands, { globule: 0, tube: 0, band: 0, facet: 1 });
		expect(result?.bottom?.role).toBe('bottom');
		expect(result?.bottom?.ruleSet).toBe('withinBand');
		expect(result?.bottom?.address.facet).toBe(0);
	});

	it('omits top when base is the last facet (no cross-tube partner band)', () => {
		const bands = [makeBand(0, 0, 3)];
		const result = resolveBaseAndPartners(bands, { globule: 0, tube: 0, band: 0, facet: 2 });
		expect(result?.top).toBeNull();
	});

	it('omits bottom when base is facet 0 (no cross-tube partner band)', () => {
		const bands = [makeBand(0, 0, 3)];
		const result = resolveBaseAndPartners(bands, { globule: 0, tube: 0, band: 0, facet: 0 });
		expect(result?.bottom).toBeNull();
	});
});
```

- [ ] **Step 2: Run tests to see them fail**

Run: `npm run test:unit -- src/components/modal/editor/tile-editor/__tests__/partner-neighbors.test.ts`
Expected: FAIL — top/bottom are null in stub.

- [ ] **Step 3: Implement same-band resolution**

Replace the placeholder logic in `partner-neighbors.ts` so the function builds same-band partners when applicable:

```ts
// inside resolveBaseAndPartners, after computing `base`:

const sameBandTop = (): ResolvedPartner | null => {
	const next = baseBand.facets[baseAddress.facet + 1];
	if (!next?.quad) return null;
	return {
		role: 'top',
		ruleSet: 'withinBand',
		address: { ...baseAddress, facet: baseAddress.facet + 1 },
		quad: next.quad,
		path: structuredClone(next.path),
		originalPath: next.meta?.originalPath
			? structuredClone(next.meta.originalPath)
			: undefined
	};
};

const sameBandBottom = (): ResolvedPartner | null => {
	if (baseAddress.facet === 0) return null;
	const prev = baseBand.facets[baseAddress.facet - 1];
	if (!prev?.quad) return null;
	return {
		role: 'bottom',
		ruleSet: 'withinBand',
		address: { ...baseAddress, facet: baseAddress.facet - 1 },
		quad: prev.quad,
		path: structuredClone(prev.path),
		originalPath: prev.meta?.originalPath
			? structuredClone(prev.meta.originalPath)
			: undefined
	};
};

const top = sameBandTop();
const bottom = sameBandBottom();

return { base, top, bottom, left: null, right: null };
```

- [ ] **Step 4: Run tests**

Run: `npm run test:unit -- src/components/modal/editor/tile-editor/__tests__/partner-neighbors.test.ts`
Expected: PASS — 5 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/components/modal/editor/tile-editor/partner-neighbors.ts src/components/modal/editor/tile-editor/__tests__/partner-neighbors.test.ts
git commit -m "feat: resolve same-band top/bottom partners"
git push
```

---

## Task 3: Cross-tube partner resolution (Partner Start / End)

**Files:**
- Modify: `src/components/modal/editor/tile-editor/partner-neighbors.ts`
- Test: `src/components/modal/editor/tile-editor/__tests__/partner-neighbors.test.ts`

- [ ] **Step 1: Write the failing tests**

Append:

```ts
describe('cross-tube partner resolution', () => {
	it('resolves bottom as cross-tube partnerStart when base.facet === 0', () => {
		const bands = [
			makeBand(0, 0, 3, {
				meta: {
					startPartnerBand: { globule: 0, tube: 1, band: 0 }
				}
			}),
			makeBand(0, 1, 3, {
				meta: {
					endPartnerBand: { globule: 0, tube: 0, band: 0 }
				}
			})
		];
		const result = resolveBaseAndPartners(bands, { globule: 0, tube: 0, band: 0, facet: 0 });
		expect(result?.bottom?.role).toBe('bottom');
		expect(result?.bottom?.ruleSet).toBe('partner.startEnd');
		expect(result?.bottom?.address.tube).toBe(1);
		expect(result?.bottom?.address.band).toBe(0);
	});

	it('resolves top as cross-tube partnerEnd when base is the last facet', () => {
		const bands = [
			makeBand(0, 0, 3, {
				meta: {
					endPartnerBand: { globule: 0, tube: 1, band: 0 }
				}
			}),
			makeBand(0, 1, 3, {
				meta: {
					startPartnerBand: { globule: 0, tube: 0, band: 0 }
				}
			})
		];
		const result = resolveBaseAndPartners(bands, { globule: 0, tube: 0, band: 0, facet: 2 });
		expect(result?.top?.role).toBe('top');
		expect(result?.top?.ruleSet).toBe('partner.endEnd');
		expect(result?.top?.address.tube).toBe(1);
	});
});
```

- [ ] **Step 2: Run tests to see them fail**

Expected: FAIL — top/bottom are null at boundaries.

- [ ] **Step 3: Implement cross-tube resolution by delegating to `resolvePair`**

In `partner-neighbors.ts`, import the resolver and add cross-tube handling. Update the function so when `bottom` is null at `facet === 0` or `top` is null at the last facet, it tries cross-tube:

```ts
import { resolvePair } from './partner-pair-resolver';

// add after sameBandTop / sameBandBottom helpers, before the return:

const crossTubeBottom = (): ResolvedPartner | null => {
	if (baseAddress.facet !== 0) return null;
	const pair = resolvePair(allBands, baseAddress, 'partnerStart');
	if (!pair) return null;
	return {
		role: 'bottom',
		ruleSet: 'partner.startEnd',
		address: pair.ghostAddress,
		quad: pair.ghostQuad,
		path: pair.ghostPath,
		originalPath: pair.ghostOriginalPath
	};
};

const crossTubeTop = (): ResolvedPartner | null => {
	if (baseAddress.facet !== baseBand.facets.length - 1) return null;
	const pair = resolvePair(allBands, baseAddress, 'partnerEnd');
	if (!pair) return null;
	return {
		role: 'top',
		ruleSet: 'partner.endEnd',
		address: pair.ghostAddress,
		quad: pair.ghostQuad,
		path: pair.ghostPath,
		originalPath: pair.ghostOriginalPath
	};
};

const top = sameBandTop() ?? crossTubeTop();
const bottom = sameBandBottom() ?? crossTubeBottom();
```

- [ ] **Step 4: Run tests**

Expected: PASS — 7 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/components/modal/editor/tile-editor/partner-neighbors.ts src/components/modal/editor/tile-editor/__tests__/partner-neighbors.test.ts
git commit -m "feat: resolve cross-tube top/bottom partners"
git push
```

---

## Task 4: Left/right partner resolution with rigid 2-point transform

**Files:**
- Modify: `src/components/modal/editor/tile-editor/partner-neighbors.ts`
- Test: `src/components/modal/editor/tile-editor/__tests__/partner-neighbors.test.ts`

- [ ] **Step 1: Write the failing tests**

Append:

```ts
describe('left/right partner resolution', () => {
	it('resolves right partner from band+1 same tube', () => {
		const bands = [makeBand(0, 0), makeBand(1, 0)];
		const result = resolveBaseAndPartners(bands, { globule: 0, tube: 0, band: 0, facet: 1 });
		expect(result?.right?.role).toBe('right');
		expect(result?.right?.ruleSet).toBe('acrossBands');
		expect(result?.right?.address.band).toBe(1);
		expect(result?.right?.address.facet).toBe(1);
	});

	it('resolves left partner from band-1 same tube', () => {
		const bands = [makeBand(0, 0), makeBand(1, 0)];
		const result = resolveBaseAndPartners(bands, { globule: 0, tube: 0, band: 1, facet: 1 });
		expect(result?.left?.role).toBe('left');
		expect(result?.left?.ruleSet).toBe('acrossBands');
		expect(result?.left?.address.band).toBe(0);
	});

	it('omits left/right when adjacent band missing', () => {
		const bands = [makeBand(0, 0)]; // only one band in the tube
		const result = resolveBaseAndPartners(bands, { globule: 0, tube: 0, band: 0, facet: 1 });
		expect(result?.left).toBeNull();
		expect(result?.right).toBeNull();
	});

	it('positions right partner so its left edge coincides with base right edge', () => {
		// base quad: a=(0,0), b=(5,0), c=(5,5), d=(0,5) — width 5, height 5
		// right partner pre-transform: a=(100,0), b=(105,0), c=(105,5), d=(100,5)
		// after rigid transform: partner.a should land on base.b=(5,0), partner.d on base.c=(5,5)
		const baseFacet = {
			path: [
				['M', 0, 0],
				['L', 5, 0]
			],
			quad: { a: { x: 0, y: 0, z: 0 }, b: { x: 5, y: 0, z: 0 }, c: { x: 5, y: 5, z: 0 }, d: { x: 0, y: 5, z: 0 } },
			label: '0'
		} as any;
		const rightFacet = {
			path: [
				['M', 100, 0],
				['L', 105, 0]
			],
			quad: { a: { x: 100, y: 0, z: 0 }, b: { x: 105, y: 0, z: 0 }, c: { x: 105, y: 5, z: 0 }, d: { x: 100, y: 5, z: 0 } },
			label: '0'
		} as any;
		const baseBand = {
			projectionType: 'patterned',
			address: { globule: 0, tube: 0, band: 0 },
			facets: [baseFacet]
		} as any;
		const rightBand = {
			projectionType: 'patterned',
			address: { globule: 0, tube: 0, band: 1 },
			facets: [rightFacet]
		} as any;
		const result = resolveBaseAndPartners([baseBand, rightBand], {
			globule: 0,
			tube: 0,
			band: 0,
			facet: 0
		});
		const r = result?.right;
		expect(r).not.toBeNull();
		expect(r!.quad.a.x).toBeCloseTo(5);
		expect(r!.quad.a.y).toBeCloseTo(0);
		expect(r!.quad.d.x).toBeCloseTo(5);
		expect(r!.quad.d.y).toBeCloseTo(5);
	});
});
```

- [ ] **Step 2: Run tests to see them fail**

Expected: FAIL — left/right are null.

- [ ] **Step 3: Implement rigid-transform helper and left/right resolution**

In `partner-neighbors.ts`:

```ts
type Pt = { x: number; y: number };

// Rigid 2-point transform: returns a function that maps src1→dst1, src2→dst2
// (assumes |src2-src1| = |dst2-dst1|, true under isometric flattening).
const rigidFromTwoPoints = (
	src1: Pt,
	src2: Pt,
	dst1: Pt,
	dst2: Pt
): ((p: Pt) => Pt) => {
	const srcAng = Math.atan2(src2.y - src1.y, src2.x - src1.x);
	const dstAng = Math.atan2(dst2.y - dst1.y, dst2.x - dst1.x);
	const theta = dstAng - srcAng;
	const cos = Math.cos(theta);
	const sin = Math.sin(theta);
	const tx = dst1.x - (cos * src1.x - sin * src1.y);
	const ty = dst1.y - (sin * src1.x + cos * src1.y);
	return (p: Pt) => ({
		x: cos * p.x - sin * p.y + tx,
		y: sin * p.x + cos * p.y + ty
	});
};

const transformQuadFn = (q: Quadrilateral, fn: (p: Pt) => Pt): Quadrilateral =>
	({
		a: { ...fn(q.a), z: q.a.z },
		b: { ...fn(q.b), z: q.b.z },
		c: { ...fn(q.c), z: q.c.z },
		d: { ...fn(q.d), z: q.d.z }
	}) as unknown as Quadrilateral;

const transformPathFn = (path: PathSegment[], fn: (p: Pt) => Pt): PathSegment[] =>
	path.map((seg) => {
		if (seg[0] === 'M' || seg[0] === 'L') {
			const p = fn({ x: seg[1] as number, y: seg[2] as number });
			return [seg[0], p.x, p.y] as PathSegment;
		}
		return seg;
	});

const resolveLeft = (): ResolvedPartner | null => {
	const left = findBand(allBands, baseAddress.tube, baseAddress.band - 1);
	if (!left) return null;
	const facet = left.facets[baseAddress.facet];
	if (!facet?.quad) return null;
	// partner's right edge (b-c) coincides with base's left edge (a-d):
	const fn = rigidFromTwoPoints(facet.quad.b, facet.quad.c, baseFacet.quad.a, baseFacet.quad.d);
	return {
		role: 'left',
		ruleSet: 'acrossBands',
		address: { globule: baseAddress.globule, tube: baseAddress.tube, band: baseAddress.band - 1, facet: baseAddress.facet },
		quad: transformQuadFn(facet.quad, fn),
		path: transformPathFn(structuredClone(facet.path), fn),
		originalPath: facet.meta?.originalPath
			? transformPathFn(structuredClone(facet.meta.originalPath), fn)
			: undefined
	};
};

const resolveRight = (): ResolvedPartner | null => {
	const right = findBand(allBands, baseAddress.tube, baseAddress.band + 1);
	if (!right) return null;
	const facet = right.facets[baseAddress.facet];
	if (!facet?.quad) return null;
	// partner's left edge (a-d) coincides with base's right edge (b-c):
	const fn = rigidFromTwoPoints(facet.quad.a, facet.quad.d, baseFacet.quad.b, baseFacet.quad.c);
	return {
		role: 'right',
		ruleSet: 'acrossBands',
		address: { globule: baseAddress.globule, tube: baseAddress.tube, band: baseAddress.band + 1, facet: baseAddress.facet },
		quad: transformQuadFn(facet.quad, fn),
		path: transformPathFn(structuredClone(facet.path), fn),
		originalPath: facet.meta?.originalPath
			? transformPathFn(structuredClone(facet.meta.originalPath), fn)
			: undefined
	};
};

const left = resolveLeft();
const right = resolveRight();

return { base, top, bottom, left, right };
```

- [ ] **Step 4: Run tests**

Expected: PASS — 11 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/components/modal/editor/tile-editor/partner-neighbors.ts src/components/modal/editor/tile-editor/__tests__/partner-neighbors.test.ts
git commit -m "feat: resolve left/right partners with rigid 2-point transform"
git push
```

---

## Task 5: BaseQuadSelector cascading dropdowns

**Files:**
- Create: `src/components/modal/editor/tile-editor/BaseQuadSelector.svelte`

- [ ] **Step 1: Create the component**

```svelte
<!-- src/components/modal/editor/tile-editor/BaseQuadSelector.svelte -->
<script lang="ts">
	import { superGlobulePatternStore } from '$lib/stores/superGlobuleStores';
	import type { BandCutPattern } from '$lib/types';
	import type { PartnerHighlightSource } from '$lib/stores/partnerHighlightStore';

	export type BaseQuadAddress = {
		source: PartnerHighlightSource;
		globule: number;
		tube: number;
		band: number;
		facet: number;
	};

	let {
		value,
		onChange
	}: {
		value: BaseQuadAddress | null;
		onChange: (next: BaseQuadAddress | null) => void;
	} = $props();

	type SourcedTubes = { source: PartnerHighlightSource; tubes: { bands: BandCutPattern[] }[] };

	const allSources = $derived.by((): SourcedTubes[] => {
		const tubesOf = (raw: any): { bands: BandCutPattern[] }[] | undefined =>
			raw?.projectionCutPattern?.tubes ?? raw?.tubes;
		const out: SourcedTubes[] = [];
		const proj = tubesOf($superGlobulePatternStore?.projectionPattern);
		if (proj && proj.length) out.push({ source: 'projection', tubes: proj });
		const surf = tubesOf($superGlobulePatternStore?.surfaceProjectionPattern);
		if (surf && surf.length) out.push({ source: 'surface', tubes: surf });
		const gt = tubesOf($superGlobulePatternStore?.globuleTubePattern);
		if (gt && gt.length) out.push({ source: 'globuleTube', tubes: gt });
		return out;
	});

	const sourceLabel = (s: PartnerHighlightSource): string =>
		s === 'globuleTube' ? 'globule tube' : s;

	let pendingSource: PartnerHighlightSource | null = $state(null);
	let pendingTube: number | null = $state(null);
	let pendingBand: number | null = $state(null);
	let pendingFacet: number | null = $state(null);

	// Sync pending state from external value (e.g. parent reset). Guard against
	// no-op writes so we don't fire onChange in a loop.
	$effect(() => {
		const next = {
			source: value?.source ?? null,
			tube: value?.tube ?? null,
			band: value?.band ?? null,
			facet: value?.facet ?? null
		};
		if (
			next.source !== pendingSource ||
			next.tube !== pendingTube ||
			next.band !== pendingBand ||
			next.facet !== pendingFacet
		) {
			pendingSource = next.source;
			pendingTube = next.tube;
			pendingBand = next.band;
			pendingFacet = next.facet;
		}
	});

	const setSelections = (
		s: PartnerHighlightSource | null,
		t: number | null,
		b: number | null,
		f: number | null
	) => {
		pendingSource = s;
		pendingTube = t;
		pendingBand = b;
		pendingFacet = f;
		if (s !== null && t !== null && b !== null && f !== null) {
			onChange({ source: s, globule: 0, tube: t, band: b, facet: f });
		} else {
			onChange(null);
		}
	};

	const onSourceChange = (e: Event) => {
		const v = (e.currentTarget as HTMLSelectElement).value as PartnerHighlightSource | '';
		setSelections(v || null, null, null, null);
	};
	const onTubeChange = (e: Event) => {
		const v = (e.currentTarget as HTMLSelectElement).value;
		setSelections(pendingSource, v === '' ? null : Number(v), null, null);
	};
	const onBandChange = (e: Event) => {
		const v = (e.currentTarget as HTMLSelectElement).value;
		setSelections(pendingSource, pendingTube, v === '' ? null : Number(v), null);
	};
	const onFacetChange = (e: Event) => {
		const v = (e.currentTarget as HTMLSelectElement).value;
		setSelections(pendingSource, pendingTube, pendingBand, v === '' ? null : Number(v));
	};

	const tubesForCurrent = $derived(
		pendingSource ? (allSources.find((s) => s.source === pendingSource)?.tubes ?? []) : []
	);
	const bandsForCurrent = $derived(
		pendingTube !== null ? (tubesForCurrent[pendingTube]?.bands ?? []) : []
	);
	const facetsForCurrent = $derived(
		pendingBand !== null ? (bandsForCurrent[pendingBand]?.facets.length ?? 0) : 0
	);
</script>

<div class="base-quad-selector">
	<div class="title">Base quad</div>
	<div class="row">
		<select value={pendingSource ?? ''} onchange={onSourceChange}>
			<option value="">— source —</option>
			{#each allSources as s (s.source)}
				<option value={s.source}>{sourceLabel(s.source)}</option>
			{/each}
		</select>

		<select value={pendingTube ?? ''} onchange={onTubeChange} disabled={pendingSource === null}>
			<option value="">— tube —</option>
			{#each tubesForCurrent as _, i (i)}
				<option value={i}>Tube {i}</option>
			{/each}
		</select>

		<select value={pendingBand ?? ''} onchange={onBandChange} disabled={pendingTube === null}>
			<option value="">— band —</option>
			{#each bandsForCurrent as _, i (i)}
				<option value={i}>Band {i}</option>
			{/each}
		</select>

		<select value={pendingFacet ?? ''} onchange={onFacetChange} disabled={pendingBand === null}>
			<option value="">— quad —</option>
			{#each Array(facetsForCurrent) as _, i (i)}
				<option value={i}>Quad {i}</option>
			{/each}
		</select>
	</div>
</div>

<style>
	.base-quad-selector {
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
	select {
		flex: 1;
	}
	select:disabled {
		opacity: 0.4;
	}
</style>
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: no new errors introduced by this file (baseline still ~427 pre-existing errors).

- [ ] **Step 3: Commit**

```bash
git add src/components/modal/editor/tile-editor/BaseQuadSelector.svelte
git commit -m "feat: add BaseQuadSelector cascading dropdown"
git push
```

---

## Task 6: PartnerRulesPanel

**Files:**
- Create: `src/components/modal/editor/tile-editor/PartnerRulesPanel.svelte`

- [ ] **Step 1: Create the component**

```svelte
<!-- src/components/modal/editor/tile-editor/PartnerRulesPanel.svelte -->
<script lang="ts">
	import type { IndexPair } from '$lib/patterns/spec-types';
	import RuleList from './RuleList.svelte';
	import type { RuleSetKey } from './partner-neighbors';

	let {
		withinBand,
		acrossBands,
		partnerStartEnd,
		partnerEndEnd,
		onDelete
	}: {
		withinBand: IndexPair[];
		acrossBands: IndexPair[];
		partnerStartEnd: IndexPair[];
		partnerEndEnd: IndexPair[];
		onDelete: (ruleSet: RuleSetKey, index: number) => void;
	} = $props();
</script>

<div class="rules-panel">
	<div class="section">
		<div class="section-title" style:color="rgb(120, 80, 30)">Within Band</div>
		<RuleList
			rules={withinBand}
			onDelete={(i) => onDelete('withinBand', i)}
			sourceColor="rgb(120, 80, 30)"
			targetColor="rgb(80, 130, 200)"
		/>
	</div>
	<div class="section">
		<div class="section-title" style:color="rgb(60, 60, 60)">Across Bands</div>
		<RuleList
			rules={acrossBands}
			onDelete={(i) => onDelete('acrossBands', i)}
			sourceColor="rgb(60, 60, 60)"
			targetColor="rgb(80, 130, 200)"
		/>
	</div>
	<div class="section">
		<div class="section-title" style:color="rgb(180, 0, 0)">Partner Start</div>
		<RuleList
			rules={partnerStartEnd}
			onDelete={(i) => onDelete('partner.startEnd', i)}
			sourceColor="rgb(180, 0, 0)"
			targetColor="rgb(80, 130, 200)"
		/>
	</div>
	<div class="section">
		<div class="section-title" style:color="rgb(0, 140, 0)">Partner End</div>
		<RuleList
			rules={partnerEndEnd}
			onDelete={(i) => onDelete('partner.endEnd', i)}
			sourceColor="rgb(0, 140, 0)"
			targetColor="rgb(80, 130, 200)"
		/>
	</div>
</div>

<style>
	.rules-panel {
		flex: 0 0 220px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px;
		border-left: 1px dotted black;
	}
	.section-title {
		font-weight: bold;
		font-size: 0.85em;
		margin-bottom: 2px;
	}
</style>
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/modal/editor/tile-editor/PartnerRulesPanel.svelte
git commit -m "feat: add PartnerRulesPanel with per-rule-set subsections"
git push
```

---

## Task 7: PartnersViewport scaffolding + viewport transform helper

**Files:**
- Create: `src/components/modal/editor/tile-editor/PartnersViewport.svelte`

- [ ] **Step 1: Create the component scaffold with viewport transform**

```svelte
<!-- src/components/modal/editor/tile-editor/PartnersViewport.svelte -->
<script lang="ts">
	import type { PathSegment, Quadrilateral } from '$lib/types';
	import type { IndexPair } from '$lib/patterns/spec-types';
	import { svgPathStringFromSegments } from '$lib/patterns/utils';
	import type { Vertex } from '../segment-vertices';
	import type { PartnerBundle, PartnerRole, ResolvedPartner } from './partner-neighbors';

	export type PartnerSelection = {
		role: PartnerRole | 'base';
		vertex: Vertex;
	};

	let {
		bundle,
		withinBand,
		acrossBands,
		partnerStartEnd,
		partnerEndEnd,
		size = { width: 800, height: 500 },
		onAddRule,
		onDeleteConnection
	}: {
		bundle: PartnerBundle;
		withinBand: IndexPair[];
		acrossBands: IndexPair[];
		partnerStartEnd: IndexPair[];
		partnerEndEnd: IndexPair[];
		size?: { width: number; height: number };
		onAddRule: (partner: ResolvedPartner, baseVertex: Vertex, partnerVertex: Vertex) => void;
		onDeleteConnection: (
			partner: ResolvedPartner,
			baseVertex: Vertex,
			partnerVertex: Vertex
		) => void;
	} = $props();

	type Pt = { x: number; y: number };

	// Stage 2 viewport transform: rotate so base.d→c is along +x, translate so bbox center is origin.
	const viewportTransform = $derived.by(() => {
		const q = bundle.base.quad;
		const angle = Math.atan2(q.c.y - q.d.y, q.c.x - q.d.x);
		const cos = Math.cos(-angle);
		const sin = Math.sin(-angle);

		const partners = [bundle.top, bundle.bottom, bundle.left, bundle.right].filter(
			(p): p is ResolvedPartner => p !== null
		);
		const corners: Pt[] = [];
		const rotateOnly = (p: Pt): Pt => ({ x: cos * p.x - sin * p.y, y: sin * p.x + cos * p.y });
		for (const c of [q.a, q.b, q.c, q.d] as Pt[]) corners.push(rotateOnly(c));
		for (const p of partners) {
			for (const c of [p.quad.a, p.quad.b, p.quad.c, p.quad.d] as unknown as Pt[]) {
				corners.push(rotateOnly(c));
			}
		}
		const xs = corners.map((c) => c.x);
		const ys = corners.map((c) => c.y);
		const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
		const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
		return { cos, sin, tx: -cx, ty: -cy };
	});

	const tp = (x: number, y: number): Pt => {
		const { cos, sin, tx, ty } = viewportTransform;
		return { x: cos * x - sin * y + tx, y: sin * x + cos * y + ty };
	};

	const transformPath = (path: PathSegment[]): PathSegment[] =>
		path.map((seg) => {
			if (seg[0] === 'M' || seg[0] === 'L') {
				const p = tp(seg[1] as number, seg[2] as number);
				return [seg[0], p.x, p.y] as PathSegment;
			}
			return seg;
		});

	const transformQuad = (q: Quadrilateral): Quadrilateral =>
		({
			a: { ...tp(q.a.x, q.a.y), z: q.a.z },
			b: { ...tp(q.b.x, q.b.y), z: q.b.z },
			c: { ...tp(q.c.x, q.c.y), z: q.c.z },
			d: { ...tp(q.d.x, q.d.y), z: q.d.z }
		}) as unknown as Quadrilateral;

	const tBaseQuad = $derived(transformQuad(bundle.base.quad));
	const tBasePath = $derived(transformPath(bundle.base.path));
	const tBaseOriginal = $derived(
		bundle.base.originalPath ? transformPath(bundle.base.originalPath) : null
	);

	const tPartner = (p: ResolvedPartner | null) =>
		p
			? {
					...p,
					quad: transformQuad(p.quad),
					path: transformPath(p.path),
					originalPath: p.originalPath ? transformPath(p.originalPath) : undefined
				}
			: null;

	const tTop = $derived(tPartner(bundle.top));
	const tBottom = $derived(tPartner(bundle.bottom));
	const tLeft = $derived(tPartner(bundle.left));
	const tRight = $derived(tPartner(bundle.right));

	const viewBox = $derived.by(() => {
		const partners = [tTop, tBottom, tLeft, tRight].filter((p) => p !== null);
		const corners: Pt[] = [tBaseQuad.a, tBaseQuad.b, tBaseQuad.c, tBaseQuad.d] as any;
		for (const p of partners) {
			corners.push(p!.quad.a, p!.quad.b, p!.quad.c, p!.quad.d);
		}
		const xs = corners.map((c) => c.x);
		const ys = corners.map((c) => c.y);
		const padding = 4;
		const halfW = Math.max(Math.abs(Math.min(...xs)), Math.abs(Math.max(...xs))) + padding;
		const halfH = Math.max(Math.abs(Math.min(...ys)), Math.abs(Math.max(...ys))) + padding;
		return `${-halfW} ${-halfH} ${halfW * 2} ${halfH * 2}`;
	});

	// Stroke / font scale relative to a 42-unit reference (matches unit-mode look).
	const scale = $derived.by(() => {
		const xs = [tBaseQuad.a.x, tBaseQuad.b.x, tBaseQuad.c.x, tBaseQuad.d.x];
		const ys = [tBaseQuad.a.y, tBaseQuad.b.y, tBaseQuad.c.y, tBaseQuad.d.y];
		const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
		return Math.max(span / 42, 0.5);
	});
</script>

<div class="container" style:width="{size.width}px" style:height="{size.height}px">
	<svg width={size.width} height={size.height} {viewBox} class="canvas">
		<!-- placeholder; quads, paths, vertices added in subsequent tasks -->
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
</style>
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: no new errors. (`svgPathStringFromSegments` is unused at this point; that's fine — it'll be used in Task 9.)

- [ ] **Step 3: Commit**

```bash
git add src/components/modal/editor/tile-editor/PartnersViewport.svelte
git commit -m "feat: PartnersViewport scaffolding with viewport transform"
git push
```

---

## Task 8: Render base + partner quads as filled polygons

**Files:**
- Modify: `src/components/modal/editor/tile-editor/PartnersViewport.svelte`

- [ ] **Step 1: Add color map and quad polygons**

Add a color map below the existing derivations:

```ts
const ROLE_FILL: Record<PartnerRole | 'base', string> = {
	base: 'rgba(80, 130, 200, 0.1)',
	top: 'rgba(180, 140, 80, 0.1)',
	bottom: 'rgba(180, 140, 80, 0.1)',
	left: 'rgba(120, 120, 120, 0.1)',
	right: 'rgba(120, 120, 120, 0.1)'
};
const ROLE_FILL_CROSS_TUBE_TOP = 'rgba(0, 200, 0, 0.1)';
const ROLE_FILL_CROSS_TUBE_BOTTOM = 'rgba(220, 0, 0, 0.1)';

const fillFor = (
	role: PartnerRole | 'base',
	partner: ResolvedPartner | null
): string => {
	if (role === 'base') return ROLE_FILL.base;
	if (partner?.ruleSet === 'partner.endEnd') return ROLE_FILL_CROSS_TUBE_TOP;
	if (partner?.ruleSet === 'partner.startEnd') return ROLE_FILL_CROSS_TUBE_BOTTOM;
	return ROLE_FILL[role];
};

const partnersList = $derived(
	[tTop, tBottom, tLeft, tRight].filter((p): p is NonNullable<typeof tTop> => p !== null)
);
```

Replace the `<svg>` body's placeholder with:

```svelte
<svg width={size.width} height={size.height} {viewBox} class="canvas">
	<polygon
		points="{tBaseQuad.a.x},{tBaseQuad.a.y} {tBaseQuad.b.x},{tBaseQuad.b.y} {tBaseQuad.c.x},{tBaseQuad.c.y} {tBaseQuad.d.x},{tBaseQuad.d.y}"
		style:fill={fillFor('base', null)}
		stroke="rgba(0,0,0,0.15)"
		stroke-width={0.2 * scale}
		stroke-dasharray="{0.5 * scale},{0.5 * scale}"
	/>
	{#each partnersList as p (p.role)}
		<polygon
			points="{p.quad.a.x},{p.quad.a.y} {p.quad.b.x},{p.quad.b.y} {p.quad.c.x},{p.quad.c.y} {p.quad.d.x},{p.quad.d.y}"
			style:fill={fillFor(p.role, p)}
			stroke="rgba(0,0,0,0.1)"
			stroke-width={0.2 * scale}
			stroke-dasharray="{0.5 * scale},{0.5 * scale}"
		/>
	{/each}
</svg>
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/modal/editor/tile-editor/PartnersViewport.svelte
git commit -m "feat: render base + partner quads in PartnersViewport"
git push
```

---

## Task 9: Render adjusted + original paths

**Files:**
- Modify: `src/components/modal/editor/tile-editor/PartnersViewport.svelte`

- [ ] **Step 1: Add path rendering**

Add a stroke-color map alongside the fill map:

```ts
const ORIGINAL_STROKE: Record<PartnerRole | 'base', string> = {
	base: 'rgba(40, 70, 130, 0.3)',
	top: 'rgba(120, 80, 30, 0.3)',
	bottom: 'rgba(120, 80, 30, 0.3)',
	left: 'rgba(60, 60, 60, 0.3)',
	right: 'rgba(60, 60, 60, 0.3)'
};
const ORIGINAL_STROKE_CROSS_TUBE_TOP = 'rgba(0, 90, 0, 0.3)';
const ORIGINAL_STROKE_CROSS_TUBE_BOTTOM = 'rgba(90, 0, 0, 0.3)';

const originalStrokeFor = (
	role: PartnerRole | 'base',
	partner: ResolvedPartner | null
): string => {
	if (role === 'base') return ORIGINAL_STROKE.base;
	if (partner?.ruleSet === 'partner.endEnd') return ORIGINAL_STROKE_CROSS_TUBE_TOP;
	if (partner?.ruleSet === 'partner.startEnd') return ORIGINAL_STROKE_CROSS_TUBE_BOTTOM;
	return ORIGINAL_STROKE[role];
};
```

Inside the `<svg>`, add path rendering AFTER the polygons:

```svelte
{#if tBaseOriginal}
	<path
		d={svgPathStringFromSegments(tBaseOriginal)}
		fill="none"
		stroke={originalStrokeFor('base', null)}
		style:stroke-width="{0.4 * scale}"
	/>
{/if}
{#each partnersList as p (p.role + ':orig')}
	{#if p.originalPath}
		<path
			d={svgPathStringFromSegments(p.originalPath)}
			fill="none"
			stroke={originalStrokeFor(p.role, p)}
			style:stroke-width="{0.4 * scale}"
		/>
	{/if}
{/each}

<path
	d={svgPathStringFromSegments(tBasePath)}
	fill="none"
	stroke="black"
	style:stroke-width="{0.4 * scale}"
/>
{#each partnersList as p (p.role + ':path')}
	<path
		d={svgPathStringFromSegments(p.path)}
		fill="none"
		stroke="black"
		style:stroke-width="{0.4 * scale}"
	/>
{/each}
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/modal/editor/tile-editor/PartnersViewport.svelte
git commit -m "feat: render adjusted + original paths in PartnersViewport"
git push
```

---

## Task 10: Render rule connection lines + click-to-select + Delete

**Files:**
- Modify: `src/components/modal/editor/tile-editor/PartnersViewport.svelte`

- [ ] **Step 1: Add connection rendering and selection state**

Add to the script section:

```ts
import { computeVerticesFromFlatPath } from '../segment-vertices';

const baseVertices = $derived(computeVerticesFromFlatPath(tBasePath));
const partnerVertices = $derived(
	new Map(partnersList.map((p) => [p.role, computeVerticesFromFlatPath(p.path)]))
);

let selectedConnection: {
	partnerRole: PartnerRole;
	baseVertex: Vertex;
	partnerVertex: Vertex;
} | null = $state(null);

const findVertexAtFlatIndex = (vs: Vertex[], idx: number): Vertex | undefined =>
	vs.find((v) => v.refs.some((r) => r.index === idx));

type ConnectionLine = {
	partner: ResolvedPartner;
	baseVertex: Vertex;
	partnerVertex: Vertex;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
};

const connectionsFor = (rules: IndexPair[], partner: ResolvedPartner | null): ConnectionLine[] => {
	if (!partner) return [];
	const pVerts = partnerVertices.get(partner.role) ?? [];
	const out: ConnectionLine[] = [];
	for (const rule of rules) {
		const t = tBasePath[rule.target];
		const s = partner.path[rule.source];
		if (!t || !s) continue;
		const tx = (t as any)[1];
		const ty = (t as any)[2];
		const sx = (s as any)[1];
		const sy = (s as any)[2];
		if (typeof tx !== 'number' || typeof sx !== 'number') continue;
		const baseV = findVertexAtFlatIndex(baseVertices, rule.target);
		const partnerV = findVertexAtFlatIndex(pVerts, rule.source);
		if (!baseV || !partnerV) continue;
		out.push({ partner, baseVertex: baseV, partnerVertex: partnerV, x1: tx, y1: ty, x2: sx, y2: sy });
	}
	return out;
};

const allConnections = $derived.by(() => {
	const out: ConnectionLine[] = [];
	if (tTop) out.push(...connectionsFor(tTop.ruleSet === 'withinBand' ? withinBand : partnerEndEnd, tTop));
	if (tBottom) out.push(...connectionsFor(tBottom.ruleSet === 'withinBand' ? withinBand : partnerStartEnd, tBottom));
	if (tLeft) out.push(...connectionsFor(acrossBands, tLeft));
	if (tRight) out.push(...connectionsFor(acrossBands, tRight));
	return out;
});

$effect(() => {
	const onKey = (e: KeyboardEvent) => {
		if ((e.key === 'Delete' || e.key === 'Backspace') && selectedConnection) {
			const partner = partnersList.find((p) => p.role === selectedConnection!.partnerRole);
			if (partner) {
				onDeleteConnection(partner, selectedConnection.baseVertex, selectedConnection.partnerVertex);
				selectedConnection = null;
			}
		}
		if (e.key === 'Escape') selectedConnection = null;
	};
	window.addEventListener('keydown', onKey);
	return () => window.removeEventListener('keydown', onKey);
});
```

In the `<svg>`, after the path rendering, add:

```svelte
{#each allConnections as conn (conn.partner.role + ':' + conn.x1 + ':' + conn.y1 + ':' + conn.x2 + ':' + conn.y2)}
	<line
		x1={conn.x1}
		y1={conn.y1}
		x2={conn.x2}
		y2={conn.y2}
		class="connection"
		class:selected={selectedConnection?.partnerRole === conn.partner.role &&
			selectedConnection?.baseVertex === conn.baseVertex &&
			selectedConnection?.partnerVertex === conn.partnerVertex}
		style:stroke-width="{0.3 * scale}"
		onclick={() =>
			(selectedConnection = {
				partnerRole: conn.partner.role,
				baseVertex: conn.baseVertex,
				partnerVertex: conn.partnerVertex
			})}
	/>
{/each}
```

Add CSS:

```css
.connection {
	stroke: rgba(0, 100, 200, 0.7);
	stroke-width: 0.3;
	cursor: pointer;
}
.connection:hover {
	stroke: rgba(0, 100, 200, 1);
}
.connection.selected {
	stroke: red;
}
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/modal/editor/tile-editor/PartnersViewport.svelte
git commit -m "feat: render rule connection lines with click-to-select and delete"
git push
```

---

## Task 11: Render vertex circles + click flow for adding rules

**Files:**
- Modify: `src/components/modal/editor/tile-editor/PartnersViewport.svelte`

- [ ] **Step 1: Add vertex rendering and selection state**

Add to the script:

```ts
let selectedBaseVertex: Vertex | null = $state(null);

const handleBaseVertexClick = (v: Vertex) => {
	if (selectedBaseVertex === v) {
		selectedBaseVertex = null;
	} else {
		selectedBaseVertex = v;
	}
};

const handlePartnerVertexClick = (partner: ResolvedPartner, v: Vertex) => {
	if (!selectedBaseVertex) return;
	onAddRule(partner, selectedBaseVertex, v);
	selectedBaseVertex = null;
};
```

In the `<svg>`, after connections, add:

```svelte
{#each baseVertices as v (v.x + ':' + v.y + ':base')}
	<circle
		cx={v.x}
		cy={v.y}
		r={0.5 * scale}
		class="base-vertex"
		class:selected={selectedBaseVertex === v}
		style:stroke-width="{0.15 * scale}"
		onclick={() => handleBaseVertexClick(v)}
	/>
{/each}
{#each partnersList as p (p.role + ':vs')}
	{#each partnerVertices.get(p.role) ?? [] as v (v.x + ':' + v.y + ':' + p.role)}
		<circle
			cx={v.x}
			cy={v.y}
			r={0.5 * scale}
			class="partner-vertex"
			style:stroke-width="{0.15 * scale}"
			onclick={() => handlePartnerVertexClick(p, v)}
		/>
	{/each}
{/each}
```

Add CSS:

```css
.base-vertex {
	fill: white;
	stroke: rgb(80, 130, 200);
	cursor: pointer;
}
.base-vertex.selected {
	fill: orange;
}
.partner-vertex {
	fill: rgba(255, 255, 255, 0.6);
	stroke: rgba(0, 0, 0, 0.5);
	cursor: pointer;
}
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/modal/editor/tile-editor/PartnersViewport.svelte
git commit -m "feat: render vertex circles with click-to-add-rule flow"
git push
```

---

## Task 12: Rule-aware vertex labels

**Files:**
- Modify: `src/components/modal/editor/tile-editor/PartnersViewport.svelte`

- [ ] **Step 1: Add labeled-vertex computation and rendering**

Add to the script:

```ts
const ROLE_LABEL_COLOR: Record<PartnerRole | 'base', string> = {
	base: 'rgb(80, 130, 200)',
	top: 'rgb(120, 80, 30)',
	bottom: 'rgb(120, 80, 30)',
	left: 'rgb(60, 60, 60)',
	right: 'rgb(60, 60, 60)'
};
const ROLE_LABEL_CROSS_TOP = 'rgb(0, 140, 0)';
const ROLE_LABEL_CROSS_BOTTOM = 'rgb(180, 0, 0)';

const labelColorFor = (
	role: PartnerRole | 'base',
	partner: ResolvedPartner | null
): string => {
	if (role === 'base') return ROLE_LABEL_COLOR.base;
	if (partner?.ruleSet === 'partner.endEnd') return ROLE_LABEL_CROSS_TOP;
	if (partner?.ruleSet === 'partner.startEnd') return ROLE_LABEL_CROSS_BOTTOM;
	return ROLE_LABEL_COLOR[role];
};

const baseRuleTargetIndices = $derived.by(() => {
	const set = new Set<number>();
	for (const r of withinBand) set.add(r.target);
	for (const r of acrossBands) set.add(r.target);
	for (const r of partnerStartEnd) set.add(r.target);
	for (const r of partnerEndEnd) set.add(r.target);
	return set;
});

const partnerRuleSourceIndices = (partner: ResolvedPartner): Set<number> => {
	const rules =
		partner.ruleSet === 'withinBand'
			? withinBand
			: partner.ruleSet === 'acrossBands'
				? acrossBands
				: partner.ruleSet === 'partner.startEnd'
					? partnerStartEnd
					: partnerEndEnd;
	return new Set(rules.map((r) => r.source));
};

const baseLabeledVertices = $derived(
	baseVertices.filter((v) =>
		v.refs.some((r) => baseRuleTargetIndices.has(r.index))
	)
);
```

In the `<svg>`, after vertices, add:

```svelte
{#each baseLabeledVertices as v (v.x + ':' + v.y + ':blbl')}
	<text
		x={v.x}
		y={v.y - 0.7 * scale}
		font-size={0.8 * scale}
		text-anchor="middle"
		dominant-baseline="text-after-edge"
		fill={labelColorFor('base', null)}
		pointer-events="none"
		style="user-select: none;"
	>
		{v.refs[0]?.index ?? ''}
	</text>
{/each}
{#each partnersList as p (p.role + ':lbl')}
	{@const sources = partnerRuleSourceIndices(p)}
	{@const verts = (partnerVertices.get(p.role) ?? []).filter((v) =>
		v.refs.some((r) => sources.has(r.index))
	)}
	{#each verts as v (v.x + ':' + v.y + ':' + p.role + ':lbl')}
		<text
			x={v.x}
			y={v.y + 0.7 * scale}
			font-size={0.8 * scale}
			text-anchor="middle"
			dominant-baseline="text-before-edge"
			fill={labelColorFor(p.role, p)}
			pointer-events="none"
			style="user-select: none;"
		>
			{v.refs[0]?.index ?? ''}
		</text>
	{/each}
{/each}
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/modal/editor/tile-editor/PartnersViewport.svelte
git commit -m "feat: rule-aware vertex labels in PartnersViewport"
git push
```

---

## Task 13: Hover tooltip with all flat indices

**Files:**
- Modify: `src/components/modal/editor/tile-editor/PartnersViewport.svelte`

- [ ] **Step 1: Add tooltip state and rendering**

Add to the script:

```ts
let tooltip: {
	x: number;
	y: number;
	indices: number[];
	color: string;
} | null = $state(null);

const tooltipFor = (v: Vertex, color: string) => {
	const all = new Set<number>();
	for (const r of v.refs) all.add(r.index);
	tooltip = {
		x: v.x,
		y: v.y,
		indices: Array.from(all).sort((a, b) => a - b),
		color
	};
};

const clearTooltip = () => {
	tooltip = null;
};
```

Update vertex circles to set tooltip on mouseenter:

```svelte
{#each baseVertices as v (v.x + ':' + v.y + ':base')}
	<circle
		cx={v.x}
		cy={v.y}
		r={0.5 * scale}
		class="base-vertex"
		class:selected={selectedBaseVertex === v}
		style:stroke-width="{0.15 * scale}"
		onclick={() => handleBaseVertexClick(v)}
		onmouseenter={() => tooltipFor(v, labelColorFor('base', null))}
		onmouseleave={clearTooltip}
	/>
{/each}
{#each partnersList as p (p.role + ':vs')}
	{#each partnerVertices.get(p.role) ?? [] as v (v.x + ':' + v.y + ':' + p.role)}
		<circle
			cx={v.x}
			cy={v.y}
			r={0.5 * scale}
			class="partner-vertex"
			style:stroke-width="{0.15 * scale}"
			onclick={() => handlePartnerVertexClick(p, v)}
			onmouseenter={() => tooltipFor(v, labelColorFor(p.role, p))}
			onmouseleave={clearTooltip}
		/>
	{/each}
{/each}
```

Render tooltip outside the SVG, inside the container:

```svelte
{#if tooltip}
	<div
		class="tooltip"
		style:left="{((tooltip.x + parseFloat(viewBox.split(' ')[2]) / 2) / parseFloat(viewBox.split(' ')[2])) * size.width + 8}px"
		style:top="{((tooltip.y + parseFloat(viewBox.split(' ')[3]) / 2) / parseFloat(viewBox.split(' ')[3])) * size.height + 8}px"
		style:border-left-color={tooltip.color}
	>
		{tooltip.indices.join(', ')}
	</div>
{/if}
```

Add CSS:

```css
.tooltip {
	position: absolute;
	background: white;
	border: 1px solid rgba(0, 0, 0, 0.3);
	border-left-width: 3px;
	padding: 2px 6px;
	font-size: 0.8em;
	pointer-events: none;
	white-space: nowrap;
}
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/modal/editor/tile-editor/PartnersViewport.svelte
git commit -m "feat: vertex hover tooltip with all flat indices"
git push
```

---

## Task 14: PartnerEditor wiring (selector + viewport + panel) with snapshot

**Files:**
- Create: `src/components/modal/editor/tile-editor/PartnerEditor.svelte`

- [ ] **Step 1: Create PartnerEditor**

```svelte
<!-- src/components/modal/editor/tile-editor/PartnerEditor.svelte -->
<script lang="ts">
	import type { TiledPatternSpec, IndexPair } from '$lib/patterns/spec-types';
	import { superGlobulePatternStore } from '$lib/stores/superGlobuleStores';
	import { partnerHighlightStore } from '$lib/stores/partnerHighlightStore';
	import type { BandCutPattern } from '$lib/types';
	import BaseQuadSelector, { type BaseQuadAddress } from './BaseQuadSelector.svelte';
	import PartnersViewport from './PartnersViewport.svelte';
	import PartnerRulesPanel from './PartnerRulesPanel.svelte';
	import {
		resolveBaseAndPartners,
		type PartnerBundle,
		type ResolvedPartner,
		type RuleSetKey
	} from './partner-neighbors';
	import { onDestroy } from 'svelte';
	import type { Vertex } from '../segment-vertices';
	import { addRuleForPairing, removeRulesForPairing } from '../vertex-addressing';

	let {
		spec,
		onChange
	}: {
		spec: TiledPatternSpec;
		onChange: (next: TiledPatternSpec) => void;
	} = $props();

	let address: BaseQuadAddress | null = $state(null);
	let snapshot: PartnerBundle | null = $state(null);

	const tubesForSource = (source: string): { bands: BandCutPattern[] }[] | undefined => {
		const tubesOf = (raw: any): { bands: BandCutPattern[] }[] | undefined =>
			raw?.projectionCutPattern?.tubes ?? raw?.tubes;
		if (source === 'projection') return tubesOf($superGlobulePatternStore?.projectionPattern);
		if (source === 'surface') return tubesOf($superGlobulePatternStore?.surfaceProjectionPattern);
		if (source === 'globuleTube') return tubesOf($superGlobulePatternStore?.globuleTubePattern);
		return undefined;
	};

	const flattenBands = (source: string): BandCutPattern[] => {
		const tubes = tubesForSource(source);
		return tubes?.flatMap((t) => t.bands) ?? [];
	};

	const handleAddressChange = (next: BaseQuadAddress | null) => {
		address = next;
		if (!next) {
			snapshot = null;
			partnerHighlightStore.set({ source: 'projection', base: null, top: null, bottom: null, left: null, right: null });
			return;
		}
		const bands = flattenBands(next.source);
		const fresh = resolveBaseAndPartners(bands, {
			globule: next.globule,
			tube: next.tube,
			band: next.band,
			facet: next.facet
		});
		snapshot = fresh;
		writeHighlight(next.source as any, fresh);
	};

	const writeHighlight = (source: any, b: PartnerBundle | null) => {
		partnerHighlightStore.set({
			source,
			base: b?.base.address ?? null,
			top: b?.top?.address ?? null,
			bottom: b?.bottom?.address ?? null,
			left: b?.left?.address ?? null,
			right: b?.right?.address ?? null
		});
	};

	const ruleArray = (key: RuleSetKey): IndexPair[] => {
		if (key === 'withinBand') return spec.adjustments.withinBand;
		if (key === 'acrossBands') return spec.adjustments.acrossBands;
		if (key === 'partner.startEnd') return spec.adjustments.partner.startEnd;
		return spec.adjustments.partner.endEnd;
	};

	const setRuleArray = (key: RuleSetKey, next: IndexPair[]) => {
		const updated: TiledPatternSpec = $state.snapshot(spec) as TiledPatternSpec;
		const clean: IndexPair[] = next.map((r) => ({ source: r.source, target: r.target }));
		if (key === 'withinBand') updated.adjustments.withinBand = clean;
		else if (key === 'acrossBands') updated.adjustments.acrossBands = clean;
		else if (key === 'partner.startEnd') updated.adjustments.partner.startEnd = clean;
		else updated.adjustments.partner.endEnd = clean;
		onChange(updated);
	};

	const handleAddRule = (partner: ResolvedPartner, baseVertex: Vertex, partnerVertex: Vertex) => {
		const next = addRuleForPairing(ruleArray(partner.ruleSet), spec.unit, baseVertex, partnerVertex);
		setRuleArray(partner.ruleSet, next);
	};

	const handleDeleteConnection = (
		partner: ResolvedPartner,
		baseVertex: Vertex,
		partnerVertex: Vertex
	) => {
		const next = removeRulesForPairing(ruleArray(partner.ruleSet), spec.unit, baseVertex, partnerVertex);
		setRuleArray(partner.ruleSet, next);
	};

	const handleDeleteIndex = (key: RuleSetKey, index: number) => {
		const arr = ruleArray(key);
		setRuleArray(key, arr.filter((_, i) => i !== index));
	};

	onDestroy(() => {
		partnerHighlightStore.set({ source: 'projection', base: null, top: null, bottom: null, left: null, right: null });
	});
</script>

<div class="partner-editor">
	<BaseQuadSelector value={address} onChange={handleAddressChange} />
	<div class="row">
		<div class="viewport-wrap">
			{#if snapshot}
				<PartnersViewport
					bundle={snapshot}
					withinBand={spec.adjustments.withinBand}
					acrossBands={spec.adjustments.acrossBands}
					partnerStartEnd={spec.adjustments.partner.startEnd}
					partnerEndEnd={spec.adjustments.partner.endEnd}
					onAddRule={handleAddRule}
					onDeleteConnection={handleDeleteConnection}
				/>
			{:else}
				<div class="empty">Select a base quad to begin.</div>
			{/if}
		</div>
		<PartnerRulesPanel
			withinBand={spec.adjustments.withinBand}
			acrossBands={spec.adjustments.acrossBands}
			partnerStartEnd={spec.adjustments.partner.startEnd}
			partnerEndEnd={spec.adjustments.partner.endEnd}
			onDelete={handleDeleteIndex}
		/>
	</div>
</div>

<style>
	.partner-editor {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.row {
		display: flex;
		flex-direction: row;
	}
	.viewport-wrap {
		padding: 8px;
		flex: 1;
	}
	.empty {
		padding: 32px;
		color: rgba(0, 0, 0, 0.5);
		text-align: center;
	}
</style>
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: errors related to the not-yet-extended `partnerHighlightStore` shape (still has `start`/`end`). That gets fixed in Task 16. Confirm no other new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/modal/editor/tile-editor/PartnerEditor.svelte
git commit -m "feat: PartnerEditor wires selector, viewport, rules panel"
git push
```

---

## Task 15: PartnerEditor refresh banner with diff detection

**Files:**
- Modify: `src/components/modal/editor/tile-editor/PartnerEditor.svelte`

- [ ] **Step 1: Add live-pair derivation, diff, and banner**

In the script of `PartnerEditor.svelte`, add:

```ts
const livePair = $derived.by((): PartnerBundle | null => {
	if (!address) return null;
	const bands = flattenBands(address.source);
	return resolveBaseAndPartners(bands, {
		globule: address.globule,
		tube: address.tube,
		band: address.band,
		facet: address.facet
	});
});

const isStale = $derived.by(() => {
	if (!snapshot) return false;
	if (!livePair) return true;
	return JSON.stringify(snapshot) !== JSON.stringify(livePair);
});

const handleRefresh = () => {
	if (!address) return;
	snapshot = livePair;
	writeHighlight(address.source as any, livePair);
};

const handleClear = () => {
	address = null;
	snapshot = null;
	writeHighlight(null as any, null);
};
```

In the template, add the banner above the viewport:

```svelte
{#if isStale && livePair}
	<div class="banner">
		⚠ Model changed
		<button onclick={handleRefresh}>Refresh</button>
	</div>
{:else if isStale && !livePair}
	<div class="banner">
		Selection no longer valid
		<button onclick={handleClear}>Clear</button>
	</div>
{/if}
```

Add CSS:

```css
.banner {
	display: flex;
	gap: 6px;
	align-items: center;
	font-size: 0.85em;
	color: #b00020;
	padding: 4px 8px;
}
.banner button {
	font-size: 0.85em;
}
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: same as Task 14 (will resolve in Task 16).

- [ ] **Step 3: Commit**

```bash
git add src/components/modal/editor/tile-editor/PartnerEditor.svelte
git commit -m "feat: refresh banner with live diff detection in PartnerEditor"
git push
```

---

## Task 16: Update partnerHighlightStore + selectionStores + Highlight + materials

**Files:**
- Modify: `src/lib/stores/partnerHighlightStore.ts`
- Modify: `src/lib/stores/selectionStores.ts`
- Modify: `src/lib/stores/index.ts`
- Modify: `src/components/projection/Highlight.svelte`
- Modify: `src/components/three-renderer/materials.ts`

- [ ] **Step 1: Replace partnerHighlightStore shape**

```ts
// src/lib/stores/partnerHighlightStore.ts
import { writable } from 'svelte/store';
import type { GlobuleAddress_Facet } from '$lib/projection-geometry/types';

export type PartnerHighlightSource = 'projection' | 'surface' | 'globuleTube';

export type PartnerHighlight = {
	source: PartnerHighlightSource;
	base: GlobuleAddress_Facet | null;
	top: GlobuleAddress_Facet | null;
	bottom: GlobuleAddress_Facet | null;
	left: GlobuleAddress_Facet | null;
	right: GlobuleAddress_Facet | null;
};

export const partnerHighlightStore = writable<PartnerHighlight>({
	source: 'projection',
	base: null,
	top: null,
	bottom: null,
	left: null,
	right: null
});
```

- [ ] **Step 2: Add new materials**

In `src/components/three-renderer/materials.ts`, add to the `materials` object (alongside existing entries):

```ts
import { Color, MeshStandardMaterial, MeshPhysicalMaterial, DoubleSide } from 'three';

// inside the materials object:
partnerBase: new MeshStandardMaterial({
	color: new Color('rgb(80, 130, 200)'),
	transparent: true,
	opacity: 0.7,
	side: DoubleSide
}),
partnerWithinBand: new MeshStandardMaterial({
	color: new Color('rgb(180, 140, 80)'),
	transparent: true,
	opacity: 0.7,
	side: DoubleSide
}),
partnerAcrossBands: new MeshStandardMaterial({
	color: new Color('rgb(120, 120, 120)'),
	transparent: true,
	opacity: 0.7,
	side: DoubleSide
}),
```

- [ ] **Step 3: Replace `chooserPairGeometry` with `partnerHighlightGeometry`**

In `src/lib/stores/selectionStores.ts`, replace lines 473-518 (the `ChooserPairGeometry` type and `chooserPairGeometry` derived store) with:

```ts
export type HighlightRole = 'base' | 'top' | 'bottom' | 'left' | 'right';

export type PartnerHighlightEntry = {
	role: HighlightRole;
	geometry: BufferGeometry;
};

export const partnerHighlightGeometry = derived(
	[partnerHighlightStore, superGlobuleStore],
	([$partnerHighlightStore, $superGlobuleStore]): PartnerHighlightEntry[] => {
		const all = [
			$partnerHighlightStore.base,
			$partnerHighlightStore.top,
			$partnerHighlightStore.bottom,
			$partnerHighlightStore.left,
			$partnerHighlightStore.right
		];
		if (all.every((a) => a === null)) return [];

		const tubesForSource = (globuleIdx: number) => {
			const proj = $superGlobuleStore.projections[globuleIdx];
			if ($partnerHighlightStore.source === 'surface') return proj?.surfaceProjectionTubes;
			if ($partnerHighlightStore.source === 'globuleTube') return $superGlobuleStore.globuleTubes;
			return proj?.tubes;
		};

		const facetToGeometry = (addr: GlobuleAddress_Facet | null): BufferGeometry | null => {
			if (!addr) return null;
			const tubes = tubesForSource(addr.globule);
			const band = tubes?.[addr.tube]?.bands[addr.band];
			if (!band) return null;
			const t1 = band.facets[addr.facet * 2];
			const t2 = band.facets[addr.facet * 2 + 1];
			const points = [];
			if (t1?.triangle) points.push(t1.triangle.a, t1.triangle.b, t1.triangle.c);
			if (t2?.triangle) points.push(t2.triangle.a, t2.triangle.b, t2.triangle.c);
			if (points.length === 0) return null;
			const geom = new BufferGeometry().setFromPoints(points);
			geom.computeVertexNormals();
			return geom;
		};

		const entries: PartnerHighlightEntry[] = [];
		const roles: HighlightRole[] = ['base', 'top', 'bottom', 'left', 'right'];
		for (const role of roles) {
			const g = facetToGeometry($partnerHighlightStore[role]);
			if (g) entries.push({ role, geometry: g });
		}
		return entries;
	}
);
```

- [ ] **Step 4: Update `src/lib/stores/index.ts`**

Replace the `chooserPairGeometry` re-export with `partnerHighlightGeometry`. Open the file, find the line that re-exports `chooserPairGeometry`, and rename it to `partnerHighlightGeometry`.

- [ ] **Step 5: Replace Highlight.svelte**

```svelte
<!-- src/components/projection/Highlight.svelte -->
<script lang="ts">
	import { materials } from '../three-renderer/materials';
	import { selectedProjectionGeometry, partnerHighlightGeometry } from '$lib/stores';
	import type { HighlightRole } from '$lib/stores/selectionStores';
	import { T } from '@threlte/core';

	const partnerActive = $derived($partnerHighlightGeometry.length > 0);

	const materialFor = (role: HighlightRole) => {
		if (role === 'base') return materials.partnerBase;
		if (role === 'top' || role === 'bottom') {
			// cross-tube uses red/green; same-band uses beige.
			// Without context here, default to beige; cross-tube is overridden via numbered[] below.
			return materials.partnerWithinBand;
		}
		return materials.partnerAcrossBands;
	};
</script>

{#if $selectedProjectionGeometry && !partnerActive}
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

{#each $partnerHighlightGeometry as entry (entry.role)}
	<T.Mesh geometry={entry.geometry} material={materialFor(entry.role)} />
{/each}
```

- [ ] **Step 6: Type-check**

Run: `npm run check`
Expected: errors should clear for the highlight system. The PartnerPairChooser still imports from the old store shape — fine, it gets deleted later; for now if the build breaks we can leave it imported but unused (it's not mounted by TileEditor after Task 17). For now, also adjust `PartnerPairChooser.svelte` minimally to compile: if it still imports `partnerHighlightStore.set({ ..., start, end })`, comment out or replace with `set({ source, base: null, top: null, bottom: null, left: null, right: null })`.

```bash
# quick fix to keep the obsolete PartnerPairChooser compiling until Task 19 deletes it:
```

Open `src/components/modal/editor/tile-editor/PartnerPairChooser.svelte` and replace every call site of `partnerHighlightStore.set({ ... })` with the new 6-field shape (using `null`s for highlight roles). The file will still type-check; it's no longer mounted anywhere after Task 17.

- [ ] **Step 7: Commit**

```bash
git add src/lib/stores/partnerHighlightStore.ts src/lib/stores/selectionStores.ts src/lib/stores/index.ts src/components/projection/Highlight.svelte src/components/three-renderer/materials.ts src/components/modal/editor/tile-editor/PartnerPairChooser.svelte
git commit -m "feat: extend partner highlight system to 5 roles"
git push
```

---

## Task 17: Replace ModeBar with binary toggle in TileEditor; mount PartnerEditor

**Files:**
- Modify: `src/components/modal/editor/TileEditor.svelte`
- Modify: `src/components/modal/editor/tile-editor/editor-mode.ts`

- [ ] **Step 1: Simplify `editor-mode.ts`**

```ts
// src/components/modal/editor/tile-editor/editor-mode.ts
export type EditorMode = 'unit' | 'partner';
```

(All previously-exported helpers will become unused. They're cleaned up in Task 19.)

- [ ] **Step 2: Rewrite TileEditor's mode handling**

In `src/components/modal/editor/TileEditor.svelte`, replace the import of `ModeBar` and the conditional body of `<Container>` with the new structure:

Update imports:

```ts
import PartnerEditor from './tile-editor/PartnerEditor.svelte';
// remove: import ModeBar from './tile-editor/ModeBar.svelte';
// remove: import RuleEditViewport from './tile-editor/RuleEditViewport.svelte';
// remove: import RuleList from './tile-editor/RuleList.svelte';  (still imported by PartnerRulesPanel internally; remove from TileEditor only)
// remove: import SkipRemoveViewport from './tile-editor/SkipRemoveViewport.svelte';
// remove: import PartnerPairChooser
// remove: import { isRuleMode } / ghostTransform / etc.
```

Replace the mode handling. Since rule editing now lives entirely inside `PartnerEditor`, the rule-mode handlers and partner chooser branches are no longer needed. Remove `getRulesForMode`, `setRulesForMode`, `handleSelectTarget`, `handleSelectGhost`, `handleSelectConnection`, `handleSelectConnectionLine`, `handleDeleteRuleByIndex`, `handleDistortedGhostChange`, `selectedTarget`, `selectedConnection`, `distortedGhost`, `isPartnerMode`, `isShieldVariant`.

Add a binary mode state:

```ts
let mode: EditorMode = $state('unit');
```

Replace the template body:

```svelte
<Editor>
	<section>
		<header>Tile Editor</header>
		<Container direction="column">
			<VariantBar
				{draft}
				{isDirty}
				{isBuiltIn}
				{validationError}
				availableVariants={variantList}
				onSelectVariant={handleSelectVariant}
				onSave={handleSave}
				onSaveAs={handleSaveAs}
				onDiscard={handleDiscard}
				onDelete={handleDelete}
			/>
			<div class="mode-toggle">
				<button class:active={mode === 'unit'} onclick={() => (mode = 'unit')}>Unit</button>
				<button class:active={mode === 'partner'} onclick={() => (mode = 'partner')}>Partner</button>
			</div>
			{#if draft}
				{#if mode === 'unit'}
					<UnitToolbar
						{tool}
						{group}
						onChangeTool={(t) => (tool = t)}
						onChangeGroup={(g) => (group = g)}
					/>
					<div class="viewport-wrap">
						<SegmentPathEditor
							unit={draft.unit}
							config={editorConfig}
							{tool}
							skipRemove={draft.adjustments.skipRemove}
							onChangeUnit={handleUnitChange}
							onAddVertex={handleAddVertex}
							onRemoveVertex={handleRemoveVertex}
							onToggleSkip={handleToggleSkip}
						/>
					</div>
				{:else}
					<PartnerEditor spec={draft} onChange={(next) => { draft = next; isDirty = true; }} />
				{/if}
			{:else}
				<div class="empty">No variant selected.</div>
			{/if}
		</Container>
	</section>
</Editor>
```

Add CSS for `.mode-toggle`:

```css
.mode-toggle {
	display: flex;
	gap: 4px;
	padding: 6px;
	border-bottom: 1px dotted black;
}
.mode-toggle button.active {
	background-color: rgba(0, 0, 0, 0.15);
	font-weight: bold;
}
```

Simplify `editorConfig` since the four rule modes are gone — just compute it for the unit-pattern bounds:

```ts
const editorConfig: PathEditorConfig = $derived.by(() => {
	const currentDraft: TiledPatternSpec | null = draft;
	const unitWidth = currentDraft?.unit.width ?? 42;
	const unitHeight = currentDraft?.unit.height ?? 14;
	const padding = 4;
	const left = -2;
	const top = -2;
	const contentWidth = unitWidth + 4;
	const contentHeight = unitHeight + 4;
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

Update `handleSelectVariant` and `handleDiscard` to clear `mode = 'unit'` rather than the removed ghost/distorted state.

- [ ] **Step 3: Type-check**

Run: `npm run check`
Expected: errors limited to the still-existing unused imports / dead helper exports in `editor-mode.ts` (cleaned up in Task 19), plus errors in `SegmentPathEditor.svelte` until Task 18 wires `skipRemove` and `onToggleSkip` props (acceptable for this commit).

To keep the build green right now, defer the `skipRemove`/`onToggleSkip` props until Task 18 by REMOVING `handleToggleSkip` and the new SegmentPathEditor props from this commit. Bring them back in Task 18.

Use this minimal SegmentPathEditor mount instead:

```svelte
<SegmentPathEditor
	unit={draft.unit}
	config={editorConfig}
	{tool}
	onChangeUnit={handleUnitChange}
	onAddVertex={handleAddVertex}
	onRemoveVertex={handleRemoveVertex}
/>
```

And remove `handleToggleSkip` for now (it'll come back in Task 18).

- [ ] **Step 4: Manual verify in dev**

Run: `npm run dev`
Open the Tile Editor floater. Confirm:
- Unit / Partner toggle is present.
- Unit mode renders the segment path editor as before.
- Partner mode renders the `BaseQuadSelector` with 4 dropdowns; viewport area shows "Select a base quad to begin." until source/tube/band/quad are picked.
- Selecting a base quad with at least 2 facets in its band renders the base + at least one same-band partner.

- [ ] **Step 5: Commit**

```bash
git add src/components/modal/editor/TileEditor.svelte src/components/modal/editor/tile-editor/editor-mode.ts
git commit -m "feat: replace ModeBar with binary Unit/Partner toggle; mount PartnerEditor"
git push
```

---

## Task 18: Migrate Skip Remove from top-level mode to Unit tool

**Files:**
- Modify: `src/components/modal/editor/tile-editor/UnitToolbar.svelte`
- Modify: `src/components/modal/editor/SegmentPathEditor.svelte`
- Modify: `src/components/modal/editor/TileEditor.svelte`

- [ ] **Step 1: Extend `UnitTool` and add a button**

In `UnitToolbar.svelte`, add `'skipRemove'` to the `UnitTool` union and add a third toggle button labeled "Skip Remove".

```ts
export type UnitTool = 'drag' | 'add' | 'remove' | 'skipRemove';
```

Append the new button alongside the existing tool buttons in the template.

- [ ] **Step 2: Add Skip Remove rendering to SegmentPathEditor**

Open `src/components/modal/editor/tile-editor/SkipRemoveViewport.svelte` first to copy its rendering approach.

In `SegmentPathEditor.svelte`, accept new props:

```ts
import { flatIndexes } from './vertex-addressing';
import { computeVertices } from './segment-vertices';

let {
	unit,
	config,
	tool,
	skipRemove = [],
	onChangeUnit,
	onAddVertex,
	onRemoveVertex,
	onToggleSkip
}: {
	unit: UnitDefinition;
	config: PathEditorConfig;
	tool: UnitTool;
	skipRemove?: number[];
	onChangeUnit: (unit: UnitDefinition) => void;
	onAddVertex: (x: number, y: number) => void;
	onRemoveVertex: (vertex: Vertex) => void;
	onToggleSkip?: (vertex: Vertex) => void;
} = $props();

const vertices = $derived(computeVertices(unit));
const skipSet = $derived(new Set(skipRemove));
const isVertexSkipped = (v: Vertex): boolean => {
	const idxs = flatIndexes(unit, v);
	return idxs.every((i) => skipSet.has(i));
};
```

In the SVG body, when `tool === 'skipRemove'`, render an overlay (alongside or replacing the drag/add/remove vertex circles):

```svelte
{#if tool === 'skipRemove'}
	{#each vertices as v (v.x + ':' + v.y + ':skip')}
		<circle
			cx={v.x}
			cy={v.y}
			r="0.6"
			fill={isVertexSkipped(v) ? 'rgba(220, 0, 0, 0.6)' : 'white'}
			stroke={isVertexSkipped(v) ? 'rgb(160, 0, 0)' : 'rgb(80, 80, 80)'}
			stroke-width="0.15"
			style="cursor: pointer"
			onclick={() => onToggleSkip?.(v)}
		/>
	{/each}
{/if}
```

The existing rendering for `tool === 'drag' | 'add' | 'remove'` stays as-is, gated by the corresponding tool checks. Only the `skipRemove` branch is new.

- [ ] **Step 3: Wire `handleToggleSkip` back into TileEditor**

Restore the previously-removed `handleToggleSkip` in `TileEditor.svelte`:

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

Pass the new props to `SegmentPathEditor`:

```svelte
<SegmentPathEditor
	unit={draft.unit}
	config={editorConfig}
	{tool}
	skipRemove={draft.adjustments.skipRemove}
	onChangeUnit={handleUnitChange}
	onAddVertex={handleAddVertex}
	onRemoveVertex={handleRemoveVertex}
	onToggleSkip={handleToggleSkip}
/>
```

- [ ] **Step 4: Manual verify in dev**

Run: `npm run dev`
Confirm:
- Unit mode has a "Skip Remove" tool button alongside drag/add/remove.
- Selecting it lets the user click vertices to toggle them in/out of `skipRemove`.

- [ ] **Step 5: Commit**

```bash
git add src/components/modal/editor/tile-editor/UnitToolbar.svelte src/components/modal/editor/SegmentPathEditor.svelte src/components/modal/editor/TileEditor.svelte
git commit -m "feat: fold Skip Remove into Unit editor as a tool"
git push
```

---

## Task 19: Cleanup — delete deprecated files; trim editor-mode and resolver

**Files:**
- Delete: `src/components/modal/editor/tile-editor/PartnerPairChooser.svelte`
- Delete: `src/components/modal/editor/tile-editor/RuleEditViewport.svelte`
- Delete: `src/components/modal/editor/tile-editor/ModeBar.svelte`
- Delete: `src/components/modal/editor/tile-editor/SkipRemoveViewport.svelte`
- Delete (conditional): `src/components/modal/editor/tile-editor/UnitLabels.svelte`
- Modify: `src/components/modal/editor/tile-editor/partner-pair-resolver.ts`
- Modify: `src/components/modal/editor/tile-editor/__tests__/partner-pair-resolver.test.ts`

- [ ] **Step 1: Verify UnitLabels has no remaining consumer**

Run: `grep -rn "UnitLabels" src/`
Expected: matches only in `UnitLabels.svelte` itself (no importers). If matches elsewhere, leave the file. If only self-matches, proceed to delete.

- [ ] **Step 2: Delete the obsolete files**

```bash
rm src/components/modal/editor/tile-editor/PartnerPairChooser.svelte
rm src/components/modal/editor/tile-editor/RuleEditViewport.svelte
rm src/components/modal/editor/tile-editor/ModeBar.svelte
rm src/components/modal/editor/tile-editor/SkipRemoveViewport.svelte
# only if Step 1 confirmed no consumer:
rm src/components/modal/editor/tile-editor/UnitLabels.svelte
```

- [ ] **Step 3: Drop `getEligibleBands` from resolver**

In `src/components/modal/editor/tile-editor/partner-pair-resolver.ts`, remove the `getEligibleBands` export. Keep `transformQuad`, `resolvePair`, `pairsEqual`, `ResolvedPair`, `PartnerMode`.

In `src/components/modal/editor/tile-editor/__tests__/partner-pair-resolver.test.ts`, remove the `describe('getEligibleBands', ...)` block and its imports of `getEligibleBands`. Other tests for `resolvePair` and `pairsEqual` stay.

- [ ] **Step 4: Run all tests + type-check**

```bash
npm run test:unit
npm run check
```

Expected:
- Unit tests: all pass (including the new `partner-neighbors.test.ts` and the trimmed `partner-pair-resolver.test.ts`).
- Type check: no NEW errors compared to the pre-refactor baseline. (The 427-error baseline may have shifted slightly; the goal is no regressions related to this work.)

- [ ] **Step 5: Manual smoke test in dev**

```bash
npm run dev
```

Confirm:
- Tile Editor opens; Unit / Partner toggle visible.
- Unit mode: drag, add, remove, skipRemove all work as before.
- Partner mode: cascade selectors work; selecting a quad shows base + partners; clicking base vertex then partner vertex adds a rule visible as a blue connection line and as an entry in the right-side panel; clicking a connection line + Delete removes it; the model-changed banner appears if the model is regenerated.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove obsolete tile-editor files and getEligibleBands"
git push
```

---

## Self-Review Notes

- **Spec coverage:** every section of the spec maps to a task — types and resolution (Tasks 1-4), selector (Task 5), rules panel (Task 6), viewport with all features (Tasks 7-13), editor wiring with snapshot+refresh (Tasks 14-15), highlight integration (Task 16), TileEditor restructure (Tasks 17-18), cleanup (Task 19).
- **Out-of-scope items** from the spec (extending the adjuster to populate `originalPath` for within-band/across-bands; multi-globule support) are intentionally not implemented.
- **Type consistency:** `ResolvedBase`, `ResolvedPartner`, `PartnerBundle`, `PartnerRole`, `RuleSetKey`, `BaseQuadAddress`, `PartnerHighlightSource` all defined once and reused by name.
- **TDD coverage** is concentrated where pure logic lives (`partner-neighbors.ts`). Svelte components are verified by type-check + manual dev-server checks; this matches the existing pattern in this codebase (no Svelte component test harness configured).
- **Frequent commits:** every task ends with a commit and push.
