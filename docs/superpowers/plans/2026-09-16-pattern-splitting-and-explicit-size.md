# Pattern Splitting and Explicit Size Setting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an over-large cut pattern be subdivided into page-fitting pieces that glue back into the original, and make the page-layout panel's size readouts editable so `pageScale` can be derived from a target measurement.

**Architecture:** Splits are persisted per tube as absolute quad indices and applied by partitioning the _flattened_ band between `getFlatStripV2` and `alignBands`, so pieces are a literal partition of one flat layout. Band indices stay stable and pieces get a new `piece` address component, which requires generalizing several address helpers that currently fail silently on a piece-bearing address. Seam joinery is pattern-type dependent: tiled reuses the existing partnered band-end overlap with no new pattern code, outlined gains a split-end tab, panel ignores splits.

**Tech Stack:** SvelteKit, TypeScript, Three.js, Jest (`npm run test:unit`), Playwright (`npm test`), `svelte-check` (`npm run check`).

**Spec:** `docs/superpowers/specs/2026-09-16-pattern-splitting-and-explicit-size-design.md`

## Global Constraints

- Tests are Jest, colocated in `__tests__/` beside the source, named `*.test.ts`. Import test globals explicitly: `import { describe, it, expect } from '@jest/globals';`
- Run a single test file with `npm run test:unit -- path/to/file.test.ts`.
- **Indentation is tabs**, not spaces. Format ONLY the files you touched, with `npx prettier --write <your files>`. **Never run `npm run format`** — the repo is not fully Prettier-clean, so it rewrites ~62 unrelated files across `docs/` and `src/` and leaves them dirty for every later task to trip over.
- `npm run check` has a pre-existing baseline of **~434 errors**. This is CLEAN. Judge regressions by the _diff_ in total count, never by absence of errors. Do not attempt to fix pre-existing errors.
- This is a **local-only app. Never `git push`.** Commit locally and stop.
- Never run `git stash`, `git checkout <branch>`, or `git reset` — this branch carries uncommitted design work at various points.
- Geometry generation runs in a Web Worker. Vite does **not** rebuild the worker on reload; if you edit anything under `src/lib/workers/` or a module it imports, **restart the dev server**.
- `pageScale` is **pattern-units per mm**. `mm = patternUnits / pageScale`. Getting this inverted is the single easiest mistake in Phase 6.
- Quad/facet relationship: quad _k_ is built from facets _2k_ and _2k+1_. `getQuadrilaterals` pairs on `i % 2 === 1`, so an odd trailing facet is silently dropped.
- Working branch: `feature/pattern-splitting-and-explicit-size`. Already created.
- **`patternConfigStore.update(callback)` does not work. Never write config that way.** `persistable` returns `update: function (value: T) { update((value) => value); … }` (`src/lib/persistable.ts:78-81`) — the parameter is a **value**, the inner `writable.update` is called with the identity function, so the store state never changes and the argument is only handed to `schedulePersist`. Passing a callback is also a type error (`T` is `GlobulePatternConfig`, not a function). The two idioms this codebase actually uses, both of which change the store:
  - `patternConfigStore.set(mutate(get(patternConfigStore)))` — `PatternView.svelte:39`, also `TileEditor.svelte:134`, `LabelEditor.svelte:54`. Use this when a `$derived` chain reads through the edited path, because it rebuilds object references.
  - direct assignment, `$patternConfigStore.patternConfig.… = x` — `PageLayout.svelte:63`, `:265`, `CutPatternRenderer.svelte:297` (the "Fit page" toast). Svelte 5's `$` assignment calls `.set()` with the same root object, so **references down the edited path are NOT rebuilt**; a panel reading through `$derived` can go stale (this is exactly why `PageLayout.svelte:26` keeps a `{ ...pageLayout }` shallow copy).
  Tasks 14, 16 and 18 all write `patternConfig`, and all three must use the `.set(...)`-with-rebuilt-object form, which satisfies both this constraint and the spec's "rebuild object references down the edited path" requirement (design L396-402).
- `BandCutPattern['address']` is `GlobuleAddress_Band` (`types.ts:429`), which has no `piece`. Task 9 widens it to `GlobuleAddress_Band | GlobuleAddress_BandPiece`; before that point, read a possible piece via the `isGlobuleAddress_BandPiece` type guard rather than by reaching for `.piece`. Note the already-committed `tube-pattern-characterization.test.ts` asserts `b.address.piece === undefined`, so it carries one `svelte-check` error until Task 9 lands.

## Beads Tracking

Each phase maps to an existing beads issue. Mark it in progress when you start and closed when the phase's last commit lands.

| Phase | Issue        | Tasks |
| ----- | ------------ | ----- |
| 0     | `shades-b9d` | 1–2   |
| 1     | `shades-1qz` | 3–6   |
| 2     | `shades-puy` | 7–9   |
| 2     | `shades-0u5` | 9a    |
| 3     | `shades-u6z` | 10–11 |
| 4     | `shades-1xp` | 12–13 |
| 5     | `shades-rya` | 14–16 |
| 6     | `shades-ehy` | 17–18 |

`bd update <id> --status=in_progress`, then `bd close <id>`.

## File Structure

**Created:**

| File                                                                  | Responsibility                                                                      |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/lib/cut-pattern/split-flat-bands.ts`                             | Pure partition of flattened bands at legal quad boundaries. No coordinate math.     |
| `src/lib/cut-pattern/__tests__/split-flat-bands.test.ts`              | Tests for the above.                                                                |
| `src/lib/cut-pattern/band-key.ts`                                     | The one shared `bandKey`, replacing four copies.                                    |
| `src/lib/cut-pattern/__tests__/band-key.test.ts`                      | Characterization + piece behaviour for `bandKey`.                                   |
| `src/lib/__tests__/address-helpers-characterization.test.ts`          | Locks `isSameAddress` / `concatAddress` behaviour before it changes.                |
| `src/lib/cut-pattern/__tests__/tube-pattern-characterization.test.ts` | Locks a full no-split generated tube pattern.                                       |
| `src/lib/cut-pattern/auto-split.ts`                                   | Derives split positions from page size. UI-side, over already-generated patterns.   |
| `src/lib/cut-pattern/__tests__/auto-split.test.ts`                    | Tests for the above.                                                                |
| `src/components/cut-pattern/SplitTargets.svelte`                      | Mode-gated per-boundary click targets, rendered inside `BandComponent`'s children.  |
| `src/lib/cut-pattern/page-layout/derive-page-scale.ts`                | `pageScale` from a target measurement. The exact inverse of `derivePageDimensions`. |
| `src/lib/cut-pattern/page-layout/__tests__/derive-page-scale.test.ts` | Tests for the above, including the zero guard.                                      |

**Modified:** `src/lib/types.ts` (SplitConfig, piece address, optional `Band` fields, optional `meta` partners, widened `BandCutPattern['address']`), `src/lib/util.ts` (`isSameAddress`, `concatAddress`), `src/lib/shades-config.ts` (defaults), `src/lib/validators.ts` (split validation), `src/lib/cut-pattern/generate-tiled-pattern.ts` (insertion point, `parentAscending`, four `globalBandIndex` sites, `meta` condition), `src/lib/cut-pattern/generate-outlined-pattern.ts` (insertion point, `seamPartnerPiece`, `shouldHaveTab`, piece-aware band id/address), `src/lib/cut-pattern/generate-pattern.ts` (`findBandByAddress`, `getEndPartnerTransforms`, `splitQuads` selection at both `generateTubeCutPattern` call sites and the outlined call site), `src/lib/patterns/tesselation/shared/helpers.ts` (shared lookup), `src/lib/cut-pattern/band-sort-index.ts` / `band-partner-info.ts` / `build-pattern-csv.ts` (use shared `bandKey`), `src/lib/cut-pattern/page-layout/units.ts` (zero guard), `src/components/three-renderer/interaction-mode.ts` (new mode), `src/components/cut-pattern/BandComponent.svelte` (render split targets), `src/components/modal/editor/PageLayout.svelte` (Splits group, size inputs), `src/components/modal/editor/PatternView.svelte` (splitEnd input).

**Modified for the split-config plumbing (Task 9a):** `src/lib/stores/globulePatternStores.ts` (`splits` on `PatternGenerationConfig`, so a split write triggers regeneration), `src/lib/cut-pattern/run-pattern-generation.ts` (carry `splits` into the rebuilt config), `src/components/cut-pattern/CutPatternRenderer.svelte` (Task 10's positional partner-band lookup).

**Created for the split-config plumbing (Task 16):** `src/lib/stores/collatedTubesStore.ts` (one exported collated `TubeCutPattern[]`, consumed by both `PatternViewer.svelte` and the Splits panel).

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
			tiledPatternConfig,
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
Expected: PASS, with new snapshots written. Read the written snapshot file and sanity-check it: band ids should look like `tiledHexPattern-1-band-0-0-0` and `...-0-0-1`, facet counts should be non-zero, errors should all be `undefined`. **If errors are non-undefined, the fixture is wrong** — fix the fixture, not the assertion.

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
		expect(
			isSameAddress({ globule: 0, tube: 0, band: 2 }, { globule: 0, tube: 0, band: 2, piece: 0 })
		).toBe(false);
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
- `src/components/projection/ProjectionGeometryComponent.svelte` — line 96 is a _different_ signature (it takes `{ address?, geometry }`, not an address). Rewrite it to delegate:

```ts
const bandKeyOf = (band: { address?: GlobuleAddress_Band; geometry: BufferGeometry }) =>
	band.address ? bandKey(band.address) : band.geometry.uuid;
