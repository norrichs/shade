import { describe, it, expect } from '@jest/globals';
import { buildBandSpace } from '../pattern-band-index';
import {
	assemblerHighlightToReal,
	bandSpaceForTubes,
	patternBandSelectionToReal,
	patternBandToReal,
	patternFacetToReal,
	realBandToPattern
} from '../pattern-band-space';
import type { Tube } from '$lib/projection-geometry/types';

/**
 * Task 12: pattern band addresses count only the bands that were patterned
 * (visible, and not fill bands for non-outlined patterns); 3D tube arrays are
 * indexed by real band. Sites that cross between the pattern pane and the 3D
 * view must map through the band space, not reuse the number.
 *
 * Fixture bands carry facet addresses with their real index, as generation
 * writes them (after fill insertion, `reindexBandAddresses`).
 */

type BandSpec = { visible?: boolean; isFill?: boolean };

const tube = (t: number, specs: BandSpec[]): Tube =>
	({
		address: { globule: 0, tube: t },
		bands: specs.map((spec, b) => ({
			visible: spec.visible ?? true,
			isFill: spec.isFill,
			facets: [{ address: { globule: 0, tube: t, band: b, facet: 0 } }]
		}))
	}) as unknown as Tube;

const plain = (t: number, b: number) => ({ globule: 0, tube: t, band: b });

// Tube 0 hides real band 1; tube 1 hides real band 0. Different gaps per tube.
const hiddenTubes = [
	tube(0, [{}, { visible: false }, {}, {}]),
	tube(1, [{ visible: false }, {}, {}, {}])
];
// fillAll: a fill band before and after the real bands of every tube.
const fillTubes = [
	tube(0, [{ isFill: true }, {}, {}, { isFill: true }]),
	tube(1, [{ isFill: true }, {}, {}, { isFill: true }])
];
const allVisibleTubes = [tube(0, [{}, {}, {}]), tube(1, [{}, {}, {}])];

describe('buildBandSpace: pattern → real', () => {
	it('with a hidden band, pattern band k maps to the k-th visible real band of its own tube', () => {
		const space = buildBandSpace(hiddenTubes);
		expect([0, 1, 2, 3].map((b) => space.toReal(0, b))).toEqual([0, 2, 3, undefined]);
		expect([0, 1, 2, 3].map((b) => space.toReal(1, b))).toEqual([1, 2, 3, undefined]);
	});

	it('round-trips real → pattern → real for every visible band, and pattern → real → pattern', () => {
		const space = buildBandSpace(hiddenTubes);
		for (const t of [0, 1]) {
			for (let real = 0; real < 4; real++) {
				const pattern = space.toPattern(t, real);
				if (pattern === undefined) continue;
				expect(space.toReal(t, pattern)).toBe(real);
			}
			for (let pattern = 0; pattern < 3; pattern++) {
				expect(space.toPattern(t, space.toReal(t, pattern)!)).toBe(pattern);
			}
		}
	});

	it('fillAll: tiled patterns drop fill bands, so pattern band k is real band k + 1', () => {
		const space = bandSpaceForTubes(fillTubes, false)!;
		expect([0, 1, 2].map((b) => space.toReal(0, b))).toEqual([1, 2, undefined]);
		expect(space.toPattern(0, 0)).toBeUndefined();
		expect(space.toPattern(0, 2)).toBe(1);
	});

	it('fillAll: outlined patterns keep fill bands, so the spaces coincide', () => {
		const space = bandSpaceForTubes(fillTubes, true)!;
		expect([0, 1, 2, 3].map((b) => space.toReal(0, b))).toEqual([0, 1, 2, 3]);
	});

	it('all visible, no fill: identity (unchanged)', () => {
		const space = bandSpaceForTubes(allVisibleTubes, false)!;
		for (const t of [0, 1])
			for (const b of [0, 1, 2]) {
				expect(space.toReal(t, b)).toBe(b);
				expect(space.toPattern(t, b)).toBe(b);
			}
	});
});

