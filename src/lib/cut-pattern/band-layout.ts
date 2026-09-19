import type {
	BandCutPattern,
	BoundingBox,
	CutPattern,
	PatternLabelsConfig,
	Point
} from '$lib/types';
import type { GlobuleAddress_Band } from '$lib/projection-geometry/types';
import type { LabelTextDims } from '$lib/stores/mergedPathStore';
import { buildSelfTagLines } from './build-self-tag-lines';
import { effectiveBandBounds } from './label-footprint';
import { concatAddress } from '$lib/util';

/**
 * Per-band layout helpers for CutPatternRenderer.
 *
 * Every band's effective bounds (geometry plus external self-tag footprint) used
 * to be recomputed three or four times per render pass, and pivots and tag anchors
 * were rebuilt inline in the template, so every band got fresh prop objects on
 * every render. These builders compute each value once per layout pass and key it
 * by band identity, so callers get stable objects for as long as the inputs hold.
 */

export type EffectiveBoundsContext = {
	labels: PatternLabelsConfig | undefined;
	externalTagEnabled: boolean;
	measuredDims: Map<string, LabelTextDims>;
	groupCodeFor: (address: GlobuleAddress_Band) => string | undefined;
};

export type BoundsIndex = Map<BandCutPattern, BoundingBox | undefined>;

export const effectiveBoundsForBand = (
	band: BandCutPattern,
	ctx: EffectiveBoundsContext
): BoundingBox | undefined => {
	const selfTagLines = buildSelfTagLines(
		concatAddress(band.address, 'tb-slash'),
		ctx.groupCodeFor(band.address),
		ctx.externalTagEnabled
	);
	return (
		effectiveBandBounds({
			band,
			labels: ctx.labels,
			selfTagLines,
			measuredDims: ctx.measuredDims
		}) ?? band.bounds
	);
};

export const buildEffectiveBoundsIndex = (
	bands: BandCutPattern[],
	ctx: EffectiveBoundsContext
): BoundsIndex => {
	const index: BoundsIndex = new Map();
	for (const band of bands) {
		if (!index.has(band)) index.set(band, effectiveBoundsForBand(band, ctx));
	}
	return index;
};

export const pivotOf = (bounds: BoundingBox | undefined): Point => ({
	x: (bounds?.left ?? 0) + (bounds?.width ?? 0) / 2,
	y: (bounds?.top ?? 0) + (bounds?.height ?? 0) / 2
});

export const buildPivotIndex = (
	bands: BandCutPattern[],
	bounds: BoundsIndex
): Map<BandCutPattern, Point> => {
	const index = new Map<BandCutPattern, Point>();
	for (const band of bands) {
		if (!index.has(band)) index.set(band, pivotOf(bounds.get(band)));
	}
	return index;
};

/** Lowest point (max y) across all facet paths; the legacy tag anchor fallback. */
export const minPoint = (facets: CutPattern[]): Point => {
	let maxY = 0;
	let X = 0;
	facets.forEach((facet) =>
		facet.path.forEach((segment) => {
			if (segment[2] && (segment[2] as number) > maxY) {
				maxY = segment[2] as number;
				X = (segment[1] as number) || 0;
			}
		})
	);
	return { x: X, y: maxY };
};

export const tagAnchorOf = (band: BandCutPattern): Point =>
	band.tagAnchorPoint ?? minPoint(band.facets);

export const buildTagAnchorIndex = (bands: BandCutPattern[]): Map<BandCutPattern, Point> => {
	const index = new Map<BandCutPattern, Point>();
	for (const band of bands) {
		if (!index.has(band)) index.set(band, tagAnchorOf(band));
	}
	return index;
};
