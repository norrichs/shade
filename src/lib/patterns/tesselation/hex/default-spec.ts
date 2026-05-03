import type { TiledPatternSpec } from '../../spec-types';

export const defaultHexSpec: TiledPatternSpec = {
	id: 'tiledHexPattern-1',
	name: 'Hex (default)',
	algorithm: 'hex',
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
