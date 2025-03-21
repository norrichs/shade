import type { GridVariant, PathSegment, Quadrilateral, TiledPatternConfig } from '$lib/types';
import { translatePS } from './utils';

type Props = {
	size: number;
	rows: number;
	columns: number;
	variant: GridVariant;
};

const generateUnit = (
	edge = false,
	w: number,
	h: number,
	variant: GridVariant
): { start: PathSegment[]; middle: PathSegment[]; end: PathSegment[] } => {
	switch (variant) {
		case 'triangle-0':
			return unitTriangle(edge, w, h, 'triangle-0');
		case 'triangle-1':
			return unitTriangle(edge, w, h, 'triangle-1');
		default:
			return unitRect(edge, w, h);
	}
};

const unitRect = (
	edge = false,
	w: number,
	h: number
): { start: PathSegment[]; middle: PathSegment[]; end: PathSegment[] } => ({
	start: [
		['M', 0, 0],
		['L', w, 0]
	],
	middle: [
		['M', 0, 0],
		['L', 0, h],

		['M', w, 0],
		['L', w, h]
	],
	end: [
		['M', 0, h],
		['L', w, h]
	]
});

const unitTriangle = (
	edge = false,
	w: number,
	h: number,
	subVariant: 'triangle-0' | 'triangle-1'
): { start: PathSegment[]; middle: PathSegment[]; end: PathSegment[] } => {
	const triangleSegments =
		subVariant === 'triangle-0'
			? ([
					['M', 0, 0],
					['L', w, h]
			  ] as PathSegment[])
			: ([
					['M', 0, h],
					['L', w, 0]
			  ] as PathSegment[]);

	return {
		start: [
			['M', 0, 0],
			['L', w, 0]
		],
		middle: [['M', 0, 0], ['L', 0, h], ...triangleSegments, ['M', w, 0], ['L', w, h]],
		end: [
			['M', 0, h],
			['L', w, h]
		]
	};
};

export const generateGridPattern = ({ size, rows, columns, variant }: Props): PathSegment[] => {
	const row = size / rows;
	const col = size / columns;
	const h = row;
	const w = col;

	const startSegments: PathSegment[] = [];
	const middleSegments: PathSegment[] = [];
	const endSegments: PathSegment[] = [];

	for (let c = 0; c < columns; c++) {
		for (let r = 0; r < rows; r++) {
			const unit = generateUnit(c === columns - 1, w, h, variant);
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

export const adjustRectPatternAfterTiling = (
	patternBand: PathSegment[][],
	quadBand: Quadrilateral[],
	tiledPatternConfig: TiledPatternConfig
): PathSegment[][] => {
	console.debug('adjustRectPattern stub', { patternBand, quadBand, tiledPatternConfig });
	return patternBand;
};
