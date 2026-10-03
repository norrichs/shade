import { Vector3 } from 'three';
import { generateSurface } from '../generate-projection';
import {
	DEFAULT_EDGE_SAMPLING,
	curvedOffsetCurvePoints,
	drapedEdgeLength,
	edgeKey,
	offsetCurvePoints,
	resolveEdgeSampling
} from '../edge-sampling';
import type { SurfaceConfig } from '../types';

const identity = {
	translate: { x: 0, y: 0, z: 0 },
	scale: { x: 1, y: 1, z: 1 },
	rotate: { x: 0, y: 0, z: 0 }
};

const capsule = (): SurfaceConfig => ({
	type: 'CapsuleConfig',
	radius: 50,
	height: 200,
	center: { x: 0, y: 0, z: 0 },
	capSegments: 16,
	radialSegments: 64,
	heightSegments: 1,
	transform: identity
});

describe('resolveEdgeSampling', () => {
	it('fills every field with the edge-curve defaults when the config is missing', () => {
		expect(resolveEdgeSampling(undefined)).toEqual(DEFAULT_EDGE_SAMPLING);
		expect(DEFAULT_EDGE_SAMPLING.curveSource).toBe('edgeCurve');
		expect(DEFAULT_EDGE_SAMPLING.divisionsSource).toBe('edgeCurve');
		expect(DEFAULT_EDGE_SAMPLING.edgeDivisionsMultiplier).toBe(1);
	});

	it('normalizes min/max order, the multiplier and the offset range', () => {
		const resolved = resolveEdgeSampling({
			edgeDivisions: [9, 3],
			edgeDivisionsMultiplier: 2.6,
			curveOffset: 1.4
		});
		expect(resolved.edgeDivisions).toEqual([3, 9]);
		expect(resolved.edgeDivisionsMultiplier).toBe(3);
		expect(resolved.curveOffset).toBeLessThan(1);
		expect(resolved.curveOffset).toBeGreaterThan(0);
	});
});

describe('offsetCurvePoints', () => {
	it('places each curve point the offset fraction of the way to the polygon center', () => {
		const center = new Vector3(0, 10, 0);
		const edge = [new Vector3(0, 0, 0), new Vector3(10, 0, 0)];
		const curve = offsetCurvePoints(edge, center, 0.25);
		expect(curve[0].toArray()).toEqual([0, 2.5, 0]);
		expect(curve[1].toArray()).toEqual([7.5, 2.5, 0]);
		// inputs untouched
		expect(edge[1].toArray()).toEqual([10, 0, 0]);
	});
});

describe('edgeKey', () => {
	it('is the same for both directions of an edge', () => {
		const a = new Vector3(1, 2, 3);
		const b = new Vector3(4, 5, 6);
		expect(edgeKey(a, b)).toBe(edgeKey(b, a));
		expect(edgeKey(a, b)).not.toBe(edgeKey(a, new Vector3(4, 5, 7)));
	});
});

describe('drapedEdgeLength', () => {
	const surface = generateSurface(capsule());
	const center = new Vector3(0, 0, 0);

	it('measures the path the edge traces on the surface, not the straight edge', () => {
		// A vertical edge in front of the capsule body lands on the cylinder wall
		// (x = 50) between y = ±15, so its draped length is 30 regardless of how far
		// out the straight edge is.
		const length = drapedEdgeLength({
			v0: new Vector3(500, -150, 0),
			v1: new Vector3(500, 150, 0),
			surface,
			center
		});
		expect(length).toBeCloseTo(30, 0);
	});

	it('gives equal straight edges different lengths on the body and over a cap', () => {
		// Both straight edges are 80 long. The body edge lands on the wall between
		// y = ±20 (draped 40); the cap edge, seen from the center, spans a far wider
		// arc of the top hemisphere (draped ≈ 80).
		const body = drapedEdgeLength({
			v0: new Vector3(100, -40, 0),
			v1: new Vector3(100, 40, 0),
			surface,
			center
		});
		const cap = drapedEdgeLength({
			v0: new Vector3(-40, 150, 0),
			v1: new Vector3(40, 150, 0),
			surface,
			center
		});
		expect(body).toBeCloseTo(40, 0);
		expect(cap).toBeGreaterThan(body * 1.5);
	});

	it('falls back to the straight length when a ray misses the surface', () => {
		const length = drapedEdgeLength({
			v0: new Vector3(0, 0, 0),
			v1: new Vector3(3, 4, 0),
			surface: generateSurface(capsule()),
			center: new Vector3(5000, 0, 0)
		});
		expect(length).toBeCloseTo(5, 6);
	});
});

describe('curvedOffsetCurvePoints', () => {
	// A square in the z = 5 plane, edges sampled at 4 sections each, walked in order.
	const corners = [
		new Vector3(-10, -10, 5),
		new Vector3(10, -10, 5),
		new Vector3(10, 10, 5),
		new Vector3(-10, 10, 5)
	];
	const sections = 4;
	const edgePoints = corners.map((c, i) => {
		const next = corners[(i + 1) % corners.length];
		return Array.from({ length: sections + 1 }, (_, j) => c.clone().lerp(next, j / sections));
	});
	const center = new Vector3(0, 0, 5);
	const f = 0.3;
	const curves = curvedOffsetCurvePoints(edgePoints, center, f);

	it('returns one inner point per edge point for every edge', () => {
		curves.forEach((curve, i) => expect(curve).toHaveLength(edgePoints[i].length));
	});

	it('passes through the straight inset midpoint of each edge', () => {
		curves.forEach((curve, i) => {
			const straightMid = edgePoints[i][sections / 2].clone().lerp(center, f);
			expect(curve![sections / 2].distanceTo(straightMid)).toBeLessThan(1e-9);
		});
	});

	it('is continuous around the polygon: each edge ends where the next begins', () => {
		curves.forEach((curve, i) => {
			const next = curves[(i + 1) % curves.length]!;
			expect(curve![curve!.length - 1].distanceTo(next[0])).toBeLessThan(1e-9);
		});
	});

	it('rounds each corner inside the straight inset corner, in the polygon plane', () => {
		curves.forEach((curve, i) => {
			const straightCorner = corners[i].clone().lerp(center, f);
			expect(curve![0].distanceTo(center)).toBeLessThan(straightCorner.distanceTo(center));
			curve!.forEach((p) => expect(p.z).toBeCloseTo(5, 9));
		});
	});

	it('returns null for an edge too short to curve, so the caller keeps the straight inset', () => {
		const result = curvedOffsetCurvePoints(
			edgePoints.map((pts, i) => (i === 0 ? [pts[0]] : pts)),
			center,
			f
		);
		expect(result[0]).toBeNull();
	});
});
