import type { PathSegment, PatternedPattern, HexPattern } from '$lib/types';

export const generateAuxetic = ({
	size,
	rows,
	columns
}: {
	size: number;
	rows: number;
	columns: number;
}): PathSegment[] => {
	const unit = size;
	const w = unit / 2 / columns;
	const h = unit / 4 / rows;
	const colW = unit / columns;
	const rowH = unit / rows;

	const units: PathSegment[] = [];

	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < columns; col++) {
			units.push(
				['M', col * colW, row * rowH + 0.5 * h],
				['L', col * colW + w, row * rowH + 1.5 * h],
				['L', col * colW + 2 * w, row * rowH + 0.5 * h],
				['L', col * colW + 2 * w, row * rowH + 3.5 * h],
				['L', col * colW + w, row * rowH + 2.5 * h],
				['L', col * colW + 0, row * rowH + 3.5 * h],
				['L', col * colW + 0, row * rowH + 0.5 * h],

				['M', col * colW + w, row * rowH],
				['L', col * colW + w, row * rowH + 1.5 * h],
				['M', col * colW + w, row * rowH + 2.5 * h],
				['L', col * colW + w, row * rowH + 4 * h]
			);
		}
	}
	return units;
};

const generateHexPattern = (
	rows: 1,
	columns: 2,
	{ variant, size }: { variant: 0 | 1; size: number }
): HexPattern => {
	const unit = size / 3;
	const h = size / 4;
	const segments: { [key: number]: HexPattern } = {
		0: [
			['M', 0, unit / 2],
			['L', h, 0],
			['L', 2 * h, unit / 2],
			['L', 3 * h, 0],
			['L', 4 * h, unit / 2],

			['M', 0, unit / 2],
			['L', 0, (3 * unit) / 2],

			['M', 2 * h, unit / 2],
			['L', 2 * h, (3 * unit) / 2],

			['M', 4 * h, unit / 2],
			['L', 4 * h, (3 * unit) / 2],

			['M', 0, (3 * unit) / 2],
			['L', h, 2 * unit],
			['L', 2 * h, (3 * unit) / 2],
			['L', 3 * h, 2 * unit],
			['L', 4 * h, (3 * unit) / 2],

			['M', h, 2 * unit],
			['L', h, 3 * unit],

			['M', 3 * h, 2 * unit],
			['L', 3 * h, 3 * unit]
		],
		1: [
			['M', 0, unit],
			['L', h, 0.5 * unit],
			['L', 2 * h, unit],
			['L', 3 * h, 0.5 * unit],
			['L', 4 * h, unit],

			['L', 4 * h, 2 * unit],
			['L', 3 * h, 2.5 * unit],
			['L', 2 * h, 2 * unit],
			['L', h, 2.5 * unit],
			['L', 0, 2 * unit],
			['L', 0, unit],
			['Z'],

			// Center segment
			['M', 2 * h, unit],
			['L', 2 * h, 2 * unit],

			// Top segments
			['M', h, 0.5 * unit],
			['L', h, 0],

			['M', 3 * h, 0.5 * unit],
			['L', 3 * h, 0],

			// Bottom segments
			['M', h, 2.5 * unit],
			['L', h, 3 * unit],

			['M', 3 * h, 2.5 * unit],
			['L', 3 * h, 3 * unit]
		]
	};
	return segments[variant];
};

export const generateBoxPattern = ({
	size = 1,
	height = 1,
	width = 2
}: {
	size?: number;
	height?: 1 | 2 | 3 | 4 | 5 | 6;
	width?: 1 | 2 | 3 | 4 | 5 | 6;
}) => {
	const rowHeight = size / height;
	const columnWidth = size / width;
	const v = rowHeight / 6;
	const h = columnWidth / 2;
	const segments: PathSegment[] = [];
	console.debug(rowHeight, columnWidth, v, h);
	for (let row = 0; row < height; row++) {
		for (let col = 0; col < width; col++) {
			const r = rowHeight * row;
			const c = columnWidth * col;
			console.debug('   ', c, r);
			segments.push(
				...([
					['M', c + 0, r + v],
					['L', c + h, r + 0],
					['L', c + h, r + 2 * v],
					['L', c + 0, r + 3 * v],
					['Z'],
					['M', c + h, r + 0],
					['L', c + 2 * h, r + v],
					['L', c + 2 * h, r + 3 * v],
					['L', c + h, r + 2 * v],
					['Z'],
					['M', c + 0, r + 3 * v],
					['L', c + h, r + 2 * v],
					['L', c + 2 * h, r + 3 * v],
					['L', c + h, r + 4 * v],
					['Z'],
					['M', c + 0, r + 3 * v],
					['L', c + h, r + 4 * v],
					['L', c + h, r + 6 * v],
					['L', c + 0, r + 5 * v],
					['Z'],
					['M', c + h, r + 4 * v],
					['L', c + 2 * h, r + 3 * v],
					['L', c + 2 * h, r + 5 * v],
					['L', c + h, r + 6 * v],
					['Z']
				] as PathSegment[])
			);
		}
	}

	return segments;
};

const straightenEndSegments = (
	thisFacet: PathSegment[],
	prevFacet: PathSegment[],
	thisSegmentsIndices: number[][],
	prevSegmentsIndices: number[][]
) => {
	console.debug('adjust stub 1', thisFacet, prevFacet, thisSegmentsIndices, prevSegmentsIndices);
	if (
		thisSegmentsIndices.length !== prevSegmentsIndices.length ||
		thisSegmentsIndices.length === 0
	) {
		console.error();
		return thisFacet;
	}

	const output = window.structuredClone(thisFacet);

	return output;
};

export const patterns = {
	'tiledHexPattern-0': {
		getUnitPattern: () => generateHexPattern(1, 2, { variant: 0, size: 1 }),
		adjustAfterTiling: (input: string) => {
			console.debug('adjust stub');
			return input;
		}
	},
	'tiledHexPattern-1': {
		getUnitPattern: () => generateHexPattern(1, 2, { variant: 1, size: 1 }),
		adjustAfterTiling: (facets: [HexPattern, HexPattern]) =>
			straightenEndSegments(
				facets[0],
				facets[1],
				[
					[5, 6],
					[7, 8]
				],
				[
					[20, 21],
					[22, 23]
				]
			) as HexPattern
	},
	'tiledBoxPattern-0': {
		getUnitPattern: (rows: 1 | 2 | 3, columns: 1 | 2 | 3 | 4 | 5) =>
			generateBoxPattern({ size: 1, height: rows, width: columns }),
		adjustAfterTiling: (facets: PatternedPattern) => facets
	},
	'tiledBowtiePattern-0': {
		getUnitPattern: (rows: 1 | 2 | 3, columns: 1 | 2 | 3 | 4 | 5) =>
			generateAuxetic({ size: 1, rows, columns })
	}
};
