# Label Anchor Positioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Position the self-tag label on outlined-pattern bands so its stem attaches near the midpoint of the start-cap edge (or the outer edge of the start-cap tab if present), with auto-computed perpendicular-outward angle and stem geometry where one long side passes through that midpoint.

**Architecture:** A new pure function `computeOutlinedLabelAnchor(edge, tab?, interiorPoint)` returns `{ anchor: Point, autoAngle: number }` and is called from `generateOutlinedBandPattern`. The auto angle is stored as a new `tagAnchorAutoAngle` field on `BandCutPattern`. `PatternLabel` gains an `autoAngle` prop that is summed with the configured `angle` (relative-offset semantics) and applies a stem-width/2 shift to `anchor` so one long side of the stem passes exactly through the supplied anchor point.

**Tech Stack:** TypeScript, SvelteKit, Three.js `Vector3` (for centroid/interior math), Jest.

---

## Decisions locked in by the spec

- **Attach end:** Start cap only (the `'end'` edge with `endIsStartCap === true`).
- **Outside direction:** Centroid-based — outward is the direction from the band-interior point to the edge midpoint. The existing `OutlineEdge.interiorPoint` (midpoint of the opposite end edge) is the band-interior reference point.
- **Angle semantics:** The configured `labels.selfTag.angle` (and per-band override `band.tagAngle`) become a relative OFFSET from the auto-computed perpendicular outward angle. Default `0` = exactly perpendicular outward.

## What is NOT in this plan

