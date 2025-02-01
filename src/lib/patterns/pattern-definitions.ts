import type {
	PathSegment,
	HexPattern,
	PatternedPattern,
	Quadrilateral,
	PatternGenerator,
	TiledPatternConfig
} from '$lib/types';
import {
	adjustHexPatternAfterTiling,
	generateHexPattern,
	straightenEndSegments
} from './tiled-hex-pattern';
import type { HexRows, HexCols } from './tiled-hex-pattern';
import { adjustCarnation, generateCarnation } from './tiled-carnation-pattern';
import { generateBoxPattern } from './tiled-box-pattern';
import { generateAuxetic } from './tiled-bowtie-pattern';
import { generateBranched } from './banded-branched-pattern';
import { adjustTriStarPatternAfterTiling, generateTriStarPattern, getTriStarSegments } from './tiled-tristar-pattern';

export const patterns: { [key: string]: PatternGenerator } = {
	'tiledHexPattern-1': {
		getPattern: (rows: HexRows, columns: HexCols) =>
			generateHexPattern(rows, columns, { variant: 1, size: 1 }),
		tagAnchor: { facetIndex: 0, segmentIndex: 0 },
		adjustAfterTiling: adjustHexPatternAfterTiling
	},
	'tiledBoxPattern-0': {
		getPattern: (rows: 1 | 2 | 3, columns: 1 | 2 | 3 | 4 | 5) =>
			generateBoxPattern({ size: 1, height: rows, width: columns }),
		adjustAfterTiling: (facets: PatternedPattern) => facets,
		tagAnchor: { facetIndex: 0, segmentIndex: 5, angle: 0 }
	},
	'tiledBowtiePattern-0': {
		getPattern: (rows: 1 | 2 | 3, columns: 1 | 2 | 3 | 4 | 5) =>
			generateAuxetic({ size: 1, rows, columns }),
		tagAnchor: { facetIndex: 0, segmentIndex: 7, angle: 0 }
	},
	'tiledCarnationPattern-0': {
		getPattern: (rows: 1 | 2 | 3, columns: 1 | 2 | 3 | 4 | 5) =>
			generateCarnation({ size: 1, rows, columns, variant: 0 }),
		tagAnchor: { facetIndex: 0, segmentIndex: 0 },
		adjustAfterTiling: (tiledBands: { facets: PatternedPattern[] }[]) => {
			return adjustCarnation(tiledBands);
		}
	},
	'tiledCarnationPattern-1': {
		getPattern: (rows: 1 | 2 | 3, columns: 1 | 2 | 3 | 4 | 5) =>
			generateCarnation({ size: 1, rows, columns, variant: 1 }),
		tagAnchor: { facetIndex: 0, segmentIndex: 0 },
		adjustAfterTiling: (tiledBands: { facets: PatternedPattern[] }[]) => {
			return adjustCarnation(tiledBands);
		}
	},
	'tiledTriStarPattern-1': {
		getPattern: (rows: 1 | 2 | 3, columns: 1 | 2 | 3 | 4 | 5) => {
			const unitPattern = generateTriStarPattern({ size: 1, rows, columns });
			return unitPattern;
		},
		tagAnchor: { facetIndex: 0, segmentIndex: 1 },
		adjustAfterTiling: (
			patternBand: PathSegment[][],
			quadBand: Quadrilateral[],
			tiledPatternConfig: TiledPatternConfig
		) => adjustTriStarPatternAfterTiling(patternBand, quadBand, tiledPatternConfig, getTriStarSegments)
	},
	'bandedBranchedPattern-0': {
		getPattern: (rows: 1 | 2 | 3, columns: 1 | 2 | 3 | 4 | 5, quadBand?: Quadrilateral[]) => {
			if (!quadBand) {
				throw new Error('quadBand Required for bandedBranchPattern-0');
			}
			return generateBranched(quadBand, { rows, columns, variant: 0 });
		},
		tagAnchor: { facetIndex: 0, segmentIndex: 5 },
		adjustAfterTiling: (tiledBands: { facets: PatternedPattern[] }[]) => {
			return adjustCarnation(tiledBands);
		}
	}
};
