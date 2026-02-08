import type { PathSegment, Quadrilateral, TiledPatternConfig } from '$lib/types';
import { rotatePS, translatePS } from './utils';

export const generateTriStarPattern = ({
	size,
	rows,
	columns
}: {
	size: number;
	rows: number;
	columns: number;
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

	const unitPattern = (
		edge = false
	): {
		start: PathSegment[];
		middle: PathSegment[];
		// nonEnd: PathSegment[];
		end: PathSegment[];
	} => ({
		start: [
			//yellow
			['M', 0, 0],
			['L', 0, h]
		],
		end: [
			//yellow
			['M', 0, 3 * h],
			['L', 0, 4 * h]
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
			const unit = unitPattern(c === columns - 1);
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
// Adjustment functions.  Make these general so they can be reused

export const adjustTriStarPatternAfterMapping = (
	patternBand: PathSegment[][],
	quadBand: Quadrilateral[],
	tiledPatternConfig: TiledPatternConfig,
	getSegments: GetSegmentFunction
): PathSegment[][] => {
	const { endsMatched, endsTrimmed, rowCount, columnCount } = tiledPatternConfig.config;
	let prevFacet: PathSegment[] | undefined;
	let nextFacet: PathSegment[] | undefined;
	let thisFacet: PathSegment[];
	let thisQuad: Quadrilateral;
	patternBand = patternBand.map((facet, i, facets) => {
		thisFacet = facet;
		thisQuad = quadBand[i];
		if (i === 0) {
			const prevQuad = quadBand[facets.length - 1];
			const tDiff = { x: thisQuad.a.x - prevQuad.d.x, y: thisQuad.a.y - prevQuad.d.y };
			const rDiff = 0;
			prevFacet = endsMatched
				? rotatePS(translatePS(structuredClone(facets[facets.length - 1]), tDiff.x, tDiff.y), rDiff)
				: undefined;

			nextFacet = facets[i + 1];
		} else if (i === facets.length - 1) {
			const nextQuad = quadBand[0];
			const tDiff = { x: thisQuad.d.x - nextQuad.a.x, y: thisQuad.d.y - nextQuad.a.y };
			const rDiff = 0;
			prevFacet = facets[i - 1];
			nextFacet = endsMatched
				? rotatePS(translatePS(structuredClone(facets[0]), tDiff.x, tDiff.y), rDiff)
				: undefined;
		} else {
			prevFacet = facets[i - 1];
			nextFacet = facets[i + 1];
		}
		const straightened = straightenEndSegments({
			prevFacet,
			thisFacet,
			nextFacet,
			rows: tiledPatternConfig.config.rowCount || 1,
			columns: tiledPatternConfig.config.columnCount || 1,
			getSegments
		});
		return straightened;
	});

	if (endsTrimmed) {
		const startSegments = getSegments(
			'start',
			rowCount || 1,
			columnCount || 1,
			patternBand[0].length
		).flat();
		const endSegments = getSegments(
			'end',
			rowCount || 1,
			columnCount || 1,
			patternBand[patternBand.length - 1].length
		).flat();
		patternBand[0].splice(0, startSegments.length);
		patternBand[patternBand.length - 1].splice(Math.min(...endSegments), endSegments.length);
	}
	return patternBand;
};

type StraightenEndSegmentsProps = {
	prevFacet: PathSegment[] | undefined;
	thisFacet: PathSegment[];
	nextFacet: PathSegment[] | undefined;
	rows: number;
	columns: number;
	getSegments: GetSegmentFunction;
};

const straightenEndSegments = ({
	prevFacet,
	thisFacet,
	nextFacet,
	rows,
	columns,
	getSegments
}: StraightenEndSegmentsProps) => {
	if (rows < 1 || columns < 1) {
		console.error(`bad row or column count, rows: ${rows}, columns: ${columns}`);
		return thisFacet;
	}
	const startSegmentIndices = getSegments('start', rows, columns, thisFacet.length);
	const endSegmentIndices = getSegments('end', rows, columns, thisFacet.length);

	const output = structuredClone(thisFacet);
	const altNextFacet = structuredClone(nextFacet);
	const altPrevFacet = structuredClone(prevFacet);

	let firstStartIndex, secondStartIndex, firstEndIndex, secondEndIndex;
	for (let i = 0; i < startSegmentIndices.length; i++) {
		[firstStartIndex, secondStartIndex] = startSegmentIndices[i];
		[firstEndIndex, secondEndIndex] = endSegmentIndices[i];

		if (prevFacet) {
			output[firstStartIndex][1] = prevFacet[firstEndIndex][1];
			output[firstStartIndex][2] = prevFacet[firstEndIndex][2];
		}

		if (nextFacet) {
			output[secondEndIndex][1] = nextFacet[secondStartIndex][1];
			output[secondEndIndex][2] = nextFacet[secondStartIndex][2];
		}
	}

	return output;
};

type GetSegmentFunction = (
	end: 'start' | 'end',
	rows: number,
	columns: number,
	facetLength: number
) => [number, number][];

export const getTriStarSegments = (
	end: 'start' | 'end',
	rows: number,
	columns: number,
	facetLength: number
): [number, number][] => {
	const indices: [number, number][] = [];
	for (let c = 0; c < columns; c++) {
		if (end === 'start') {
			indices.push([c * 2, c * 2 + 1]);
		} else {
			const startIndex = facetLength - columns * 2;
			indices.push([startIndex + c * 2, startIndex + c * 2 + 1]);
		}
	}
	return indices;
};