- Tiled-pattern bands keep current behavior (no `tagAnchorAutoAngle`, no stem-width shift). `band.tagAnchorAutoAngle === undefined` is the signal that the new positioning logic should NOT apply, so existing tiled-band rendering is preserved unchanged.
- End-cap label support — only `endIsStartCap === true` is implemented.
- Wiring `mergeOutlineWithLabel` into the rendered output — that's the next plan.
- LabelEditor UI changes — the angle slider still works; semantics change but slider value range / behavior in the editor are unchanged.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/types.ts` | Add `tagAnchorAutoAngle?: number` to `BandCutPattern`. |
| `src/lib/cut-pattern/compute-label-anchor.ts` | NEW. Pure function `computeOutlinedLabelAnchor(edge, tab, interiorPoint, tabWidth?)` → `{ anchor: Point, autoAngle: number }`. No Three or paper deps; just `Point` math. |
| `src/lib/cut-pattern/__tests__/compute-label-anchor.test.ts` | NEW. Tests for no-tab case, with-rect-tab case, outward-direction correctness. |
| `src/lib/cut-pattern/generate-outlined-pattern.ts` | Modify `generateOutlinedBandPattern` (~line 441-516): identify the start-cap edge + its tab (if any), call `computeOutlinedLabelAnchor`, populate `tagAnchorPoint` and `tagAnchorAutoAngle`. |
| `src/components/cut-pattern/PatternLabel.svelte` | Add `autoAngle?: number` prop. Compute `effectiveAngle = angle + (autoAngle ?? 0)`. When `autoAngle !== undefined`, apply a stem-width/2 shift to the wrapper translate so one long side of the stem lands at `anchor`. |
| `src/components/cut-pattern/BandComponent.svelte` | Pass `autoAngle={band.tagAnchorAutoAngle}` to `<PatternLabel>`. |
| `src/components/cut-pattern/CutPatternRenderer.svelte` | (No change needed — already forwards `band.tagAnchorPoint` and `band.tagAngle`. The autoAngle flows through `band` directly to `BandComponent`.) |

## Algorithm reference

Given the start-cap `OutlineEdge` with `start`, `end`, `interiorPoint` (all `Vector3`), and an optional `TabGeometry` on that edge:

1. **Edge midpoint:** `edgeMid = (edge.start + edge.end) / 2` (drop z).
2. **Anchor point M:**
   - **No tab:** `M = edgeMid`.
   - **With rect/inset/partner/partner-inset/rounded tab:** `M = edgeMid + outwardNormal * tabWidth`. This formula is exact for rectangular/inset/partner tabs and lands on the apex of a rounded tab — good enough for label attachment in all current tab shapes.
3. **Outward unit vector N:** `(edgeMid − interiorPoint).normalize()`, projected to 2D. (We do not use `M − interiorPoint` because for tabbed cases that would skew the angle slightly toward the tab interior; using the BAND edge midpoint keeps the perpendicular direction tied to the band geometry, not the tab protrusion.)
4. **Auto angle:** `autoAngle = atan2(-N.x, N.y)` (radians). This is the angle such that SVG `rotate(autoAngle)` takes the path-space `+y` axis (the stem direction in `PatternLabel`'s local frame) onto `N`.
5. Return `{ anchor: M, autoAngle }`.

### Why `atan2(-N.x, N.y)`

`SVG transform="rotate(θ)"` applies `[cos, -sin; sin, cos]` to a point. Applied to `(0, 1)` (the stem's local +y direction) it yields `(-sin θ, cos θ)`. We want this to equal `N`:
- `-sin θ = N.x → sin θ = -N.x`
- `cos θ = N.y`
- `θ = atan2(-N.x, N.y)`

### Stem-width shift (in `PatternLabel`)

`PatternLabel`'s local stem geometry has the two long sides at internal `x = ±stemWidth/2`, both running from `y = 0` (stem tip) to `y = stemLength` (body base). After the wrapper `translate(renderAnchor) rotate(effectiveAngle)`, the side at internal `+stemWidth/2` ends up at world position `renderAnchor + R(effectiveAngle) * (stemWidth/2, 0) = renderAnchor + (cos θ * w/2, sin θ * w/2)`.

To make that side land on the supplied `anchor` (the midpoint M from the algorithm):
```
renderAnchor = anchor - (cos θ * stemWidth/2, sin θ * stemWidth/2)
```
where `θ = effectiveAngle` (radians). The other side then lands at `M − (cos θ * stemWidth, sin θ * stemWidth)` — offset by `stemWidth` along the edge direction, as the spec requires.

This shift is applied only when `autoAngle !== undefined`. For tiled bands (no autoAngle), `renderAnchor = anchor` exactly as today.

---

## Task 1: Add `tagAnchorAutoAngle` to BandCutPattern

**Files:**
- Modify: `src/lib/types.ts` (line ~319, in the `BandCutPattern` type definition)

- [ ] **Step 1: Edit `src/lib/types.ts`**

Find the `BandCutPattern` type and add a new optional field next to `tagAngle`. Currently lines around 318-319 are:

```ts
	tagAnchorPoint: Point;
	tagAngle?: number;
```

Change to:

```ts
	tagAnchorPoint: Point;
	tagAngle?: number;
	/**
	 * For outlined bands: the auto-computed perpendicular-outward angle (radians)
	 * derived from the start-cap edge orientation. The configured `tagAngle` (or
	 * `labels.selfTag.angle`) is treated as a relative offset added to this base.
	 * Undefined for tiled bands and any band where no auto-positioning has been
	 * computed; PatternLabel falls back to the previous absolute-angle behavior.
	 */
	tagAnchorAutoAngle?: number;
```

- [ ] **Step 2: Verify type-check**

Run: `npm run check 2>&1 | grep "BandCutPattern\|tagAnchorAutoAngle" | head -20`

Expected: no new errors involving `tagAnchorAutoAngle`. (Pre-existing errors in unrelated files are fine.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add BandCutPattern.tagAnchorAutoAngle for outlined-band label positioning"
```

---

## Task 2: `computeOutlinedLabelAnchor` — pure function + tests

**Files:**
- Create: `src/lib/cut-pattern/compute-label-anchor.ts`
- Create: `src/lib/cut-pattern/__tests__/compute-label-anchor.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/cut-pattern/__tests__/compute-label-anchor.test.ts`:

```ts
import { computeOutlinedLabelAnchor } from '../compute-label-anchor';

describe('computeOutlinedLabelAnchor', () => {
	test('no-tab case: anchor is edge midpoint, autoAngle points outward from interior', () => {
		// Edge from (0, 0) to (10, 0) — horizontal, lying along y=0.
		// Interior point below the edge at (5, -5).
		// Outward direction is therefore +y, autoAngle should make path-space +y → world +y.
		const { anchor, autoAngle } = computeOutlinedLabelAnchor({
			edgeStart: { x: 0, y: 0 },
			edgeEnd: { x: 10, y: 0 },
			interiorPoint: { x: 5, y: -5 },
			tab: undefined,
			tabWidth: 0
		});

		expect(anchor.x).toBeCloseTo(5);
		expect(anchor.y).toBeCloseTo(0);

		// θ such that rotate(θ) takes (0,1) → outward N = (0, 1)
		// (-sin θ, cos θ) = (0, 1) → sin θ = 0, cos θ = 1 → θ = 0.
		expect(autoAngle).toBeCloseTo(0);
	});

	test('with rectangular tab: anchor is shifted outward by tabWidth', () => {
		const { anchor } = computeOutlinedLabelAnchor({
			edgeStart: { x: 0, y: 0 },
			edgeEnd: { x: 10, y: 0 },
			interiorPoint: { x: 5, y: -5 },
			tab: { tabWidth: 4 }, // tab present, outward shift = 4
			tabWidth: 4
		});

		// Outward N = (0, 1); edgeMid = (5, 0); anchor = (5, 0) + (0,1) * 4 = (5, 4)
		expect(anchor.x).toBeCloseTo(5);
		expect(anchor.y).toBeCloseTo(4);
	});

	test('autoAngle is perpendicular to a vertical edge with interior on the left', () => {
		// Edge from (0, 0) to (0, 10) — vertical, x=0.
		// Interior at (-5, 5). Outward N = +x direction = (1, 0).
		// autoAngle: (-sin θ, cos θ) = (1, 0) → sin θ = -1, cos θ = 0 → θ = -π/2.
		const { autoAngle } = computeOutlinedLabelAnchor({
			edgeStart: { x: 0, y: 0 },
			edgeEnd: { x: 0, y: 10 },
			interiorPoint: { x: -5, y: 5 },
			tab: undefined,
			tabWidth: 0
		});

		expect(autoAngle).toBeCloseTo(-Math.PI / 2);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/compute-label-anchor.test.ts`

Expected: FAIL — module `../compute-label-anchor` not found.

- [ ] **Step 3: Implement the function**

Create `src/lib/cut-pattern/compute-label-anchor.ts`:

```ts
import type { Point } from '$lib/types';

/**
 * Inputs to `computeOutlinedLabelAnchor`.
 *
 * `edgeStart` / `edgeEnd` are the two endpoints of the start-cap edge in the
 * flattened band's 2D coordinate space (z is ignored if a Vector3 is passed).
 *
 * `interiorPoint` is a reference point INSIDE the band — for outlined bands
 * this is `OutlineEdge.interiorPoint`, the midpoint of the opposite end edge.
 *
 * `tab` is the tab geometry record IF the start-cap edge has a tab on it.
 * Only `tabWidth` is read — the formula `edgeMid + N * tabWidth` is exact for
 * rectangular/inset/partner tabs and lands on the apex of rounded tabs.
 * Pass `undefined` for "no tab".
 *
 * `tabWidth` is duplicated as a top-level arg because `TabGeometry` does not
 * carry `tabWidth` directly today; the caller has it from `tabConfig.tabWidth`
 * and passes both. When `tab === undefined`, `tabWidth` is ignored.
 */
export type ComputeOutlinedLabelAnchorInput = {
	edgeStart: { x: number; y: number };
	edgeEnd: { x: number; y: number };
	interiorPoint: { x: number; y: number };
	tab: { tabWidth: number } | undefined;
	tabWidth: number;
};

export type OutlinedLabelAnchor = {
	anchor: Point;
	autoAngle: number;
};

export const computeOutlinedLabelAnchor = (
	input: ComputeOutlinedLabelAnchorInput
): OutlinedLabelAnchor => {
	const { edgeStart, edgeEnd, interiorPoint, tab, tabWidth } = input;

	const edgeMid: Point = {
		x: (edgeStart.x + edgeEnd.x) / 2,
		y: (edgeStart.y + edgeEnd.y) / 2
	};

	// Outward unit normal: direction from band interior toward the edge midpoint.
	const nx = edgeMid.x - interiorPoint.x;
	const ny = edgeMid.y - interiorPoint.y;
	const nLen = Math.hypot(nx, ny) || 1;
	const N: Point = { x: nx / nLen, y: ny / nLen };

	// Anchor: edge midpoint, optionally shifted outward by tab width for tabbed bands.
	const anchor: Point = tab
		? { x: edgeMid.x + N.x * tabWidth, y: edgeMid.y + N.y * tabWidth }
		: edgeMid;

	// SVG rotate(θ) takes (0,1) → (-sin θ, cos θ). Solve for θ such that this equals N.
	const autoAngle = Math.atan2(-N.x, N.y);

	return { anchor, autoAngle };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/cut-pattern/__tests__/compute-label-anchor.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cut-pattern/compute-label-anchor.ts src/lib/cut-pattern/__tests__/compute-label-anchor.test.ts
git commit -m "feat(cut-pattern): add computeOutlinedLabelAnchor for start-cap label placement"
```

---

## Task 3: Wire into `generateOutlinedBandPattern`

**Files:**
- Modify: `src/lib/cut-pattern/generate-outlined-pattern.ts` (around lines 441-516)

- [ ] **Step 1: Add the import**

At the top of `src/lib/cut-pattern/generate-outlined-pattern.ts`, after the existing imports (around line 30 after the `collect-outlined-band-tabs` import), add:

```ts
import { computeOutlinedLabelAnchor } from './compute-label-anchor';
```

- [ ] **Step 2: Locate the start-cap edge index and its tab inside `generateOutlinedBandPattern`**

The function starts around line 441. After the existing block that computes `tabs` (around line 502 where `const tabs = collectOutlinedBandTabs(...)` is called) and BEFORE the `const result: BandCutPattern = { ... }` block (around line 504), insert this block:

```ts
	// Locate the start-cap edge (the one with endIsStartCap === true) so the
	// self-tag label can attach near its midpoint (or the outer midpoint of its
	// tab, if any). For outlined bands the start cap is the LAST edge in the
	// walk order (see getOutlineEdges: it's appended after the 'after' side and
	// closes the loop back to quads[0].a). We scan rather than hardcode the
	// index so any future reordering of the walk doesn't silently break this.
	let startCapIndex = -1;
	for (let i = 0; i < edges.length; i++) {
		if (edges[i].side === 'end' && edges[i].endIsStartCap === true) {
			startCapIndex = i;
			break;
		}
	}

	let labelAnchor: { anchor: { x: number; y: number }; autoAngle: number } | undefined;
	if (startCapIndex >= 0) {
		const capEdge = edges[startCapIndex];
		const capTab = tabsByIndex.get(startCapIndex);
		// tabConfig is typed as optional on OutlinedPatternConfig, though in
		// practice buildOutlinePath above will have already required it if any
		// tab was generated. Guard with ?? 0 to keep the types honest.
		const capTabWidth = config.tabConfig?.tabWidth ?? 0;
		labelAnchor = computeOutlinedLabelAnchor({
			edgeStart: { x: capEdge.start.x, y: capEdge.start.y },
			edgeEnd: { x: capEdge.end.x, y: capEdge.end.y },
			interiorPoint: { x: capEdge.interiorPoint.x, y: capEdge.interiorPoint.y },
			tab: capTab ? { tabWidth: capTabWidth } : undefined,
			tabWidth: capTabWidth
		});
	}
```

