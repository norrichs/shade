import type { Band, GridVariant, Quadrilateral } from '$lib/types';
import type { PatternGenerator } from '$lib/types';
import type { TiledPatternSpec } from './spec-types';
import {
	adjustShieldTesselation,
	defaultShieldSpec,
	generateShieldTesselationTile
} from './tesselation/shield';
import { adjustHexTesselation, defaultHexSpec, generateHexTile } from './tesselation/hex';
import { defaultBoxSpec, generateBoxTile } from './tesselation/box';

export type PatternAlgorithm = {
	algorithmId: string;
	displayName: string;
	defaultSpec: TiledPatternSpec;
	supportsEditing: boolean;
	createPatternsEntry: (spec: TiledPatternSpec) => PatternGenerator;
};

const shieldAlgorithm: PatternAlgorithm = {
	algorithmId: 'shield-tesselation',
	displayName: 'Shield',
	defaultSpec: defaultShieldSpec,
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
			generateShieldTesselationTile(spec, {
				size: 1,
				rows,
				columns,
				variant,
				sideOrientation
			}),
		tagAnchor: { facetIndex: 0, segmentIndex: 3 },
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		adjustAfterTiling: (bands: any, tiledPatternConfig: any, tubes: any) =>
			adjustShieldTesselation(bands, tiledPatternConfig, tubes, spec)
	})
};

const hexAlgorithm: PatternAlgorithm = {
	algorithmId: 'hex',
	displayName: 'Hex',
	defaultSpec: defaultHexSpec,
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
			generateHexTile(spec, {
				size: 1,
				rows,
				columns,
				variant,
				sideOrientation
			}),
		tagAnchor: { facetIndex: 0, segmentIndex: 0 },
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		adjustAfterTiling: (bands: any, tiledPatternConfig: any, tubes: any) =>
			adjustHexTesselation(bands, tiledPatternConfig, tubes)
	})
};

const boxAlgorithm: PatternAlgorithm = {
	algorithmId: 'box',
	displayName: 'Box',
	defaultSpec: defaultBoxSpec,
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
			generateBoxTile(spec, {
				size: 1,
				rows,
				columns,
				variant,
				sideOrientation
			}),
		tagAnchor: { facetIndex: 0, segmentIndex: 5, angle: 0 }
	})
};

export const algorithms: PatternAlgorithm[] = [shieldAlgorithm, hexAlgorithm, boxAlgorithm];

export const findAlgorithm = (algorithmId: string): PatternAlgorithm | undefined =>
	algorithms.find((a) => a.algorithmId === algorithmId);
