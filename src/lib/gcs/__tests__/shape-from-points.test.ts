import { describe, it, expect } from '@jest/globals';
import { Vector2 } from 'three';

import { shapeConfigFromPoints } from '../shape-from-points';
import { generateLevelPrototype, validateGlobuleShapeConfigs } from '../../generate-shape';
import { generateDefaultGlobuleConfig } from '../../shades-config';

const irregular = (n: number, scale = 1) =>
	Array.from({ length: n }, (_, i) => {
		const a = (i / n) * Math.PI * 2;
		const r = (40 + 15 * Math.sin(3 * a) + 5 * Math.cos(5 * a)) * scale;
		return new Vector2(r * Math.cos(a) + 7, r * Math.sin(a) - 3);
	});

describe('shapeConfigFromPoints', () => {
	it('round-trips through generateLevelPrototype with vertex k = point k', () => {
		const points = irregular(12);
		const shape = shapeConfigFromPoints(points, { id: 1, level: 0, isPrimary: true });
		const { vertices } = generateLevelPrototype(shape);
		expect(vertices).toHaveLength(12);
		vertices.forEach((vertex, k) => {
			expect(vertex.x).toBeCloseTo(points[k].x / 200, 9);
			expect(vertex.y).toBeCloseTo(points[k].y / 200, 9);
		});
	});

	it('writes an asymmetric, pinned, linearly blended GCS', () => {
		const shape = shapeConfigFromPoints(irregular(6), { id: 4, level: 3, isPrimary: false });
		expect(shape).toMatchObject({
			type: 'ShapeConfig',
			id: 4,
			level: 3,
			symmetry: 'asymmetric',
			symmetryNumber: 1,
			sampleMethod: { method: 'divideCurve', divisions: 1 },
			blend: { mode: 'linear' }
		});
		expect(shape).not.toHaveProperty('isPrimary');
		expect(shape.curves).toHaveLength(6);
	});

	it('produces a list the multi-GCS validator accepts', () => {
		const globule = structuredClone(generateDefaultGlobuleConfig());
		const divisions = globule.levelConfig.silhouetteSampleMethod.divisions;
		globule.shapeConfigs = [0, Math.floor(divisions / 2), divisions].map((level, i) =>
			shapeConfigFromPoints(irregular(12, 1 + i * 0.2), { id: i + 1, level, isPrimary: i === 0 })
		);
		expect(validateGlobuleShapeConfigs(globule).errors).toEqual([]);
	});
});
