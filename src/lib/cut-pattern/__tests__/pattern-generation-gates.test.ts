import { describe, it, expect } from '@jest/globals';

import {
	resolvePatternGenerationTargets,
	type PatternGenerationAvailability
} from '../pattern-generation-gates';
import type { PipelineGates } from '$lib/types';

const gates = (overrides: Partial<PipelineGates> = {}): PipelineGates => ({
	globule: false,
	globuleTube: false,
	projection: false,
	voronoi: false,
	...overrides
});

const availability = (
	overrides: Partial<PatternGenerationAvailability> = {}
): PatternGenerationAvailability => ({
	hasGlobuleTubes: true,
	hasProjectionTubes: false,
	hasSurfaceProjectionTubes: false,
	hasVoronoiTubes: false,
	hasVoronoiSurfaceTubes: false,
	...overrides
});

describe('resolvePatternGenerationTargets', () => {
	// The regression this guards: the pattern store used to hardcode
	// `showGlobuleTubeGeometry.any = false`, so a bare-globule model (projection
	// and voronoi both hidden) generated no pattern at all.
	it('generates the globule-tube pattern when the globuleTube pipeline is on', () => {
		const targets = resolvePatternGenerationTargets(
			gates({ globuleTube: true }),
			'globule',
			true,
			availability()
		);
		expect(targets.globuleTube).toBe(true);
	});

	it('generates the globule-tube pattern only for the globule source', () => {
		// `globule` is a pattern source like the others: its tubes are collated only
		// when it is selected, so generating them under another source is waste.
		for (const source of [
			'projection',
			'surfaceProjection',
			'voronoi',
			'voronoiSurface'
		] as const) {
			const targets = resolvePatternGenerationTargets(
				gates({ globuleTube: true }),
				source,
				true,
				availability()
			);
			expect(targets.globuleTube).toBe(false);
		}
	});

	// `generateProjectionPattern` reads `tubes[0].address`, so an empty tube set is a
	// crash, not an empty result. Flipping a viewControl `any` flag re-runs pattern
	// generation before the worker has regenerated the geometry, so this really happens.
	it('skips every variant whose tubes are not generated yet', () => {
		const targets = resolvePatternGenerationTargets(
			gates({ globuleTube: true, projection: true, voronoi: true }),
			'globule',
			true,
			availability({ hasGlobuleTubes: false })
		);
		expect(targets.globuleTube).toBe(false);
		expect(targets.projection).toBe(false);
		expect(targets.surfaceProjection).toBe(false);
		expect(targets.voronoi).toBe(false);
		expect(targets.voronoiSurface).toBe(false);
	});

	it('skips the globule-tube pattern when the globuleTube pipeline is off', () => {
		const targets = resolvePatternGenerationTargets(
			gates({ projection: true }),
			'projection',
			true,
			availability({ hasProjectionTubes: true })
		);
		expect(targets.globuleTube).toBe(false);
	});

	it('skips every band pattern when showBands is off', () => {
		const targets = resolvePatternGenerationTargets(
			gates({ globuleTube: true, projection: true, voronoi: true }),
			'globule',
			false,
			availability({ hasProjectionTubes: true, hasVoronoiTubes: true })
		);
		expect(targets.globuleTube).toBe(false);
		expect(targets.projection).toBe(false);
		expect(targets.voronoi).toBe(false);
	});

	it('generates the projection pattern only for the projection source', () => {
		const on = resolvePatternGenerationTargets(
			gates({ projection: true }),
			'projection',
			true,
			availability({ hasProjectionTubes: true })
		);
		expect(on.projection).toBe(true);
		expect(on.surfaceProjection).toBe(false);

		const off = resolvePatternGenerationTargets(
			gates({ projection: true }),
			'surfaceProjection',
			true,
			availability({ hasProjectionTubes: true })
		);
		expect(off.projection).toBe(false);
	});

	it('generates the surface-projection pattern only when surface tubes exist', () => {
		const without = resolvePatternGenerationTargets(
			gates({ projection: true }),
			'surfaceProjection',
			true,
			availability({ hasProjectionTubes: true })
		);
		expect(without.surfaceProjection).toBe(false);

		const with_ = resolvePatternGenerationTargets(
			gates({ projection: true }),
			'surfaceProjection',
			true,
			availability({ hasProjectionTubes: true, hasSurfaceProjectionTubes: true })
		);
		expect(with_.surfaceProjection).toBe(true);
	});

	it('generates the voronoi patterns only for their matching source', () => {
		const surface = resolvePatternGenerationTargets(
			gates({ voronoi: true }),
			'voronoiSurface',
			true,
			availability({ hasVoronoiTubes: true, hasVoronoiSurfaceTubes: true })
		);
		expect(surface.voronoiSurface).toBe(true);
		expect(surface.voronoi).toBe(false);
	});

	it('generates the legacy super-globule pattern only when the globule pipeline is on', () => {
		expect(
			resolvePatternGenerationTargets(gates({ globule: true }), 'projection', true, availability())
				.superGlobule
		).toBe(true);
		expect(
			resolvePatternGenerationTargets(gates(), 'projection', true, availability()).superGlobule
		).toBe(false);
	});
});
