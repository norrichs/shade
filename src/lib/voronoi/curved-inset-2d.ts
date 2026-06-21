import { Vector2 } from 'three';
import { sampleQuadratic, quadraticLineSplitT } from './bezier-2d';

/** Stable key for a Voronoi vertex coordinate; equal coords (shared vertices) collide. */
export function vertexKey(coord: [number, number]): string {
	return `${coord[0].toFixed(6)},${coord[1].toFixed(6)}`;
}

export type CurvedCellEdge = {
	edgeId: number; // caller's global edge index, echoed back in the output map
	// Stable per-corner keys; two edges meeting at one corner must share the key (the
	// caller keys by 3D endpoint position so coincident corners pair regardless of id).
	vKeyStart: string;
	vKeyEnd: string;
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
