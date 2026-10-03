import { defaultProjectionConfig } from '../configs';
import { makeProjection } from '../generate-projection';
import { edgeKey } from '../edge-sampling';
import { defaultCapsuleConfig } from '../surface-definitions';
import type { BaseProjectionConfig, EdgeSamplingConfig, Polyhedron } from '../types';

const identity = {
	translate: { x: 0, y: 0, z: 0 },
	scale: { x: 1, y: 1, z: 1 },
	rotate: { x: 0, y: 0, z: 0 }
};

/** Icosahedron draped on a capsule, so equal polyhedron edges drape to different lengths. */
const capsuleProjection = (edgeSampling?: EdgeSamplingConfig): BaseProjectionConfig => {
	const config = structuredClone(defaultProjectionConfig) as BaseProjectionConfig;
	config.surfaceConfig = { ...defaultCapsuleConfig, transform: identity };
	config.projectorConfig.polyhedron.transform = identity;
	if (edgeSampling) config.edgeSampling = edgeSampling;
	return config;
};

const edgePointCounts = (polyhedron: Polyhedron) =>
	polyhedron.polygons.flatMap((polygon) => polygon.edges.map((e) => e.edgePoints.length));

/** Section count per polyhedron edge key, across every polygon using that edge. */
const countsByEdge = (polyhedron: Polyhedron) => {
	const byKey = new Map<string, Set<number>>();
	for (const polygon of polyhedron.polygons) {
		for (const edge of polygon.edges) {
			const pts = edge.edgePoints;
			const key = edgeKey(pts[0], pts[pts.length - 1]);
			byKey.set(key, (byKey.get(key) ?? new Set()).add(pts.length));
		}
	}
	return byKey;
};

describe('makeProjection edge sampling', () => {
	it('samples each edge at its edge curve count when no edge sampling is configured', () => {
		const config = capsuleProjection();
		const { polyhedron } = makeProjection(config, { globule: 0 });
		const expected = config.projectorConfig.polyhedron.polygons.flatMap((polygon) =>
			polygon.edges.map((edge) => {
				const method = config.projectorConfig.polyhedron.edgeCurves[edge.widthCurve].sampleMethod;
				return method.divisions + 1;
			})
		);
		expect(edgePointCounts(polyhedron)).toEqual(expected);
	});

	it('gives adaptive counts from min to max by draped length, equal on both sides of an edge', () => {
		const { polyhedron, tubes } = makeProjection(
			capsuleProjection({ divisionsSource: 'adaptive', edgeDivisions: [2, 8] }),
			{ globule: 0 }
		);
		const counts = edgePointCounts(polyhedron);
		expect(Math.min(...counts)).toBe(3);
		expect(Math.max(...counts)).toBe(9);
		for (const sizes of countsByEdge(polyhedron).values()) {
			expect(sizes.size).toBe(1);
		}
		expect(tubes.length).toBeGreaterThan(0);
	});

	it('multiplies the edge curve count in edge-curve mode', () => {
		const config = capsuleProjection({ edgeDivisionsMultiplier: 2 });
		const { polyhedron } = makeProjection(config, { globule: 0 });
		const base = makeProjection(capsuleProjection(), { globule: 0 }).polyhedron;
		const doubled = edgePointCounts(base).map((n) => (n - 1) * 2 + 1);
		expect(edgePointCounts(polyhedron)).toEqual(doubled);
	});

	it('places curve points at a constant offset toward the polygon center in offset mode', () => {
		const { polyhedron } = makeProjection(
			capsuleProjection({ curveSource: 'offset', curveOffset: 0.25 }),
			{ globule: 0 }
		);
		const polygon = polyhedron.polygons[0];
		const vertices = polygon.edges.map((e) => e.edgePoints[0]);
		const center = vertices
			.reduce((sum, v) => sum.add(v), vertices[0].clone().multiplyScalar(0))
			.divideScalar(vertices.length);
		const edge = polygon.edges[0];
		expect(edge.curvePoints).toHaveLength(edge.edgePoints.length);
		edge.edgePoints.forEach((p, i) => {
			const expected = p.clone().lerp(center, 0.25);
			expect(edge.curvePoints[i].distanceTo(expected)).toBeLessThan(1e-6);
		});
	});
});
