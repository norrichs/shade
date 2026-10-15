import type { BandCutPattern, Point } from '$lib/types';
import type { EffectiveBoundsContext } from '$lib/cut-pattern/band-layout';
import { flattenPath } from '$lib/cut-pattern/path-contours';
import { selfTagFootprintBox } from '$lib/cut-pattern/label-footprint';
import { buildSelfTagLines } from '$lib/cut-pattern/build-self-tag-lines';
import { concatAddress } from '$lib/util';
import { convexHull, inflateConvex } from './raster';
import type { NestShape, Pt } from './types';

/**
 * A band's packing footprint: one convex hull per facet (from the drawn facet
 * path, the same source `patternExtentBounds` measures), inflated by half the
 * stroke, plus the external self-tag box when it is shown. Convex parts keep
 * rasterisation simple and are close to exact for quad facets.
 */
export const buildNestShape = (
	band: BandCutPattern,
	ctx: EffectiveBoundsContext,
	pivot: Point
): NestShape => {
	const polygons: Pt[][] = [];
	for (const facet of band.facets ?? []) {
		if (!facet.path?.length) continue;
		const pts = flattenPath(facet.path)
			.flat()
			.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
		if (pts.length === 0) continue;
		polygons.push(inflateConvex(convexHull(pts), (facet.strokeWidth ?? 1) / 2));
	}
	const tag = selfTagFootprintBox({
		band,
		labels: ctx.labels,
		selfTagLines: buildSelfTagLines(
			concatAddress(band.address, 'tb-slash'),
			ctx.groupCodeFor(band.address),
			ctx.externalTagEnabled
		),
		measuredDims: ctx.measuredDims
	});
	if (tag) {
		const { left: l, top: t, width: w, height: h } = tag;
		polygons.push([
			{ x: l, y: t },
			{ x: l + w, y: t },
			{ x: l + w, y: t + h },
			{ x: l, y: t + h }
		]);
	}
	return { polygons, pivot: { x: pivot.x, y: pivot.y } };
};
