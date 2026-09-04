# Globule Tube Partner Meta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate `facet.meta` partner data on plain globule tubes, honestly enough that grid-pattern edge-segment dropping works there without punching holes in genuinely free edges.

**Architecture:** A closure test reads the tube's topology from its section geometry (spatial proximity, no config flag). A new `matchGlobuleTubeFacets` — a sibling to the existing `matchFacets`, not a reuse of `getFacetEdgeMeta` — assigns `base`/`second` within each band and `outer` across bands, omitting partners at the tube's two open ends and at an open profile's last band. A prune pass then drops outer partners pointing at bands that render filtering removed. Nothing in the pattern pipeline changes; it already reads this data.

**Tech Stack:** TypeScript, Three.js (`Vector3`, `Triangle`), Jest (`ts-jest` ESM preset). Unit tests live in `**/__tests__/**/*.test.ts`.

**Spec:** `docs/superpowers/specs/2026-09-04-globule-tube-partner-meta-design.md`

## Global Constraints

- Branch: work on the current branch. Do not merge, rebase, stash, reset, or `git checkout` another branch, and do not `git push`.
- Run unit tests with `npm run test:unit -- <path>`; type-check with `npm run check`.
- `npm run check` has a **pre-existing baseline of roughly 434 errors**. That is CLEAN. Never expect zero. The regression signal is the total-count _diff_.
- **Do NOT run `npm run format`** — it is `prettier --write .` and reflows the whole repo. Format only the files you touched: `npx prettier --write <paths>`.
- Do not change the drop feature itself. The pattern path is already wired: globule tubes flow through `patternFor()` → `generateProjectionPattern` → `generateTubeCutPattern` → `generateTiling`, which passes `bands`.
- Do not touch `generateSuperGlobulePattern` or `generateTiledBandPattern` (the legacy path that omits `bands`). Globule tubes do not use it.
- Do not "fix" `getFacetEdgeMeta`'s unconditional wrap or the dead `finishOuterEdge` condition. Both are known and out of scope.
- Geometry generation runs in a Web Worker. Vite does not rebuild the worker on reload; restart the dev server if worker-bundled code changes.

## Domain Glossary

- **Facet** — one triangle. **Band** — a strip of facets. **Tube** — `{ bands, sections, orientation, address }`.
- **Section** — `{ points: Vector3[] }`, one cross-section of the swept form.
- `generateProjectionBands`' axial branch builds one band per `f` in `[0, sectionLength - 1)`, and `generateFacetPair` indexes `points[pointIndex]` and `points[pointIndex + 1]` **with no modulo**. So band `f` spans `p_f → p_(f+1)` and there are `sectionLength - 1` bands.
- **Closed** tube — `points[last]` sits on `points[0]`, so band `N-2`'s outer edge lands on band 0's inner edge and the wrap is real. **Open** — it does not, leaving an uncovered wedge, so the last band's outer edge is genuinely free.
- **`base` / `second` / `outer`** — the three edges of a facet, named per orientation by `getEdge(kind, parityOrIndex, orientation)` in `src/lib/projection-geometry/generate-projection.ts`. `base` and `second` run along the band; `outer` is the long side edge that borders the neighbouring band.
- `Facet['meta']` maps a `TriangleEdge` (`'ab' | 'bc' | 'ac'`) to `{ partner: GlobuleAddress_FacetEdge }`. `GlobuleAddress_FacetEdge` is `{ globule, tube, band, facet, edge }`.

## Why a sibling and not a reuse

`getFacetEdgeMeta` cannot be called here, for two structural reasons:

1. It throws when a first facet lacks `meta[base]` or a last facet lacks `meta[second]`. Those are seeded by `matchTubeEnds` from a _neighbouring tube_. A standalone globule tube has no neighbour and two genuinely open ends.
2. It sets `edgeMeta[outer].partner` unconditionally via `(b + bandOffset + bandCount) % bandCount`, with no check that the wrap is real. That is precisely the false positive this work must not reproduce.

## File Structure

