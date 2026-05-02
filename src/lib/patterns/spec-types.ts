import type { PathSegment } from '$lib/types';

export type IndexPair = { source: number; target: number };

export type UnitDefinition = {
	width: number;
	height: number;
	start: PathSegment[];
	middle: PathSegment[];
	end: PathSegment[];
};

export type AdjustmentRules = {
	withinBand: IndexPair[];
	acrossBands: IndexPair[];
	partner: {
		startEnd: IndexPair[];
		endEnd: IndexPair[];
	};
	skipRemove: number[];
};

export type TiledPatternAlgorithm =
	| 'shield-tesselation'
	| 'hex'
	| 'box'
	| 'bowtie'
	| 'carnation'
	| 'grid'
	| 'multihex-tesselation'
	| 'triangle-panel'
	| 'tristar';

export type TiledPatternSpec = {
	id: string;
	name: string;
	algorithm: TiledPatternAlgorithm;
	builtIn: boolean;
	unit: UnitDefinition;
	adjustments: AdjustmentRules;
};
