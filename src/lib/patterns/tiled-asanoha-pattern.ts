import type { PathSegment, Quadrilateral, TiledPatternConfig } from '$lib/types';
import { translatePS } from './utils';
import { snapAdjacentFacets, type FacetSnapRule } from './adjust/snap-adjacent-facets';

export const generateAsanohaPattern = ({
	size,
	rows,
	columns,
	finishOuterEdge = false
}: {
	size: number;
	rows: number;
	columns: number;
	/**
	 * When true, finish the free OUTER edge of an edge band by mirroring the
	 * `start`/`end` verticals onto the far-right (w6) side, so it becomes a full-height
	 * line instead of only `edgeSegment`'s middle third. Used for the outermost band of
	 * a non-tubular (surface-projection) tube, whose outer side has no adjacent band
	 * partner and so needs its own finished edge.
	 *
	 * The mirror is appended to the rightmost column's `start`/`end` segment arrays so it
	 * flows through the same post-mapping processing as the x=0 line: `getAsanohaSnapRules`
	 * (applied via `snapAdjacentFacets`) chains it across quads and `endsTrimmed` trims it at
	 * the band's lengthwise ends.
	 * `getAsanohaSegments` must be called with the matching `hasOuterMirror` flag so the
	 * indices line up.
	 */
	finishOuterEdge?: boolean;
}) => {
	const row = size / rows;
	const col = size / columns;

	// const w = col / 6;
	const h = row / 4;
	// const w2 = ((col / 2) * Math.sqrt(3)) ;
	// const w3 = col - w2;
	const w1 = col / 6; //(2 / Math.sqrt(3)) * ((col / 2 )/ (Math.sqrt(3) / 2));
	const w2 = col / 2 - w1;
	const w3 = col / 2;
	const w4 = col / 2 + w1;
	const w5 = col - w1;
	const w6 = col;

	const edgeSegment: PathSegment[] = [
		['M', w6, h],
		['L', w6, 3 * h]
	];

	// The far-left side of the unit (x = 0) is finished by a full-height vertical line:
	// the `start` segment (0→h) + greens (h→3h) + `end` segment (3h→4h). The far-right
	// side (x = w6) only gets `edgeSegment` (h→3h). To finish the free OUTER edge of an
	// edge band, mirror the `start`/`end` verticals onto the w6 side so it too becomes a
	// full-height line. These are appended to the `start`/`end` arrays (not `middle`) so
	// they get the same straighten/trim processing — mirrorStart is the top (0→h),
	// mirrorEnd the bottom (3h→4h), together complementing edgeSegment's middle (h→3h).
	const mirrorStartSegment: PathSegment[] = [
		['M', w6, 0],
		['L', w6, h]
	];
	const mirrorEndSegment: PathSegment[] = [
		['M', w6, 3 * h],
		['L', w6, 4 * h]
	];

	const unitPattern = (
		edge = false,
		start = false
	): {
		start: PathSegment[];
		middle: PathSegment[];
		// nonEnd: PathSegment[];
		end: PathSegment[];
	} => ({
		start: [
			//yellow
			['M', 0, 0],
			['L', 0, h],
			// mirror top on the w6 side, appended so it shares the start-region processing
			...(start ? mirrorStartSegment : [])
		],
		end: [
			//yellow
			['M', 0, 3 * h],
			['L', 0, 4 * h],
			// mirror bottom on the w6 side, appended so it shares the end-region processing
			...(start ? mirrorEndSegment : [])
		],
		middle: [
			// blue 1
			['M', w2, h],
			['L', w3, 0],
			['L', w4, h],
			['L', w3, 2 * h],
			['L', w2, h],
			// blue 2
			['M', w2, 3 * h],
			['L', w3, 2 * h],
			['L', w4, 3 * h],
			['L', w3, 4 * h],
			['L', w2, 3 * h],
			//red left
			['M', w1, 0],
			['L', 0, h],
			['L', w1, 2 * h],
			['L', 0, 3 * h],
			['L', w1, 4 * h],
			//red right
			['M', w5, 0],
			['L', w6, h],
			['L', w5, 2 * h],
			['L', w6, 3 * h],
			['L', w5, 4 * h],
			//pink 1
			['M', 0, h],
			['L', w3, 0],
			['L', w6, h],
			['L', w3, 2 * h],
			['L', 0, h],
			//pink 2
			['M', 0, 3 * h],
			['L', w3, 2 * h],
			['L', w6, 3 * h],
			['L', w3, 4 * h],
			['L', 0, 3 * h],
			//purples
			['M', 0, h],
			['L', w2, h],
			['M', w4, h],
			['L', w6, h],
			['M', 0, 3 * h],
			['L', w2, 3 * h],
			['M', w4, 3 * h],
			['L', w6, 3 * h],
			// greens
			['M', 0, h],
			['L', 0, 3 * h],
			['M', w3, 0],
			['L', w3, 2 * h],
			['M', w3, 2 * h],
			['L', w3, 4 * h],
			...(edge ? edgeSegment : []),
			// browns
			['M', w1, 0],
			['L', w5, 0],
			['M', w1, 2 * h],
			['L', w5, 2 * h],
			['M', w1, 4 * h],
			['L', w5, 4 * h]
		]
	});

	const startSegments: PathSegment[] = [];
	const middleSegments: PathSegment[] = [];
	const endSegments: PathSegment[] = [];

	for (let c = 0; c < columns; c++) {
		for (let r = 0; r < rows; r++) {
			const unit = unitPattern(c === columns - 1, finishOuterEdge && c === columns - 1);
			if (r > 0 && r < rows - 1) {
				middleSegments.push(
					...translatePS(unit.start, col * c, row * r),
					...translatePS(unit.middle, col * c, row * r),
					...translatePS(unit.end, col * c, row * r)
				);
				continue;
			}

			if (rows === 1) {
				startSegments.push(...translatePS(unit.start, col * c, row * r));
				endSegments.push(...translatePS(unit.end, col * c, row * r));
			} else if (r === 0) {
				middleSegments.push(...translatePS(unit.end, col * c, row * r));
				startSegments.push(...translatePS(unit.start, col * c, row * r));
			} else if (r === rows - 1) {
				middleSegments.push(...translatePS(unit.start, col * c, row * r));
				endSegments.push(...translatePS(unit.end, col * c, row * r));
			}
			middleSegments.push(...translatePS(unit.middle, col * c, row * r));
		}
	}

	return [...startSegments, ...middleSegments, ...endSegments];
};

