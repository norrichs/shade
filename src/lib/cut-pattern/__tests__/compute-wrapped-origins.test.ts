import { computeWrappedOrigins, GAP_BETWEEN_BANDS, type WrapInput } from '../compute-wrapped-origins';

const band = (width: number, height: number, alignedYOffset = 0): WrapInput => ({
	width,
	height,
	alignedYOffset
});

describe('computeWrappedOrigins', () => {
	it('lineWrap=false lays bands in a single row using x += width + gap', () => {
		const bands = [band(100, 50), band(200, 30), band(150, 80)];
		const origins = computeWrappedOrigins(bands, { lineWrap: false });
		expect(origins.map((o) => o.x)).toEqual([0, 120, 340]);
		expect(origins.map((o) => o.y)).toEqual([0, 0, 0]);
	});

	it('applies alignedYOffset within the (single) row', () => {
		const origins = computeWrappedOrigins([band(100, 50, -25), band(100, 50, -25)], {
			lineWrap: false
		});
		expect(origins.map((o) => o.y)).toEqual([-25, -25]);
	});
});
