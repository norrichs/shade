import { describe, it, expect } from '@jest/globals';
import { Vector3 } from 'three';
import {
	applySplitToggle,
	resolveSplitSubunitCount,
	splitBoundariesOfBand,
	splitQuadsForTube,
	toggleTubeSplits
} from '../split-boundaries';
import type {
	BandCutPattern,
	CutPattern,
	GlobulePatternConfig,
	Quadrilateral,
	TubeSplits
} from '$lib/types';

/**
 * A quad occupying rows [k, k+1) of a unit-wide ladder: its leading edge (a->b)
 * is y = k and its trailing edge (d->c) is y = k + 1, so quad k+1's a/b are
 * quad k's d/c — the adjacency the boundary geometry relies on.
 */
const ladderQuad = (k: number): Quadrilateral => ({
	a: new Vector3(0, k, 0),
	b: new Vector3(1, k, 0),
	c: new Vector3(1, k + 1, 0),
	d: new Vector3(0, k + 1, 0)
});

const quadFacet = (k: number): CutPattern => ({ path: [], label: `q${k}`, quad: ladderQuad(k) });
const outlineFacet = (): CutPattern => ({ path: [], label: 'outline' });

const band = (
	quadCount: number,
	{ parentQuadOffset, lead = false }: { parentQuadOffset?: number; lead?: boolean } = {}
): BandCutPattern =>
	({
		id: 'b',
		projectionType: 'patterned',
		tagAnchorPoint: { x: 0, y: 0 },
		address:
			parentQuadOffset === undefined
				? { globule: 0, tube: 0, band: 0 }
				: { globule: 0, tube: 0, band: 0, piece: 0 },
		parentQuadOffset,
		facets: [
			...(lead ? [outlineFacet()] : []),
			...Array.from({ length: quadCount }, (_, i) => quadFacet((parentQuadOffset ?? 0) + i))
		]
	}) as BandCutPattern;

describe('splitBoundariesOfBand', () => {
	it('offers every interior quad boundary of an uncut band, and never its two ends', () => {
		const boundaries = splitBoundariesOfBand(band(4), 1, []);
		expect(boundaries.map((b) => b.quad)).toEqual([1, 2, 3]);
	});

	it('takes the boundary geometry from the previous quad far edge', () => {
		const [first] = splitBoundariesOfBand(band(4), 1, []);
		// Boundary before quad 1 is quad 0's d->c edge, at y = 1.
		expect([first.from.x, first.from.y]).toEqual([0, 1]);
		expect([first.to.x, first.to.y]).toEqual([1, 1]);
	});

	it('ignores facets that carry no quad, so an outlined band is not off by one', () => {
		const boundaries = splitBoundariesOfBand(band(4, { lead: true }), 1, []);
		expect(boundaries.map((b) => b.quad)).toEqual([1, 2, 3]);
		expect([boundaries[0].from.y, boundaries[0].to.y]).toEqual([1, 1]);
	});

	it('keeps only multiples of subunitCount, so an illegal position cannot be clicked', () => {
		expect(splitBoundariesOfBand(band(9), 3, []).map((b) => b.quad)).toEqual([3, 6]);
	});

	it('offers nothing on a band with a single quad', () => {
		expect(splitBoundariesOfBand(band(1), 1, [])).toEqual([]);
	});

	it('marks a boundary that is already a split', () => {
		const boundaries = splitBoundariesOfBand(band(4), 1, [2]);
		expect(boundaries.map((b) => [b.quad, b.isSplit])).toEqual([
			[1, false],
			[2, true],
			[3, false]
		]);
	});

	describe('a piece of an already-split band', () => {
		it('reports boundaries in parent quad indices, not piece-local ones', () => {
			// Parent band of 9 quads split at 3 and 6; this is the middle piece.
			const boundaries = splitBoundariesOfBand(band(3, { parentQuadOffset: 3 }), 1, [3, 6]);
			expect(boundaries.map((b) => b.quad)).toEqual([3, 4, 5]);
		});

		it('offers its own leading seam as an active target, so the split can be removed', () => {
			const boundaries = splitBoundariesOfBand(band(3, { parentQuadOffset: 3 }), 1, [3, 6]);
			const seam = boundaries[0];
			expect(seam.quad).toBe(3);
			expect(seam.isSplit).toBe(true);
			// The seam is the piece's own first quad leading (a->b) edge.
			expect([seam.from.y, seam.to.y]).toEqual([3, 3]);
		});

		it('does not offer the seam that belongs to the next piece', () => {
			const boundaries = splitBoundariesOfBand(band(3, { parentQuadOffset: 3 }), 1, [3, 6]);
			expect(boundaries.map((b) => b.quad)).not.toContain(6);
		});

		it('still refuses the start of the whole band on the first piece', () => {
			const boundaries = splitBoundariesOfBand(band(3, { parentQuadOffset: 0 }), 1, [3]);
			expect(boundaries.map((b) => b.quad)).toEqual([1, 2]);
		});

		it('applies the subunit rule in parent space', () => {
			const boundaries = splitBoundariesOfBand(band(4, { parentQuadOffset: 3 }), 3, [3]);
			expect(boundaries.map((b) => b.quad)).toEqual([3, 6]);
		});
	});

	it('offers no target past the end of a band too short to be cut there', () => {
		// Tube split at 6, but this band only has 4 quads: it is never cut, and
		// there is nothing at 6 to click on it.
		const boundaries = splitBoundariesOfBand(band(4), 2, [6]);
		expect(boundaries.map((b) => b.quad)).toEqual([2]);
		expect(boundaries.every((b) => !b.isSplit)).toBe(true);
	});
});

