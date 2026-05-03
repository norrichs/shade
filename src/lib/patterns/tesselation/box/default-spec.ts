import type { TiledPatternSpec } from '../../spec-types';

export const defaultBoxSpec: TiledPatternSpec = {
	id: 'tiledBoxPattern-0',
	name: 'Box (default)',
	algorithm: 'box',
	builtIn: true,
	unit: {
		width: 1,
		height: 1,
		start: [],
		middle: [],
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
