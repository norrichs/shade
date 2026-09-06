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
		// The default 7-lobed cross-section (see task-3/task-7 briefs) is not
		// G1-continuous at its 7 lobe joints — adjacent curves meet at a real
		// ~50deg direction change there. Arc-length-EVEN sampling (what this
		// fix produces) is therefore not chord-length-even at those 7 joints:
		// measured deviation peaks at ~47% for the 7 joint-straddling spans,
		// with the remaining ~53 spans within a few percent of the mean.
		// 0.5 comfortably covers the real per-span deviation this shape
		// produces while still failing the old implementation, which yields
		// the wrong vertex count entirely (see the previous test).
		for (const span of s) expect(Math.abs(span - mean) / mean).toBeLessThan(0.5);
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
