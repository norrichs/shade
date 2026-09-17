import type { Band } from '$lib/types';

export type SplitRejection = { quad: number; reason: string };
export type SplitFlatBandsResult = { bands: Band[]; rejected: SplitRejection[] };

/** Quad count of a flat (or 3D) band: quad k is facets 2k and 2k+1. */
export const bandQuadCount = (band: Band): number => Math.floor(band.facets.length / 2);

/** Longest band's quad count, the bound a tube-wide split index is judged against. */
export const tubeQuadCountOf = (bands: Band[]): number =>
	bands.length === 0 ? 0 : Math.max(...bands.map(bandQuadCount));

/**
 * The single source of the split legality rules.
 *
 * A split is legal when it is an integer strictly inside the tube's longest
 * band (0 < quad < quadCount) and a multiple of subunitCount. Everything else is
 * rejected with a reason; nothing is clamped. Duplicates collapse, output is
 * ascending. Pure: never touches the persisted config it was read from.
 */
export const classifySplitQuads = (
	splitQuads: number[],
	quadCount: number,
	subunitCount: number
): { legal: number[]; rejected: SplitRejection[] } => {
	const rejected: SplitRejection[] = [];
	const legal = [...new Set(splitQuads)]
		.sort((a, b) => a - b)
		.filter((quad) => {
			if (!Number.isInteger(quad) || quad <= 0 || quad >= quadCount) {
				rejected.push({ quad, reason: `out of range for ${quadCount} quads` });
				return false;
			}
			if (quad % subunitCount !== 0) {
				rejected.push({ quad, reason: `not a multiple of subunitCount ${subunitCount}` });
				return false;
			}
			return true;
		});
	return { legal, rejected };
};

/**
 * Partition flattened bands at legal quad boundaries.
 *
 * Runs between getFlatStripV2 and alignBands, so pieces are a literal
 * partition of one flat layout — which is what makes the glued result
 * identical to the unsplit pattern. Array slicing only, no coordinate math.
 *
 * Legal split positions are quadIndex % subunitCount === 0, strictly inside
 * the band. That keeps both pieces' quad counts divisible by subunitCount, so
 * generateTiling's divisibility check passes untouched, and it means a split
 * always lands on an even facet index, so getQuadrilaterals never drops a
 * trailing facet.
 *
 * `tubeQuadCount` is the quad count of the tube's longest band across ALL its
 * bands. Callers pass it because `flatBands` is often only the selected band
 * range: judging range against those alone would report a split that is valid
 * for the tube as out of range whenever the view is narrowed. When omitted, the
 * longest of `flatBands` is used.
 */
export const splitFlatBands = (
	flatBands: Band[],
	splitQuads: number[],
	subunitCount: number,
	tubeQuadCount?: number
): SplitFlatBandsResult => {
	if (splitQuads.length === 0) return { bands: flatBands, rejected: [] };
	// With no bands and no (non-zero) caller-supplied bound there is nothing to
	// judge against: every split would be rejected as "out of range for 0 quads".
	if (flatBands.length === 0 && !tubeQuadCount) {
		return { bands: flatBands, rejected: [] };
	}

	const { legal, rejected } = classifySplitQuads(
		splitQuads,
		tubeQuadCount ?? tubeQuadCountOf(flatBands),
		subunitCount
	);

	if (legal.length === 0) return { bands: flatBands, rejected };

	const bands = flatBands.flatMap((band, parentIndex) => {
		const quadCount = bandQuadCount(band);
		// Splits are tube-wide, so a band shorter than the split index is simply
		// not cut there. Its facets/orientation/etc. stay byte-identical to the
		// unsplit path, but its ARRAY POSITION is not stable: splits are per-tube,
		// so other bands in the same tube can split while this one does not,
		// shifting this band's index in the returned array relative to its index
		// in `flatBands`. `parentIndex` must therefore be stamped unconditionally
		// here too, so every downstream consumer (generateTiling's
		// globalBandIndex, the outlined path's band-index fix) can recover this
		// band's true pre-split position from the band itself rather than from
		// where it happens to land in the post-split array. `pieceIndex` is
		// deliberately left unset: an uncut band has no pieces, so its `id`/
		// `address` must carry no piece suffix.
		const cuts = legal.filter((quad) => quad < quadCount);
		if (cuts.length === 0) return [{ ...band, parentIndex }];

		const boundaries = [0, ...cuts, quadCount];
		return boundaries.slice(0, -1).map((startQuad, i): Band => {
			const endQuad = boundaries[i + 1];
			// The parent's `address` (if any) is inherited verbatim by the spread.
			// The piece component is added where the BandCutPattern address is
			// built (Task 9 Step 4), which is the only place that knows the tube
			// address shape. Nothing is fabricated here.
			return {
				...band,
				facets: band.facets.slice(startQuad * 2, endQuad * 2),
				parentIndex,
				pieceIndex: i,
				parentQuadOffset: startQuad,
				seamAt: {
					...(startQuad > 0 ? { start: true as const } : {}),
					...(endQuad < quadCount ? { end: true as const } : {})
				}
			};
		});
	});

	return { bands, rejected };
};
