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

	it('lineWrap=true breaks to a new row when x + width > wrapWidth', () => {
		// wrapWidth 300, gap 20. b0 w=100 h=40 @x0; b1 w=150 h=60 (100+20=120, 120+150=270 <=300) @x120;
		// b2 w=200 h=30: x=120+150+20=290>0, 290+200=490>300 -> new row. rowMaxHeight of row0 = max(40,60)=60.
		const bands = [band(100, 40), band(150, 60), band(200, 30)];
		const origins = computeWrappedOrigins(bands, { lineWrap: true, wrapWidth: 300 });
		expect(origins.map((o) => o.x)).toEqual([0, 120, 0]);
		expect(origins.map((o) => o.y)).toEqual([0, 0, 60 + GAP_BETWEEN_BANDS]); // 80
	});

	it('row offset uses the row max height, not the last band height', () => {
		// wrapWidth 250. b0 w=100 h=90; b1 w=100 h=20 (x=120, 120+100=220<=250) @x120;
		// b2 w=100 h=10: x=120+100+20=240>0, 240+100=340>250 -> new row at max(90,20)+20 = 110.
		const bands = [band(100, 90), band(100, 20), band(100, 10)];
		const origins = computeWrappedOrigins(bands, { lineWrap: true, wrapWidth: 250 });
		expect(origins[2].y).toBe(90 + GAP_BETWEEN_BANDS); // 110, from row max 90 not last band 20
	});

	it('a band wider than wrapWidth gets its own row with no empty leading row', () => {
		// wrapWidth 100. b0 w=500 (oversized): x=0 so x>0 guard keeps it on row0 at x=0.
		// b1 w=50: x=500+20=520>0, 520+50>100 -> new row. row0 max height = 80.
		const bands = [band(500, 80), band(50, 40)];
		const origins = computeWrappedOrigins(bands, { lineWrap: true, wrapWidth: 100 });
		expect(origins.map((o) => o.x)).toEqual([0, 0]);
		expect(origins.map((o) => o.y)).toEqual([0, 80 + GAP_BETWEEN_BANDS]); // no empty leading row
	});
});