| File                                                                      | Change | Responsibility                                                                        |
| ------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| `src/lib/types.ts`                                                        | Modify | Make the three keys of `Facet['meta']` optional so an absent partner is expressible.  |
| `src/lib/projection-geometry/tube-closure.ts`                             | Create | Closure detection, standalone and pure.                                               |
| `src/lib/projection-geometry/__tests__/tube-closure.test.ts`              | Create | Tests for it.                                                                         |
| `src/lib/projection-geometry/generate-projection.ts`                      | Modify | `matchGlobuleTubeFacets` and `pruneOuterPartnersOutsideSet`, beside `matchFacets`.    |
| `src/lib/projection-geometry/__tests__/match-globule-tube-facets.test.ts` | Create | Tests for both.                                                                       |
| `src/lib/generate-shape.ts`                                               | Modify | Call both from `generateGlobuleTube`, in the right order relative to `getRenderable`. |

---

### Task 1: Make absent partners expressible

`FacetEdgeMeta.partner` is non-optional and the three meta keys are required, so today "no partner on this edge" can only be expressed by omitting the key and lying to the type system. Every later task depends on being able to omit a key honestly.

**Files:**

- Modify: `src/lib/types.ts` (the `Facet` type, ~line 809)
- Modify: `src/lib/projection-geometry/generate-projection.ts` (`getFacetEdgeMeta`, ~line 959)

**Interfaces:**

- Produces: `Facet['meta']` becomes `{ ab?: FacetEdgeMeta; bc?: FacetEdgeMeta; ac?: FacetEdgeMeta } | undefined`. Later tasks rely on being able to write `meta[edge] = {...}` selectively and `delete meta[edge]`.

- [ ] **Step 1: Widen the type**

In `src/lib/types.ts`, in the `Facet` type, change the `meta` member to:

```ts
	/**
	 * Partner data per triangle edge. A key is ABSENT when that edge has no
	 * partner — the open end of a tube, or the free outer edge of an open
	 * profile's last band. Absence is meaningful: `bandHasFreeSide` reads it as
	 * "this edge borders open space", which keeps the edge solid in cut output.
	 */
	meta?: {
		ab?: FacetEdgeMeta;
		bc?: FacetEdgeMeta;
		ac?: FacetEdgeMeta;
	};
```

- [ ] **Step 2: Capture the check baseline, then see the fallout**

```bash
npm run check 2>&1 | tail -3
```

Record the number. It should be around 434 before your edit and will likely RISE after it, because sites that wrote `edgeMeta[base].partner = ...` now see a possibly-undefined member.

- [ ] **Step 3: Keep `getFacetEdgeMeta` internally strict**

`getFacetEdgeMeta` builds a fully-populated meta object and throws if any edge is missing, so internally its keys are required. Give it a local strict type instead of loosening its logic. Near the top of `src/lib/projection-geometry/generate-projection.ts`, add:

```ts
/**
 * `getFacetEdgeMeta` populates all three edges and throws if any is missing, so
 * it works with a strict shape internally. `Facet['meta']`'s keys are optional
 * because OTHER producers (globule tubes) legitimately omit edges.
 */
type StrictFacetMeta = { ab: FacetEdgeMeta; bc: FacetEdgeMeta; ac: FacetEdgeMeta };
```

Then in `getFacetEdgeMeta`, change the construction line from its current `as Facet['meta']` cast to:

```ts
const edgeMeta = { ab: {}, bc: {}, ac: {} } as StrictFacetMeta;
```

Leave its return type as `Facet['meta']` — `StrictFacetMeta` is assignable to it. Leave every other line of that function alone.

Import `FacetEdgeMeta` from `$lib/types` if it is not already imported in that file.

- [ ] **Step 4: Fix any remaining fallout**

```bash
npm run check 2>&1 | tail -3
```

The count must return to the baseline you recorded in Step 2. If other sites still error, fix the READ sites (add a guard, or `?.`) — do **not** revert the type change to make them go away. The type change is the point of this task.

- [ ] **Step 5: Confirm nothing broke**