```

and update its **five** `{#each}` usages (lines 279, 312, 350, 358, 402) from `bandKey(band)` to `bandKeyOf(band)`. Add `import { bandKey } from '$lib/cut-pattern/band-key';`.

**The `band.geometry.uuid` fallback is load-bearing — keep it exactly.** Verified in the working tree: the existing function returns the geometry's own uuid when `band.address` is absent, and its comment explains why ("Bands without an address (see `collateAddressedBandGeometry`) still render, so the key falls back to the geometry's own uuid"). Returning `''` instead would give every address-less band the *same* Svelte `{#each}` key, and Svelte would reuse one band's DOM for all of them. This is the only one of the four copies whose signature takes `{ address?, geometry }` rather than an address, and the only one with a fallback.

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
		const tubes = [
			tube([band({ globule: 0, tube: 0, band: 0 }), band({ globule: 0, tube: 0, band: 1 })])
		];
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

	it('resolves a plain band address to the lowest piece of a split band', () => {
		// Load-bearing. Every cross-band partner address in the codebase is built
		// as a plain {globule, tube, band} triple — generate-tiled-pattern.ts:375-384,
		// generate-outlined-pattern.ts:549-554, generate-cut-pattern.ts:282-295 —
		// while a split band's pieces carry `piece`. `isSameAddress` reports a piece
		// and a non-piece address as never equal in either mode (util.ts:331,
		// granularity 3 vs 3.5), so an exact-match-only lookup returns undefined
		// here and every cross-band end partner transform silently disappears for a
		// split tube, while the seam transforms keep working.
		const tubes = [
			tube([
				band({ globule: 0, tube: 0, band: 0, piece: 0 }),
				band({ globule: 0, tube: 0, band: 0, piece: 1 })
			])
		];
		const found = findBandByAddress(tubes, { globule: 0, tube: 0, band: 0 });
		expect(found?.address).toEqual({ globule: 0, tube: 0, band: 0, piece: 0 });
	});

	it('prefers the lowest piece regardless of band array order', () => {
		const tubes = [
			tube([
				band({ globule: 0, tube: 0, band: 0, piece: 2 }),
				band({ globule: 0, tube: 0, band: 0, piece: 0 }),
				band({ globule: 0, tube: 0, band: 0, piece: 1 })
			])
		];
		const found = findBandByAddress(tubes, { globule: 0, tube: 0, band: 0 });
		expect(found?.address).toEqual({ globule: 0, tube: 0, band: 0, piece: 0 });
	});

	it('does not resolve a piece query onto an unsplit band', () => {
		// The reverse direction stays strict: asking for piece 1 of a band that was
		// never split is a miss, not a silent hit on the whole band.
		const tubes = [tube([band({ globule: 0, tube: 0, band: 0 })])];
		expect(findBandByAddress(tubes, { globule: 0, tube: 0, band: 0, piece: 1 })).toBeUndefined();
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
 * Two passes, because the two kinds of caller ask different questions:
 *
 * 1. Exact match. A seam partner names a specific sibling
 *    (`{…, band, piece}`), and matching on `band` alone returned the first
 *    sibling, so seam transforms resolved against the wrong piece.
 * 2. Band-level match. Every *cross-band* partner address in the codebase is a
 *    plain `{globule, tube, band}` triple (`generate-tiled-pattern.ts:375-384`,
 *    `generate-outlined-pattern.ts:549-554`, `generate-cut-pattern.ts:282-295`),
 *    but once its target band is split there is no band with that exact
 *    address any more. `isSameAddress` cannot bridge this: it reports a piece
 *    and a non-piece address as never the same address, in either mode
 *    (`util.ts:331`, granularity 3 vs 3.5). Without pass 2, splitting a tube
 *    silently drops every cross-band end partner transform in it while the
 *    seam transforms keep working.
 *
 * Pass 2 is deliberately one-directional: a plain query resolves onto pieces,
 * a piece query never resolves onto an unsplit band.
 *
 * KNOWN LIMITATION, worth stating because the spec does not settle it: pass 2
 * picks the lowest piece. That is the correct partner where the cross-band
 * relationship meets the partner band's *start*, and merely the nearest
 * available one where it meets its far end. The pieces' own seam matching is
 * unaffected (that is pass 1). Revisit if cross-band partners between two
 * split tubes ever need to be exact.
 */
export const findBandByAddress = (
	tubePatterns: TubeCutPattern[],
	address: GlobuleAddress_Band | GlobuleAddress_BandPiece
): BandCutPattern | undefined => {
	const tube = tubePatterns[address.tube];
	if (!tube) return undefined;
	// Bands may be a sparse subset, so look up by address rather than by index.
	const exact = tube.bands.find((b) => isSameAddress(b.address, address));
	if (exact) return exact;
	if (isGlobuleAddress_BandPiece(address)) return undefined;
	// `isGlobuleAddress_BandPiece` narrows the read so this compiles before
	// Task 9 widens BandCutPattern['address'] to admit `piece`.
	const pieces = tube.bands.filter(
		(b) => b.address.band === address.band && isGlobuleAddress_BandPiece(b.address)
	);
	if (pieces.length === 0) return undefined;
	return pieces.reduce((lowest, b) =>
		isGlobuleAddress_BandPiece(b.address) &&
		isGlobuleAddress_BandPiece(lowest.address) &&
		b.address.piece < lowest.address.piece
			? b
			: lowest
	);
};
```

Add `isSameAddress` and `isGlobuleAddress_BandPiece` to the imports from `$lib/util` if not already present, and `GlobuleAddress_BandPiece` to the type imports from `$lib/projection-geometry/types` (`generate-pattern.ts` currently imports `GlobuleAddress_Band` only).

- [ ] **Step 4: Replace the duplicate lookup in helpers.ts**

In `src/lib/patterns/tesselation/shared/helpers.ts`, lines 121-125 currently read:

```ts
	const partnerTube = tubes[partnerAddress.tube];
	if (!partnerTube) return undefined;
	const partnerBand =
		partnerTube.bands.find((b) => b.address.band === partnerAddress.band) ??
		partnerTube.bands[partnerAddress.band];
```

Replace all five lines with:

```ts
	// findBandByAddress already returns undefined for a missing tube, so the
	// separate partnerTube guard goes too — leaving it would make `partnerTube`
	// an unused local and fail `npm run lint`.
	const partnerBand = findBandByAddress(tubes, partnerAddress);
```

Add `import { findBandByAddress } from '$lib/cut-pattern/generate-pattern';`.

**Watch for an import cycle:** `helpers.ts` importing from `generate-pattern.ts` may create one. Run `npm run test:unit` immediately after this edit. If a cycle appears (tests fail with undefined imports), move `findBandByAddress` into its own module `src/lib/cut-pattern/find-band-by-address.ts` and import it from both sites instead. Update the test's import accordingly.

Note the old code had a positional fallback (`?? partnerTube.bands[partnerAddress.band]`). Dropping it is deliberate: with sparse band sets that fallback could return an unrelated band, and `findBandByAddress`'s pass 2 now covers the real case it was papering over (a plain address whose band has been split). If Phase 3's seam tests reveal something else depended on it, reinstate it guarded by `isSameAddress` on the result.

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

- Produces: `TubeSplits`, `SplitConfig`, and
  ```ts
  validateSplitConfig(
  	config: SplitConfig,
  	quadCountsByTube: Record<number, number>
  ): { config: SplitConfig; dropped: TubeSplits[] }
  ```
  It returns the dropped splits as well as the cleaned config, because Task 16 has to render "any splits dropped by `validateSplitConfig`" and a bare cleaned config carries no record of what went. Consumed by Tasks 8, 14, 15, 16.

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
		expect(result.config.tubeSplits).toEqual([{ tube: 0, quads: [2, 4, 6] }]);
		expect(result.dropped).toEqual([]);
	});

	it('drops splits at or beyond the quad count', () => {
		// A shrinking quad count (e.g. fewer edge divisions) must not leave a
		// dangling index behind.
		const result = validateSplitConfig(
			{ tubeSplits: [{ tube: 0, quads: [2, 6, 10, 99] }] },
			{ 0: 6 }
		);
		expect(result.config.tubeSplits).toEqual([{ tube: 0, quads: [2] }]);
	});

	it('reports what it dropped, so the panel can say so', () => {
		// The cleaned config alone carries no record of the loss, and the Splits
		// panel has to render "3 splits dropped as out of range".
		const result = validateSplitConfig(
			{ tubeSplits: [{ tube: 0, quads: [2, 6, 10, 99] }] },
			{ 0: 6 }
		);
		expect(result.dropped).toEqual([{ tube: 0, quads: [6, 10, 99] }]);
	});

	it('drops a zero split, which would produce an empty piece', () => {
		const result = validateSplitConfig({ tubeSplits: [{ tube: 0, quads: [0, 3] }] }, { 0: 6 });
		expect(result.config.tubeSplits).toEqual([{ tube: 0, quads: [3] }]);
		expect(result.dropped).toEqual([{ tube: 0, quads: [0] }]);
	});

	it('drops negative and non-integer splits', () => {
		const result = validateSplitConfig(
			{ tubeSplits: [{ tube: 0, quads: [-1, 2.5, 3] }] },
			{ 0: 6 }
		);
		expect(result.config.tubeSplits).toEqual([{ tube: 0, quads: [3] }]);
		expect(result.dropped).toEqual([{ tube: 0, quads: [-1, 2.5] }]);
	});

	it('removes a tube entry whose splits are all dropped', () => {
		const result = validateSplitConfig({ tubeSplits: [{ tube: 0, quads: [99] }] }, { 0: 6 });
		expect(result.config.tubeSplits).toEqual([]);
		expect(result.dropped).toEqual([{ tube: 0, quads: [99] }]);
	});

	it('drops splits for a tube with no known quad count', () => {
		const result = validateSplitConfig({ tubeSplits: [{ tube: 7, quads: [2] }] }, { 0: 6 });
		expect(result.config.tubeSplits).toEqual([]);
		expect(result.dropped).toEqual([{ tube: 7, quads: [2] }]);
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

Add to `PatternConfig` (beside `pageLayout`, `types.ts:246-267`):

```ts
	splits?: SplitConfig;
```

`PatternConfig` **does** carry an index signature (`types.ts:247-257`), so `SplitConfig` must also be added to that union — this is required, not optional; without it the new field does not type-check:

```ts
export type PatternConfig = {
	[key: string]:
		| PatternShowConfig
		| CutoutConfig
		| Axis
		| PointConfig2
		| boolean
		| undefined
		| PixelScale
		| PageSize
		| PageLayoutConfig
		| SplitConfig;
```

Optional, so no migration is needed — same reasoning as the `fill` field.

- [ ] **Step 4: Add the default**

In `src/lib/shades-config.ts`, inside `defaultPatternConfig()` beside `pageLayout`:

```ts
		splits: { tubeSplits: [] },
```

- [ ] **Step 5: Add the validator**

In `src/lib/validators.ts`, beside `validateProceduralFillConfig` (`:134-149`). Add `SplitConfig` and `TubeSplits` to the existing `import type { … } from '$lib/types'` block at the top of the file — the plan's earlier draft omitted this:

```ts
/**
 * Drop splits that no longer make sense against the current geometry.
 *
 * A split is stored as an absolute quad index, so a geometry change that
 * reduces a tube's quad count (fewer edge divisions, say) can leave an index
 * out of range. Per design, such a split is dropped rather than clamped.
 *
 * Returns the dropped indices alongside the cleaned config: a dropped split is
 * meant to be visible rather than mysterious (design L259-261), and the Splits
 * panel cannot reconstruct the loss from the cleaned config alone.
 */
export const validateSplitConfig = (
	config: SplitConfig,
	quadCountsByTube: Record<number, number>
): { config: SplitConfig; dropped: TubeSplits[] } => {
	const kept: TubeSplits[] = [];
	const dropped: TubeSplits[] = [];

	config.tubeSplits.forEach(({ tube, quads }) => {
		const quadCount = quadCountsByTube[tube];
		const unique = [...new Set(quads)].sort((a, b) => a - b);
		// An unknown tube drops everything: there is no quad count to judge against.
		const isValid = (q: number) =>
			quadCount !== undefined && Number.isInteger(q) && q > 0 && q < quadCount;
		const validQuads = unique.filter(isValid);
		const invalidQuads = unique.filter((q) => !isValid(q));
		if (validQuads.length > 0) kept.push({ tube, quads: validQuads });
		if (invalidQuads.length > 0) dropped.push({ tube, quads: invalidQuads });
	});

	return { config: { tubeSplits: kept }, dropped };
};
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test:unit -- src/lib/__tests__/validate-split-config.test.ts`
Expected: PASS.

- [ ] **Step 7: Call the validator where splits are read for generation**

Without this step the validator is dead code and the spec's authority decision — "out-of-range indices are dropped" on regeneration (design L35, L111-114) — goes unimplemented: nothing prunes a stale index when a tube's quad count shrinks.

`migrateGlobulePatternConfig` (`validators.ts:60-100`) is the wrong home: it runs once at store bootstrap against persisted config and has no geometry, so it cannot know any quad count. The quad counts only exist after generation. So the call belongs in the Splits panel, which already has the generated pattern in hand (Task 16), and it prunes config rather than filtering at generation time:

In Task 16's panel code, derive the quad counts from the collated tubes and prune on mount and whenever the tube geometry changes:

```ts
// Quad counts per tube, measured off the longest band — the same band
// auto-split sizes against, and the only one for which a tube-wide index is
// guaranteed meaningful.
let quadCountsByTube = $derived(
	Object.fromEntries(
		$collatedTubesStore.map((tube) => [
			tube.address.tube,
			Math.max(0, ...tube.bands.map((b) => b.facets.filter((f) => !!f.quad).length))
		])
	)
);

let splitValidation = $derived(
	validateSplitConfig(
		$patternConfigStore.patternConfig.splits ?? { tubeSplits: [] },
		quadCountsByTube
	)
);
```

`splitValidation.dropped` feeds the warning row. Pruning the stored config is a separate, explicit user action rather than an `$effect` — an effect that writes config from a derived read of that same config is a feedback loop, and one regeneration per geometry change is already enough. Add a "Prune dropped splits" button, shown only when `splitValidation.dropped.length > 0`, that writes `splitValidation.config` back using the `.set(...)` idiom from Global Constraints.

Note for the implementer: `splitFlatBands` (Task 8) independently rejects and reports an out-of-range index at generation time, so a stale index is never *applied* even before it is pruned. This step is about making it visible and removable, not about correctness of the geometry.

- [ ] **Step 8: Commit**

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

- Consumes: nothing. This module imports **types only** — deliberately. `reAlignBand`'s bbox helpers live in `src/components/cut-pattern/distrubute-panels.ts`, which imports from `generate-pattern.ts` (`:4`), so importing them here would pull this pure module into that cycle. The parent flip decision is therefore computed by the caller (Task 9 Step 5), not here.
- Produces:

  ```ts
  type SplitRejection = { quad: number; reason: string };
  type SplitFlatBandsResult = { bands: Band[]; rejected: SplitRejection[] };
  splitFlatBands(flatBands: Band[], splitQuads: number[], subunitCount: number): SplitFlatBandsResult
  ```

  Each returned piece carries `parentIndex`, `pieceIndex`, `parentQuadOffset` and `seamAt`. It does **not** touch `address` and does not set `parentAscending`. Consumed by Task 9.

- [ ] **Step 1: Add the optional Band fields**

In `src/lib/types.ts`, in the `Band` type (`:923-934`):

```ts
	/** Set only on pieces of a split band. Parent bands leave these undefined. */
	parentQuadOffset?: number;
	seamAt?: { start?: true; end?: true };
	/**
	 * Index of this piece's parent within the band array that was split, i.e.
	 * the same index space `generateTiling` already works in (`selectedBands`,
	 * the post-range slice of visible bands). This is what keeps `address.band`,
	 * `finishOuterEdge`, `bandContext.bandIndex` and `leftPartnerBand` in the
	 * space they use today — see Task 9 Step 4.
	 *
	 * NOT an address component: two of the three band-construction branches in
	 * generate-projection.ts push bands with no `address` at all (`:714`, `:732`;
	 * only `:696` sets one), so a piece cannot rely on inheriting one.
	 */
	parentIndex?: number;
	/** This piece's ordinal within its parent, 0-based. */
	pieceIndex?: number;
	/**
	 * The parent's reAlignBand flip decision, inherited so every piece of one
	 * band comes off the page in the same orientation. Not a correctness
	 * requirement — a pi rotation is rigid and seam matching derives its
	 * transform from live geometry — but pieces matched up by hand should agree.
	 * Set by the caller of splitFlatBands (Task 9 Step 5), not by splitFlatBands.
	 */
	parentAscending?: boolean;
```

These go on `Band` itself rather than a subtype, because `alignBands`, `getQuadrilaterals` and `generateTiling` are all typed on `Band` and a piece must be assignable to it.

`parentIndex` / `pieceIndex` are plain fields rather than an address component on purpose. An earlier draft of this plan had `splitFlatBands` fabricate `{ globule: 0, tube: 0, band: 0, piece: i }` when the parent band had no address. That is not a harmless test affordance: for any tube built by `generate-projection.ts:714` or `:732` — neither of which sets a band address — *every* piece of *every* band would claim `g0t0b0`, and Task 11 would then derive seam partners pointing at that one wrong band, in the wrong tube, for every split in the model. Do not fabricate an address.

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
			triangle: new Triangle(new Vector3(0, i, 0), new Vector3(1, i, 0), new Vector3(0, i + 1, 0)),
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
		expect(result.bands.map((b) => b.pieceIndex)).toEqual([0, 1, 2]);
		expect(result.bands.map((b) => b.parentQuadOffset)).toEqual([0, 2, 4]);
	});

	it('records each piece\'s parent index, not a fabricated address', () => {
		// Two parents, so a piece index and a parent index cannot be confused.
		// Pieces must NOT invent an address: bands built by
		// generate-projection.ts:714/:732 have none, and a fabricated g0t0b0
		// would send every seam partner in the model to one wrong band.
		const result = splitFlatBands([buildBand(8), buildBand(8)], [2], 1);
		expect(result.bands.map((b) => b.parentIndex)).toEqual([0, 0, 1, 1]);
		expect(result.bands.map((b) => b.pieceIndex)).toEqual([0, 1, 0, 1]);
		expect(result.bands.every((b) => b.address === undefined)).toBe(true);
	});

	it('leaves an existing parent address untouched on every piece', () => {
		// The parent's address is inherited verbatim by the spread; the piece
		// component is added later, when the BandCutPattern address is built
		// (Task 9 Step 4), so nothing here has to know the address shape.
		const parent = buildBand(8);
		parent.address = { globule: 1, tube: 2, band: 3 };
		const result = splitFlatBands([parent], [2], 1);
		expect(result.bands.map((b) => b.address)).toEqual([
			{ globule: 1, tube: 2, band: 3 },
			{ globule: 1, tube: 2, band: 3 }
		]);
	});

	it('returns the input untouched for an empty band array', () => {
		// Math.max of an empty array is -Infinity, which would otherwise reject
		// every split with "out of range for -Infinity quads".
		const result = splitFlatBands([], [2], 1);
		expect(result.bands).toEqual([]);
		expect(result.rejected).toEqual([]);
	});

	it('marks seam ends but not the parent outer ends', () => {
		const result = splitFlatBands([buildBand(12)], [2, 4], 1);
		expect(result.bands[0].seamAt).toEqual({ end: true });
		expect(result.bands[1].seamAt).toEqual({ start: true, end: true });
		expect(result.bands[2].seamAt).toEqual({ start: true });
	});

	it('does not set parentAscending — that is the caller\'s job', () => {
		// The flip test reads POST-rotation coordinates (reAlignBand runs after
		// the minimal-bounding-box rotation), so it cannot be computed here from
		// the pre-align flat band; and the bbox helpers live in a module that
		// imports generate-pattern.ts, which this pure module must not pull in.
		// Task 9 Step 5 stamps it via computeBandAscending.
		const result = splitFlatBands([buildBand(8)], [2], 1);
		expect(result.bands.every((b) => b.parentAscending === undefined)).toBe(true);
	});

	it('rejects a split that is not a multiple of subunitCount', () => {
		// hexparquet maps a subunit across 3 quads, so only every third boundary
		// is legal.
		const result = splitFlatBands([buildBand(24)], [2, 3], 3);
		expect(result.bands.map((b) => b.parentQuadOffset)).toEqual([0, 3]);
		expect(result.rejected).toEqual([{ quad: 2, reason: 'not a multiple of subunitCount 3' }]);
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
		// Splits are tube-wide; a short band simply is not cut. The uncut band is
		// returned as-is, so it carries no pieceIndex at all.
		const result = splitFlatBands([buildBand(12), buildBand(4)], [4], 1);
		expect(result.bands).toHaveLength(3);
		expect(result.bands.filter((b) => b.pieceIndex !== undefined)).toHaveLength(2);
		expect(result.bands.map((b) => b.parentIndex)).toEqual([0, 0, undefined]);
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
	// Math.max of an empty array is -Infinity, which would reject every split
	// with the nonsense reason "out of range for -Infinity quads".
	if (flatBands.length === 0) return { bands: flatBands, rejected: [] };

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

	const bands = flatBands.flatMap((band, parentIndex) => {
		const quadCount = Math.floor(band.facets.length / 2);
		// Splits are tube-wide, so a band shorter than the split index is simply
		// not cut there. An uncut band is returned as-is — no piece fields at all,
		// so it stays byte-identical to the unsplit path.
		const cuts = legal.filter((quad) => quad < quadCount);
		if (cuts.length === 0) return [band];

		const boundaries = [0, ...cuts, quadCount];
		return boundaries.slice(0, -1).map((startQuad, i): Band => {
			const endQuad = boundaries[i + 1];
			// The parent's `address` (if any) is inherited verbatim by the spread.
			// The piece component is added where the BandCutPattern address is
			// built (Task 9 Step 4), which is the only place that knows the tube
			// address shape. Nothing is fabricated here.
			return {
				...band,
				facets: band.facets.slice(startQuad * 2, endQuad * 2),
				parentIndex,
				pieceIndex: i,
				parentQuadOffset: startQuad,
				seamAt: {
					...(startQuad > 0 ? { start: true as const } : {}),
					...(endQuad < quadCount ? { end: true as const } : {})
				}
			};
		});
	});

	return { bands, rejected };
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/split-flat-bands.test.ts`
Expected: PASS, all 13 tests.

The fixture deliberately builds bands with **no** `address`, because that is the case two of the three branches in `generate-projection.ts` actually produce. `pieceIndex` / `parentIndex` are what the rest of the pipeline reads, so nothing here depends on an address existing.

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
- Produces: `generateTubeCutPattern` gains an optional `splitQuads?: number[]` prop; `generateOutlinedTubePattern` gains a sixth positional `splitQuads?: number[]`; `computeBandAscending(band)` is exported from `generate-tiled-pattern.ts`; `BandCutPattern['address']` is widened to admit `piece`.
- **Not** consumed by anything yet. Nothing in this task connects `patternConfig.splits` to these props — that is Task 9a, and until it lands the feature is reachable only from unit tests.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/cut-pattern/__tests__/tube-pattern-characterization.test.ts`:

```ts
describe('generateTubeCutPattern — with splits', () => {
	it('keeps band indices stable and distinguishes pieces', () => {
		// TWO bands, and the split is asserted on the SECOND one. A one-band
		// fixture cannot tell a parent band index from a piece index — both
		// start at 0 — which is exactly the bug this assertion exists to catch.
		const bands = [buildBand(0, 8), buildBand(1, 8)]; // 8 facets = 4 quads each

		const result = generateTubeCutPattern({
			address: { globule: 0, tube: 0 },
			bands,
			tiledPatternConfig,
			pixelScale,
			splitQuads: [2]
		});

		expect(result.bands).toHaveLength(4);
		// The band component is the PARENT band index, unchanged by splitting.
		// If it were the piece index this would read [0, 1, 2, 3] and Task 11's
		// seam partners could never resolve a sibling.
		expect(result.bands.map((b) => b.address.band)).toEqual([0, 0, 1, 1]);
		expect(result.bands.map((b) => b.address.piece)).toEqual([0, 1, 0, 1]);
		// Ids must differ or mergedBandPaths hands a piece the wrong geometry
		// (collate-tubes.ts:34-38).
		expect(new Set(result.bands.map((b) => b.id)).size).toBe(4);
		// Neither piece may be refused.
		expect(result.bands.map((b) => b.error)).toEqual([
			undefined,
			undefined,
			undefined,
			undefined
		]);
	});

	it('leaves output identical to the baseline when splitQuads is empty', () => {
		const bands = [buildBand(0, 4), buildBand(1, 4)];
		const args = {
			address: { globule: 0, tube: 0 } as const,
			bands,
			tiledPatternConfig,
			pixelScale
		};

		const withoutProp = generateTubeCutPattern(args);
		const withEmpty = generateTubeCutPattern({ ...args, splitQuads: [] });
		expect(withEmpty.bands.map((b) => b.id)).toEqual(withoutProp.bands.map((b) => b.id));
		expect(withEmpty.bands.map((b) => b.facets.length)).toEqual(
			withoutProp.bands.map((b) => b.facets.length)
		);
		// Compare addresses too: comparing only id and facet count would pass even
		// if the piece plumbing perturbed every address or dropped `meta`.
		expect(withEmpty.bands.map((b) => b.address)).toEqual(
			withoutProp.bands.map((b) => b.address)
		);
		expect(withEmpty.bands.map((b) => b.meta)).toEqual(withoutProp.bands.map((b) => b.meta));
	});
});
```

`buildBand`, `pixelScale` and `tiledPatternConfig` are already at module scope in that file (Task 2 put them there), so this block can use them directly. Per Task 11 Step 1 they also need `export` adding, so a second test file can import them instead of duplicating them.

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

- [ ] **Step 4: Widen `BandCutPattern['address']`, then redefine `globalBandIndex` in parent space**

First the type. In `src/lib/types.ts:429`:

```ts
	projectionType: 'patterned';
	address: GlobuleAddress_Band | GlobuleAddress_BandPiece;
```

This is the task that first assigns a piece address to a `BandCutPattern`, so the widening belongs here rather than in Task 10. Add `GlobuleAddress_BandPiece` to the file's existing import from `$lib/projection-geometry/types`. (It also clears the one `svelte-check` error the already-committed `tube-pattern-characterization.test.ts` carries for reading `b.address.piece`.)

Now the index. In `generateTiling`, `:270` currently reads:

```ts
		const globalBandIndex = bandIndex + bandIndexOffset;
```

The whole correction hangs on one observation: **`bandIndex` is an index into `bands`, which after the split is the array of pieces.** Every consumer of `bandIndex + bandIndexOffset` wants the *parent* band's position in that array instead, and `splitFlatBands` recorded exactly that as `parentIndex`. So redefine the quantity once, at its source, and every consumer is fixed at once:

```ts
		// `bands` is the post-split array, so `bandIndex` is a PIECE index. Every
		// use below wants the parent band's index in the pre-split (selected
		// visible band) space — which is the space `address.band`, bandCount,
		// finishOuterEdge and leftPartnerBand have always worked in. An unsplit
		// band has no parentIndex and falls through to today's value exactly.
		const parentBandIndex = bands?.[bandIndex]?.parentIndex ?? bandIndex;
		const globalBandIndex = parentBandIndex + bandIndexOffset;
		const piece = bands?.[bandIndex]?.pieceIndex;
		const pieceSuffix = piece === undefined ? '' : `-p${piece}`;
		const addressWithPiece: GlobuleAddress_Band | GlobuleAddress_BandPiece =
			piece === undefined
				? { ...address, band: globalBandIndex }
				: { ...address, band: globalBandIndex, piece };
```

Note `parentIndex`/`pieceIndex` are read off `Band`, where Task 8 declared them as plain `number | undefined` fields — **not** off `band.address`, which is `GeometryAddress<BandAddressed> | GlobuleAddress_Band` (`types.ts:931`) and has no `piece` on either arm, so `bands?.[bandIndex]?.address?.piece` would not type-check.

Then:

- `:303` and `:453` (the two `id` templates): append `${pieceSuffix}`.
- `:306` and `:463` (the two `address:` properties): replace `{ ...address, band: globalBandIndex }` with `addressWithPiece`.
- `:284` `finishOuterEdge` and `:290` `bandContext.bandIndex` both read `bandIndex + bandIndexOffset` literally. Replace both with `globalBandIndex`, which now already carries the parent value:

```ts
		const finishOuterEdge = globalBandIndex === bandCount - 1 && hasFreeSide;
		const realLeftPartner = sourceBand ? getLeftPartnerBandIndex(sourceBand) : undefined;
		const leftPartnerBand =
			realLeftPartner === undefined ? undefined : toVisibleBandIndex(realLeftPartner);
		const bandContext = {
			hasOuterPartner: !hasFreeSide,
			bandIndex: globalBandIndex,
			leftPartnerBand
		};
```

Why this and not `bands[bandIndex].address.band`: the two are different index spaces. `address.band` is a **real tube band** index, while `bandCount` (`= totalBandCount = visibleBands.length`, `:260`/`:132`) and `leftPartnerBand` (via `toVisibleBandIndex`) are in the **visible band** space — which is why `visibleIndexByReal` exists at `:106-110` and why the comment there says so explicitly. Using `address.band` would change unsplit behaviour on any tube with a hidden band: the last visible band would lose its finished outer edge, or a non-last band would gain one. Phase 0's snapshot cannot catch that, because its fixture has every band visible. `parentIndex` keeps everything in the space it is already in.

With `bandContext.bandIndex` and `leftPartnerBand` now both in parent/visible space, `adjustAfterMapping`'s neighbour logic (`:354-360`, typed at `types.ts:152`) stays consistent for a split tube. All three of the pieces of a parent band report the same `bandIndex`, which is correct: they *are* that band.

- [ ] **Step 5: Inherit the parent flip in `reAlignBand`**

Two parts: compute the parent's decision the way `reAlignBand` computes its own, then let `reAlignBand` prefer it.

The spec is explicit that the flip test reads **post-rotation** coordinates, so a value computed on the pre-align flat band is a different quantity and must not be used (design L72-74). `reAlignBand` (`:509-529`) tests `newBand.facets[0].triangle.a.y < newBand.facets[last].triangle.a.y`, where `newBand`'s facet _i_ vertices are `rotatedCoordinates[i*3 … i*3+2]`. So the same decision for a whole parent band is reproducible directly from the bbox result. Add beside `alignBands` in `generate-tiled-pattern.ts` (which already imports both helpers from `../../components/cut-pattern/distrubute-panels`):

```ts
/**
 * `reAlignBand`'s flip decision for a band, computed without re-aligning it.
 *
 * Deliberately mirrors reAlignBand's own test rather than approximating it: the
 * test reads coordinates AFTER the minimal-bounding-box rotation, so evaluating
 * `facets[0].a.y < facets[last].a.y` on the un-rotated band answers a different
 * question. `rotatedCoordinates` is flat, three entries per facet, so facet i's
 * `a` vertex is at i*3.
 */
export const computeBandAscending = (band: Band): boolean => {
	const { rotatedCoordinates } = getMinimalBoundingBoxAndRotationAngle(
		getAllTrianglePoints(band)
	);
	const lastA = (band.facets.length - 1) * 3;
	if (rotatedCoordinates.length <= lastA) return false;
	return rotatedCoordinates[0].y < rotatedCoordinates[lastA].y;
};
```

Then in `:523-524`, replace the bare local computation:

```ts
	const isAscending =
		band.parentAscending ??
		newBand.facets[0].triangle.a.y < newBand.facets[newBand.facets.length - 1].triangle.a.y;
```

An unsplit band has no `parentAscending`, so it falls through to today's computation and the Phase 0 snapshot is untouched. `??` (not `||`) matters: an explicit `false` must win.

Finally, stamp it. In `generateTubeCutPattern`, between the `splitFlatBands` call and `alignBands` (the block added in Step 3):

```ts
// Decide the flip once per PARENT, then hand it to that parent's pieces, so
// pieces of one band all come off the page the same way round while each still
// gets its own bounding box for packing.
const parentAscending = flatBands.map(computeBandAscending);
const splitBands = splitResult.bands.map((band) =>
	band.parentIndex === undefined
		? band
		: { ...band, parentAscending: parentAscending[band.parentIndex] }
);

const alignedBands = alignBands(splitBands);
```

`flatBands` is the pre-split array, so `parentIndex` indexes it directly. Computing `parentAscending` eagerly for every band costs one bbox search per band even with no splits; if that shows up in a profile, guard it with `splitResult.bands.length === flatBands.length ? [] : flatBands.map(computeBandAscending)`.

- [ ] **Step 6: Insert the split in the outlined path**

Three separate changes here; the plan previously described only the first.

**(a) The signature and the call.** `generateOutlinedTubePattern` takes **positional** parameters `(address, bands, config, pixelScale, bandRange?)` (`:608-613`), so `splitQuads` is a sixth positional argument, and its one caller — `:670`, inside `generateOutlinedProjectionPattern` — must pass it:

```ts
const generateOutlinedTubePattern = (
	address: { globule: number; tube: number },
	bands: Band[],
	config: OutlinedPatternConfig,
	pixelScale: PixelScale,
	bandRange?: { start: number; end: number },
	splitQuads?: number[]
): TubeCutPattern => {
```

**(b) The split itself**, between `getFlatStripV2` and `alignBands` at `:621-626`. Outlined patterns have no `subunitCount`, so pass `1`; and stamp the parent flip the same way as the tiled path, importing `computeBandAscending` from `./generate-tiled-pattern` (this file already imports `alignBands` from there):

```ts
	const flatBands = selectedBands.map((band) =>
		getFlatStripV2(band, { bandStyle: 'helical-right', pixelScale })
	);

	const splitResult = splitFlatBands(flatBands, splitQuads ?? [], 1);
	if (splitResult.rejected.length) {
		console.warn(
			`outlined: ${splitResult.rejected.length} split(s) dropped in tube ${address.tube} — ${splitResult.rejected[0].reason}`
		);
	}
	const parentAscending = flatBands.map(computeBandAscending);
	const splitBands = splitResult.bands.map((band) =>
		band.parentIndex === undefined
			? band
			: { ...band, parentAscending: parentAscending[band.parentIndex] }
	);

	const alignedBands = alignBands(splitBands);
```

**(c) The band id and address, which otherwise collide.** This is the four-site collision the spec says must be fixed (design L145-150), and it exists in the outlined path too. `generateOutlinedBandPattern` builds both from its `bandIndex` parameter:

- `:598` — `id: \`outlined-band-${tubeAddress.globule}-${tubeAddress.tube}-${bandIndex}\``
- `:593` — `address: { ...tubeAddress, band: bandIndex }`
- `:522` — `label: \`outlined-band-${bandIndex}\`` on the outline facet
- `:527` — `label: \`${bandIndex}-${i}\`` on each quad facet

and `generateOutlinedTubePattern` passes `rangeStart + i` as that `bandIndex` (`:663`) — i.e. the **piece** index once the array is pieces, with no `piece` component at all. Colliding ids hand a piece another piece's merged geometry (`collate-tubes.ts:34-38`); colliding addresses collide CSV rows and labels.

Fix it the same way the tiled path does, in `generateOutlinedTubePattern`'s `map` (`:661-673`):

```ts
	const bandCount = alignedBands.length;
	const bandPatterns = alignedBands.map((band, i) =>
		generateOutlinedBandPattern(
			band,
			// Parent band index, so a split does not renumber bands.
			(band.parentIndex ?? i) + rangeStart,
			config,
			pixelScale,
			address,
			allQuads[i],
			allQuads[i - 1],
			allQuads[i + 1],
			bandCount,
			i,
			band.pieceIndex
		)
	);
```

and give `generateOutlinedBandPattern` a trailing `piece?: number` parameter (after `localBandIndex`, which already has a default), used in exactly the two places the tiled path uses it:

```ts
	const pieceSuffix = piece === undefined ? '' : `-p${piece}`;
	// …
	id: `outlined-band-${tubeAddress.globule}-${tubeAddress.tube}-${bandIndex}${pieceSuffix}`,
	address:
		piece === undefined
			? { ...tubeAddress, band: bandIndex }
			: { ...tubeAddress, band: bandIndex, piece },
```

Leave `:522`/`:527`'s labels alone — they are display strings scoped to one band's own SVG, not keys.

Also leave `generate-outlined-pattern.ts:555-556`'s `meta` condition exactly as it is. The spec is explicit that only the tiled `meta` rule and `getEndPartnerTransforms` change, because outlined seams are handled by Task 12's `splitEnd` tab keyed off `seamAt` and never consult `meta` (design L283-286).

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

### Task 9a: Plumb the persisted splits through to generation (issue `shades-0u5`)

Task 9 gave both generation paths a `splitQuads` prop and nothing passes one. This task connects the persisted config to it. Without this the feature is unreachable outside unit tests, and Task 14's browser verification step cannot pass.

The chain, end to end, with what is wrong at each link today:

| Link                                                             | Today                                                                                          | Needed                                     |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `patternConfig.splits`                                           | exists after Task 7                                                                            | —                                          |
| `patternGenerationConfig` (`globulePatternStores.ts:37-53`)      | carries only `patternTypeConfig / pixelScale / showBands / range / patternSource`               | add `splits`, so a split write regenerates |
| `runPatternGeneration` (`run-pattern-generation.ts:55-65`)       | rebuilds the config as `patternConfig: { pixelScale: genConfig.pixelScale }` — drops everything else | carry `splits` through                     |
| `generateProjectionPattern` (`generate-pattern.ts:117-141`)      | destructures `patternConfig: { pixelScale }`                                                    | also read `splits`                         |
| `generateTubeCutPattern` × 2 (`generate-pattern.ts:180`, `:207`) | pass no `splitQuads`                                                                            | select this tube's quads                   |
| `generateOutlinedProjectionPattern` → `generateOutlinedTubePattern` (`generate-outlined-pattern.ts:670`) | passes no `splitQuads`                                        | same, as the 6th positional arg            |

**Files:**

- Modify: `src/lib/stores/globulePatternStores.ts:27-53`
- Modify: `src/lib/cut-pattern/run-pattern-generation.ts:55-65`
- Modify: `src/lib/cut-pattern/generate-pattern.ts:117-141`, `:180`, `:207`
- Modify: `src/lib/cut-pattern/generate-outlined-pattern.ts:654-676`
- Test: `src/lib/cut-pattern/__tests__/run-pattern-generation.test.ts` (extend — it already exists)

**Interfaces:**

- Consumes: `SplitConfig` (Task 7), the `splitQuads` props (Task 9).
- Produces: a split written to `patternConfig.splits` reaches both generation paths and triggers one regeneration. Consumed by Tasks 14 and 16.

- [ ] **Step 1: Add `splits` to the generation config**

In `src/lib/stores/globulePatternStores.ts`, extend the type at `:27-33` and the projection at `:40-46`:

```ts
export type PatternGenerationConfig = {
	patternTypeConfig: PatternTypeConfig;
	pixelScale: PixelScale;
	showBands: boolean;
	range: ProjectionRange;
	patternSource: PatternSource;
	/**
	 * Per-tube split positions. Lives here, in the generation config, rather
	 * than being read at generation time, because this store is what decides
	 * whether to regenerate: it JSON-compares itself against the last value
	 * (`:47-51`) so view-only changes do not re-trigger the worker. A split that
	 * is not in this object produces no regeneration when it changes.
	 */
	splits?: SplitConfig;
};
```

and in the derived body:

```ts
			splits: $patternConfigStore.patternConfig.splits,
```

Add `SplitConfig` to the `import type { … } from '$lib/types'` block at `:3-8`.

The existing `JSON.stringify` dirty-check (`:47-51`) then gives split changes the same debounced latest-wins regeneration every other pattern parameter gets, at no extra cost. Note `undefined` serialises away, so a config with no splits produces the same JSON as today and does **not** trigger a spurious regeneration on startup.

- [ ] **Step 2: Carry it through `runPatternGeneration`**

In `src/lib/cut-pattern/run-pattern-generation.ts`, `:59` currently reads:

```ts
		patternConfig: { pixelScale: genConfig.pixelScale } as GlobulePatternConfig['patternConfig'],
```

Replace with:

```ts
		patternConfig: {
			pixelScale: genConfig.pixelScale,
			splits: genConfig.splits
		} as GlobulePatternConfig['patternConfig'],
```

This function is the worker's entry point (`super-globule-worker-core.ts:158`) as well as the main-thread fallback, so this one edit covers both. It rebuilds the config from scratch precisely because only these fields survive `postMessage`; anything not listed here is silently dropped, which is why the field has to be named explicitly rather than spread.

`generateSuperGlobulePattern` (`:88`) is deliberately left alone: it goes through `generateTiledBandPattern`, which patterns a globule's bands with a `GeometryAddress`, not a tube address, so there is no tube index to select splits by. Splitting the legacy globule band path is out of scope.

- [ ] **Step 3: Select each tube's splits at the three call sites**

In `src/lib/cut-pattern/generate-pattern.ts`, extend the destructure at `:121-124`:

```ts
	const {
		patternTypeConfig,
		patternConfig: { pixelScale, splits }
	} = globulePatternConfig;
```

Add one helper beside it — this is the selection rule the spec states (design L190-192):

```ts
	// Splits are persisted per tube as absolute quad indices. An absent entry
	// yields an empty array, which is splitFlatBands' documented no-op path.
	const splitQuadsFor = (tube: number) =>
		splits?.tubeSplits.find((t) => t.tube === tube)?.quads ?? [];
```

Then pass it at all three sites. The tiled path, `:180-186`:

```ts
			const tubePattern = generateTubeCutPattern({
				address,
				bands,
				tiledPatternConfig,
				pixelScale,
				bandRange: { start: bandStart, end: bandEnd },
				splitQuads: splitQuadsFor(address.tube)
			});
```

and the referenced-tube stub path, `:207-212` — this one matters as much as the first: `getEndPartnerTransforms` resolves partner addresses against these stubs, so a stub generated **without** splits would have a different band set from the real thing and partner lookups into it would miss:

```ts
				tubePatterns[t] = generateTubeCutPattern({
					address,
					bands,
					tiledPatternConfig,
					pixelScale,
					splitQuads: splitQuadsFor(address.tube)
				});
```

The outlined path needs `splits` threaded one level further, since `generateOutlinedProjectionPattern` is what owns the tube loop. Add a sixth parameter to it (`:654-660`):

```ts
export const generateOutlinedProjectionPattern = (
	tubes: Tube[],
	id: SuperGlobuleConfig['id'],
	config: OutlinedPatternConfig,
	pixelScale: PixelScale,
	projectionRange?: ProjectionRange,
	splits?: SplitConfig
): SuperGlobuleProjectionPattern => {
```

pass this tube's quads at `:670`:

```ts
		const tubePattern = generateOutlinedTubePattern(
			address,
			bands,
			config,
			pixelScale,
			{ start: bandStart, end: bandEnd },
			splits?.tubeSplits.find((t) => t.tube === address.tube)?.quads ?? []
		);
```

and pass `splits` from its caller at `generate-pattern.ts:135-141`:

```ts
		return generateOutlinedProjectionPattern(
			effectiveTubes,
			id,
			patternTypeConfig,
			pixelScale,
			projectionRange,
			splits
		);
```

Add `SplitConfig` to the type imports in `generate-outlined-pattern.ts`.

- [ ] **Step 4: Write the test proving a config-level split reaches generation**

This is the test the whole task exists for: it starts from a `PatternGenerationConfig` — the same shape the store produces — and asserts the piece bands come out the far end. Append to `src/lib/cut-pattern/__tests__/run-pattern-generation.test.ts`, reusing whatever `SuperGlobule` fixture that file already builds (read it first; do not invent a second one):

```ts
describe('runPatternGeneration — splits', () => {
	it('carries patternConfig.splits from the generation config into the tube pattern', () => {
		// The gap this closes: patternGenerationConfig used to omit `splits` and
		// runPatternGeneration rebuilt patternConfig as `{ pixelScale }`, so a
		// split written by the UI reached neither generation path.
		const genConfig = {
			...baseGenConfig,
			splits: { tubeSplits: [{ tube: 0, quads: [2] }] }
		};

		const result = runPatternGeneration({
			superGlobule,
			superConfig,
			genConfig,
			gates
		});

		const tubes = getCutPatternTubes(result);
		const bandsOfTube0 = tubes[0].bands;
		// Two pieces where there was one band, with the band index stable.
		expect(bandsOfTube0.filter((b) => b.address.band === 0)).toHaveLength(2);
		expect(bandsOfTube0.filter((b) => b.address.band === 0).map((b) => b.address.piece)).toEqual([
			0, 1
		]);
	});

	it('is a no-op when no splits are configured', () => {
		const without = runPatternGeneration({ superGlobule, superConfig, genConfig: baseGenConfig, gates });
		const withEmpty = runPatternGeneration({
			superGlobule,
			superConfig,
			genConfig: { ...baseGenConfig, splits: { tubeSplits: [] } },
			gates
		});
		expect(getCutPatternTubes(withEmpty)[0].bands.map((b) => b.address)).toEqual(
			getCutPatternTubes(without)[0].bands.map((b) => b.address)
		);
	});
});
```

`baseGenConfig`, `superGlobule`, `superConfig`, `gates` and a `getCutPatternTubes` accessor all come from that file's existing fixtures — the split-relevant requirement is only that the fixture's tube 0 has a band of **at least 3 quads** (6 facets), so a split at quad 2 is in range. If its fixture is smaller, widen the fixture rather than moving the split index, and say so in the commit message.

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/run-pattern-generation.test.ts`
Expected: FAIL first (`splits` is not a known property of the config, and one band comes back where two were expected), then PASS after Steps 1–3.

- [ ] **Step 5: Verify the regeneration trigger by hand**

The unit test proves the data path; it cannot prove the store actually re-fires. Start `npm run dev` (restart it — `run-pattern-generation.ts` is imported by the worker). Open `/designer2`, switch Geometry to **Voronoi**, and in the console write a split directly:

```js
// same .set idiom the UI must use — see Global Constraints
const s = window.__patternConfigStore; // or import via the devtools source map
```

If no store handle is exposed, verify instead through Task 14's UI once it lands, and at this point simply confirm via the test plus one `console.log` in `runPatternGeneration` that it re-runs when `splits` changes. **Do not add a debug export to the store to make this step convenient.**

- [ ] **Step 6: Run the full suite and the type check**

Run: `npm run test:unit`
Expected: PASS, Phase 0's snapshot unchanged.

Run: `npm run check 2>&1 | tail -5`
Expected: within a few of baseline.

- [ ] **Step 7: Commit**

```bash
git add src/lib/stores/globulePatternStores.ts src/lib/cut-pattern/run-pattern-generation.ts src/lib/cut-pattern/generate-pattern.ts src/lib/cut-pattern/generate-outlined-pattern.ts src/lib/cut-pattern/__tests__/run-pattern-generation.test.ts
git commit -m "feat(split): plumb persisted per-tube splits through to both generation paths"
```

- [ ] **Step 8: Close the phase**

```bash
bd close shades-puy
bd close shades-0u5
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

- [ ] **Step 2: Work the known consumer list — the compiler is NOT the authority here**

An earlier draft of this plan said widening the type would make "the compiler enumerate every consumer". **It does not, and relying on that would ship several silent behaviour changes.** Most consumers already accept `undefined` and keep compiling. Here is the verified list, with a decision for each.

Run `npm run check 2>&1 | tail -5` first and record the count, then work this table rather than the compiler output.

**Will error — the compiler does find these three:**

| Site                                | Action                                     |
| ----------------------------------- | ------------------------------------------ |
| `helpers.ts:118`, `:121`, `:127`    | Step 4 below                               |
| `generate-pattern.ts:540-547`       | Step 3 below (rewritten anyway)            |
| `CutPatternRenderer.svelte:183-187` | Step 4a below — the plan previously left this one unaddressed |

**Compiles silently, behaviour changes — decide each explicitly:**

| Site                                                    | What happens with an absent partner                                                                                                | Decision                                                                                                                                                                                             |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `collect-band-tabs.ts:10-11`, `sameBandAddress` `:78-84` | Already declares both optional and returns `false` for `undefined`; a tab that classified as `'start'`/`'end'` becomes `'mid'` (`:125-131`), changing its label | **Accept, no code change.** A seam end genuinely is not a band end, and `'mid'` is the honest classification. Note it in the commit message so a surprised label is traceable.                        |
| `band-sort-index.ts:40`                                  | Already filters `(p): p is BandRef => !!p`; the end-connection graph loses an edge, so band order shifts                            | **Accept, no code change.** A piece with one resolvable end has degree 1 and lands at the end of its chain, which is correct. The spec already accepts positional drift here (design L164-168).       |
| `build-pattern-csv.ts:52-53`                             | Already `if (band.meta?.…)`; the partner column is narrower                                                                        | **Accept, no code change.**                                                                                                                                                                          |
| `resolve-tab-label.ts:25`, `:30`                         | Already `band.meta?.startPartnerBand`; renders an empty label                                                                       | **Accept, no code change.**                                                                                                                                                                          |
| `QuadLabels.svelte:40-41`                                | Passes into `concatAddress(a: GlobuleAddress \| undefined)`; renders `''`                                                            | **Accept, no code change.**                                                                                                                                                                          |
| `tile-editor/partner-pair-resolver.ts:61-64`             | Reads `mainBand.meta[partnerKey]` through a computed key and already returns `null` on absence                                      | **Accept, no code change.** (Note: this file is under `src/components/modal/editor/tile-editor/`, not `src/lib/cut-pattern/`.)                                                                        |
| `generate-pattern.ts:223`                                | `!!firstInRange?.bands[0]?.meta?.startPartnerBand` gates `doAdjustAfterTiling` for the **whole tube**                               | **Fix.** If band 0 is a piece whose start is the parent's unpartnered outer end, tesselation adjustment silently switches off for every band in the tube. Change to accept either end — Step 3a below. |

- [ ] **Step 2a: Record the baseline**

Run: `npm run check 2>&1 | tail -5` and note the count. You will compare against it in Step 6; the three erroring sites above are the only ones expected to move it.

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

The `isSameAddress(partnerBand.meta.startPartnerBand, band.address)` call at line 127 needs a guard too, since the first argument may now be undefined:

```ts
const partnerFacetIndex =
	partnerBand.meta.startPartnerBand &&
	isSameAddress(partnerBand.meta.startPartnerBand, band.address)
		? 0
		: partnerBand.facets.length - 1;
```

- [ ] **Step 4a: Fix `CutPatternRenderer.svelte`'s partner-band lookup**

`:175-201` `getPartnerBands` is the third erroring site, and it has a second defect the widening exposes: it indexes **positionally**, `startTube.bands[meta.startPartnerBand.band]`, which is piece-blind and fetches the wrong band as soon as a tube contains pieces (the array is longer than the band count). Replace `:183-187`:

```ts
		const startAddress = meta.startPartnerBand;
		const endAddress = meta.endPartnerBand;
		// Resolve by address, not by position: once a tube holds pieces its bands
		// array is longer than its band count, so bands[address.band] is wrong.
		// findBandByAddress also handles a plain address whose band was split.
		const startBand = startAddress ? findBandByAddress(tubes, startAddress) : undefined;
		const endBand = endAddress ? findBandByAddress(tubes, endAddress) : undefined;
		// An outer end with no partner is normal for a split piece; render the
		// ends that did resolve rather than dropping both.
		if (!startBand && !endBand) return undefined;
```

and make the returned array skip an unresolved end rather than pairing it with `IDENTITY_TRANSFORM`:

```ts
		return [
			...(startBand
				? [{ band: startBand, transform: meta.startPartnerTransform ?? IDENTITY_TRANSFORM }]
				: []),
			...(endBand
				? [{ band: endBand, transform: meta.endPartnerTransform ?? IDENTITY_TRANSFORM }]
				: [])
		];
```

Add `import { findBandByAddress } from '$lib/cut-pattern/generate-pattern';`. The `if (!startTube || !endTube) return undefined;` guard at `:185` goes away with the positional lookup.

- [ ] **Step 4b: Fix the tube-wide `adjustAfterTiling` gate**

`generate-pattern.ts:221-224` reads:

```ts
		const doAdjustAfterTiling =
			hasAdjustAfterTiling &&
			(!needsEndPartners || !!firstInRange?.bands[0]?.meta?.startPartnerBand);
```

`bands[0]` may now be a piece whose *start* is the parent band's unpartnered outer end, which would switch tesselation adjustment off for the entire tube. Accept either end:

```ts
		const firstBandMeta = firstInRange?.bands[0]?.meta;
		const doAdjustAfterTiling =
			hasAdjustAfterTiling &&
			(!needsEndPartners || !!(firstBandMeta?.startPartnerBand || firstBandMeta?.endPartnerBand));
```

For every band today both ends are present, so this is identical to the current behaviour — which Phase 0's snapshot confirms.

- [ ] **Step 5: Prove the independent-ends behaviour with a test**

The widening has no compile-time safety net (Step 2), so it needs a behavioural one. This task does **not** ship without it.

Create `src/lib/cut-pattern/__tests__/end-partner-transforms-independent.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';

import { getEndPartnerTransforms } from '../generate-pattern';
import type { BandCutPattern, TubeCutPattern } from '$lib/types';

// Two quads' worth of path so getEndPartnerTransform has geometry to read.
const band = (
	address: BandCutPattern['address'],
	meta: BandCutPattern['meta']
): BandCutPattern =>
	({
		address,
		meta,
		id: `id-${JSON.stringify(address)}`,
		facets: [
			{ path: [['M', 0, 0], ['L', 1, 0]], label: '0' },
			{ path: [['M', 0, 1], ['L', 1, 1]], label: '1' }
		]
	}) as unknown as BandCutPattern;

const tube = (bands: BandCutPattern[]): TubeCutPattern =>
	({ projectionType: 'patterned', address: { globule: 0, tube: 0 }, bands }) as TubeCutPattern;

describe('getEndPartnerTransforms — each end resolved independently', () => {
	it('sets the seam end transform even when the outer end has no partner', () => {
		// This is the whole point of the widening. Previously both transforms were
		// gated on both addresses, so a piece whose outer end is unpartnered got
		// NEITHER — and its seam silently failed to overlap.
		const p0 = band({ globule: 0, tube: 0, band: 0, piece: 0 }, {
			endPartnerBand: { globule: 0, tube: 0, band: 0, piece: 1 }
		});
		const p1 = band({ globule: 0, tube: 0, band: 0, piece: 1 }, {
			startPartnerBand: { globule: 0, tube: 0, band: 0, piece: 0 }
		});

		getEndPartnerTransforms([tube([p0, p1])]);

		expect(p0.meta?.endPartnerTransform).toBeDefined();
		expect(p0.meta?.startPartnerTransform).toBeUndefined();
		expect(p1.meta?.startPartnerTransform).toBeDefined();
		expect(p1.meta?.endPartnerTransform).toBeUndefined();
	});

	it('still sets both transforms when both ends resolve', () => {
		// The unsplit case, unchanged.
		const a = band({ globule: 0, tube: 0, band: 0 }, {
			startPartnerBand: { globule: 0, tube: 0, band: 1 },
			endPartnerBand: { globule: 0, tube: 0, band: 1 }
		});
		const b = band({ globule: 0, tube: 0, band: 1 }, {
			startPartnerBand: { globule: 0, tube: 0, band: 0 },
			endPartnerBand: { globule: 0, tube: 0, band: 0 }
		});

		getEndPartnerTransforms([tube([a, b])]);

		expect(a.meta?.startPartnerTransform).toBeDefined();
		expect(a.meta?.endPartnerTransform).toBeDefined();
	});

	it('leaves a band with no meta alone', () => {
		const plain = band({ globule: 0, tube: 0, band: 0 }, undefined);
		getEndPartnerTransforms([tube([plain])]);
		expect(plain.meta).toBeUndefined();
	});
});
```

`getEndPartnerTransforms` is currently module-private (`generate-pattern.ts:537`); add `export` to it as part of this step, the same way Task 6 exported `findBandByAddress`.

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/end-partner-transforms-independent.test.ts`
Expected: the first test FAILS before Step 3 (both transforms undefined, because the old code gated both on both) and PASSES after. If it passes before Step 3, the test is not reaching the gated branch — check that only one partner address is set on each band.

- [ ] **Step 6: Run the tests and the type check**

Run: `npm run test:unit`
Expected: PASS, Phase 0 snapshot unchanged.

Run: `npm run check 2>&1 | tail -5`
Expected: back within a few of the count recorded in Step 2a. If it is still elevated, there are unhandled sites from Step 2's "will error" list.

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/cut-pattern/generate-pattern.ts src/lib/patterns/tesselation/shared/helpers.ts src/components/cut-pattern/CutPatternRenderer.svelte src/lib/cut-pattern/__tests__/end-partner-transforms-independent.test.ts
git commit -m "refactor(pattern): resolve each band end's partner independently"
```

### Task 11: Wire seam partners between sibling pieces

**Files:**

- Modify: `src/lib/cut-pattern/generate-tiled-pattern.ts:369-384` and `:465`
- Test: `src/lib/cut-pattern/__tests__/seam-partners.test.ts` (create)

**Interfaces:**

- Consumes: optional `meta` partners (Task 10), `seamAt` (Task 8).
- Produces: `meta.startPartnerBand` / `endPartnerBand` pointing at sibling pieces. Consumed by the existing `endsMatched` machinery.

- [ ] **Step 1: Extract the fixture, then write the failing test**

First move the fixture out of the test file that owns it. Task 2's `tube-pattern-characterization.test.ts` has a correct `buildBand` / `pixelScale` / `tiledPatternConfig` at module scope, and this task needs the same three. Do **not** hand-roll a copy — three things that file got right and a copy gets wrong: the registered pattern id is `tiledHexPattern-1`, not `tiledHexPattern`; `TiledPatternConfig['config']` requires its full shape (`dynamicStroke`, `scaleConfig`, `endsMatched`, …), not just `rowCount`/`columnCount`; and `PixelScale` is plainly `{ value: number; unit: 'cm' | 'inch' | 'mm' }`, needing no cast.

Do **not** import from the test file either — Jest would execute its `describe` and snapshot a second time, once per importer.

Create `src/lib/cut-pattern/__tests__/fixtures/tube-fixture.ts` and move the three declarations into it verbatim, exported:

```ts
import { Triangle, Vector3 } from 'three';

import type { Band, Facet, PixelScale, TiledPatternConfig } from '$lib/types';

/** A flat-ish strip of `facetCount` triangles zig-zagging up the y axis. */
export const buildBand = (bandIndex: number, facetCount: number): Band => /* … as in Task 2 … */;

export const pixelScale: PixelScale = { value: 1, unit: 'mm' };

export const tiledPatternConfig: TiledPatternConfig = /* … as in Task 2 … */;
```

Then have `tube-pattern-characterization.test.ts` import them from there instead of declaring them, and confirm its snapshot is **unchanged** by the move (`npm run test:unit -- src/lib/cut-pattern/__tests__/tube-pattern-characterization.test.ts` — no `-u`).

Now create `src/lib/cut-pattern/__tests__/seam-partners.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';

import { generateTubeCutPattern } from '../generate-tiled-pattern';
import { buildBand, pixelScale, tiledPatternConfig } from './fixtures/tube-fixture';

describe('seam partners', () => {
	it('points each piece at its sibling across the seam', () => {
		const result = generateTubeCutPattern({
			address: { globule: 0, tube: 0 },
			bands: [buildBand(0, 8)],
			tiledPatternConfig,
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
			tiledPatternConfig,
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
			tiledPatternConfig,
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
		// existing endsMatched machinery then produces the overlapping strokes
		// that form the glue surface — a seam end is an ordinary partnered end.
		//
		// Build the sibling address the SAME way Step 4 of Task 9 builds this
		// band's own `addressWithPiece`: `{ ...address, band: globalBandIndex,
		// piece }`. That is what makes the two sides agree. Deriving it from
		// `band.address` instead would use the flat band's address, whose `band`
		// component is a real tube band index rather than the visible-band index
		// `addressWithPiece` carries — so for any band past the first, or any tube
		// with more than one band, `findBandByAddress` would never resolve the
		// sibling and the seam would silently fail to match.
		//
		// `seamPiece` rather than `piece`: Task 9 Step 4 already declared `piece`
		// in this same `quadBands.map` callback.
		const seamAt = bands?.[bandIndex]?.seamAt;
		const seamPiece = piece;
		const siblingAddress = (offset: number) => ({
			...address,
			band: globalBandIndex,
			piece: (seamPiece as number) + offset
		});
		const seamStartPartner =
			seamAt?.start && seamPiece !== undefined ? siblingAddress(-1) : undefined;
		const seamEndPartner =
			seamAt?.end && seamPiece !== undefined ? siblingAddress(+1) : undefined;

		const resolvedStartPartner = seamStartPartner ?? startPartnerBand;
		const resolvedEndPartner = seamEndPartner ?? endPartnerBand;
```

`seamAt` is read off the aligned `Band` (`bands[bandIndex]`), where `splitFlatBands` set it and both `reAlignBand` and `normalizeBand` preserve it by spreading the band (`generate-tiled-pattern.ts:510`, `:499`).

- [ ] **Step 4: Relax the meta condition**

Replace `src/lib/cut-pattern/generate-tiled-pattern.ts:465`:

```ts
			// Both ends resolving is the historical condition, kept exactly for
			// unsplit bands: with no `seamAt` this reduces to
			// `startPartnerBand && endPartnerBand ? {…} : undefined`, character for
			// character what `:465` does today, so the Phase 0 snapshot is
			// unaffected. A piece additionally gets meta when only ONE end
			// resolves, since its outer end may be genuinely unpartnered while its
			// seam end must still match.
			//
			// Written as one condition rather than a nested ternary whose two
			// branches emit the identical object.
			meta:
				(resolvedStartPartner && resolvedEndPartner) ||
				(seamAt && (resolvedStartPartner || resolvedEndPartner))
					? { startPartnerBand: resolvedStartPartner, endPartnerBand: resolvedEndPartner }
					: undefined,
```

This relies on Task 10's widening: both properties are now optional, so the single object literal accepts a possibly-`undefined` end.

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
	// The default hex spec's anchor is { facetIndex: 0, segmentIndex: 0 }
	// (pattern-registry.ts:56), i.e. the FIRST quad of the band. So after a split
	// only piece 0 may carry it.
	const args = {
		address: { globule: 0, tube: 0 } as const,
		bands: [buildBand(0, 12)],
		tiledPatternConfig,
		pixelScale
	};
	const isAnchored = (p: { x: number; y: number }) => p.x !== 0 || p.y !== 0;

	it('gives the unsplit band a non-zero anchor at all', () => {
		// Guard against the whole suite passing vacuously: tagAnchorPoint is
		// initialised to {0,0} (generate-tiled-pattern.ts:364) and only written
		// when the anchor matches, so if the fixture's anchor happened to land on
		// exactly (0,0) every assertion below would hold both before and after
		// the change and prove nothing.
		const unsplit = generateTubeCutPattern(args);
		expect(unsplit.bands).toHaveLength(1);
		expect(isAnchored(unsplit.bands[0].tagAnchorPoint)).toBe(true);
	});

	it('anchors piece 0 and only piece 0', () => {
		// tagAnchor.facetIndex is a parent-relative index. A piece sees a sliced
		// facets array, so without parentQuadOffset facet 0 of EVERY piece
		// matches and all three claim the anchor.
		const split = generateTubeCutPattern({ ...args, splitQuads: [2, 4] });
		expect(split.bands).toHaveLength(3);
		expect(split.bands.map((b) => isAnchored(b.tagAnchorPoint))).toEqual([true, false, false]);
	});

	it('puts piece 0 \'s anchor in the same place the unsplit band had it', () => {
		// Piece 0 is a prefix of the parent with parentQuadOffset 0 and its own
		// bounding box; for this fixture the first quad's geometry is identical,
		// so the anchor point must be too.
		const unsplit = generateTubeCutPattern(args);
		const split = generateTubeCutPattern({ ...args, splitQuads: [2, 4] });
		expect(split.bands[0].tagAnchorPoint.x).toBeCloseTo(unsplit.bands[0].tagAnchorPoint.x, 6);
		expect(split.bands[0].tagAnchorPoint.y).toBeCloseTo(unsplit.bands[0].tagAnchorPoint.y, 6);
	});
});
```

Run it: `npm run test:unit -- src/lib/cut-pattern/__tests__/seam-partners.test.ts`
Expected: the first test PASSES immediately (it characterizes the fixture).
`anchors piece 0 and only piece 0` FAILS with `[true, true, true]` — every piece
matches `tagAnchor.facetIndex` against its own local index, so all three claim
the anchor. If it instead reports `[false, false, false]`, stop: the fixture's
anchor is landing on (0,0) and the test cannot see anything — fix the fixture
first, guided by the first test.

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
import { Vector3 } from 'three';

import { shouldHaveTab } from '../generate-outlined-pattern';
import type { OutlinedTabConfig } from '$lib/types';

const base: OutlinedTabConfig = { shape: 'rectangle', tabWidth: 5 };
const noPartners = { after: false, before: false };

describe('shouldHaveTab — split ends', () => {
	// `start`, `end` and `interiorPoint` are declared as Vector3 on OutlineEdge
	// (generate-outlined-pattern.ts:84-88), so `{ x, y }` literals do not
	// compile — and casting past it would break generateTabForEdge's
	// .clone()/vector math if the branch is ever taken. The existing
	// shouldHaveTab-tab-layout.test.ts uses `new Vector3()` for the same reason.
	const seamEdge = (seamPartnerPiece: number) => ({
		start: new Vector3(0, 0, 0),
		end: new Vector3(1, 0, 0),
		side: 'end' as const,
		interiorPoint: new Vector3(0.5, 0.5, 0),
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
			start: new Vector3(0, 0, 0),
			end: new Vector3(1, 0, 0),
			side: 'end' as const,
			interiorPoint: new Vector3(0.5, 0.5, 0)
		};
		// No seamPartnerPiece and no endPartnerTube => no tab, as today.
		expect(shouldHaveTab(plainEnd, config, noPartners, 0, 0, 1, 0)).toBe(false);
	});
});
```

`shouldHaveTab` is **already exported** (`generate-outlined-pattern.ts:360`) and an existing test already imports it (`__tests__/shouldHaveTab-tab-layout.test.ts`). No export change is needed — do not go looking for one.

Argument count check, since a short call would silently test nothing: the real signature is `(edge, tabConfig, hasPartners, currentTube, bandIndex = 0, bandCount = 0)` (`:360-367`), so the seventh argument above is the new `currentPiece`, and the six-argument call in `ignores the seam branch entirely when currentPiece is unknown` genuinely exercises the `currentPiece === undefined` fallthrough.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/split-end-tab.test.ts`
Expected: FAIL, for two reasons — `splitEnd` does not exist on `OutlinedTabConfig`, and `seamPartnerPiece` does not exist on `OutlineEdge`, so the object literals are not assignable. Every `splitEnd` assertion also returns `false` because no seam branch exists yet.

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
	// `pieceIndex`, not `band.address?.piece`: Band['address'] is
	// `GeometryAddress<BandAddressed> | GlobuleAddress_Band` (types.ts:931) and
	// neither arm has `piece`, so an address read would not type-check. Task 8
	// puts the piece ordinal on the band as a plain field for exactly this.
	const piece = band.pieceIndex;
	const farEndSeamPartner = band.seamAt?.end && piece !== undefined ? piece + 1 : undefined;
	const nearEndSeamPartner = band.seamAt?.start && piece !== undefined ? piece - 1 : undefined;
```

Add `seamPartnerPiece: farEndSeamPartner` to the far-end push (`:228-235`, the one with `endIsStartCap: false`) and `seamPartnerPiece: nearEndSeamPartner` to the near-end push (`:268-275`, `endIsStartCap: true`).

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
	// Preserved from the real function (`:394`): every path must return.
	return false;
};
```

Thread `currentPiece` from `generateOutlinedBandPattern` (which reads `band.pieceIndex`, per Step 4) through `buildOutlinePath` to `shouldHaveTab`:

- `buildOutlinePath`'s signature is `(edges, tabConfig?, hasPartners?, currentTube?, tabsOut?, bandIndex = 0, bandCount = 0)` (`:404-411`). Append `currentPiece?: number`.
- Its single internal call to `shouldHaveTab` (`:427`) becomes `shouldHaveTab(edges[i], tabConfig, partners, currentTube ?? 0, bandIndex, bandCount, currentPiece)`.
- `generateOutlinedBandPattern` calls `buildOutlinePath` positionally with seven arguments (`:508-516`); append `band.pieceIndex` as the eighth.

Appending at the end of both lists with a default of `undefined` leaves every existing caller working unchanged.

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

- Consumes: `patternConfigStore`; `subunitCount` as `resolvePatternEntry($patternConfigStore.patternTypeConfig.type).subunitCount ?? 1` (see Step 2a — there is exactly one `patternTypeConfig` for all tubes, `types.ts:1310`, so this value is tube-independent).
- Produces: `{ type: 'quad-split-select' }` interaction mode; `SplitTargets.svelte`.

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

	// Derive the quad array explicitly rather than indexing band.facets: the
	// facet->quad alignment differs per pattern family, so a facet index is NOT
	// a quad index in general.
	//   tiled:    facets = one CutPattern per quad     (generate-tiled-pattern.ts:386-447)
	//   outlined: facets = [outline, ...quads(, fill)] (generate-outlined-pattern.ts:590)
	//             so facet k holds quad k-1, and facets[0] has no quad at all
	// and when getPattern returns a DynamicPathCollection the tiled band
	// collapses to a SINGLE facet (generate-tiled-pattern.ts:337, :349), so
	// facets.length bears no relation to the quad count either.
	//
	// Filtering to quad-bearing facets handles all three uniformly — the same
	// idiom QuadLabels.svelte:32 already uses for the same reason — and makes
	// `index` a true quad index, which is what a split is stored as.
	const quads = $derived(band.facets.filter((f) => !!f.quad).map((f) => f.quad!));

	// Quad k's boundary with k+1 is quad k's d->c edge: quad[k+1].a === quad[k].d
	// and quad[k+1].b === quad[k].c, with unit y running along the band.
	const boundaries = $derived(
		quads
			.map((quad, index) => ({ quad, index }))
			// `index > 0` is the "strictly inside the band" guard; the modulo keeps
			// only legal positions, so an illegal split cannot be clicked at all.
			.filter(({ index }) => index > 0 && index % subunitCount === 0)
			.map(({ index }) => ({
				index,
				// The boundary is the previous quad's far edge.
				from: quads[index - 1].d,
				to: quads[index - 1].c
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

- [ ] **Step 2a: Resolve `subunitCount` in the component that renders the targets**

`SplitTargets` takes `subunitCount` as a prop defaulting to 1; something must pass the real value or every boundary becomes clickable. For hexparquet (`subunitCount === 3`, `tiled-hexparquet-pattern.ts:22`, registered at `pattern-definitions.ts:104`) that would make two thirds of the targets illegal positions that `splitFlatBands` then rejects with a console warning — the opposite of the spec's "Only legal boundaries get a target" (design L377).

In `BandComponent.svelte`, alongside the existing `patternTypeConfig` derived at `:56`:

```ts
	import { resolvePatternEntry } from '$lib/patterns/resolve-pattern';
	import type { UnitPatternGenerator } from '$lib/types';

	// One patternTypeConfig serves every tube (types.ts:1310,
	// run-pattern-generation.ts:64), so this is not per-tube.
	let subunitCount = $derived(
		(resolvePatternEntry(patternTypeConfig.type) as UnitPatternGenerator).subunitCount ?? 1
	);
```

This must be the same value Task 9 passes to `splitFlatBands`, which resolves it the same way from the same config — if they ever diverge, splits vanish with a console warning.

- [ ] **Step 3: Render it from BandComponent**

In `src/components/cut-pattern/BandComponent.svelte`, inside the band `<g>` (after `{@render children?.()}`, `:~148`), render `<SplitTargets>` when the mode is active, plus the always-on split lines when it is not (the spec wants existing splits visible at all times, design L425-426). `patternConfigStore` is already imported here (`:9`) for reads; this component now also writes it:

```ts
	import { interactionMode } from '../three-renderer/interaction-mode';
	import { get } from 'svelte/store';

	let isSplitMode = $derived($interactionMode.type === 'quad-split-select');
	let splitQuads = $derived(
		$patternConfigStore.patternConfig.splits?.tubeSplits.find((t) => t.tube === band.address.tube)
			?.quads ?? []
	);

	const toggleSplit = (quadIndex: number) => {
		const tube = band.address.tube;
		// `.set(mutate(get(store)))` — the idiom at PatternView.svelte:39.
		// patternConfigStore.update(callback) does NOT work: persistable's
		// `update` takes a VALUE and calls writable.update with the identity
		// function (persistable.ts:78-81), so the store never changes and the
		// click silently does nothing. See Global Constraints.
		const store = get(patternConfigStore);
		const existing = store.patternConfig.splits?.tubeSplits ?? [];
		const quads = existing.find((t) => t.tube === tube)?.quads ?? [];
		const next = quads.includes(quadIndex)
			? quads.filter((q) => q !== quadIndex)
			: [...quads, quadIndex].sort((a, b) => a - b);
		// Every object on the edited path is rebuilt — new root, new
		// patternConfig, new splits, new tubeSplits array — because a panel
		// reading through a $derived chain goes stale when a step returns the
		// same reference (design L396-402; cf. the shallow-copy note at
		// PageLayout.svelte:20-26).
		patternConfigStore.set({
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
		});
	};
```

and in the markup:

```svelte
	{#if isSplitMode}
		<SplitTargets {band} {subunitCount} {splitQuads} onToggle={toggleSplit} />
	{/if}
```

`patternConfigStore` really is `{ …, patternConfig: PatternConfig, … }` at the top level (`GlobulePatternConfig`, `types.ts:1303-1311`), so this nesting is correct as written.

One consequence to expect: this is one regeneration per click, by design (design L400-401). If it proves sluggish, batch behind an explicit Apply rather than debouncing the store write.

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
		expect(
			deriveAutoSplits({ quadLengths: [10, 10, 10], contentLength: 100, subunitCount: 1 })
		).toEqual([]);
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
		// Nine quads of 10 in subunit groups of 3 => three groups of 30 each.
		// contentLength 35 fits exactly one group but not two, so the only legal
		// boundaries — 3 and 6 — are both taken.
		//
		// Do NOT use contentLength 25 here: a 30-unit group would not fit the page
		// on its own, the unsplittable check fires on the first iteration, and the
		// function correctly returns []. That fixture is self-contradictory, not a
		// snapping test.
		expect(
			deriveAutoSplits({
				quadLengths: [10, 10, 10, 10, 10, 10, 10, 10, 10],
				contentLength: 35,
				subunitCount: 3
			})
		).toEqual([3, 6]);
	});

	it('handles uneven quad lengths', () => {
		// Greedy first-fit, traced by hand against the implementation:
		//   g0: run 30            (30 <= 40)
		//   g1: run 35            (30 + 5)
		//   g2: run 40            (35 + 5)
		//   g3: 40 + 30 = 70 > 40 => split at 3, run 30
		// => [3]. The previous expectation of [1, 3] describes a balanced/best-fit
		// partition, which is neither what the implementation does nor what the
		// doc comment promises.
		expect(
			deriveAutoSplits({ quadLengths: [30, 5, 5, 30], contentLength: 40, subunitCount: 1 })
		).toEqual([3]);
	});

	it('returns no splits when a single quad already exceeds the page', () => {
		// Nothing can be done by splitting along the band; the caller should
		// surface the existing overflow warning instead.
		expect(
			deriveAutoSplits({ quadLengths: [200, 200], contentLength: 100, subunitCount: 1 })
		).toEqual([]);
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
	let runLength = 0;

	// Walk in subunit groups so every candidate boundary is legal by construction.
	for (let group = 0; group * subunitCount < quadCount; group++) {
		const start = group * subunitCount;
		const end = Math.min(start + subunitCount, quadCount);
		const groupLength = quadLengths.slice(start, end).reduce((sum, l) => sum + l, 0);

		// A single subunit group that does not fit on its own is unsplittable
		// along the band: no arrangement of splits helps. Checked BEFORE any
		// push, so a late oversized group cannot silently discard the splits
		// already found — and the caller surfaces the existing overflow warning
		// instead of receiving a set of splits that still overflows.
		if (groupLength > contentLength) return [];

		if (runLength > 0 && runLength + groupLength > contentLength) {
			splits.push(start);
			runLength = groupLength;
		} else {
			runLength += groupLength;
		}
	}

	return splits;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/auto-split.test.ts`
Expected: PASS, all six tests. Every expected value above was traced by hand against this implementation; the traces are in the test comments. If one fails, re-trace before touching either side — and if the algorithm turns out to be what needs changing, say so explicitly rather than editing an expectation to match observed output.

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
  import { get } from 'svelte/store';

  import { buildPageGeom } from '$lib/cut-pattern/page-layout/registry';
  import { deriveAutoSplits } from '$lib/cut-pattern/auto-split';
  import { collatedTubesStore } from '$lib/stores';
  import type { BandCutPattern, Quadrilateral } from '$lib/types';

  // A quad's extent along the band axis (y), from its four corners.
  const quadYExtent = (quad: Quadrilateral) => {
  	const ys = [quad.a.y, quad.b.y, quad.c.y, quad.d.y];
  	return Math.max(...ys) - Math.min(...ys);
  };

  // Per-quad lengths along the band. Adjacent quads share an edge, so the SUM of
  // these is not the band's length — it over-counts, badly for skewed quads.
  // deriveAutoSplits only ever accumulates them to compare against the page, and
  // a split must fall on a quad boundary, so per-quad extents are the right
  // input; `band.bounds.height` (generate-tiled-pattern.ts:479) is the right
  // measure of the band's total length and is what the longest-band choice
  // below uses.
  const quadYExtents = (band: BandCutPattern): number[] =>
  	band.facets.filter((f) => !!f.quad).map((f) => quadYExtent(f.quad!));

  const autoSplit = () => {
  	const geom = buildPageGeom(cfg);
  	const tubeSplits = get(collatedTubesStore)
  		.map((tube) => {
  			// `tube.address.tube`, NOT the array index: collateTubes CONCATENATES
  			// tubes from several pattern variants (collate-tubes.ts:58-70), so the
  			// collated index is not the tube index splitFlatBands is selected by
  			// at generation time (Task 9a Step 3).
  			const tubeIndex = tube.address.tube;
  			if (!tube?.bands?.length) return { tube: tubeIndex, quads: [] };
  			// The LONGEST band, measured by length — not by quad count. Two bands
  			// with equal quad counts can have very different lengths, and sizing
  			// off the shorter one is what breaks the safety property that one
  			// tube-wide split set fits every sibling (design L409-411).
  			const bandLength = (b: BandCutPattern) =>
  				b.bounds?.height ?? quadYExtents(b).reduce((sum, l) => sum + l, 0);
  			const longest = tube.bands.reduce((a, b) => (bandLength(b) > bandLength(a) ? b : a));
  			return {
  				tube: tubeIndex,
  				quads: deriveAutoSplits({
  					quadLengths: quadYExtents(longest),
  					contentLength: geom.contentHeight,
  					subunitCount
  				})
  			};
  		})
  		.filter(({ quads }) => quads.length > 0);

  	// `.set` with rebuilt references — see Global Constraints;
  	// patternConfigStore.update(callback) is a silent no-op.
  	const store = get(patternConfigStore);
  	patternConfigStore.set({
  		...store,
  		patternConfig: { ...store.patternConfig, splits: { tubeSplits } }
  	});
  };
  ```


  Two prerequisites the earlier draft left as placeholders, both of which have to
  be built before `autoSplit` above can compile:

  **Prerequisite 1 — `collatedTubesStore`.** There is no reachable collated tube
  list today. `collateTubes` is called in exactly one place,
  `PatternViewer.svelte:34-44`, with **eight** inputs drawn from
  `$superGlobulePatternStore`, `$viewControlStore` and `$patternSourceStore`, and
  `PageLayout.svelte` imports none of them (`:1-18`). Duplicating that
  eight-input reactive block inside a config panel would give two sites that can
  disagree about which bands are in scope — the exact failure
  `collate-tubes.ts:28-38` warns about. So extract it once.

  Create `src/lib/stores/collatedTubesStore.ts`:

  ```ts
  import { derived } from 'svelte/store';

  import { collateTubes } from '$lib/cut-pattern/collate-tubes';
  import type { TubeCutPattern } from '$lib/types';

  import { superGlobulePatternStore, patternSourceStore } from './superGlobuleStores';
  import { viewControlStore } from './viewControlStore';

  /**
   * The collated `TubeCutPattern[]` the pattern view actually paints.
   *
   * One shared definition, because `mergedBandPaths` is keyed by `band.id` and
   * ids collide across pattern variants — two sites computing this
   * independently can silently disagree about which bands are in scope
   * (collate-tubes.ts:28-38).
   */
  export const collatedTubesStore = derived(
  	[superGlobulePatternStore, viewControlStore, patternSourceStore],
  	([$pattern, $viewControl, $patternSource]): TubeCutPattern[] =>
  		collateTubes({
  			globuleTubePattern: $pattern.globuleTubePattern,
  			projectionPattern: $pattern.projectionPattern,
  			surfaceProjectionPattern: $pattern.surfaceProjectionPattern,
  			voronoiPattern: $pattern.voronoiPattern,
  			voronoiSurfacePattern: $pattern.voronoiSurfacePattern,
  			showGlobuleTubeGeometry: $viewControl.showGlobuleTubeGeometry,
  			showProjectionGeometry: $viewControl.showProjectionGeometry,
  			patternSource: $patternSource
  		})
  );
  ```

  Add `export * from '$lib/stores/collatedTubesStore';` to `src/lib/stores/index.ts`
  (it re-exports every other store module). Then replace
  `PatternViewer.svelte:34-44`'s `$:` block with `$collatedTubesStore` so the two
  sites cannot drift, and confirm the pattern view still renders identically.

  **Prerequisite 2 — the subunit count is not per tube.** `subunitCountForTube(tube)`
  cannot exist as named: there is exactly **one** `patternTypeConfig` for every
  tube (`types.ts:1310`, `run-pattern-generation.ts:64`). The value is
  tube-independent:

  ```ts
  import { resolvePatternEntry } from '$lib/patterns/resolve-pattern';
  import type { UnitPatternGenerator } from '$lib/types';

  let subunitCount = $derived(
  	(
  		resolvePatternEntry($patternConfigStore.patternTypeConfig.type) as UnitPatternGenerator
  	).subunitCount ?? 1
  );
  ```

  This is the same expression Task 9 uses before calling `splitFlatBands` and the
  same one Task 14 Step 2a uses for the click targets. All three must agree, or
  auto-split proposes positions the splitter rejects and splits vanish with a
  console warning.

- A per-tube split count readout, from `$patternConfigStore.patternConfig.splits?.tubeSplits`.
- A "Clear splits" button writing `{ tubeSplits: [] }` — same `.set`-with-rebuilt-references idiom as `autoSplit` above.
- A warning row, in the existing `.warn` style used for `(overflow)` (`PageLayout.svelte:329`), listing the splits dropped as out of range. This reads `splitValidation.dropped` from Task 7 Step 7, which is why `validateSplitConfig` returns `{ config, dropped }` rather than just a cleaned config:

  ```svelte
  {#if splitValidation.dropped.length > 0}
  	<div class="warn">
  		{splitValidation.dropped.reduce((n, t) => n + t.quads.length, 0)} split(s) dropped as out of range
  		<button onclick={pruneDroppedSplits}>Prune</button>
  	</div>
  {/if}
  ```

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

One asymmetry to leave alone but not be surprised by: `buildPageGeom` (`registry.ts:12-16`) multiplies by `cfg.pageScale` with no guard of its own, so a zero `pageScale` still yields a zero-size page there even after this change. Bringing `derivePageDimensions` in line with `deriveDistance` is what the spec asks for (design L458-464); the layout path is out of this feature's scope.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cut-pattern/page-layout/derive-page-scale.ts src/lib/cut-pattern/page-layout/__tests__/derive-page-scale.test.ts src/lib/cut-pattern/page-layout/units.ts
git commit -m "feat(page-layout): derive pageScale from a target measurement, guard zero scale"
```

### Task 18: Add the size inputs to the panel

**Files:**

- Modify: `src/components/modal/editor/PageLayout.svelte:334-341` (model size rows — `<strong>Model size</strong>` at `:334`, the three axis rows at `:336-338`), `:343-353` (measurement rows)

**Interfaces:**

- Consumes: `derivePageScaleForTarget` (Task 17).

- [ ] **Step 1: Add the handler**

In `src/components/modal/editor/PageLayout.svelte`:

```ts
import { get } from 'svelte/store';

import { derivePageScaleForTarget } from '$lib/cut-pattern/page-layout/derive-page-scale';

// Values are typed in the current display unit; pageScale is per mm.
// `fromDisplay` (:28) already does this conversion — use it rather than
// re-deriving, so the two cannot drift.
const applyTargetSize = (rawPatternUnits: number, targetInDisplayUnit: number) => {
	const targetMm = fromDisplay(targetInDisplayUnit);
	const next = derivePageScaleForTarget(rawPatternUnits, targetMm);
	if (next === undefined) return;
	// Same effect as the "Fit page" toast (CutPatternRenderer.svelte:297) but
	// full precision rather than rounded up — the goal is the number typed, not
	// a fit safety margin. Written with `.set` and rebuilt references, not
	// `.update(callback)`, which is a silent no-op (see Global Constraints);
	// the toast's direct assignment works but leaves references shared.
	const store = get(patternConfigStore);
	patternConfigStore.set({
		...store,
		patternConfig: {
			...store.patternConfig,
			pageLayout: { ...store.patternConfig.pageLayout, pageScale: next }
		}
	});
};
```

- [ ] **Step 2: Add the inputs**

To each of the three model-size rows, add an input to the right. `raw` is the bounds extent in pattern units — read it from `$model3dBoundsStore` via `getSize`, **not** from the already-divided `derived3d` value (`:66-68`), which is in mm and would give a scale-of-a-scale.

Define `rawSize` first; no step previously did, and the snippet below references it. `Box3.getSize` requires a target `Vector3`, and `three` is **not** currently imported into this file:

```ts
	import { Vector3 } from 'three';

	// Raw model extents in pattern units, straight off the bounds — the inverse
	// input to derivePageScaleForTarget.
	let rawSize = $derived($model3dBoundsStore ? $model3dBoundsStore.getSize(new Vector3()) : null);
```

Guard the rows on `rawSize` the same way they already guard on `derived3d`, then:

```svelte
<input
	type="number"
	min="0"
	step="any"
	placeholder="set"
	onchange={(e) => {
		const target = Number(e.currentTarget.value);
		if (rawSize && target > 0) applyTargetSize(rawSize.x, target);
		e.currentTarget.value = '';
	}}
/>
```

Do the same for `y`, `z`, and for each measurement row using `m.a.distanceTo(m.b)` as the raw value — which is exactly what `deriveDistance` divides (`units.ts:31-35`), so the row reads back the number typed. Clearing the field after commit keeps it reading as "set to…" rather than as a stale mirror.

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