- [ ] **Step 3: Update the `result` object to populate the new fields**

Currently (around lines 504-513) the result is built with:

```ts
	const result: BandCutPattern = {
		projectionType: 'patterned',
		facets: [outlineFacet, ...quadFacets],
		svgPath: outlineFacet.svgPath,
		id: `outlined-band-${bandIndex}`,
		tagAnchorPoint: { x: 0, y: 0 },
		address: { ...tubeAddress, band: bandIndex },
		bounds,
		meta
	};
```

Change `tagAnchorPoint` to draw from `labelAnchor` if available, and add `tagAnchorAutoAngle`:

```ts
	const result: BandCutPattern = {
		projectionType: 'patterned',
		facets: [outlineFacet, ...quadFacets],
		svgPath: outlineFacet.svgPath,
		id: `outlined-band-${bandIndex}`,
		tagAnchorPoint: labelAnchor ? labelAnchor.anchor : { x: 0, y: 0 },
		tagAnchorAutoAngle: labelAnchor?.autoAngle,
		address: { ...tubeAddress, band: bandIndex },
		bounds,
		meta
	};
```

- [ ] **Step 4: Run tests**

Run: `npm run test:unit`

Expected: all tests still pass (the existing 168 + the 3 from Task 2 = 171, no regressions). The outlined-pattern path is exercised indirectly by the existing tab/edge tests, but the new fields are additive so no existing test should change behavior.

If anything fails, inspect the failure — the most likely issue is a missing import or a typo in the field name.

- [ ] **Step 5: Type-check**

Run: `npm run check 2>&1 | grep -E "generate-outlined-pattern|compute-label-anchor" | head`

Expected: no new errors from these files.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cut-pattern/generate-outlined-pattern.ts
git commit -m "feat(cut-pattern): populate tagAnchor at start-cap for outlined bands"
```

---

## Task 4: PatternLabel — `autoAngle` prop, effective angle, and stem-width shift

**Files:**
- Modify: `src/components/cut-pattern/PatternLabel.svelte`

- [ ] **Step 1: Add `autoAngle` to props**

Currently the props block (lines 11-37) declares `angle = 0`. Add `autoAngle` next to it. The props object becomes:

```ts
	let {
		id = undefined,
		color = 'black',
		value,
		addressStrings = undefined,
		radius = 10,
		height = 14,
		angle = 0,
		autoAngle = undefined,
		anchor = { x: 0, y: 0 },
		padding = 10,
		stemLength = 20,
		stemWidth = 4,
		portal = undefined
	}: {
		id?: string | undefined;
		color?: string;
		value: number;
		addressStrings?: string[] | undefined;
		radius?: number;
		height?: number;
		angle?: number;
		autoAngle?: number | undefined;
		anchor?: Point;
		padding?: number;
		stemLength?: number;
		stemWidth?: number;
		portal?: { transform: string } | undefined;
	} = $props();
```

- [ ] **Step 2: Compute the effective angle and the render anchor**

Currently (around lines 238-249) the angle/transform derivation is:

```ts
	// Convert radians to degrees for SVG transform.
	let angleDeg = $derived((angle * 180) / Math.PI);

	// Wrapper transform: position the path-space origin at `anchor`, then
	// rotate around it. For the portal branch, prepend the portal transform
	// so the portal positioning still applies but the rotation is local to
	// the label coords.
	let wrapperTransform = $derived(
		portal
			? `${portal.transform} translate(${anchor.x} ${anchor.y}) rotate(${angleDeg})`
			: `translate(${anchor.x} ${anchor.y}) rotate(${angleDeg})`
	);