Run: `npm run test:unit`
Expected: same pass counts as before this task (85 suites / 653 tests at time of writing).

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/lib/types.ts src/lib/projection-geometry/generate-projection.ts
git add src/lib/types.ts src/lib/projection-geometry/generate-projection.ts
git commit -m "refactor(facet-meta): make per-edge partner keys optional"
```

---

### Task 2: Closure detection

Whether a globule tube wraps is a property of its geometry, not its config — there is no `closed` or `sweep` flag on `ShapeConfig` or `LevelConfig` to read. Detect it by spatial proximity, with a tolerance relative to the section's own point spacing so the test does not misjudge very large or very small globules.

**Files:**

- Create: `src/lib/projection-geometry/tube-closure.ts`
- Test: `src/lib/projection-geometry/__tests__/tube-closure.test.ts`

**Interfaces:**

- Consumes: `Section` from `$lib/projection-geometry/types` (`{ points: Vector3[] }`).
- Produces:
  - `CLOSURE_RATIO: number` (`0.01`)
  - `isSectionClosed(section: Section): boolean`
  - `isTubeClosed(sections: Section[]): boolean` — true only when every section closes.

- [ ] **Step 1: Write the failing test**

Create `src/lib/projection-geometry/__tests__/tube-closure.test.ts`:

```ts
import { Vector3 } from 'three';
import type { Section } from '$lib/projection-geometry/types';
import { CLOSURE_RATIO, isSectionClosed, isTubeClosed } from '../tube-closure';

/** A unit square. Closed form repeats the first point; open form does not. */
const square = (closed: boolean): Section => {
	const pts = [
		new Vector3(0, 0, 0),
		new Vector3(1, 0, 0),
		new Vector3(1, 1, 0),
		new Vector3(0, 1, 0)
	];
	return { points: closed ? [...pts, pts[0].clone()] : pts };
};

describe('isSectionClosed', () => {
	it('is true when the last point repeats the first', () => {
		expect(isSectionClosed(square(true))).toBe(true);
	});

	it('is false when the profile leaves an uncovered wedge', () => {
		expect(isSectionClosed(square(false))).toBe(false);
	});

	it('tolerates a gap well inside the relative threshold', () => {
		const s = square(true);
		// mean spacing is 1, so anything below 0.01 closes
		s.points[s.points.length - 1] = new Vector3(0.001, 0, 0);
		expect(isSectionClosed(s)).toBe(true);
	});

	it('rejects a gap just outside the relative threshold', () => {
		const s = square(true);
		s.points[s.points.length - 1] = new Vector3(CLOSURE_RATIO * 2, 0, 0);
		expect(isSectionClosed(s)).toBe(false);
	});

	it('scales with the model: the same shape 1000x larger still closes', () => {
		const s = square(true);
		s.points = s.points.map((p) => p.clone().multiplyScalar(1000));
		expect(isSectionClosed(s)).toBe(true);
	});

	it('scales with the model: a proportional gap fails at any scale', () => {
		const big = square(false);
		big.points = big.points.map((p) => p.clone().multiplyScalar(1000));
		expect(isSectionClosed(big)).toBe(false);
	});

	it('is false for a degenerate section with fewer than three points', () => {
		expect(isSectionClosed({ points: [new Vector3(), new Vector3()] })).toBe(false);
	});

	it('is false when every point is identical (zero mean spacing)', () => {
		expect(isSectionClosed({ points: [new Vector3(), new Vector3(), new Vector3()] })).toBe(false);
	});
});

