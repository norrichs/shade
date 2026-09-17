import type { Band } from '$lib/types';

export type SplitRejection = { quad: number; reason: string };
export type SplitFlatBandsResult = { bands: Band[]; rejected: SplitRejection[] };

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
 */
export const splitFlatBands = (
	flatBands: Band[],
	splitQuads: number[],
	subunitCount: number
): SplitFlatBandsResult => {
	if (splitQuads.length === 0) return { bands: flatBands, rejected: [] };
	// Math.max of an empty array is -Infinity, which would reject every split
	// with the nonsense reason "out of range for -Infinity quads".
	if (flatBands.length === 0) return { bands: flatBands, rejected: [] };

	const rejected: SplitRejection[] = [];
	const maxQuads = Math.max(...flatBands.map((b) => Math.floor(b.facets.length / 2)));

	const legal = [...new Set(splitQuads)]
		.sort((a, b) => a - b)
		.filter((quad) => {
			if (!Number.isInteger(quad) || quad <= 0 || quad >= maxQuads) {
				rejected.push({ quad, reason: `out of range for ${maxQuads} quads` });
				return false;
			}
			if (quad % subunitCount !== 0) {
				rejected.push({ quad, reason: `not a multiple of subunitCount ${subunitCount}` });
				return false;
			}
			return true;
		});

	if (legal.length === 0) return { bands: flatBands, rejected };

	const bands = flatBands.flatMap((band, parentIndex) => {
		const quadCount = Math.floor(band.facets.length / 2);
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
