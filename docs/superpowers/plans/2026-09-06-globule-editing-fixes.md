# Globule Editing Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make floating editors stay open by default, correct and extend globule cross-section division methods, fix radial cross-section rendering and radial-lateral geometry, and add user-placed two-point measurements to the 3D model.

**Architecture:** A single pure module, `src/lib/geometry/radial-shape.ts`, becomes the one source of truth for how a radial cross-section repeats around the origin. Both the 3D generator (`generate-shape.ts`) and the editor preview (`curve-preview.ts`) consume it, so geometry and preview cannot drift apart. The measurer is a self-contained store plus one new interaction mode, reusing the codebase's existing first-intersection solutions rather than inventing a new one.

**Tech Stack:** SvelteKit, Svelte 5 runes, Three.js via Threlte, TypeScript, Jest (ts-jest ESM preset), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-06-globule-editing-fixes-design.md`

## Global Constraints

- Branch: `feat/globule-editing-fixes` (already created, off `main`).
- **`npm run check` baseline is 434 errors / 76 warnings / 67 files with problems.** This is CLEAN — all pre-existing. Never expect zero. The regression signal is an *increase* in the total. Verify with `npm run check 2>&1 | tail -1`.
- **`npx jest` baseline is 87 suites / 675 tests / 66 snapshots, all passing.** Any new failure is a regression.
- `npm run lint` (`prettier --check . && eslint .`) must pass. Run `npm run format` before committing if prettier complains.
- Jest config: `testMatch` is `**/__tests__/**/*.test.ts`. Tests are colocated. `$lib/*` is mapped. `testEnvironment` is `node`, so **no test may import a `.svelte` file** — all new logic that needs testing must live in `.ts` modules.
- Angle convention throughout the cross-section code is `(x, y) = (-r·sin θ, r·cos θ)` — θ measured from the **+y axis, counter-clockwise**. `pointOnRay` in `path-editor.ts:493` uses it; so does `generateDefaultRadialShapeConfig`. Do not switch to `atan2`-from-+x when authoring points.
- Three.js `CurvePath.getPoint(t)` already maps `t` through cumulative curve lengths, so `getSpacedPoints` on a `CurvePath` is arc-length-even across the whole path. `Curve.getPoints` on a single bezier is **parameter**-space, not arc-length. This distinction is the bug in Task 5.
- Never run `git stash`, `git checkout`, or `git reset` — the repo has untracked working files at root.

---

## File Structure

**Created**
- `src/lib/geometry/radial-shape.ts` — pure radial repetition of a cross-section's authored curve run. No Three.js. Exports `radialUnitAngle`, `radialSideCurveConfigs`, `radialShapeCurveConfigs`.
- `src/lib/geometry/__tests__/radial-shape.test.ts`
- `src/lib/stores/measurementStore.ts` — user-placed measurement pairs.
- `src/lib/stores/__tests__/measurementStore.test.ts`
- `src/lib/cut-pattern/page-layout/__tests__/distance.test.ts`
- `src/lib/__tests__/cross-section-sampling.test.ts`
- `src/components/modal/editor/__tests__/curve-preview.test.ts`
- `src/components/three-renderer/nearest-vertex.ts` — nearest model vertex of the nearest-hit mesh.
- `src/components/three-renderer/__tests__/nearest-vertex.test.ts`

**Modified**
- `src/components/modal/Floater.svelte` — invert `closeOnClickAway`, drop duplicated markup.
- `src/components/modal/HoverSidebar.svelte:50` — `?? true` → `?? false`.
- `src/components/modal/sidebar-definitions.ts` — remove redundant opt-outs.
- `src/lib/generate-shape.ts:150-205,249-272` — delete `rotatedCurve`, rebuild `generateRadialShape` on the shared module, add `radialSideCurvePaths`, fix `divideCurvePath`, add `divideSide`.
- `src/lib/types.ts:948-956` — add `divideSide`.
- `src/lib/shades-config.ts:155-189` — half-wedge default run for reflected symmetries.
- `src/components/modal/editor/curve-preview.ts` — `radializeCurves` delegates to the shared module; `pathFromCurves` emits honest breaks.
- `src/components/modal/editor/PathEditor.svelte:35-45,214-219` — overlay context gains `modelCurveDef` and `toDisplay`.
- `src/components/modal/editor/GlobuleCrossSection.svelte` — overlay works in model space; `By Side` option; unit-angle-aware end lock and side length.
- `src/lib/cut-pattern/page-layout/units.ts` — `deriveDistance`.
- `src/components/three-renderer/interaction-mode.ts` — `point-select-measure`.
- `src/components/three-renderer/Scene.svelte` — measure click branch + indicator rendering.
- `src/components/three-renderer/materials.ts:152-155` — `measurePending`, `measureMatched`.
- `src/components/three-renderer/selection-helpers.ts` — measure-aware facet select.
- `src/components/projection/ProjectionGeometryComponent.svelte` — measure on projection facets.
- `src/components/modal/editor/PageLayout.svelte` — New measurement button + rows.
- `src/lib/stores/index.ts` — export the new store.

---

## Task 1: Floating editor persistence

**Files:**
- Modify: `src/components/modal/Floater.svelte`
- Modify: `src/components/modal/HoverSidebar.svelte:50`
- Modify: `src/components/modal/sidebar-definitions.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `FloaterContent.closeOnClickAway?: boolean` now defaults to `false` (stay open). Opt in with `closeOnClickAway: true`.

- [ ] **Step 1: Invert the default and collapse the duplicated markup in `Floater.svelte`**

Replace the whole `<script>` prop block and the entire `{#if showFloater}` template with:

```svelte
<script lang="ts">
	import type { Component } from 'svelte';
	import Button from '../design-system/Button.svelte';

	let {
		onClose,
		title,
		showFloater,
		content: Content,
		closeOnClickAway = false
	}: {
		onClose: () => void;
		title: string | string[] | undefined;
		showFloater: boolean;
		content: Component | undefined;
		/**
		 * Floaters stay open on click-away by default. Opt in to click-away
		 * closing only for panels that are genuinely transient.
		 */
		closeOnClickAway?: boolean;
	} = $props();

	// One `<main>`, one action. The action reads `closeOnClickAway` at event time
	// rather than being conditionally applied, so toggling the flag never forces
	// the panel to remount (which would tear down its content).
	function clickOutside(node: HTMLElement) {
		const handleClick = (event: MouseEvent) => {
			if (!closeOnClickAway) return;
			if (node && !node.contains(event.target as Node) && !event.defaultPrevented) {
				onClose();
			}
		};

		document.addEventListener('click', handleClick, true);

		return {
			destroy() {
				document.removeEventListener('click', handleClick, true);
			}
		};
	}
</script>

