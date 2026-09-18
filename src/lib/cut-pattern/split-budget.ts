/**
 * The per-piece length budget auto-split is sized against, and the two
 * preconditions the Auto-split button gates on.
 *
 * `deriveAutoSplits` is pure and renderer-free by ruling, so the subtraction its
 * `pieceLengthBudget` contract demands is the caller's. This module IS that
 * subtraction, kept out of the panel so it can be tested without a DOM.
 *
 * ## Why the footprint is measured, not assumed
 *
 * Overflow is raised on EFFECTIVE bounds, not raw geometry: `flex-wrap.ts:20-21`
 * and `skyline.ts:113-124` test the items `toLayoutItems`
 * (`CutPatternRenderer.svelte:147-157`) built from `effectiveBoundsForBand`
 * (`band-layout.ts:33-49`), which unions the band's bounds with its external
 * self-tag label footprint. Splitting ADDS pieces and every piece gets its own
 * tag, so a run sized at exactly `contentHeight` can still overflow once laid
 * out.
 *
 * The footprint cannot be computed for a piece that does not exist yet — its
 * label text is not known and has not been measured. So it is taken from the
 * bands that DO exist, as `effective.height - band.bounds.height`, and the
 * LARGEST such overhang across the measured bands is used: a piece's tag is a
 * tag of the same shape on the same geometry, and taking the maximum errs
 * towards a smaller piece, which is the safe direction. For a tiled pattern
 * (no self-tag anchor) the two are equal and the footprint is 0, which is
 * correct — the layout adds nothing per piece there.
 *
 * ## The preconditions
 *
 * Splitting along the band only ever shortens a piece, so:
 *
 * - a band wider than the content box cannot be fixed by any number of splits
 *   (`widthBlocked`) — that needs a bigger page or a smaller `pageScale`;
 * - a band that fits in ITS ROTATED orientation, where the algorithm allows
 *   rotation, is not overflowing at all and must not be split.
 *
 * `lengthOverflow` is therefore "some band does not fit, and it is narrow
 * enough that shortening it would make it fit". That, and only that, is when
 * calling `deriveAutoSplits` can help.
 */

export type SplitBudgetBand = {
	/** Effective bounds width, as the layout measures it. */
	width: number;
	/** Effective bounds height (geometry + external self-tag footprint). */
	height: number;
	/** Raw geometry height, `band.bounds.height`. */
	rawHeight: number;
};

export type SplitBudgetGeom = {
	contentWidth: number;
	contentHeight: number;
	/** True only where the active algorithm actually minimises over orientations. */
	allowRotation: boolean;
};

export type SplitBudget = {
	/** False when no band was measured; every other field is then meaningless. */
	measured: boolean;
	/** Largest per-piece label overhang seen, in pattern units. */
	perPieceFootprint: number;
	/** What one piece's raw geometry may be: `contentHeight - perPieceFootprint`. */
	pieceLengthBudget: number;
	/** Some band overflows in a way splitting can fix. */
	lengthOverflow: boolean;
	/** Some band is too wide, which no split can fix. */
	widthBlocked: boolean;
};

export const EMPTY_SPLIT_BUDGET: SplitBudget = {
	measured: false,
	perPieceFootprint: 0,
	pieceLengthBudget: 0,
	lengthOverflow: false,
	widthBlocked: false
};

const fitsUpright = (band: SplitBudgetBand, geom: SplitBudgetGeom): boolean =>
	band.width <= geom.contentWidth && band.height <= geom.contentHeight;

const fitsRotated = (band: SplitBudgetBand, geom: SplitBudgetGeom): boolean =>
	band.height <= geom.contentWidth && band.width <= geom.contentHeight;

export const computeSplitBudget = (
	bands: SplitBudgetBand[],
	geom: SplitBudgetGeom
): SplitBudget => {
	if (bands.length === 0) return EMPTY_SPLIT_BUDGET;

	let perPieceFootprint = 0;
	let lengthOverflow = false;
	let widthBlocked = false;

	for (const band of bands) {
		const overhang = band.height - band.rawHeight;
		// A non-finite measurement is skipped rather than propagated: NaN would
		// make every later comparison false and silently report a zero footprint
		// and no overflow, which reads exactly like a healthy pattern.
		if (Number.isFinite(overhang) && overhang > perPieceFootprint) perPieceFootprint = overhang;

		if (fitsUpright(band, geom)) continue;
		if (geom.allowRotation && fitsRotated(band, geom)) continue;
		// Does not fit. Shortening it can only help if it is already narrow
		// enough to fit upright once short.
		if (band.width <= geom.contentWidth) lengthOverflow = true;
		else widthBlocked = true;
	}

	return {
		measured: true,
		perPieceFootprint,
		pieceLengthBudget: geom.contentHeight - perPieceFootprint,
		lengthOverflow,
		widthBlocked
	};
};
