import { generateHexPattern, adjustHexPatternAfterTiling } from '../../../tiled-hex-pattern';
import type { TiledPatternConfig } from '$lib/types';

describe('hex generator snapshot', () => {
	const sizes = [1, 100];
	const rowsList = [1, 2, 3];
	const columnsList = [1, 2, 3, 5];

	for (const size of sizes) {
		for (const rows of rowsList) {
			for (const columns of columnsList) {
				it(`generateHexPattern size=${size} rows=${rows} columns=${columns}`, () => {
					const result = generateHexPattern(rows, columns, { size });
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
		const patternBand = [generateHexPattern(rows, columns, { size: 1 })];
		const quadBand = [
			{
				a: { x: 0, y: 0, z: 0 } as any,
				b: { x: 1, y: 0, z: 0 } as any,
				c: { x: 0, y: 1, z: 0 } as any,
				d: { x: 1, y: 1, z: 0 } as any
			}
		];
		const result = adjustHexPatternAfterTiling(patternBand, quadBand, config);
		expect(result).toMatchSnapshot();
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
			generateHexPattern(rows, columns, { size: 1 }),
			generateHexPattern(rows, columns, { size: 1 })
		];
		const quadBand = [quad, quad];
		const result = adjustHexPatternAfterTiling(patternBand, quadBand, config);
		expect(result).toMatchSnapshot();
	});
});
