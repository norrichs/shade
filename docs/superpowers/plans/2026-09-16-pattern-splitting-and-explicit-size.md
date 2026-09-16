# Pattern Splitting and Explicit Size Setting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an over-large cut pattern be subdivided into page-fitting pieces that glue back into the original, and make the page-layout panel's size readouts editable so `pageScale` can be derived from a target measurement.

**Architecture:** Splits are persisted per tube as absolute quad indices and applied by partitioning the *flattened* band between `getFlatStripV2` and `alignBands`, so pieces are a literal partition of one flat layout. Band indices stay stable and pieces get a new `piece` address component, which requires generalizing several address helpers that currently fail silently on a piece-bearing address. Seam joinery is pattern-type dependent: tiled reuses the existing partnered band-end overlap with no new pattern code, outlined gains a split-end tab, panel ignores splits.

**Tech Stack:** SvelteKit, TypeScript, Three.js, Jest (`npm run test:unit`), Playwright (`npm test`), `svelte-check` (`npm run check`).

**Spec:** `docs/superpowers/specs/2026-09-16-pattern-splitting-and-explicit-size-design.md`

## Global Constraints

- Tests are Jest, colocated in `__tests__/` beside the source, named `*.test.ts`. Import test globals explicitly: `import { describe, it, expect } from '@jest/globals';`
- Run a single test file with `npm run test:unit -- path/to/file.test.ts`.
- **Indentation is tabs**, not spaces. Prettier enforces this; run `npm run format` before committing if unsure.
- `npm run check` has a pre-existing baseline of **~434 errors**. This is CLEAN. Judge regressions by the *diff* in total count, never by absence of errors. Do not attempt to fix pre-existing errors.
- This is a **local-only app. Never `git push`.** Commit locally and stop.
- Never run `git stash`, `git checkout <branch>`, or `git reset` — this branch carries uncommitted design work at various points.
- Geometry generation runs in a Web Worker. Vite does **not** rebuild the worker on reload; if you edit anything under `src/lib/workers/` or a module it imports, **restart the dev server**.
- `pageScale` is **pattern-units per mm**. `mm = patternUnits / pageScale`. Getting this inverted is the single easiest mistake in Phase 6.
- Quad/facet relationship: quad *k* is built from facets *2k* and *2k+1*. `getQuadrilaterals` pairs on `i % 2 === 1`, so an odd trailing facet is silently dropped.
- Working branch: `feature/pattern-splitting-and-explicit-size`. Already created.

## Beads Tracking

Each phase maps to an existing beads issue. Mark it in progress when you start and closed when the phase's last commit lands.

| Phase | Issue | Tasks |
| --- | --- | --- |
| 0 | `shades-b9d` | 1–2 |
| 1 | `shades-1qz` | 3–6 |
| 2 | `shades-puy` | 7–9 |
| 3 | `shades-u6z` | 10–11 |
| 4 | `shades-1xp` | 12–13 |
| 5 | `shades-rya` | 14–16 |
| 6 | `shades-ehy` | 17–18 |

`bd update <id> --status=in_progress`, then `bd close <id>`.

## File Structure

**Created:**

| File | Responsibility |
| --- | --- |
| `src/lib/cut-pattern/split-flat-bands.ts` | Pure partition of flattened bands at legal quad boundaries. No coordinate math. |
| `src/lib/cut-pattern/__tests__/split-flat-bands.test.ts` | Tests for the above. |
| `src/lib/cut-pattern/band-key.ts` | The one shared `bandKey`, replacing four copies. |
| `src/lib/cut-pattern/__tests__/band-key.test.ts` | Characterization + piece behaviour for `bandKey`. |
| `src/lib/__tests__/address-helpers-characterization.test.ts` | Locks `isSameAddress` / `concatAddress` behaviour before it changes. |
| `src/lib/cut-pattern/__tests__/tube-pattern-characterization.test.ts` | Locks a full no-split generated tube pattern. |
| `src/lib/cut-pattern/auto-split.ts` | Derives split positions from page size. UI-side, over already-generated patterns. |
| `src/lib/cut-pattern/__tests__/auto-split.test.ts` | Tests for the above. |
| `src/components/cut-pattern/SplitTargets.svelte` | Mode-gated per-boundary click targets, rendered inside `BandComponent`'s children. |
| `src/lib/cut-pattern/page-layout/derive-page-scale.ts` | `pageScale` from a target measurement. The exact inverse of `derivePageDimensions`. |
| `src/lib/cut-pattern/page-layout/__tests__/derive-page-scale.test.ts` | Tests for the above, including the zero guard. |

**Modified:** `src/lib/types.ts` (SplitConfig, piece address, optional `Band` fields, optional `meta` partners), `src/lib/util.ts` (`isSameAddress`, `concatAddress`), `src/lib/shades-config.ts` (defaults), `src/lib/validators.ts` (split validation), `src/lib/cut-pattern/generate-tiled-pattern.ts` (insertion point, `parentAscending`, four `globalBandIndex` sites, `meta` condition), `src/lib/cut-pattern/generate-outlined-pattern.ts` (insertion point, `seamPartnerPiece`, `shouldHaveTab`), `src/lib/cut-pattern/generate-pattern.ts` (`findBandByAddress`, `getEndPartnerTransforms`), `src/lib/patterns/tesselation/shared/helpers.ts` (shared lookup), `src/lib/cut-pattern/band-sort-index.ts` / `band-partner-info.ts` / `build-pattern-csv.ts` (use shared `bandKey`), `src/lib/cut-pattern/page-layout/units.ts` (zero guard), `src/components/three-renderer/interaction-mode.ts` (new mode), `src/components/cut-pattern/BandComponent.svelte` (render split targets), `src/components/modal/editor/PageLayout.svelte` (Splits group, size inputs), `src/components/modal/editor/PatternView.svelte` (splitEnd input).

---

## Phase 0 — Characterization (issue `shades-b9d`)

Locks current behaviour before anything changes. These tests must still pass, unchanged, at the end of Phase 1.

### Task 1: Characterize the address helpers

**Files:**
- Create: `src/lib/__tests__/address-helpers-characterization.test.ts`
- Read only: `src/lib/util.ts:225-303`

**Interfaces:**
- Consumes: `isSameAddress(a, b, strict?)`, `concatAddress(a, format?)` from `$lib/util`.
- Produces: nothing. This is a safety net for Tasks 3–4.

- [ ] **Step 1: Write the characterization test**

Create `src/lib/__tests__/address-helpers-characterization.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';

import { isSameAddress, concatAddress } from '../util';

// These tests lock CURRENT behaviour so the piece-address refactor can prove
// it changed nothing for addresses that carry no `piece`. Several assertions
// below document quirks rather than desirable behaviour — they are here to
// detect accidental change, not to endorse it.
describe('isSameAddress — characterization', () => {
	it('matches identical band addresses', () => {
		const a = { globule: 0, tube: 1, band: 2 };
		const b = { globule: 0, tube: 1, band: 2 };
		expect(isSameAddress(a, b)).toBe(true);
	});

	it('distinguishes different band indices', () => {
		expect(isSameAddress({ globule: 0, tube: 1, band: 2 }, { globule: 0, tube: 1, band: 3 })).toBe(
			false
		);
	});

	it('distinguishes different tubes and globules', () => {
		expect(isSameAddress({ globule: 0, tube: 1, band: 2 }, { globule: 0, tube: 9, band: 2 })).toBe(
			false
		);
		expect(isSameAddress({ globule: 5, tube: 1, band: 2 }, { globule: 0, tube: 1, band: 2 })).toBe(
			false
		);
	});

	it('matches facet addresses including the facet index', () => {
		const a = { globule: 0, tube: 0, band: 0, facet: 3 };
		expect(isSameAddress(a, { globule: 0, tube: 0, band: 0, facet: 3 })).toBe(true);
		expect(isSameAddress(a, { globule: 0, tube: 0, band: 0, facet: 4 })).toBe(false);
	});

	it('QUIRK: strict mode rejects addresses of differing granularity via a key-count test', () => {
		// A band address and a facet address for the "same" band are NOT equal
		// under strict mode, purely because they have different key counts.
		const band = { globule: 0, tube: 0, band: 0 };
		const facet = { globule: 0, tube: 0, band: 0, facet: 0 };
		expect(isSameAddress(band, facet)).toBe(false);
	});

	it('QUIRK: non-strict mode ignores keys the field walk does not know about', () => {
		// The field walk covers globule/tube/band/facet/edge only. An unknown
		// extra key is invisible to it. This is precisely why adding `piece`
		// requires changing this function rather than relying on it.
		const a = { globule: 0, tube: 0, band: 0, somethingElse: 1 };
		const b = { globule: 0, tube: 0, band: 0, somethingElse: 2 };
		expect(isSameAddress(a, b, false)).toBe(true);
	});
});

describe('concatAddress — characterization', () => {
	it('stringifies a facet address at full granularity by default', () => {
		expect(concatAddress({ globule: 1, tube: 2, band: 3, facet: 4 })).toBe('g1t2b3f4');
	});

	it('stringifies a band address, falling back to the band format', () => {
		expect(concatAddress({ globule: 1, tube: 2, band: 3 })).toBe('g1t2b3');
	});

	it('honours explicit formats', () => {
		const a = { globule: 1, tube: 2, band: 3, facet: 4 };
		expect(concatAddress(a, 'tbf')).toBe('t2b3f4');
		expect(concatAddress(a, 'tb')).toBe('t2b3');
		expect(concatAddress(a, 'tb-slash')).toBe('t2/b3');
		expect(concatAddress(a, 'b')).toBe('b3');
	});

	it('returns empty string for undefined', () => {
		expect(concatAddress(undefined)).toBe('');
	});

	it('QUIRK: an address with an unrecognised extra component silently loses it', () => {
		// No `facet` key, so the facet branch does not match and it falls through
		// to the band branch — dropping the extra component entirely. This is the
		// duplicate-Svelte-key bug that Task 4 fixes for `piece`.
		expect(concatAddress({ globule: 1, tube: 2, band: 3, quad: 7 })).toBe('g1t2b3');
	});
});
```

- [ ] **Step 2: Run the test and confirm it passes**

Run: `npm run test:unit -- src/lib/__tests__/address-helpers-characterization.test.ts`
Expected: PASS, all tests green. This describes existing behaviour, so it should pass immediately. If any assertion fails, **stop** — the codebase differs from what this plan assumes, and the discrepancy must be understood before proceeding.

- [ ] **Step 3: Commit**

```bash
git add src/lib/__tests__/address-helpers-characterization.test.ts
git commit -m "test: characterize isSameAddress and concatAddress before piece refactor"
```

### Task 2: Characterize a generated tube pattern

**Files:**
- Create: `src/lib/cut-pattern/__tests__/tube-pattern-characterization.test.ts`
- Read only: `src/lib/cut-pattern/generate-tiled-pattern.ts:89-147`

**Interfaces:**
- Consumes: `generateTubeCutPattern({ address, bands, tiledPatternConfig, pixelScale, bandRange? })` from `../generate-tiled-pattern`.
- Produces: nothing. Safety net proving Phases 1–3 leave unsplit output untouched.

- [ ] **Step 1: Find an existing test that builds Band fixtures**

Run: `grep -rln "generateTubeCutPattern\|getFlatStripV2" src/lib/cut-pattern/__tests__/ src/lib/patterns/__tests__/`

Read whatever you find. Reuse its fixture-building approach — do not invent a new one. If a shared fixture helper exists, import it. If none exists, build the minimal one shown in Step 2.

- [ ] **Step 2: Write the snapshot test**

Create `src/lib/cut-pattern/__tests__/tube-pattern-characterization.test.ts`. Build a small tube of 2 bands × 4 facets (= 2 quads each) and snapshot the result:

```ts
import { describe, it, expect } from '@jest/globals';
import { Triangle, Vector3 } from 'three';

import { generateTubeCutPattern } from '../generate-tiled-pattern';
import type { Band, Facet, PixelScale, TiledPatternConfig } from '$lib/types';

// A flat-ish strip of `facetCount` triangles zig-zagging up the y axis, with
// the edge partner meta that generateTiling reads for start/end partners.
const buildBand = (bandIndex: number, facetCount: number): Band => {
	const facets: Facet[] = [];
	for (let i = 0; i < facetCount; i++) {
		const y = i;
		const triangle =
			i % 2 === 0
				? new Triangle(new Vector3(0, y, 0), new Vector3(1, y, 0), new Vector3(0, y + 1, 0))
				: new Triangle(new Vector3(1, y, 0), new Vector3(1, y + 1, 0), new Vector3(0, y + 1, 0));
		facets.push({
			triangle,
			orientation: 'axial-right',
			address: { globule: 0, tube: 0, band: bandIndex, facet: i }
		});
	}
	return { facets, orientation: 'axial-right', sideOrientation: 'outside', visible: true };
};

const pixelScale: PixelScale = { value: 1, unit: 'mm' } as PixelScale;

describe('generateTubeCutPattern — characterization (no splits)', () => {
	it('produces a stable band pattern for a 2-band tube', () => {
		const bands = [buildBand(0, 4), buildBand(1, 4)];
		const config = {
			type: 'tiledHexPattern',
			tiling: 'quadrilateral',
			config: { rowCount: 1, columnCount: 1 }
		} as unknown as TiledPatternConfig;

		const result = generateTubeCutPattern({
			address: { globule: 0, tube: 0 },
			bands,
			tiledPatternConfig: config,
			pixelScale
		});

		// Structural invariants that must survive the piece refactor untouched.
		expect(result.bands).toHaveLength(2);
		expect(result.bands.map((b) => b.address)).toEqual([
			{ globule: 0, tube: 0, band: 0 },
			{ globule: 0, tube: 0, band: 1 }
		]);
		expect(result.bands.every((b) => b.address.piece === undefined)).toBe(true);
		expect(result.bands.map((b) => b.id)).toMatchSnapshot('band ids');
		expect(result.bands.map((b) => b.facets.length)).toMatchSnapshot('facet counts');
		expect(result.bands.map((b) => b.error)).toMatchSnapshot('errors');
	});
});
```

**Note:** the `type` and fixture shape above may need adjusting to a pattern that actually exists in the registry and to the real `PixelScale` shape. Run the test, read the failure, and fix the fixture until it produces a real pattern. Do **not** change the assertions to match a broken fixture.

- [ ] **Step 3: Run the test and commit the snapshot**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/tube-pattern-characterization.test.ts`
Expected: PASS, with new snapshots written. Read the written snapshot file and sanity-check it: band ids should look like `tiledHexPattern-band-0-0-0` and `...-0-0-1`, facet counts should be non-zero, errors should all be `undefined`. **If errors are non-undefined, the fixture is wrong** — fix the fixture, not the assertion.

- [ ] **Step 4: Commit**

```bash
git add src/lib/cut-pattern/__tests__/tube-pattern-characterization.test.ts src/lib/cut-pattern/__tests__/__snapshots__/
git commit -m "test: snapshot an unsplit generated tube pattern as a refactor baseline"
```

- [ ] **Step 5: Close the phase**

```bash
bd close shades-b9d
```

---

## Phase 1 — Address generalization (issue `shades-1qz`)

Phase 0's tests must still pass unchanged at the end of this phase.

### Task 3: Add the piece address type and teach `isSameAddress` about it

**Files:**
- Modify: `src/lib/projection-geometry/types.ts:282` (add the new type near `GlobuleAddress_Quad`)
- Modify: `src/lib/util.ts:294-303`
- Test: `src/lib/__tests__/address-helpers-characterization.test.ts` (add a new describe block)

**Interfaces:**
- Produces: `GlobuleAddress_BandPiece = GlobuleAddress_Band & { piece: number }`; `isGlobuleAddress_BandPiece(a): a is GlobuleAddress_BandPiece`. Tasks 4, 5, 6, 8, 11 all consume these.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/__tests__/address-helpers-characterization.test.ts`:

```ts
describe('isSameAddress — piece addresses', () => {
	it('distinguishes sibling pieces of the same band', () => {
		const p0 = { globule: 0, tube: 0, band: 2, piece: 0 };
		const p1 = { globule: 0, tube: 0, band: 2, piece: 1 };
		expect(isSameAddress(p0, p1)).toBe(false);
		expect(isSameAddress(p0, p1, false)).toBe(false);
	});

	it('matches a piece address against itself', () => {
		const p0 = { globule: 0, tube: 0, band: 2, piece: 0 };
		expect(isSameAddress(p0, { globule: 0, tube: 0, band: 2, piece: 0 })).toBe(true);
	});

	it('does not equate a piece with its unsplit parent band', () => {
		// Different granularity, so they are not the same address.
		expect(isSameAddress({ globule: 0, tube: 0, band: 2 }, { globule: 0, tube: 0, band: 2, piece: 0 })).toBe(
			false
		);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- src/lib/__tests__/address-helpers-characterization.test.ts`
Expected: FAIL. The first test fails on the `strict = false` case (returns `true` because `piece` is invisible to the field walk).

- [ ] **Step 3: Add the type and guard**

In `src/lib/projection-geometry/types.ts`, beside `GlobuleAddress_Quad`:

```ts
/**
 * A piece of a split band. `band` stays stable so band-index-dependent logic
 * (finishOuterEdge, totalBandCount, the sort index, saved selections) is
 * unaffected; the piece index distinguishes siblings.
 */
export type GlobuleAddress_BandPiece = GlobuleAddress_Band & { piece: number };
```

Add it to the `GlobuleAddress` union in the same file (the union at ~line 267).

In `src/lib/util.ts`, beside the other guards (~line 226):

```ts
export const isGlobuleAddress_BandPiece = (a: GlobuleAddress): a is GlobuleAddress_BandPiece =>
	isGlobuleAddress_Band(a) && Object.hasOwn(a, 'piece');
```

- [ ] **Step 4: Replace the key-count heuristic in `isSameAddress`**

Replace `src/lib/util.ts:294-303` entirely:

```ts
/**
 * Granularity of an address, low to high. Used instead of a raw key count so
 * addresses carrying optional non-addressing fields compare correctly, and so
 * `piece` participates rather than being invisible.
 */
const addressGranularity = (a: GlobuleAddress): number => {
	if (isGlobuleAddress_FacetEdge(a)) return 5;
	if (isGlobuleAddress_Facet(a)) return 4;
	if (isGlobuleAddress_BandPiece(a)) return 3.5;
	if (isGlobuleAddress_Band(a)) return 3;
	if (isGlobuleAddress_Tube(a)) return 2;
	return 1;
};

export const isSameAddress = (a: GlobuleAddress, b: GlobuleAddress, strict = true) => {
	// Previously an Object.keys length comparison. That made `piece` invisible in
	// non-strict mode (so siblings compared equal) and made any extra field break
	// strict comparison. Granularity captures the intent directly.
	if (strict && addressGranularity(a) !== addressGranularity(b)) return false;
	if (a.globule !== b.globule) return false;
	if (isGlobuleAddress_Tube(a) && isGlobuleAddress_Tube(b) && a.tube !== b.tube) return false;
	if (isGlobuleAddress_Band(a) && isGlobuleAddress_Band(b) && a.band !== b.band) return false;
	if (isGlobuleAddress_BandPiece(a) && isGlobuleAddress_BandPiece(b) && a.piece !== b.piece)
		return false;
	// A piece and a non-piece address are never the same address, in either mode.
	if (isGlobuleAddress_BandPiece(a) !== isGlobuleAddress_BandPiece(b)) return false;
	if (isGlobuleAddress_Facet(a) && isGlobuleAddress_Facet(b) && a.facet !== b.facet) return false;
	if (isGlobuleAddress_FacetEdge(a) && isGlobuleAddress_FacetEdge(b) && a.edge !== b.edge)
		return false;
	return true;
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:unit -- src/lib/__tests__/address-helpers-characterization.test.ts`
Expected: PASS, both the new piece tests **and** every Phase 0 characterization test, including the two QUIRK tests.

The `QUIRK: non-strict mode ignores keys the field walk does not know about` test uses `somethingElse`, not `piece`, so it must still pass — granularity is unchanged by an unknown key. If it fails, the granularity function is over-reaching.

- [ ] **Step 6: Commit**

```bash
git add src/lib/projection-geometry/types.ts src/lib/util.ts src/lib/__tests__/address-helpers-characterization.test.ts
git commit -m "feat(address): add GlobuleAddress_BandPiece and make isSameAddress piece-aware"
```

### Task 4: Make `concatAddress` piece-aware

**Files:**
- Modify: `src/lib/util.ts:252-292`
- Test: `src/lib/__tests__/address-helpers-characterization.test.ts`

