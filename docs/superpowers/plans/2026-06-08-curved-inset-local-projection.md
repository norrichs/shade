# Curved Inset for Local-Projection Voronoi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `curvedInset` boolean config flag that, when true, replaces the local-projection Voronoi inset's straight homothety edges with per-corner quadratic bezier inner curves.

**Architecture:** All curve math happens in the existing plane-2D space of the local projection (the plane halfway between surface and `source`). Two new pure modules build and sample the bezier inner curves in 2D; `local-projection.ts` back-projects the samples through `source` onto the surface using the existing `selectSurfaceHit`, so the `EdgeInsets` output shape and all downstream tube/band code are unchanged. Edges whose corners can't be resolved fall back to the existing straight inset.

**Tech Stack:** SvelteKit + Three.js (Vector2/Vector3) + TypeScript, Jest unit tests.

**Spec:** `docs/superpowers/specs/2026-06-08-curved-inset-local-projection-design.md`

---

## File Structure

**New files:**

- `src/lib/voronoi/bezier-2d.ts` — pure 2D quadratic bezier helpers (`sampleQuadratic`, `quadraticLineSplitT`).
- `src/lib/voronoi/curved-inset-2d.ts` — builds per-edge curved inner-curve samples (2D) for one cell, plus `vertexKey`.
- `src/lib/voronoi/__tests__/bezier-2d.test.ts`
- `src/lib/voronoi/__tests__/curved-inset-2d.test.ts`

**Modified files:**

- `src/lib/voronoi/types.ts` — add `curvedInset?: boolean` to `VoronoiConfig`.
- `src/lib/shades-config.ts` — `curvedInset: false` in `defaultVoronoiConfig`.
- `src/lib/voronoi/migrate-voronoi-config.ts` — default `curvedInset` on normalize.
- `src/lib/voronoi/inset-2d.ts` — extract reusable `segmentIntermediates2D`.
- `src/lib/voronoi/local-projection.ts` — add `curvedInset` param + curved per-cell path with straight fallback.
- `src/lib/voronoi/generate-voronoi.ts` — thread `config.curvedInset` into the localProjection call.
- `src/components/controls/VoronoiControl.svelte` — add a `curvedInset` checkbox.

**Test commands:**

- Single test file: `npm run test:unit -- src/lib/voronoi/__tests__/<file>.test.ts`
- Typecheck: `npm run check`
- Lint/format: `npm run lint` / `npm run format`

---

## Task 1: Config flag plumbing

**Files:**

- Modify: `src/lib/voronoi/types.ts:11-27`
- Modify: `src/lib/shades-config.ts:700-728`
- Modify: `src/lib/voronoi/migrate-voronoi-config.ts:44-48`
- Test: `src/lib/voronoi/__tests__/migrate-voronoi-config.test.ts`

- [ ] **Step 1: Write the failing test**

Append this test inside the existing top-level `describe` block in `src/lib/voronoi/__tests__/migrate-voronoi-config.test.ts` (place it next to the other `normalizeVoronoiConfig` tests):

```ts
it('defaults curvedInset to false when absent', () => {
	const base = makeConfigWithVoronoi(); // existing helper used by the other tests
	const { curvedInset, ...voronoiNoCurved } = base.voronoiConfig!;
	const input = { ...base, voronoiConfig: voronoiNoCurved } as typeof base;
	const result = normalizeVoronoiConfig(input);
	expect(result.voronoiConfig!.curvedInset).toBe(false);
});
```

If `makeConfigWithVoronoi` is not the helper name in that file, build the input the same way the adjacent tests do (the key requirement: a `SuperGlobuleConfig` whose `voronoiConfig` omits `curvedInset`). Read the existing tests in the file first and mirror their setup.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/migrate-voronoi-config.test.ts`
Expected: FAIL — `curvedInset` is `undefined`, not `false`.

- [ ] **Step 3: Add the type field**

In `src/lib/voronoi/types.ts`, add the field to `VoronoiConfig` (after `insetMethod`, before `fillAll`):

```ts
	insetMethod: InsetMethod;
	// When true (localProjection only), inset edges are drawn as per-corner quadratic
	// beziers instead of straight homothety lines. Ignored by other inset methods.
	curvedInset?: boolean;
	fillAll?: boolean;
```

- [ ] **Step 4: Add the default**

In `src/lib/shades-config.ts`, in `defaultVoronoiConfig`, add after `insetMethod: 'centerOut'`:

```ts
	insetMethod: 'centerOut',
	curvedInset: false
