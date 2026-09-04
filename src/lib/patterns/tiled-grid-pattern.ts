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

export type GridPatternMeta = {
	path: PathSegment[];
	/**
	 * One `[moveIndex, lineIndex]` pair per row, in row order, addressing the
	 * LAST column's outer-edge vertical within `path`. Length always equals `rows`.
	 */
	outerEdgeSegmentIndices: number[][];
};

/**
 * Offset of the outer vertical's [M, L] pair within a unit's `middle` group.
 * `rect` middle is [M 0,0][L 0,h][M w,0][L w,h]; the triangle variants insert
 * the diagonal's two segments before the outer pair.
 */
const outerPairOffsetInMiddle = (variant: GridVariant): number => (variant === 'rect' ? 2 : 4);

export const generateGridPatternWithMeta = ({
	size,
	rows,
	columns,
	variant
}: Props): GridPatternMeta => {
	const row = size / rows;
	const col = size / columns;
	const h = row;
	const w = col;

	const startSegments: PathSegment[] = [];
	const middleSegments: PathSegment[] = [];
	const endSegments: PathSegment[] = [];

	// Offsets into `middleSegments`, resolved to absolute path indices after concat.
	const outerOffsets: number[][] = [];
	const outerOffset = outerPairOffsetInMiddle(variant);

	for (let c = 0; c < columns; c++) {
		const isLastColumn = c === columns - 1;
		for (let r = 0; r < rows; r++) {
			const unit = generateUnit(isLastColumn, w, h, variant);
			if (r > 0 && r < rows - 1) {
				middleSegments.push(...translatePS(unit.start, col * c, row * r));
				const base = middleSegments.length;
				middleSegments.push(...translatePS(unit.middle, col * c, row * r));
				if (isLastColumn) outerOffsets[r] = [base + outerOffset, base + outerOffset + 1];
				middleSegments.push(...translatePS(unit.end, col * c, row * r));
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
			const base = middleSegments.length;
			middleSegments.push(...translatePS(unit.middle, col * c, row * r));
			if (isLastColumn) outerOffsets[r] = [base + outerOffset, base + outerOffset + 1];
		}
	}

	const shift = startSegments.length;
	return {
		path: [...startSegments, ...middleSegments, ...endSegments],
		outerEdgeSegmentIndices: outerOffsets.map(([m, l]) => [m + shift, l + shift])
	};
};

export const generateGridPattern = (props: Props): PathSegment[] =>
	generateGridPatternWithMeta(props).path;

/**
 * Which outer-edge segments a band drops, keyed by global row index
 * `k = quadIndex * rows + r`. Odd `k` are dropped, except the final row of the
 * final quad, which always stays so the band's far end reads as closed.
 */
export const getDroppedEdgeSegmentKeys = (rows: number, quadCount: number): Set<number> => {
	const total = rows * quadCount;
	const dropped = new Set<number>();
	for (let k = 1; k < total; k += 2) {
		if (k === total - 1) continue;
		dropped.add(k);
	}
	return dropped;
};

export const adjustRectPatternAfterTiling = (
	patternBand: PathSegment[][],
	quadBand: Quadrilateral[],
	tiledPatternConfig: TiledPatternConfig
): PathSegment[][] => {
	return patternBand;
};
