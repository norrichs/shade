# Prepare Download Worker Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move "Prepare Download" off the main thread onto a per-run pool of Web Workers that merge bands in parallel, so the page stays interactive and wall-clock falls from ~16 s to ~3 s.

**Architecture:** Each band's merge is extracted into a pure `mergeBand(payload, ctx)`. The main thread converts bands into small plain-data payloads, fans them across `min(bands, cores-1, 8)` workers, collects results, and tears the pool down. The existing synchronous `computeMergedBandPaths` is rewired to call the same `mergeBand`, so it stays behaviour-identical and serves as the correctness oracle.

**Tech Stack:** SvelteKit, TypeScript, Web Workers (Vite `new Worker(new URL(...), { type: 'module' })`), paper.js (`paper/dist/paper-core`), Jest (`testEnvironment: 'node'`), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-19-prepare-download-worker-pool-design.md`

## Global Constraints

- **Output must be identical, band for band.** This is a refactor plus a scheduler. If any task changes what the merge computes, that is a bug.
- **Payloads must be structured-cloneable.** No Three.js objects (`Vector3`, `Triangle`), no class instances, no functions. Plain objects, arrays and numbers only.
- **No `Math.random()` anywhere in worker-reachable code.** Randomness is seeded per band (see Task 2).
- **Baselines to hold:** `npm run test:unit` → 1405 passed, 101 snapshots, 161 suites. `npm run check` → 431 errors, 76 warnings. Neither number may get worse; the test count rises as tasks add tests.
- **Formatting:** run `npx prettier --write` on every touched file before committing. The repo is prettier-clean as of `b473e2b`.
- **Worker staleness:** Vite does not rebuild a worker on reload. After editing anything under `src/lib/workers/`, restart the dev server before manual verification.
- Pool size formula, used verbatim wherever it appears: `Math.max(1, Math.min(bands.length, (navigator.hardwareConcurrency ?? 4) - 1, 8))`.
- Inline threshold, used verbatim: bands.length `<= 2` runs inline, no pool.

---

### Task 1: Spike — does paper-core run inside a real browser Worker?

This is a **GO/NO-GO gate**. Every later task assumes paper's boolean ops work inside a Worker. The evidence is strong but indirect: `jest.config.js` sets `testEnvironment: 'node'`, so the paper suite already passes with no `document` and no `window`, and `paper-core.js:15711` invokes the library with `typeof self === 'object' ? self : null`, which a Worker satisfies. That is not proof. Find out before building anything.

**If this task fails, STOP and report.** Do not attempt workarounds. The design changes entirely.

**Files:**

- Create: `src/lib/workers/paper-probe.worker.ts`
- Create: `src/routes/sandbox-paper-worker/+page.svelte`
- Create: `tests/paper-in-worker.spec.ts`

**Interfaces:**

- Consumes: `uniteMany` from `$lib/paper` — `(outlines: PathSegment[][]) => PathSegment[]`
- Produces: nothing later tasks import. This task produces an **answer**. Its files are deleted in Task 8.

- [ ] **Step 1: Write the probe worker**

Two unit squares overlapping by half. Their union must be a single contour, not two.

```ts
// src/lib/workers/paper-probe.worker.ts
import { uniteMany } from '$lib/paper';
import type { PathSegment } from '$lib/types';

const square = (x: number, y: number, size: number): PathSegment[] => [
	['M', x, y],
	['L', x + size, y],
	['L', x + size, y + size],
	['L', x, y + size],
	['Z']
];

self.onmessage = () => {
	try {
		const united = uniteMany([square(0, 0, 10), square(5, 0, 10)]);
		const contours = united.filter((s) => s[0] === 'M').length;
		self.postMessage({ ok: true, contours, segments: united.length });
	} catch (error) {
		self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
	}
};
```

- [ ] **Step 2: Write the sandbox page that drives it**

```svelte
<!-- src/routes/sandbox-paper-worker/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';

	let result = 'pending';

	onMount(() => {
		const worker = new Worker(new URL('$lib/workers/paper-probe.worker.ts', import.meta.url), {
			type: 'module'
		});
		worker.onmessage = (event) => {
			result = JSON.stringify(event.data);
			worker.terminate();
		};
		worker.onerror = (event) => {
			result = JSON.stringify({ ok: false, error: event.message });
			worker.terminate();
		};
		worker.postMessage({ type: 'probe' });
	});
</script>

<h1>paper-in-worker probe</h1><pre data-testid="probe-result">{result}</pre>
```

- [ ] **Step 3: Write the failing Playwright test**

```ts
// tests/paper-in-worker.spec.ts
import { expect, test } from '@playwright/test';

test('paper-core boolean ops run inside a Web Worker', async ({ page }) => {
	await page.goto('/sandbox-paper-worker');
	const output = page.getByTestId('probe-result');
	await expect(output).not.toHaveText('pending', { timeout: 30_000 });

	const result = JSON.parse((await output.textContent()) ?? '{}');
	expect(result.error).toBeUndefined();
	expect(result.ok).toBe(true);
	// Two squares overlapping by half union into ONE contour.
	expect(result.contours).toBe(1);
	expect(result.segments).toBeGreaterThan(3);
});
```

- [ ] **Step 4: Run it**

Run: `npx playwright test tests/paper-in-worker.spec.ts`

Note this builds and previews the app (`playwright.config.ts` runs `npm run build && npm run preview` on port 4173), so the first run takes a few minutes.

Expected: **PASS**. If it fails with a `document is not defined` / `window is not defined` error out of paper-core, that is the NO-GO — stop and report the exact error text.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/lib/workers/paper-probe.worker.ts src/routes/sandbox-paper-worker/+page.svelte tests/paper-in-worker.spec.ts
git add src/lib/workers/paper-probe.worker.ts src/routes/sandbox-paper-worker/+page.svelte tests/paper-in-worker.spec.ts
git commit -m "test(paper): prove paper-core boolean ops run inside a Web Worker"
```

---

### Task 2: Band merge payloads

Convert bands into small plain-data payloads. Two things here are easy now and painful later: the **parent span** (a worker sees one band in isolation and cannot derive its position within a split parent) and the **per-band seed** (see Global Constraints).

**Files:**

- Create: `src/lib/cut-pattern/band-merge-payload.ts`
- Test: `src/lib/cut-pattern/__tests__/band-merge-payload.test.ts`

**Interfaces:**

- Consumes: `TubeCutPattern`, `BandCutPattern`, `PathSegment`, `Point` from `$lib/types`; `LabelTextDims` from `$lib/stores/mergedPathStore`.
- Produces:
  - `type BandMergePayload` (exact shape below) — used by Tasks 3, 4, 5, 7.
  - `toBandMergePayloads(tubes: TubeCutPattern[], labelTextDims: Map<string, LabelTextDims>, runSeed?: number): BandMergePayload[]`
  - `seedForBand(runSeed: number, bandId: string): number`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/cut-pattern/__tests__/band-merge-payload.test.ts
import { describe, it, expect } from '@jest/globals';
import { toBandMergePayloads, seedForBand } from '../band-merge-payload';
import {
	buildDefaultGeometry,
	splitAllTubesAt,
	generateProjectionTubes,
	partsOf
} from './helpers/real-geometry';
import type { PatternTypeConfig } from '$lib/types';

const tiledConfig = { type: 'tiledHexPattern' } as unknown as PatternTypeConfig;