```

- [ ] **Step 5: Default it on migration**

In `src/lib/voronoi/migrate-voronoi-config.ts`, extend the normalized object:

```ts
const voronoiConfig: VoronoiConfig = {
	...resolved,
	edgeDivisions: normalizeEdgeDivisions(resolved.edgeDivisions),
	insetMethod: resolved.insetMethod ?? 'centerOut',
	curvedInset: resolved.curvedInset ?? false
};
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/migrate-voronoi-config.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/voronoi/types.ts src/lib/shades-config.ts src/lib/voronoi/migrate-voronoi-config.ts src/lib/voronoi/__tests__/migrate-voronoi-config.test.ts
git commit -m "feat(voronoi): add curvedInset config flag (default false)"
```

---

## Task 2: `bezier-2d.ts` quadratic bezier helpers

**Files:**

- Create: `src/lib/voronoi/bezier-2d.ts`
- Test: `src/lib/voronoi/__tests__/bezier-2d.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/voronoi/__tests__/bezier-2d.test.ts`:

```ts
import { Vector2 } from 'three';
import { sampleQuadratic, quadraticLineSplitT } from '../bezier-2d';

describe('sampleQuadratic', () => {
	const p0 = new Vector2(0, 0);
	const ctrl = new Vector2(1, 1);
	const p1 = new Vector2(2, 0);

	it('returns endpoints at t=0 and t=1', () => {
		expect(sampleQuadratic(p0, ctrl, p1, 0).distanceTo(p0)).toBeCloseTo(0, 10);
		expect(sampleQuadratic(p0, ctrl, p1, 1).distanceTo(p1)).toBeCloseTo(0, 10);
	});

	it('returns the midpoint formula at t=0.5', () => {
		// (p0 + 2*ctrl + p1) / 4
		const m = sampleQuadratic(p0, ctrl, p1, 0.5);
		expect(m.x).toBeCloseTo(1, 10);
		expect(m.y).toBeCloseTo(0.5, 10);
	});
});

