// Mock the svelte-dependent chain from generate-outlined-pattern transitive imports:
// generate-cut-pattern.ts → flower-of-life.ts → svg-logger/logger.ts → svelte/store (ESM-only)
// generate-tiled-pattern.ts → generate-pattern.ts → generate-cut-pattern.ts (same chain)
// See build-outline-path-degenerate.test.ts for the same mocking, needed for the
// same reason: none of these are exercised by generateOutlinedBandPattern, but
// the module import graph still resolves them at load time.
jest.mock('../generate-cut-pattern', () => ({
	getFlatStripV2: jest.fn(),
	getBandBasePoints: jest.fn(),
	applyStrokeWidth: jest.fn()
}));
jest.mock('../generate-tiled-pattern', () => ({
	alignBands: jest.fn(),
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
import { Vector3, Triangle } from 'three';

import { generateOutlinedBandPattern } from '../generate-outlined-pattern';
import { resolveEndPartner } from '../resolve-partner-band';
import type { Band, OutlinedPatternConfig, Quadrilateral, TubeCutPattern } from '$lib/types';

/**
 * This test drives the REAL production path — `generateOutlinedBandPattern`'s
 * own call into `buildOutlinePath`, which in turn calls `shouldHaveTab` — not
 * `shouldHaveTab` in isolation (that's `split-end-tab.test.ts`). It exists to
 * catch a regression the isolated unit tests structurally cannot: `piece`
 * being dropped from the `buildOutlinePath(...)` call inside
 * `generateOutlinedBandPattern`, or `currentPiece` being dropped from the
 * `shouldHaveTab(...)` call inside `buildOutlinePath`. Both are optional
 * parameters that type-check fine when omitted and silently produce no seam
 * tab — the exact defect family (an optional parameter never passed) this
 * plan has hit six times.
 *
 * Asserting on `BandCutPattern.tabs` (via `collectOutlinedBandTabs`) rather
 * than on emitted tab path geometry: it's a smaller, more legible surface
 * (`position: 'start' | 'end' | 'mid'`) and a dropped `currentPiece` changes
 * it just as directly — no tab record is produced for the seam cap at all.
 */

const quad: Quadrilateral = {
	a: new Vector3(0, 0, 0),
	b: new Vector3(1, 0, 0),
	c: new Vector3(1, 1, 0),
	d: new Vector3(0, 1, 0)
};

// A minimal single-quad band: 2 facets (indices 0 and 1, matching the 2*i /
// 2*i+1 convention getOutlineEdges reads for before/after partner metadata),
// neither of which needs partner meta for this test — no side partners are
// passed in, so bandHasPartners is false on both sides and only the 'end'
// edges are in play.
const makeBand = (pieceIndex: number, seamAt: Band['seamAt']): Band => ({
	facets: [
		{ triangle: new Triangle(), orientation: 'axial-right' },
		{ triangle: new Triangle(), orientation: 'axial-right' }
	],
	orientation: 'axial-right',
	pieceIndex,
	seamAt
});

const config: OutlinedPatternConfig = {
	type: 'outlined',
	tabConfig: { shape: 'rectangle', tabWidth: 5, splitEnd: 'after' }
};

describe('generateOutlinedBandPattern — split seam tab, real wiring', () => {
	it('tabs the far (end) cap of the lower-indexed piece, not the near (start) cap of the higher-indexed sibling', () => {
		// Lower piece 0's far end (seamAt.end) is the seam; its partner across
		// the seam is piece 1, which is higher — under splitEnd: 'after' that
		// means piece 0 owns the tab.
		const lowerPiece = makeBand(0, { end: true });
		// Higher piece 1's near end (seamAt.start) is the same seam from the
		// other side; its partner is piece 0, which is lower — no tab.
		const higherPiece = makeBand(1, { start: true });

		const lowerResult = generateOutlinedBandPattern(
			lowerPiece,
			0,
			config,
			{ value: 1, unit: 'cm' },
			{ globule: 0, tube: 0 },
			[quad],
			undefined,
			undefined,
			1,
			0,
			lowerPiece.pieceIndex
		);
		const higherResult = generateOutlinedBandPattern(
			higherPiece,
			0,
			config,
			{ value: 1, unit: 'cm' },
			{ globule: 0, tube: 0 },
			[quad],
			undefined,
			undefined,
			1,
			0,
			higherPiece.pieceIndex
		);

		expect(lowerResult.tabs?.some((t) => t.position === 'end')).toBe(true);
		// No tab at all on the higher-indexed sibling's near cap — `tabs` may be
		// entirely undefined (collectOutlinedBandTabs returns undefined when no
		// edge got a tab), which is itself the "no tab" outcome under test.
		expect(higherResult.tabs?.some((t) => t.position === 'start') ?? false).toBe(false);
	});
});

describe('generateOutlinedBandPattern — mid tabs record their quad, real wiring', () => {
	it('stamps each side tab with the band-local quad of the edge it sits on', () => {
		// Three unit quads stacked along y. Facet ac partner meta on facets 0 and 1
		// turns on both side partners, so every before/after edge gets a tab.
		const quads: Quadrilateral[] = [0, 1, 2].map((i) => ({
			a: new Vector3(0, i, 0),
			b: new Vector3(1, i, 0),
			c: new Vector3(1, i + 1, 0),
			d: new Vector3(0, i + 1, 0)
		}));
		const partner = { globule: 0, tube: 0, band: 1, facet: 0 };
		const band: Band = {
			facets: Array.from({ length: 6 }, () => ({
				triangle: new Triangle(),
				orientation: 'axial-right' as const,
				meta: { ac: { partner } }
			})) as unknown as Band['facets'],
			orientation: 'axial-right'
		};
		const sideConfig: OutlinedPatternConfig = {
			type: 'outlined',
			tabConfig: { shape: 'rectangle', tabWidth: 5, bandEdge: 'beforeAndAfter' }
		};

		const result = generateOutlinedBandPattern(
			band,
			0,
			sideConfig,
			{ value: 1, unit: 'cm' },
			{ globule: 0, tube: 0 },
			quads
		);

		// Walk order: before edges forward (quads 0,1,2), after edges backward (2,1,0).
		const mids = (result.tabs ?? []).filter((t) => t.position === 'mid');
		expect(mids.map((t) => t.quad)).toEqual([0, 1, 2, 2, 1, 0]);
	});
});

describe('generateOutlinedBandPattern — pieces carry their parent quad offset', () => {
	it('copies parentQuadOffset from a piece, and adds no key for an unsplit band', () => {
		// Tab labels place a piece's tab at parent quad `parentQuadOffset + quad`;
		// without the offset every piece's tabs read as if they began at quad 0.
		const piece: Band = { ...makeBand(1, { start: true }), parentQuadOffset: 2 };
		const generate = (band: Band, piece?: number) =>
			generateOutlinedBandPattern(
				band,
				0,
				config,
				{ value: 1, unit: 'cm' },
				{ globule: 0, tube: 0 },
				[quad],
				undefined,
				undefined,
				1,
				0,
				piece
			);
		expect(generate(piece, 1).parentQuadOffset).toBe(2);
		expect('parentQuadOffset' in generate(makeBand(0, {}))).toBe(false);
	});
});

describe('generateOutlinedBandPattern — partner meta at seams and open rims', () => {
	// A one-quad band whose first / last facet carries an `ab` partner (cap edge)
	// only where given. Outlined reads cap partners from those two facets.
	const capBand = (
		start: { tube: number; band: number } | undefined,
		end: { tube: number; band: number } | undefined,
		extra: Partial<Band> = {}
	): Band => {
		const facet = (partner?: { tube: number; band: number }) => ({
			triangle: new Triangle(),
			orientation: 'axial-right' as const,
			...(partner ? { meta: { ab: { partner: { globule: 0, ...partner, facet: 0 } } } } : {})
		});
		return {
			facets: [facet(start), facet(end)] as unknown as Band['facets'],
			orientation: 'axial-right',
			...extra
		};
	};
	const generate = (band: Band, tube: number, bandIndex: number, piece?: number) =>
		generateOutlinedBandPattern(
			band,
			bandIndex,
			config,
			{ value: 1, unit: 'cm' },
			{ globule: 0, tube },
			[quad],
			undefined,
			undefined,
			1,
			0,
			piece
		);

	it('stores seam siblings as piece addresses, overriding the facet partner at the cut', () => {
		// At a cut the facet partner is the band's own parent (t2/b0), as on real
		// geometry; the stored partner must be the adjacent piece instead.
		const own = { tube: 2, band: 0 };
		const p0 = generate(
			capBand({ tube: 1, band: 3 }, own, { pieceIndex: 0, seamAt: { end: true } }),
			2,
			0,
			0
		);
		const p1 = generate(
			capBand(own, own, { pieceIndex: 1, seamAt: { start: true, end: true } }),
			2,
			0,
			1
		);
		const p2 = generate(
			capBand(own, { tube: 4, band: 5 }, { pieceIndex: 2, seamAt: { start: true } }),
			2,
			0,
			2
		);
		expect(p0.meta).toEqual({
			startPartnerBand: { globule: 0, tube: 1, band: 3 },
			endPartnerBand: { globule: 0, tube: 2, band: 0, piece: 1 }
		});
		expect(p1.meta).toEqual({
			startPartnerBand: { globule: 0, tube: 2, band: 0, piece: 0 },
			endPartnerBand: { globule: 0, tube: 2, band: 0, piece: 2 }
		});
		expect(p2.meta).toEqual({
			startPartnerBand: { globule: 0, tube: 2, band: 0, piece: 1 },
			endPartnerBand: { globule: 0, tube: 4, band: 5 }
		});
	});

	it('an open-rim piece keeps meta, so a start join still resolves to piece 0', () => {
		// Partner parent t2/b0 is split; its cut facets carry no partner and its
		// far end is an open rim. Asker t1/b3's start meets t2/b0's start.
		const p0 = generate(
			capBand({ tube: 1, band: 3 }, undefined, { pieceIndex: 0, seamAt: { end: true } }),
			2,
			0,
			0
		);
		const p1 = generate(
			capBand(undefined, undefined, { pieceIndex: 1, seamAt: { start: true } }),
			2,
			0,
			1
		);
		expect(p0.meta?.startPartnerBand).toEqual({ globule: 0, tube: 1, band: 3 });
		expect(p1.meta).toEqual({
			startPartnerBand: { globule: 0, tube: 2, band: 0, piece: 0 },
			endPartnerBand: undefined
		});
		const asker = generate(capBand({ tube: 2, band: 0 }, { tube: 9, band: 9 }), 1, 3);
		const tubes = [
			undefined,
			{ projectionType: 'patterned', address: { globule: 0, tube: 1 }, bands: [asker] },
			{ projectionType: 'patterned', address: { globule: 0, tube: 2 }, bands: [p0, p1] }
		] as unknown as TubeCutPattern[];
		expect(resolveEndPartner(tubes, asker, 'start')?.band.address).toEqual({
			globule: 0,
			tube: 2,
			band: 0,
			piece: 0
		});
	});

	it('GUARD: an unsplit band keeps meta only when both ends have a partner', () => {
		expect(generate(capBand({ tube: 1, band: 0 }, undefined), 0, 0).meta).toBeUndefined();
		expect(generate(capBand(undefined, undefined), 0, 0).meta).toBeUndefined();
		expect(generate(capBand({ tube: 1, band: 0 }, { tube: 3, band: 2 }), 0, 0).meta).toEqual({
			startPartnerBand: { globule: 0, tube: 1, band: 0 },
			endPartnerBand: { globule: 0, tube: 3, band: 2 }
		});
	});
});
