import { describe, it, expect } from '@jest/globals';
import { computeDisconnects } from '../disconnect';
import type { PlacedBand } from '../../post-process-types';

const rectPoly = (x0: number, y0: number, x1: number, y1: number) => [
	{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }
];
const vband = (id: string, x0: number, y0: number, x1: number, y1: number, page = 0): PlacedBand => ({
	bandId: id,
	page,
	outlines: [rectPoly(x0, y0, x1, y1)],
	holes: [],
	ends: {
		start: { point: { x: (x0 + x1) / 2, y: y0 }, outward: { x: 0, y: -1 } },
		end: { point: { x: (x0 + x1) / 2, y: y1 }, outward: { x: 0, y: 1 } }
	}
});
const page = { x: 0, y: 0, width: 100, height: 100 };

describe('computeDisconnects', () => {
	it('reaches the page edge from a lone band', () => {
		const d = computeDisconnects([vband('a', 45, 10, 55, 80)], [page], 2);
		expect(d).toHaveLength(2);
		const top = d.find((s) => s.a.y === 10)!;
		expect(top.b.x).toBeCloseTo(50, 6);
		expect(top.b.y).toBeCloseTo(0, 6);
		expect(top.toBand).toBeNull();
		expect(d.find((s) => s.a.y === 80)!.b.y).toBeCloseTo(100, 6);
	});

	it('reaches a facing neighbour once, not twice', () => {
		const d = computeDisconnects([vband('a', 45, 10, 55, 40), vband('b', 45, 45, 55, 90)], [page], 2);
		const between = d.filter((s) => s.toBand !== null);
		expect(between).toHaveLength(1);
		expect(Math.hypot(between[0].b.x - between[0].a.x, between[0].b.y - between[0].a.y)).toBeCloseTo(5, 6);
		expect(d).toHaveLength(3);
	});

	it('snaps to an off-axis neighbour inside the cone', () => {
		// a's end at (50,50) points down; the edge is 50 away, c is ~20 away at ~20°
		const a = vband('a', 45, 10, 55, 50);
		const c: PlacedBand = { bandId: 'c', page: 0, outlines: [rectPoly(54, 67, 80, 75)], holes: [] };
		const d = computeDisconnects([a, c], [page], 2).find((s) => s.a.y === 50)!;
		expect(d.toBand).toBe('c');
		expect(Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y)).toBeLessThan(25);
	});

	it('skips an end buried inside another band', () => {
		const a = vband('a', 45, 10, 55, 50);
		const cover: PlacedBand = { bandId: 'cover', page: 0, outlines: [rectPoly(40, 45, 60, 60)], holes: [] };
		const d = computeDisconnects([a, cover], [page], 2);
		expect(d.find((s) => s.fromBand === 'a' && s.a.y === 50)).toBeUndefined();
	});

	it('ignores off-page ends, end-less bands and unknown pages, with no NaN', () => {
		const off = vband('off', 45, -20, 55, -5);
		const noEnds: PlacedBand = { bandId: 'n', page: 0, outlines: [rectPoly(10, 10, 20, 20)], holes: [] };
		const other = vband('o', 45, 10, 55, 80, 1);
		const d = computeDisconnects([off, noEnds, other], [page], 2);
		expect(d.filter((s) => s.fromBand === 'off')).toHaveLength(0);
		expect(d.filter((s) => s.fromBand === 'o')).toHaveLength(0);
		expect(d.every((s) => [s.a.x, s.a.y, s.b.x, s.b.y].every(Number.isFinite))).toBe(true);
	});
});
