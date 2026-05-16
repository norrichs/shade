import type { TiledPatternSpec } from '../../spec-types';

export const defaultBoxSpec: TiledPatternSpec = {
	id: 'tiledBoxPattern-0',
	name: 'Box (default)',
	algorithm: 'box',
	builtIn: true,
	unit: {
		width: 2,
		height: 6,
		start: [],
		middle: [
			['M', 0, 1],
			['L', 1, 0],
			['L', 1, 2],
			['L', 0, 3],
			['Z'],
			['M', 1, 0],
			['L', 2, 1],
			['L', 2, 3],
			['L', 1, 2],
			['Z'],
			['M', 0, 3],
			['L', 1, 2],
			['L', 2, 3],
			['L', 1, 4],
			['Z'],
			['M', 0, 3],
			['L', 1, 4],
			['L', 1, 6],
			['L', 0, 5],
			['Z'],
			['M', 1, 4],
			['L', 2, 3],
			['L', 2, 5],
			['L', 1, 6],
			['Z']
		],
		end: []
	},
	adjustments: {
		withinBand: [],
		acrossBands: [],
		partner: {
			startEnd: [],
			endEnd: []
		},
		skipRemove: []
	}
};