describe('isTubeClosed', () => {
	it('is true when every section closes', () => {
		expect(isTubeClosed([square(true), square(true), square(true)])).toBe(true);
	});

	it('is false when any section is open — conservative on disagreement', () => {
		expect(isTubeClosed([square(true), square(false), square(true)])).toBe(false);
	});

	it('is false for an empty section list', () => {
		expect(isTubeClosed([])).toBe(false);
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- src/lib/projection-geometry/__tests__/tube-closure.test.ts`
Expected: FAIL — cannot resolve `../tube-closure`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/projection-geometry/tube-closure.ts`:

```ts
import type { Section } from './types';

/**
 * A section counts as closed when the gap between its endpoints is under this
 * fraction of the mean distance between neighbouring points.
 *
 * The tolerance is RELATIVE on purpose. Globule coordinates are in model units,
 * so a fixed epsilon would misjudge very large or very small globules. It is
 * also decisive rather than marginal: a closed profile carries a duplicate
 * closing point (gap ~0), while an open one leaves a wedge on the order of a
 * full point spacing. Anything near the threshold is malformed input.
 *
 * Deliberately NOT `FILL_DEGENERATE_EPSILON` (see `fill-bands.ts`) — that is an
 * absolute threshold for zero-length edges, a different question entirely.
 */
export const CLOSURE_RATIO = 0.01;

export const isSectionClosed = (section: Section): boolean => {
	const { points } = section;
	if (points.length < 3) return false;

	const closingGap = points[0].distanceTo(points[points.length - 1]);

	let total = 0;
	for (let i = 0; i < points.length - 1; i++) {
		total += points[i].distanceTo(points[i + 1]);
	}
	const meanSpacing = total / (points.length - 1);
	if (meanSpacing === 0) return false;

	return closingGap < meanSpacing * CLOSURE_RATIO;
};

/**
 * The tube wraps only when EVERY section closes. Sections that disagree are
 * treated as open: failing to drop segments is a cosmetic miss, whereas
 * punching holes in an edge that should be solid ruins a cut.
 */
export const isTubeClosed = (sections: Section[]): boolean =>
	sections.length > 0 && sections.every(isSectionClosed);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit -- src/lib/projection-geometry/__tests__/tube-closure.test.ts`
Expected: PASS, all 11 cases.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/lib/projection-geometry/tube-closure.ts src/lib/projection-geometry/__tests__/tube-closure.test.ts
git add src/lib/projection-geometry/tube-closure.ts src/lib/projection-geometry/__tests__/tube-closure.test.ts
git commit -m "feat(globule-meta): detect tube closure by relative spatial proximity"
```

---

### Task 3: Assign the partner meta

**Files:**

- Modify: `src/lib/projection-geometry/generate-projection.ts` (add beside `matchFacets`, ~line 863)
- Test: `src/lib/projection-geometry/__tests__/match-globule-tube-facets.test.ts`

**Interfaces:**

- Consumes: `isTubeClosed(sections)` from Task 2; optional meta keys from Task 1; the existing module-local `getEdge(kind, parityOrIndex, orientation)`.
- Produces:
  - `matchGlobuleTubeFacets(tube: Tube): void` — mutates `facet.meta` in place on every non-degenerate facet.
  - `pruneOuterPartnersOutsideSet(renderedBands: Band[]): void` — mutates in place, deleting `outer` partners that point outside the rendered set.

- [ ] **Step 1: Write the failing test**

Create `src/lib/projection-geometry/__tests__/match-globule-tube-facets.test.ts`:

```ts
import { Triangle, Vector3 } from 'three';
import type { Band, Facet } from '$lib/types';
import type { Section, Tube } from '$lib/projection-geometry/types';
import { matchGlobuleTubeFacets, pruneOuterPartnersOutsideSet } from '../generate-projection';

const square = (closed: boolean): Section => {
	const pts = [
		new Vector3(0, 0, 0),
		new Vector3(1, 0, 0),
		new Vector3(1, 1, 0),
		new Vector3(0, 1, 0)
	];
	return { points: closed ? [...pts, pts[0].clone()] : pts };
};

/**
 * Triangles are irrelevant to meta assignment — only counts, orientation,
 * address and `isDegenerate` matter — so they are placeholders here.
 */
const makeTube = (bandCount: number, facetsPerBand: number, closed: boolean): Tube => {
	const bands: Band[] = [];
	for (let b = 0; b < bandCount; b++) {
		const facets: Facet[] = [];
		for (let f = 0; f < facetsPerBand; f++) {
			facets.push({
				triangle: new Triangle(new Vector3(), new Vector3(1, 0, 0), new Vector3(0, 1, 0)),
				address: { globule: 0, tube: 0, band: b, facet: f },
				orientation: 'axial-right'
			});
		}
		bands.push({ orientation: 'axial-right', facets, visible: true });
	}
	return {
		bands,
		sections: [square(closed), square(closed)],
		orientation: 'axial-right',
		address: { globule: 0, tube: 0 }
	};
};

// For 'axial-right' (EDGE_MAP in generate-projection.ts): even facets use base
// 'ab', second 'bc'; odd use base 'bc', second 'ab'. Both parities use outer 'ac'.
//
// Band step direction, which drives every wrap expectation below:
//   bandOffset = (orientation === 'axial-left' ? -1 : 1) * (isEven ? -1 : 1)
// so for 'axial-right', EVEN facets step -1 and ODD facets step +1.
const OUTER = 'ac';

describe('matchGlobuleTubeFacets — closed tube', () => {
	it('gives every facet an outer partner, wrapping at both ends', () => {
		const tube = makeTube(4, 6, true);
		matchGlobuleTubeFacets(tube);
		tube.bands.forEach((band) => {
			band.facets.forEach((facet) => {
				expect(facet.meta?.[OUTER]?.partner).toBeDefined();
			});
		});
		// even facets step -1, so band 0's wrap backward lands on band 3
		expect(tube.bands[0].facets[0].meta?.[OUTER]?.partner?.band).toBe(3);
		// odd facets step +1, so band 3's wrap forward lands on band 0
		expect(tube.bands[3].facets[1].meta?.[OUTER]?.partner?.band).toBe(0);
	});

	it('omits base on the first facet and second on the last facet of each band', () => {
		const tube = makeTube(3, 6, true);
		matchGlobuleTubeFacets(tube);
		tube.bands.forEach((band) => {
			// facet 0 is even -> base 'ab'; facet 5 is odd -> second 'ab'
			expect(band.facets[0].meta?.ab).toBeUndefined();
			expect(band.facets[5].meta?.ab).toBeUndefined();
		});
	});

	it('links interior facets to their neighbours within the band', () => {
		const tube = makeTube(2, 6, true);
		matchGlobuleTubeFacets(tube);
		const facet = tube.bands[0].facets[2]; // even: base 'ab', second 'bc'
		expect(facet.meta?.ab?.partner?.facet).toBe(1);
		expect(facet.meta?.bc?.partner?.facet).toBe(3);
		expect(facet.meta?.ab?.partner?.band).toBe(0);
	});
});

describe('matchGlobuleTubeFacets — open tube', () => {
	it('omits the outer partner where the step would wrap past the ends', () => {
		const tube = makeTube(4, 6, false);
		matchGlobuleTubeFacets(tube);
		// even facets step -1, so band 0 would go to -1
		expect(tube.bands[0].facets[0].meta?.[OUTER]).toBeUndefined();
		// odd facets step +1, so band 3 would go to 4
		expect(tube.bands[3].facets[1].meta?.[OUTER]).toBeUndefined();
	});

	it('leaves the in-range neighbours of those same bands intact', () => {
		const tube = makeTube(4, 6, false);
		matchGlobuleTubeFacets(tube);
		// band 0's odd facets step +1 to band 1 — in range
		expect(tube.bands[0].facets[1].meta?.[OUTER]?.partner?.band).toBe(1);
		// band 3's even facets step -1 to band 2 — in range
		expect(tube.bands[3].facets[0].meta?.[OUTER]?.partner?.band).toBe(2);
	});

	it('still links interior bands across the seam', () => {
		const tube = makeTube(4, 6, false);
		matchGlobuleTubeFacets(tube);
		expect(tube.bands[1].facets[0].meta?.[OUTER]?.partner?.band).toBe(0);
		expect(tube.bands[2].facets[1].meta?.[OUTER]?.partner?.band).toBe(3);
	});
});

describe('matchGlobuleTubeFacets — degenerate facets', () => {
	it('skips them and leaves their meta untouched', () => {
		const tube = makeTube(2, 6, true);
		tube.bands[0].facets[0].isDegenerate = true;
		tube.bands[0].facets[0].meta = undefined;
		matchGlobuleTubeFacets(tube);
		expect(tube.bands[0].facets[0].meta).toBeUndefined();
		expect(tube.bands[0].facets[1].meta).toBeDefined();
	});
});

describe('pruneOuterPartnersOutsideSet', () => {
	it('drops outer partners pointing at bands that were filtered out', () => {
		const tube = makeTube(5, 6, true);
		matchGlobuleTubeFacets(tube);
		const rendered = tube.bands.slice(1, 4); // bands 1, 2, 3 survive
		pruneOuterPartnersOutsideSet(rendered);
		// band 1's even facets step -1 to band 0, which is gone
		expect(rendered[0].facets[0].meta?.[OUTER]).toBeUndefined();
		// band 3's odd facets step +1 to band 4, which is gone
		expect(rendered[2].facets[1].meta?.[OUTER]).toBeUndefined();
	});

	it('keeps outer partners pointing inside the rendered set', () => {
		const tube = makeTube(5, 6, true);
		matchGlobuleTubeFacets(tube);
		const rendered = tube.bands.slice(1, 4);
		pruneOuterPartnersOutsideSet(rendered);
		// band 1's odd facets step +1 to band 2
		expect(rendered[0].facets[1].meta?.[OUTER]?.partner?.band).toBe(2);
		// band 2's even facets step -1 to band 1
		expect(rendered[1].facets[0].meta?.[OUTER]?.partner?.band).toBe(1);
	});

	it('leaves base and second partners alone', () => {
		const tube = makeTube(5, 6, true);
		matchGlobuleTubeFacets(tube);
		const rendered = tube.bands.slice(1, 4);
		pruneOuterPartnersOutsideSet(rendered);
		expect(rendered[0].facets[2].meta?.ab?.partner?.facet).toBe(1);
		expect(rendered[0].facets[2].meta?.bc?.partner?.facet).toBe(3);
	});

	it('is a no-op when every band is rendered', () => {
		const tube = makeTube(4, 6, true);
		matchGlobuleTubeFacets(tube);
		pruneOuterPartnersOutsideSet(tube.bands);
		tube.bands.forEach((band) =>
			band.facets.forEach((facet) => expect(facet.meta?.[OUTER]).toBeDefined())
		);
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- src/lib/projection-geometry/__tests__/match-globule-tube-facets.test.ts`
Expected: FAIL — `matchGlobuleTubeFacets` and `pruneOuterPartnersOutsideSet` are not exported.

- [ ] **Step 3: Write the implementation**

In `src/lib/projection-geometry/generate-projection.ts`, immediately after the existing `matchFacets` function, add. Import `isTubeClosed` from `./tube-closure` at the top of the file.

```ts
/**
 * Assign partner meta for a STANDALONE globule tube.
 *
 * A sibling of `matchFacets`/`getFacetEdgeMeta` rather than a reuse of them,
 * for two structural reasons:
 *   1. `getFacetEdgeMeta` throws unless a first/last facet already carries end
 *      meta seeded by `matchTubeEnds` from a NEIGHBOURING tube. A standalone
 *      globule tube has no neighbour and two genuinely open ends.
 *   2. `getFacetEdgeMeta` wraps the outer partner unconditionally through
 *      `% bandCount`, claiming a partner even on a genuinely free edge. Here
 *      the wrap is CONDITIONAL on the profile actually closing.
 *
 * An absent key means "this edge borders open space" — `bandHasFreeSide` reads
 * it that way, which is what keeps a free edge solid in cut output.
 */
export const matchGlobuleTubeFacets = (tube: Tube): void => {
	const closed = isTubeClosed(tube.sections);
	const bandCount = tube.bands.length;

	tube.bands.forEach((band, b) => {
		const facetCount = band.facets.length;

		band.facets.forEach((facet, f) => {
			if (facet.isDegenerate) return; // synthetic fill facet — never partner-matched
			const address = facet.address;
			if (!address) return;

			const { orientation } = facet;
			const base = getEdge('base', f, orientation);
			const second = getEdge('second', f, orientation);
			const outer = getEdge('outer', f, orientation);

			const meta: NonNullable<Facet['meta']> = {};

			// Along the band. The tube's two ends are open — no partner there.
			if (f > 0) {
				meta[base] = { partner: { ...address, facet: f - 1, edge: base } };
			}
			if (f < facetCount - 1) {
				meta[second] = { partner: { ...address, facet: f + 1, edge: second } };
			}

			// Across to the neighbouring band. Same offset arithmetic as
			// `getFacetEdgeMeta`, but the wrap is conditional.
			const isEven = f % 2 === 0;
			const bandOffset = (orientation === 'axial-left' ? -1 : 1) * (isEven ? -1 : 1);
			const rawPartnerBand = b + bandOffset;
			const wraps = rawPartnerBand < 0 || rawPartnerBand >= bandCount;

			if (!wraps || closed) {
				const partnerBand = ((rawPartnerBand % bandCount) + bandCount) % bandCount;
				const partnerBandOrientation = tube.bands[partnerBand].orientation;
				const facetOffset = (isEven ? 1 : -1) * (partnerBandOrientation === orientation ? 1 : 0);
				const pOuter = getEdge('outer', f, partnerBandOrientation);
				meta[outer] = {
					partner: {
						...address,
						band: partnerBand,
						facet: f + facetOffset,
						edge: pOuter
					}
				};
			}

			facet.meta = meta;
		});
	});
};

/**
 * `generateGlobuleTube` filters bands through `getRenderable` AFTER meta is
 * assigned over the full generated set. A band on the boundary of that rendered
 * subset has a partner that is not being cut, so its outer edge is physically
 * free — drop those partners so the edge stays solid.
 *
 * Fails in the safe direction: a pruned partner means "do not drop", never
 * "punch holes in a free edge".
 */
export const pruneOuterPartnersOutsideSet = (renderedBands: Band[]): void => {
	const surviving = new Set<number>();
	renderedBands.forEach((band) => {
		const b = band.facets[0]?.address?.band;
		if (b !== undefined) surviving.add(b);
	});

	renderedBands.forEach((band) => {
		band.facets.forEach((facet, f) => {
			if (!facet.meta) return;
			const outer = getEdge('outer', f, facet.orientation);
			const partner = facet.meta[outer]?.partner;
			if (partner && !surviving.has(partner.band)) {
				delete facet.meta[outer];
			}
		});
	});
};
```

If `Tube`, `Band` or `Facet` are not already imported in that file, add them — `Tube` from `./types`, `Band` and `Facet` from `$lib/types`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit -- src/lib/projection-geometry/__tests__/match-globule-tube-facets.test.ts`
Expected: PASS, all 12 cases.

- [ ] **Step 5: Check for regressions**

```bash
npm run test:unit
npm run check 2>&1 | tail -3
```

Expected: full suite green, check count at the ~434 baseline.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/lib/projection-geometry/generate-projection.ts src/lib/projection-geometry/__tests__/match-globule-tube-facets.test.ts
git add src/lib/projection-geometry/generate-projection.ts src/lib/projection-geometry/__tests__/match-globule-tube-facets.test.ts
git commit -m "feat(globule-meta): assign partner meta for standalone globule tubes"
```

---

### Task 4: Call it from the globule pipeline

**Files:**

- Modify: `src/lib/generate-shape.ts` (`generateGlobuleTube`, ~lines 869-902)

**Interfaces:**

- Consumes: `matchGlobuleTubeFacets(tube)` and `pruneOuterPartnersOutsideSet(renderedBands)` from Task 3.
- Produces: nothing later tasks import. This is the wiring that makes the feature live.

- [ ] **Step 1: Read the current function**

Read `generateGlobuleTube` in `src/lib/generate-shape.ts`. Its shape today is: build `sections`, call `generateProjectionBands(sections, 'axial-right', address)` into `bands`, pass those through `getRenderable(config.renderConfig, bands)` into `filteredBands`, and return a `Tube` built from `filteredBands`.

**Order matters and is the point of this task.** Meta is assigned over the FULL generated band set so that every partner names a real band and the indices stay consistent with `facet.address` (which is assigned pre-filter). Pruning then runs over the RENDERED set. Assigning after filtering instead would break both properties.

- [ ] **Step 2: Insert the two calls**

Between the `generateProjectionBands` call and the `getRenderable` call, and again after it, so the function reads:

```ts
const bands = generateProjectionBands(sections, 'axial-right', address);

// Partner meta is assigned over the FULL generated set: every partner then
// names a real band, and band indices stay consistent with `facet.address`,
// which was assigned pre-filter.
matchGlobuleTubeFacets({
	bands,
	sections,
	orientation: 'axial-right',
	address
});

const filteredBands = getRenderable(config.renderConfig, bands) as Band[];

// A band on the boundary of the rendered subset has a partner that is not
// being cut, so its outer edge is physically free. Drop those.
pruneOuterPartnersOutsideSet(filteredBands);
```

Leave the rest of the function, including the `Tube` it returns, unchanged.

Add the import at the top of `src/lib/generate-shape.ts`:

```ts
import {
	matchGlobuleTubeFacets,
	pruneOuterPartnersOutsideSet
} from '$lib/projection-geometry/generate-projection';
```

Check whether that file already imports from `generate-projection` and extend the existing import rather than adding a second one. `Band` should already be imported; add it if not.

- [ ] **Step 3: Verify no import cycle**

`generate-shape.ts` now imports from `generate-projection.ts`. Confirm `generate-projection.ts` does not import from `generate-shape.ts`:

```bash
grep -n "generate-shape" src/lib/projection-geometry/generate-projection.ts
```

Expected: no output. If there IS output, stop and report it — a cycle needs a different placement, not a workaround.

- [ ] **Step 4: Verify the whole suite and the type baseline**

```bash
npm run test:unit
npm run check 2>&1 | tail -3
```

Expected: full suite green (85 suites / 653 tests plus the ~22 you added), check count at the ~434 baseline.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/lib/generate-shape.ts
git add src/lib/generate-shape.ts
git commit -m "feat(globule-meta): populate partner meta when generating globule tubes"
```

---

### Task 5: Verify on a real globule

Unit tests prove the meta is shaped correctly on synthetic tubes. They cannot prove the drop appears on a real globule in the app — that needs the running pipeline.

**Files:** none committed. The verification script is scratch.

- [ ] **Step 1: Start the app**

```bash
npm run dev   # serves on http://localhost:9775
```

If a dev server is already running on 9775, use it rather than starting a second. Because geometry generation is worker-bundled and Vite does not rebuild the worker on reload, **restart the dev server** so this branch's changes are actually in the worker bundle.

- [ ] **Step 2: Drive it headlessly**

The Chrome extension is unavailable. Write a script **at the repo root** (so it resolves `@playwright/test`) and run it with `node`:

```js
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (m) => console.log('[console]', m.type(), m.text()));
await page.goto('http://localhost:9775/designer2', { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);
await page.screenshot({ path: 'globule-drop-off.png' });
await browser.close();
```

The HoverSidebar rail renders titles as split letters (`"C rossS ection"`), so target floaters by index into `nav .hover-button-container button` — index 0 is the showMode toggle — **not** by visible text.

Set the pattern source to the globule, the pattern type to `tiledGridPattern-0`, then capture with `Drop Edge Segments` off and on.

- [ ] **Step 3: Compare properly**

The visual difference is SMALL — the same feature on projection geometry measured 236 differing pixels in a ~1.87M-pixel viewport, and a previous verification wrongly concluded "no change" by comparing file sizes. Do not repeat that. Use a pixel diff and a zoomed crop of a band edge:

```bash
magick compare -metric AE globule-drop-off.png globule-drop-on.png null: 2>&1
```

A non-zero count means the feature fired. Then crop both around the same band edge and inspect.

- [ ] **Step 4: Report what you see, do not "fix" it**

Describe factually: which edge of the bands lost segments, whether the losses alternate down the band, whether the final segment at each band's far end survived, and whether any band was untouched. If the drops land on the wrong edge or do not appear, **report it — do not change the drop logic or the meta arithmetic.** The repository owner judges this visually.

Keep the crop PNGs and name their paths. Delete only the `.mjs` script.

- [ ] **Step 5: Confirm the tree is clean**

```bash
git status --short
```

Expected: no modified tracked files. Untracked PNGs are fine.
