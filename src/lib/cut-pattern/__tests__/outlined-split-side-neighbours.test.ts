// The flatten and align stages are mocked to identity so the test controls the
// flat geometry exactly. They are also the svelte-dependent import chain the
// other outlined tests mock (see build-outline-path-degenerate.test.ts).
jest.mock('../generate-cut-pattern', () => ({
	getFlatStripV2: jest.fn((band: unknown) => band),
	getBandBasePoints: jest.fn(),
	applyStrokeWidth: jest.fn()
}));
jest.mock('../generate-tiled-pattern', () => ({
	alignBands: jest.fn((bands: unknown) => bands),
	computeBandAscending: jest.fn(() => true),
	generateTubeCutPattern: jest.fn(),
	applyTubePatternPostProcessing: jest.fn(),
	generateTiledBandPattern: jest.fn()
}));
jest.mock('../generate-panel-pattern', () => ({
	shouldUsePanelPattern: jest.fn(),
	generateProjectionPanelPattern: jest.fn(),
	validateAllPanels: jest.fn(),
	getPanelEdgeMeta: jest.fn(),
	applyHolesToEdgeMeta: jest.fn()
}));

import { describe, it, expect } from '@jest/globals';
import { Triangle, Vector3 } from 'three';

import { generateOutlinedProjectionPattern } from '../generate-outlined-pattern';
import type { Tube } from '$lib/projection-geometry/types';
import type { SuperGlobuleProjectionCutPattern } from '$lib/stores/superGlobuleStores';
import type {
	Band,
	BandCutPattern,
	Facet,
	OutlinedPatternConfig,
	OutlinedTabConfig,
	SplitConfig
} from '$lib/types';

/**
 * Outlined side neighbours and tab layout must be decided by PARENT band, not
 * by position in the post-split pieces array (shades-at0).
 *
 * Fixture: one tube of four bands with quad counts [4, 4, 4, 1], split at
 * quad 1. Bands 0–2 become UNEQUAL pieces of 1 and 3 quads; band 3 is too
 * short to cut and stays whole beside the split band 2. The pieces array is
 * `[b0p0, b0p1, b1p0, b1p1, b2p0, b2p1, b3]`.
 *
 * Flatten and align are identity, `sideOrientation` is 'outside' (no flip or
 * shift in getQuadrilaterals), and a piece is a literal slice of its parent's
 * facets — so every piece's quads sit in its parent's coordinate frame and a
 * tab's base edge identifies its parent quad directly. That makes the unsplit
 * run a pointwise oracle for the split run.
 *
 * Every quad of every band has a distinct shape (the right-hand edge bows by
 * band and by quad), so a partner-shaped tab built from the wrong neighbour
 * quad has different outer points.
 */

const QUAD_COUNTS = [4, 4, 4, 1];
const TUBE = { globule: 0, tube: 0 };
const pixelScale = { value: 1, unit: 'cm' as const };

const rightX = (band: number, y: number) => 1 + 0.3 * band + 0.25 * y * y + 0.2 * band * y;

const makeBand = (band: number, quadCount: number): Band => {
	const facets: Facet[] = [];
	const partner = (b: number, facet: number) => ({
		ac: { partner: { ...TUBE, band: b, facet, edge: 'ac' as const } }
	});
	for (let k = 0; k < quadCount; k++) {
		const a = new Vector3(0, k, 0);
		const b = new Vector3(rightX(band, k), k, 0);
		const c = new Vector3(rightX(band, k + 1), k + 1, 0);
		const d = new Vector3(0, k + 1, 0);
		// axial-right quads read a = f0.a, b = f0.b, d = f0.c, c = f1.a.
		// Even facets face the lower band ('before'), odd the higher ('after').
		facets.push({
			triangle: new Triangle(a, b, d),
			orientation: 'axial-right',
			meta: partner(band - 1, 2 * k + 1)
		} as unknown as Facet);
		facets.push({
			triangle: new Triangle(c, d, b),
			orientation: 'axial-right',
			meta: partner(band + 1, 2 * k)
		} as unknown as Facet);
	}
	return { facets, orientation: 'axial-right', visible: true, sideOrientation: 'outside' };
};

const makeTubes = (): Tube[] =>
	[{ address: TUBE, bands: QUAD_COUNTS.map((n, b) => makeBand(b, n)) }] as unknown as Tube[];

const SPLITS: SplitConfig = { tubeSplits: [{ tube: 0, quads: [1] }] };

