import { describe, it, expect } from '@jest/globals';
import type { Band } from '#lib/types.js';
import type { Tube } from '#lib/projection-geometry/types.js';
import type { BandSpace, PatternBandSpaceOf } from '#lib/cut-pattern/pattern-band-space.js';
import { resolveHighlightedBand } from '../resolve-band';

const band = (tube: number, b: number) =>
	({
		facets: [{ address: { globule: 0, tube, band: b, facet: 0 } }],
		visible: true
	}) as unknown as Band;
const tube = (t: number, count: number) =>
	({
		address: { globule: 0, tube: t },
		bands: Array.from({ length: count }, (_, b) => band(t, b))
	}) as unknown as Tube;

const tubes = [tube(0, 4), tube(1, 4)];
// Pattern band 1 of tube 0 is real band 2 (e.g. a hidden band 1 dropped).
const space: BandSpace = {
	toReal: (t, pb) => (t === 0 ? [0, 2, 3, 9][pb] : pb),
	toPattern: () => undefined
};
const spaces: PatternBandSpaceOf = () => space;
const tubesOf = () => tubes;

describe('resolveHighlightedBand', () => {
	it('null highlight → null', () => {
		expect(resolveHighlightedBand(null, tubesOf, spaces)).toBeNull();
	});

	it('maps pattern → real through the band space', () => {
		const r = resolveHighlightedBand(
			{ source: 'projection', band: { globule: 0, tube: 0, band: 1 }, ring: [] },
			tubesOf,
			spaces
		);
		expect(r?.band).toBe(tubes[0].bands[2]);
		expect(r?.label).toBe('t0/b1');
		expect(r?.key).toBe('projection:g0t0b2');
	});

	it('stale address → null', () => {
		const h = { source: 'projection' as const, band: { globule: 0, tube: 0, band: 3 }, ring: [] };
		expect(resolveHighlightedBand(h, tubesOf, spaces)).toBeNull();
		const missingTube = { ...h, band: { globule: 0, tube: 7, band: 0 } };
		expect(resolveHighlightedBand(missingTube, tubesOf, spaces)).toBeNull();
	});

	it('source without tubes → null', () => {
		const h = { source: 'globule' as const, band: { globule: 0, tube: 0, band: 0 }, ring: [] };
		expect(resolveHighlightedBand(h, () => undefined, spaces)).toBeNull();
	});
});
