import type {
	PathSegment,
	PatternedPattern,
	Quadrilateral,
	PatternGenerator,
	TiledPatternConfig,
	GridVariant,
	PanelVariant
} from '$lib/types';
import { adjustHexPatternAfterTiling, generateHexPattern } from './tiled-hex-pattern';
import { adjustCarnation, generateCarnation } from './tiled-carnation-pattern';
import { generateBoxPattern } from './tiled-box-pattern';
import { generateAuxetic } from './tiled-bowtie-pattern';
import { generateBranched } from './banded-branched-pattern';
import {
	adjustTriStarPatternAfterMapping,
	generateTriStarPattern,
	getTriStarSegments
} from './tiled-tristar-pattern';
import { generateGridPattern, adjustRectPatternAfterTiling } from './tiled-grid-pattern';
import {
	adjustShieldTesselationAfterTiling,
	generateShieldTesselationTile
} from './tiled-shield-tesselation-pattern';
import {
	adjustPanelPatternAfterTiling,
	generatePanelPattern
} from './tiled-triangle-panel-pattern';

export const patterns: { [key: string]: PatternGenerator } = {
	'tiledHexPattern-1': {
		getPattern: (rows: number, columns: number) =>
			generateHexPattern(rows, columns, { variant: 1, size: 1 }),
		tagAnchor: { facetIndex: 0, segmentIndex: 0 },
		adjustAfterMapping: adjustHexPatternAfterTiling
	},
	'tiledBoxPattern-0': {
		getPattern: (rows: 1 | 2 | 3, columns: 1 | 2 | 3 | 4 | 5) =>
			generateBoxPattern({ size: 1, height: rows, width: columns }),
		// adjustAfterTiling: (facets: PatternedPattern) => facets,
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
			return adjustCarnation(tiledBands, 0);
		}
	},
	'tiledCarnationPattern-1': {
		getPattern: (rows: 1 | 2 | 3, columns: 1 | 2 | 3 | 4 | 5) =>
			generateCarnation({ size: 1, rows, columns, variant: 1 }),
		tagAnchor: { facetIndex: 0, segmentIndex: 0 },
		adjustAfterTiling: (tiledBands: { facets: PatternedPattern[] }[]) => {
			return adjustCarnation(tiledBands, 1);
		}
	},
	'tiledTriStarPattern-1': {
		getPattern: (rows: 1 | 2 | 3, columns: 1 | 2 | 3 | 4 | 5) => {
			const unitPattern = generateTriStarPattern({ size: 1, rows, columns });
			return unitPattern;
		},
		tagAnchor: { facetIndex: 0, segmentIndex: 1 },
		adjustAfterMapping: (
			patternBand: PathSegment[][],
			quadBand: Quadrilateral[],
			tiledPatternConfig: TiledPatternConfig
		) =>
			adjustTriStarPatternAfterMapping(
				patternBand,
				quadBand,
				tiledPatternConfig,
				getTriStarSegments
			)
	},
	'tiledGridPattern-0': {
		getPattern: (
			rows: number,
			columns: number,
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			quadBand: Quadrilateral[] | undefined = undefined,
			variant: GridVariant | undefined = 'rect'
		) => {
			return generateGridPattern({ size: 1, rows, columns, variant });
		},
		tagAnchor: { facetIndex: 0, segmentIndex: 1 },
		adjustAfterMapping: (
			patternBand: PathSegment[][],
			quadBand: Quadrilateral[],
			tiledPatternConfig: TiledPatternConfig
		) => adjustRectPatternAfterTiling(patternBand, quadBand, tiledPatternConfig)
	},
	'tiledPanelPattern-0': {
		getPattern: (
			rows: number,
			columns: number,
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			quadBand: Quadrilateral[] | undefined = undefined,
			variant: PanelVariant | undefined = 'triangle-0'
		) => {
			return generatePanelPattern({ size: 1, variant });
		},
		tagAnchor: { facetIndex: 0, segmentIndex: 1 },
		adjustAfterMapping: (
			patternBand: PathSegment[][],
			quadBand: Quadrilateral[],
			tiledPatternConfig: TiledPatternConfig
		) => adjustPanelPatternAfterTiling(patternBand, quadBand, tiledPatternConfig)
	},
	tiledShieldTesselationPattern: {
		getPattern: (
			rows: number,
			columns: number,
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			quadBand: Quadrilateral[] | undefined = undefined,
			variant: GridVariant | undefined = 'rect'
		) => {
			return generateShieldTesselationTile({ size: 1, rows, columns, variant });
		},
		tagAnchor: { facetIndex: 0, segmentIndex: 3 },
		adjustAfterTiling: (
			patternBand: PathSegment[][],
			quadBand: Quadrilateral[],
			tiledPatternConfig: TiledPatternConfig
		) => {
			const adjusted = adjustShieldTesselationAfterTiling(
				patternBand,
				quadBand,
				tiledPatternConfig
			);
			return adjusted.bands;
		}
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
