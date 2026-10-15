import { describe, it, expect } from '@jest/globals';

import { generateSections, getSilhouetteSpans } from '../generate-level';
import { generateLevelPrototype, generateSilhouette } from '../generate-shape';
import type { GlobuleConfig, NarrowRegionConfig, SilhouetteConfig } from '../types';
import type { Section } from '../projection-geometry/types';
import sconce from './asymmetric-sconce-globule.fixture.json';

const sconceGlobule = sconce as unknown as GlobuleConfig;

const sectionsFor = (
	globule: GlobuleConfig,
	narrowRegion?: NarrowRegionConfig,
	divisions = globule.levelConfig.silhouetteSampleMethod.divisions
) => {
	const levelConfig = {
		...globule.levelConfig,
		silhouetteSampleMethod: { method: 'preserveAspectRatio' as const, divisions, narrowRegion }
	};
	const prototype = generateLevelPrototype(globule.shapeConfig, levelConfig);
	return generateSections(
		levelConfig,
		globule.silhouetteConfig,
		globule.depthCurveConfig,
		prototype
	);
};

const expectFinite = (sections: Section[]) =>
	sections.forEach((s) =>
		s.points.forEach((p) => {
			expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
		})
	);

/** Distance of each level's first vertex from the axis. */
const radii = (sections: Section[]) =>
	sections.map((s) => Math.hypot(s.points[0].x, s.points[0].y));

/**
 * Level radius per unit of silhouette x, read off the sconce's last level, which
 * sits exactly on the silhouette's end point. Both test globules share its
 * prototype and depth curve.
 */
const radiusPerX = (() => {
	const curves = sconceGlobule.silhouetteConfig.curves;
	const endX = curves[curves.length - 1].points[3].x;
	const plain = sectionsFor(sconceGlobule);
	return radii(plain)[plain.length - 1] / endX;
})();

/** Levels whose silhouette x is below `width`. */
const countNarrowLevels = (sections: Section[], width: number) =>
	radii(sections).filter((r) => r < radiusPerX * width * 0.999).length;

/** Height / width of each quad on band 0, measured like the division search does. */
const bandAspectRatios = (sections: Section[]) =>
	sections.slice(1).map((upper, i) => {
		const [a0, a1] = sections[i].points;
		const [b0, b1] = upper.points;
		const width = a0.clone().add(b0).distanceTo(a1.clone().add(b1)) / 2;
		const height = a0.clone().add(a1).distanceTo(b0.clone().add(b1)) / 2;
		return height / width;
	});

/** Straight segments as cubic beziers, from a polyline of silhouette points. */
const polylineSilhouette = (points: [number, number][]): SilhouetteConfig =>
	({
		type: 'SilhouetteConfig',
		curves: points.slice(1).map(([x1, y1], i) => {
			const [x0, y0] = points[i];
			const at = (f: number) => ({
				type: 'PointConfig2',
				x: x0 + (x1 - x0) * f,
				y: y0 + (y1 - y0) * f
			});
			return { type: 'BezierConfig', points: [at(0), at(1 / 3), at(2 / 3), at(1)] };
		})
	}) as unknown as SilhouetteConfig;

// Pole, wide, waist, wide, pole: narrow spans at both ends and in the middle.
const hourglass: GlobuleConfig = {
	...sconceGlobule,
	silhouetteConfig: polylineSilhouette([
		[0, 0],
		[100, -25],
		[20, -50],
		[100, -75],
		[0, -100]
	])
};

describe('preserveAspectRatio silhouette sampling', () => {
	// The sconce silhouette starts at x = 0, so its first level collapses to a pole.
	// Pole quads have zero width, which used to poison the division search with
	// Infinity/NaN aspect ratios and make getPointAt return null.
	it('generates finite sections for a silhouette that starts at a pole', () => {
		const sections = sectionsFor(sconceGlobule);
		expect(sections).toHaveLength(sconceGlobule.levelConfig.silhouetteSampleMethod.divisions + 1);
		expectFinite(sections);
		const zs = sections.map((s) => s.points[0].z);
		zs.slice(1).forEach((z, i) => expect(z).not.toBe(zs[i]));
	});
});

