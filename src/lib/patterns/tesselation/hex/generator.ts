import type { Band, GridVariant, PathSegment } from '$lib/types';
import { translatePS } from '../../utils';
import type { TiledPatternSpec } from '../../spec-types';

export type HexGeneratorProps = {
	size: number;
	rows: number;
	columns: number;
	variant?: GridVariant;
	sideOrientation: Band['sideOrientation'];
};

export const generateHexTile = (
	_spec: TiledPatternSpec,
	props: HexGeneratorProps
): PathSegment[] => {
	const { size, rows, columns } = props;
	const row = size / rows;
	const col = size / columns;
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
			['M', 0, h],
			['L', w, 0.5 * h],
			['L', col, h],

			['M', 0, h],
			['L', 0, 2 * h],

			...(edge ? edgeSegment : []),

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
