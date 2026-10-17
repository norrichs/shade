import { generateTesselationTile } from '../../shared/generator';
import { adjustTesselation } from '../../shared/adjuster';
import { defaultHexSpec } from '../default-spec';
import { Vector3 } from 'three';
import type { BandCutPattern, PathSegment, Quadrilateral, TiledPatternConfig } from '#lib/types.js';

const unitQuad = (): Quadrilateral => ({
	a: new Vector3(0, 0, 0),
	b: new Vector3(1, 0, 0),
	c: new Vector3(0, 1, 0),
	d: new Vector3(1, 1, 0)
});

/** Minimal BandCutPattern wrappers: one facet per band, addressed by index. */
const wrapBands = (patternBand: PathSegment[][], quadBand: Quadrilateral[]): BandCutPattern[] =>
	patternBand.map((path, i) => ({
		id: `${i}`,
		tagAnchorPoint: { x: 0, y: 0 },
		projectionType: 'patterned',
		address: { globule: 0, tube: 0, band: i },
		facets: [{ path, quad: quadBand[i], label: `${i}` }],
		meta: undefined
	}));

describe('hex generator snapshot', () => {
	const sizes = [1, 100];
	const rowsList = [1, 2, 3];
	const columnsList = [1, 2, 3, 5];

	for (const size of sizes) {
		for (const rows of rowsList) {
			for (const columns of columnsList) {
				it(`generateHexPattern size=${size} rows=${rows} columns=${columns}`, () => {
					const result = generateTesselationTile(defaultHexSpec, {
						size,
						rows,
						columns,
						sideOrientation: 'outside'
					});
					expect(result).toMatchSnapshot();
				});
			}
		}
	}
});

describe('hex adjuster snapshot', () => {
	const makeConfig = (overrides: Partial<TiledPatternConfig['config']>): TiledPatternConfig => ({
		type: 'tiledHexPattern-1',
		tiling: 'quadrilateral',
		config: {
			rowCount: 1,
			columnCount: 1,
			dynamicStroke: 'quadWidth',
			dynamicStrokeEasing: 'linear',
			dynamicStrokeMin: 1,
			dynamicStrokeMax: 3,
			endsMatched: false,
			endsTrimmed: true,
			endLooped: 0,
			scaleConfig: {
				unit: 'px',
				unitPerSvgUnit: 1,
				quantity: 1
			},
			...overrides
		}
	});

	it('adjuster with endsTrimmed=true rows=1 columns=1', () => {
		const rows = 1;
		const columns = 1;
		const config = makeConfig({ rowCount: rows, columnCount: columns });
		const patternBand = [
			generateTesselationTile(defaultHexSpec, {
				size: 1,
				rows,
				columns,
				sideOrientation: 'outside'
			})
		];
		const quadBand = [unitQuad()];
		const wrappedBands = wrapBands(patternBand, quadBand);
		const result = adjustTesselation(wrappedBands, config, [], defaultHexSpec);
		const paths = result.map((b) => b.facets.map((f) => f.path));
		expect(paths).toMatchSnapshot();
	});

	it('adjuster with endsMatched=false endsTrimmed=false rows=1 columns=2', () => {
		const rows = 1;
		const columns = 2;
		const config = makeConfig({ rowCount: rows, columnCount: columns, endsTrimmed: false });
		const quad = unitQuad();
		const patternBand = [
			generateTesselationTile(defaultHexSpec, {
				size: 1,
				rows,
				columns,
				sideOrientation: 'outside'
			}),
			generateTesselationTile(defaultHexSpec, {
				size: 1,
				rows,
				columns,
				sideOrientation: 'outside'
			})
		];
		const quadBand = [quad, quad];
		const wrappedBands = wrapBands(patternBand, quadBand);
		const result = adjustTesselation(wrappedBands, config, [], defaultHexSpec);
		const paths = result.map((b) => b.facets.map((f) => f.path));
		expect(paths).toMatchSnapshot();
	});
});