describe('toggleTubeSplits', () => {
	const splits: TubeSplits[] = [
		{ tube: 2, quads: [4] },
		{ tube: 0, quads: [2, 6] }
	];

	it('adds a quad in ascending order and keeps tubes sorted', () => {
		expect(toggleTubeSplits(splits, 0, 4)).toEqual([
			{ tube: 0, quads: [2, 4, 6] },
			{ tube: 2, quads: [4] }
		]);
	});

	it('removes a quad that is already split', () => {
		expect(toggleTubeSplits(splits, 0, 6)).toEqual([
			{ tube: 0, quads: [2] },
			{ tube: 2, quads: [4] }
		]);
	});

	it('drops a tube entry once its last split is removed', () => {
		expect(toggleTubeSplits(splits, 2, 4)).toEqual([{ tube: 0, quads: [2, 6] }]);
	});

	it('creates an entry for a tube that has none', () => {
		expect(toggleTubeSplits(splits, 1, 3)).toEqual([
			{ tube: 0, quads: [2, 6] },
			{ tube: 1, quads: [3] },
			{ tube: 2, quads: [4] }
		]);
	});

	it('does not mutate the array or the entries it was given', () => {
		toggleTubeSplits(splits, 0, 4);
		expect(splits).toEqual([
			{ tube: 2, quads: [4] },
			{ tube: 0, quads: [2, 6] }
		]);
	});
});

describe('splitQuadsForTube', () => {
	it('reads a tube by its number, never by array position', () => {
		expect(splitQuadsForTube({ tubeSplits: [{ tube: 5, quads: [2] }] }, 5)).toEqual([2]);
		expect(splitQuadsForTube({ tubeSplits: [{ tube: 5, quads: [2] }] }, 0)).toEqual([]);
	});

	it('treats an absent split config as no splits', () => {
		expect(splitQuadsForTube(undefined, 0)).toEqual([]);
	});
});

describe('applySplitToggle', () => {
	const config = {
		type: 'GlobulePatternConfig',
		id: 'c',
		patternConfig: { splits: { tubeSplits: [{ tube: 0, quads: [2] }] } }
	} as unknown as GlobulePatternConfig;

	it('rebuilds every object on the edited path so a $derived chain cannot go stale', () => {
		const next = applySplitToggle(config, 0, 4);
		expect(next).not.toBe(config);
		expect(next.patternConfig).not.toBe(config.patternConfig);
		expect(next.patternConfig.splits).not.toBe(config.patternConfig.splits);
		expect(next.patternConfig.splits!.tubeSplits).not.toBe(config.patternConfig.splits!.tubeSplits);
	});

	it('leaves the config it was given untouched', () => {
		applySplitToggle(config, 0, 4);
		expect(config.patternConfig.splits).toEqual({ tubeSplits: [{ tube: 0, quads: [2] }] });
	});

	it('writes the toggled splits', () => {
		expect(applySplitToggle(config, 0, 4).patternConfig.splits).toEqual({
			tubeSplits: [{ tube: 0, quads: [2, 4] }]
		});
	});

	it('creates the splits config when there is none', () => {
		const bare = {
			type: 'GlobulePatternConfig',
			patternConfig: {}
		} as unknown as GlobulePatternConfig;
		expect(applySplitToggle(bare, 3, 6).patternConfig.splits).toEqual({
			tubeSplits: [{ tube: 3, quads: [6] }]
		});
	});
});

describe('resolveSplitSubunitCount', () => {
	it('is 1 for an outlined pattern, which generation splits with subunitCount 1', () => {
		expect(resolveSplitSubunitCount({ type: 'outlined' } as never)).toBe(1);
	});

	it('is 1 for a tiled pattern with no subunits', () => {
		expect(resolveSplitSubunitCount({ type: 'tiledBowtiePattern-0' } as never)).toBe(1);
	});

	it('is the registered subunit count for hexparquet', () => {
		expect(resolveSplitSubunitCount({ type: 'tiledHexparquetPattern-0' } as never)).toBe(3);
	});
});