```

Replace that block with:

```ts
	// When `autoAngle` is provided (outlined bands), `angle` is interpreted as
	// a relative offset added to it. For tiled bands and any legacy caller,
	// `autoAngle` is undefined and `angle` keeps its previous absolute-rotation
	// behavior.
	let effectiveAngle = $derived(angle + (autoAngle ?? 0));
	let effectiveAngleDeg = $derived((effectiveAngle * 180) / Math.PI);

	// Stem-width/2 shift: the path-space stem has its two long sides at internal
	// x = ±stemWidth/2. We want the +x side to land exactly on `anchor` (so one
	// long side passes through M and the other is offset by stemWidth along the
	// edge direction). The wrapper translate must therefore be shifted by
	// −R(θ) · (stemWidth/2, 0) where θ is the effective angle. Only apply this
	// when autoAngle is defined; otherwise preserve the legacy "anchor = stem
	// tip center" behavior.
	let renderAnchor = $derived(
		autoAngle === undefined
			? anchor
			: {
					x: anchor.x - (stemWidth / 2) * Math.cos(effectiveAngle),
					y: anchor.y - (stemWidth / 2) * Math.sin(effectiveAngle)
				}
	);

	// Wrapper transform: position the path-space origin at `renderAnchor`, then
	// rotate around it. For the portal branch, prepend the portal transform
	// so the portal positioning still applies but the rotation is local to
	// the label coords.
	let wrapperTransform = $derived(
		portal
			? `${portal.transform} translate(${renderAnchor.x} ${renderAnchor.y}) rotate(${effectiveAngleDeg})`
			: `translate(${renderAnchor.x} ${renderAnchor.y}) rotate(${effectiveAngleDeg})`
	);
