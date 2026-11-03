import type { ProjectionPanelPattern, TubeCutPattern } from '#lib/types.js';

export type ProjectionRange = {
	projections?: number | [number] | [number, number];
	tubes?: number | [number] | [number, number];
	bands?: number | [number] | [number, number];
	facets?: number | [number] | [number, number];
};

const getIndices = (
	range?: number | [number] | [number, number],
	naturalRange: [number, number] = [0, 1]
) => {
	if (!range) return naturalRange;
	return typeof range === 'number' ? [range] : range;
};

export const sliceProjectionPanelPattern = (
	projectionPanelPattern: ProjectionPanelPattern,
	{ tubes, bands, facets }: ProjectionRange = {}
): ProjectionPanelPattern => {
	const sliced = {
		...projectionPanelPattern,
		tubes: projectionPanelPattern.tubes.slice(...getIndices(tubes)).map((tube) => ({
			...tube,
			bands: tube.bands
				.slice(...getIndices(bands))
				.map((band) => ({ ...band, panels: band.panels.slice(...getIndices(facets)) }))
		}))
	};

	return sliced;
};

/**
 * `items` picked and ordered by a range dimension (see `resolveRangeList`).
 * Positional: the range indexes the array, not addresses.
 */
const pickByRange = <T>(items: T[], range: ProjectionRange['tubes']): T[] =>
	range === undefined ? items : resolveRangeList(range, items.length).map((i) => items[i]);

/**
 * The cut pattern with each range dimension applied POSITIONALLY to its array.
 * Pattern generation already ranges tubes and bands by index, so the view
 * passes only `facets` here; slicing generated tubes by tube index again would
 * index an array that no longer starts at tube 0.
 */
export const sliceProjectionCutPattern = (
	patternTubes: TubeCutPattern[],
	{ tubes, bands, facets }: ProjectionRange = {}
): TubeCutPattern[] =>
	pickByRange(patternTubes, tubes).map((tube) => ({
		...tube,
		bands: pickByRange(tube.bands, bands).map((band) => ({
			...band,
			facets: pickByRange(band.facets, facets)
		}))
	}));

/**
 * The indices a range dimension selects out of `total`, in order.
 *
 * - `undefined`: every index.
 * - `n`: just `n`.
 * - `[a]`: `a` through the last index.
 * - `[a, b]`: `a` through `b`, BOTH ENDS INCLUSIVE.
 *
 * A negative index counts back from the end (`-1` is the last). When the start
 * lands after the end the range wraps: `[-1, 2]` of 10 is 9, 0, 1, 2. Indices
 * are clamped to the array; an empty array selects nothing.
 */
export const resolveRangeList = (range: ProjectionRange['tubes'], total: number): number[] => {
	if (total <= 0) return [];
	const all = (from: number, to: number) =>
		Array.from({ length: to - from + 1 }, (_, i) => from + i);
	if (range === undefined) return all(0, total - 1);
	const resolve = (i: number) => Math.min(total - 1, Math.max(0, i < 0 ? total + i : i));
	if (typeof range === 'number') {
		const i = range < 0 ? total + range : range;
		return i >= 0 && i < total ? [i] : [];
	}
	const start = resolve(range[0]);
	const end = range.length === 1 ? total - 1 : resolve(range[1]);
	return start <= end ? all(start, end) : [...all(start, total - 1), ...all(0, end)];
};

/**
 * The contiguous [start, end) window covering every index `range` selects,
 * widened by `expand` on each side (clamped to [0, total]). Generation tiles
 * this window — neighbour-aware adjusters need the bands either side — then
 * keeps exactly `resolveRangeList`'s indices. A wrapping range covers
 * everything.
 */
export const resolveRangeIndices = (
	range: ProjectionRange['tubes'],
	total: number,
	expand: number = 0
): [number, number] => {
	const list = resolveRangeList(range, total);
	if (list.length === 0) return [0, 0];
	const lo = Math.min(...list);
	const hi = Math.max(...list) + 1;
	return [Math.max(0, lo - expand), Math.min(total, hi + expand)];
};

/**
 * `items` restricted to the indices `range` selects, in the range's order.
 * `indexOf` reads an item's index (several items may share one, e.g. the
 * pieces of a split band, and stay in their original relative order).
 */
export const keepRangeOrder = <T>(
	items: T[],
	range: ProjectionRange['tubes'],
	total: number,
	indexOf: (item: T) => number
): T[] => {
	if (range === undefined) return items;
	const order = new Map(resolveRangeList(range, total).map((index, rank) => [index, rank]));
	return items
		.map((item, i) => ({ item, i, rank: order.get(indexOf(item)) }))
		.filter((e): e is { item: T; i: number; rank: number } => e.rank !== undefined)
		.sort((a, b) => a.rank - b.rank || a.i - b.i)
		.map((e) => e.item);
};

// export const filterProjection = (
// 	projectionPanelPattern: ProjectionPanelPattern,
// 	{ projections, tubes, bands, facets }: ProjectionRange
// ) => {
// 	const filtered = projectionPanelPattern.tubes.slice(...getIndices(tubes)).map((tube) => ({
// 		...tube,
// 		bands: tube.bands
// 			.slice(...getIndices(bands))
// 			.map((band) => ({ ...band, panels: band.panels.slice(...getIndices(facets)) }))
// 	}));

// 	return filtered;
// };