**Interfaces:**
- Consumes: `isGlobuleAddress_BandPiece` from Task 3.
- Produces: `concatAddress_BandPiece(a, format?)`. Task 14 relies on `concatAddress` producing distinct strings per piece, since it is used as a Svelte `{#each}` key.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/__tests__/address-helpers-characterization.test.ts`:

```ts
describe('concatAddress — piece addresses', () => {
	it('includes the piece so sibling keys differ', () => {
		// CutPatternRenderer uses this as a keyed {#each} key. Colliding keys
		// would make Svelte reuse the wrong band's DOM.
		const p0 = concatAddress({ globule: 1, tube: 2, band: 3, piece: 0 });
		const p1 = concatAddress({ globule: 1, tube: 2, band: 3, piece: 1 });
		expect(p0).toBe('g1t2b3p0');
		expect(p1).toBe('g1t2b3p1');
		expect(p0).not.toBe(p1);
	});

	it('includes the piece in short formats too', () => {
		const a = { globule: 1, tube: 2, band: 3, piece: 1 };
		expect(concatAddress(a, 'tb')).toBe('t2b3p1');
		expect(concatAddress(a, 'b')).toBe('b3p1');
	});

	it('leaves an unsplit band address unchanged', () => {
		expect(concatAddress({ globule: 1, tube: 2, band: 3 })).toBe('g1t2b3');
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- src/lib/__tests__/address-helpers-characterization.test.ts`
Expected: FAIL with `Expected: "g1t2b3p0"  Received: "g1t2b3"` — the piece address falls through to the band branch.

- [ ] **Step 3: Add the formatter and dispatch branch**

In `src/lib/util.ts`, after `concatAddress_Band` (~line 266):

```ts
export const concatAddress_BandPiece = (
	a: GlobuleAddress_BandPiece,
	format: AddressFormat = 'gtb'
) => `${concatAddress_Band(a, format)}p${a.piece}`;
```

Then in `concatAddress`, insert the piece branch **before** the band branch:

```ts
	if (isGlobuleAddress_Facet(a)) {
		return concatAddress_Facet(a, format);
	}
	// Must precede the band branch: a piece address has no `facet` key, so the
	// facet guard misses it and the band branch would silently drop `piece`.
	if (isGlobuleAddress_BandPiece(a)) {
		return concatAddress_BandPiece(a, format);
	}
	if (isGlobuleAddress_Band(a)) {
		return concatAddress_Band(a, format);
	}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit -- src/lib/__tests__/address-helpers-characterization.test.ts`
Expected: PASS, including the Phase 0 `QUIRK: an address with an unrecognised extra component silently loses it` test (which uses `quad`, not `piece`, and must still drop it).

- [ ] **Step 5: Commit**

```bash
git add src/lib/util.ts src/lib/__tests__/address-helpers-characterization.test.ts
git commit -m "feat(address): include piece in concatAddress so sibling keys differ"
```

### Task 5: Extract one shared `bandKey` and delete the four copies

**Files:**
- Create: `src/lib/cut-pattern/band-key.ts`
- Create: `src/lib/cut-pattern/__tests__/band-key.test.ts`
- Modify: `src/lib/cut-pattern/band-sort-index.ts:10`
- Modify: `src/lib/cut-pattern/band-partner-info.ts:52`
- Modify: `src/lib/cut-pattern/build-pattern-csv.ts:5`
- Modify: `src/components/projection/ProjectionGeometryComponent.svelte:96`

**Interfaces:**
- Consumes: nothing.
- Produces: `bandKey(a: GlobuleAddress_Band | GlobuleAddress_BandPiece): string`. Consumed by Tasks 6 and 14.

- [ ] **Step 1: Write the failing test**

Create `src/lib/cut-pattern/__tests__/band-key.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';

import { bandKey } from '../band-key';

describe('bandKey', () => {
	it('keeps the historical shape for an unsplit band', () => {
		// Four separate copies of this function previously existed, all producing
		// `${globule}-${tube}-${band}`. Existing persisted group codes and CSV
		// output depend on this exact shape.
		expect(bandKey({ globule: 0, tube: 1, band: 2 })).toBe('0-1-2');
	});

	it('distinguishes sibling pieces', () => {
		expect(bandKey({ globule: 0, tube: 1, band: 2, piece: 0 })).toBe('0-1-2-p0');
		expect(bandKey({ globule: 0, tube: 1, band: 2, piece: 1 })).toBe('0-1-2-p1');
	});

	it('does not collide a piece with its parent band', () => {
		expect(bandKey({ globule: 0, tube: 1, band: 2, piece: 0 })).not.toBe(
			bandKey({ globule: 0, tube: 1, band: 2 })
		);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/band-key.test.ts`
Expected: FAIL — `Cannot find module '../band-key'`.

- [ ] **Step 3: Create the shared module**

Create `src/lib/cut-pattern/band-key.ts`:

```ts
import type { GlobuleAddress_Band, GlobuleAddress_BandPiece } from '$lib/projection-geometry/types';

/**
 * Stable string key for a band or band piece.
 *
 * This previously existed as four separate copies — in band-sort-index.ts,
 * band-partner-info.ts, build-pattern-csv.ts (whose comment noted it was
 * mirroring a module-private original) and ProjectionGeometryComponent.svelte.
 * Split bands made the duplication actively dangerous, since a copy that does
 * not know about `piece` collides sibling pieces.
 *
 * The unsplit shape is unchanged: persisted group codes and CSV output depend
 * on it.
 */
export const bandKey = (a: GlobuleAddress_Band | GlobuleAddress_BandPiece): string => {
	const base = `${a.globule}-${a.tube}-${a.band}`;
	return 'piece' in a && a.piece !== undefined ? `${base}-p${a.piece}` : base;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/band-key.test.ts`
Expected: PASS.

- [ ] **Step 5: Replace the four copies**

In each of these, delete the local definition and import the shared one:

- `src/lib/cut-pattern/band-sort-index.ts` — delete line 10, add `import { bandKey } from './band-key';`
- `src/lib/cut-pattern/band-partner-info.ts` — delete line 52, add `import { bandKey } from './band-key';`
- `src/lib/cut-pattern/build-pattern-csv.ts` — delete lines 4-5 (including the stale "we mirror its shape" comment), add `import { bandKey } from './band-key';`
- `src/components/projection/ProjectionGeometryComponent.svelte` — line 96 is a *different* signature (it takes `{ address?, geometry }`, not an address). Rewrite it to delegate:

```ts
	const bandKeyOf = (band: { address?: GlobuleAddress_Band; geometry: BufferGeometry }) =>
		band.address ? bandKey(band.address) : '';
```

and update its four `{#each}` usages (lines 279, 312, 350, 358, 402) from `bandKey(band)` to `bandKeyOf(band)`. Add `import { bandKey } from '$lib/cut-pattern/band-key';`.

**Careful:** read line 96 before editing — if it has a fallback for a missing address (e.g. an index), preserve that behaviour exactly. An empty-string key would collide across bands.

- [ ] **Step 6: Run the full unit suite and the type check**

Run: `npm run test:unit`
Expected: PASS. Note `src/lib/cut-pattern/__tests__/band-sort-index.test.ts:139` and `__tests__/build-pattern-csv.test.ts` exercise the replaced copies — they must still pass untouched.

Run: `npm run check 2>&1 | tail -5`
Expected: total error count within a few of the ~434 baseline. Record the number.

- [ ] **Step 7: Commit**

```bash
git add src/lib/cut-pattern/band-key.ts src/lib/cut-pattern/__tests__/band-key.test.ts src/lib/cut-pattern/band-sort-index.ts src/lib/cut-pattern/band-partner-info.ts src/lib/cut-pattern/build-pattern-csv.ts src/components/projection/ProjectionGeometryComponent.svelte
git commit -m "refactor(cut-pattern): extract one shared piece-aware bandKey, delete four copies"
```

### Task 6: Make band lookup piece-aware

**Files:**
- Modify: `src/lib/cut-pattern/generate-pattern.ts:525-533`
- Modify: `src/lib/patterns/tesselation/shared/helpers.ts:123-125`
- Test: `src/lib/cut-pattern/__tests__/find-band-by-address.test.ts` (create)

**Interfaces:**
- Consumes: `isSameAddress` from Task 3.
- Produces: `findBandByAddress(tubePatterns, address)` exported from `generate-pattern.ts`. Consumed by Task 11.

- [ ] **Step 1: Write the failing test**

Create `src/lib/cut-pattern/__tests__/find-band-by-address.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';

import { findBandByAddress } from '../generate-pattern';
import type { BandCutPattern, TubeCutPattern } from '$lib/types';

const band = (address: BandCutPattern['address']): BandCutPattern =>
	({ address, facets: [], id: `id-${JSON.stringify(address)}` }) as unknown as BandCutPattern;

const tube = (bands: BandCutPattern[]): TubeCutPattern =>
	({ projectionType: 'patterned', address: { globule: 0, tube: 0 }, bands }) as TubeCutPattern;

describe('findBandByAddress', () => {
	it('finds an unsplit band by its band index', () => {
		const tubes = [tube([band({ globule: 0, tube: 0, band: 0 }), band({ globule: 0, tube: 0, band: 1 })])];
		expect(findBandByAddress(tubes, { globule: 0, tube: 0, band: 1 })?.address).toEqual({
			globule: 0,
			tube: 0,
			band: 1
		});
	});

	it('distinguishes sibling pieces rather than returning the first match', () => {
		// The previous implementation matched on `band` alone, so it always
		// returned piece 0 and seam partner transforms resolved to the wrong piece.
		const tubes = [
			tube([
				band({ globule: 0, tube: 0, band: 0, piece: 0 }),
				band({ globule: 0, tube: 0, band: 0, piece: 1 })
			])
		];
		const found = findBandByAddress(tubes, { globule: 0, tube: 0, band: 0, piece: 1 });
		expect(found?.address).toEqual({ globule: 0, tube: 0, band: 0, piece: 1 });
	});

	it('returns undefined for a missing tube', () => {
		expect(findBandByAddress([], { globule: 0, tube: 3, band: 0 })).toBeUndefined();
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/find-band-by-address.test.ts`
Expected: FAIL — `findBandByAddress` is not exported (it is currently `const`, not `export const`).

- [ ] **Step 3: Export and fix the lookup**

Replace `src/lib/cut-pattern/generate-pattern.ts:525-533`:

```ts
/**
 * Resolve a band (or band piece) within a sparse set of tube patterns.
 *
 * Matching on `band` alone returned the first sibling for a split band, so
 * seam partner transforms resolved against the wrong piece. `isSameAddress`
 * compares the piece component too.
 */
export const findBandByAddress = (
	tubePatterns: TubeCutPattern[],
	address: GlobuleAddress_Band | GlobuleAddress_BandPiece
): BandCutPattern | undefined => {
	const tube = tubePatterns[address.tube];
	if (!tube) return undefined;
	// Bands may be a sparse subset, so look up by address rather than by index.
	return tube.bands.find((b) => isSameAddress(b.address, address));
};
```

Add `isSameAddress` to the imports from `$lib/util` if not already present.

- [ ] **Step 4: Replace the duplicate lookup in helpers.ts**

In `src/lib/patterns/tesselation/shared/helpers.ts`, replace lines 123-125:

```ts
	const partnerBand = findBandByAddress(tubes, partnerAddress);
```

Add `import { findBandByAddress } from '$lib/cut-pattern/generate-pattern';`.

**Watch for an import cycle:** `helpers.ts` importing from `generate-pattern.ts` may create one. Run `npm run test:unit` immediately after this edit. If a cycle appears (tests fail with undefined imports), move `findBandByAddress` into its own module `src/lib/cut-pattern/find-band-by-address.ts` and import it from both sites instead. Update the test's import accordingly.

Note the old code had a positional fallback (`?? partnerTube.bands[partnerAddress.band]`). Dropping it is deliberate: with sparse band sets that fallback could return an unrelated band. If Phase 3's seam tests reveal something depended on it, reinstate it guarded by `isSameAddress` on the result.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS, including Phase 0's tube-pattern snapshot.

Run: `npm run check 2>&1 | tail -5`
Expected: within a few of baseline.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cut-pattern/generate-pattern.ts src/lib/patterns/tesselation/shared/helpers.ts src/lib/cut-pattern/__tests__/find-band-by-address.test.ts
git commit -m "fix(cut-pattern): resolve bands by full address so sibling pieces do not collide"
```

- [ ] **Step 7: Close the phase**

```bash
bd close shades-1qz
```

---

## Phase 2 — The split operation (issue `shades-puy`)

### Task 7: Add the split config type, defaults and validator

**Files:**
- Modify: `src/lib/types.ts` (near `PageLayoutConfig` at 234-244, and `PatternConfig` at ~265)
- Modify: `src/lib/shades-config.ts:586-596` (`defaultPatternConfig`)
- Modify: `src/lib/validators.ts` (beside `validateProceduralFillConfig` at 134-149)
- Test: `src/lib/__tests__/validate-split-config.test.ts` (create)

**Interfaces:**
- Produces: `TubeSplits`, `SplitConfig`, `validateSplitConfig(config, quadCountsByTube): SplitConfig`. Consumed by Tasks 8, 14, 15.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/validate-split-config.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';

import { validateSplitConfig } from '../validators';

describe('validateSplitConfig', () => {
	it('keeps in-range splits, sorted and deduplicated', () => {
		const result = validateSplitConfig(
			{ tubeSplits: [{ tube: 0, quads: [6, 2, 2, 4] }] },
			{ 0: 10 }
		);
		expect(result.tubeSplits).toEqual([{ tube: 0, quads: [2, 4, 6] }]);
	});

	it('drops splits at or beyond the quad count', () => {
		// A shrinking quad count (e.g. fewer edge divisions) must not leave a
		// dangling index behind.
		const result = validateSplitConfig({ tubeSplits: [{ tube: 0, quads: [2, 6, 10, 99] }] }, { 0: 6 });
		expect(result.tubeSplits).toEqual([{ tube: 0, quads: [2] }]);
	});

	it('drops a zero split, which would produce an empty piece', () => {
		const result = validateSplitConfig({ tubeSplits: [{ tube: 0, quads: [0, 3] }] }, { 0: 6 });
		expect(result.tubeSplits).toEqual([{ tube: 0, quads: [3] }]);
	});

	it('drops negative and non-integer splits', () => {
		const result = validateSplitConfig({ tubeSplits: [{ tube: 0, quads: [-1, 2.5, 3] }] }, { 0: 6 });
		expect(result.tubeSplits).toEqual([{ tube: 0, quads: [3] }]);
	});

	it('removes a tube entry whose splits are all dropped', () => {
		const result = validateSplitConfig({ tubeSplits: [{ tube: 0, quads: [99] }] }, { 0: 6 });
		expect(result.tubeSplits).toEqual([]);
	});

	it('drops splits for a tube with no known quad count', () => {
		const result = validateSplitConfig({ tubeSplits: [{ tube: 7, quads: [2] }] }, { 0: 6 });
		expect(result.tubeSplits).toEqual([]);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- src/lib/__tests__/validate-split-config.test.ts`
Expected: FAIL — `validateSplitConfig` is not exported from `../validators`.

- [ ] **Step 3: Add the types**

In `src/lib/types.ts`, after `PageLayoutConfig`:

```ts
/**
 * Splits for one tube, as absolute quad indices. Every band in the tube is cut
 * at these indices; a band with fewer quads than a given index is simply not
 * cut there.
 *
 * An array rather than Record<number, number[]> so it round-trips through JSON
 * and Drizzle without integer keys becoming strings.
 */
export type TubeSplits = {
	tube: number;
	quads: number[]; // sorted ascending, deduplicated
};

export type SplitConfig = {
	tubeSplits: TubeSplits[];
};
```

Add to `PatternConfig` (beside `pageLayout`), and to its index-signature union if it has one:

```ts
	splits?: SplitConfig;
```

Optional, so no migration is needed — same reasoning as the `fill` field.

- [ ] **Step 4: Add the default**

In `src/lib/shades-config.ts`, inside `defaultPatternConfig()` beside `pageLayout`:

```ts
		splits: { tubeSplits: [] },
```

- [ ] **Step 5: Add the validator**

In `src/lib/validators.ts`, beside `validateProceduralFillConfig`:

```ts
/**
 * Drop splits that no longer make sense against the current geometry.
 *
 * A split is stored as an absolute quad index, so a geometry change that
 * reduces a tube's quad count (fewer edge divisions, say) can leave an index
 * out of range. Per design, such a split is dropped rather than clamped.
 */
export const validateSplitConfig = (
	config: SplitConfig,
	quadCountsByTube: Record<number, number>
): SplitConfig => ({
	tubeSplits: config.tubeSplits
		.map(({ tube, quads }) => {
			const quadCount = quadCountsByTube[tube];
			if (quadCount === undefined) return { tube, quads: [] };
			const valid = quads.filter((q) => Number.isInteger(q) && q > 0 && q < quadCount);
			return { tube, quads: [...new Set(valid)].sort((a, b) => a - b) };
		})
		.filter(({ quads }) => quads.length > 0)
});
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test:unit -- src/lib/__tests__/validate-split-config.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/shades-config.ts src/lib/validators.ts src/lib/__tests__/validate-split-config.test.ts
git commit -m "feat(split): add SplitConfig type, default and validator"
```

### Task 8: Write `splitFlatBands`

**Files:**
- Create: `src/lib/cut-pattern/split-flat-bands.ts`
- Create: `src/lib/cut-pattern/__tests__/split-flat-bands.test.ts`
- Modify: `src/lib/types.ts` (add optional piece fields to `Band`)

**Interfaces:**
- Consumes: `GlobuleAddress_BandPiece` (Task 3).
- Produces:
  ```ts
  type SplitRejection = { quad: number; reason: string };
  type SplitFlatBandsResult = { bands: Band[]; rejected: SplitRejection[] };
  splitFlatBands(flatBands: Band[], splitQuads: number[], subunitCount: number): SplitFlatBandsResult
  ```
  Consumed by Task 9.

- [ ] **Step 1: Add the optional Band fields**

In `src/lib/types.ts`, in the `Band` type (923-934):

```ts
	/** Set only on pieces of a split band. Parent bands leave these undefined. */
	parentQuadOffset?: number;
	seamAt?: { start?: true; end?: true };
	/**
	 * The parent's reAlignBand flip decision, inherited so every piece of one
	 * band comes off the page in the same orientation. Not a correctness
	 * requirement — a pi rotation is rigid and seam matching derives its
	 * transform from live geometry — but pieces matched up by hand should agree.
	 */
	parentAscending?: boolean;
```

These go on `Band` itself rather than a subtype, because `alignBands`, `getQuadrilaterals` and `generateTiling` are all typed on `Band` and a piece must be assignable to it.

- [ ] **Step 2: Write the failing test**

Create `src/lib/cut-pattern/__tests__/split-flat-bands.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { Triangle, Vector3 } from 'three';

import { splitFlatBands } from '../split-flat-bands';
import type { Band, Facet } from '$lib/types';

// facetCount facets => facetCount/2 quads.
const buildBand = (facetCount: number): Band => {
	const facets: Facet[] = [];
	for (let i = 0; i < facetCount; i++) {
		facets.push({
			triangle: new Triangle(
				new Vector3(0, i, 0),
				new Vector3(1, i, 0),
				new Vector3(0, i + 1, 0)
			),
			orientation: 'axial-right'
		});
	}
	return { facets, orientation: 'axial-right', sideOrientation: 'outside', visible: true };
};

describe('splitFlatBands', () => {
	it('returns the input untouched when there are no splits', () => {
		const bands = [buildBand(8)];
		const result = splitFlatBands(bands, [], 1);
		expect(result.bands).toBe(bands);
		expect(result.rejected).toEqual([]);
	});

	it('partitions one band into two pieces at a quad boundary', () => {
		// 8 facets = 4 quads; split at quad 2 => facet 4.
		const result = splitFlatBands([buildBand(8)], [2], 1);
		expect(result.bands).toHaveLength(2);
		expect(result.bands[0].facets).toHaveLength(4);
		expect(result.bands[1].facets).toHaveLength(4);
	});

	it('conserves every facet, in order', () => {
		const parent = buildBand(12);
		const result = splitFlatBands([parent], [2, 4], 1);
		const rejoined = result.bands.flatMap((b) => b.facets);
		expect(rejoined).toHaveLength(12);
		rejoined.forEach((facet, i) => {
			expect(facet.triangle.a.y).toBe(parent.facets[i].triangle.a.y);
		});
	});

	it('assigns sequential piece indices and parent quad offsets', () => {
		const result = splitFlatBands([buildBand(12)], [2, 4], 1);
		expect(result.bands.map((b) => b.address?.piece)).toEqual([0, 1, 2]);
		expect(result.bands.map((b) => b.parentQuadOffset)).toEqual([0, 2, 4]);
	});

	it('marks seam ends but not the parent outer ends', () => {
		const result = splitFlatBands([buildBand(12)], [2, 4], 1);
		expect(result.bands[0].seamAt).toEqual({ end: true });
		expect(result.bands[1].seamAt).toEqual({ start: true, end: true });
		expect(result.bands[2].seamAt).toEqual({ start: true });
	});

	it('stamps the parent flip decision on every piece', () => {
		const parent = buildBand(8);
		const result = splitFlatBands([parent], [2], 1);
		// Ascending fixture: facets[0].a.y < facets[last].a.y.
		expect(result.bands.every((b) => b.parentAscending === true)).toBe(true);
	});

	it('rejects a split that is not a multiple of subunitCount', () => {
		// hexparquet maps a subunit across 3 quads, so only every third boundary
		// is legal.
		const result = splitFlatBands([buildBand(24)], [2, 3], 3);
		expect(result.bands.map((b) => b.parentQuadOffset)).toEqual([0, 3]);
		expect(result.rejected).toEqual([
			{ quad: 2, reason: 'not a multiple of subunitCount 3' }
		]);
	});

	it('leaves both pieces divisible by subunitCount', () => {
		// 24 facets = 12 quads, split at 3 => 3 and 9 quads, both divisible by 3.
		const result = splitFlatBands([buildBand(24)], [3], 3);
		const quadCounts = result.bands.map((b) => b.facets.length / 2);
		expect(quadCounts).toEqual([3, 9]);
		quadCounts.forEach((c) => expect(c % 3).toBe(0));
	});

	it('rejects an out-of-range split', () => {
		const result = splitFlatBands([buildBand(8)], [9], 1);
		expect(result.bands).toHaveLength(1);
		expect(result.rejected).toEqual([{ quad: 9, reason: 'out of range for 4 quads' }]);
	});

	it('does not split a band with fewer quads than the index', () => {
		// Splits are tube-wide; a short band simply is not cut.
		const result = splitFlatBands([buildBand(12), buildBand(4)], [4], 1);
		expect(result.bands).toHaveLength(3);
		expect(result.bands.filter((b) => b.address?.piece !== undefined)).toHaveLength(2);
	});
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/split-flat-bands.test.ts`
Expected: FAIL — `Cannot find module '../split-flat-bands'`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/cut-pattern/split-flat-bands.ts`:

```ts
import type { Band } from '$lib/types';

export type SplitRejection = { quad: number; reason: string };
export type SplitFlatBandsResult = { bands: Band[]; rejected: SplitRejection[] };

/**
 * Partition flattened bands at legal quad boundaries.
 *
 * Runs between getFlatStripV2 and alignBands, so pieces are a literal
 * partition of one flat layout — which is what makes the glued result
 * identical to the unsplit pattern. Array slicing only, no coordinate math.
 *
 * Legal split positions are quadIndex % subunitCount === 0, strictly inside
 * the band. That keeps both pieces' quad counts divisible by subunitCount, so
 * generateTiling's divisibility check passes untouched, and it means a split
 * always lands on an even facet index, so getQuadrilaterals never drops a
 * trailing facet.
 */
export const splitFlatBands = (
	flatBands: Band[],
	splitQuads: number[],
	subunitCount: number
): SplitFlatBandsResult => {
	if (splitQuads.length === 0) return { bands: flatBands, rejected: [] };

	const rejected: SplitRejection[] = [];
	const maxQuads = Math.max(...flatBands.map((b) => Math.floor(b.facets.length / 2)));

	const legal = [...new Set(splitQuads)]
		.sort((a, b) => a - b)
		.filter((quad) => {
			if (!Number.isInteger(quad) || quad <= 0 || quad >= maxQuads) {
				rejected.push({ quad, reason: `out of range for ${maxQuads} quads` });
				return false;
			}
			if (quad % subunitCount !== 0) {
				rejected.push({ quad, reason: `not a multiple of subunitCount ${subunitCount}` });
				return false;
			}
			return true;
		});

	if (legal.length === 0) return { bands: flatBands, rejected };

	const bands = flatBands.flatMap((band) => {
		const quadCount = Math.floor(band.facets.length / 2);
		// Splits are tube-wide, so a band shorter than the split index is simply
		// not cut there.
		const cuts = legal.filter((quad) => quad < quadCount);
		if (cuts.length === 0) return [band];

		// Decide the flip once, on the parent, so every piece inherits it.
		const parentAscending =
			band.facets[0].triangle.a.y < band.facets[band.facets.length - 1].triangle.a.y;

		const boundaries = [0, ...cuts, quadCount];
		return boundaries.slice(0, -1).map((startQuad, i) => {
			const endQuad = boundaries[i + 1];
			const piece: Band = {
				...band,
				facets: band.facets.slice(startQuad * 2, endQuad * 2),
				parentQuadOffset: startQuad,
				parentAscending,
				seamAt: {
					...(startQuad > 0 ? { start: true as const } : {}),
					...(endQuad < quadCount ? { end: true as const } : {})
				}
			};
			if (band.address) {
				piece.address = { ...band.address, piece: i } as typeof piece.address;
			} else {
				// Fixtures and the generateTiledBandPattern path may carry no address;
				// the piece index still has to be discoverable for tests and ordering.
				piece.address = { globule: 0, tube: 0, band: 0, piece: i } as typeof piece.address;
			}
			return piece;
		});
	});

	return { bands, rejected };
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/split-flat-bands.test.ts`
Expected: PASS, all 10 tests.

If `assigns sequential piece indices` fails because `band.address` is undefined in the fixture, check the fallback branch — the fixture has no address, so it exercises the `else`. Adjust the fixture to carry an address if that reads more honestly, but keep a test for the address-less path since `generateTiledBandPattern` uses it.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/cut-pattern/split-flat-bands.ts src/lib/cut-pattern/__tests__/split-flat-bands.test.ts
git commit -m "feat(split): add splitFlatBands, partitioning flattened bands at legal quad boundaries"
```

### Task 9: Wire the split into both generation paths

**Files:**
- Modify: `src/lib/cut-pattern/generate-tiled-pattern.ts:117-134` and `:509-529` (`reAlignBand`)
- Modify: `src/lib/cut-pattern/generate-outlined-pattern.ts:621-626`
- Test: `src/lib/cut-pattern/__tests__/tube-pattern-characterization.test.ts` (extend)

**Interfaces:**
- Consumes: `splitFlatBands` (Task 8).
- Produces: `generateTubeCutPattern` gains an optional `splitQuads?: number[]` prop. Consumed by Task 14 via the store chain.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/cut-pattern/__tests__/tube-pattern-characterization.test.ts`:

```ts
describe('generateTubeCutPattern — with splits', () => {
	it('emits two piece bands per band when split once', () => {
		const bands = [buildBand(0, 8)]; // 8 facets = 4 quads
		const config = {
			type: 'tiledHexPattern',
			tiling: 'quadrilateral',
			config: { rowCount: 1, columnCount: 1 }
		} as unknown as TiledPatternConfig;

		const result = generateTubeCutPattern({
			address: { globule: 0, tube: 0 },
			bands,
			tiledPatternConfig: config,
			pixelScale,
			splitQuads: [2]
		});

		expect(result.bands).toHaveLength(2);
		expect(result.bands.map((b) => b.address.piece)).toEqual([0, 1]);
		// Band index stays stable across pieces.
		expect(result.bands.map((b) => b.address.band)).toEqual([0, 0]);
		// Ids must differ or mergedBandPaths hands a piece the wrong geometry.
		expect(new Set(result.bands.map((b) => b.id)).size).toBe(2);
		// Neither piece may be refused.
		expect(result.bands.map((b) => b.error)).toEqual([undefined, undefined]);
	});

	it('leaves output identical to the baseline when splitQuads is empty', () => {
		const bands = [buildBand(0, 4), buildBand(1, 4)];
		const config = {
			type: 'tiledHexPattern',
			tiling: 'quadrilateral',
			config: { rowCount: 1, columnCount: 1 }
		} as unknown as TiledPatternConfig;
		const args = {
			address: { globule: 0, tube: 0 } as const,
			bands,
			tiledPatternConfig: config,
			pixelScale
		};

		const withoutProp = generateTubeCutPattern(args);
		const withEmpty = generateTubeCutPattern({ ...args, splitQuads: [] });
		expect(withEmpty.bands.map((b) => b.id)).toEqual(withoutProp.bands.map((b) => b.id));
		expect(withEmpty.bands.map((b) => b.facets.length)).toEqual(
			withoutProp.bands.map((b) => b.facets.length)
		);
	});
});
```

Move `buildBand`, `pixelScale` and the config literal to module scope in that file if they are currently inside the first `describe`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/tube-pattern-characterization.test.ts`
Expected: FAIL — `splitQuads` is not a recognised prop, so only one band is returned.

- [ ] **Step 3: Insert the split in the tiled path**

In `src/lib/cut-pattern/generate-tiled-pattern.ts`, extend the `generateTubeCutPattern` signature (89-101) with:

```ts
	splitQuads?: number[];
```

Then replace lines 117-134:

```ts
	const flatBands = selectedBands.map((band) =>
		getFlatStripV2(band, { bandStyle: 'helical-right', pixelScale })
	);

	// Split before aligning, so each piece is a partition of one flat layout and
	// gets its own bounding box for packing. subunitCount gates legal positions,
	// which is why the pattern entry is resolved here rather than only inside
	// generateTiling.
	const entry = resolvePatternEntry(tiledPatternConfig.type) as UnitPatternGenerator;
	const subunitCount = entry.subunitCount ?? 1;
	const splitResult = splitFlatBands(flatBands, splitQuads ?? [], subunitCount);
	if (splitResult.rejected.length) {
		console.warn(
			`${tiledPatternConfig.type}: ${splitResult.rejected.length} split(s) dropped in tube ${address.tube} — ${splitResult.rejected[0].reason}`
		);
	}

	const alignedBands = alignBands(splitResult.bands);

	const quadBands = alignedBands.map((flatBand) =>
		getQuadrilaterals(flatBand, pixelScale.value, flatBand.sideOrientation)
	);

	const tiling = generateTiling({
		quadBands,
		bands: alignedBands,
		tiledPatternConfig,
		address,
		bandIndexOffset: rangeStart,
		totalBandCount: visibleBands.length,
		toVisibleBandIndex: (real: number) => visibleIndexByReal.get(real)
	});
```

Add the import: `import { splitFlatBands } from './split-flat-bands';`

- [ ] **Step 4: Thread the piece into the four id/address sites**

`globalBandIndex` is defined at `:270` and used at `:303`, `:306`, `:453`, `:463`. Band index must stay stable, so derive the piece separately. After line 270 add:

```ts
		// Pieces of a split band share a band index and are distinguished by piece.
		const piece = bands?.[bandIndex]?.address?.piece;
		const pieceSuffix = piece === undefined ? '' : `-p${piece}`;
		const addressWithPiece = piece === undefined ? { ...address, band: globalBandIndex } : { ...address, band: globalBandIndex, piece };
```

Then at each of `:303`/`:453` append `${pieceSuffix}` to the id template, and at each of `:306`/`:463` replace `{ ...address, band: globalBandIndex }` with `addressWithPiece`.

Also note that `bandIndexOffset` + `bandIndex` no longer equals a *band* index once pieces exist. `finishOuterEdge` (`:284`) and `bandContext.bandIndex` (`:290`) both use it. For a split tube the last *piece* is not the last *band*. Fix `finishOuterEdge` to use the underlying band index:

```ts
		const underlyingBand = bands?.[bandIndex]?.address?.band ?? bandIndex + bandIndexOffset;
		const finishOuterEdge = underlyingBand === bandCount - 1 && hasFreeSide;
```

- [ ] **Step 5: Inherit the parent flip in `reAlignBand`**

In `src/lib/cut-pattern/generate-tiled-pattern.ts:523-524`, replace:

```ts
	const isAscending =
		band.parentAscending ??
		newBand.facets[0].triangle.a.y < newBand.facets[newBand.facets.length - 1].triangle.a.y;
```

An unsplit band has no `parentAscending`, so it falls through to today's computation.

- [ ] **Step 6: Insert the split in the outlined path**

In `src/lib/cut-pattern/generate-outlined-pattern.ts`, add `splitQuads?: number[]` to `generateOutlinedTubePattern`'s signature and apply the same `splitFlatBands` call between `getFlatStripV2` and `alignBands` at 621-626. Outlined patterns have no `subunitCount`, so pass `1`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS. **The Phase 0 snapshot must be unchanged** — if it changed, the empty-`splitQuads` path is not a true no-op. Investigate rather than updating the snapshot with `-u`.

Run: `npm run check 2>&1 | tail -5`
Expected: within a few of baseline.

- [ ] **Step 8: Commit**

```bash
git add src/lib/cut-pattern/generate-tiled-pattern.ts src/lib/cut-pattern/generate-outlined-pattern.ts src/lib/cut-pattern/__tests__/tube-pattern-characterization.test.ts
git commit -m "feat(split): partition flattened bands in the tiled and outlined generation paths"
```

- [ ] **Step 9: Close the phase**

```bash
bd close shades-puy
```

---

## Phase 3 — Seam wiring for tiled patterns (issue `shades-u6z`)

### Task 10: Make `meta` partner addresses optional

**Files:**
- Modify: `src/lib/types.ts:437-444`
- Modify: `src/lib/cut-pattern/generate-pattern.ts:535-552`
- Modify: `src/lib/patterns/tesselation/shared/helpers.ts:116-121`

**Interfaces:**
- Produces: `BandCutPattern['meta']` with `startPartnerBand?` / `endPartnerBand?`. Consumed by Task 11.

- [ ] **Step 1: Widen the type**

In `src/lib/types.ts:437-444`, make both partner addresses optional:

```ts
	meta?: {
		// Optional because a split piece can have a resolvable seam at one end and
		// an unpartnered outer end at the other. Previously both were required and
		// meta was dropped entirely unless both resolved, which would have
		// disabled seam matching for such a piece.
		startPartnerBand?: GlobuleAddress_Band;
		endPartnerBand?: GlobuleAddress_Band;
		startPartnerTransform?: TransformConfig;
		endPartnerTransform?: TransformConfig;
		translatedStartPartnerFacet?: CutPattern;
		translatedEndPartnerFacet?: CutPattern;
	};
```

- [ ] **Step 2: Run the type check to enumerate the consumers**

Run: `npm run check 2>&1 | grep -c "error"`

The count will rise above baseline. Run `npm run check 2>&1 | grep -B2 "PartnerBand"` to list every site that assumed both were present. **Write that list down** — it is the work for the next two steps, and the compiler is the authority on it, not this plan.

- [ ] **Step 3: Handle each end independently in `getEndPartnerTransforms`**

Replace `src/lib/cut-pattern/generate-pattern.ts:535-552`:

```ts
const getEndPartnerTransforms = (tubePatterns: TubeCutPattern[]) => {
	tubePatterns.forEach((tubePattern) => {
		if (!tubePattern) return;
		tubePattern.bands.forEach((band) => {
			if (!band.meta) return;
			// Each end is resolved on its own. Previously both were gated on both,
			// so one unresolvable end silently disabled matching at the other.
			const startAddress = band.meta.startPartnerBand;
			if (startAddress) {
				const startPartner = findBandByAddress(tubePatterns, startAddress);
				if (startPartner) {
					band.meta.startPartnerTransform = getEndPartnerTransform(band, startPartner);
				}
			}
			const endAddress = band.meta.endPartnerBand;
			if (endAddress) {
				const endPartner = findBandByAddress(tubePatterns, endAddress);
				if (endPartner) {
					band.meta.endPartnerTransform = getEndPartnerTransform(band, endPartner);
				}
			}
		});
	});
};
```

- [ ] **Step 4: Guard the absent end in `getTransformedPartnerCutPattern`**

In `src/lib/patterns/tesselation/shared/helpers.ts`, after line 118:

```ts
	const partnerAddress = f === 0 ? band.meta.startPartnerBand : band.meta.endPartnerBand;
	// An end with no partner (an outer end, or a seam whose sibling is out of the
	// rendered range) simply is not matched.
	if (!partnerAddress) return undefined;
```

Then fix any remaining site the compiler named in Step 2 the same way: absent partner means "do not match this end", never a crash and never a fallback to the other end.

The `isSameAddress(partnerBand.meta.startPartnerBand, band.address)` call at line 127 needs a guard too, since the first argument may now be undefined:

```ts
	const partnerFacetIndex =
		partnerBand.meta.startPartnerBand &&
		isSameAddress(partnerBand.meta.startPartnerBand, band.address)
			? 0
			: partnerBand.facets.length - 1;
```

- [ ] **Step 5: Run the tests and the type check**

Run: `npm run test:unit`
Expected: PASS, Phase 0 snapshot unchanged.

Run: `npm run check 2>&1 | tail -5`
Expected: back within a few of baseline. If it is still elevated, there are unhandled consumers from Step 2's list.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/cut-pattern/generate-pattern.ts src/lib/patterns/tesselation/shared/helpers.ts
git commit -m "refactor(pattern): resolve each band end's partner independently"
```

### Task 11: Wire seam partners between sibling pieces

**Files:**
- Modify: `src/lib/cut-pattern/generate-tiled-pattern.ts:369-384` and `:465`
- Test: `src/lib/cut-pattern/__tests__/seam-partners.test.ts` (create)

**Interfaces:**
- Consumes: optional `meta` partners (Task 10), `seamAt` (Task 8).
- Produces: `meta.startPartnerBand` / `endPartnerBand` pointing at sibling pieces. Consumed by the existing `endsMatched` machinery.

- [ ] **Step 1: Write the failing test**

Create `src/lib/cut-pattern/__tests__/seam-partners.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { Triangle, Vector3 } from 'three';

import { generateTubeCutPattern } from '../generate-tiled-pattern';
import type { Band, Facet, PixelScale, TiledPatternConfig } from '$lib/types';

const buildBand = (bandIndex: number, facetCount: number): Band => {
	const facets: Facet[] = [];
	for (let i = 0; i < facetCount; i++) {
		facets.push({
			triangle: new Triangle(
				new Vector3(0, i, 0),
				new Vector3(1, i, 0),
				new Vector3(0, i + 1, 0)
			),
			orientation: 'axial-right',
			address: { globule: 0, tube: 0, band: bandIndex, facet: i }
		});
	}
	return { facets, orientation: 'axial-right', sideOrientation: 'outside', visible: true };
};

const pixelScale = { value: 1, unit: 'mm' } as unknown as PixelScale;
const config = {
	type: 'tiledHexPattern',
	tiling: 'quadrilateral',
	config: { rowCount: 1, columnCount: 1 }
} as unknown as TiledPatternConfig;

describe('seam partners', () => {
	it('points each piece at its sibling across the seam', () => {
		const result = generateTubeCutPattern({
			address: { globule: 0, tube: 0 },
			bands: [buildBand(0, 8)],
			tiledPatternConfig: config,
			pixelScale,
			splitQuads: [2]
		});

		const [p0, p1] = result.bands;
		// p0's end meets p1's start.
		expect(p0.meta?.endPartnerBand).toEqual({ globule: 0, tube: 0, band: 0, piece: 1 });
		expect(p1.meta?.startPartnerBand).toEqual({ globule: 0, tube: 0, band: 0, piece: 0 });
	});

	it('is reciprocal, which the facet-index disambiguation relies on', () => {
		const result = generateTubeCutPattern({
			address: { globule: 0, tube: 0 },
			bands: [buildBand(0, 12)],
			tiledPatternConfig: config,
			pixelScale,
			splitQuads: [2, 4]
		});

		const [p0, p1, p2] = result.bands;
		expect(p1.meta?.startPartnerBand).toEqual(p0.address);
		expect(p0.meta?.endPartnerBand).toEqual(p1.address);
		expect(p2.meta?.startPartnerBand).toEqual(p1.address);
		expect(p1.meta?.endPartnerBand).toEqual(p2.address);
	});

	it('sets meta even when the outer end has no partner', () => {
		// The fixture has no cross-band partner meta, so the outer ends are
		// unpartnered. Before this change, meta would have been dropped entirely
		// and the seam would not have matched.
		const result = generateTubeCutPattern({
			address: { globule: 0, tube: 0 },
			bands: [buildBand(0, 8)],
			tiledPatternConfig: config,
			pixelScale,
			splitQuads: [2]
		});
		expect(result.bands[0].meta).toBeDefined();
		expect(result.bands[0].meta?.endPartnerBand).toBeDefined();
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/seam-partners.test.ts`
Expected: FAIL — `meta` is undefined, because the fixture's outer ends have no partners and nothing yet wires seams.

- [ ] **Step 3: Derive seam partners**

In `src/lib/cut-pattern/generate-tiled-pattern.ts`, after the existing `endPartnerBand` derivation (`:382-384`), override each seam end:

```ts
		// A seam end's partner is the adjacent piece of the same parent band. The
		// existing endsMatched machinery then produces the overlapping strokes that
		// form the glue surface — a seam end is an ordinary partnered end.
		const seamAt = band.seamAt;
		const piece = band.address?.piece;
		const seamStartPartner =
			seamAt?.start && piece !== undefined && band.address
				? { ...band.address, piece: piece - 1 }
				: undefined;
		const seamEndPartner =
			seamAt?.end && piece !== undefined && band.address
				? { ...band.address, piece: piece + 1 }
				: undefined;

		const resolvedStartPartner = seamStartPartner ?? startPartnerBand;
		const resolvedEndPartner = seamEndPartner ?? endPartnerBand;
```

Note `band.address` here is the *flat band* address carrying `piece` (set by `splitFlatBands`), which is why the piece index is available before the `BandCutPattern` address is built.

- [ ] **Step 4: Relax the meta condition**

Replace `src/lib/cut-pattern/generate-tiled-pattern.ts:465`:

```ts
			// Both ends resolving is the historical condition, kept exactly for
			// unsplit bands. A piece additionally gets meta when only one end
			// resolves, since its outer end may be genuinely unpartnered while its
			// seam end must still match.
			meta:
				resolvedStartPartner && resolvedEndPartner
					? { startPartnerBand: resolvedStartPartner, endPartnerBand: resolvedEndPartner }
					: seamAt && (resolvedStartPartner || resolvedEndPartner)
						? {
								startPartnerBand: resolvedStartPartner,
								endPartnerBand: resolvedEndPartner
							}
						: undefined,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/seam-partners.test.ts`
Expected: PASS, all three tests.

Run: `npm run test:unit`
Expected: PASS. **Phase 0's snapshot must be unchanged** — an unsplit band has no `seamAt`, so the condition reduces to the historical one.

- [ ] **Step 6: Verify the seam visually**

Start the dev server (`npm run dev`, port 9776). Open `/designer2`, switch Geometry to **Voronoi** so the pattern pane is populated, pick a tiled pattern with `endsMatched` on, and set a split via the browser console against the config store. Confirm two pieces render and their strokes meet at the seam.

If the seam does not overlap, check in this order: (1) `endsMatched` is actually on for this pattern; (2) `spec.adjustments.partner.startEnd`/`.endEnd` exist for it; (3) `findBandByAddress` resolves the sibling (log it).

- [ ] **Step 7: Commit**

```bash
git add src/lib/cut-pattern/generate-tiled-pattern.ts src/lib/cut-pattern/__tests__/seam-partners.test.ts
git commit -m "feat(split): wire seam partners between sibling pieces so tiled seams overlap"
```

- [ ] **Step 8: Keep `segmentIndex` label anchors in place across a split**

The spec requires that a label anchored by `segmentIndex` stays where it was
before the band was split. `parentQuadOffset` exists for exactly this and is
otherwise unread.

Write the failing test first, appended to
`src/lib/cut-pattern/__tests__/seam-partners.test.ts`:

```ts
describe('label anchors across a split', () => {
	it('anchors the same facet whether or not the band is split', () => {
		// tagAnchor.facetIndex is a parent-relative index. A piece sees a sliced
		// facets array, so without parentQuadOffset the anchor lands on the wrong
		// facet — or on every piece at once.
		const args = {
			address: { globule: 0, tube: 0 } as const,
			bands: [buildBand(0, 12)],
			tiledPatternConfig: config,
			pixelScale
		};
		const unsplit = generateTubeCutPattern(args);
		const split = generateTubeCutPattern({ ...args, splitQuads: [2, 4] });

		// Exactly one piece carries a real anchor, not all three.
		const anchored = split.bands.filter(
			(b) => b.tagAnchorPoint.x !== 0 || b.tagAnchorPoint.y !== 0
		);
		expect(anchored).toHaveLength(unsplit.bands.filter(
			(b) => b.tagAnchorPoint.x !== 0 || b.tagAnchorPoint.y !== 0
		).length);
	});
});
```

Run it: `npm run test:unit -- src/lib/cut-pattern/__tests__/seam-partners.test.ts`
Expected: FAIL — every piece matches `tagAnchor.facetIndex` against its own
local index, so more than one piece claims the anchor.

Then in `generate-tiled-pattern.ts`, where the anchor is matched (`:388`,
`if (tagAnchor && tagAnchor.facetIndex === facetIndex)`), compare in parent
coordinates:

```ts
			// Pieces see a sliced facets array, so a parent-relative anchor index
			// must be shifted by the piece's offset. parentQuadOffset counts quads;
			// each quad is one entry in this map.
			const quadOffset = bands?.[bandIndex]?.parentQuadOffset ?? 0;
			const parentFacetIndex = facetIndex + quadOffset;
			if (tagAnchor && tagAnchor.facetIndex === parentFacetIndex) {
```

Re-run the test. Expected: PASS, and Phase 0's snapshot unchanged (an unsplit
band has `parentQuadOffset === undefined`, so the offset is 0).

**If the anchor semantics turn out to be per-band-by-design rather than
parent-relative**, stop and flag it — that is a spec question, not an
implementation detail, and the spec explicitly chose parent coordinates.

Commit:

```bash
git add src/lib/cut-pattern/generate-tiled-pattern.ts src/lib/cut-pattern/__tests__/seam-partners.test.ts
git commit -m "fix(split): resolve segmentIndex label anchors in parent coordinates"
```

- [ ] **Step 9: Close the phase**

```bash
bd close shades-u6z
```

---

## Phase 4 — Outlined split-end tab (issue `shades-1xp`)

### Task 12: Add the `splitEnd` tab and its ownership rule

**Files:**
- Modify: `src/lib/types.ts:707-717` (`OutlinedTabConfig`)
- Modify: `src/lib/cut-pattern/generate-outlined-pattern.ts:83-106` (`OutlineEdge`), `:180-278` (`getOutlineEdges`), `:360-395` (`shouldHaveTab`)
- Test: `src/lib/cut-pattern/__tests__/split-end-tab.test.ts` (create)

**Interfaces:**
- Consumes: `seamAt` (Task 8).
- Produces: `OutlinedTabConfig.splitEnd?: TabEdgeOption`; `OutlineEdge.seamPartnerPiece?: number`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/cut-pattern/__tests__/split-end-tab.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';

import { shouldHaveTab } from '../generate-outlined-pattern';
import type { OutlinedTabConfig } from '$lib/types';

const base: OutlinedTabConfig = { shape: 'rectangle', tabWidth: 5 };
const noPartners = { after: false, before: false };

describe('shouldHaveTab — split ends', () => {
	const seamEdge = (seamPartnerPiece: number) => ({
		start: { x: 0, y: 0 },
		end: { x: 1, y: 0 },
		side: 'end' as const,
		interiorPoint: { x: 0.5, y: 0.5 },
		seamPartnerPiece
	});

	it('gives no tab when splitEnd is unset', () => {
		// Default must not change outlined output for anyone not using splits.
		// Note the trailing currentPiece arg: without it the seam branch does not
		// engage at all and this would pass via fallthrough, testing nothing.
		expect(shouldHaveTab(seamEdge(1), base, noPartners, 0, 0, 1, 0)).toBe(false);
	});

	it('ignores the seam branch entirely when currentPiece is unknown', () => {
		// Callers that predate pieces pass no currentPiece. Such an edge must fall
		// through to the existing bandEnd rule rather than being treated as a seam.
		const config = { ...base, splitEnd: 'beforeAndAfter' as const };
		expect(shouldHaveTab(seamEdge(1), config, noPartners, 0, 0, 1)).toBe(false);
	});

	it("'after' tabs the lower-indexed piece", () => {
		const config = { ...base, splitEnd: 'after' as const };
		// own piece 0, partner piece 1 => partner is after => tab.
		expect(shouldHaveTab(seamEdge(1), config, noPartners, 0, 0, 1, 0)).toBe(true);
		// own piece 1, partner piece 0 => partner is before => no tab.
		expect(shouldHaveTab(seamEdge(0), config, noPartners, 0, 0, 1, 1)).toBe(false);
	});

	it("'before' tabs the higher-indexed piece", () => {
		const config = { ...base, splitEnd: 'before' as const };
		expect(shouldHaveTab(seamEdge(1), config, noPartners, 0, 0, 1, 0)).toBe(false);
		expect(shouldHaveTab(seamEdge(0), config, noPartners, 0, 0, 1, 1)).toBe(true);
	});

	it("'beforeAndAfter' tabs both, which would double the joint", () => {
		const config = { ...base, splitEnd: 'beforeAndAfter' as const };
		expect(shouldHaveTab(seamEdge(1), config, noPartners, 0, 0, 1, 0)).toBe(true);
		expect(shouldHaveTab(seamEdge(0), config, noPartners, 0, 0, 1, 1)).toBe(true);
	});

	it('leaves a non-seam end edge to the existing bandEnd rule', () => {
		const config = { ...base, splitEnd: 'after' as const };
		const plainEnd = {
			start: { x: 0, y: 0 },
			end: { x: 1, y: 0 },
			side: 'end' as const,
			interiorPoint: { x: 0.5, y: 0.5 }
		};
		// No seamPartnerPiece and no endPartnerTube => no tab, as today.
		expect(shouldHaveTab(plainEnd, config, noPartners, 0, 0, 1, 0)).toBe(false);
	});
});
```

`shouldHaveTab` is currently module-private — export it as part of this task.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/split-end-tab.test.ts`
Expected: FAIL — `shouldHaveTab` is not exported.

- [ ] **Step 3: Add the config field**

In `src/lib/types.ts:707-717`:

```ts
export type OutlinedTabConfig = {
	bandEdge?: TabEdgeOption;
	bandEnd?: TabEdgeOption;
	/**
	 * Tab at a split seam. Unlike `bandEnd`, which allocates by comparing tube
	 * indices, this compares piece indices — sibling pieces share a tube, so the
	 * tube comparison is degenerate for them. 'after' gives the tab to the
	 * lower-indexed piece.
	 *
	 * Unset by default, so enabling splits never changes outlined output on its
	 * own.
	 */
	splitEnd?: TabEdgeOption;
	tabLayout?: 'inner' | 'outer';
	shape: TabShape;
	tabWidth: number;
	inset?: number;
};
```

- [ ] **Step 4: Carry the seam partner on the edge**

In `src/lib/cut-pattern/generate-outlined-pattern.ts`, add to `OutlineEdge` (83-106):

```ts
	/** Set on a cap edge that is a split seam; the adjacent piece's index. */
	seamPartnerPiece?: number;
```

In `getOutlineEdges`, the far-end cap is pushed at 228-235 and the near-end cap at 268-275. Set the field on each from the band's `seamAt` and `address.piece`:

```ts
	const piece = band.address?.piece;
	const farEndSeamPartner =
		band.seamAt?.end && piece !== undefined ? piece + 1 : undefined;
	const nearEndSeamPartner =
		band.seamAt?.start && piece !== undefined ? piece - 1 : undefined;
```

Add `seamPartnerPiece: farEndSeamPartner` to the far-end push and `seamPartnerPiece: nearEndSeamPartner` to the near-end push.

- [ ] **Step 5: Add the seam branch to `shouldHaveTab`**

Export the function and insert the seam branch **before** the existing `side === 'end'` branch (currently 387-393):

```ts
export const shouldHaveTab = (
	edge: OutlineEdge,
	tabConfig: OutlinedTabConfig,
	hasPartners: { after: boolean; before: boolean },
	currentTube: number,
	bandIndex = 0,
	bandCount = 0,
	currentPiece?: number
): boolean => {
	// ... existing long-edge logic unchanged ...

	// A split seam is allocated by piece index. This must precede the generic
	// end-edge branch, which compares tube indices and cannot separate two
	// pieces of the same tube.
	if (edge.side === 'end' && edge.seamPartnerPiece !== undefined && currentPiece !== undefined) {
		if (!tabConfig.splitEnd) return false;
		if (tabConfig.splitEnd === 'beforeAndAfter') return true;
		if (tabConfig.splitEnd === 'after') return edge.seamPartnerPiece > currentPiece;
		if (tabConfig.splitEnd === 'before') return edge.seamPartnerPiece < currentPiece;
		return false;
	}

	if (edge.side === 'end') {
		// ... existing bandEnd logic unchanged ...
	}
};
```

Thread `currentPiece` from `generateOutlinedBandPattern` (which reads `band.address?.piece`) through `buildOutlinePath` to `shouldHaveTab`. Both take an explicit parameter list, so add it at the end with a default of `undefined` to leave existing callers working.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/split-end-tab.test.ts`
Expected: PASS, all five tests.

Run: `npm run test:unit`
Expected: PASS, no outlined regressions.

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/cut-pattern/generate-outlined-pattern.ts src/lib/cut-pattern/__tests__/split-end-tab.test.ts
git commit -m "feat(outlined): add splitEnd tab allocated by piece index"
```

### Task 13: Add the `splitEnd` UI control

**Files:**
- Modify: `src/components/modal/editor/PatternView.svelte:227-239` (after the Band End row)

**Interfaces:**
- Consumes: `OutlinedTabConfig.splitEnd` (Task 12).

- [ ] **Step 1: Add the control**

In `src/components/modal/editor/PatternView.svelte`, immediately after the existing "Band End" `LabeledControl` (227-239), add a "Split End" row following the identical pattern — `value={tabConfig.splitEnd ?? 'none'}`, `onchange` calling `setTab({ splitEnd: optional(e.currentTarget.value) })`, options from the existing `edgeOptions` array (`:125`).

Copy the Band End row's markup exactly and change the label, the bound field and the handler. Do not introduce a new control idiom — every input in this file is uncontrolled-with-`value=` plus `onchange`, never `bind:`.

- [ ] **Step 2: Verify in the browser**

Start `npm run dev`. Open `/designer2`, open the Pattern View floater (target it by index into `nav .hover-button-container button` — the rail renders titles as split letters so text selectors do not work), switch the pattern type to an outlined pattern, enable Tabs, and confirm the Split End select appears and persists a value.

- [ ] **Step 3: Run the type check**

Run: `npm run check 2>&1 | tail -5`
Expected: within a few of baseline.

- [ ] **Step 4: Commit**

```bash
git add src/components/modal/editor/PatternView.svelte
git commit -m "feat(outlined): expose the splitEnd tab control"
```

- [ ] **Step 5: Close the phase**

```bash
bd close shades-1xp
```

---

## Phase 5 — Split placement UI and auto-split (issue `shades-rya`)

### Task 14: Add the interaction mode and per-boundary click targets

**Files:**
- Modify: `src/components/three-renderer/interaction-mode.ts:5-8`, `:42-64`, `:89`
- Create: `src/components/cut-pattern/SplitTargets.svelte`
- Modify: `src/components/cut-pattern/BandComponent.svelte`

**Interfaces:**
- Consumes: `patternConfigStore`, `subunitCount` via the resolved pattern entry.
- Produces: `{ type: 'quad-split-select' }` interaction mode.

- [ ] **Step 1: Add the interaction mode**

In `src/components/three-renderer/interaction-mode.ts`, add to the `InteractionMode` union:

```ts
	| { type: 'quad-split-select' };
```

And an entry in the `interactions` map at `:89` — **this is mandatory**, because `PointPick.svelte` dereferences `interactions[$mode.type]` and an absent entry crashes it:

```ts
	'quad-split-select': {
		prompt: 'Click a quad boundary in the pattern view to place or remove a split',
		buttonPrompt: 'Place splits',
		buttonReady: 'Done'
	},
```

`Scene.svelte`'s `handleClick` branches on known mode families, so this 2D-only mode falls through to no 3D action. Verify that by clicking in the 3D view while the mode is active — nothing should select.

- [ ] **Step 2: Write the targets component**

Create `src/components/cut-pattern/SplitTargets.svelte`. It receives the band and renders one target per legal boundary:

```svelte
<script lang="ts">
	import type { BandCutPattern } from '$lib/types';

	let {
		band,
		subunitCount = 1,
		splitQuads = [],
		onToggle
	}: {
		band: BandCutPattern;
		subunitCount?: number;
		splitQuads?: number[];
		onToggle: (quadIndex: number) => void;
	} = $props();

	// Quad k's boundary with k+1 is its d->c edge: quad[k+1].a === quad[k].d and
	// quad[k+1].b === quad[k].c, with unit y running along the band.
	const boundaries = $derived(
		band.facets
			.map((facet, index) => ({ facet, index }))
			.filter(
				({ facet, index }) =>
					!!facet.quad && index > 0 && index < band.facets.length && index % subunitCount === 0
			)
			.map(({ facet, index }) => ({
				index,
				// The boundary is the previous quad's far edge.
				from: band.facets[index - 1].quad!.d,
				to: band.facets[index - 1].quad!.c
			}))
	);
</script>

{#each boundaries as boundary (boundary.index)}
	<g class="split-target" class:active={splitQuads.includes(boundary.index)}>
		<!-- Visible hairline -->
		<line
			x1={boundary.from.x}
			y1={boundary.from.y}
			x2={boundary.to.x}
			y2={boundary.to.y}
			class="hairline"
		/>
		<!-- Fat invisible hit target. stopPropagation keeps BandComponent's
		     band-level onclick from also firing and selecting the band. -->
		<line
			x1={boundary.from.x}
			y1={boundary.from.y}
			x2={boundary.to.x}
			y2={boundary.to.y}
			class="hit"
			role="button"
			tabindex="0"
			onclick={(e) => {
				e.stopPropagation();
				onToggle(boundary.index);
			}}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.stopPropagation();
					onToggle(boundary.index);
				}
			}}
		/>
	</g>
{/each}

<style>
	.hairline {
		stroke: #888;
		stroke-width: 1;
		stroke-dasharray: 4 3;
		pointer-events: none;
	}
	.split-target.active .hairline {
		stroke: #d33;
		stroke-width: 2;
		stroke-dasharray: none;
	}
	.hit {
		stroke: transparent;
		stroke-width: 12;
		cursor: pointer;
	}
</style>
```

- [ ] **Step 3: Render it from BandComponent**

In `src/components/cut-pattern/BandComponent.svelte`, inside the band `<g>` (after `{@render children?.()}`), render `<SplitTargets>` when the mode is active, plus the always-on split lines when it is not. Read `$interactionMode` and `$patternConfigStore`, and write the toggle straight to config:

```ts
	const toggleSplit = (quadIndex: number) => {
		const tube = band.address.tube;
		const cfg = $patternConfigStore.patternConfig;
		const existing = cfg.splits?.tubeSplits ?? [];
		const entry = existing.find((t) => t.tube === tube);
		const quads = entry?.quads ?? [];
		const next = quads.includes(quadIndex)
			? quads.filter((q) => q !== quadIndex)
			: [...quads, quadIndex].sort((a, b) => a - b);
		// Rebuild references down the edited path. Mutating in place works with
		// writable.set but leaves any $derived chain reading through it stale.
		patternConfigStore.update((store) => ({
			...store,
			patternConfig: {
				...store.patternConfig,
				splits: {
					tubeSplits: [
						...existing.filter((t) => t.tube !== tube),
						...(next.length ? [{ tube, quads: next }] : [])
					].sort((a, b) => a.tube - b.tube)
				}
			}
		}));
	};
```

Check `patternConfigStore`'s actual shape before writing this — if it is not `{ patternConfig }` at the top level, adjust. Read the store definition rather than assuming.

- [ ] **Step 4: Verify in the browser**

Start `npm run dev` (restart if the worker was touched). Open `/designer2`, switch Geometry to **Voronoi**, enter split mode, and click a boundary. Confirm: the line turns active, the band does not get selected by the same click, and the pattern regenerates into two pieces.

- [ ] **Step 5: Commit**

```bash
git add src/components/three-renderer/interaction-mode.ts src/components/cut-pattern/SplitTargets.svelte src/components/cut-pattern/BandComponent.svelte
git commit -m "feat(split): add quad-split-select mode and per-boundary click targets"
```

### Task 15: Write the auto-split solver

**Files:**
- Create: `src/lib/cut-pattern/auto-split.ts`
- Create: `src/lib/cut-pattern/__tests__/auto-split.test.ts`

**Interfaces:**
- Produces: `deriveAutoSplits({ quadLengths, contentLength, subunitCount }): number[]`. Consumed by Task 16.

- [ ] **Step 1: Write the failing test**

Create `src/lib/cut-pattern/__tests__/auto-split.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';

import { deriveAutoSplits } from '../auto-split';

describe('deriveAutoSplits', () => {
	it('returns no splits when the band already fits', () => {
		expect(deriveAutoSplits({ quadLengths: [10, 10, 10], contentLength: 100, subunitCount: 1 })).toEqual(
			[]
		);
	});

	it('splits greedily at the last boundary that still fits', () => {
		// 6 quads of 10 each, page fits 25 => 2 quads per piece.
		expect(
			deriveAutoSplits({
				quadLengths: [10, 10, 10, 10, 10, 10],
				contentLength: 25,
				subunitCount: 1
			})
		).toEqual([2, 4]);
	});

	it('snaps splits to multiples of subunitCount', () => {
		// Page fits 2 quads, but subunitCount 3 forces boundaries at 3 and 6.
		expect(
			deriveAutoSplits({
				quadLengths: [10, 10, 10, 10, 10, 10, 10, 10, 10],
				contentLength: 25,
				subunitCount: 3
			})
		).toEqual([3, 6]);
	});

	it('handles uneven quad lengths', () => {
		expect(
			deriveAutoSplits({ quadLengths: [30, 5, 5, 30], contentLength: 40, subunitCount: 1 })
		).toEqual([1, 3]);
	});

	it('returns no splits when a single quad already exceeds the page', () => {
		// Nothing can be done by splitting along the band; the caller should
		// surface the existing overflow warning instead.
		expect(deriveAutoSplits({ quadLengths: [200, 200], contentLength: 100, subunitCount: 1 })).toEqual(
			[]
		);
	});

	it('returns no splits for an empty band', () => {
		expect(deriveAutoSplits({ quadLengths: [], contentLength: 100, subunitCount: 1 })).toEqual([]);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/auto-split.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/cut-pattern/auto-split.ts`:

```ts
/**
 * Derive split positions that make each piece fit the page's content box.
 *
 * Greedy first-fit along the band, snapped to multiples of subunitCount so
 * both sides of every split stay divisible and generateTiling never refuses a
 * piece. A one-shot computation over already-generated geometry: the result is
 * written into config as ordinary splits, indistinguishable from hand-placed
 * ones.
 *
 * If a single subunit group already exceeds the content box, no split can help
 * and none is returned — the caller surfaces the existing overflow warning.
 */
export const deriveAutoSplits = ({
	quadLengths,
	contentLength,
	subunitCount
}: {
	quadLengths: number[];
	contentLength: number;
	subunitCount: number;
}): number[] => {
	const quadCount = quadLengths.length;
	if (quadCount === 0 || contentLength <= 0) return [];

	const total = quadLengths.reduce((sum, l) => sum + l, 0);
	if (total <= contentLength) return [];

	const splits: number[] = [];
	let runStart = 0;
	let runLength = 0;

	// Walk in subunit groups so every candidate boundary is legal by construction.
	for (let group = 0; group * subunitCount < quadCount; group++) {
		const start = group * subunitCount;
		const end = Math.min(start + subunitCount, quadCount);
		const groupLength = quadLengths.slice(start, end).reduce((sum, l) => sum + l, 0);

		if (runLength > 0 && runLength + groupLength > contentLength) {
			splits.push(start);
			runStart = start;
			runLength = groupLength;
		} else {
			runLength += groupLength;
		}

		// A single group that cannot fit on its own is unsplittable along the band.
		if (runStart === start && groupLength > contentLength) return [];
	}

	return splits;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/auto-split.test.ts`
Expected: PASS, all six tests. If `handles uneven quad lengths` fails, trace the greedy accumulation by hand against the fixture before changing the assertion — the expected value is derived from the stated algorithm, not guessed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cut-pattern/auto-split.ts src/lib/cut-pattern/__tests__/auto-split.test.ts
git commit -m "feat(split): add the auto-split solver"
```

### Task 16: Add the Splits panel group

**Files:**
- Modify: `src/components/modal/editor/PageLayout.svelte`

**Interfaces:**
- Consumes: `deriveAutoSplits` (Task 15), `validateSplitConfig` (Task 7), `buildPageGeom` (`registry.ts:11`), the `quad-split-select` mode (Task 14).

- [ ] **Step 1: Add the group**

In `src/components/modal/editor/PageLayout.svelte`, inside the `{#if mode === 'page'}` block, add a "Splits" group following the header + conditional-controls pattern used elsewhere in the editor:

- A mode toggle button mirroring the existing measure-mode pair at `:70-76`:
  ```ts
  let isSplitting = $derived($interactionMode.type === 'quad-split-select');
  const startSplitting = () => interactionMode.set({ type: 'quad-split-select' });
  const stopSplitting = () => interactionMode.set({ type: 'standard' });
  ```
- An "Auto-split" button, implemented as below. Bands are aligned with their long
  axis along **y** (`reAlignBand`), so "length along the band" means a quad's
  y-extent, and the page dimension to compare against is `contentHeight`
  (`PageGeom.contentHeight`, `page-layout/types.ts:16`, set at `registry.ts:22`
  to `pageHeight - 2 * marginPx`). Sizing off the longest band is what makes one
  tube-wide split set safe for every sibling in that tube.

  ```ts
  import { buildPageGeom } from '$lib/cut-pattern/page-layout/registry';
  import { deriveAutoSplits } from '$lib/cut-pattern/auto-split';
  import type { BandCutPattern, Quadrilateral } from '$lib/types';

  // A quad's extent along the band axis (y), from its four corners.
  const quadYExtent = (quad: Quadrilateral) => {
  	const ys = [quad.a.y, quad.b.y, quad.c.y, quad.d.y];
  	return Math.max(...ys) - Math.min(...ys);
  };

  const quadYExtents = (band: BandCutPattern): number[] =>
  	band.facets.filter((f) => !!f.quad).map((f) => quadYExtent(f.quad!));

  const autoSplit = () => {
  	const geom = buildPageGeom(cfg);
  	const tubeSplits = collatedTubes
  		.map((tube, tubeIndex) => {
  			if (!tube?.bands?.length) return { tube: tubeIndex, quads: [] };
  			// Longest band in the tube, measured in quad count.
  			const longest = tube.bands.reduce((a, b) =>
  				quadYExtents(b).length > quadYExtents(a).length ? b : a
  			);
  			return {
  				tube: tubeIndex,
  				quads: deriveAutoSplits({
  					quadLengths: quadYExtents(longest),
  					contentLength: geom.contentHeight,
  					subunitCount: subunitCountForTube(tube)
  				})
  			};
  		})
  		.filter(({ quads }) => quads.length > 0);

  	patternConfigStore.update((store) => ({
  		...store,
  		patternConfig: { ...store.patternConfig, splits: { tubeSplits } }
  	}));
  };
  ```

  `collatedTubes` is the generated `TubeCutPattern[]`. `PatternViewer.svelte:32-44`
  builds it via `collateTubes`; if it is not already reachable from this panel,
  derive it the same way rather than recomputing band geometry.

  `subunitCountForTube(tube)` resolves the tube's configured pattern type through
  `resolvePatternEntry` and reads `subunitCount ?? 1`. **It must return the same
  value Task 9 passes to `splitFlatBands`** — if they disagree, auto-split will
  propose positions the splitter then rejects, and you will see splits silently
  vanish with a console warning.
- A per-tube split count readout.
- A "Clear splits" button writing `{ tubeSplits: [] }`.
- A warning row, in the existing `.warn` style used for `(overflow)` at `:329`, listing any splits dropped by `validateSplitConfig`.

Use the `cfg = $derived({ ...pageLayout })` shallow-copy idiom already at `:26` — returning the object itself keeps the same reference and freezes every readout.

- [ ] **Step 2: Verify in the browser**

Start `npm run dev`. Open `/designer2`, Geometry → Voronoi, open the Pattern Layout floater. Set a page size small enough to overflow, click Auto-split, and confirm splits appear, the piece count rises, and the `(overflow)` warning clears. Then click Clear splits and confirm it returns to one piece per band.

- [ ] **Step 3: Write a headless check**

Create a `.mjs` script **at the repo root** (so it resolves `@playwright/test`) that loads `/designer2` on port 9776, switches Geometry to Voronoi, opens the Pattern Layout floater by index into `nav .hover-button-container button`, clicks Auto-split, and asserts the SVG band-group count increased. Run it with `node`.

- [ ] **Step 4: Commit**

```bash
git add src/components/modal/editor/PageLayout.svelte
git commit -m "feat(split): add the Splits panel group with auto-split and clear"
```

- [ ] **Step 5: Close the phase**

```bash
bd close shades-rya
```

---

## Phase 6 — Explicit size setting (issue `shades-ehy`)

Independent of Phases 0–5. Can be done first.

### Task 17: Derive `pageScale` from a target measurement

**Files:**
- Create: `src/lib/cut-pattern/page-layout/derive-page-scale.ts`
- Create: `src/lib/cut-pattern/page-layout/__tests__/derive-page-scale.test.ts`
- Modify: `src/lib/cut-pattern/page-layout/units.ts:15-20`

**Interfaces:**
- Produces: `derivePageScaleForTarget(rawPatternUnits, targetMm): number | undefined`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/cut-pattern/page-layout/__tests__/derive-page-scale.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { Box3, Vector3 } from 'three';

import { derivePageScaleForTarget } from '../derive-page-scale';
import { derivePageDimensions, deriveDistance } from '../units';

describe('derivePageScaleForTarget', () => {
	it('is the exact inverse of derivePageDimensions', () => {
		// pageScale is pattern-units per mm, so mm = units / pageScale and
		// therefore pageScale = units / targetMm.
		const bounds = new Box3(new Vector3(0, 0, 0), new Vector3(762, 340, 340));
		const scale = derivePageScaleForTarget(762, 500)!;
		expect(derivePageDimensions(bounds, scale).mm.x).toBeCloseTo(500, 9);
	});

	it('is the exact inverse of deriveDistance', () => {
		const a = new Vector3(0, 0, 0);
		const b = new Vector3(3, 4, 0); // distance 5
		const scale = derivePageScaleForTarget(5, 25)!;
		expect(deriveDistance(a, b, scale).mm).toBeCloseTo(25, 9);
	});

	it('rejects a non-positive target, which would give an infinite scale', () => {
		expect(derivePageScaleForTarget(762, 0)).toBeUndefined();
		expect(derivePageScaleForTarget(762, -5)).toBeUndefined();
	});

	it('rejects non-finite input', () => {
		expect(derivePageScaleForTarget(762, Number.NaN)).toBeUndefined();
		expect(derivePageScaleForTarget(Number.POSITIVE_INFINITY, 500)).toBeUndefined();
	});

	it('rejects a non-positive raw measurement', () => {
		// A zero-extent axis cannot be scaled to a target.
		expect(derivePageScaleForTarget(0, 500)).toBeUndefined();
	});
});

describe('derivePageDimensions zero guard', () => {
	it('stays finite when pageScale is zero rather than returning Infinity', () => {
		// Mirrors deriveDistance, which already guards. Without this, a zero
		// pageScale from an older saved config poisons every readout in the panel.
		const bounds = new Box3(new Vector3(0, 0, 0), new Vector3(10, 20, 30));
		const d = derivePageDimensions(bounds, 0);
		expect(Number.isFinite(d.mm.x)).toBe(true);
		expect(Number.isFinite(d.inch.z)).toBe(true);
	});

	it('is unchanged for a normal pageScale', () => {
		const bounds = new Box3(new Vector3(0, 0, 0), new Vector3(10, 20, 30));
		expect(derivePageDimensions(bounds, 2).mm).toEqual({ x: 5, y: 10, z: 15 });
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- src/lib/cut-pattern/page-layout/__tests__/derive-page-scale.test.ts`
Expected: FAIL — module not found, and the zero-guard test fails with `Infinity`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/cut-pattern/page-layout/derive-page-scale.ts`:

```ts
/**
 * pageScale that makes a measured extent read as `targetMm`.
 *
 * derivePageDimensions and deriveDistance both compute mm = patternUnits /
 * pageScale, so the inverse is a single division — no search needed.
 *
 * Returns undefined for input that cannot produce a usable scale, so the caller
 * can reject the edit rather than writing Infinity or NaN into config.
 */
export const derivePageScaleForTarget = (
	rawPatternUnits: number,
	targetMm: number
): number | undefined => {
	if (!Number.isFinite(rawPatternUnits) || !Number.isFinite(targetMm)) return undefined;
	if (rawPatternUnits <= 0 || targetMm <= 0) return undefined;
	return rawPatternUnits / targetMm;
};
```

- [ ] **Step 4: Add the zero guard to `derivePageDimensions`**

In `src/lib/cut-pattern/page-layout/units.ts:15-20`:

```ts
export const derivePageDimensions = (bounds: Box3, pageScale: number): DerivedDimensions => {
	const size = new Vector3();
	bounds.getSize(size);
	// Mirrors deriveDistance: a zero pageScale (possible in older saved configs)
	// would otherwise produce Infinity and break every readout in the panel.
	const scale = pageScale || 1;
	const mm = { x: size.x / scale, y: size.y / scale, z: size.z / scale };
	return { mm, inch: { x: mmToInch(mm.x), y: mmToInch(mm.y), z: mmToInch(mm.z) } };
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:unit -- src/lib/cut-pattern/page-layout/`
Expected: PASS, including the existing `units.test.ts` — its `derivePageDimensions(bounds, 2)` assertion is unaffected because `2` is truthy, so the guard is purely additive.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cut-pattern/page-layout/derive-page-scale.ts src/lib/cut-pattern/page-layout/__tests__/derive-page-scale.test.ts src/lib/cut-pattern/page-layout/units.ts
git commit -m "feat(page-layout): derive pageScale from a target measurement, guard zero scale"
```

### Task 18: Add the size inputs to the panel

**Files:**
- Modify: `src/components/modal/editor/PageLayout.svelte:333-341` (model size rows), `:343-353` (measurement rows)

**Interfaces:**
- Consumes: `derivePageScaleForTarget` (Task 17).

- [ ] **Step 1: Add the handler**

In `src/components/modal/editor/PageLayout.svelte`:

```ts
	import { derivePageScaleForTarget } from '$lib/cut-pattern/page-layout/derive-page-scale';

	// Values are typed in the current display unit; pageScale is per mm.
	const applyTargetSize = (rawPatternUnits: number, targetInDisplayUnit: number) => {
		const targetMm = unit === 'inch' ? inchToMm(targetInDisplayUnit) : targetInDisplayUnit;
		const next = derivePageScaleForTarget(rawPatternUnits, targetMm);
		if (next === undefined) return;
		// Same write path as the "Fit page" toast, but full precision rather than
		// rounded up — the goal is the number typed, not a fit safety margin.
		patternConfigStore.update((store) => ({
			...store,
			patternConfig: {
				...store.patternConfig,
				pageLayout: { ...store.patternConfig.pageLayout, pageScale: next }
			}
		}));
	};
```

- [ ] **Step 2: Add the inputs**

To each of the three model-size rows, add an input to the right. `raw` is the bounds extent in pattern units — read it from `$model3dBoundsStore` via `getSize`, **not** from the already-divided `derived3d` value:

```svelte
	<input
		type="number"
		min="0"
		step="any"
		placeholder="set"
		onchange={(e) => {
			const target = Number(e.currentTarget.value);
			if (target > 0) applyTargetSize(rawSize.x, target);
			e.currentTarget.value = '';
		}}
	/>
```

Do the same for `y`, `z`, and for each measurement row using `m.a.distanceTo(m.b)` as the raw value. Clearing the field after commit keeps it reading as "set to…" rather than as a stale mirror.

Commit on `change` (Enter/blur), never on `input` — per-keystroke would trigger a regeneration per digit.

- [ ] **Step 3: Verify in the browser**

Start `npm run dev`. Open `/designer2`, Pattern Layout floater, mode `page`. Note the X model size, type half that number into the X input, press Enter. Confirm: X reads the number you typed, Y and Z scale proportionally, and `pageScale` in the field above changed. Then place a measurement and repeat on its row.

Try `0` and a negative number — both must be ignored, with every readout staying finite.

- [ ] **Step 4: Run the checks**

Run: `npm run test:unit`
Expected: PASS.

Run: `npm run check 2>&1 | tail -5`
Expected: within a few of baseline.

- [ ] **Step 5: Commit**

```bash
git add src/components/modal/editor/PageLayout.svelte
git commit -m "feat(page-layout): make model size and measurement rows settable"
```

- [ ] **Step 6: Close the phase and the epic**

```bash
bd close shades-ehy
bd close shades-5a9
```

---

## Final verification

- [ ] `npm run test:unit` — all green.
- [ ] `npm run check 2>&1 | tail -5` — total error count within a few of the ~434 baseline. Compare against the number recorded in Task 5.
- [ ] `npm run lint` — clean, or no worse than before.
- [ ] Phase 0's characterization tests pass **unmodified**. If any was edited or snapshot-updated during the work, that is a red flag: the refactor changed unsplit behaviour and the change needs justifying.
- [ ] Manual: an unsplit config renders byte-identically to `main`.
- [ ] Manual: a split tiled pattern's pieces meet at the seam.
- [ ] Manual: a split outlined pattern gets exactly one tab per seam.
- [ ] Manual: panel patterns are unaffected by splits.
- [ ] `git log --oneline` on the branch reads as a coherent sequence.
- [ ] **Do not push.** Local-only app.