describe('quadraticLineSplitT', () => {
	// Parabola: p0=(-1,1), ctrl=(0,0), p1=(1,1). X(t) = -1 + 2t, crosses x=0 at t=0.5.
	const p0 = new Vector2(-1, 1);
	const ctrl = new Vector2(0, 0);
	const p1 = new Vector2(1, 1);

	it('finds the crossing of the vertical line through the control point', () => {
		const t = quadraticLineSplitT(p0, ctrl, p1, new Vector2(0, 0), new Vector2(0, 1));
		expect(t).not.toBeNull();
		expect(t as number).toBeCloseTo(0.5, 6);
	});

	it('returns null when the line never crosses the curve inside (0,1)', () => {
		const t = quadraticLineSplitT(p0, ctrl, p1, new Vector2(5, 0), new Vector2(0, 1));
		expect(t).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/bezier-2d.test.ts`
Expected: FAIL — cannot find module `../bezier-2d`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/voronoi/bezier-2d.ts`:

```ts
import { Vector2 } from 'three';

/** Point on the quadratic bezier (p0, ctrl, p1) at parameter t in [0,1]. */
export function sampleQuadratic(p0: Vector2, ctrl: Vector2, p1: Vector2, t: number): Vector2 {
	const mt = 1 - t;
	const a = mt * mt;
	const b = 2 * mt * t;
	const c = t * t;
	return new Vector2(a * p0.x + b * ctrl.x + c * p1.x, a * p0.y + b * ctrl.y + c * p1.y);
}

/**
 * Parameter t in (0,1) where the quadratic bezier (p0, ctrl, p1) crosses the line through
 * `linePoint` with direction `lineDir`. Solves the quadratic of the curve's signed distance
 * to the line. Returns null when there is no crossing strictly inside (0,1). When two roots
 * lie inside, returns the one nearest t=0.5 (the crossing closest to the curve's apex).
 */
export function quadraticLineSplitT(
	p0: Vector2,
	ctrl: Vector2,
	p1: Vector2,
	linePoint: Vector2,
	lineDir: Vector2
): number | null {
	// Line normal (perp of lineDir); signed distance f(p) = (p - linePoint) . n.
	const nx = -lineDir.y;
	const ny = lineDir.x;
	const f = (p: Vector2) => (p.x - linePoint.x) * nx + (p.y - linePoint.y) * ny;
	const f0 = f(p0);
	const fc = f(ctrl);
	const f1 = f(p1);
	// f(B(t)) = A t^2 + B t + C, with C=f0, B=2(fc-f0), A=f0-2fc+f1.
	const A = f0 - 2 * fc + f1;
	const B = 2 * (fc - f0);
	const C = f0;
	const roots: number[] = [];
	if (Math.abs(A) < 1e-12) {
		if (Math.abs(B) > 1e-12) roots.push(-C / B);
	} else {
		const disc = B * B - 4 * A * C;
		if (disc >= 0) {
			const s = Math.sqrt(disc);
			roots.push((-B + s) / (2 * A));
			roots.push((-B - s) / (2 * A));
		}
	}
	const inside = roots.filter((t) => t > 1e-9 && t < 1 - 1e-9);
	if (inside.length === 0) return null;
	inside.sort((a, b) => Math.abs(a - 0.5) - Math.abs(b - 0.5));
	return inside[0];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/bezier-2d.test.ts`
Expected: PASS (4 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/voronoi/bezier-2d.ts src/lib/voronoi/__tests__/bezier-2d.test.ts
git commit -m "feat(voronoi): add 2D quadratic bezier sample + line-split helpers"
```

---

## Task 3: Extract `segmentIntermediates2D` in `inset-2d.ts`

This is a DRY refactor so both the straight and curved paths share one 2D-subdivision primitive. Behavior of `insetIntermediates2D` is unchanged.

**Files:**

- Modify: `src/lib/voronoi/inset-2d.ts`
- Test: `src/lib/voronoi/__tests__/inset-2d.test.ts` (create if it does not exist)

- [ ] **Step 1: Write the failing test**

Create or append to `src/lib/voronoi/__tests__/inset-2d.test.ts`:

```ts
import { Vector2 } from 'three';
import { segmentIntermediates2D, insetIntermediates2D, insetPoint2D } from '../inset-2d';

describe('segmentIntermediates2D', () => {
	it('returns `divisions` points evenly spaced from->to (exclusive ends)', () => {
		const from = new Vector2(0, 0);
		const to = new Vector2(3, 0);
		const pts = segmentIntermediates2D(from, to, 2);
		expect(pts).toHaveLength(2);
		expect(pts[0].x).toBeCloseTo(1, 10); // s = 1/3
		expect(pts[1].x).toBeCloseTo(2, 10); // s = 2/3
	});

	it('returns [] for 0 divisions', () => {
		expect(segmentIntermediates2D(new Vector2(0, 0), new Vector2(1, 0), 0)).toHaveLength(0);
	});
});

describe('insetIntermediates2D still matches segmentIntermediates2D(inset, edge)', () => {
	it('produces the same points', () => {
		const edge = new Vector2(4, 0);
		const seed = new Vector2(0, 0);
		const factor = 0.25;
		const viaInset = insetIntermediates2D(edge, seed, factor, 3);
		const inset = insetPoint2D(edge, seed, factor);
		const viaSegment = segmentIntermediates2D(inset, edge, 3);
		viaInset.forEach((p, i) => expect(p.distanceTo(viaSegment[i])).toBeCloseTo(0, 10));
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/inset-2d.test.ts`
Expected: FAIL — `segmentIntermediates2D` is not exported.

- [ ] **Step 3: Refactor the implementation**

Replace the body of `src/lib/voronoi/inset-2d.ts` with:

```ts
import { Vector2 } from 'three';

/**
 * The 2D inset primitive (homothety): move a boundary point a fraction `factor` of the
 * way toward the cell seed.
 */
export function insetPoint2D(point: Vector2, seed: Vector2, factor: number): Vector2 {
	return point.clone().lerp(seed, factor);
}

/**
 * `divisions` points evenly spaced strictly between `from` and `to`, ordered from->to.
 * Point d sits at s = d/(divisions+1) of the way from `from` to `to`.
 */
export function segmentIntermediates2D(from: Vector2, to: Vector2, divisions: number): Vector2[] {
	const out: Vector2[] = [];
	for (let d = 1; d <= divisions; d++) {
		const s = d / (divisions + 1);
		out.push(from.clone().lerp(to, s));
	}
	return out;
}

/**
 * `divisions` intermediate points between the inset point (insetPoint2D(edge,...)) and the
 * edge point, ordered inset -> edge. Used to populate the surface-projection tube rings.
 */
export function insetIntermediates2D(
	edgePoint: Vector2,
	seed: Vector2,
	factor: number,
	divisions: number
): Vector2[] {
	const inset = insetPoint2D(edgePoint, seed, factor);
	return segmentIntermediates2D(inset, edgePoint, divisions);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/inset-2d.test.ts`
Expected: PASS.

Also run the existing local-projection test to confirm the refactor changed no behavior:
Run: `npm run test:unit -- src/lib/voronoi/__tests__/local-projection.test.ts`
Expected: PASS (unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/lib/voronoi/inset-2d.ts src/lib/voronoi/__tests__/inset-2d.test.ts
git commit -m "refactor(voronoi): extract segmentIntermediates2D from insetIntermediates2D"
```

---

## Task 4: `curved-inset-2d.ts` — per-cell inner curves

This pure module builds the curved inner-curve samples for one cell entirely in plane-2D. No Three.js surface / raycasting.

**Files:**

- Create: `src/lib/voronoi/curved-inset-2d.ts`
- Test: `src/lib/voronoi/__tests__/curved-inset-2d.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/voronoi/__tests__/curved-inset-2d.test.ts`:

```ts
import { Vector2 } from 'three';
import { buildCellCurvedInsets2d, vertexKey, type CurvedCellEdge } from '../curved-inset-2d';

// A unit square cell centered on the seed at the origin.
//   P0=(1,1)  P1=(-1,1)  P2=(-1,-1)  P3=(1,-1)
// Edges (closed ring): E0 P0-P1, E1 P1-P2, E2 P2-P3, E3 P3-P0.
function squareCell(sampleCount: number) {
	const P0 = new Vector2(1, 1);
	const P1 = new Vector2(-1, 1);
	const P2 = new Vector2(-1, -1);
	const P3 = new Vector2(1, -1);
	const k = (p: Vector2) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`;
	const vertexPos2d = new Map<string, Vector2>([
		[k(P0), P0],
		[k(P1), P1],
		[k(P2), P2],
		[k(P3), P3]
	]);
	const edges: CurvedCellEdge[] = [
		{ edgeId: 0, vKeyStart: k(P0), vKeyEnd: k(P1), sampleCount },
		{ edgeId: 1, vKeyStart: k(P1), vKeyEnd: k(P2), sampleCount },
		{ edgeId: 2, vKeyStart: k(P2), vKeyEnd: k(P3), sampleCount },
		{ edgeId: 3, vKeyStart: k(P3), vKeyEnd: k(P0), sampleCount }
	];
	return { edges, vertexPos2d, seed2d: new Vector2(0, 0), curveOffsetFactor: 0.25 };
}

describe('buildCellCurvedInsets2d', () => {
	it('produces sampleCount points per edge of a closed cell', () => {
		const out = buildCellCurvedInsets2d(squareCell(3));
		for (let e = 0; e < 4; e++) {
			const pts = out.get(e);
			expect(pts).not.toBeNull();
			expect(pts as Vector2[]).toHaveLength(3);
		}
	});

	it('for sampleCount=3 the middle sample is the inset-edge midpoint', () => {
		const out = buildCellCurvedInsets2d(squareCell(3));
		// E0 spans P0=(1,1) -> P1=(-1,1); inset toward origin by 0.25:
		// P0'=(0.75,0.75), P1'=(-0.75,0.75); midpoint = (0, 0.75).
		const e0 = out.get(0) as Vector2[];
		expect(e0[1].x).toBeCloseTo(0, 6);
		expect(e0[1].y).toBeCloseTo(0.75, 6);
	});

	it('endpoints of an inner curve lie on the vertex->seed lines', () => {
		const out = buildCellCurvedInsets2d(squareCell(3));
		const e0 = out.get(0) as Vector2[];
		// Start endpoint on line P0=(1,1)..seed=(0,0): y = x.
		expect(e0[0].x - e0[0].y).toBeCloseTo(0, 6);
		// End endpoint on line P1=(-1,1)..seed=(0,0): y = -x  => x + y = 0.
		const last = e0[e0.length - 1];
		expect(last.x + last.y).toBeCloseTo(0, 6);
	});

	it('produces sampleCount points for higher divisions (sampleCount=4)', () => {
		const out = buildCellCurvedInsets2d(squareCell(4));
		const e0 = out.get(0) as Vector2[];
		expect(e0).toHaveLength(4);
		// Endpoints still on the vertex->seed lines.
		expect(e0[0].x - e0[0].y).toBeCloseTo(0, 6);
		expect(e0[3].x + e0[3].y).toBeCloseTo(0, 6);
	});

	it('falls back (null) for edges of an open chain whose vertex has degree 1', () => {
		// Open chain: just E0 (P0-P1) and E1 (P1-P2). P0 and P2 have degree 1.
		const P0 = new Vector2(1, 1);
		const P1 = new Vector2(-1, 1);
		const P2 = new Vector2(-1, -1);
		const k = (p: Vector2) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`;
		const out = buildCellCurvedInsets2d({
			edges: [
				{ edgeId: 0, vKeyStart: k(P0), vKeyEnd: k(P1), sampleCount: 3 },
				{ edgeId: 1, vKeyStart: k(P1), vKeyEnd: k(P2), sampleCount: 3 }
			],
			vertexPos2d: new Map([
				[k(P0), P0],
				[k(P1), P1],
				[k(P2), P2]
			]),
			seed2d: new Vector2(0, 0),
			curveOffsetFactor: 0.25
		});
		// Both edges touch a degree-1 vertex, so both fall back.
		expect(out.get(0)).toBeNull();
		expect(out.get(1)).toBeNull();
	});

	it('vertexKey is stable for equal coordinates', () => {
		expect(vertexKey([1.0, -0.3])).toBe(vertexKey([1.0, -0.3]));
		expect(vertexKey([1.0, -0.3])).not.toBe(vertexKey([1.0, 0.3]));
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/curved-inset-2d.test.ts`
Expected: FAIL — cannot find module `../curved-inset-2d`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/voronoi/curved-inset-2d.ts`:

```ts
import { Vector2 } from 'three';
import { sampleQuadratic, quadraticLineSplitT } from './bezier-2d';

/** Stable key for a Voronoi vertex coordinate; equal coords (shared vertices) collide. */
export function vertexKey(coord: [number, number]): string {
	return `${coord[0].toFixed(6)},${coord[1].toFixed(6)}`;
}

export type CurvedCellEdge = {
	edgeId: number; // caller's global edge index, echoed back in the output map
	vKeyStart: string; // vertexKey(edge.vertices[0])
	vKeyEnd: string; // vertexKey(edge.vertices[1])
	sampleCount: number; // points wanted (== that edge's edgePoints3d.length)
};

export type CurvedCellInput = {
	edges: CurvedCellEdge[];
	vertexPos2d: Map<string, Vector2>; // plane-2D position per vertex key
	seed2d: Vector2;
	curveOffsetFactor: number;
};

type Adjacency = Map<string, { edgeId: number; otherKey: string }[]>;

function insetToward(p: Vector2, seed: Vector2, f: number): Vector2 {
	return p.clone().lerp(seed, f);
}

function midpoint(a: Vector2, b: Vector2): Vector2 {
	return a.clone().add(b).multiplyScalar(0.5);
}

/**
 * The far endpoint of the corner bezier at vertex `vKey`: the inset-edge midpoint of the
 * OTHER cell edge meeting at that vertex. Returns null if the vertex is not a clean degree-2
 * corner or a needed position is missing.
 */
function otherEdgeInsetMidpoint(
	vKey: string,
	thisEdgeId: number,
	adjacency: Adjacency,
	vertexPos2d: Map<string, Vector2>,
	seed2d: Vector2,
	f: number
): Vector2 | null {
	const adj = adjacency.get(vKey);
	if (!adj || adj.length !== 2) return null;
	const other = adj.find((x) => x.edgeId !== thisEdgeId);
	if (!other) return null;
	const vPos = vertexPos2d.get(vKey);
	const oPos = vertexPos2d.get(other.otherKey);
	if (!vPos || !oPos) return null;
	return midpoint(insetToward(vPos, seed2d, f), insetToward(oPos, seed2d, f));
}

function buildEdgeInnerCurve(
	e: CurvedCellEdge,
	adjacency: Adjacency,
	vertexPos2d: Map<string, Vector2>,
	seed2d: Vector2,
	f: number
): Vector2[] | null {
	if (e.sampleCount < 2) return null;
	const sPos = vertexPos2d.get(e.vKeyStart);
	const ePos = vertexPos2d.get(e.vKeyEnd);
	if (!sPos || !ePos) return null;

	const sInset = insetToward(sPos, seed2d, f);
	const eInset = insetToward(ePos, seed2d, f);
	const mE = midpoint(sInset, eInset); // this edge's inset midpoint (shared by both halves)

	const mOtherStart = otherEdgeInsetMidpoint(
		e.vKeyStart,
		e.edgeId,
		adjacency,
		vertexPos2d,
		seed2d,
		f
	);
	const mOtherEnd = otherEdgeInsetMidpoint(e.vKeyEnd, e.edgeId, adjacency, vertexPos2d, seed2d, f);
	if (!mOtherStart || !mOtherEnd) return null;

	// Corner bezier at start vertex: mOtherStart -> sInset(ctrl) -> mE. The E-half runs from
	// the split (t=tSplitStart, on the vertex->seed line) to mE (t=1).
	const tSplitStart = quadraticLineSplitT(
		mOtherStart,
		sInset,
		mE,
		sInset,
		seed2d.clone().sub(sInset)
	);
	if (tSplitStart === null) return null;

	// Corner bezier at end vertex: mE -> eInset(ctrl) -> mOtherEnd. The E-half runs from mE
	// (t=0) to the split (t=tSplitEnd).
	const tSplitEnd = quadraticLineSplitT(mE, eInset, mOtherEnd, eInset, seed2d.clone().sub(eInset));
	if (tSplitEnd === null) return null;

	const n = e.sampleCount - 1; // sections
	const half = n / 2; // section position of mE
	const out: Vector2[] = [];
	for (let i = 0; i <= n; i++) {
		if (i <= half) {
			// start half: split (frac 0) .. mE (frac 1)
			const frac = i / half;
			const t = tSplitStart + frac * (1 - tSplitStart);
			out.push(sampleQuadratic(mOtherStart, sInset, mE, t));
		} else {
			// end half: mE (frac 0) .. split (frac 1)
			const frac = (i - half) / half;
			const t = frac * tSplitEnd;
			out.push(sampleQuadratic(mE, eInset, mOtherEnd, t));
		}
	}
	return out;
}

/**
 * Build per-edge curved inner-curve samples (plane-2D) for one cell. Returns a map
 * edgeId -> samples (length == edge.sampleCount, oriented vStart..vEnd), or edgeId -> null
 * for any edge that can't form a full corner pair (boundary/open cell, unmatched vertex,
 * degenerate split). The caller falls back to a straight inset for null edges.
 */
export function buildCellCurvedInsets2d(input: CurvedCellInput): Map<number, Vector2[] | null> {
	const { edges, vertexPos2d, seed2d, curveOffsetFactor: f } = input;

	const adjacency: Adjacency = new Map();
	for (const e of edges) {
		const a = adjacency.get(e.vKeyStart) ?? [];
		a.push({ edgeId: e.edgeId, otherKey: e.vKeyEnd });
		adjacency.set(e.vKeyStart, a);
		const b = adjacency.get(e.vKeyEnd) ?? [];
		b.push({ edgeId: e.edgeId, otherKey: e.vKeyStart });
		adjacency.set(e.vKeyEnd, b);
	}

	const out = new Map<number, Vector2[] | null>();
	for (const e of edges) {
		out.set(e.edgeId, buildEdgeInnerCurve(e, adjacency, vertexPos2d, seed2d, f));
	}
	return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/curved-inset-2d.test.ts`
Expected: PASS (all assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/voronoi/curved-inset-2d.ts src/lib/voronoi/__tests__/curved-inset-2d.test.ts
git commit -m "feat(voronoi): per-cell curved inset inner curves in plane-2D"
```

---

## Task 5: Integrate the curved path into `local-projection.ts`

Add an optional `curvedInset` param. When set, build the cell's curved inner curves and, per edge, use them (back-projecting each 2D sample through `source`); otherwise use the existing straight inset. Both paths share one inner loop. Edges with a `null` curved result fall back to straight automatically.

**Files:**

- Modify: `src/lib/voronoi/local-projection.ts`
- Test: `src/lib/voronoi/__tests__/local-projection.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/voronoi/__tests__/local-projection.test.ts`, inside the existing `describe('computeEdgeInsetsLocalProjection', ...)` block (it can use the `common`, `seedPoints3d`, `R`, `center`, `relaxedSeeds`, `edgeProjections` already defined in that file):

```ts
it('curvedInset: shared edge is curved and still lands on the sphere', () => {
	const straight = computeEdgeInsetsLocalProjection({ ...common, seedPoints3d });
	const curved = computeEdgeInsetsLocalProjection({ ...common, seedPoints3d, curvedInset: true });

	// edgePoints3d are length 3, so curve points stay length 3.
	expect(curved[0].curvePointsA).toHaveLength(3);
	curved[0].curvePointsA.forEach((p) => expect(p.distanceTo(center)).toBeCloseTo(R, -1));
	curved[0].curvePointsB.forEach((p) => expect(p.distanceTo(center)).toBeCloseTo(R, -1));

	// The shared edge (index 0) has both vertices at cell-interior degree 2 for cells 0
	// and 1, so it is curved -> differs from the straight inset.
	const moved = curved[0].curvePointsA.reduce(
		(acc, p, i) => acc + p.distanceTo(straight[0].curvePointsA[i]),
		0
	);
	expect(moved).toBeGreaterThan(1e-3);
});

it('curvedInset: open-chain edges fall back to the straight inset', () => {
	const straight = computeEdgeInsetsLocalProjection({ ...common, seedPoints3d });
	const curved = computeEdgeInsetsLocalProjection({ ...common, seedPoints3d, curvedInset: true });
	// Edge 1 touches vertex (0.7,-0.3) which is degree 1 in cell 0 -> fallback (== straight).
	curved[1].curvePointsA.forEach((p, i) =>
		expect(p.distanceTo(straight[1].curvePointsA[i])).toBeCloseTo(0, 6)
	);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/local-projection.test.ts`
Expected: FAIL — `curvedInset` is not an accepted param / curved path not implemented (the "differs from straight" assertion fails because curved currently equals straight).

- [ ] **Step 3: Add the param to the signature**

In `src/lib/voronoi/local-projection.ts`, update the imports and the `params` object of `computeEdgeInsetsLocalProjection`.

Add to the imports at the top:

```ts
import { insetPoint2D, insetIntermediates2D, segmentIntermediates2D } from './inset-2d';
import { buildCellCurvedInsets2d, vertexKey, type CurvedCellEdge } from './curved-inset-2d';
```

(Replace the existing `import { insetPoint2D, insetIntermediates2D } from './inset-2d';` line with the expanded one above.)

Add the param to the function's `params` type and destructuring:

```ts
export function computeEdgeInsetsLocalProjection(params: {
	edges: VoronoiEdge[];
	edgeProjections: EdgeProjection[];
	seedPoints3d: (Vector3 | null)[];
	surface: Object3D;
	surfaceCenter: Vector3;
	curveOffsetFactor: number;
	surfaceProjectionDivisions: number;
	sourceDistanceFactor?: number;
	curvedInset?: boolean;
}): EdgeInsets[] {
	const {
		edges,
		edgeProjections,
		seedPoints3d,
		surface,
		surfaceCenter,
		curveOffsetFactor,
		surfaceProjectionDivisions
	} = params;
	const distanceFactor = params.sourceDistanceFactor ?? DEFAULT_SOURCE_DISTANCE_FACTOR;
	const curvedInset = params.curvedInset ?? false;
```

- [ ] **Step 4: Build the cell's curved inner curves before the edge loop**

In the `for (const [cell, edgeIdxs] of cellEdges)` block, after `const seed2d = ...` is computed (right before `for (const ei of edgeIdxs) {`), insert:

```ts
// When curvedInset is on, precompute this cell's curved inner curves (plane-2D).
// Map edgeId -> samples | null; null edges fall back to the straight inset below.
let curvedByEdge: Map<number, Vector2[] | null> | null = null;
if (curvedInset) {
	const vertexPos2d = new Map<string, Vector2>();
	const cellEdgeInputs: CurvedCellEdge[] = [];
	for (const ei of edgeIdxs) {
		const pts3d = edgeProjections[ei].edgePoints3d;
		if (pts3d.length < 2) continue;
		const vS = vertexKey(edges[ei].vertices[0]);
		const vE = vertexKey(edges[ei].vertices[1]);
		if (!vertexPos2d.has(vS)) {
			const p = projectToPlane2D(pts3d[0], source, planePoint, normal, basis);
			if (p) vertexPos2d.set(vS, p);
		}
		if (!vertexPos2d.has(vE)) {
			const p = projectToPlane2D(pts3d[pts3d.length - 1], source, planePoint, normal, basis);
			if (p) vertexPos2d.set(vE, p);
		}
		cellEdgeInputs.push({ edgeId: ei, vKeyStart: vS, vKeyEnd: vE, sampleCount: pts3d.length });
	}
	curvedByEdge = buildCellCurvedInsets2d({
		edges: cellEdgeInputs,
		vertexPos2d,
		seed2d,
		curveOffsetFactor
	});
}
```

- [ ] **Step 5: Branch the per-sample inset inside the edge loop**

Replace the inner `for (let i = 0; i < pts.length; i++) { ... }` body so the inset point and intermediates come from the curved curve when available. The full replacement for the edge loop body (from `const pts = ...` down to the `divs.push(interPts);` closing) is:

```ts
const pts = edgeProjections[ei].edgePoints3d;
const isSideA = edges[ei].cellIndices[0] === cell;
const curve: Vector3[] = [];
const divs: Vector3[][] = [];

// Curved samples for this edge, only if every sample is present (length match).
const curvedRaw = curvedByEdge?.get(ei) ?? null;
const inner2dArr = curvedRaw && curvedRaw.length === pts.length ? curvedRaw : null;

for (let i = 0; i < pts.length; i++) {
	const anchor = pts[i];
	const e2d = projectToPlane2D(anchor, source, planePoint, normal, basis);
	if (!e2d) {
		curve.push(anchor.clone());
		divs.push([]);
		continue;
	}

	// inset2d: the inner point (curved or straight). interSource2d: rung
	// intermediates ordered inset -> edge in 2D.
	let inset2d: Vector2;
	let interSource2d: Vector2[];
	if (inner2dArr) {
		inset2d = inner2dArr[i];
		interSource2d = segmentIntermediates2D(inset2d, e2d, surfaceProjectionDivisions);
	} else {
		inset2d = insetPoint2D(e2d, seed2d, curveOffsetFactor);
		interSource2d = insetIntermediates2D(
			e2d,
			seed2d,
			curveOffsetFactor,
			surfaceProjectionDivisions
		);
	}

	const insetThrough = plane2DToPoint3D(inset2d, planePoint, basis);
	const insetPt =
		selectSurfaceHit({ surface, source, through: insetThrough, anchor, cellNormal: normal }) ??
		anchor.clone();
	curve.push(insetPt);

	const interPts = interSource2d.map((p2) => {
		const through = plane2DToPoint3D(p2, planePoint, basis);
		return (
			selectSurfaceHit({ surface, source, through, anchor, cellNormal: normal }) ?? anchor.clone()
		);
	});
	divs.push(interPts);
}
```

Leave the existing `if (isSideA) { ... } else { ... }` block that follows (the side-A / side-B assignment with the `divsB` reversal) exactly as-is.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/local-projection.test.ts`
Expected: PASS — including the two new `curvedInset` tests and all pre-existing tests (straight path unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/lib/voronoi/local-projection.ts src/lib/voronoi/__tests__/local-projection.test.ts
git commit -m "feat(voronoi): curvedInset path in localProjection with straight fallback"
```

---

## Task 6: Thread `curvedInset` through `generate-voronoi.ts`

**Files:**

- Modify: `src/lib/voronoi/generate-voronoi.ts:319-329`
- Test: `src/lib/voronoi/__tests__/generate-voronoi.test.ts`

- [ ] **Step 1: Write the failing test**

Append inside `describe('makeVoronoi', ...)` in `src/lib/voronoi/__tests__/generate-voronoi.test.ts`:

```ts
it('generates tubes with insetMethod localProjection + curvedInset', () => {
	const address: GlobuleAddress = { globule: 0 };
	const config: VoronoiConfig = {
		...makeTestConfig(),
		insetMethod: 'localProjection',
		curvedInset: true
	};
	const result = makeVoronoi(config, address, testSurfaceConfig);
	expect(result.tubes.length).toBeGreaterThan(0);
	result.tubes.forEach((tube) => {
		tube.bands.forEach((band) => expect(band.facets.length).toBeGreaterThan(0));
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/generate-voronoi.test.ts`
Expected: FAIL — `curvedInset` is not passed through, so the curved path never runs. (If the test still passes because the curved path produces valid tubes by coincidence, proceed: this test is primarily a smoke guard. To force a real RED, temporarily assert `result.tubes.length` against a curved-specific expectation is unnecessary — the wiring step below is the substantive change and is covered by the localProjection unit tests in Task 5.)

- [ ] **Step 3: Pass the flag through**

In `src/lib/voronoi/generate-voronoi.ts`, in the `if (config.insetMethod === 'localProjection')` branch, add `curvedInset` to the `computeEdgeInsetsLocalProjection` call:

```ts
edgeInsets = computeEdgeInsetsLocalProjection({
	edges: voronoiResult.edges,
	edgeProjections,
	seedPoints3d,
	surface,
	surfaceCenter: center,
	curveOffsetFactor,
	surfaceProjectionDivisions: config.surfaceProjectionDivisions ?? 0,
	curvedInset: config.curvedInset ?? false
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/voronoi/__tests__/generate-voronoi.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/voronoi/generate-voronoi.ts src/lib/voronoi/__tests__/generate-voronoi.test.ts
git commit -m "feat(voronoi): wire curvedInset config into generate-voronoi"
```

---

## Task 7: UI toggle in `VoronoiControl.svelte`

Make the flag reachable from the designer. Follows the existing `update(field, value)` pattern in the component.

**Files:**

- Modify: `src/components/controls/VoronoiControl.svelte`

- [ ] **Step 1: Extend the `update` field union and handler**

In `src/components/controls/VoronoiControl.svelte`, add `'curvedInset'` to the `field` union type (after `'insetMethod'`):

```ts
			| 'insetMethod'
			| 'curvedInset',
```

And add a branch in the `update` function (after the `insetMethod` branch, before the closing of the `if/else` chain):

```ts
		} else if (field === 'curvedInset') {
			next = { ...config, curvedInset: value === 'true' || value === true };
```

Note: the existing `update` signature is `(field, value: number | string)`. Pass the boolean as a string from the checkbox below (`String(e.currentTarget.checked)`), which the branch coerces back to boolean.

- [ ] **Step 2: Add the checkbox to the markup**

In the template, immediately after the "Inset Method" `<label>...</label>` block (the `<select>` for `insetMethod`, around line 119), add:

```svelte
<label class="checkbox">
	<input
		type="checkbox"
		checked={config.curvedInset ?? false}
		disabled={(config.insetMethod ?? 'centerOut') !== 'localProjection'}
		onchange={(e) => update('curvedInset', String(e.currentTarget.checked))}
	/>
	Curved Inset
</label>
```

(The `disabled` reflects that `curvedInset` only affects `localProjection`.)

- [ ] **Step 3: Typecheck the component**

Run: `npm run check`
Expected: PASS — no TypeScript/Svelte errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/controls/VoronoiControl.svelte
git commit -m "feat(voronoi): add Curved Inset toggle to VoronoiControl"
```

---

## Task 8: Full verification

- [ ] **Step 1: Run the full unit suite**

Run: `npm run test:unit`
Expected: PASS — all voronoi tests (new + existing) green.

- [ ] **Step 2: Typecheck + lint + format**

Run: `npm run check`
Expected: PASS.

Run: `npm run lint`
Expected: PASS (fix any reported issues).

Run: `npm run format`
Expected: formats files; commit any formatting changes.

- [ ] **Step 3: Final commit (if format changed anything)**

```bash
git add -A
git commit -m "chore(voronoi): format curvedInset changes"
```

---

## Self-Review Notes

- **Spec coverage:** config flag (Task 1, default false, localProjection-only) ✓; plane-2D bezier construction + parameter-`t` sampling (Tasks 2, 4) ✓; reuse shared outer edge by index, `EdgeInsets` shape unchanged (Task 5 — `inner2dArr.length === pts.length` guard, same side-A/B assignment) ✓; `surfaceProjectionDivisions` rungs via `segmentIntermediates2D(inner, edge)` (Tasks 3, 5) ✓; straight-inset fallback (Task 4 null result + Task 5 branch) ✓; tests for bezier, curved-2d, local-projection, generate-voronoi (Tasks 2,4,5,6) ✓; UI reachability (Task 7) ✓.
- **Type consistency:** `CurvedCellEdge` / `CurvedCellInput` / `buildCellCurvedInsets2d` / `vertexKey` names match across Tasks 4 and 5. `segmentIntermediates2D` signature `(from, to, divisions)` matches its use in Tasks 3 and 5. `sampleQuadratic(p0, ctrl, p1, t)` and `quadraticLineSplitT(p0, ctrl, p1, linePoint, lineDir)` match across Tasks 2 and 4.
- **Sampling correctness:** `sampleCount = edgePoints3d.length = N + 1` where `N` is the resolved adaptive division count; `half = N/2`; even `N` lands index `N/2` exactly on the inset midpoint `mE`; `N=3` yields the spec's 2/3 and 1/3 interior points. Verified against the worked example in the spec.
- **Note on Task 6 Step 2:** the generate-voronoi test is a smoke guard; the substantive curved behavior is RED/GREEN-verified by Task 5's unit tests.