describe('preserveAspectRatio narrow region', () => {
	it('splits the silhouette where x crosses the width', () => {
		const spans = getSilhouetteSpans(generateSilhouette(hourglass.silhouetteConfig), 50);
		expect(spans.map((s) => s.narrow)).toEqual([true, false, true, false, true]);
		expect(spans[0].t0).toBe(0);
		expect(spans[spans.length - 1].t1).toBe(1);
		spans.slice(1).forEach((s, i) => expect(s.t0).toBe(spans[i].t1));
	});

	it('changes nothing when disabled', () => {
		const plain = sectionsFor(sconceGlobule);
		[
			{ width: 0, aspectRatio: 1 },
			{ width: 40, aspectRatio: 0 },
			{ width: 1000, aspectRatio: 1 }
		]
			.map((narrowRegion) => sectionsFor(sconceGlobule, narrowRegion))
			.forEach((sections) => expect(sections).toEqual(plain));
	});

	// The sconce's flat top runs into its pole, where a constant aspect ratio packs
	// over half of its 30 levels below x = 40.
	it('spends fewer levels on the narrow span, at the configured aspect at its edge', () => {
		const width = 40;
		const aspectRatio = 0.5;
		const plain = sectionsFor(sconceGlobule);
		const limited = sectionsFor(sconceGlobule, { width, aspectRatio });
		expect(limited).toHaveLength(plain.length);
		expectFinite(limited);

		const narrowLevels = (sections: Section[]) => countNarrowLevels(sections, width);
		expect(narrowLevels(plain)).toBeGreaterThan(14);
		expect(narrowLevels(limited)).toBeLessThanOrEqual(11);

		const ratios = bandAspectRatios(limited);
		const lastNarrowQuad = narrowLevels(limited) - 1;
		expect(ratios[lastNarrowQuad]).toBeGreaterThan(aspectRatio * 0.8);
		expect(ratios[lastNarrowQuad]).toBeLessThan(aspectRatio * 1.25);
		// Narrow quads hold a height, so their aspect ratio grows toward the pole.
		for (let i = 1; i <= lastNarrowQuad; i++) expect(ratios[i]).toBeLessThan(ratios[i - 1]);
	});

	it('leaves every wide span at least one quad when the narrow spans want them all', () => {
		const sections = sectionsFor(hourglass, { width: 50, aspectRatio: 0.001 }, 6);
		expect(sections).toHaveLength(7);
		expectFinite(sections);
		const zs = sections.map((s) => s.points[0].z);
		zs.slice(1).forEach((z, i) => expect(z).toBeLessThan(zs[i]));
	});

	it('shares the wide quads between wide spans at a common aspect ratio', () => {
		const sections = sectionsFor(hourglass, { width: 50, aspectRatio: 2 }, 60);
		expect(sections).toHaveLength(61);
		expectFinite(sections);
		const radius = radii(sections);
		const ratios = bandAspectRatios(sections);
		const boundary = radiusPerX * 50 * 0.999;
		const isWide = ratios.map((_, i) => radius[i] >= boundary && radius[i + 1] >= boundary);
		const wide = ratios.filter((_, i) => isWide[i]);
		// The hourglass is symmetric, so its two wide spans split the quads evenly.
		const runs = isWide
			.map((w) => (w ? '1' : ' '))
			.join('')
			.trim()
			.split(/ +/)
			.map((run) => run.length);
		expect(runs).toHaveLength(2);
		expect(Math.abs(runs[0] - runs[1])).toBeLessThanOrEqual(1);
		expect(wide.length).toBeGreaterThan(30);
		const mean = wide.reduce((sum, r) => sum + r, 0) / wide.length;
		wide.forEach((r) => expect(Math.abs(r - mean) / mean).toBeLessThan(0.25));
	});
});
