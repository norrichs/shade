import {
	convexHull,
	inflateConvex,
	rotateAbout,
	rasterizeConvex,
	dilateRaster,
	coarsenRaster,
	nestAngles
} from '../raster';

const square = (x: number, y: number, s: number) => [
	{ x, y },
	{ x: x + s, y },
	{ x: x + s, y: y + s },
	{ x, y: y + s }
];

describe('convexHull', () => {
	it('drops interior points', () => {
		const h = convexHull([...square(0, 0, 10), { x: 5, y: 5 }]);
		expect(h).toHaveLength(4);
	});
	it('handles collinear and single points', () => {
		expect(convexHull([{ x: 1, y: 1 }])).toHaveLength(1);
		expect(
			convexHull([
				{ x: 0, y: 0 },
				{ x: 1, y: 0 },
				{ x: 2, y: 0 }
			]).length
		).toBeLessThanOrEqual(2);
	});
});

describe('inflateConvex', () => {
	it('grows the bounding box by r on every side', () => {
		const p = inflateConvex(square(0, 0, 10), 2);
		expect(Math.min(...p.map((q) => q.x))).toBeCloseTo(-2);
		expect(Math.max(...p.map((q) => q.y))).toBeCloseTo(12);
	});
});

describe('rotateAbout', () => {
	it('matches the SVG rotate(deg pivot) convention, pivot-relative', () => {
		const [p] = rotateAbout([{ x: 11, y: 0 }], 90, { x: 1, y: 0 });
		expect(p.x).toBeCloseTo(0);
		expect(p.y).toBeCloseTo(10);
	});
});

describe('rasterizeConvex', () => {
	it('an aligned 10×10 square at cell 1 is 10 rows of [0,10)', () => {
		const r = rasterizeConvex([square(0, 0, 10)], 1);
		expect(r.h).toBe(10);
		expect(r.w).toBe(10);
		expect(r.ox).toBe(0);
		expect(r.oy).toBe(0);
		expect(r.rows.every((row) => row.length === 1 && row[0][0] === 0 && row[0][1] === 10)).toBe(
			true
		);
		expect(r.area).toBe(100);
	});
	it('is conservative: an unaligned square covers every cell it touches', () => {
		const r = rasterizeConvex([square(0.5, 0.5, 2)], 1);
		expect(r.h).toBe(3);
		expect(r.area).toBe(9);
	});
	it('negative coordinates give negative offsets', () => {
		const r = rasterizeConvex([square(-5, -5, 10)], 1);
		expect(r.ox).toBe(-5);
		expect(r.oy).toBe(-5);
	});
	it('a 45° square covers a diamond, area between the square area and its box', () => {
		const r = rasterizeConvex([rotateAbout(square(0, 0, 10), 45, { x: 5, y: 5 })], 1);
		expect(r.area).toBeGreaterThanOrEqual(100);
		expect(r.area).toBeLessThan(15 * 15);
	});
	it('merges overlapping polygons in a row', () => {
		const r = rasterizeConvex([square(0, 0, 4), square(3, 0, 4)], 1);
		expect(r.rows[0]).toEqual([[0, 7]]);
	});
});

describe('dilateRaster', () => {
	it('grows by k in every direction and keeps area', () => {
		const r = rasterizeConvex([square(0, 0, 10)], 1);
		const d = dilateRaster(r, 2);
		expect(d.w).toBe(14);
		expect(d.h).toBe(14);
		expect(d.ox).toBe(-2);
		expect(d.oy).toBe(-2);
		expect(d.area).toBe(100);
		// middle row widened by full k
		expect(d.rows[7]).toEqual([[0, 14]]);
		// extreme row widened by floor(sqrt(k²−k²)) = 0
		expect(d.rows[0]).toEqual([[2, 12]]);
	});
});

describe('coarsenRaster', () => {
	it('maps fine cells to coarse cells conservatively', () => {
		const r = rasterizeConvex([square(1, 1, 5)], 1); // cells 1..5
		const c = coarsenRaster(r, 4);
		expect(c.h).toBe(2);
		expect(c.rows[0]).toEqual([[0, 2]]);
	});
});

describe('nestAngles', () => {
	it('15 → 24 angles', () => expect(nestAngles(15)).toHaveLength(24));
	it('0 → [0]', () => expect(nestAngles(0)).toEqual([0]));
	it('25 → multiples of 25 below 360', () => {
		const a = nestAngles(25);
		expect(a[a.length - 1]).toBe(350);
		expect(a).toHaveLength(15);
	});
	it('negative / NaN → [0]', () => {
		expect(nestAngles(-5)).toEqual([0]);
		expect(nestAngles(NaN)).toEqual([0]);
	});
});