const run = (tabConfig: OutlinedTabConfig, splits?: SplitConfig): BandCutPattern[] => {
	const config: OutlinedPatternConfig = { type: 'outlined', tabConfig };
	const result = generateOutlinedProjectionPattern(
		makeTubes(),
		0 as unknown as number,
		config,
		pixelScale,
		undefined,
		splits
	);
	return (result as SuperGlobuleProjectionCutPattern).projectionCutPattern.tubes[0].bands;
};

type SideTab = {
	parent: number;
	side: 'before' | 'after';
	parentQuad: number;
	outer: { x: number; y: number }[];
};

/**
 * Side ('mid') tabs of a run, identified in parent coordinates: the before
 * edge (a→d) lies on x = 0, the after edge (c→b) at x > 0, and the base edge's
 * lower y is the parent quad index.
 */
const sideTabs = (bands: BandCutPattern[]): SideTab[] =>
	bands.flatMap((band) =>
		(band.tabs ?? [])
			.filter((t) => t.position === 'mid')
			.map((t) => {
				const [s, e] = t.base;
				return {
					parent: band.address.band,
					side: Math.max(Math.abs(s.x), Math.abs(e.x)) < 1e-9 ? 'before' : 'after',
					parentQuad: Math.round(Math.min(s.y, e.y)),
					outer: t.outer
				} as SideTab;
			})
	);

const keyOf = (t: SideTab) => `${t.parent}:${t.side}:${t.parentQuad}`;

describe('outlined split — side neighbours and tab layout by parent band', () => {
	it('fixture sanity: the split produces unequal pieces and an uncut short neighbour', () => {
		const bands = run({ shape: 'rectangle', tabWidth: 0.2 }, SPLITS);
		expect(
			bands.map((b) =>
				'piece' in b.address ? `${b.address.band}p${b.address.piece}` : `${b.address.band}`
			)
		).toEqual(['0p0', '0p1', '1p0', '1p1', '2p0', '2p1', '3']);
		// Outline facet + one quad facet per quad.
		expect(bands.map((b) => b.facets.length - 1)).toEqual([1, 3, 1, 3, 1, 3, 1]);
	});

	it('tabLayout: every band-to-band side seam has exactly one tab, owned per parent as unsplit', () => {
		const tabConfig: OutlinedTabConfig = {
			shape: 'rectangle',
			tabWidth: 0.2,
			bandEdge: 'after',
			tabLayout: 'inner'
		};
		const unsplit = sideTabs(run(tabConfig)).map(keyOf).sort();
		const split = sideTabs(run(tabConfig, SPLITS)).map(keyOf);

		// Exactly one tab per real seam quad: seam s at parent quad P is the
		// after edge of band s or the before edge of band s + 1.
		for (let s = 0; s < QUAD_COUNTS.length - 1; s++) {
			const shared = Math.min(QUAD_COUNTS[s], QUAD_COUNTS[s + 1]);
			for (let P = 0; P < shared; P++) {
				const count =
					split.filter((k) => k === `${s}:after:${P}`).length +
					split.filter((k) => k === `${s + 1}:before:${P}`).length;
				expect({ seam: s, quad: P, count }).toEqual({ seam: s, quad: P, count: 1 });
			}
		}
		expect([...split].sort()).toEqual(unsplit);
	});

	it("partner-shaped side tabs on pieces are built from the adjacent band's same-index piece", () => {
		const tabConfig: OutlinedTabConfig = {
			shape: 'partner',
			tabWidth: 0.8,
			bandEdge: 'beforeAndAfter'
		};
		const unsplit = new Map(sideTabs(run(tabConfig)).map((t) => [keyOf(t), t.outer]));
		const split = sideTabs(run(tabConfig, SPLITS));

		expect(split.map(keyOf).sort()).toEqual([...unsplit.keys()].sort());

		// Largest outer-point distance from the unsplit parent's tab at the same
		// parent quad, per tab. Listing every mismatch (rather than stopping at
		// the first) shows which neighbour each piece was wrongly given.
		const deviations = split
			.map((tab) => {
				const expected = unsplit.get(keyOf(tab))!;
				const deviation =
					expected.length !== tab.outer.length
						? Infinity
						: Math.max(
								...tab.outer.map((p, i) => Math.hypot(p.x - expected[i].x, p.y - expected[i].y))
							);
				return { key: keyOf(tab), deviation };
			})
			.filter((d) => d.deviation > 1e-9)
			.sort((a, b) => a.key.localeCompare(b.key));
		expect(deviations).toEqual([]);
	});
});
