import type { PathSegment, Point, Quadrilateral, TiledPatternConfig } from '$lib/types';
import { getAngle, rotatePoint, rotatePS, translatePS } from './utils';

export const generateHexPattern = (
	rows: number,
	columns: number,
	{ size }: { variant?: 0 | 1; size: number; adjustEnds?: boolean }
) => {
	const row = size / rows;
	const col = size / columns;
	// const unit = size / 3;
	const h = row / 3;
	const w = col / 2;

	const edgeSegment: [PathSegment, PathSegment] = [
		['M', col, h],
		['L', col, 2 * h]
	];

	const unitPattern = (
		edge = false
	): { start: PathSegment[]; middle: PathSegment[]; end: PathSegment[] } => ({
		start: [
			['M', w, 0],
			['L', w, 0.5 * h]
		],
		middle: [
			// Lateral segments
			['M', 0, h],
			['L', w, 0.5 * h],
			['L', col, h],

			// Center segment
			['M', 0, h],
			['L', 0, 2 * h],

			// Second center segment, only for edge units
			...(edge ? edgeSegment : []),

			// Lower Lateral segments
			['M', 0, 2 * h],
			['L', w, 2.5 * h],
			['L', col, 2 * h]
		],
		end: [
			['M', w, 2.5 * h],
			['L', w, row]
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

const hexSegments = (
	end: 'start' | 'end',
	rows: number,
	columns: number,
	facetLength: number
): [number, number][] => {
	if (rows < 1 || columns < 1) {
		console.error('rows and columns must be >=1');
		return [[0, 0]];
	}
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

const translateQuad = (quad: Quadrilateral, x: number, y: number) => {
	return {
		p0: {x: quad.p0.x + x, y: quad.p0.y + y},
		p1: {x: quad.p1.x + x, y: quad.p1.y + y},
		p2: {x: quad.p2.x + x, y: quad.p2.y + y},
		p3: {x: quad.p3.x + x, y: quad.p3.y + y},
	}
}
const rotateQuad = (quad: Quadrilateral, angle: number, anchor: Point) => {
	return {
		p0: rotatePoint(anchor, quad.p0, angle),
		p1: rotatePoint(anchor, quad.p1, angle),
		p2: rotatePoint(anchor, quad.p2, angle),
		p3: rotatePoint(anchor, quad.p3, angle),
	}
}

export const adjustHexPatternAfterTiling = (
	patternBand: PathSegment[][],
	quadBand: Quadrilateral[],
	tiledPatternConfig: TiledPatternConfig
): PathSegment[][] => {
	const { endsMatched, endsTrimmed, rowCount, columnCount, endLooped } = tiledPatternConfig.config;
	let prevFacet: PathSegment[] | undefined;
	let nextFacet: PathSegment[] | undefined;
	let thisFacet: PathSegment[];
	let thisQuad: Quadrilateral;
	const finalFacets: PathSegment[][] = [];
	const finalQuads: Quadrilateral[] = []

	if (endLooped > 0) {
		const index = patternBand.length - 1;
		thisFacet = patternBand[index]
		thisQuad = quadBand[index]
		const nextQuad = quadBand[0];
		const tDiff = { x: thisQuad.p3.x - nextQuad.p0.x, y: thisQuad.p3.y - nextQuad.p0.y };

		const aDiff = getAngle(thisQuad.p3, thisQuad.p2) - getAngle(nextQuad.p0, nextQuad.p1);

		for (let k = 0; k < endLooped; k++) {
			const translatedQuad = translateQuad(window.structuredClone(quadBand[k]), tDiff.x, tDiff.y)
			finalQuads.push(rotateQuad(translatedQuad, aDiff, thisQuad.p3))


			const translated = translatePS(window.structuredClone(patternBand[k]), tDiff.x, tDiff.y);
			finalFacets.push(rotatePS(translated, aDiff, thisQuad.p3));
		}
		patternBand.push(...finalFacets);
		quadBand.push(...finalQuads)
	}






	patternBand = patternBand.map((facet, i, facets) => {
		thisFacet = facet;
		thisQuad = quadBand[i];
		if (i === 0) {
			const prevQuad = quadBand[facets.length - 1];
			const tDiff = { x: thisQuad.p0.x - prevQuad.p3.x, y: thisQuad.p0.y - prevQuad.p3.y };
			const rDiff = 0;
			prevFacet = endsMatched
				? rotatePS(
						translatePS(window.structuredClone(facets[facets.length - 1]), tDiff.x, tDiff.y),
						rDiff
				  )
				: undefined;
			nextFacet = facets[i + 1];
		} else if (i === facets.length - 1) {
			const nextQuad = quadBand[0];
			const tDiff = { x: thisQuad.p3.x - nextQuad.p0.x, y: thisQuad.p3.y - nextQuad.p0.y };
			console.debug(
				'ANGLES',
				getAngle(thisQuad.p3, thisQuad.p2),
				getAngle(nextQuad.p0, nextQuad.p1)
			);
			const aDiff = getAngle(thisQuad.p3, thisQuad.p2) - getAngle(nextQuad.p0, nextQuad.p1);
			prevFacet = facets[i - 1];

			// if (endLooped > 0) {
			// 	for (let k = 0; k < endLooped; k++) {
			// 		const translated = translatePS(window.structuredClone(facets[k]), tDiff.x, tDiff.y);
			// 		finalFacets.push(rotatePS(translated, aDiff, thisQuad.p3));
			// 	}
			// }
			
			nextFacet = endsMatched
				? rotatePS(translatePS(window.structuredClone(facets[0]), tDiff.x, tDiff.y), aDiff, thisQuad.p3)
				: undefined;
		} else {
			prevFacet = facets[i - 1];
			nextFacet = facets[i + 1];
		}
		const straightened = straightenEndSegments({
			prevFacet,
			thisFacet,
			nextFacet,
			rows: (tiledPatternConfig.config.rowCount || 1) as number,
			columns: (tiledPatternConfig.config.columnCount || 1) as number
		});
		return straightened;
	});

	// if (finalFacets.length > 0) {
	// 	console.debug('pushing final facet');
	// 	patternBand.push(...finalFacets.map((facet) => facet));
	// }

	if (endsTrimmed) {
		const startSegments = hexSegments(
			'start',
			rowCount || 1,
			columnCount || 1,
			patternBand[0].length
		).flat();
		const endSegments = hexSegments(
			'end',
			(rowCount || 1) as number,
			(columnCount || 1) as number,
			patternBand[patternBand.length - 1].length
		).flat();
		patternBand[0].splice(0, startSegments.length);
		patternBand[patternBand.length - 1].splice(Math.min(...endSegments), endSegments.length);
	}
	console.debug('patternBand', patternBand.length);
	return patternBand;
};

type StraightenEndSegmentsProps = {
	prevFacet: PathSegment[] | undefined;
	thisFacet: PathSegment[];
	nextFacet: PathSegment[] | undefined;
	rows: number;
	columns: number;
};

export const straightenEndSegments = ({
	prevFacet,
	thisFacet,
	nextFacet,
	rows,
	columns
}: StraightenEndSegmentsProps) => {
	const startSegmentIndices = hexSegments('start', rows, columns, thisFacet.length);
	const endSegmentIndices = hexSegments('end', rows, columns, thisFacet.length);

	const output = window.structuredClone(thisFacet);

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

const loopEndSegments = ({
	prevFacet,
	thisFacet,
	nextFacet,
	rows,
	columns
}: StraightenEndSegmentsProps) => {};