/////////////////////////////////////////////////
// Adjustment functions — built on the shared adjacent-facet snapper.

export type GetSegmentFunction = (
	end: 'start' | 'end',
	rows: number,
	columns: number,
	facetLength: number,
	hasOuterMirror?: boolean
) => [number, number][];

/**
 * Asanoha's snap rules for one facet: each start pair's first node snaps onto the
 * previous facet's matching end pair's first node, and each end pair's second node
 * snaps onto the next facet's matching start pair's second node. This chains the
 * x = 0 (and mirrored w6) verticals across quads.
 */
export const getAsanohaSnapRules = (
	getSegments: GetSegmentFunction,
	rows: number,
	columns: number,
	facetLength: number,
	hasOuterMirror: boolean
): FacetSnapRule[] => {
	if (rows < 1 || columns < 1) {
		console.error(`bad row or column count, rows: ${rows}, columns: ${columns}`);
		return [];
	}
	const start = getSegments('start', rows, columns, facetLength, hasOuterMirror);
	const end = getSegments('end', rows, columns, facetLength, hasOuterMirror);
	return [
		{ from: 'prev', pairs: start.map(([first], k) => ({ target: first, source: end[k][0] })) },
		{ from: 'next', pairs: end.map(([, second], k) => ({ target: second, source: start[k][1] })) }
	];
};

export const adjustAsanohaPatternAfterMapping = (
	patternBand: PathSegment[][],
	quadBand: Quadrilateral[],
	tiledPatternConfig: TiledPatternConfig,
	getSegments: GetSegmentFunction,
	// True for the outermost band, whose facets carry the mirrored w6 finishing line in
	// their start/end regions — the segment-index lookups must account for it.
	hasOuterMirror = false
): PathSegment[][] => {
	const { endsMatched, endsTrimmed, rowCount, columnCount } = tiledPatternConfig.config;
	const rows = rowCount || 1;
	const columns = columnCount || 1;
	const mapped = patternBand;
	patternBand = snapAdjacentFacets(
		mapped,
		quadBand,
		(i) => getAsanohaSnapRules(getSegments, rows, columns, mapped[i].length, hasOuterMirror),
		{ endsMatched: !!endsMatched }
	);

	if (endsTrimmed) {
		const startSegments = getSegments(
			'start',
			rows,
			columns,
			patternBand[0].length,
			hasOuterMirror
		).flat();
		const endSegments = getSegments(
			'end',
			rows,
			columns,
			patternBand[patternBand.length - 1].length,
			hasOuterMirror
		).flat();
		patternBand[0].splice(0, startSegments.length);
		patternBand[patternBand.length - 1].splice(Math.min(...endSegments), endSegments.length);
	}
	return patternBand;
};

export const getAsanohaSegments = (
	end: 'start' | 'end',
	rows: number,
	columns: number,
	facetLength: number,
	hasOuterMirror = false
): [number, number][] => {
	const indices: [number, number][] = [];
	// The start/end regions each hold one [M, L] pair per column, plus one extra mirror
	// pair (the w6 finishing line) when the band carries the outer mirror.
	const regionSize = columns * 2 + (hasOuterMirror ? 2 : 0);
	const endRegionStart = facetLength - regionSize;
	for (let c = 0; c < columns; c++) {
		if (end === 'start') {
			indices.push([c * 2, c * 2 + 1]);
		} else {
			indices.push([endRegionStart + c * 2, endRegionStart + c * 2 + 1]);
		}
	}
	if (hasOuterMirror) {
		// Mirror pair sits immediately after the per-column pairs in each region.
		if (end === 'start') {
			indices.push([columns * 2, columns * 2 + 1]);
		} else {
			indices.push([endRegionStart + columns * 2, endRegionStart + columns * 2 + 1]);
		}
	}
	return indices;
};
