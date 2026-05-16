import type { Band, GridVariant, Quadrilateral } from '$lib/types';
import type { PatternGenerator } from '$lib/types';
import type { TiledPatternSpec } from './spec-types';
import { defaultShieldSpec } from './tesselation/shield';
import { defaultHexSpec } from './tesselation/hex';
import { defaultBoxSpec } from './tesselation/box';
import { generateTesselationTile } from './tesselation/shared/generator';
import { adjustTesselation } from './tesselation/shared/adjuster';

export type PatternAlgorithm = {
	algorithmId: string;
	displayName: string;
	defaultSpec: TiledPatternSpec;
	supportsEditing: boolean;
	createPatternsEntry: (spec: TiledPatternSpec) => PatternGenerator;
};

type TagAnchor = { facetIndex: number; segmentIndex: number; angle?: number };

const makeAlgorithm = (
	algorithmId: string,
	displayName: string,
	defaultSpec: TiledPatternSpec,
	tagAnchor: TagAnchor
): PatternAlgorithm => ({
	algorithmId,
	displayName,
	defaultSpec,
	supportsEditing: true,
	createPatternsEntry: (spec) => ({
		getPattern: (
			rows: number,
			columns: number,
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			_quadBand: Quadrilateral[] | undefined = undefined,
			variant: GridVariant | undefined = 'rect',
			sideOrientation: Band['sideOrientation']
		) =>
			generateTesselationTile(spec, {
				size: 1,
				rows,
				columns,
				variant,
				sideOrientation
			}),
		tagAnchor,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		adjustAfterTiling: (bands: any, tiledPatternConfig: any, tubes: any) =>
			adjustTesselation(bands, tiledPatternConfig, tubes, spec)
	})
});

export const algorithms: PatternAlgorithm[] = [
	makeAlgorithm('shield-tesselation', 'Shield', defaultShieldSpec, {
		facetIndex: 0,
		segmentIndex: 3
	}),
	makeAlgorithm('hex', 'Hex', defaultHexSpec, { facetIndex: 0, segmentIndex: 0 }),
	makeAlgorithm('box', 'Box', defaultBoxSpec, { facetIndex: 0, segmentIndex: 5, angle: 0 })
];

export const findAlgorithm = (algorithmId: string): PatternAlgorithm | undefined =>
	algorithms.find((a) => a.algorithmId === algorithmId);