```

- [ ] **Step 3: Type-check**

Run: `npm run check 2>&1 | grep "PatternLabel" | head`

Expected: no new errors. (Pre-existing errors elsewhere are fine — see MEMORY.md.)

- [ ] **Step 4: Tests**

Run: `npm run test:unit`

Expected: all tests still pass. PatternLabel has no unit tests at the moment, but its consumers (BandComponent etc.) are smoke-tested indirectly via the pattern tests. The change here is additive (new prop with safe default).

- [ ] **Step 5: Commit**

```bash
git add src/components/cut-pattern/PatternLabel.svelte
git commit -m "feat(pattern-label): add autoAngle prop, effective-angle composition, and stem-width anchor shift"
```

---

## Task 5: BandComponent threads `autoAngle` to PatternLabel

**Files:**
- Modify: `src/components/cut-pattern/BandComponent.svelte` (line ~103-117)

- [ ] **Step 1: Pass `autoAngle` through to PatternLabel**

Currently the `<PatternLabel ...>` block (lines 103-117) reads:

```svelte
		{#if selfTagEnabled}
			<PatternLabel
				id={`band-self-${band.id}`}
				{color}
				value={index}
				radius={(labels?.selfTag?.height ?? 16) / 4}
				height={labels?.selfTag?.height ?? 14}
				angle={band.tagAngle ?? labels?.selfTag?.angle ?? 0}
				anchor={tagAnchorPoint || { x: -50, y: -50 }}
				addressStrings={[concatAddress(band.address, 'tb-slash')]}
				padding={labels?.selfTag?.padding ?? 10}
				stemLength={labels?.selfTag?.stemLength ?? 20}
				stemWidth={labels?.selfTag?.stemWidth ?? 4}
				portal={isTiled ? { transform: `translate(${origin.x} ${origin.y})` } : undefined}
			/>
		{/if}
```

Add the `autoAngle` prop, sourced from `band.tagAnchorAutoAngle`:

```svelte
		{#if selfTagEnabled}
			<PatternLabel
				id={`band-self-${band.id}`}
				{color}
				value={index}
				radius={(labels?.selfTag?.height ?? 16) / 4}
				height={labels?.selfTag?.height ?? 14}
				angle={band.tagAngle ?? labels?.selfTag?.angle ?? 0}
				autoAngle={band.tagAnchorAutoAngle}
				anchor={tagAnchorPoint || { x: -50, y: -50 }}
				addressStrings={[concatAddress(band.address, 'tb-slash')]}
				padding={labels?.selfTag?.padding ?? 10}
				stemLength={labels?.selfTag?.stemLength ?? 20}
				stemWidth={labels?.selfTag?.stemWidth ?? 4}
				portal={isTiled ? { transform: `translate(${origin.x} ${origin.y})` } : undefined}
			/>
		{/if}
```

- [ ] **Step 2: Type-check**

Run: `npm run check 2>&1 | grep "BandComponent" | head`

Expected: no new errors.

- [ ] **Step 3: Run full test suite**

Run: `npm run test:unit`

Expected: all tests pass (171 total, no regressions).

- [ ] **Step 4: Commit**

```bash
git add src/components/cut-pattern/BandComponent.svelte
git commit -m "feat(band-component): pass tagAnchorAutoAngle through to PatternLabel"
```

---

## Task 6: Full-suite verification and push

- [ ] **Step 1: Run the entire unit-test suite**

Run: `npm run test:unit`

Expected: all suites pass. New tests from Task 2 (3 added) bring the total to 171.

- [ ] **Step 2: Run type-check**

Run: `npm run check 2>&1 | grep -E "compute-label-anchor|generate-outlined-pattern|PatternLabel|BandComponent" | head -30`

Expected: no errors in any of the modified files.

- [ ] **Step 3: Visual sanity check (manual)**

The visual behavior change is hard to assert via tests. Manually verify by:
1. Start dev server: `npm run dev`
2. Open the designer in browser; select an outlined pattern
3. Enable self-tag in LabelEditor
4. Confirm: the label stem now points outward perpendicular to the start-cap edge (or the outer edge of the start-cap tab if present), instead of sticking straight up from (0,0)
5. Confirm: rotating the angle slider in LabelEditor rotates the label relative to the outward direction
6. Confirm: the stem visibly attaches at one corner (not centered) — one long side passes through the edge midpoint, the other is offset by stemWidth

If anything looks wrong, the most likely cause is sign error in the `effectiveAngle` computation or the shift direction. Add `console.log({ anchor, autoAngle, effectiveAngle, renderAnchor })` to PatternLabel temporarily to debug, then revert.

If the visual check passes, stop the dev server.

- [ ] **Step 4: Push**

```bash
git push
```

Expected: branch updated on remote.

---

## Notes / Out of scope

- **Tiled bands are unaffected.** `band.tagAnchorAutoAngle` is undefined for tiled bands, which triggers the legacy code path in `PatternLabel` (no shift, no angle sum). Existing tiled-band test snapshots should not change.
- **`band.tagAngle` override semantics under the new model.** For outlined bands, `band.tagAngle` is currently never populated by the generation pipeline — it's only set for tiled bands. The chain `band.tagAngle ?? labels?.selfTag?.angle ?? 0` therefore resolves to the user's configured offset, which becomes the relative offset added to `autoAngle`. Existing saved configs with `selfTag.angle === 0` now render with the label perpendicular to the edge instead of pointing up.
- **End-cap labels and partner labels are deferred.** The current spec only covers the start cap. Adding end-cap support is a small extension (also scan for `endIsStartCap === false` and emit a second anchor), but it would require deciding the data shape for "multiple per-band anchors", which is out of scope here.
- **Rounded-tab apex vs flat-tab midpoint.** Both produce a sensible label anchor with the simple `edgeMid + N * tabWidth` formula. If a future tab shape has a non-symmetric outer profile (e.g. asymmetric inset), this approximation may need refinement.
- **Merge wiring is deferred.** With the label now correctly attached near the band outline, `mergeOutlineWithLabel` from the prior plan can be wired in at render time in a follow-up. That wiring is non-trivial (BandComponent or PatternLabel needs to parse `band.svgPath` back into PathSegment[], merge, and substitute the rendered path) and deserves its own plan.
