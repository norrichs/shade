import { describe, it, expect } from '@jest/globals';

import { generateTubeCutPattern } from '../generate-tiled-pattern';
import { buildBand, pixelScale, tiledPatternConfig } from './fixtures/tube-fixture';

describe('seam partners', () => {
	it('points each piece at its sibling across the seam', () => {
		const result = generateTubeCutPattern({
			address: { globule: 0, tube: 0 },
			bands: [buildBand(0, 8)],
			tiledPatternConfig,
			pixelScale,
			splitQuads: [2]
		});

		const [p0, p1] = result.bands;
		// p0's end meets p1's start.
		expect(p0.meta?.endPartnerBand).toEqual({ globule: 0, tube: 0, band: 0, piece: 1 });
		expect(p1.meta?.startPartnerBand).toEqual({ globule: 0, tube: 0, band: 0, piece: 0 });
	});

	it('is reciprocal, which the facet-index disambiguation relies on', () => {
		const result = generateTubeCutPattern({
			address: { globule: 0, tube: 0 },
			bands: [buildBand(0, 12)],
			tiledPatternConfig,
			pixelScale,
			splitQuads: [2, 4]
		});

		const [p0, p1, p2] = result.bands;
		expect(p1.meta?.startPartnerBand).toEqual(p0.address);
		expect(p0.meta?.endPartnerBand).toEqual(p1.address);
		expect(p2.meta?.startPartnerBand).toEqual(p1.address);
		expect(p1.meta?.endPartnerBand).toEqual(p2.address);
	});

	it('sets meta even when the outer end has no partner', () => {
		// The fixture has no cross-band partner meta, so the outer ends are
		// unpartnered. Before this change, meta would have been dropped entirely
		// and the seam would not have matched.
		const result = generateTubeCutPattern({
			address: { globule: 0, tube: 0 },
			bands: [buildBand(0, 8)],
			tiledPatternConfig,
			pixelScale,
			splitQuads: [2]
		});
		expect(result.bands[0].meta).toBeDefined();
		expect(result.bands[0].meta?.endPartnerBand).toBeDefined();
	});
});

describe('label anchors across a split', () => {
	// The default hex spec's anchor is { facetIndex: 0, segmentIndex: 0 }
	// (pattern-registry.ts:56), i.e. the FIRST quad of the band. So after a split
	// only piece 0 may carry it.
	const args = {
		address: { globule: 0, tube: 0 } as const,
		bands: [buildBand(0, 12)],
		tiledPatternConfig,
		pixelScale
	};
	const isAnchored = (p: { x: number; y: number }) => p.x !== 0 || p.y !== 0;

	it('gives the unsplit band a non-zero anchor at all', () => {
		// Guard against the whole suite passing vacuously: tagAnchorPoint is
		// initialised to {0,0} (generate-tiled-pattern.ts:364) and only written
		// when the anchor matches, so if the fixture's anchor happened to land on
		// exactly (0,0) every assertion below would hold both before and after
		// the change and prove nothing.
		const unsplit = generateTubeCutPattern(args);
		expect(unsplit.bands).toHaveLength(1);
		expect(isAnchored(unsplit.bands[0].tagAnchorPoint)).toBe(true);
	});

	it('anchors piece 0 and only piece 0', () => {
		// tagAnchor.facetIndex is a parent-relative index. A piece sees a sliced
		// facets array, so without parentQuadOffset facet 0 of EVERY piece
		// matches and all three claim the anchor.
		const split = generateTubeCutPattern({ ...args, splitQuads: [2, 4] });
		expect(split.bands).toHaveLength(3);
		expect(split.bands.map((b) => isAnchored(b.tagAnchorPoint))).toEqual([true, false, false]);
	});

	// NOTE: the brief's Step 8 originally specified a third assertion here —
	// that piece 0's tagAnchorPoint should equal the unsplit band's
	// tagAnchorPoint exactly (`toBeCloseTo(..., 6)`) on the premise that "piece
	// 0 is a prefix of the parent... so the anchor point must be too."
	//
	// That premise is false for this codebase, by design, not by an
	// implementation gap: `alignBands` (generate-tiled-pattern.ts:578-590)
	// computes EACH piece's own minimal-bounding-box rotation independently —
	// the comment at generate-tiled-pattern.ts:125-126 says so explicitly:
	// "Split before aligning, so each piece is a partition of one flat layout
	// and gets its own bounding box for packing." Verified concretely: for
	// this fixture split at [2, 4], the unsplit band's first quad has edge
	// b-a at angle ~58°, piece 0's first quad has the "same" edge at ~158° —
	// a real rotation, not a rounding artifact or a 180° flip. Each piece is
	// packed onto its own page with its own independently-chosen orientation,
	// so raw SVG coordinates are never expected to agree across a split; only
	// the FACET the anchor lands on (asserted above, in parent coordinates)
	// is the guarantee the spec needs and that `parentQuadOffset` provides.
	//
	// Forcing this assertion to pass would require abandoning per-piece OBB
	// packing, which is out of scope for this task and not requested anywhere
	// else in the brief. Flagging rather than implementing, per the brief's
	// own instruction: "If the anchor semantics turn out to be per-band-by-
	// design rather than parent-relative, stop and flag it."
});
