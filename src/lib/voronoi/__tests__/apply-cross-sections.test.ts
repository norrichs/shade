import { Vector3 } from 'three';
import { applyCrossSectionsToEdge } from '../apply-cross-sections';
import type { CrossSectionConfig } from '$lib/projection-geometry/types';

const makeSimpleCrossSection = (): CrossSectionConfig => ({
	curves: [
		{
			type: 'BezierConfig',
			points: [
				{ type: 'PointConfig2', x: 0, y: 0 },
				{ type: 'PointConfig2', x: 0.33, y: 0 },
				{ type: 'PointConfig2', x: 0.66, y: 0 },
				{ type: 'PointConfig2', x: 1, y: 0 }
			]
		}
	],
	center: { x: 0.5, y: 0 },
	sampleMethod: { method: 'divideCurvePath', divisions: 3 },
	scaling: { width: 10, height: 10 },
	shouldSkewCurve: false
});

describe('applyCrossSectionsToEdge', () => {
	it('returns one section per sample point', () => {
		const edgePoints = [
			new Vector3(0, 0, 0),
			new Vector3(1, 0, 0),
			new Vector3(2, 0, 0)
		];
		const curvePoints = [
			new Vector3(0, 1, 0),
			new Vector3(1, 1, 0),
			new Vector3(2, 1, 0)
		];
		const normals = [
			new Vector3(0, 0, 1),
			new Vector3(0, 0, 1),
			new Vector3(0, 0, 1)
		];

		const sections = applyCrossSectionsToEdge(
			edgePoints,
			curvePoints,
			normals,
			makeSimpleCrossSection()
		);

		expect(sections).toHaveLength(3);
	});

	it('each section has intersections and crossSectionPoints', () => {
		const edgePoints = [new Vector3(0, 0, 0)];
		const curvePoints = [new Vector3(0, 5, 0)];
		const normals = [new Vector3(0, 0, 1)];

		const sections = applyCrossSectionsToEdge(
			edgePoints,
			curvePoints,
			normals,
			makeSimpleCrossSection()
		);

		expect(sections[0].intersections.edge).toBeDefined();
		expect(sections[0].intersections.curve).toBeDefined();
		expect(sections[0].crossSectionPoints.length).toBeGreaterThan(0);
	});

	it('cross-section points are centered on the edge point', () => {
		const edgePoints = [new Vector3(10, 0, 0)];
		const curvePoints = [new Vector3(10, 5, 0)];
		const normals = [new Vector3(0, 0, 1)];

		const sections = applyCrossSectionsToEdge(
			edgePoints,
			curvePoints,
			normals,
			makeSimpleCrossSection()
		);

		const centroid = new Vector3();
		sections[0].crossSectionPoints.forEach((p) => centroid.add(p));
		centroid.divideScalar(sections[0].crossSectionPoints.length);

		expect(centroid.x).toBeCloseTo(10, 1);
	});
});
