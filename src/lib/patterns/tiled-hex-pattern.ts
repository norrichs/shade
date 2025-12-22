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

const translateQuad = (quad: Quadrilateral, x: number, y: number): Quadrilateral => {
	return {
		a: quad.a.clone().add({ x, y, z: 0 } as any),
		b: quad.b.clone().add({ x, y, z: 0 } as any),
		c: quad.c.clone().add({ x, y, z: 0 } as any),
		d: quad.d.clone().add({ x, y, z: 0 } as any)
	};
};
const rotateQuad = (quad: Quadrilateral, angle: number, anchor: Point): Quadrilateral => {
	const rp = (p: any) => rotatePoint(anchor, { x: p.x, y: p.y }, angle);
	return {
		a: { x: rp(quad.a).x, y: rp(quad.a).y, z: quad.a.z } as any,
		b: { x: rp(quad.b).x, y: rp(quad.b).y, z: quad.b.z } as any,
		c: { x: rp(quad.c).x, y: rp(quad.c).y, z: quad.c.z } as any,
		d: { x: rp(quad.d).x, y: rp(quad.d).y, z: quad.d.z } as any
	};
};

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
	const finalQuads: Quadrilateral[] = [];

	if (endLooped > 0) {
		const index = patternBand.length - 1;
		thisFacet = patternBand[index];
		thisQuad = quadBand[index];
		const nextQuad = quadBand[0];
		const tDiff = { x: thisQuad.d.x - nextQuad.a.x, y: thisQuad.d.y - nextQuad.a.y };

		const aDiff = getAngle(thisQuad.d, thisQuad.c) - getAngle(nextQuad.a, nextQuad.b);

		for (let k = 0; k < endLooped; k++) {
			const translatedQuad = translateQuad(window.structuredClone(quadBand[k]), tDiff.x, tDiff.y);
			finalQuads.push(rotateQuad(translatedQuad, aDiff, thisQuad.d));

			const translated = translatePS(window.structuredClone(patternBand[k]), tDiff.x, tDiff.y);
			finalFacets.push(rotatePS(translated, aDiff, thisQuad.d));
		}
		patternBand.push(...finalFacets);
		quadBand.push(...finalQuads);
	}

	patternBand = patternBand.map((facet, i, facets) => {
		thisFacet = facet;
		thisQuad = quadBand[i];
		if (i === 0) {
			const prevQuad = quadBand[facets.length - 1];
			const tDiff = { x: thisQuad.a.x - prevQuad.d.x, y: thisQuad.a.y - prevQuad.d.y };
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
			const tDiff = { x: thisQuad.d.x - nextQuad.a.x, y: thisQuad.d.y - nextQuad.a.y };
			const aDiff = getAngle(thisQuad.d, thisQuad.c) - getAngle(nextQuad.a, nextQuad.b);
			prevFacet = facets[i - 1];

			// if (endLooped > 0) {
			// 	for (let k = 0; k < endLooped; k++) {
			// 		const translated = translatePS(window.structuredClone(facets[k]), tDiff.x, tDiff.y);
			// 		finalFacets.push(rotatePS(translated, aDiff, thisQuad.d));
			// 	}
			// }

			nextFacet = endsMatched
				? rotatePS(
						translatePS(window.structuredClone(facets[0]), tDiff.x, tDiff.y),
						aDiff,
						thisQuad.d
				  )
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