{#if showFloater}
	<main use:clickOutside>
		<header>
			<span>{title}</span>
			<Button onclick={() => onClose()}>X</Button>
		</header>
		{#if Content}<Content />{/if}
	</main>
{/if}
```

Leave the `<style>` block exactly as it is.

- [ ] **Step 2: Flip the fallback in `HoverSidebar.svelte`**

Line 50 currently reads:

```svelte
	closeOnClickAway={currentFloater?.closeOnClickAway ?? true}
```

Change to:

```svelte
	closeOnClickAway={currentFloater?.closeOnClickAway ?? false}
```

- [ ] **Step 3: Remove the now-redundant opt-outs in `sidebar-definitions.ts`**

Three entries set `closeOnClickAway: false`, which is now the default. Delete that line (and the trailing comma on the preceding line where needed) from:

- `Tile Editor` (in `patternConfigs`)
- `Pattern Layout` (in `patternConfigs`)
- `Voronoi` (in `projectionConfigs`)

Leave `Label Editor`'s `closeOnClickAway: true` in place — it is the one panel that should still close on click-away.

Also update the `FloaterContent` doc so the default is not a surprise:

```ts
export type FloaterContent = {
	shortTitle: string;
	title: string | string[];
	content: Component;
	/** Defaults to false — floaters stay open on click-away. */
	closeOnClickAway?: boolean;
};
```

- [ ] **Step 4: Verify nothing regressed**

Run: `npx jest 2>&1 | tail -5`
Expected: 87 suites / 675 tests passing.

Run: `npm run check 2>&1 | tail -1`
Expected: `434 ERRORS` — unchanged.

- [ ] **Step 5: Manually confirm the behavior change**

Start `npm run dev` (port 9776) and open `/designer2`. Open the Silhouette floater from the rail and click on the 3D canvas. It must stay open. Open Label Editor and click away — it must close.

Per the project's recipe: the Chrome extension is unavailable. If driving this headlessly, write the Playwright script **at the repo root** so it resolves `@playwright/test`, and target floaters by index into `nav .hover-button-container button` (index 0 is the showMode toggle) — the rail renders titles as split letters (`C rossS ection`), so text selectors do not work.

- [ ] **Step 6: Commit**

```bash
git add src/components/modal/Floater.svelte src/components/modal/HoverSidebar.svelte src/components/modal/sidebar-definitions.ts
git commit -m "feat(ui): floating editors stay open on click-away by default

Inverts closeOnClickAway: staying open is now the default and click-away
closing is opt-in. Only Label Editor still opts in. Also collapses Floater's
duplicated markup branch into one <main> whose action reads the flag at event
time, so toggling it no longer remounts panel content."
```

---

## Task 2: Shared radial-shape module (and the radial-lateral correction)

This is the foundation for Tasks 3-7. It fixes the generator bug for `lateral` / `radial-lateral` while leaving `radial` and `asymmetric` bit-identical.

**Files:**
- Create: `src/lib/geometry/radial-shape.ts`
- Create: `src/lib/geometry/__tests__/radial-shape.test.ts`
- Modify: `src/lib/generate-shape.ts:150-205`

**Interfaces:**
- Consumes: `BezierConfig`, `ShapeConfig` from `$lib/types`.
- Produces:
  - `radialUnitAngle(config: Pick<ShapeConfig, 'symmetry' | 'symmetryNumber'>): number`
  - `radialSideCurveConfigs(config: ShapeConfig): BezierConfig[][]` — one inner array per emitted side, in generation order.
  - `radialShapeCurveConfigs(config: ShapeConfig): BezierConfig[]` — the flattened run.
  - `radialSideCurvePaths(config: ShapeConfig): CurvePath<Vector2>[]` — exported from `generate-shape.ts`, used by Task 6.

### Background the implementer needs

The authored `ShapeConfig.curves` describe **one side** — a run of beziers spanning one angular unit. The full cross-section repeats that run around the origin.

The old `rotatedCurve` reflected a point at angle θ to `angle − θ`, i.e. it mirrored about the ray at `wedge/2` measured from angle 0. That only chains if the authored run starts at angle 0, but the default run starts at 90°. It also never reversed traversal order, so the reflected copy ran backwards. Measured on the radius-100 default at 7 sides, consecutive curves were **200 units apart**.

The correct construction, verified numerically:

1. Mirror the authored run about the ray through its **own end point** (`phi = angle of the last curve's p3`). That ray is a fixed point of the mirror, so the reflected run touches the forward run exactly there.
2. Reverse both the point order within each curve **and** the order of the curves, so the reflected run *starts* at that shared point instead of ending there.
3. Repeat `[forward, reflected]` `symmetryNumber` times, rotating by `2π / symmetryNumber` each time.

For this to close the circle, the authored run must span `π / symmetryNumber` when reflected, and `2π / symmetryNumber` when not. That is `radialUnitAngle`, and it matches the design note at `generate-shape.ts:143`.

Verified results — max gap between each curve's start and the previous curve's end, radius-100 default:

| symmetry | n | sides emitted | max gap |
| --- | --- | --- | --- |
| radial | 7 | 7 | 0.000000 |
| radial | 3 | 3 | 0.000000 |
| radial-lateral | 7 | 14 | 0.000000 |
| radial-lateral | 3 | 6 | 0.000000 |
| lateral | 1 | 2 | 0.000000 |
| asymmetric | 1 | 1 | 0.000000 |

And `radial` output is bit-identical to the current generator (max delta `0.000000000000` at n = 3, 5, 7, 12).

- [ ] **Step 1: Write the failing test**

Create `src/lib/geometry/__tests__/radial-shape.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';

import {
	radialSideCurveConfigs,
	radialShapeCurveConfigs,
	radialUnitAngle
} from '../radial-shape';
import type { BezierConfig, ShapeConfig } from '$lib/types';

/** A single bezier spanning `unitAngle`, in the codebase's (-sin, cos) convention. */
const runSpanning = (unitAngle: number): BezierConfig[] => [
	{
		type: 'BezierConfig',
		points: [
			{ type: 'PointConfig2', x: 0, y: 100 },
			{
				type: 'PointConfig2',
				x: -Math.sin(unitAngle / 6) * 150,
				y: Math.cos(unitAngle / 6) * 150
			},
			{
				type: 'PointConfig2',
				x: -Math.sin((unitAngle * 5) / 6) * 150,
				y: Math.cos((unitAngle * 5) / 6) * 150
			},
			{
				type: 'PointConfig2',
				x: -Math.sin(unitAngle) * 100,
				y: Math.cos(unitAngle) * 100
			}
		]
	}
];

const shape = (symmetry: ShapeConfig['symmetry'], symmetryNumber: number): ShapeConfig => {
	const config = {
		type: 'ShapeConfig',
		symmetry,
		symmetryNumber,
		sampleMethod: { method: 'divideCurve', divisions: 4 },
		curves: []
	} as ShapeConfig;
	config.curves = runSpanning(radialUnitAngle(config));
	return config;
};

/**
 * The largest distance between a curve's start point and the previous curve's
 * end point, wrapping around. Zero means the outline closes cleanly; anything
 * else is a gap that `pathFromCurves` would render as a phantom loop.
 */
const maxJointGap = (curves: BezierConfig[]): number =>
	Math.max(
		...curves.map((curve, i) => {
			const previous = curves[(i - 1 + curves.length) % curves.length];
			return Math.hypot(
				curve.points[0].x - previous.points[3].x,
				curve.points[0].y - previous.points[3].y
			);
		})
	);

describe('radialUnitAngle', () => {
	it('spans a full wedge when the shape is not reflected', () => {
		expect(radialUnitAngle({ symmetry: 'radial', symmetryNumber: 7 })).toBeCloseTo(
			(Math.PI * 2) / 7,
			12
		);
	});

	it('spans a half wedge when the shape is reflected, so run + mirror fill the wedge', () => {
		expect(radialUnitAngle({ symmetry: 'radial-lateral', symmetryNumber: 7 })).toBeCloseTo(
			Math.PI / 7,
			12
		);
		expect(radialUnitAngle({ symmetry: 'lateral', symmetryNumber: 1 })).toBeCloseTo(Math.PI, 12);
	});
});

describe('radialSideCurveConfigs', () => {
	it('emits one side per repeat when not reflected', () => {
		expect(radialSideCurveConfigs(shape('radial', 7))).toHaveLength(7);
		expect(radialSideCurveConfigs(shape('asymmetric', 1))).toHaveLength(1);
	});

	it('emits a forward and a reflected side per repeat when reflected', () => {
		// Decided: a "side" is the authored run as authored, so a 7-fold
		// radial-lateral shape has 14 sides, not 7.
		expect(radialSideCurveConfigs(shape('radial-lateral', 7))).toHaveLength(14);
		expect(radialSideCurveConfigs(shape('lateral', 1))).toHaveLength(2);
	});

	it('closes the outline for every symmetry', () => {
		const cases: [ShapeConfig['symmetry'], number][] = [
			['radial', 3],
			['radial', 7],
			['asymmetric', 1],
			['radial-lateral', 3],
			['radial-lateral', 7],
			['lateral', 1]
		];
		for (const [symmetry, symmetryNumber] of cases) {
			const curves = radialShapeCurveConfigs(shape(symmetry, symmetryNumber));
			expect(maxJointGap(curves)).toBeLessThan(1e-9);
		}
	});

	it('keeps every point on the authored radius, so reflection does not rescale', () => {
		const curves = radialShapeCurveConfigs(shape('radial-lateral', 7));
		const anchorRadii = curves.map((c) => Math.hypot(c.points[0].x, c.points[0].y));
		for (const r of anchorRadii) expect(r).toBeCloseTo(100, 9);
	});

	it('does not mutate the input config', () => {
		const config = shape('radial-lateral', 5);
		const before = JSON.stringify(config);
		radialShapeCurveConfigs(config);
		expect(JSON.stringify(config)).toBe(before);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/lib/geometry/__tests__/radial-shape.test.ts`
Expected: FAIL — `Cannot find module '../radial-shape'`.

- [ ] **Step 3: Write `src/lib/geometry/radial-shape.ts`**

```ts
/**
 * How a cross-section's authored curve run repeats around the origin.
 *
 * This is the single source of truth shared by the 3D generator
 * (`generate-shape.ts`) and the editor preview (`curve-preview.ts`). They used
 * to implement the repetition separately and disagreed, which is what made the
 * Globule Cross Section preview draw phantom loops.
 *
 * Angle convention matches the rest of the cross-section code:
 * `(x, y) = (-r·sin θ, r·cos θ)` — θ from the +y axis, counter-clockwise.
 */
import type { BezierConfig, PointConfig2, ShapeConfig } from '$lib/types';

const REFLECTED_SYMMETRIES: ShapeConfig['symmetry'][] = ['lateral', 'radial-lateral'];

export const isReflectedSymmetry = (symmetry: ShapeConfig['symmetry']): boolean =>
	REFLECTED_SYMMETRIES.includes(symmetry);

/**
 * The angle the authored run is expected to span.
 *
 * A reflected shape pairs the run with its mirror, so the run covers half the
 * wedge and the pair covers the whole one. An unreflected shape's run must
 * cover the wedge by itself.
 */
export const radialUnitAngle = ({
	symmetry,
	symmetryNumber
}: Pick<ShapeConfig, 'symmetry' | 'symmetryNumber'>): number => {
	const n = Math.max(1, symmetryNumber);
	return isReflectedSymmetry(symmetry) ? Math.PI / n : (Math.PI * 2) / n;
};

const angleOf = (point: PointConfig2): number => Math.atan2(point.y, point.x);

const rotatePoint = (point: PointConfig2, angle: number): PointConfig2 => ({
	...point,
	x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
	y: point.x * Math.sin(angle) + point.y * Math.cos(angle)
});

/** Mirror across the ray at `phi`: a point at θ maps to 2φ − θ, radius unchanged. */
const mirrorPointAboutRay = (point: PointConfig2, phi: number): PointConfig2 =>
	rotatePoint(point, 2 * phi - 2 * angleOf(point));

const mapRun = (
	curves: BezierConfig[],
	map: (point: PointConfig2) => PointConfig2
): BezierConfig[] =>
	curves.map((curve) => ({
		...curve,
		points: curve.points.map(map) as BezierConfig['points']
	}));

const rotateRun = (curves: BezierConfig[], angle: number): BezierConfig[] =>
	mapRun(curves, (point) => rotatePoint(point, angle));

/**
 * The authored run mirrored so it continues where the run left off.
 *
 * Mirroring about the ray through the run's own end point leaves that point
 * fixed, so the mirrored run touches the forward run exactly there — but it
 * *ends* at the shared point rather than starting there, so both the points
 * within each curve and the curves themselves are reversed.
 */
const reflectedRun = (curves: BezierConfig[]): BezierConfig[] => {
	const lastCurve = curves[curves.length - 1];
	const phi = angleOf(lastCurve.points[3]);
	return curves
		.map((curve) => ({
			...curve,
			points: curve.points
				.map((point) => mirrorPointAboutRay(point, phi))
				.reverse() as BezierConfig['points']
		}))
		.reverse();
};

/**
 * One entry per emitted side, in generation order.
 *
 * A "side" is the authored run as authored — so a reflected shape emits two
 * sides per repeat (the run and its mirror), and a 7-fold radial-lateral shape
 * has 14 sides.
 */
export const radialSideCurveConfigs = (config: ShapeConfig): BezierConfig[][] => {
	const { symmetry, symmetryNumber, curves } = config;
	if (curves.length === 0) return [];

	const repeats = Math.max(1, symmetryNumber);
	const wedge = (Math.PI * 2) / repeats;
	const reflect = isReflectedSymmetry(symmetry);
	const mirrored = reflect ? reflectedRun(curves) : undefined;

	const sides: BezierConfig[][] = [];
	for (let i = 0; i < repeats; i++) {
		sides.push(rotateRun(curves, wedge * i));
		if (mirrored) sides.push(rotateRun(mirrored, wedge * i));
	}
	return sides;
};

/** The whole cross-section as one continuous run of curves. */
export const radialShapeCurveConfigs = (config: ShapeConfig): BezierConfig[] =>
	radialSideCurveConfigs(config).flat();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/lib/geometry/__tests__/radial-shape.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Rebuild `generateRadialShape` on the shared module**

In `src/lib/generate-shape.ts`, **delete** the entire `rotatedCurve` function (lines 150-184) — it has no other caller — and **replace** `generateRadialShape` (lines 186-205) with:

```ts
const toCubicBezier = (curve: BezierConfig): CubicBezierCurve =>
	new CubicBezierCurve(
		new Vector2(curve.points[0].x, curve.points[0].y),
		new Vector2(curve.points[1].x, curve.points[1].y),
		new Vector2(curve.points[2].x, curve.points[2].y),
		new Vector2(curve.points[3].x, curve.points[3].y)
	);

const generateRadialShape = (config: ShapeConfig): CurvePath<Vector2> => {
	const shape = new CurvePath<Vector2>();
	radialShapeCurveConfigs(config).forEach((curve) => shape.add(toCubicBezier(curve)));
	return shape;
};

/**
 * The cross-section split into one `CurvePath` per side, for `divideSide`
 * sampling and for the editor preview. Sides are in the same order
 * `generateRadialShape` emits them, so sampling order matches geometry order.
 */
export const radialSideCurvePaths = (config: ShapeConfig): CurvePath<Vector2>[] =>
	radialSideCurveConfigs(config).map((side) => {
		const path = new CurvePath<Vector2>();
		side.forEach((curve) => path.add(toCubicBezier(curve)));
		return path;
	});
```

Add the import near the other `$lib` imports:

```ts
import { radialShapeCurveConfigs, radialSideCurveConfigs } from './geometry/radial-shape';
```

`LineCurve` may now be an unused import from `three` — remove it from the import list only if `eslint` flags it.

- [ ] **Step 6: Verify the generator is unchanged for radial and asymmetric**

Run: `npx jest 2>&1 | tail -5`
Expected: 87 suites / 675 tests passing. `depth-curve-baseline.test.ts` exercises `generateLevelPrototype` through the default `radial` config and its 66 snapshots cover generated geometry — if any snapshot changes for a `radial` or `asymmetric` config, the refactor is wrong. Do **not** update snapshots to make them pass; investigate instead.

Run: `npm run check 2>&1 | tail -1`
Expected: `434 ERRORS` — unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/lib/geometry/radial-shape.ts src/lib/geometry/__tests__/radial-shape.test.ts src/lib/generate-shape.ts
git commit -m "fix(geometry): correct radial-lateral repetition, extract shared module

rotatedCurve mirrored about the ray at wedge/2 measured from angle 0 and never
reversed traversal, so a reflected side ran backwards from the wrong place —
consecutive curves sat 200 units apart on the radius-100 default at 7 sides.
Mirror about the ray through the run's own end point and reverse traversal
instead, and span a half wedge when reflected so run + mirror fill the wedge.

Extracted into src/lib/geometry/radial-shape.ts so the 3D generator and the
editor preview share one definition of the repetition. radial and asymmetric
output is bit-identical to before."
```

---

## Task 3: Half-wedge authoring for reflected symmetries

Task 2 made the generator expect a half-wedge run for `lateral` / `radial-lateral`. The default-config generator and the editor's end-lock still assume a full wedge, so a newly created reflected shape would not close. This task aligns them.

**Files:**
- Modify: `src/lib/shades-config.ts:155-189`
- Modify: `src/components/modal/editor/GlobuleCrossSection.svelte`
- Modify: `src/lib/geometry/__tests__/radial-shape.test.ts` (add a case)

**Interfaces:**
- Consumes: `radialUnitAngle` from Task 2.
- Produces: `generateDefaultRadialShapeConfig(symmetryNumber, sampleMethod, symmetry?)` — new optional third parameter defaulting to `'radial'`.

- [ ] **Step 1: Write the failing test**

Add this import to the **top** of `src/lib/geometry/__tests__/radial-shape.test.ts`, alongside the existing imports (not mid-file — ESM imports must be hoisted):

```ts
import { generateDefaultRadialShapeConfig } from '$lib/shades-config';
```

Then append this block to the end of the same file:

```ts
describe('generateDefaultRadialShapeConfig', () => {
	const maxGapOf = (config: ShapeConfig) => maxJointGap(radialShapeCurveConfigs(config));

	it('produces a closed outline for an unreflected default', () => {
		const config = generateDefaultRadialShapeConfig(7, { method: 'divideCurve', divisions: 4 });
		expect(config.symmetry).toBe('radial');
		expect(maxGapOf(config)).toBeLessThan(1e-9);
	});

	it('produces a closed outline for a reflected default', () => {
		// Regression: the default run used to span a full wedge regardless of
		// symmetry, so a radial-lateral shape overshot and never closed.
		const config = generateDefaultRadialShapeConfig(
			7,
			{ method: 'divideCurve', divisions: 4 },
			'radial-lateral'
		);
		expect(config.symmetry).toBe('radial-lateral');
		expect(maxGapOf(config)).toBeLessThan(1e-9);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/lib/geometry/__tests__/radial-shape.test.ts -t "reflected default"`
Expected: FAIL — the gap is large (the run spans a full wedge instead of half).

- [ ] **Step 3: Make the default symmetry-aware**

In `src/lib/shades-config.ts`, replace `generateDefaultRadialShapeConfig` (lines 155-189) with:

```ts
export const generateDefaultRadialShapeConfig = (
	symmetryNumber: number,
	sampleMethod: CurveSampleMethod,
	symmetry: ShapeConfig['symmetry'] = 'radial'
): ShapeConfig => {
	// A reflected shape pairs the authored run with its mirror, so the run spans
	// half a wedge. Authoring a full wedge there would overshoot and never close.
	const segmentAngle = radialUnitAngle({ symmetry, symmetryNumber });
	return {
		type: 'ShapeConfig',
		symmetry,
		symmetryNumber,
		sampleMethod,
		curves: [
			{
				type: 'BezierConfig',
				points: [
					{ type: 'PointConfig2', x: 0, y: 100 },
					{
						type: 'PointConfig2',
						x: -Math.sin(segmentAngle / 6) * 100 * 1.5,
						y: Math.cos(segmentAngle / 6) * 100 * 1.5
					},
					{
						type: 'PointConfig2',
						x: -Math.sin((segmentAngle * 5) / 6) * 100 * 1.5,
						y: Math.cos((segmentAngle * 5) / 6) * 100 * 1.5
					},
					{
						type: 'PointConfig2',
						x: -Math.sin(segmentAngle) * 100,
						y: Math.cos(segmentAngle) * 100
					}
				]
			}
		]
	};
};
```

Add to the imports at the top of `shades-config.ts`:

```ts
import { radialUnitAngle } from './geometry/radial-shape';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/lib/geometry/__tests__/radial-shape.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Pass the symmetry through from the editor**

In `src/components/modal/editor/GlobuleCrossSection.svelte`, the two call sites currently drop the symmetry, so switching to `radial-lateral` rebuilt a `radial`-shaped run.

In `setSymmetryNumber`, replace:

```ts
			return {
				...generateDefaultRadialShapeConfig(symmetryNumber, shape.sampleMethod),
				symmetry: shape.symmetry
			};
```

with:

```ts
			return generateDefaultRadialShapeConfig(
				symmetryNumber,
				shape.sampleMethod,
				shape.symmetry
			);
```

In `setSymmetry`, replace:

```ts
			return isNowRadial
				? {
						...generateDefaultRadialShapeConfig(
							Math.max(3, shape.symmetryNumber),
							shape.sampleMethod
						),
						symmetry: value
					}
				: { ...generateDefaultAsymmetricShapeConfig(shape.sampleMethod), symmetry: value };
```

with:

```ts
			return isNowRadial
				? generateDefaultRadialShapeConfig(
						Math.max(3, shape.symmetryNumber),
						shape.sampleMethod,
						value
					)
				: { ...generateDefaultAsymmetricShapeConfig(shape.sampleMethod), symmetry: value };
```

Note the `wasRadial === isNowRadial` early return above these lines returns `{ ...shape, symmetry: value }` — switching between `radial` and `radial-lateral` takes that path and keeps the existing curves, which now span the wrong angle. Change that early return to rebuild when the reflected-ness changes:

```ts
			const wasRadial = shape.symmetry === 'radial' || shape.symmetry === 'radial-lateral';
			const isNowRadial = value === 'radial' || value === 'radial-lateral';
			// Reflected and unreflected runs span different angles (half wedge vs
			// whole), so crossing that boundary needs a rebuild too, not just a
			// relabel.
			const reflectionChanged =
				isReflectedSymmetry(shape.symmetry) !== isReflectedSymmetry(value);
			if (wasRadial === isNowRadial && !reflectionChanged) return { ...shape, symmetry: value };
```

Add to the component's imports:

```ts
	import { isReflectedSymmetry, radialUnitAngle } from '$lib/geometry/radial-shape';
```

- [ ] **Step 6: Make the end lock and side length use the unit angle**

Still in `GlobuleCrossSection.svelte`, `wedgeAngle` feeds `radialEndLock`, which pins the run's two terminal anchors to the rays bounding it. It must be the *run's* span, not the wedge.

Replace:

```ts
	/** The angle one symmetry wedge spans. */
	let wedgeAngle = $derived((Math.PI * 2) / (shapeConfig?.symmetryNumber || 1));
```

with:

```ts
	/**
	 * The angle the authored run spans — half a wedge when the shape is
	 * reflected, a whole wedge otherwise. This is what the terminal anchors are
	 * locked to, so it must match what the generator expects.
	 */
	let unitAngle = $derived(
		shapeConfig
			? radialUnitAngle(shapeConfig)
			: (Math.PI * 2) / (shapeConfig?.symmetryNumber || 1)
	);
```

Update the `limits` derivation:

```ts
	let limits = $derived(
		isRadial ? [radialEndLock(unitAngle), neighborPointMatch] : [neighborPointMatch]
	);
```

And in `setSideLength`, replace the two lines that assume a full wedge:

```ts
		const alpha = Math.PI / shapeConfig.symmetryNumber;
		const radius = value / (2 * Math.sin(alpha));
```

with:

```ts
		// `unitAngle` is the chord's subtended angle; half of it gives the
		// right-triangle angle relating chord to radius.
		const alpha = unitAngle / 2;
		const radius = value / (2 * Math.sin(alpha));
```

and the terminal-anchor placement:

```ts
			curves[0].points[0] = { ...curves[0].points[0], ...pointOnRay(radius, 0) } as PointConfig2;
			curves[last].points[3] = {
				...curves[last].points[3],
				...pointOnRay(radius, unitAngle)
			} as PointConfig2;
```

- [ ] **Step 7: Verify**

Run: `npx jest 2>&1 | tail -5`
Expected: 87 suites passing, 677 tests (675 + the 2 added here plus Task 2's 6 — confirm the total only grows).

Run: `npm run check 2>&1 | tail -1`
Expected: `434 ERRORS`.

- [ ] **Step 8: Manually confirm reflected shapes close**

In `/designer2`, open Globule Cross Section, set Symmetry to `radial-lateral` with 7 sides. The orange preview must be a closed, lobed outline with no tangential loops and no uncovered center wedge.

- [ ] **Step 9: Commit**

```bash
git add src/lib/shades-config.ts src/components/modal/editor/GlobuleCrossSection.svelte src/lib/geometry/__tests__/radial-shape.test.ts
git commit -m "fix(cross-section): author reflected runs across a half wedge

generateDefaultRadialShapeConfig always built a full-wedge run, and the editor
dropped the symmetry when rebuilding, so a radial-lateral shape overshot its
wedge and never closed. Thread symmetry through, span radialUnitAngle, and lock
terminal anchors and side length to the run's span rather than the wedge."
```

---

## Task 4: `deriveDistance` helper

Small and independent; landed early so Task 10 can consume it.

**Files:**
- Modify: `src/lib/cut-pattern/page-layout/units.ts`
- Create: `src/lib/cut-pattern/page-layout/__tests__/distance.test.ts`

**Interfaces:**
- Produces: `deriveDistance(a: Vector3, b: Vector3, pageScale: number): { mm: number; inch: number }`

- [ ] **Step 1: Write the failing test**

Create `src/lib/cut-pattern/page-layout/__tests__/distance.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { Vector3 } from 'three';

import { deriveDistance, MM_PER_INCH } from '../units';

describe('deriveDistance', () => {
	it('converts a straight-line 3D distance into page units', () => {
		// 3-4-5 triangle in xy, so the distance is exactly 5 model units.
		const result = deriveDistance(new Vector3(0, 0, 0), new Vector3(3, 4, 0), 1);
		expect(result.mm).toBeCloseTo(5, 9);
		expect(result.inch).toBeCloseTo(5 / MM_PER_INCH, 9);
	});

	it('divides by pageScale, which is pattern units per mm', () => {
		const result = deriveDistance(new Vector3(0, 0, 0), new Vector3(0, 0, 10), 2);
		expect(result.mm).toBeCloseTo(5, 9);
	});

	it('measures across all three axes', () => {
		const result = deriveDistance(new Vector3(1, 2, 3), new Vector3(4, 6, 15), 1);
		expect(result.mm).toBeCloseTo(13, 9);
	});

	it('is order independent', () => {
		const a = new Vector3(-2, 7, 1);
		const b = new Vector3(5, -3, 9);
		expect(deriveDistance(a, b, 1.7).mm).toBeCloseTo(deriveDistance(b, a, 1.7).mm, 9);
	});

	it('stays finite when pageScale is zero rather than returning Infinity', () => {
		// Saved configs can carry a zero pageScale; a NaN/Infinity here would
		// poison the readout in the Pattern Layout panel.
		const result = deriveDistance(new Vector3(0, 0, 0), new Vector3(3, 4, 0), 0);
		expect(Number.isFinite(result.mm)).toBe(true);
		expect(Number.isFinite(result.inch)).toBe(true);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/lib/cut-pattern/page-layout/__tests__/distance.test.ts`
Expected: FAIL — `deriveDistance is not a function`.

- [ ] **Step 3: Implement it**

Append to `src/lib/cut-pattern/page-layout/units.ts`:

```ts
export type DerivedDistance = { mm: number; inch: number };

/**
 * Straight-line 3D distance between two model points, in real-world page units.
 * Mirrors `derivePageDimensions`: pageScale is pattern units per mm.
 *
 * A zero pageScale (possible in older saved configs) would otherwise produce
 * Infinity and render as a broken readout, so it falls back to 1:1.
 */
export const deriveDistance = (a: Vector3, b: Vector3, pageScale: number): DerivedDistance => {
	const scale = pageScale || 1;
	const mm = a.distanceTo(b) / scale;
	return { mm, inch: mmToInch(mm) };
};
```

`Vector3` is already imported at the top of the file.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/lib/cut-pattern/page-layout/__tests__/distance.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cut-pattern/page-layout/units.ts src/lib/cut-pattern/page-layout/__tests__/distance.test.ts
git commit -m "feat(page-layout): add deriveDistance for arbitrary two-point measurements"
```

---

## Task 5: Fix `divideCurvePath` (By Whole Curve)

**Files:**
- Modify: `src/lib/generate-shape.ts:249-272` (`generateRadialShapeLevelPrototype`)
- Create: `src/lib/__tests__/cross-section-sampling.test.ts`

**Interfaces:**
- Consumes: `generateLevelPrototype(config: ShapeConfig, levelConfig: LevelConfig)` (already exported).
- Produces: nothing new.

### What is wrong today

```ts
} else if (sampleMethod.method === 'divideCurvePath') {
	const totalLength = shape.getLength();
	shape.curves.forEach((curve) => {
		const ratio = curve.getLength() / totalLength;
		points.push(...curve.getPoints(Math.ceil(sampleMethod.divisions * ratio)).slice(1));
	});
}
```

Three faults: it divides per sub-curve rather than across the joined path; `Curve.getPoints` is parameter-space, not arc-length; and `Math.ceil` per curve overshoots the requested total. The output stays radially symmetric, which is the opposite of the method's purpose.

The required behavior is to join every bezier of the whole cross-section and divide *that* evenly by arc length, deliberately producing non-radially-symmetric boundaries. `generateRadialShape` already returns exactly that joined `CurvePath`, and `CurvePath.getPoint(t)` already maps `t` through cumulative curve lengths — so one call does it.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/cross-section-sampling.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { Vector2 } from 'three';

import { generateLevelPrototype } from '../generate-shape';
import { generateDefaultRadialShapeConfig } from '../shades-config';
import { defaultLevelConfigForTest } from './cross-section-sampling.fixtures';
import type { CurveSampleMethod, ShapeConfig } from '../types';

const shapeWith = (
	sampleMethod: CurveSampleMethod,
	symmetryNumber = 7,
	symmetry: ShapeConfig['symmetry'] = 'radial'
): ShapeConfig => generateDefaultRadialShapeConfig(symmetryNumber, sampleMethod, symmetry);

const verticesOf = (shape: ShapeConfig): Vector2[] => {
	const prototype = generateLevelPrototype(shape, defaultLevelConfigForTest());
	if (Array.isArray(prototype)) throw new Error('expected a single level prototype');
	return prototype.vertices;
};

/** Gap lengths between consecutive vertices, wrapping around the closed outline. */
const spans = (vertices: Vector2[]): number[] =>
	vertices.map((v, i) => v.distanceTo(vertices[(i - 1 + vertices.length) % vertices.length]));

describe('divideCurvePath (By Whole Curve)', () => {
	it('produces exactly `divisions` vertices for the whole cross-section', () => {
		// Not divisions-per-curve: the entire joined path is divided once.
		expect(verticesOf(shapeWith({ method: 'divideCurvePath', divisions: 30 }))).toHaveLength(30);
		expect(verticesOf(shapeWith({ method: 'divideCurvePath', divisions: 7 }))).toHaveLength(7);
	});

	it('spaces vertices evenly by arc length across the joined path', () => {
		const s = spans(verticesOf(shapeWith({ method: 'divideCurvePath', divisions: 60 })));
		const mean = s.reduce((a, b) => a + b, 0) / s.length;
		// Chord vs arc introduces a little error on a curved path; 2% is ample
		// for even spacing while still failing the old per-curve behaviour.
		for (const span of s) expect(Math.abs(span - mean) / mean).toBeLessThan(0.02);
	});

	it('does not force radial symmetry when divisions do not divide the side count', () => {
		// 10 divisions over 7 sides cannot land a vertex on every side boundary,
		// which is the whole point of this method. The old implementation
		// ceil'd per curve and stayed symmetric.
		const vertices = verticesOf(shapeWith({ method: 'divideCurvePath', divisions: 10 }, 7));
		expect(vertices).toHaveLength(10);
		const radii = vertices.map((v) => Math.hypot(v.x, v.y));
		expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(1e-6);
	});
});
```

Create the fixture at `src/lib/__tests__/cross-section-sampling.fixtures.ts` so the level config is shared with Task 6's additions:

```ts
import type { LevelConfig } from '../types';

/**
 * A minimal level config for exercising `generateLevelPrototype`. Only
 * `levelPrototypeSampleMethod` matters here; the silhouette fields are along
 * for the ride.
 */
export const defaultLevelConfigForTest = (): LevelConfig => ({
	type: 'LevelConfig',
	silhouetteSampleMethod: { method: 'divideCurve', divisions: 10 },
	levelPrototypeSampleMethod: 'curve',
	levelCount: 11,
	levelOffsets: []
});
```

If `LevelConfig` requires fields not listed, copy the missing ones verbatim from `defaultLevelConfig()` in `src/lib/shades-config.ts:191`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/lib/__tests__/cross-section-sampling.test.ts`
Expected: FAIL — the vertex count is not `divisions` (the old code ceils per curve, so 30 divisions over 7 curves yields more than 30).

- [ ] **Step 3: Replace the `divideCurvePath` branch**

In `generateRadialShapeLevelPrototype`, replace:

```ts
	} else if (sampleMethod.method === 'divideCurvePath') {
		const totalLength = shape.getLength();
		shape.curves.forEach((curve) => {
			const ratio = curve.getLength() / totalLength;
			points.push(...curve.getPoints(Math.ceil(sampleMethod.divisions * ratio)).slice(1)); // removes first point from each curve to avoid dupes
		});
	}
```

with:

```ts
	} else if (sampleMethod.method === 'divideCurvePath') {
		// Divide the ENTIRE joined cross-section evenly by arc length, not each
		// sub-curve proportionally. CurvePath.getPoint maps t through cumulative
		// curve lengths, so getSpacedPoints is arc-length-even across the whole
		// path. The outline is closed, so the last point repeats the first —
		// slice(1) drops the duplicate and leaves exactly `divisions` vertices.
		// Boundaries deliberately do not land on side boundaries.
		points.push(...shape.getSpacedPoints(sampleMethod.divisions).slice(1));
	}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/lib/__tests__/cross-section-sampling.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Check for snapshot fallout**

Run: `npx jest 2>&1 | tail -8`

If a snapshot covering a `divideCurvePath` config changed, that is the intended fix, not a regression — but confirm by reading the diff that the vertex count moved to exactly `divisions` and spacing became even. Only then run `npx jest -u` and mention the updated snapshots in the commit message. Snapshots covering `divideCurve` configs must **not** change.

Run: `npm run check 2>&1 | tail -1`
Expected: `434 ERRORS`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/generate-shape.ts src/lib/__tests__/cross-section-sampling.test.ts src/lib/__tests__/cross-section-sampling.fixtures.ts
git commit -m "fix(cross-section): divide the whole curve path evenly by arc length

divideCurvePath divided each sub-curve proportionally with a per-curve ceil,
using parameter-space getPoints — so it overshot the requested division count
and stayed radially symmetric, the opposite of the method's purpose. Divide the
joined CurvePath once with getSpacedPoints instead."
```

---

## Task 6: Add `divideSide` (By Side)

**Files:**
- Modify: `src/lib/types.ts:947-956`
- Modify: `src/lib/generate-shape.ts` (`generateRadialShapeLevelPrototype`)
- Modify: `src/components/modal/editor/GlobuleCrossSection.svelte`
- Modify: `src/lib/__tests__/cross-section-sampling.test.ts`

**Interfaces:**
- Consumes: `radialSideCurvePaths` (Task 2), `radialSideCurveConfigs` (Task 2).
- Produces: `CurveSampleMethod` gains `{ method: 'divideSide'; divisions: number }`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/__tests__/cross-section-sampling.test.ts`:

```ts
describe('divideSide (By Side)', () => {
	it('divides each side independently: sides x divisions vertices', () => {
		// The spec's worked example: 7 sides, divisions 3 -> 21 bands.
		expect(verticesOf(shapeWith({ method: 'divideSide', divisions: 3 }, 7))).toHaveLength(21);
		expect(verticesOf(shapeWith({ method: 'divideSide', divisions: 5 }, 4))).toHaveLength(20);
	});

	it('counts the authored run as one side, so a reflected shape has 2n sides', () => {
		// Decided: a side is the run as authored, not the run plus its mirror.
		// 7-fold radial-lateral therefore has 14 sides -> 14 * 3 = 42.
		expect(
			verticesOf(shapeWith({ method: 'divideSide', divisions: 3 }, 7, 'radial-lateral'))
		).toHaveLength(42);
	});

	it('stays radially symmetric, unlike divideCurvePath', () => {
		// Every side gets the same treatment, so vertex radii repeat with period
		// `divisions`.
		const divisions = 4;
		const vertices = verticesOf(shapeWith({ method: 'divideSide', divisions }, 6));
		const radii = vertices.map((v) => Math.hypot(v.x, v.y));
		for (let i = 0; i < divisions; i++) {
			expect(radii[i]).toBeCloseTo(radii[i + divisions], 6);
		}
	});

	it('spaces vertices evenly within each side', () => {
		// Every span is one `divisions`-th of some side's arc — including the one
		// crossing a side boundary, because slice(1) makes each side's first
		// sample sit one step in. All sides are congruent here, so all spans match.
		const divisions = 8;
		const s = spans(verticesOf(shapeWith({ method: 'divideSide', divisions }, 5)));
		const mean = s.reduce((a, b) => a + b, 0) / s.length;
		for (const span of s) expect(Math.abs(span - mean) / mean).toBeLessThan(0.02);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/lib/__tests__/cross-section-sampling.test.ts -t divideSide`
Expected: FAIL — `divideSide` is not a valid method, so no branch matches and `vertices` is empty.

- [ ] **Step 3: Add the type**

In `src/lib/types.ts`, replace lines 947-956 with:

```ts
export type CurveSampleMethod =
	| { method: 'divideCurvePath'; divisions: number }
	| { method: 'divideCurve'; divisions: number }
	| { method: 'divideSide'; divisions: number }
	| { method: 'preserveAspectRatio'; divisions: number }
	| { method: 'spineCurve'; divisions: number };

export type CurveSampleMethodMethod = CurveSampleMethod['method'];

export const isCurveSampleMethodMethod = (m: string): m is CurveSampleMethodMethod =>
	['divideCurvePath', 'divideCurve', 'divideSide', 'preserveAspectRatio', 'spineCurve'].includes(
		m
	);
```

- [ ] **Step 4: Add the sampling branch**

In `generateRadialShapeLevelPrototype`, the function currently normalizes the config into a local before building the shape:

```ts
	const shape = generateRadialShape(normalizeConfigPoints(config, { normalizationRatio: 1 / 200 }));
```

Hoist the normalized config so the new branch can reuse it:

```ts
	const normalized = normalizeConfigPoints(config, { normalizationRatio: 1 / 200 });
	const shape = generateRadialShape(normalized);
```

Then add, after the `divideCurvePath` branch:

```ts
	} else if (sampleMethod.method === 'divideSide') {
		// Join each side's beziers into their own CurvePath and divide that
		// evenly by arc length. A "side" is the authored curve run, so a
		// reflected shape has two sides per symmetry repeat. Total vertices are
		// sides * divisions, and the result stays radially symmetric.
		radialSideCurvePaths(normalized).forEach((side) => {
			points.push(...side.getSpacedPoints(sampleMethod.divisions).slice(1));
		});
	}
```

`radialSideCurvePaths` is defined in this same file by Task 2, so no import is needed.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest src/lib/__tests__/cross-section-sampling.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Add the UI option**

In `src/components/modal/editor/GlobuleCrossSection.svelte`, replace the Sampling select's options:

```svelte
						<select value={shapeConfig.sampleMethod.method} onchange={setSampleMethod}>
							<option value="divideCurvePath">By Whole Curve</option>
							<option value="divideCurve">By Sub-curve</option>
							<option value="divideSide">By Side</option>
						</select>
```

- [ ] **Step 7: Verify**

Run: `npx jest 2>&1 | tail -5`
Expected: all suites passing, no snapshot changes (nothing defaults to `divideSide`).

Run: `npm run check 2>&1 | tail -1`
Expected: `434 ERRORS`. If the count rose, a `switch`/`if` chain elsewhere is now non-exhaustive over `CurveSampleMethod` — find it via the new error text and handle `divideSide` there.

- [ ] **Step 8: Manually confirm band counts**

In `/designer2`, Globule Cross Section: `radial`, Sides 7, Sampling `By Side`, Divisions 3. The generated globule must have 21 bands around its circumference. Switching Sampling to `By Whole Curve` with Divisions 10 must give 10, with visibly uneven side boundaries.

- [ ] **Step 9: Commit**

```bash
git add src/lib/types.ts src/lib/generate-shape.ts src/components/modal/editor/GlobuleCrossSection.svelte src/lib/__tests__/cross-section-sampling.test.ts
git commit -m "feat(cross-section): add divideSide sampling

Joins each side's beziers into their own CurvePath and divides it evenly by arc
length, giving sides * divisions vertices while staying radially symmetric. A
side is the authored curve run, so a reflected shape has two per repeat."
```

---

## Task 7: Fix the cross-section preview

**Files:**
- Modify: `src/components/modal/editor/curve-preview.ts`
- Modify: `src/components/modal/editor/PathEditor.svelte:35-45,214-219`
- Modify: `src/components/modal/editor/GlobuleCrossSection.svelte`
- Create: `src/components/modal/editor/__tests__/curve-preview.test.ts`

**Interfaces:**
- Consumes: `radialShapeCurveConfigs` (Task 2).
- Produces: `PathEditorOverlayContext` gains `modelCurveDef: BezierConfig[]` and `toDisplay(curves: BezierConfig[]): BezierConfig[]`.

### What is wrong today

`PathEditor` renders in "display space" — with `flipY`, the model reflected about the viewBox's horizontal midline. For the Globule Cross Section editor config (`contentBounds.top = -100`, `padding = 100`) that midline is exactly `y = 0`, so the transform is `y → -y`.

`PathEditor.svelte:215` hands overlay snippets `curveDef: displayCurveDef` — already reflected. `radializeCurves` then rotates copies by `+angle * i`. Mirroring is orientation-reversing, so where the model has `p3 = rot(p0, +a)` (copies chain end-to-start), display space has `p0' = rot(p3', +a)` — copy *i+1* starts a **full wedge angle** past where copy *i* ended. Measured on the radius-100 default at 7 sides, the gap is **156.4 units at every joint**: seven tangential lobes and an uncovered center wedge.

`pathFromCurves` hides it by emitting `M p0` once and chaining `C` segments, so each gap is silently bridged by the next bezier bulging outward.

The fix is to compose in model space and convert to display space only for rendering, plus make `pathFromCurves` break honestly so a genuinely disjoint config can never masquerade as a loop again.

- [ ] **Step 1: Write the failing test**

Create `src/components/modal/editor/__tests__/curve-preview.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';

import { pathFromCurves, radializeCurves } from '../curve-preview';
import { radialShapeCurveConfigs } from '$lib/geometry/radial-shape';
import { generateDefaultRadialShapeConfig } from '$lib/shades-config';
import type { BezierConfig } from '$lib/types';

const sampleMethod = { method: 'divideCurve', divisions: 4 } as const;

const maxJointGap = (curves: BezierConfig[]): number =>
	Math.max(
		...curves.map((curve, i) => {
			const previous = curves[(i - 1 + curves.length) % curves.length];
			return Math.hypot(
				curve.points[0].x - previous.points[3].x,
				curve.points[0].y - previous.points[3].y
			);
		})
	);

describe('radializeCurves', () => {
	it('closes the outline for an unreflected shape', () => {
		// Regression: the preview used to be handed y-flipped coordinates and
		// rotate the wrong way round, leaving a 156-unit gap at every joint on
		// the radius-100 default — the seven tangential lobes in the bug report.
		const config = generateDefaultRadialShapeConfig(7, sampleMethod);
		const preview = radializeCurves(config.curves, {
			symmetryNumber: 7,
			symmetry: 'radial'
		});
		expect(maxJointGap(preview)).toBeLessThan(1e-9);
	});

	it('closes the outline for a reflected shape', () => {
		const config = generateDefaultRadialShapeConfig(7, sampleMethod, 'radial-lateral');
		const preview = radializeCurves(config.curves, {
			symmetryNumber: 7,
			symmetry: 'radial-lateral'
		});
		expect(maxJointGap(preview)).toBeLessThan(1e-9);
	});

	it('draws exactly what the generator generates', () => {
		// The preview and the 3D geometry must not be able to drift apart.
		for (const symmetry of ['radial', 'radial-lateral'] as const) {
			for (const n of [3, 5, 7]) {
				const config = generateDefaultRadialShapeConfig(n, sampleMethod, symmetry);
				const preview = radializeCurves(config.curves, { symmetryNumber: n, symmetry });
				expect(preview).toEqual(radialShapeCurveConfigs(config));
			}
		}
	});
});

describe('pathFromCurves', () => {
	const curveFrom = (x0: number, y0: number, x3: number, y3: number): BezierConfig => ({
		type: 'BezierConfig',
		points: [
			{ type: 'PointConfig2', x: x0, y: y0 },
			{ type: 'PointConfig2', x: x0, y: y0 },
			{ type: 'PointConfig2', x: x3, y: y3 },
			{ type: 'PointConfig2', x: x3, y: y3 }
		]
	});

	it('chains contiguous curves with a single move', () => {
		const d = pathFromCurves([curveFrom(0, 0, 10, 0), curveFrom(10, 0, 10, 10)]);
		expect(d.match(/M/g)).toHaveLength(1);
	});

	it('starts a new subpath at a genuine discontinuity instead of bridging it', () => {
		// A silent bridge is what turned gaps into phantom loops. A break must
		// look like a break.
		const d = pathFromCurves([curveFrom(0, 0, 10, 0), curveFrom(50, 50, 60, 50)]);
		expect(d.match(/M/g)).toHaveLength(2);
	});

	it('tolerates floating-point drift at a joint', () => {
		const d = pathFromCurves([curveFrom(0, 0, 10, 0), curveFrom(10 + 1e-12, 0, 10, 10)]);
		expect(d.match(/M/g)).toHaveLength(1);
	});

	it('returns an empty string for no curves', () => {
		expect(pathFromCurves([])).toBe('');
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/components/modal/editor/__tests__/curve-preview.test.ts`
Expected: FAIL — `radializeCurves` does not accept a `symmetry` option, and the joint gaps are large.

- [ ] **Step 3: Delegate `radializeCurves` to the shared module**

In `src/components/modal/editor/curve-preview.ts`, replace `radializeCurves` (and the now-unused `reverseReflectCurves` / `rotateCurvesAroundOrigin` helpers, if nothing else imports them — check with `grep -rn "reverseReflectCurves\|rotateCurvesAroundOrigin" src` and keep any that are still used) with:

```ts
import { radialShapeCurveConfigs } from '$lib/geometry/radial-shape';
import type { ShapeConfig } from '$lib/types';

/**
 * Repeat a unit curve run around the origin to preview a radially symmetric
 * cross-section.
 *
 * Delegates to the same module the 3D generator uses, so the preview cannot
 * disagree with the geometry. It previously reimplemented the repetition with a
 * different reflection and was handed y-flipped coordinates, which reversed the
 * rotation direction and left a full wedge gap at every joint.
 *
 * Caller must pass MODEL-space curves. Convert the result for display
 * afterwards (see `toDisplay` on the PathEditor overlay context).
 */
export const radializeCurves = (
	curves: BezierConfig[],
	{
		symmetryNumber,
		symmetry
	}: { symmetryNumber: number; symmetry: ShapeConfig['symmetry'] }
): BezierConfig[] =>
	radialShapeCurveConfigs({
		type: 'ShapeConfig',
		symmetry,
		symmetryNumber,
		sampleMethod: { method: 'divideCurve', divisions: 1 },
		curves
	});
```

- [ ] **Step 4: Make `pathFromCurves` break honestly**

Still in `curve-preview.ts`, replace `curveSegments` and `pathFromCurves` with:

```ts
/** Points closer than this at a joint are the same point, modulo float drift. */
const JOINT_EPSILON = 1e-9;

const isContiguous = (previous: BezierConfig, next: BezierConfig): boolean =>
	Math.hypot(
		next.points[0].x - previous.points[3].x,
		next.points[0].y - previous.points[3].y
	) <= JOINT_EPSILON;

const cubicSegment = (curve: BezierConfig): string =>
	`C ${curve.points[1].x} ${curve.points[1].y}, ${curve.points[2].x} ${curve.points[2].y}, ${curve.points[3].x} ${curve.points[3].y}`;

/**
 * `M p0 C p1 p2 p3 …` — the outline of a curve run.
 *
 * A `C` continues from the current point, so chaining across a gap silently
 * bridges it and the bridging bezier bulges outward as a phantom loop. Emit a
 * fresh `M` at a real discontinuity so a break looks like a break.
 */
export const pathFromCurves = (curves: BezierConfig[]): string => {
	if (curves.length === 0) return '';
	const parts: string[] = [`M ${curves[0].points[0].x} ${curves[0].points[0].y}`];
	curves.forEach((curve, i) => {
		if (i > 0 && !isContiguous(curves[i - 1], curve)) {
			parts.push(`M ${curve.points[0].x} ${curve.points[0].y}`);
		}
		parts.push(cubicSegment(curve));
	});
	return parts.join(' ');
};
```

`fillPathToAxis` also calls `curveSegments`. Update it to use the same joined form:

```ts
	return [
		`M ${onAxis(start)}`,
		`L ${start.x} ${start.y}`,
		curves.map(cubicSegment).join(' '),
		`L ${onAxis(end)}`,
		'Z'
	].join(' ');
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest src/components/modal/editor/__tests__/curve-preview.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Expose model space on the overlay context**

In `src/components/modal/editor/PathEditor.svelte`, extend the exported context type (around line 35):

```ts
/**
 * What an overlay snippet is handed.
 *
 * `curveDef` is the DISPLAY-space run and is live, so fills track a drag.
 * `modelCurveDef` is the same run in model space — use it for any geometry you
 * compose (rotation, reflection, radial repetition), because display space may
 * be mirrored and mirroring reverses the direction of rotation. Convert the
 * result back with `toDisplay` before emitting it as a path.
 */
export type PathEditorOverlayContext = {
	curveDef: BezierConfig[];
	modelCurveDef: BezierConfig[];
	toDisplay: (curves: BezierConfig[]) => BezierConfig[];
	canv: PathEditorCanvas;
	config: PathEditorConfig;
};
```

Keep whatever fields the existing type already declares; add the two new ones. Then extend the context value (around line 214):

```ts
	const overlayContext = $derived({
		curveDef: displayCurveDef,
		modelCurveDef: curveDef,
		toDisplay: reflectCurves,
		canv,
		config
	} as PathEditorOverlayContext);
```

`reflectCurves` is already defined at line 112 and is its own inverse, so it serves as the model → display conversion directly. It returns the input unchanged when `flipY` is false, so overlays are correct in both orientations.

- [ ] **Step 7: Rebuild the Globule Cross Section overlay in model space**

In `GlobuleCrossSection.svelte`, replace the `shapeOverlay` snippet:

```svelte
					{#snippet shapeOverlay({ modelCurveDef, toDisplay, canv }: PathEditorOverlayContext)}
						<path
							d={pathFromCurves(
								toDisplay(
									radializeCurves(modelCurveDef, {
										symmetryNumber: shapeConfig.symmetryNumber,
										symmetry: shapeConfig.symmetry
									})
								)
							)}
							fill="rgba(255,90,0,0.35)"
							stroke="rgba(0,0,0,0.4)"
							stroke-width={0.5 * canv.scale}
						/>
					{/snippet}
```

`isReflected` is now unused by the overlay — delete the `let isReflected = $derived(...)` declaration if nothing else in the component reads it (check with `grep -n isReflected src/components/modal/editor/GlobuleCrossSection.svelte`).

- [ ] **Step 8: Check other overlay consumers**

Run: `grep -rn "PathEditorOverlayContext\|overlay=\|overlayAbove=" src/components`

Every other overlay keeps using `curveDef` and is unaffected — the type only gained fields. Confirm none destructures a field that was removed.

- [ ] **Step 9: Verify**

Run: `npx jest 2>&1 | tail -5`
Expected: all suites passing.

Run: `npm run check 2>&1 | tail -1`
Expected: `434 ERRORS`.

- [ ] **Step 10: Manually confirm against the original bug**

In `/designer2`, Globule Cross Section, `radial`, Sides 7, one authored bezier. The orange preview must be a clean 7-lobed closed outline: **no tangential petals, no straight wedge cut to the center**. Repeat with `radial-lateral`, Sides 7. Drag an anchor and confirm the preview tracks continuously.

- [ ] **Step 11: Commit**

```bash
git add src/components/modal/editor/curve-preview.ts src/components/modal/editor/PathEditor.svelte src/components/modal/editor/GlobuleCrossSection.svelte src/components/modal/editor/__tests__/curve-preview.test.ts
git commit -m "fix(cross-section): draw the preview from the generator's geometry

PathEditor handed overlays y-flipped display coordinates. Mirroring reverses
orientation, so rotating copies by +angle walked the wrong way and every joint
opened a full wedge gap — 156 units on the radius-100 default at 7 sides, drawn
as tangential lobes because pathFromCurves silently bridged them with a C.

Overlays now get modelCurveDef plus a toDisplay converter and compose in model
space, radializeCurves delegates to the shared geometry module, and
pathFromCurves emits a fresh M at a real discontinuity."
```

---

## Task 8: Measurement store

**Files:**
- Create: `src/lib/stores/measurementStore.ts`
- Create: `src/lib/stores/__tests__/measurementStore.test.ts`
- Modify: `src/lib/stores/index.ts`

**Interfaces:**
- Produces:
  - `type Measurement = { id: string; a: Vector3; b: Vector3 | null }`
  - `measurements: Readable<Measurement[]>`
  - `addMeasurementPoint(point: Vector3): void`
  - `removeMeasurement(id: string): void`
  - `clearMeasurements(): void`

- [ ] **Step 1: Write the failing test**

Create `src/lib/stores/__tests__/measurementStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { get } from 'svelte/store';
import { Vector3 } from 'three';

import {
	addMeasurementPoint,
	clearMeasurements,
	measurements,
	removeMeasurement
} from '../measurementStore';

const v = (x: number, y = 0, z = 0) => new Vector3(x, y, z);

describe('measurementStore', () => {
	beforeEach(() => clearMeasurements());

	it('starts empty', () => {
		expect(get(measurements)).toEqual([]);
	});

	it('holds the first point as unmatched', () => {
		addMeasurementPoint(v(1));
		const [first] = get(measurements);
		expect(first.a.x).toBe(1);
		expect(first.b).toBeNull();
	});

	it('completes the pair on the second point', () => {
		addMeasurementPoint(v(1));
		addMeasurementPoint(v(2));
		const list = get(measurements);
		expect(list).toHaveLength(1);
		expect(list[0].b?.x).toBe(2);
	});

	it('starts a new unmatched point after a pair completes', () => {
		addMeasurementPoint(v(1));
		addMeasurementPoint(v(2));
		addMeasurementPoint(v(3));
		const list = get(measurements);
		expect(list).toHaveLength(2);
		expect(list[0].b).not.toBeNull();
		expect(list[1].b).toBeNull();
	});

	it('keeps at most one unmatched point, and it is last', () => {
		for (const x of [1, 2, 3, 4, 5]) addMeasurementPoint(v(x));
		const list = get(measurements);
		const unmatched = list.filter((m) => m.b === null);
		expect(unmatched).toHaveLength(1);
		expect(list[list.length - 1].b).toBeNull();
	});

	it('gives each measurement a distinct id', () => {
		for (const x of [1, 2, 3, 4]) addMeasurementPoint(v(x));
		const ids = get(measurements).map((m) => m.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('removes the named measurement and leaves the rest', () => {
		addMeasurementPoint(v(1));
		addMeasurementPoint(v(2));
		addMeasurementPoint(v(3));
		addMeasurementPoint(v(4));
		const [first, second] = get(measurements);
		removeMeasurement(first.id);
		const list = get(measurements);
		expect(list).toHaveLength(1);
		expect(list[0].id).toBe(second.id);
	});

	it('clears everything', () => {
		addMeasurementPoint(v(1));
		addMeasurementPoint(v(2));
		clearMeasurements();
		expect(get(measurements)).toEqual([]);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/lib/stores/__tests__/measurementStore.test.ts`
Expected: FAIL — `Cannot find module '../measurementStore'`.

- [ ] **Step 3: Implement the store**

Create `src/lib/stores/measurementStore.ts`:

```ts
/**
 * User-placed two-point measurements on the 3D model.
 *
 * Points are snapped to model vertices, and vertex identity is not stable
 * across a geometry regeneration — so these are cleared whenever the geometry
 * changes (see `bindMeasurementLifetime`). They deliberately survive pattern
 * and pattern-layout parameter changes, and are not persisted: they do not
 * survive a reload.
 */
import { derived, writable, type Readable } from 'svelte/store';
import type { Vector3 } from 'three';

export type Measurement = {
	id: string;
	a: Vector3;
	/** null while this point is still waiting for its partner (rendered magenta). */
	b: Vector3 | null;
};

const store = writable<Measurement[]>([]);

export const measurements: Readable<Measurement[]> = derived(store, ($m) => $m);

let nextId = 0;
const makeId = () => `measurement-${nextId++}`;

/**
 * Place a point. The first click opens a measurement; the next click closes it.
 * There is at most one open measurement and it is always last.
 */
export const addMeasurementPoint = (point: Vector3): void => {
	store.update((list) => {
		const open = list[list.length - 1];
		if (open && open.b === null) {
			return [...list.slice(0, -1), { ...open, b: point }];
		}
		return [...list, { id: makeId(), a: point, b: null }];
	});
};

export const removeMeasurement = (id: string): void =>
	store.update((list) => list.filter((m) => m.id !== id));

export const clearMeasurements = (): void => store.set([]);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/lib/stores/__tests__/measurementStore.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Clear on geometry change**

Measurements must be dropped when the geometry regenerates, but survive pattern and layout changes. Append to `measurementStore.ts`:

```ts
import { superGlobuleStore } from './superGlobuleStores';

/**
 * Vertex identity is not stable across regeneration, so a stored point can
 * refer to a vertex that no longer exists. Drop everything when the geometry
 * changes.
 *
 * Deliberately subscribes to `superGlobuleStore` and NOT `patternConfigStore`:
 * pattern and pattern-layout parameters must leave measurements intact.
 *
 * Subscribed once at module scope, matching how the other geometry-derived
 * stores in this directory bind. The first emission is the current value, so it
 * is skipped rather than clearing on load.
 */
let seenFirstGeometry = false;
superGlobuleStore.subscribe(() => {
	if (!seenFirstGeometry) {
		seenFirstGeometry = true;
		return;
	}
	clearMeasurements();
});
```

If importing `superGlobuleStores` into `measurementStore` creates a cycle (check by running the test suite — a cycle shows up as `undefined` on import), invert it instead: leave `measurementStore` dependency-free and put the subscription in `Scene.svelte` inside an `$effect` keyed on `$superGlobuleStore`.

- [ ] **Step 6: Export from the store index**

Add to `src/lib/stores/index.ts`:

```ts
export * from '$lib/stores/measurementStore';
```

- [ ] **Step 7: Verify**

Run: `npx jest 2>&1 | tail -5`
Expected: all suites passing.

Run: `npm run check 2>&1 | tail -1`
Expected: `434 ERRORS`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/stores/measurementStore.ts src/lib/stores/__tests__/measurementStore.test.ts src/lib/stores/index.ts
git commit -m "feat(measure): add measurement store for user-placed point pairs

At most one open (unmatched) measurement, always last. Cleared on geometry
change because vertex identity is not stable across regeneration; deliberately
survives pattern and layout parameter changes."
```

---

## Task 9: Nearest-vertex picking and the measure interaction mode

**Files:**
- Create: `src/components/three-renderer/nearest-vertex.ts`
- Create: `src/components/three-renderer/__tests__/nearest-vertex.test.ts`
- Modify: `src/components/three-renderer/interaction-mode.ts`
- Modify: `src/components/three-renderer/materials.ts:152-155`
- Modify: `src/components/three-renderer/Scene.svelte`

**Interfaces:**
- Consumes: `addMeasurementPoint`, `measurements` (Task 8).
- Produces:
  - `nearestVertexFromEvent(ev): Vector3 | null`
  - `isMeasureInteractionMode(mode: InteractionMode): boolean`
  - materials `measurePending`, `measureMatched`

### The first-intersection requirement

This is already solved in the codebase twice and **must be reused, not reinvented**:

1. `Scene.svelte`'s `handleClick` calls `event.stopPropagation()`. Threlte's `interactivity()` dispatches over intersections nearest-first, so stopping on the first suppresses the rest.
2. `selection-helpers.ts`'s `isNearestIntersection(ev)` returns `ev.intersections?.[0]?.object === ev.object` — used by projection facets, which have many overlapping meshes.

Two guards must survive untouched:
- `interactivity({ clickDistanceThreshold: 25 })` at `Scene.svelte:54` — a touchpad tap drifts a few pixels and the default 8px gate misclassifies it as a camera orbit.
- `if (event.delta > CLICK_DELTA_THRESHOLD) return` — rejects genuine drags.

**Do not** route measurement through `Scene.svelte`'s existing `selectPoint`. It is a fixed-size ring buffer (`points.unshift(point); points.slice(0, pick)`), correct for the `pick: 2` / `pick: 3` transform modes and wrong for an unbounded list of pairs.

- [ ] **Step 1: Write the failing test**

Create `src/components/three-renderer/__tests__/nearest-vertex.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { BufferGeometry, Mesh, Vector3 } from 'three';

import { nearestVertexFromEvent } from '../nearest-vertex';

const meshWith = (points: Vector3[]): Mesh => {
	const mesh = new Mesh(new BufferGeometry().setFromPoints(points));
	mesh.updateMatrixWorld(true);
	return mesh;
};

const eventFor = (mesh: Mesh, point: Vector3) => ({
	object: mesh,
	point,
	intersections: [{ object: mesh, point }]
});

describe('nearestVertexFromEvent', () => {
	const vertices = [new Vector3(0, 0, 0), new Vector3(10, 0, 0), new Vector3(0, 10, 0)];

	it('snaps the hit point to the closest vertex of the hit mesh', () => {
		const mesh = meshWith(vertices);
		const result = nearestVertexFromEvent(eventFor(mesh, new Vector3(9, 1, 0)));
		expect(result?.toArray()).toEqual([10, 0, 0]);
	});

	it('returns the exact vertex when the hit lands on one', () => {
		const mesh = meshWith(vertices);
		const result = nearestVertexFromEvent(eventFor(mesh, new Vector3(0, 10, 0)));
		expect(result?.toArray()).toEqual([0, 10, 0]);
	});

	it('ignores hits that are not the nearest intersection', () => {
		// Only the nearest hit may be acted on — otherwise a click also lands on
		// back-faces and occluded geometry behind it.
		const near = meshWith(vertices);
		const far = meshWith([new Vector3(100, 100, 100)]);
		const result = nearestVertexFromEvent({
			object: far,
			point: new Vector3(100, 100, 100),
			intersections: [
				{ object: near, point: new Vector3(0, 0, 0) },
				{ object: far, point: new Vector3(100, 100, 100) }
			]
		});
		expect(result).toBeNull();
	});

	it('respects the mesh world transform', () => {
		const mesh = meshWith(vertices);
		mesh.position.set(100, 0, 0);
		mesh.updateMatrixWorld(true);
		const result = nearestVertexFromEvent(eventFor(mesh, new Vector3(109, 1, 0)));
		expect(result?.toArray()).toEqual([110, 0, 0]);
	});

	it('returns null when the hit object has no geometry', () => {
		expect(
			nearestVertexFromEvent({
				object: {},
				point: new Vector3(0, 0, 0),
				intersections: [{ object: {}, point: new Vector3(0, 0, 0) }]
			})
		).toBeNull();
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/components/three-renderer/__tests__/nearest-vertex.test.ts`
Expected: FAIL — `Cannot find module '../nearest-vertex'`.

- [ ] **Step 3: Implement it**

Create `src/components/three-renderer/nearest-vertex.ts`:

```ts
/**
 * Snap a pointer hit to the nearest vertex of the mesh it hit.
 *
 * Reads the hit mesh's own position attribute rather than a typed geometry
 * wrapper, so one implementation serves globule bands, projection facets,
 * voronoi facets and anything else that becomes clickable later.
 *
 * Only the NEAREST intersection is honoured. Threlte reports every mesh under
 * the cursor in `ev.intersections`, depth-sorted; acting on a non-nearest hit
 * would place points on back-faces and occluded geometry. This is the same
 * guarantee `isNearestIntersection` gives selection in `selection-helpers.ts`.
 */
import { Vector3 } from 'three';
import type { BufferGeometry, Mesh } from 'three';
import { isNearestIntersection } from './selection-helpers';

type PointerHit = {
	object?: unknown;
	point?: Vector3;
	intersections?: { object: unknown }[];
};

const geometryOf = (object: unknown): BufferGeometry | null => {
	const geometry = (object as Mesh | undefined)?.geometry;
	return geometry && 'attributes' in geometry ? (geometry as BufferGeometry) : null;
};

export const nearestVertexFromEvent = (ev: PointerHit): Vector3 | null => {
	if (!isNearestIntersection(ev)) return null;
	if (!ev.point) return null;

	const mesh = ev.object as Mesh;
	const geometry = geometryOf(mesh);
	const position = geometry?.getAttribute('position');
	if (!position) return null;

	const candidate = new Vector3();
	let closest: Vector3 | null = null;
	let closestDistance = Infinity;

	for (let i = 0; i < position.count; i++) {
		candidate.fromBufferAttribute(position, i);
		// Vertices are stored in local space; the indicators are placed in world
		// space, so convert before comparing.
		if (mesh.matrixWorld) candidate.applyMatrix4(mesh.matrixWorld);
		const distance = candidate.distanceToSquared(ev.point);
		if (distance < closestDistance) {
			closestDistance = distance;
			closest = candidate.clone();
		}
	}

	return closest;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/components/three-renderer/__tests__/nearest-vertex.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add the interaction mode**

In `src/components/three-renderer/interaction-mode.ts`, add to the `PointSelectInteractionMode` union:

```ts
	| {
			type: 'point-select-measure';
			data: { pick: 2; points: Point3[] };
			onSelectPoint?: () => void;
	  }
```

Add a guard below the existing ones:

```ts
/**
 * Measurement is a point-select mode, but an unbounded one — it collects pairs
 * rather than filling a fixed-size buffer, so callers that assume `pick`
 * semantics must exclude it.
 */
export const isMeasureInteractionMode = (mode: InteractionMode): boolean =>
	mode.type === 'point-select-measure';
```

And add to the `interactions` map:

```ts
	'point-select-measure': {
		prompt: 'Click two points on the model to measure between them',
		buttonPrompt: 'Measure',
		buttonReady: 'Done'
	},
```

- [ ] **Step 6: Add the materials**

In `src/components/three-renderer/materials.ts`, alongside `axisX` / `axisY` / `axisZ` (lines 152-154):

```ts
	// Magenta marks a measurement point still waiting for its partner; once
	// paired, both ends turn black.
	measurePending: new MeshStandardMaterial({
		color: 'magenta',
		transparent: false,
		side: DoubleSide
	}),
	measureMatched: new MeshStandardMaterial({
		color: 'black',
		transparent: false,
		side: DoubleSide
	}),
```

- [ ] **Step 7: Wire the click and the indicators in `Scene.svelte`**

Add imports:

```ts
	import {
		addMeasurementPoint,
		measurements
	} from '$lib/stores/measurementStore';
	import { isMeasureInteractionMode } from './interaction-mode';
	import { nearestVertexFromEvent } from './nearest-vertex';
```

In `handleClick`, add the measure branch **before** the generic point-select branch, since `isPointSelectInteractionMode` also matches the measure mode:

```ts
	const handleClick = (event: any, geometry: BandGeometry) => {
		event.stopPropagation();

		if (event.delta > CLICK_DELTA_THRESHOLD) return;

		const mode = get(interactionMode);
		if (mode.type === 'standard') {
			standardSelect(geometry);
		} else if (isBandSelectInteractionMode(mode)) {
			selectBand(geometry);
		} else if (isMeasureInteractionMode(mode)) {
			// Measurement collects an unbounded list of pairs, so it must not go
			// through selectPoint's fixed-size ring buffer.
			const vertex = nearestVertexFromEvent(event);
			if (vertex) addMeasurementPoint(vertex);
		} else if (isPointSelectInteractionMode(mode)) {
			selectPoint(event, geometry);
		}
	};
```

Guard the existing transform-mode indicator block so measure mode does not render through it:

```svelte
{#if isPointSelectInteractionMode($interactionMode) && !isMeasureInteractionMode($interactionMode)}
	{#each $interactionMode.data.points as point, i (i)}
		<T.Group position={[point.x, point.y, point.z]}>
			<GlobuleMesh geometry={indicator} material="default" />
		</T.Group>
	{/each}
{/if}
```

Add the measurement indicator block after the existing `$showMeasureIndicators` block:

```svelte
{#each $measurements as measurement (measurement.id)}
	<T.Group position={[measurement.a.x, measurement.a.y, measurement.a.z]}>
		<T.Mesh
			geometry={indicatorGeometry}
			material={measurement.b ? materials.measureMatched : materials.measurePending}
		/>
	</T.Group>
	{#if measurement.b}
		<T.Group position={[measurement.b.x, measurement.b.y, measurement.b.z]}>
			<T.Mesh geometry={indicatorGeometry} material={materials.measureMatched} />
		</T.Group>
	{/if}
{/each}
```

**Critical:** reuse the module-level `indicatorGeometry` (built once at `Scene.svelte:204`). Per the note at line 200, a Three.js `BufferGeometry` held in `$state` gets proxied by Svelte and its per-frame mutations feed back as reactive invalidations, tripping `effect_update_depth_exceeded`. Do not build geometry inside the loop or inside `$state`.

- [ ] **Step 8: Verify**

Run: `npx jest 2>&1 | tail -5`
Expected: all suites passing.

Run: `npm run check 2>&1 | tail -1`
Expected: `434 ERRORS`.

- [ ] **Step 9: Commit**

```bash
git add src/components/three-renderer/nearest-vertex.ts src/components/three-renderer/__tests__/nearest-vertex.test.ts src/components/three-renderer/interaction-mode.ts src/components/three-renderer/materials.ts src/components/three-renderer/Scene.svelte
git commit -m "feat(measure): pick nearest model vertices in a measure interaction mode

Reuses the existing first-intersection guarantees (stopPropagation on the
nearest hit, isNearestIntersection, the 25px click threshold and the delta drag
gate) rather than reimplementing them. Measurement bypasses selectPoint, whose
fixed-size ring buffer is wrong for an unbounded pair list, and reuses the
static indicatorGeometry to stay clear of effect_update_depth."
```

---

## Task 10: Measure on projection geometry

**Files:**
- Modify: `src/components/three-renderer/selection-helpers.ts`
- Modify: `src/components/projection/ProjectionGeometryComponent.svelte`

**Interfaces:**
- Consumes: `nearestVertexFromEvent` (Task 9), `addMeasurementPoint` (Task 8), `isMeasureInteractionMode` (Task 9).
- Produces: `handleFacetSelect` now no-ops selection and places a measurement point instead while measure mode is active.

Measurement must work whatever the active pattern source is (globule, projection, surface, voronoi). Projection facets do not go through `Scene.svelte`'s `handleClick` — they call `handleFacetSelect` from `selection-helpers.ts`. Intercepting there covers all four facet call sites at once.

- [ ] **Step 1: Intercept in `handleFacetSelect`**

In `src/components/three-renderer/selection-helpers.ts`, add imports:

```ts
import { get } from 'svelte/store';
import { addMeasurementPoint } from '$lib/stores/measurementStore';
import { interactionMode, isMeasureInteractionMode } from './interaction-mode';
import { nearestVertexFromEvent } from './nearest-vertex';
```

Widen the event type to carry the hit point and add the branch:

```ts
export const handleFacetSelect = (
	ev: {
		object?: unknown;
		point?: Vector3;
		intersections?: { object: unknown }[];
		stopPropagation?: () => void;
	},
	source: GeometrySource,
	address: GlobuleAddress_Facet,
	setHighlight?: (address: GlobuleAddress_Facet) => void
): void => {
	if (!isNearestIntersection(ev)) return;
	ev.stopPropagation?.();

	// While measuring, a facet click places a measurement point instead of
	// changing the selection — so measurement works on projection, surface and
	// voronoi geometry, not just globule bands.
	if (isMeasureInteractionMode(get(interactionMode))) {
		const vertex = nearestVertexFromEvent(ev);
		if (vertex) addMeasurementPoint(vertex);
		return;
	}

	setHighlight?.(address);
	recordBandSelection(source, address);
};
```

Add `import type { Vector3 } from 'three';` at the top.

- [ ] **Step 2: Confirm no call site needs changing**

Run: `grep -rn "handleFacetSelect" src/components`

All four call sites in `ProjectionGeometryComponent.svelte` pass the raw Threlte event through as `ev`, which already carries `point` and `intersections`. No call-site edits are needed. If any call site constructs a synthetic event object, extend it to forward `point` and `intersections`.

- [ ] **Step 3: Check for an import cycle**

`selection-helpers.ts` already imports from `$lib/stores`. Adding `measurementStore` (which Task 8 has importing `superGlobuleStores`) could form a cycle.

Run: `npx jest 2>&1 | tail -5`

If any suite fails with `undefined is not a function` on a store, break the cycle by importing the store module directly (`$lib/stores/measurementStore`) rather than through the barrel — which the snippet above already does — or by moving the geometry subscription out of `measurementStore` as described in Task 8 Step 5.

- [ ] **Step 4: Verify**

Run: `npm run check 2>&1 | tail -1`
Expected: `434 ERRORS`.

- [ ] **Step 5: Commit**

```bash
git add src/components/three-renderer/selection-helpers.ts
git commit -m "feat(measure): place measurement points on projection geometry

Intercepting in handleFacetSelect covers projection, surface, globule-tube and
voronoi facets at once, so measuring works whatever the active pattern source
is. Keeps the existing nearest-intersection gate."
```

---

## Task 11: Pattern Layout measurement UI

**Files:**
- Modify: `src/components/modal/editor/PageLayout.svelte`

**Interfaces:**
- Consumes: `measurements`, `addMeasurementPoint`, `removeMeasurement`, `clearMeasurements` (Task 8); `deriveDistance` (Task 4); `interactionMode`, `isMeasureInteractionMode` (Task 9).
- Produces: nothing.

- [ ] **Step 1: Add imports and derived state**

In the `<script>` block of `src/components/modal/editor/PageLayout.svelte`, add:

```ts
	import { measurements, removeMeasurement, clearMeasurements } from '$lib/stores/measurementStore';
	import {
		interactionMode,
		isMeasureInteractionMode
	} from '../../three-renderer/interaction-mode';
	import { deriveDistance } from '$lib/cut-pattern/page-layout/units';

	let isMeasuring = $derived(isMeasureInteractionMode($interactionMode));

	const startMeasuring = () => {
		interactionMode.set({ type: 'point-select-measure', data: { pick: 2, points: [] } });
	};
	const stopMeasuring = () => {
		interactionMode.set({ type: 'standard' });
	};

	/** Only completed pairs get a readout; an open point is still being placed. */
	let completedMeasurements = $derived(
		$measurements
			.map((m, index) => ({ ...m, label: index + 1 }))
			.filter((m) => m.b !== null)
	);
```

- [ ] **Step 2: Add the rows and the button**

Replace the "Model size" `<div class="derived">` block with:

```svelte
		<div class="derived">
			<strong>Model size</strong>
			{#if derived3d}
				<div class="axis-x">X: {fmt(derived3d.mm.x)} mm / {fmt(derived3d.inch.x)} in</div>
				<div class="axis-y">Y: {fmt(derived3d.mm.y)} mm / {fmt(derived3d.inch.y)} in</div>
				<div class="axis-z">Z: {fmt(derived3d.mm.z)} mm / {fmt(derived3d.inch.z)} in</div>
			{:else}
				<div>—</div>
			{/if}

			{#each completedMeasurements as m (m.id)}
				{@const d = deriveDistance(m.a, m.b!, cfg.pageScale)}
				<div class="measurement">
					<span>{m.label}: {fmt(d.mm)} mm / {fmt(d.inch)} in</span>
					<button
						class="clear-measurement"
						title="Remove this measurement"
						onclick={() => removeMeasurement(m.id)}>X</button
					>
				</div>
			{/each}

			<button class="measure-button" onclick={isMeasuring ? stopMeasuring : startMeasuring}>
				{isMeasuring ? 'Done measuring' : 'New measurement'}
			</button>
			{#if isMeasuring}
				<div class="measure-hint">Click two points on the model</div>
			{/if}
			{#if $measurements.length > 0}
				<button class="measure-button" onclick={clearMeasurements}>Clear measurements</button>
			{/if}

			<label class="indicator-toggle">
				<input type="checkbox" bind:checked={$showMeasureIndicators} />
				show measure points
			</label>
		</div>
```

- [ ] **Step 3: Add the styles**

Append to the `<style>` block:

```css
	/* Arbitrary measurements are numbered and black, distinguishing them from
	   the axis-coloured X/Y/Z extents above. */
	.measurement {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 6px;
		color: black;
	}
	.clear-measurement {
		border: 0;
		background: transparent;
		cursor: pointer;
		font-family: monospace;
		font-size: 11px;
		padding: 0 4px;
		line-height: 1;
	}
	.clear-measurement:hover {
		color: #c00;
	}
	.measure-button {
		margin-top: 4px;
		padding: 2px 8px;
		font-family: monospace;
		font-size: 12px;
		cursor: pointer;
	}
	.measure-hint {
		color: #666;
		font-size: 11px;
	}
```

- [ ] **Step 4: Verify**

Run: `npx jest 2>&1 | tail -5`
Expected: all suites passing.

Run: `npm run check 2>&1 | tail -1`
Expected: `434 ERRORS`.

Run: `npm run lint`
Expected: pass. Run `npm run format` first if prettier objects.

- [ ] **Step 5: Manually verify the whole feature**

In `/designer2`, set Pattern Layout mode to `page` (the Model size block only renders in `page` mode). Then:

1. Click **New measurement**. Click a point on the 3D model — a **magenta** indicator appears.
2. Click a second point — **both** turn black, and a row `1: … mm / … in` appears.
3. Click two more points — a second numbered row appears.
4. Click the `X` on row 1 — that row and its two indicators disappear; row 2 remains.
5. Change `gap`, `pageScale` or the pattern type — measurements **survive** (the mm value tracks `pageScale`).
6. Change the globule geometry (e.g. Sides in Globule Cross Section) — measurements **clear**.
7. Reload — measurements are gone.
8. Confirm a click never places two points at once (the first-intersection guarantee) and that orbiting the camera by dragging does not place a point (the delta gate).

- [ ] **Step 6: Commit**

```bash
git add src/components/modal/editor/PageLayout.svelte
git commit -m "feat(measure): arbitrary measurements in the Pattern Layout panel

Numbered black rows alongside the X/Y/Z extents, each removable, with a
New measurement button that toggles the pick mode."
```

---

## Task 12: Final verification

- [ ] **Step 1: Full suite**

Run: `npx jest 2>&1 | tail -6`
Expected: **93 suites** (87 baseline + 6 added by this plan), **~719 tests** (675 baseline + ~44 added), zero failures. The exact added count may differ slightly; what matters is that no baseline test fails and the totals only grow.

- [ ] **Step 2: Type check**

Run: `npm run check 2>&1 | tail -1`
Expected: `434 ERRORS` — equal to baseline. A higher number is a regression; find the delta with `npm run check 2>&1 | grep ERROR > /tmp/after.txt` and compare against a `main` checkout in a separate worktree (never `git stash` or `git checkout` in this working tree).

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: pass.

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: succeeds. This is the only check that exercises the Web Worker bundle.

Note: geometry generation runs in a Web Worker, and Vite will not rebuild it on reload. If manual verification showed stale geometry behavior at any point, restart the dev server rather than trusting a reload.

- [ ] **Step 5: Report**

Summarize: what changed, the check/test/lint results with actual numbers, and — explicitly — that saved `lateral` / `radial-lateral` configs now generate different (correct) geometry, since that was the accepted risk agreed at design time.
