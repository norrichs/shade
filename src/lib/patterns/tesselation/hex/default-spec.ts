import type { TiledPatternSpec } from '../../spec-types';

export const defaultHexSpec: TiledPatternSpec = {
	id: 'tiledHexPattern-1',
	name: 'Hex (default)',
	algorithm: 'hex',
	builtIn: true,
	unit: {
		width: 2,
		height: 3,
		start: [
			['M', 1, 0],
			['L', 1, 0.5]
		],
		middle: [
			['M', 0, 1],
			['L', 1, 0.5],
			['L', 2, 1],
			['M', 0, 1],
			['L', 0, 2],
			['M', 0, 2],
			['L', 1, 2.5],
			['L', 2, 2]
		],
		end: [
			['M', 1, 2.5],
			['L', 1, 3]
		],
		lastColumn: [
			['M', 2, 1],
			['L', 2, 2]
		]
	},
	adjustments: {
		withinBand: [
			{ source: 0, target: 10 },
			{ source: 1, target: 11 }
		],
		acrossBands: [],
		partner: {
			startEnd: [],
			endEnd: []
		},
		skipRemove: [],
		trimsEnds: true
	}
};
