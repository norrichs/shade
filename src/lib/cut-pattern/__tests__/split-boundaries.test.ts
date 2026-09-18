import { describe, it, expect } from '@jest/globals';
import { Vector3 } from 'three';
import {
	applyAutoSplits,
	applySplitToggle,
	clearAllSplits,
	MAX_HIT_WIDTH,
	MIN_HIT_WIDTH,
	resolveSplitSubunitCount,
	splitBoundariesOfBand,
	splitQuadsForTube,
	toggleTubeSplits,
	unionTubeSplits
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

	describe('a facet-range view of a band', () => {
		/**
		 * `sliceProjectionCutPattern` slices `band.facets` for the facets range
		 * control, leaving `parentQuadOffset` and `quadCount` as generated. Facet
		 * index then no longer equals the parent quad offset, so every target
		 * would be labelled with the wrong parent quad and a click would write a
		 * split somewhere the user did not point at. Unreachable while the range
		 * control clamps to [0, 1], which is why the guard is a bail rather than
		 * an attempt to recover the missing start index — it cannot be recovered
		 * from the band alone.
		 */
		const sliced = (quadCount: number, start: number, length: number): BandCutPattern => {
			const full = band(quadCount);
			return {
				...full,
				quadCount,
				facets: full.facets.slice(start, start + length)
			} as BandCutPattern;
		};

		it('offers nothing when the facets are a partial view of the band', () => {
			expect(splitBoundariesOfBand(sliced(8, 2, 4), 1, [])).toEqual([]);
		});

		it('still offers targets on a complete band that declares its quad count', () => {
			expect(splitBoundariesOfBand(sliced(4, 0, 4), 1, []).map((b) => b.quad)).toEqual([1, 2, 3]);
		});
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

describe('hit width', () => {
	/**
	 * A band whose quads have the given lengths along the band axis, so boundary
	 * spacing can be made as tight as a tapering real band's.
	 */
	const taperedBand = (lengths: number[]): BandCutPattern => {
		let y = 0;
		const facets = lengths.map((length, k) => {
			const quad: Quadrilateral = {
				a: new Vector3(0, y, 0),
				b: new Vector3(1, y, 0),
				c: new Vector3(1, y + length, 0),
				d: new Vector3(0, y + length, 0)
			};
			y += length;
			return { path: [], label: `q${k}`, quad } as CutPattern;
		});
		return { ...band(0), facets } as BandCutPattern;
	};

	const midpoint = (b: { from: { x: number; y: number }; to: { x: number; y: number } }) => ({
		x: (b.from.x + b.to.x) / 2,
		y: (b.from.y + b.to.y) / 2
	});
	const spacing = (
		a: { from: { x: number; y: number }; to: { x: number; y: number } },
		b: { from: { x: number; y: number }; to: { x: number; y: number } }
	) => Math.hypot(midpoint(a).x - midpoint(b).x, midpoint(a).y - midpoint(b).y);

	it('uses the full width where the band is roomy', () => {
		const boundaries = splitBoundariesOfBand(taperedBand([30, 30, 30]), 1, []);
		expect(boundaries.map((b) => b.hitWidth)).toEqual([MAX_HIT_WIDTH, MAX_HIT_WIDTH]);
	});

	it('narrows to the local spacing where quads are much shorter than the full width', () => {
		// 3 units apart: 0.8 * 3 = 2.4, comfortably under the 12-unit default.
		const boundaries = splitBoundariesOfBand(taperedBand([3, 3, 3, 3]), 1, []);
		expect(boundaries).toHaveLength(3);
		boundaries.forEach((b) => expect(b.hitWidth).toBeCloseTo(2.4, 10));
	});

	it('leaves no overlap between adjacent hit zones on a short-quad band', () => {
		const boundaries = splitBoundariesOfBand(taperedBand([3, 3, 3, 3, 3]), 1, []);
		for (let i = 1; i < boundaries.length; i++) {
			const halves = (boundaries[i - 1].hitWidth + boundaries[i].hitWidth) / 2;
			expect(halves).toBeLessThanOrEqual(spacing(boundaries[i - 1], boundaries[i]));
		}
	});

	it('leaves no overlap on a tapering band, where spacing differs per boundary', () => {
		// Real bands taper: wide in the middle, tight at the ends.
		const boundaries = splitBoundariesOfBand(taperedBand([3, 4, 20, 20, 5, 3]), 1, []);
		for (let i = 1; i < boundaries.length; i++) {
			const halves = (boundaries[i - 1].hitWidth + boundaries[i].hitWidth) / 2;
			expect(halves).toBeLessThanOrEqual(spacing(boundaries[i - 1], boundaries[i]));
		}
	});

	it('sizes each boundary by its own NEAREST neighbour, not by the band average', () => {
		// Boundaries at y = 20, 24, 44: the middle one is 4 from one side and 20
		// from the other, so it takes the tight side.
		const boundaries = splitBoundariesOfBand(taperedBand([20, 4, 20, 20]), 1, []);
		expect(boundaries[0].hitWidth).toBeCloseTo(0.8 * 4, 10);
		expect(boundaries[1].hitWidth).toBeCloseTo(0.8 * 4, 10);
		expect(boundaries[2].hitWidth).toBe(MAX_HIT_WIDTH);
	});

	it('keeps every hit zone wide enough to hold its own hairline', () => {
		const boundaries = splitBoundariesOfBand(taperedBand([0.5, 0.5, 0.5, 0.5]), 1, []);
		expect(boundaries.every((b) => b.hitWidth >= MIN_HIT_WIDTH)).toBe(true);
	});

	it('gives a lone boundary the full width, having no neighbour to crowd', () => {
		const boundaries = splitBoundariesOfBand(taperedBand([1, 1]), 1, []);
		expect(boundaries.map((b) => b.hitWidth)).toEqual([MAX_HIT_WIDTH]);
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

	it('keeps sibling fields on the split config, which Tasks 15/16 add', () => {
		const withSibling = {
			type: 'GlobulePatternConfig',
			patternConfig: { splits: { autoSplit: true, tubeSplits: [] } }
		} as unknown as GlobulePatternConfig;
		expect(applySplitToggle(withSibling, 0, 2).patternConfig.splits).toEqual({
			autoSplit: true,
			tubeSplits: [{ tube: 0, quads: [2] }]
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

describe('unionTubeSplits', () => {
	it('adds proposed splits to a tube that already has hand-placed ones', () => {
		expect(unionTubeSplits([{ tube: 0, quads: [5] }], [{ tube: 0, quads: [2, 8] }])).toEqual([
			{ tube: 0, quads: [2, 5, 8] }
		]);
	});

	it('never discards a hand-placed split the proposal did not mention', () => {
		expect(unionTubeSplits([{ tube: 1, quads: [3, 9] }], [{ tube: 0, quads: [4] }])).toEqual([
			{ tube: 0, quads: [4] },
			{ tube: 1, quads: [3, 9] }
		]);
	});

	it('deduplicates and sorts ascending, which is what TubeSplits.quads promises', () => {
		expect(unionTubeSplits([{ tube: 0, quads: [4, 2] }], [{ tube: 0, quads: [2, 6] }])).toEqual([
			{ tube: 0, quads: [2, 4, 6] }
		]);
	});

	it('is idempotent: unioning the same proposals twice changes nothing', () => {
		const proposals = [{ tube: 0, quads: [2, 4] }];
		const once = unionTubeSplits([], proposals);
		expect(unionTubeSplits(once, proposals)).toEqual(once);
	});

	it('orders tubes ascending by tube number', () => {
		expect(unionTubeSplits([{ tube: 5, quads: [1] }], [{ tube: 2, quads: [1] }])).toEqual([
			{ tube: 2, quads: [1] },
			{ tube: 5, quads: [1] }
		]);
	});

	it('leaves its inputs untouched', () => {
		const existing: TubeSplits[] = [{ tube: 0, quads: [5] }];
		unionTubeSplits(existing, [{ tube: 0, quads: [2] }]);
		expect(existing).toEqual([{ tube: 0, quads: [5] }]);
	});
});

describe('applyAutoSplits', () => {
	const config = {
		type: 'GlobulePatternConfig',
		patternConfig: { splits: { tubeSplits: [{ tube: 0, quads: [2] }] } }
	} as unknown as GlobulePatternConfig;

	it('unions rather than replaces, so hand-placed splits survive', () => {
		expect(applyAutoSplits(config, [{ tube: 0, quads: [6] }]).patternConfig.splits).toEqual({
			tubeSplits: [{ tube: 0, quads: [2, 6] }]
		});
	});

	it('rebuilds every object on the edited path so a $derived chain cannot go stale', () => {
		const next = applyAutoSplits(config, [{ tube: 0, quads: [6] }]);
		expect(next).not.toBe(config);
		expect(next.patternConfig).not.toBe(config.patternConfig);
		expect(next.patternConfig.splits).not.toBe(config.patternConfig.splits);
	});

	it('leaves the config it was given untouched', () => {
		applyAutoSplits(config, [{ tube: 0, quads: [6] }]);
		expect(config.patternConfig.splits).toEqual({ tubeSplits: [{ tube: 0, quads: [2] }] });
	});
});

describe('clearAllSplits', () => {
	const config = {
		type: 'GlobulePatternConfig',
		patternConfig: { splits: { tubeSplits: [{ tube: 0, quads: [2] }] } }
	} as unknown as GlobulePatternConfig;

	it('empties the tube list', () => {
		expect(clearAllSplits(config).patternConfig.splits).toEqual({ tubeSplits: [] });
	});

	it('rebuilds references and leaves the input untouched', () => {
		const next = clearAllSplits(config);
		expect(next.patternConfig.splits).not.toBe(config.patternConfig.splits);
		expect(config.patternConfig.splits!.tubeSplits).toEqual([{ tube: 0, quads: [2] }]);
	});
});