describe('toBandMergePayloads', () => {
	it('spans an unsplit band across the whole parent', () => {
		const geometry = buildDefaultGeometry();
		const tubes = generateProjectionTubes(geometry, tiledConfig, undefined, 1);
		const payloads = toBandMergePayloads(tubes, new Map());

		expect(payloads.length).toBeGreaterThan(0);
		for (const payload of payloads) {
			expect(payload.pieceStartFraction).toBe(0);
			expect(payload.pieceEndFraction).toBe(1);
		}
	});

	it('spans split pieces contiguously across the parent, in order', () => {
		const geometry = buildDefaultGeometry();
		// Default bands are 4 quads; split at quad 2 gives two equal halves.
		const splits = splitAllTubesAt(geometry, [2]);
		const tubes = generateProjectionTubes(geometry, tiledConfig, splits, 1);
		const payloads = toBandMergePayloads(tubes, new Map());
		const byId = new Map(payloads.map((p) => [p.id, p]));

		const parts = partsOf(tubes[0], 0);
		expect(parts.length).toBe(2);

		const first = byId.get(parts[0].id);
		const second = byId.get(parts[1].id);
		expect(first?.pieceStartFraction).toBeCloseTo(0, 10);
		expect(first?.pieceEndFraction).toBeCloseTo(0.5, 10);
		expect(second?.pieceStartFraction).toBeCloseTo(0.5, 10);
		expect(second?.pieceEndFraction).toBeCloseTo(1, 10);
	});

	it('carries only structured-cloneable data', () => {
		const geometry = buildDefaultGeometry();
		const tubes = generateProjectionTubes(geometry, tiledConfig, undefined, 1);
		const payloads = toBandMergePayloads(tubes, new Map());

		// Throws DataCloneError on a class instance or a function.
		const cloned = structuredClone(payloads);
		expect(cloned).toEqual(payloads);
		// No Three.js objects smuggled in via facets.
		expect(JSON.stringify(payloads)).not.toContain('"isVector3"');
		expect(JSON.stringify(payloads)).not.toContain('"triangle"');
	});

	it('attaches measured label dims when present and leaves them undefined otherwise', () => {
		const geometry = buildDefaultGeometry();
		const tubes = generateProjectionTubes(geometry, tiledConfig, undefined, 1);
		const firstId = tubes[0].bands[0].id;
		const dims = new Map([[firstId, { width: 42, height: 7 }]]);

		const payloads = toBandMergePayloads(tubes, dims);
		const measured = payloads.find((p) => p.id === firstId);
		const unmeasured = payloads.find((p) => p.id !== firstId);

		expect(measured?.labelTextDims).toEqual({ width: 42, height: 7 });
		expect(unmeasured?.labelTextDims).toBeUndefined();
	});
});

