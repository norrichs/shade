import { describe, it, expect } from '@jest/globals';

import { generateSections } from '../generate-level';
import { generateLevelPrototype } from '../generate-shape';
import type { GlobuleConfig } from '../types';
import sconce from './asymmetric-sconce-globule.fixture.json';

describe('preserveAspectRatio silhouette sampling', () => {
	// The sconce silhouette starts at x = 0, so its first level collapses to a pole.
	// Pole quads have zero width, which used to poison the division search with
	// Infinity/NaN aspect ratios and make getPointAt return null.
	it('generates finite sections for a silhouette that starts at a pole', () => {
		const globule = sconce as unknown as GlobuleConfig;
		const prototype = generateLevelPrototype(globule.shapeConfig, globule.levelConfig);
		const sections = generateSections(
			globule.levelConfig,
			globule.silhouetteConfig,
			globule.depthCurveConfig,
			prototype
		);
		expect(sections).toHaveLength(globule.levelConfig.silhouetteSampleMethod.divisions + 1);
		sections.forEach((s) =>
			s.points.forEach((p) => {
				expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
			})
		);
		const zs = sections.map((s) => s.points[0].z);
		zs.slice(1).forEach((z, i) => expect(z).not.toBe(zs[i]));
	});
});
