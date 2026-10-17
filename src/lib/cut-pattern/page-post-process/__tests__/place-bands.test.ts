import { describe, it, expect } from '@jest/globals';
import { toPageSpace, placeBand, rotateDirection } from '../place-bands';
import type { PathSegment } from '#lib/types.js';

describe('toPageSpace', () => {
	it('matches bandTransform: translate(origin) rotate(rotation, pivot)', () => {
		// rotate (2,0) by 90° about (1,0) → (1,1); then translate by (10,20)
		const p = toPageSpace(
			{ x: 2, y: 0 },
			{ origin: { x: 10, y: 20 }, rotation: 90, pivot: { x: 1, y: 0 } }
		);
		expect(p.x).toBeCloseTo(11, 9);
		expect(p.y).toBeCloseTo(21, 9);
	});
	it('is a plain translate at rotation 0', () => {
		expect(
			toPageSpace({ x: 2, y: 3 }, { origin: { x: 1, y: 1 }, rotation: 0, pivot: { x: 9, y: 9 } })
		).toEqual({ x: 3, y: 4 });
	});
});

describe('placeBand', () => {
	const raw: PathSegment[] = [
		['M', 0, 0],
		['L', 10, 0],
		['L', 10, 50],
		['L', 0, 50],
		['Z'],
		['M', 4, 4],
		['L', 6, 4],
		['L', 6, 6],
		['Z']
	];
	const index = {
		seed: 0,
		contours: [
			{ start: 0, end: 5, kind: 'outline' as const, depth: 0, area: 500 },
			{ start: 5, end: 9, kind: 'hole' as const, depth: 1, area: 2, bandFraction: 0.1 }
		],
		ends: {
			start: { point: { x: 5, y: 0 }, outward: { x: 0, y: -1 } },
			end: { point: { x: 5, y: 50 }, outward: { x: 0, y: 1 } }
		}
	};
	const pages = [
		{ x: 0, y: 0, width: 100, height: 100 },
		{ x: 0, y: 110, width: 100, height: 100 }
	];

	it('moves outlines, surviving holes and ends into page space and finds the page', () => {
		const placed = placeBand({
			bandId: 'b',
			placement: { origin: { x: 20, y: 130 }, rotation: 0, pivot: { x: 0, y: 0 } },
			raw,
			index,
			pieces: [{ geometry: 'pattern-hole', segments: raw.slice(5, 9), contour: 1 }],
			pages
		});
		expect(placed.page).toBe(1);
		expect(placed.outlines[0][0]).toEqual({ x: 20, y: 130 });
		expect(placed.holes).toHaveLength(1);
		expect(placed.ends!.end.point).toEqual({ x: 25, y: 180 });
		expect(placed.ends!.end.outward).toEqual({ x: 0, y: 1 });
	});

	it('drops holes that stage 2 removed', () => {
		const placed = placeBand({
			bandId: 'b',
			placement: { origin: { x: 0, y: 0 }, rotation: 0, pivot: { x: 0, y: 0 } },
			raw,
			index,
			pieces: [],
			pages
		});
		expect(placed.holes).toHaveLength(0);
		expect(placed.outlines).toHaveLength(1);
	});
});

describe('toPageSpace at non-right angles', () => {
	it('rotates about the pivot then translates, at 45°', () => {
		const pl = { origin: { x: 100, y: 50 }, rotation: 45, pivot: { x: 10, y: 0 } };
		const p = toPageSpace({ x: 20, y: 0 }, pl);
		expect(p.x).toBeCloseTo(100 + 10 + 10 * Math.SQRT1_2);
		expect(p.y).toBeCloseTo(50 + 10 * Math.SQRT1_2);
	});
	it('rotateDirection keeps unit length at 15° steps', () => {
		for (let a = 0; a < 360; a += 15) {
			const v = rotateDirection({ x: 1, y: 0 }, a);
			expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
		}
	});
});

describe('placeBand at 45°', () => {
	it('assigns the band to the page containing its rotated outline centre', () => {
		const raw: PathSegment[] = [['M', 0, 0], ['L', 10, 0], ['L', 10, 50], ['L', 0, 50], ['Z']];
		const index = {
			seed: 0,
			contours: [{ start: 0, end: 5, kind: 'outline' as const, depth: 0, area: 500 }],
			ends: undefined
		};
		const pages = [
			{ x: 0, y: 0, width: 100, height: 100 },
			{ x: 0, y: 110, width: 100, height: 100 }
		];
		// pivot = rect centre (5,25); rotated centre stays at origin + pivot = (50,150) -> page 1
		const placed = placeBand({
			bandId: 'b',
			placement: { origin: { x: 45, y: 125 }, rotation: 45, pivot: { x: 5, y: 25 } },
			raw,
			index,
			pieces: [],
			pages
		});
		expect(placed.page).toBe(1);
		const xs = placed.outlines[0].map((p) => p.x);
		// a 45° rotated 10x50 rect is wider than 10 and no longer axis aligned
		expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(30);
	});
});
