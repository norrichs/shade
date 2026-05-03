import { generateHexTile } from '../generator';
import { adjustHexTesselation } from '../adjuster';
import { defaultHexSpec } from '../default-spec';
import type { TiledPatternConfig } from '$lib/types';

describe('hex generator snapshot', () => {
	const sizes = [1, 100];
	const rowsList = [1, 2, 3];
	const columnsList = [1, 2, 3, 5];

	for (const size of sizes) {
		for (const rows of rowsList) {
			for (const columns of columnsList) {
				it(`generateHexPattern size=${size} rows=${rows} columns=${columns}`, () => {
					const result = generateHexTile(defaultHexSpec, {
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
			generateHexTile(defaultHexSpec, { size: 1, rows, columns, sideOrientation: 'outside' })
		];
		const quadBand = [
			{
				a: { x: 0, y: 0, z: 0 } as any,
				b: { x: 1, y: 0, z: 0 } as any,
				c: { x: 0, y: 1, z: 0 } as any,
				d: { x: 1, y: 1, z: 0 } as any
			}
		];
		// Each old patternBand[i] becomes a BandCutPattern with a single facet wrapping that path + quad
		const wrappedBands = patternBand.map((path, i) => ({
			address: { tube: 0, band: i },
			facets: [{ path, quad: quadBand[i], label: `${i}` }],
			meta: undefined
		})) as any;
		const result = adjustHexTesselation(wrappedBands, config, []);
		// Unwrap for snapshot — flatten the path arrays back out
		const paths = result.map((b: any) => b.facets.map((f: any) => f.path));
		expect(paths).toMatchSnapshot();
	});

	it('adjuster with endsMatched=false endsTrimmed=false rows=1 columns=2', () => {
		const rows = 1;
		const columns = 2;
		const config = makeConfig({ rowCount: rows, columnCount: columns, endsTrimmed: false });
		const quad = {
			a: { x: 0, y: 0, z: 0 } as any,
			b: { x: 1, y: 0, z: 0 } as any,
			c: { x: 0, y: 1, z: 0 } as any,
			d: { x: 1, y: 1, z: 0 } as any
		};
		const patternBand = [
			generateHexTile(defaultHexSpec, { size: 1, rows, columns, sideOrientation: 'outside' }),
			generateHexTile(defaultHexSpec, { size: 1, rows, columns, sideOrientation: 'outside' })
		];
		const quadBand = [quad, quad];
		// Each old patternBand[i] becomes a BandCutPattern with a single facet wrapping that path + quad
		const wrappedBands = patternBand.map((path, i) => ({
			address: { tube: 0, band: i },
			facets: [{ path, quad: quadBand[i], label: `${i}` }],
			meta: undefined
		})) as any;
		const result = adjustHexTesselation(wrappedBands, config, []);
		// Unwrap for snapshot — flatten the path arrays back out
		const paths = result.map((b: any) => b.facets.map((f: any) => f.path));
		expect(paths).toMatchSnapshot();
	});
});