describe('seedForBand', () => {
	it('is deterministic for the same run seed and band id', () => {
		expect(seedForBand(1, 'g0-t0-b0')).toBe(seedForBand(1, 'g0-t0-b0'));
	});

	it('differs across bands and across run seeds', () => {
		expect(seedForBand(1, 'g0-t0-b0')).not.toBe(seedForBand(1, 'g0-t0-b1'));
		expect(seedForBand(1, 'g0-t0-b0')).not.toBe(seedForBand(2, 'g0-t0-b0'));
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/lib/cut-pattern/__tests__/band-merge-payload.test.ts`
Expected: FAIL — `Cannot find module '../band-merge-payload'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/cut-pattern/band-merge-payload.ts
import type { BandCutPattern, PathSegment, Point, TubeCutPattern } from '$lib/types';
import type { LabelTextDims } from '$lib/stores/mergedPathStore';

/**
 * One band, reduced to exactly what merging and post-processing need, in a form
 * that survives `postMessage` without rehydration.
 *
 * `buildBandUnionPath` reads only `facet.path` and `facet.strokeWidth`; the
 * label outline needs the tag fields. Nothing here is a Three.js object, so —
 * unlike the pattern result, which needs `rehydrate-pattern.ts` — this crosses
 * the worker boundary intact.
 */
export type BandMergePayload = {
	id: string;
	facets: { path: PathSegment[]; strokeWidth?: number }[];
	tagAnchorPoint?: Point;
	tagAngle?: number;
	tagAnchorAutoAngle?: number;
	/**
	 * This band's span within its parent band, as fractions of the parent.
	 * An unsplit band is [0, 1]; the second of two equal pieces is [0.5, 1].
	 *
	 * A worker is handed one band in isolation, and a piece knows its own
	 * `parentQuadOffset` and `quadCount` but not its parent's total — that is
	 * only derivable by summing sibling pieces, which only the main thread can
	 * see. Post-processing needs it to place a hole along the parent band, so it
	 * is resolved here at extraction time.
	 */
	pieceStartFraction: number;
	pieceEndFraction: number;
	/** This band's measured label bbox; undefined means use the FALLBACK dims. */
	labelTextDims?: LabelTextDims;
	/** Deterministic per-band seed. Worker code must never call Math.random(). */
	seed: number;
};

/** FNV-1a over `${runSeed}:${bandId}`. Stable across runs, machines and reloads. */
export const seedForBand = (runSeed: number, bandId: string): number => {
	let hash = 0x811c9dc5;
	const input = `${runSeed}:${bandId}`;
	for (let i = 0; i < input.length; i += 1) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
};

/** A band's quad count: the explicit field in split tubes, else its facet count. */
const quadsOf = (band: BandCutPattern): number => band.quadCount ?? band.facets.length;

/**
 * Per-band [start, end] fractions of the parent band, keyed by band id.
 *
 * Bands sharing an `address.band` within a tube are pieces of one parent. Their
 * quad counts sum to the parent's, and `parentQuadOffset` places each one.
 */
const parentSpans = (tubes: TubeCutPattern[]): Map<string, [number, number]> => {
	const spans = new Map<string, [number, number]>();
	for (const tube of tubes) {
		const byParent = new Map<number, BandCutPattern[]>();
		for (const band of tube.bands) {
			const key = band.address.band;
			const group = byParent.get(key);
			if (group) group.push(band);
			else byParent.set(key, [band]);
		}
		for (const parts of byParent.values()) {
			const total = parts.reduce((sum, part) => sum + quadsOf(part), 0);
			for (const part of parts) {
				if (total <= 0) {
					spans.set(part.id, [0, 1]);
					continue;
				}
				const offset = part.parentQuadOffset ?? 0;
				spans.set(part.id, [offset / total, (offset + quadsOf(part)) / total]);
			}
		}
	}
	return spans;
};

/**
 * Flatten `tubes` into one payload per band, in tube-then-band order.
 *
 * Bands with no facets are dropped here rather than in the worker, so the pool
 * never spends a round trip on a band that cannot produce a path.
 */
export const toBandMergePayloads = (
	tubes: TubeCutPattern[],
	labelTextDims: Map<string, LabelTextDims>,
	runSeed = 0
): BandMergePayload[] => {
	const spans = parentSpans(tubes);
	const payloads: BandMergePayload[] = [];
	for (const tube of tubes) {
		for (const band of tube.bands) {
			if (!band.facets || band.facets.length === 0) continue;
			const [pieceStartFraction, pieceEndFraction] = spans.get(band.id) ?? [0, 1];
			payloads.push({
				id: band.id,
				facets: band.facets.map((facet) => ({
					path: facet.path,
					strokeWidth: facet.strokeWidth
				})),
				tagAnchorPoint: band.tagAnchorPoint
					? { x: band.tagAnchorPoint.x, y: band.tagAnchorPoint.y }
					: undefined,
				tagAngle: band.tagAngle,
				tagAnchorAutoAngle: band.tagAnchorAutoAngle,
				pieceStartFraction,
				pieceEndFraction,
				labelTextDims: labelTextDims.get(band.id),
				seed: seedForBand(runSeed, band.id)
			});
		}
	}
	return payloads;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/lib/cut-pattern/__tests__/band-merge-payload.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/lib/cut-pattern/band-merge-payload.ts src/lib/cut-pattern/__tests__/band-merge-payload.test.ts
git add src/lib/cut-pattern/band-merge-payload.ts src/lib/cut-pattern/__tests__/band-merge-payload.test.ts
git commit -m "feat(cut-pattern): extract structured-cloneable band merge payloads"
```

---

### Task 3: Extract `mergeBand`, rewire the synchronous path

Pull the per-band body out of `computeMergedBandPaths` and `computeTiledUnionPaths` into one function, then make both call it. **Behaviour must not change** — the existing suites are the proof.

`buildBandUnionPath` and the tiled label builder currently take a full `BandCutPattern`. They read only fields the payload carries, so their parameter types widen structurally; `BandCutPattern` still satisfies them and every existing caller keeps compiling.

**Files:**

- Create: `src/lib/cut-pattern/merge-band.ts`
- Modify: `src/lib/cut-pattern/prepare-merge.ts` (both exported functions)
- Modify: `src/lib/cut-pattern/build-band-union-path.ts:65` (widen the parameter type)
- Test: `src/lib/cut-pattern/__tests__/merge-band.test.ts`

**Interfaces:**

- Consumes: `BandMergePayload` from Task 2.
- Produces:
  - `type MergeCtx = { patternType: string; selfTag?: NonNullable<PatternLabelsConfig['selfTag']>; keepConnected: number }`
  - `mergeBand(payload: BandMergePayload, ctx: MergeCtx): PathSegment[]` — returns `[]` when the band yields no path. Used by Tasks 4 and 7.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/cut-pattern/__tests__/merge-band.test.ts
import { describe, it, expect } from '@jest/globals';
import { mergeBand } from '../merge-band';
import { computeMergedBandPaths } from '../prepare-merge';
import { toBandMergePayloads } from '../band-merge-payload';
import { buildDefaultGeometry, generateProjectionTubes } from './helpers/real-geometry';
import type { PatternLabelsConfig, PatternTypeConfig } from '$lib/types';

const tiledConfig = { type: 'tiledHexPattern' } as unknown as PatternTypeConfig;
const labels = {
	selfTag: { enabled: true, height: 16, padding: 10, stemLength: 20, stemWidth: 4 }
};

describe('mergeBand', () => {
	it('reproduces the synchronous tiled merge band for band', () => {
		const geometry = buildDefaultGeometry();
		const tubes = generateProjectionTubes(geometry, tiledConfig, undefined, 1);
		const dims = new Map();

		const oracle = computeMergedBandPaths(
			tubes,
			labels as PatternLabelsConfig,
			'tiledHexPattern',
			dims,
			0
		);
		const payloads = toBandMergePayloads(tubes, dims);

		expect(payloads.length).toBeGreaterThan(0);
		for (const payload of payloads) {
			const mine = mergeBand(payload, {
				patternType: 'tiledHexPattern',
				selfTag: labels.selfTag,
				keepConnected: 0
			});
			expect(mine).toEqual(oracle.get(payload.id) ?? []);
		}
	});

	it('returns an empty path for a band with no facets', () => {
		const empty = {
			id: 'x',
			facets: [],
			pieceStartFraction: 0,
			pieceEndFraction: 1,
			seed: 1
		};
		expect(mergeBand(empty, { patternType: 'tiledHexPattern', keepConnected: 0 })).toEqual([]);
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/lib/cut-pattern/__tests__/merge-band.test.ts`
Expected: FAIL — `Cannot find module '../merge-band'`.

- [ ] **Step 3: Widen `buildBandUnionPath`'s parameter**

In `src/lib/cut-pattern/build-band-union-path.ts`, replace the `band: BandCutPattern` parameter with a structural type. The body is unchanged — it already reads only these two fields.

```ts
/** Just the part of a band that stroke expansion reads. `BandCutPattern` satisfies it. */
export type BandUnionInput = {
	facets: { path: PathSegment[]; strokeWidth?: number }[];
};

export const buildBandUnionPath = (
	band: BandUnionInput,
	expander: (stroke: StrokeInput) => PathSegment[] = expandFacetStroke
): PathSegment[] => {
```

Drop the now-unused `BandCutPattern` from that file's type import if nothing else there uses it.

- [ ] **Step 4: Write `mergeBand`**

This is a faithful move of the two loop bodies in `prepare-merge.ts`. Keep the branching and the fallbacks exactly as they are.

```ts
// src/lib/cut-pattern/merge-band.ts
import type { PathSegment, PatternLabelsConfig } from '$lib/types';
import type { BandMergePayload } from './band-merge-payload';
import {
	buildLabelOutlinePath,
	FALLBACK_TEXT_WIDTH,
	FALLBACK_TEXT_HEIGHT
} from './label-outline-path';
import { transformLabelOutlineToBandSpace } from './transform-label-outline';
import { mergeOutlineWithLabel } from './merge-outline-with-label';
import { insertKeepConnectedBreak } from './keep-connected';
import { buildBandUnionPath } from './build-band-union-path';
import { uniteMany } from '$lib/paper';

/** The merge inputs that are identical for every band in one run. */
export type MergeCtx = {
	patternType: string;
	selfTag?: NonNullable<PatternLabelsConfig['selfTag']>;
	keepConnected: number;
};

/** The label outline in band-local coordinates, or [] when the band has no anchor. */
const labelOutline = (
	payload: BandMergePayload,
	selfTag: NonNullable<PatternLabelsConfig['selfTag']>,
	outlined: boolean
): PathSegment[] => {
	if (!payload.tagAnchorPoint) return [];
	const dims = payload.labelTextDims ?? {
		width: FALLBACK_TEXT_WIDTH,
		height: FALLBACK_TEXT_HEIGHT
	};
	const stemWidth = selfTag.stemWidth ?? 4;
	const height = selfTag.height ?? (outlined ? 14 : 16);
	const localPath = buildLabelOutlinePath({
		measuredWidth: dims.width,
		measuredHeight: dims.height,
		radius: height / 4,
		padding: selfTag.padding ?? 10,
		stemLength: selfTag.stemLength ?? 20,
		stemWidth
	});
	const effectiveAngle =
		(payload.tagAngle ?? selfTag.angle ?? 0) + (payload.tagAnchorAutoAngle ?? 0);
	const renderAnchor =
		payload.tagAnchorAutoAngle === undefined && !outlined
			? payload.tagAnchorPoint
			: {
					x: payload.tagAnchorPoint.x - (stemWidth / 2) * Math.cos(effectiveAngle),
					y: payload.tagAnchorPoint.y - (stemWidth / 2) * Math.sin(effectiveAngle)
				};
	return transformLabelOutlineToBandSpace(localPath, renderAnchor, effectiveAngle);
};

/**
 * Merge one band into a single path. Pure, and free of Three.js and DOM, so it
 * runs identically on the main thread and inside a Web Worker.
 *
 * Returns `[]` when the band produces no path; the caller skips storing it,
 * matching the `continue` branches the synchronous merge used to take.
 */
export const mergeBand = (payload: BandMergePayload, ctx: MergeCtx): PathSegment[] => {
	const { selfTag } = ctx;

	if (ctx.patternType !== 'outlined') {
		if (payload.facets.length === 0) return [];
		const bandUnion = buildBandUnionPath(payload);
		if (bandUnion.length === 0) return [];
		if (selfTag?.enabled && payload.tagAnchorPoint) {
			const label = labelOutline(payload, selfTag, false);
			if (label.length > 0) return uniteMany([bandUnion, label]);
		}
		return bandUnion;
	}

	if (!selfTag?.enabled) return [];
	if (payload.tagAnchorAutoAngle === undefined) return [];
	const bandPath = payload.facets[0]?.path;
	if (!bandPath || bandPath.length === 0) return [];

	const label = labelOutline(payload, selfTag, true);
	const merged = mergeOutlineWithLabel(bandPath, label);
	return ctx.keepConnected > 0 ? insertKeepConnectedBreak(merged, ctx.keepConnected) : merged;
};
```

- [ ] **Step 5: Rewire `prepare-merge.ts` to call `mergeBand`**

Replace the bodies of both exported functions. Their signatures, JSDoc and observable behaviour stay as they are — `computeTiledUnionPaths` still takes `tubes, labels?, labelTextDims?`, and `computeMergedBandPaths` still takes the five arguments in the same order. Delete the now-unused local `buildTiledLabelOutline` and the imports only it used.

```ts
import { toBandMergePayloads } from './band-merge-payload';
import { mergeBand, type MergeCtx } from './merge-band';

const runSync = (
	tubes: TubeCutPattern[],
	labelTextDims: Map<string, LabelTextDims>,
	ctx: MergeCtx
): Map<string, PathSegment[]> => {
	const result = new Map<string, PathSegment[]>();
	for (const payload of toBandMergePayloads(tubes, labelTextDims)) {
		const path = mergeBand(payload, ctx);
		if (path.length > 0) result.set(payload.id, path);
	}
	return result;
};

export const computeTiledUnionPaths = (
	tubes: TubeCutPattern[],
	labels?: PatternLabelsConfig,
	labelTextDims: Map<string, LabelTextDims> = new Map()
): Map<string, PathSegment[]> =>
	runSync(tubes, labelTextDims, {
		patternType: 'tiled',
		selfTag: labels?.selfTag,
		keepConnected: 0
	});

export const computeMergedBandPaths = (
	tubes: TubeCutPattern[],
	labels: PatternLabelsConfig | undefined,
	patternType: string,
	labelTextDims: Map<string, LabelTextDims>,
	keepConnected = 0
): Map<string, PathSegment[]> =>
	runSync(tubes, labelTextDims, {
		patternType,
		selfTag: labels?.selfTag,
		keepConnected
	});
```

- [ ] **Step 6: Run the full suite — this is the real gate**

Run: `npm run test:unit`

Expected: **1405 + 2 = 1407 passed, 101 snapshots passed, 161 suites**, zero failures. The existing `prepare-merge.test.ts`, `prepare-merge.labels.test.ts`, `build-band-union-path.test.ts` and `build-band-union-path.holes.test.ts` suites are the proof that behaviour did not change.

If any previously-passing test fails, the extraction is not faithful. Fix `mergeBand` to match the original; **do not** update the expectation.

- [ ] **Step 7: Verify types**

Run: `npm run check`
Expected: 431 errors, 76 warnings — unchanged from baseline.

- [ ] **Step 8: Commit**

```bash
npx prettier --write src/lib/cut-pattern/merge-band.ts src/lib/cut-pattern/prepare-merge.ts src/lib/cut-pattern/build-band-union-path.ts src/lib/cut-pattern/__tests__/merge-band.test.ts
git add src/lib/cut-pattern/merge-band.ts src/lib/cut-pattern/prepare-merge.ts src/lib/cut-pattern/build-band-union-path.ts src/lib/cut-pattern/__tests__/merge-band.test.ts
git commit -m "refactor(cut-pattern): extract mergeBand and route the sync merge through it"
```

---

### Task 4: Band merge worker core and worker binding

The message handler, split from the `Worker` binding so it is testable in Jest's node environment — mirroring `super-globule-worker-core.ts` / `super-globule.worker.ts`.

**Files:**

- Create: `src/lib/workers/band-merge-worker-core.ts`
- Create: `src/lib/workers/band-merge.worker.ts`
- Test: `src/lib/workers/__tests__/band-merge-worker-core.test.ts`

**Interfaces:**

- Consumes: `mergeBand`, `MergeCtx` (Task 3); `BandMergePayload` (Task 2).
- Produces:
  - `type MergeMessage = { type: 'merge'; bandId: string; payload: BandMergePayload; ctx: MergeCtx }`
  - `type MergeResponse = { type: 'merge-result'; bandId: string; path: PathSegment[] } | { type: 'merge-error'; bandId: string; error: string }`
  - `createBandMergeCore(overrides?): { handle(message: MergeMessage, post: (r: MergeResponse) => void): void }` — used by Task 5's tests and by the worker binding.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/workers/__tests__/band-merge-worker-core.test.ts
import { describe, it, expect, jest } from '@jest/globals';
import { createBandMergeCore, type MergeResponse } from '../band-merge-worker-core';
import { computeMergedBandPaths } from '$lib/cut-pattern/prepare-merge';
import { toBandMergePayloads } from '$lib/cut-pattern/band-merge-payload';
import {
	buildDefaultGeometry,
	splitAllTubesAt,
	generateProjectionTubes
} from '$lib/cut-pattern/__tests__/helpers/real-geometry';
import type { PatternLabelsConfig, PatternTypeConfig } from '$lib/types';

const tiledConfig = { type: 'tiledHexPattern' } as unknown as PatternTypeConfig;
const labels = {
	selfTag: { enabled: true, height: 16, padding: 10, stemLength: 20, stemWidth: 4 }
};

describe('band merge worker core', () => {
	it('posts a merge-result per band', () => {
		const core = createBandMergeCore();
		const posted: MergeResponse[] = [];
		core.handle(
			{
				type: 'merge',
				bandId: 'b',
				payload: {
					id: 'b',
					facets: [
						{
							path: [
								['M', 0, 0],
								['L', 10, 0]
							],
							strokeWidth: 2
						}
					],
					pieceStartFraction: 0,
					pieceEndFraction: 1,
					seed: 1
				},
				ctx: { patternType: 'tiledHexPattern', keepConnected: 0 }
			},
			(r) => posted.push(r)
		);

		expect(posted).toHaveLength(1);
		expect(posted[0].type).toBe('merge-result');
	});

	it('posts merge-error instead of throwing when the merge fails', () => {
		const core = createBandMergeCore({
			mergeBand: jest.fn(() => {
				throw new Error('boom');
			}) as never
		});
		const posted: MergeResponse[] = [];
		core.handle(
			{
				type: 'merge',
				bandId: 'b7',
				payload: { id: 'b7', facets: [], pieceStartFraction: 0, pieceEndFraction: 1, seed: 1 },
				ctx: { patternType: 'tiledHexPattern', keepConnected: 0 }
			},
			(r) => posted.push(r)
		);

		expect(posted).toEqual([{ type: 'merge-error', bandId: 'b7', error: 'boom' }]);
	});

	// The primary safety net: fanning bands through the message protocol must
	// produce exactly what the synchronous merge produces, including for splits.
	it('matches computeMergedBandPaths over real split geometry', () => {
		const geometry = buildDefaultGeometry();
		const splits = splitAllTubesAt(geometry, [2]);
		const tubes = generateProjectionTubes(geometry, tiledConfig, splits, 2);
		const dims = new Map();

		const oracle = computeMergedBandPaths(
			tubes,
			labels as PatternLabelsConfig,
			'tiledHexPattern',
			dims,
			0
		);

		const core = createBandMergeCore();
		const fanned = new Map<string, unknown>();
		for (const payload of toBandMergePayloads(tubes, dims)) {
			core.handle(
				{
					type: 'merge',
					bandId: payload.id,
					payload,
					ctx: { patternType: 'tiledHexPattern', selfTag: labels.selfTag, keepConnected: 0 }
				},
				(response) => {
					if (response.type === 'merge-result' && response.path.length > 0) {
						fanned.set(response.bandId, response.path);
					}
				}
			);
		}

		expect(fanned.size).toBe(oracle.size);
		expect(fanned.size).toBeGreaterThan(0);
		for (const [id, path] of oracle) expect(fanned.get(id)).toEqual(path);
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/lib/workers/__tests__/band-merge-worker-core.test.ts`
Expected: FAIL — `Cannot find module '../band-merge-worker-core'`.

- [ ] **Step 3: Write the core**

```ts
// src/lib/workers/band-merge-worker-core.ts
import { mergeBand as defaultMergeBand, type MergeCtx } from '$lib/cut-pattern/merge-band';
import type { BandMergePayload } from '$lib/cut-pattern/band-merge-payload';
import type { PathSegment } from '$lib/types';

/**
 * Message protocol between the pool and one band-merge worker.
 *
 * Unlike the geometry worker, a band-merge worker holds no state between
 * messages: every request carries everything the merge needs. That is what lets
 * the pool hand any band to any free worker.
 */
export type MergeMessage = {
	type: 'merge';
	bandId: string;
	payload: BandMergePayload;
	ctx: MergeCtx;
};

export type MergeResponse =
	| { type: 'merge-result'; bandId: string; path: PathSegment[] }
	| { type: 'merge-error'; bandId: string; error: string };

export type BandMergeCoreDeps = {
	mergeBand: typeof defaultMergeBand;
};

export const createBandMergeCore = (overrides: Partial<BandMergeCoreDeps> = {}) => {
	const deps: BandMergeCoreDeps = { mergeBand: defaultMergeBand, ...overrides };

	const handle = (message: MergeMessage, post: (response: MergeResponse) => void) => {
		if (message.type !== 'merge') return;
		try {
			const path = deps.mergeBand(message.payload, message.ctx);
			post({ type: 'merge-result', bandId: message.bandId, path });
		} catch (error) {
			post({
				type: 'merge-error',
				bandId: message.bandId,
				error: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	};

	return { handle };
};
```

- [ ] **Step 4: Write the worker binding**

```ts
// src/lib/workers/band-merge.worker.ts
/**
 * Web Worker that merges one band per message.
 *
 * The protocol and all logic live in `band-merge-worker-core.ts` so they can be
 * unit tested without a Worker; this file only binds it to `self`.
 */
import { createBandMergeCore } from './band-merge-worker-core';

export type { MergeMessage, MergeResponse } from './band-merge-worker-core';

const core = createBandMergeCore();

self.onmessage = (event: MessageEvent<import('./band-merge-worker-core').MergeMessage>) => {
	core.handle(event.data, (response) => self.postMessage(response));
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest src/lib/workers/__tests__/band-merge-worker-core.test.ts`
Expected: PASS, 3 tests. The equivalence test is the important one.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/lib/workers/band-merge-worker-core.ts src/lib/workers/band-merge.worker.ts src/lib/workers/__tests__/band-merge-worker-core.test.ts
git add src/lib/workers/band-merge-worker-core.ts src/lib/workers/band-merge.worker.ts src/lib/workers/__tests__/band-merge-worker-core.test.ts
git commit -m "feat(workers): add the band merge worker core and binding"
```

---

### Task 5: The pool

Dispatch, progress, cancellation, per-band error collection and teardown. The worker constructor is injected so tests drive fakes rather than real threads.

**Files:**

- Create: `src/lib/workers/band-merge-pool.ts`
- Test: `src/lib/workers/__tests__/band-merge-pool.test.ts`

**Interfaces:**

- Consumes: `MergeMessage`, `MergeResponse` (Task 4); `BandMergePayload` (Task 2); `MergeCtx` (Task 3).
- Produces:
  - `type PoolRunResult = { paths: Map<string, PathSegment[]>; errors: Map<string, string>; cancelled: boolean }`
  - `type PoolWorker = { postMessage(m: MergeMessage): void; terminate(): void; onmessage: ((e: { data: MergeResponse }) => void) | null; onerror: ((e: { message: string }) => void) | null }`
  - `createBandMergePool(options?: { createWorker?: () => PoolWorker; poolSize?: number }): { run(payloads, ctx, onProgress?): Promise<PoolRunResult>; cancel(): void }` — used by Task 7.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/workers/__tests__/band-merge-pool.test.ts
import { describe, it, expect } from '@jest/globals';
import { createBandMergePool, type PoolWorker } from '../band-merge-pool';
import type { MergeMessage, MergeResponse } from '../band-merge-worker-core';
import type { BandMergePayload } from '$lib/cut-pattern/band-merge-payload';

const payload = (id: string): BandMergePayload => ({
	id,
	facets: [{ path: [['M', 0, 0]], strokeWidth: 1 }],
	pieceStartFraction: 0,
	pieceEndFraction: 1,
	seed: 1
});

const ctx = { patternType: 'tiledHexPattern', keepConnected: 0 };

/** A fake worker that answers on the microtask queue, and records what it saw. */
const makeFakeWorkers = (reply: (m: MergeMessage) => MergeResponse) => {
	const created: { messages: MergeMessage[]; terminated: boolean }[] = [];
	const createWorker = (): PoolWorker => {
		const record = { messages: [] as MergeMessage[], terminated: false };
		created.push(record);
		const worker: PoolWorker = {
			onmessage: null,
			onerror: null,
			postMessage: (message) => {
				record.messages.push(message);
				queueMicrotask(() => {
					if (!record.terminated) worker.onmessage?.({ data: reply(message) });
				});
			},
			terminate: () => {
				record.terminated = true;
			}
		};
		return worker;
	};
	return { created, createWorker };
};

const ok = (m: MergeMessage): MergeResponse => ({
	type: 'merge-result',
	bandId: m.bandId,
	path: [['M', 1, 1]]
});

describe('band merge pool', () => {
	it('merges every band and reports progress once per band', async () => {
		const { createWorker } = makeFakeWorkers(ok);
		const pool = createBandMergePool({ createWorker, poolSize: 3 });
		const progress: number[] = [];

		const result = await pool.run(
			[payload('a'), payload('b'), payload('c'), payload('d')],
			ctx,
			(done) => progress.push(done)
		);

		expect(result.paths.size).toBe(4);
		expect(result.cancelled).toBe(false);
		expect(progress).toEqual([1, 2, 3, 4]);
	});

	it('spreads work across the pool rather than queueing it on one worker', async () => {
		const { created, createWorker } = makeFakeWorkers(ok);
		const pool = createBandMergePool({ createWorker, poolSize: 3 });

		await pool.run([payload('a'), payload('b'), payload('c')], ctx);

		expect(created).toHaveLength(3);
		for (const worker of created) expect(worker.messages.length).toBeGreaterThan(0);
	});

	it('never spawns more workers than there are bands', async () => {
		const { created, createWorker } = makeFakeWorkers(ok);
		const pool = createBandMergePool({ createWorker, poolSize: 8 });

		await pool.run([payload('only')], ctx);

		expect(created).toHaveLength(1);
	});

	it('collects a failed band without failing the run', async () => {
		const { createWorker } = makeFakeWorkers((m) =>
			m.bandId === 'b' ? { type: 'merge-error', bandId: 'b', error: 'boom' } : ok(m)
		);
		const pool = createBandMergePool({ createWorker, poolSize: 2 });

		const result = await pool.run([payload('a'), payload('b'), payload('c')], ctx);

		expect(result.paths.size).toBe(2);
		expect(result.errors.get('b')).toBe('boom');
	});

	it('drops empty paths so unmergeable bands leave no entry', async () => {
		const { createWorker } = makeFakeWorkers((m) => ({
			type: 'merge-result',
			bandId: m.bandId,
			path: []
		}));
		const pool = createBandMergePool({ createWorker, poolSize: 2 });

		const result = await pool.run([payload('a'), payload('b')], ctx);

		expect(result.paths.size).toBe(0);
		expect(result.errors.size).toBe(0);
	});

	it('terminates every worker when the run finishes', async () => {
		const { created, createWorker } = makeFakeWorkers(ok);
		const pool = createBandMergePool({ createWorker, poolSize: 2 });

		await pool.run([payload('a'), payload('b')], ctx);

		for (const worker of created) expect(worker.terminated).toBe(true);
	});

	it('cancels in flight, resolves cancelled and terminates the workers', async () => {
		const { created, createWorker } = makeFakeWorkers(ok);
		const pool = createBandMergePool({ createWorker, poolSize: 2 });

		const running = pool.run([payload('a'), payload('b'), payload('c')], ctx);
		pool.cancel();
		const result = await running;

		expect(result.cancelled).toBe(true);
		for (const worker of created) expect(worker.terminated).toBe(true);
	});

	it('resolves immediately for an empty band list without spawning workers', async () => {
		const { created, createWorker } = makeFakeWorkers(ok);
		const pool = createBandMergePool({ createWorker, poolSize: 4 });

		const result = await pool.run([], ctx);

		expect(result.paths.size).toBe(0);
		expect(created).toHaveLength(0);
	});

	it('records a worker-level error against the band it was running', async () => {
		const created: PoolWorker[] = [];
		const createWorker = (): PoolWorker => {
			const worker: PoolWorker = {
				onmessage: null,
				onerror: null,
				postMessage: () => queueMicrotask(() => worker.onerror?.({ message: 'worker died' })),
				terminate: () => {}
			};
			created.push(worker);
			return worker;
		};
		const pool = createBandMergePool({ createWorker, poolSize: 1 });

		const result = await pool.run([payload('a')], ctx);

		expect(result.errors.get('a')).toBe('worker died');
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/lib/workers/__tests__/band-merge-pool.test.ts`
Expected: FAIL — `Cannot find module '../band-merge-pool'`.

- [ ] **Step 3: Write the pool**

```ts
// src/lib/workers/band-merge-pool.ts
import type { MergeMessage, MergeResponse } from './band-merge-worker-core';
import type { BandMergePayload } from '$lib/cut-pattern/band-merge-payload';
import type { MergeCtx } from '$lib/cut-pattern/merge-band';
import type { PathSegment } from '$lib/types';

/** The slice of the `Worker` API the pool uses, so tests can inject a fake. */
export type PoolWorker = {
	postMessage(message: MergeMessage): void;
	terminate(): void;
	onmessage: ((event: { data: MergeResponse }) => void) | null;
	onerror: ((event: { message: string }) => void) | null;
};

export type PoolRunResult = {
	paths: Map<string, PathSegment[]>;
	/** Bands that failed, by id. A failed band does not fail the run. */
	errors: Map<string, string>;
	cancelled: boolean;
};

export type BandMergePoolOptions = {
	createWorker?: () => PoolWorker;
	poolSize?: number;
};

const defaultCreateWorker = (): PoolWorker =>
	new Worker(new URL('./band-merge.worker.ts', import.meta.url), {
		type: 'module'
	}) as unknown as PoolWorker;

/** One core is left for the main thread, whose responsiveness is the point. */
export const defaultPoolSize = (bandCount: number): number =>
	Math.max(
		1,
		Math.min(
			bandCount,
			(typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 4) : 4) - 1,
			8
		)
	);

/**
 * Merge bands across a pool of workers created for this run and terminated when
 * it ends.
 *
 * Unlike the geometry worker — one singleton that lives for the session and
 * holds the SuperGlobule — a merge worker retains nothing between runs, so
 * keeping threads resident would cost memory and buy nothing.
 */
export const createBandMergePool = (options: BandMergePoolOptions = {}) => {
	const createWorker = options.createWorker ?? defaultCreateWorker;
	let cancelRun: (() => void) | null = null;

	const run = (
		payloads: BandMergePayload[],
		ctx: MergeCtx,
		onProgress?: (done: number, total: number) => void
	): Promise<PoolRunResult> => {
		const paths = new Map<string, PathSegment[]>();
		const errors = new Map<string, string>();

		if (payloads.length === 0) {
			cancelRun = null;
			return Promise.resolve({ paths, errors, cancelled: false });
		}

		return new Promise<PoolRunResult>((resolve) => {
			const size = options.poolSize
				? Math.max(1, Math.min(options.poolSize, payloads.length))
				: defaultPoolSize(payloads.length);

			const workers: PoolWorker[] = [];
			// Which band each worker is currently running, so an onerror — which
			// names no band — can still be attributed.
			const inFlight = new Map<PoolWorker, string>();
			let next = 0;
			let done = 0;
			let settled = false;

			const teardown = () => {
				for (const worker of workers) {
					worker.onmessage = null;
					worker.onerror = null;
					worker.terminate();
				}
			};

			const finish = (cancelled: boolean) => {
				if (settled) return;
				settled = true;
				cancelRun = null;
				teardown();
				resolve({ paths, errors, cancelled });
			};

			cancelRun = () => finish(true);

			const dispatch = (worker: PoolWorker) => {
				if (settled) return;
				if (next >= payloads.length) {
					inFlight.delete(worker);
					if (done >= payloads.length) finish(false);
					return;
				}
				const payload = payloads[next];
				next += 1;
				inFlight.set(worker, payload.id);
				worker.postMessage({ type: 'merge', bandId: payload.id, payload, ctx });
			};

			const complete = (worker: PoolWorker) => {
				done += 1;
				onProgress?.(done, payloads.length);
				if (done >= payloads.length) {
					finish(false);
					return;
				}
				dispatch(worker);
			};

			for (let i = 0; i < size; i += 1) {
				const worker = createWorker();
				workers.push(worker);
				worker.onmessage = (event) => {
					if (settled) return;
					const response = event.data;
					if (response.type === 'merge-result') {
						if (response.path.length > 0) paths.set(response.bandId, response.path);
					} else {
						errors.set(response.bandId, response.error);
					}
					complete(worker);
				};
				worker.onerror = (event) => {
					if (settled) return;
					const bandId = inFlight.get(worker);
					if (bandId) errors.set(bandId, event.message);
					complete(worker);
				};
			}

			for (const worker of workers) dispatch(worker);
		});
	};

	return {
		run,
		cancel: () => cancelRun?.()
	};
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/lib/workers/__tests__/band-merge-pool.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/lib/workers/band-merge-pool.ts src/lib/workers/__tests__/band-merge-pool.test.ts
git add src/lib/workers/band-merge-pool.ts src/lib/workers/__tests__/band-merge-pool.test.ts
git commit -m "feat(workers): add the per-run band merge worker pool"
```

---

### Task 6: The two-tier store seam

Stage 1 (expansion and union) costs seconds; the post-processing planned in `docs/specs/pattern-post-processing.md` costs milliseconds. Split the stores now so tweaking a hole-drop value later re-runs only the cheap half.

`mergedBandPaths` stays a `Writable` with its current meaning — `isPrepared` derives from it and NavHeader clears it — so nothing downstream changes. A raw store is added behind it, plus an explicit (currently identity) stage 2.

**Where stage 2 runs.** The spec sketches stage 2 inside the worker task, but its Caching section requires that a post-process config change re-run stage 2 _without_ stage 1 — which rules out running it inside a pool worker, because reaching that worker means re-sending the band and re-doing the union. Stage 2 therefore runs on the main thread, over the stored raw result. The Caching section governs; the pipeline sketch describes the logical order of the two stages, not their address.

**Files:**

- Modify: `src/lib/stores/mergedPathStore.ts`
- Test: `src/lib/stores/__tests__/merged-path-store.test.ts`

**Interfaces:**

- Produces:
  - `mergedBandPathsRaw: Writable<Map<string, PathSegment[]>>`
  - `postProcessBandPaths(raw: Map<string, PathSegment[]>): Map<string, PathSegment[]>` — identity today; the hole-dropping seam. Used by Task 7.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/stores/__tests__/merged-path-store.test.ts
import { describe, it, expect } from '@jest/globals';
import { get } from 'svelte/store';
import {
	mergedBandPaths,
	mergedBandPathsRaw,
	postProcessBandPaths,
	isPrepared
} from '../mergedPathStore';
import type { PathSegment } from '$lib/types';

describe('merged path stores', () => {
	it('starts empty and unprepared', () => {
		expect(get(mergedBandPathsRaw).size).toBe(0);
		expect(get(isPrepared)).toBe(false);
	});

	it('passes paths through post-processing unchanged for now', () => {
		const raw = new Map<string, PathSegment[]>([['b', [['M', 0, 0]]]]);
		expect(postProcessBandPaths(raw)).toEqual(raw);
	});

	it('marks prepared once the render-facing store is written', () => {
		const raw = new Map<string, PathSegment[]>([['b', [['M', 0, 0]]]]);
		mergedBandPathsRaw.set(raw);
		mergedBandPaths.set(postProcessBandPaths(raw));

		expect(get(isPrepared)).toBe(true);

		mergedBandPathsRaw.set(new Map());
		mergedBandPaths.set(new Map());
		expect(get(isPrepared)).toBe(false);
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/lib/stores/__tests__/merged-path-store.test.ts`
Expected: FAIL — `mergedBandPathsRaw` is not exported.

- [ ] **Step 3: Add the store and the seam**

Append to `src/lib/stores/mergedPathStore.ts`, immediately after the existing `mergedBandPaths` declaration:

```ts
/**
 * Stage 1 output: the merged band paths as the worker pool produced them,
 * before any post-processing.
 *
 * Stage 1 (stroke expansion plus boolean union) costs seconds; the per-band
 * post-processing in `docs/specs/pattern-post-processing.md` costs
 * milliseconds. Keeping the raw result means a change to post-process config
 * re-runs only stage 2, instead of paying for the union again.
 */
export const mergedBandPathsRaw: Writable<Map<string, PathSegment[]>> = writable(new Map());

/**
 * Stage 2: derive the render-facing paths from the raw merge.
 *
 * Identity until hole dropping lands. Callers must route through it rather than
 * writing `mergedBandPaths` directly, so that feature becomes a change to this
 * one function.
 */
export const postProcessBandPaths = (raw: Map<string, PathSegment[]>): Map<string, PathSegment[]> =>
	raw;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/lib/stores/__tests__/merged-path-store.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/lib/stores/mergedPathStore.ts src/lib/stores/__tests__/merged-path-store.test.ts
git add src/lib/stores/mergedPathStore.ts src/lib/stores/__tests__/merged-path-store.test.ts
git commit -m "feat(stores): split raw merge output from post-processed band paths"
```

---

### Task 7: Wire NavHeader to the pool

Make prepare async, show band-count progress, add Cancel, and make invalidation cancel a run in flight.

**Files:**

- Modify: `src/components/nav-header/NavHeader.svelte` (imports; the invalidation block at :38; `runPrepare` at :83; `handlePrepare` at :108; the Download SVG handler at ~:236; the button markup at ~:227; styles at ~:264)

**Interfaces:**

- Consumes: `createBandMergePool` (Task 5), `toBandMergePayloads` (Task 2), `mergeBand`/`MergeCtx` (Task 3), `mergedBandPathsRaw`/`postProcessBandPaths` (Task 6).
- Produces: no exports. This is the top of the call chain.

- [ ] **Step 1: Replace the imports**

Remove `import { computeMergedBandPaths } from '$lib/cut-pattern/prepare-merge';` and add:

```ts
import { toBandMergePayloads } from '$lib/cut-pattern/band-merge-payload';
import { mergeBand, type MergeCtx } from '$lib/cut-pattern/merge-band';
import { createBandMergePool } from '$lib/workers/band-merge-pool';
import { mergedBandPathsRaw, postProcessBandPaths } from '$lib/stores/mergedPathStore';
```

Add `mergedBandPathsRaw` to the existing `$lib/stores` import only if it is re-exported there; otherwise the direct import above is correct. Check `src/lib/stores/index.ts` before deciding.

- [ ] **Step 2: Replace the prepare state and `runPrepare`**

```ts
// "Prepare Download" runs the per-band merge across a pool of workers, so the
// page stays interactive. `prepareMs` records the last run's duration.
let prepareState: 'idle' | 'running' | 'done' = 'idle';
let prepareMs = 0;
let prepareDone = 0;
let prepareTotal = 0;
let prepareFailed = 0;

const pool = createBandMergePool();

/** Collate, extract payloads and build the per-run merge context. */
const prepareInputs = (): { payloads: ReturnType<typeof toBandMergePayloads>; ctx: MergeCtx } => {
	const patternState = get(superGlobulePatternStore) as any;
	const config = get(patternConfigStore);
	const view = get(viewControlStore);
	const labelDims = get(labelTextDimensions);
	const tubes = collateTubes({
		globuleTubePattern: patternState.globuleTubePattern,
		projectionPattern: patternState.projectionPattern,
		surfaceProjectionPattern: patternState.surfaceProjectionPattern,
		voronoiPattern: patternState.voronoiPattern,
		voronoiSurfacePattern: patternState.voronoiSurfacePattern,
		showGlobuleTubeGeometry: view.showGlobuleTubeGeometry,
		showProjectionGeometry: view.showProjectionGeometry,
		patternSource: config.patternViewConfig.patternSource ?? 'projection'
	});
	return {
		payloads: toBandMergePayloads(tubes, labelDims),
		ctx: {
			patternType: config.patternTypeConfig.type,
			selfTag: config.patternTypeConfig.labels?.selfTag,
			keepConnected: config.patternConfig.pageLayout.keepConnected ?? 0
		}
	};
};

const publish = (paths: Map<string, PathSegment[]>) => {
	mergedBandPathsRaw.set(paths);
	mergedBandPaths.set(postProcessBandPaths(paths));
};

/**
 * Merge every band and publish the result. Small jobs run inline: spawning
 * workers would cost more than the work.
 */
const runPrepare = async (): Promise<void> => {
	const { payloads, ctx } = prepareInputs();
	prepareDone = 0;
	prepareTotal = payloads.length;
	prepareFailed = 0;

	if (payloads.length <= 2) {
		const paths = new Map<string, PathSegment[]>();
		for (const payload of payloads) {
			const path = mergeBand(payload, ctx);
			if (path.length > 0) paths.set(payload.id, path);
		}
		publish(paths);
		return;
	}

	const result = await pool.run(payloads, ctx, (done, total) => {
		prepareDone = done;
		prepareTotal = total;
	});
	if (result.cancelled) return;
	prepareFailed = result.errors.size;
	if (result.errors.size > 0) {
		console.warn('[prepare] bands failed to merge', [...result.errors.entries()]);
	}
	publish(result.paths);
};
```

Add `import type { PathSegment } from '$lib/types';` if the file does not already import it.

- [ ] **Step 3: Replace `handlePrepare`**

The double-rAF wait existed only to let "Preparing…" paint before the main thread froze. The work no longer runs on the main thread, so it goes.

```ts
const handlePrepare = async () => {
	if (prepareState === 'running') return;
	prepareState = 'running';
	const start = performance.now();
	try {
		await runPrepare();
	} catch (error) {
		prepareState = 'idle';
		console.error('[prepare] failed', error);
		return;
	}
	if (prepareState !== 'running') return; // cancelled or invalidated mid-run
	prepareMs = Math.round(performance.now() - start);
	prepareState = 'done';
};

const handleCancelPrepare = () => {
	pool.cancel();
	prepareState = 'idle';
};
```

Note the deliberate absence of a main-thread fallback on failure: falling back would reintroduce the multi-second freeze while appearing to succeed.

- [ ] **Step 4: Make invalidation cancel a run in flight**

In the reactive block at :38, a result computed against superseded geometry must never land. Add the cancel alongside the existing clears, and clear the raw store too:

```ts
mergedBandPaths.set(new Map());
mergedBandPathsRaw.set(new Map());
void $patternConfigStore.patternViewConfig.bandSortMode;
void $patternConfigStore.patternConfig.pageLayout.keepConnected;
csvState = 'idle';
csvText = '';
// A geometry/config change makes any prepared union stale — including one
// still being computed.
pool.cancel();
prepareState = 'idle';
```

- [ ] **Step 5: Make the Download SVG handler await the prepare**

`runPrepare` is now async, so the existing call would let the download read the DOM before the merge landed.

```svelte
<Button
	onclick={async () => {
		if ($patternConfigStore.patternTypeConfig.type === 'outlined' && $mergedBandPaths.size === 0) {
			await handlePrepare();
			await tick();
		}
		downloadSvg('pattern-svg', `globule-pattern ${$superGlobuleStore.name}.svg`);
	}}>Download SVG</Button
>
```

- [ ] **Step 6: Update the button markup**

```svelte
<Button onclick={handlePrepare} disabled={prepareState === 'running'}>
	{prepareState === 'running' ? 'Preparing…' : 'Prepare Download'}
</Button>
{#if prepareState === 'running'}
	<span class="prepare-status running">
		{prepareTotal > 0 ? `preparing ${prepareDone} / ${prepareTotal} bands` : '…preparing'}
	</span>
	<Button onclick={handleCancelPrepare}>Cancel</Button>
{:else if prepareState === 'done'}
	<span class="prepare-status done">
		✓ ready ({prepareMs} ms{prepareFailed > 0 ? `, ${prepareFailed} failed` : ''})
	</span>
{/if}
```

- [ ] **Step 7: Verify types and the full suite**

Run: `npm run check`
Expected: 431 errors, 76 warnings — unchanged from baseline. If the count rose, the new code is the cause; fix it.

Run: `npm run test:unit`
Expected: all suites pass, no regressions against the running count.

- [ ] **Step 8: Manual verification**

Restart the dev server first — Vite does not rebuild workers on reload, and this task is the first to load `band-merge.worker.ts`.

```bash
npm run dev
```

Open `/designer2`, switch Geometry to a tiled pattern source (the pattern pane stays empty otherwise), click **Prepare Download**, and confirm: the band counter advances, the page still scrolls and responds while it runs, Cancel stops it, and a second run completes and reports `✓ ready`.

- [ ] **Step 9: Commit**

```bash
npx prettier --write src/components/nav-header/NavHeader.svelte
git add src/components/nav-header/NavHeader.svelte
git commit -m "feat(nav-header): prepare downloads on the worker pool with progress and cancel"
```

---

### Task 8: End-to-end proof and measurement

Prove it in the real app, measure the claim rather than assume it, and remove the spike scaffolding.

**Files:**

- Create: `tests/prepare-download.spec.ts`
- Delete: `src/lib/workers/paper-probe.worker.ts`, `src/routes/sandbox-paper-worker/+page.svelte`, `tests/paper-in-worker.spec.ts`
- Create: `docs/superpowers/handoff/2026-09-19-prepare-download-worker-pool-report.md`

**Interfaces:**

- Consumes: the whole feature.
- Produces: a measurement report.

- [ ] **Step 1: Write the end-to-end test**

The real worker path now covers what the probe covered, so this test replaces it.

```ts
// tests/prepare-download.spec.ts
import { expect, test } from '@playwright/test';

test('Prepare Download completes on the worker pool', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));

	await page.goto('/designer2');

	const prepare = page.getByRole('button', { name: 'Prepare Download' });
	await expect(prepare).toBeVisible({ timeout: 60_000 });
	await prepare.click();

	// The readout reports a completed run; the pool ran paper inside real Workers.
	await expect(page.locator('.prepare-status.done')).toBeVisible({ timeout: 120_000 });
	await expect(page.locator('.prepare-status.done')).toContainText('ready');

	expect(errors).toEqual([]);
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test tests/prepare-download.spec.ts`
Expected: PASS.

If the readout never appears, check the browser console for a worker load failure — that is the most likely cause, and it means the Vite worker URL in `band-merge-pool.ts` is wrong.

- [ ] **Step 3: Measure against the real config**

Load the saved config **"long tri hexparquet shade"** (`tiledHexparquetPattern-0`, 30 bands) in `/designer2` and click Prepare Download. Record the `✓ ready (N ms)` figure.

The perf report's serial baseline for this config is ~16 s. Target is ~3 s at 6 threads. Record what you actually observe — if it is materially worse, say so rather than rounding toward the claim.

- [ ] **Step 4: Remove the spike scaffolding**

```bash
git rm src/lib/workers/paper-probe.worker.ts src/routes/sandbox-paper-worker/+page.svelte tests/paper-in-worker.spec.ts
```

- [ ] **Step 5: Write the report**

Create `docs/superpowers/handoff/2026-09-19-prepare-download-worker-pool-report.md` covering:

- Measured before and after for "long tri hexparquet shade", with the observed pool size and `navigator.hardwareConcurrency`.
- Equivalence evidence: which test proves output is unchanged, and over which geometry (unsplit and split).
- Final counts from `npm run test:unit` and `npm run check`, against the baselines in Global Constraints.
- Anything left open, and what the post-processing work in `docs/specs/pattern-post-processing.md` should know before it starts.

- [ ] **Step 6: Final verification**

Run: `npm run test:unit` — record the final counts.
Run: `npm run check` — must still be 431 errors, 76 warnings.
Run: `npx prettier --check .` — must be clean.

- [ ] **Step 7: Commit**

```bash
git add tests/prepare-download.spec.ts docs/superpowers/handoff/2026-09-19-prepare-download-worker-pool-report.md
git commit -m "test(prepare): cover Prepare Download end to end and drop the paper probe"
```
