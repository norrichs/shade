import { describe, it, expect } from '@jest/globals';

import { generateTubeCutPattern } from '../generate-tiled-pattern';
import { isGlobuleAddress_BandPiece } from '$lib/util';
import { buildBand, pixelScale, tiledPatternConfig } from './fixtures/tube-fixture';

describe('generateTubeCutPattern — characterization (no splits)', () => {
	it('produces a stable band pattern for a 2-band tube', () => {
		const bands = [buildBand(0, 4), buildBand(1, 4)];

		const result = generateTubeCutPattern({
			address: { globule: 0, tube: 0 },
			bands,
			tiledPatternConfig,
			pixelScale
		});

		// Structural invariants that must survive the piece refactor untouched.
		expect(result.bands).toHaveLength(2);
		expect(result.bands.map((b) => b.address)).toEqual([
			{ globule: 0, tube: 0, band: 0 },
			{ globule: 0, tube: 0, band: 1 }
		]);
		expect(result.bands.every((b) => !isGlobuleAddress_BandPiece(b.address))).toBe(true);
		expect(result.bands.map((b) => b.id)).toMatchSnapshot('band ids');
		expect(result.bands.map((b) => b.facets.length)).toMatchSnapshot('facet counts');
		expect(result.bands.map((b) => b.error)).toMatchSnapshot('errors');
	});
});

describe('generateTubeCutPattern — with splits', () => {
	it('keeps band indices stable and distinguishes pieces', () => {
		// TWO bands, and the split is asserted on the SECOND one. A one-band
		// fixture cannot tell a parent band index from a piece index — both
		// start at 0 — which is exactly the bug this assertion exists to catch.
		const bands = [buildBand(0, 8), buildBand(1, 8)]; // 8 facets = 4 quads each

		const result = generateTubeCutPattern({
			address: { globule: 0, tube: 0 },
			bands,
			tiledPatternConfig,
			pixelScale,
			splitQuads: [2]
		});

		expect(result.bands).toHaveLength(4);
		// The band component is the PARENT band index, unchanged by splitting.
		// If it were the piece index this would read [0, 1, 2, 3] and Task 11's
		// seam partners could never resolve a sibling.
		expect(result.bands.map((b) => b.address.band)).toEqual([0, 0, 1, 1]);
		expect(
			result.bands.map((b) => (isGlobuleAddress_BandPiece(b.address) ? b.address.piece : undefined))
		).toEqual([0, 1, 0, 1]);
		// Ids must differ or mergedBandPaths hands a piece the wrong geometry
		// (collate-tubes.ts:34-38).
		expect(new Set(result.bands.map((b) => b.id)).size).toBe(4);
		// Neither piece may be refused.
		expect(result.bands.map((b) => b.error)).toEqual([undefined, undefined, undefined, undefined]);
	});

	it('keeps an uncut band’s identity stable when an earlier, longer sibling splits', () => {
		// Regression for: splits are tube-wide, and bands in one tube can have
		// unequal quad counts. Band 0 has 4 quads and IS split at quad 2; band 1
		// has only 2 quads and is NOT split there (quad 2 is not < quadCount 2).
		// The split band comes FIRST, so band 1's position in the post-split
		// array (index 2: [b0p0, b0p1, band1]) no longer matches its pre-split
		// index (1). If splitFlatBands failed to stamp parentIndex on the
		// pass-through band, generateTiling would fall back to array position
		// and mislabel band 1 as band 2.
		const bands = [buildBand(0, 8), buildBand(1, 4)]; // band 0: 4 quads, band 1: 2 quads

		const result = generateTubeCutPattern({
			address: { globule: 0, tube: 0 },
			bands,
			tiledPatternConfig,
			pixelScale,
			splitQuads: [2]
		});

		expect(result.bands).toHaveLength(3);
		const uncutBand = result.bands[2];
		expect(uncutBand.address.band).toBe(1);
		// `isGlobuleAddress_BandPiece` narrows the union so this compiles without a
		// cast, unlike a direct `.piece` read — the same guard now used at this
		// file's :78/:105.
		expect(isGlobuleAddress_BandPiece(uncutBand.address)).toBe(false);
		expect(uncutBand.id).not.toMatch(/-p\d+$/);
		expect(uncutBand.id.endsWith('-1')).toBe(true);
	});

	it('leaves output identical to the baseline when splitQuads is empty', () => {
		const bands = [buildBand(0, 4), buildBand(1, 4)];
		const args = {
			address: { globule: 0, tube: 0 } as const,
			bands,
			tiledPatternConfig,
			pixelScale
		};

		const withoutProp = generateTubeCutPattern(args);
		const withEmpty = generateTubeCutPattern({ ...args, splitQuads: [] });
		expect(withEmpty.bands.map((b) => b.id)).toEqual(withoutProp.bands.map((b) => b.id));
		expect(withEmpty.bands.map((b) => b.facets.length)).toEqual(
			withoutProp.bands.map((b) => b.facets.length)
		);
		// Compare addresses too: comparing only id and facet count would pass even
		// if the piece plumbing perturbed every address or dropped `meta`.
		expect(withEmpty.bands.map((b) => b.address)).toEqual(withoutProp.bands.map((b) => b.address));
		expect(withEmpty.bands.map((b) => b.meta)).toEqual(withoutProp.bands.map((b) => b.meta));
	});
});
