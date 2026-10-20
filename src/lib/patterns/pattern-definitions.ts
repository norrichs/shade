import type {
	PathSegment,
	Quadrilateral,
	PatternGenerator,
	TiledPatternConfig,
	GridVariant,
	PanelVariant,
	BandCutPattern,
	TiledPatternVariant
} from '#lib/types.js';
import { adjustCarnation, generateCarnation } from './tiled-carnation-pattern';
import { generateAuxetic } from './tiled-bowtie-pattern';
import { generateBranched } from './banded-branched-pattern';
import {
	adjustAsanohaPatternAfterMapping,
	generateAsanohaPattern,
	getAsanohaSegments
} from './tiled-asanoha-pattern';
import {
	HEXPARQUET_SUBUNIT_COUNT,
	adjustHexparquetAfterMapping,
	adjustHexparquetAfterTiling,
	generateHexparquetPreview,
	generateHexparquetSubunits
} from './tiled-hexparquet-pattern';
import {
	ASANOHA_SPLIT_SUBUNIT_COUNT,
	adjustAsanohaSplitAfterMapping,
	generateAsanohaSplitPreview,
	generateAsanohaSplitSubunits
} from './tiled-asanoha-split-pattern';
import { generateGridPattern, adjustGridPatternAfterMapping } from './tiled-grid-pattern';
import { algorithms } from './pattern-registry';
import {
	adjustPanelPatternAfterTiling,
	generatePanelPattern
} from './tiled-triangle-panel-pattern';

const builtInPatternsEntries: { [key: string]: PatternGenerator } = {};
for (const algorithm of algorithms) {
	builtInPatternsEntries[algorithm.defaultSpec.id] = algorithm.createPatternsEntry(
		algorithm.defaultSpec
	);
}

/**
 * Pattern dispatch map. Built-in entries are populated at module load via the registry.
 * User-defined variants are registered/unregistered at runtime by `tilePatternSpecStore`.
 * Look up by id at call-time — do NOT snapshot Object.keys at module init.
 */
