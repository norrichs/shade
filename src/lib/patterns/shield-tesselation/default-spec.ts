import type { LinePathSegment, MovePathSegment } from '$lib/types';
import type { TiledPatternSpec } from '../spec-types';

const UNIT_WIDTH = 42;
const UNIT_HEIGHT = 14;

const start: (MovePathSegment | LinePathSegment)[] = [
	['M', 0, 0],
	['L', 10, 2],
	['M', 10, 2],
	['L', 14, 0],
	['M', 14, 0],
	['L', 19, 1],
	['M', 19, 1],
	['L', 23, -1],
	['M', 23, -1],
	['L', 28, 0],
	['M', 28, 0],
	['L', 32, -2],
	['M', 32, -2],
	['L', 42, 0]
];

const middle: (MovePathSegment | LinePathSegment)[] = [
	['M', 0, 0],
	['L', 2, 6],
	['M', 10, 2],
	['L', 11, 5],
	['M', 19, 1],
	['L', 21, 7],
	['M', 28, 0],
	['L', 29, 3],
	['M', -2, 8],
	['L', 0, 14],
	['M', 7, 7],
	['L', 8, 10],
	['M', 34, 4],
	['L', 35, 7],
	['M', 42, 0],
	['L', 44, 6],
	['M', 13, 11],
	['L', 14, 14],
	['M', 21, 7],
	['L', 23, 13],
	['M', 31, 9],
	['L', 32, 12],
	['M', 40, 8],
	['L', 42, 14],
	['M', -2, 8],
	['L', 2, 6],
	['M', 2, 6],
	['L', 7, 7],
	['M', 7, 7],
	['L', 11, 5],
	['M', 11, 5],
	['L', 21, 7],
	['M', 21, 7],
	['L', 31, 9],
	['M', 31, 9],
	['L', 35, 7],
	['M', 35, 7],
	['L', 40, 8],
	['M', 40, 8],
	['L', 44, 6],
	['M', 0, 14],
	['L', 8, 10],
	['M', 8, 10],
	['L', 13, 11],
	['M', 13, 11],
	['L', 21, 7],
	['M', 21, 7],
	['L', 29, 3],
	['M', 29, 3],
	['L', 34, 4],
	['M', 34, 4],
	['L', 42, 0]
];

const end: (MovePathSegment | LinePathSegment)[] = [
	['M', 0, 14],
	['L', 10, 16],
	['M', 10, 16],
	['L', 14, 14],
	['M', 14, 14],
	['L', 19, 15],
	['M', 19, 15],
	['L', 23, 13],
	['M', 23, 13],
	['L', 28, 14],
	['M', 28, 14],
	['L', 32, 12],
	['M', 32, 12],
	['L', 42, 14]
];

export const defaultShieldSpec: TiledPatternSpec = {
	id: 'tiledShieldTesselationPattern',
	name: 'Shield (default)',
	algorithm: 'shield-tesselation',
	builtIn: true,
	unit: {
		width: UNIT_WIDTH,
		height: UNIT_HEIGHT,
		start,
		middle,
		end
	},
	adjustments: {
		withinBand: [
			{ source: 1, target: 67 },
			{ source: 2, target: 68 },
			{ source: 5, target: 71 },
			{ source: 6, target: 72 },
			{ source: 7, target: 73 },
			{ source: 8, target: 74 },
			{ source: 7, target: 33 },
			{ source: 11, target: 77 },
			{ source: 12, target: 78 },
			{ source: 11, target: 35 }
		],
		acrossBands: [
			{ source: 36, target: 22 },
			{ source: 36, target: 38 },
			{ source: 29, target: 15 },
			{ source: 29, target: 39 },
			{ source: 29, target: 40 }
		],
		partner: {
			startEnd: [
				{ source: 6, target: 7 },
				{ source: 5, target: 8 },
				{ source: 2, target: 11 },
				{ source: 1, target: 12 }
			],
			endEnd: [
				{ source: 73, target: 72 },
				{ source: 74, target: 71 },
				{ source: 77, target: 68 },
				{ source: 78, target: 67 }
			]
		},
		skipRemove: [22, 23, 38, 39]
	}
};
