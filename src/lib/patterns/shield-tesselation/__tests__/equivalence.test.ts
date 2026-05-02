import { generateShieldTesselationTile as oldGenerate } from '../../tiled-shield-tesselation-pattern';
import { adjustShieldTesselationAfterTiling as oldAdjust } from '../../tiled-shield-tesselation-pattern';
import { generateShieldTesselationTile as newGenerate } from '../generator';
import { adjustShieldTesselation as newAdjust } from '../adjuster';
import { defaultShieldSpec } from '../default-spec';
import type { Band } from '$lib/types';
import type {
	BandCutPattern,
	TiledPatternConfig,
	TubeCutPattern,
	SkipEdges
} from '$lib/types';

describe('shield-tesselation generator equivalence', () => {
	const sideOrientations: Band['sideOrientation'][] = ['inside', 'outside'];
	const sizes = [1, 100];
	const columnsList = [1, 2, 3, 5];
	const rowsList = [1];

	for (const size of sizes) {
		for (const columns of columnsList) {
			for (const rows of rowsList) {
				for (const sideOrientation of sideOrientations) {
					it(`matches old output for size=${size} rows=${rows} columns=${columns} side=${sideOrientation}`, () => {
						const props = {
							size,
							rows,
							columns,
							variant: 'rect' as const,
							sideOrientation
						};
						const oldResult = oldGenerate(props);
						const newResult = newGenerate(defaultShieldSpec, props);
						expect(newResult).toEqual(oldResult);
					});
				}
			}
		}
	}
});

const makeFacet = (offsetX: number, segmentCount: number) => {
	const path = [];
	for (let i = 0; i < segmentCount; i++) {
		path.push(['L', offsetX + i, 0] as ['L', number, number]);
	}
	const quad = {
		a: { x: offsetX, y: 0 },
		b: { x: offsetX + 10, y: 0 },
		c: { x: offsetX + 10, y: 10 },
		d: { x: offsetX, y: 10 }
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return { path, quad, label: '0' } as any;
};

const makeBand = (facetCount: number, segmentsPerFacet: number, bandIndex = 0): BandCutPattern => {
	const facets = [];
	for (let f = 0; f < facetCount; f++) {
		facets.push(makeFacet(f * 10, segmentsPerFacet));
	}
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return {
		facets,
		sideOrientation: 'inside',
		svgPath: undefined,
		id: `b-${bandIndex}`,
		tagAnchorPoint: { x: 0, y: 0 },
		tagAngle: 0,
		projectionType: 'patterned',
		address: { globule: 0, tube: 0, band: bandIndex },
		bounds: undefined as any,
		meta: undefined
	} as any;
};

const makeConfig = (overrides: Partial<TiledPatternConfig['config']> = {}): TiledPatternConfig =>
	({
		type: 'tiledShieldTesselationPattern',
		tiling: 'quadrilateral',
		config: {
			rowCount: 1,
			columnCount: 1,
			dynamicStroke: 'quadWidth',
			dynamicStrokeEasing: 'linear',
			dynamicStrokeMin: 1,
			dynamicStrokeMax: 1,
			endsMatched: false,
			endsTrimmed: false,
			endLooped: 0,
			variant: 'rect',
			skipEdges: 'none',
			scaleConfig: {} as any,
			...overrides
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any as TiledPatternConfig;

describe('shield-tesselation adjuster equivalence', () => {
	const cases: { name: string; overrides: Partial<TiledPatternConfig['config']> }[] = [
		{ name: 'baseline (no special flags)', overrides: {} },
		{ name: 'endLooped=1', overrides: { endLooped: 1 } },
		{ name: 'skipEdges=all', overrides: { skipEdges: 'all' as SkipEdges } },
		{ name: 'skipEdges=not-both', overrides: { skipEdges: 'not-both' as SkipEdges } }
	];

	for (const { name, overrides } of cases) {
		it(`matches old adjuster for ${name}`, () => {
			const bands = [makeBand(3, 80), makeBand(3, 80, 1)];
			const tubes: TubeCutPattern[] = [];
			const config = makeConfig(overrides);

			const oldResult = oldAdjust(structuredClone(bands), config, tubes);
			const newResult = newAdjust(structuredClone(bands), config, tubes, defaultShieldSpec);

			expect(newResult).toEqual(oldResult);
		});
	}
});