export const patterns: { [key: string]: PatternGenerator } = {
	...builtInPatternsEntries,
	'tiledBowtiePattern-0': {
		getPattern: (rows: number, columns: number) => generateAuxetic({ size: 1, rows, columns }),
		tagAnchor: { facetIndex: 0, segmentIndex: 7, angle: 0 }
	},
	'tiledCarnationPattern-0': {
		getPattern: (rows: number, columns: number) =>
			generateCarnation({ size: 1, rows, columns, variant: 0 }),
		tagAnchor: { facetIndex: 0, segmentIndex: 0 },
		adjustAfterTiling: (tiledBands: BandCutPattern[]) => {
			return adjustCarnation(tiledBands, 0);
		}
	},
	'tiledCarnationPattern-1': {
		getPattern: (rows: number, columns: number) =>
			generateCarnation({ size: 1, rows, columns, variant: 1 }),
		tagAnchor: { facetIndex: 0, segmentIndex: 0 },
		adjustAfterTiling: (tiledBands: BandCutPattern[]) => {
			return adjustCarnation(tiledBands, 1);
		}
	},
	'tiledAsanohaPattern-1': {
		getPattern: (
			rows: number,
			columns: number,
			_quadBand?: Quadrilateral[],
			_variant?: unknown,
			_sideOrientation?: unknown,
			finishOuterEdge?: boolean
		) => {
			const unitPattern = generateAsanohaPattern({
				size: 1,
				rows,
				columns,
				finishOuterEdge
			});
			return unitPattern;
		},
		// Anchor at the midpoint of the end facet's quad 'ab' edge. The quad-edge
		// anchor is path-order independent, so it stays put regardless of how
		// `endsTrimmed`/`rowCount` reorder the mapped path. The label angle is then
		// derived from the nearest quad edge.
		tagAnchor: { facetIndex: 0, quadEdge: { edge: 'ab', position: 'midPoint' } },
		adjustAfterMapping: (
			patternBand: PathSegment[][],
			quadBand: Quadrilateral[],
			tiledPatternConfig: TiledPatternConfig,
			finishOuterEdge?: boolean
		) =>
			adjustAsanohaPatternAfterMapping(
				patternBand,
				quadBand,
				tiledPatternConfig,
				getAsanohaSegments,
				finishOuterEdge ?? false
			)
	},
	'tiledAsanohaSplitPattern-0': {
		subunitCount: ASANOHA_SPLIT_SUBUNIT_COUNT,
		// The single-unit form is the preview (A, B, A, B stacked into one quad).
		getPattern: (_rows: number, columns: number) => generateAsanohaSplitPreview(columns),
		getSubunitPatterns: (columns: number) => generateAsanohaSplitSubunits(columns),
		tagAnchor: { facetIndex: 0, quadEdge: { edge: 'ab', position: 'midPoint' } },
		adjustAfterMapping: (
			patternBand: PathSegment[][],
			quadBand: Quadrilateral[],
			tiledPatternConfig: TiledPatternConfig,
			_finishOuterEdge?: boolean,
			bandContext?: { hasOuterPartner: boolean; bandIndex: number; leftPartnerBand?: number }
		) => adjustAsanohaSplitAfterMapping(patternBand, quadBand, tiledPatternConfig, bandContext)
	},
	'tiledHexparquetPattern-0': {
		subunitCount: HEXPARQUET_SUBUNIT_COUNT,
		// The single-unit form is the preview (all subunits stacked into one quad).
		getPattern: (_rows: number, columns: number) => generateHexparquetPreview(columns),
		getSubunitPatterns: (columns: number) => generateHexparquetSubunits(columns),
		tagAnchor: { facetIndex: 0, quadEdge: { edge: 'ab', position: 'midPoint' } },
		adjustAfterMapping: (
			patternBand: PathSegment[][],
			quadBand: Quadrilateral[],
			tiledPatternConfig: TiledPatternConfig
		) => adjustHexparquetAfterMapping(patternBand, quadBand, tiledPatternConfig),
		adjustAfterTiling: (bands: BandCutPattern[], tiledPatternConfig: TiledPatternConfig) =>
			adjustHexparquetAfterTiling(bands, tiledPatternConfig),
		adjustAfterTilingNeedsEndPartners: false
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
			tiledPatternConfig: TiledPatternConfig,
			_finishOuterEdge?: boolean,
			bandContext?: { hasOuterPartner: boolean; bandIndex: number }
		) => adjustGridPatternAfterMapping(patternBand, quadBand, tiledPatternConfig, bandContext)
	},
	'tiledPanelPattern-0': {
		getPattern: (
			rows: number,
			columns: number,
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			quadBand: Quadrilateral[] | undefined = undefined,
			variant: TiledPatternVariant = 'triangle-0'
		) => {
			// The registry hands any tiled variant; generatePanelPattern already treats
			// everything but 'triangle-1' as 'triangle-0', so narrowing here is identical.
			const panelVariant: PanelVariant = variant === 'triangle-1' ? 'triangle-1' : 'triangle-0';
			return generatePanelPattern({ size: 1, variant: panelVariant });
		},
		tagAnchor: { facetIndex: 0, segmentIndex: 1 },
		adjustAfterMapping: (patternBand: PathSegment[][]) => adjustPanelPatternAfterTiling(patternBand)
	},
	'bandedBranchedPattern-0': {
		getPattern: (rows: number, columns: number, quadBand?: Quadrilateral[]) => {
			if (!quadBand) {
				throw new Error('quadBand Required for bandedBranchPattern-0');
			}
			return generateBranched(quadBand, { rows, columns, variant: 0 });
		},
		tagAnchor: { facetIndex: 0, segmentIndex: 5 },
		adjustAfterTiling: (tiledBands: BandCutPattern[]) => {
			// variant was omitted before; generateCarnation defaults an undefined variant to 0
			return adjustCarnation(tiledBands, 0);
		}
	}
};