describe('address mapping used by the pattern ↔ 3D sites', () => {
	const hidden = bandSpaceForTubes(hiddenTubes, false);
	const fill = bandSpaceForTubes(fillTubes, false);
	const visible = bandSpaceForTubes(allVisibleTubes, false);

	it('patternBandToReal: a band maps to its real band, a piece to its parent real band', () => {
		expect(patternBandToReal(hidden, plain(0, 1))).toEqual(plain(0, 2));
		expect(patternBandToReal(hidden, plain(1, 1))).toEqual(plain(1, 2));
		expect(patternBandToReal(hidden, { ...plain(1, 0), piece: 1 })).toEqual(plain(1, 1));
		expect(patternBandToReal(fill, plain(0, 0))).toEqual(plain(0, 1));
		expect(patternBandToReal(hidden, plain(0, 3))).toBeNull();
		expect(patternBandToReal(undefined, plain(0, 0))).toBeNull();
		expect(patternBandToReal(visible, { ...plain(1, 2), piece: 0 })).toEqual(plain(1, 2));
	});

	it('patternFacetToReal (partner highlight): band mapped, parent quad kept', () => {
		expect(patternFacetToReal(hidden, { ...plain(0, 2), facet: 3 })).toEqual({
			...plain(0, 3),
			facet: 3
		});
		expect(patternFacetToReal(fill, { ...plain(1, 1), facet: 2 })).toEqual({
			...plain(1, 2),
			facet: 2
		});
		expect(patternFacetToReal(visible, { ...plain(0, 2), facet: 3 })).toEqual({
			...plain(0, 2),
			facet: 3
		});
	});

	it('patternBandSelectionToReal (pattern band click): real band, at the piece first triangle', () => {
		expect(
			patternBandSelectionToReal(hidden, {
				address: { ...plain(0, 1), piece: 1 },
				parentQuadOffset: 3
			})
		).toEqual({ ...plain(0, 2), facet: 6 });
		expect(patternBandSelectionToReal(fill, { address: plain(0, 0) })).toEqual({
			...plain(0, 1),
			facet: 0
		});
		expect(patternBandSelectionToReal(visible, { address: plain(0, 1) })).toEqual({
			...plain(0, 1),
			facet: 0
		});
	});

	it('realBandToPattern (3D click): the pattern band, or null for a hidden or fill band', () => {
		expect(realBandToPattern(hidden, plain(0, 2))).toEqual(plain(0, 1));
		expect(realBandToPattern(hidden, plain(0, 1))).toBeNull();
		expect(realBandToPattern(hidden, plain(1, 0))).toBeNull();
		expect(realBandToPattern(fill, plain(0, 1))).toEqual(plain(0, 0));
		expect(realBandToPattern(fill, plain(0, 3))).toBeNull();
		expect(realBandToPattern(visible, plain(1, 2))).toEqual(plain(1, 2));
	});

	it('real → pattern → real is the identity for every patterned band', () => {
		for (const [space, tubes] of [
			[hidden, hiddenTubes],
			[fill, fillTubes]
		] as const) {
			tubes.forEach((tb, t) =>
				tb.bands.forEach((_, b) => {
					const pattern = realBandToPattern(space, plain(t, b));
					if (pattern) expect(patternBandToReal(space, pattern)).toEqual(plain(t, b));
				})
			);
		}
	});

	it('assemblerHighlightToReal (3D materials): band and ring on real bands', () => {
		const highlight = {
			band: { ...plain(0, 1), piece: 0 },
			ring: [{ ...plain(0, 1), piece: 0 }, { ...plain(0, 1), piece: 1 }, plain(1, 0), plain(1, 3)]
		};
		expect(assemblerHighlightToReal(hidden, highlight)).toEqual({
			band: plain(0, 2),
			ring: [plain(0, 2), plain(0, 2), plain(1, 1)]
		});
		expect(assemblerHighlightToReal(hidden, { band: plain(0, 3), ring: [] })).toBeNull();
		expect(assemblerHighlightToReal(hidden, null)).toBeNull();
		expect(
			assemblerHighlightToReal(visible, { band: plain(0, 1), ring: [plain(0, 1), plain(1, 2)] })
		).toEqual({ band: plain(0, 1), ring: [plain(0, 1), plain(1, 2)] });
	});
});
