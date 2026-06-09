import { Vector2 } from 'three';
import { segmentIntermediates2D, insetIntermediates2D, insetPoint2D } from '../inset-2d';

describe('segmentIntermediates2D', () => {
	it('returns `divisions` points evenly spaced from->to (exclusive ends)', () => {
		const from = new Vector2(0, 0);
		const to = new Vector2(3, 0);
		const pts = segmentIntermediates2D(from, to, 2);
		expect(pts).toHaveLength(2);
		expect(pts[0].x).toBeCloseTo(1, 10); // s = 1/3
		expect(pts[1].x).toBeCloseTo(2, 10); // s = 2/3
	});

	it('returns [] for 0 divisions', () => {
		expect(segmentIntermediates2D(new Vector2(0, 0), new Vector2(1, 0), 0)).toHaveLength(0);
	});
});

describe('insetIntermediates2D still matches segmentIntermediates2D(inset, edge)', () => {
	it('produces the same points', () => {
		const edge = new Vector2(4, 0);
		const seed = new Vector2(0, 0);
		const factor = 0.25;
		const viaInset = insetIntermediates2D(edge, seed, factor, 3);
		const inset = insetPoint2D(edge, seed, factor);
		const viaSegment = segmentIntermediates2D(inset, edge, 3);
		viaInset.forEach((p, i) => expect(p.distanceTo(viaSegment[i])).toBeCloseTo(0, 10));
	});
});

describe('insetPoint2D (homothety toward seed)', () => {
	const edge = new Vector2(10, 0);
	const seed = new Vector2(0, 0);

	it('factor 0 leaves the point unchanged', () => {
		expect(insetPoint2D(edge, seed, 0).x).toBeCloseTo(10, 6);
	});

	it('factor 1 moves the point onto the seed', () => {
		const r = insetPoint2D(edge, seed, 1);
		expect(r.x).toBeCloseTo(0, 6);
		expect(r.y).toBeCloseTo(0, 6);
	});

	it('factor 0.5 moves the point halfway to the seed', () => {
		expect(insetPoint2D(edge, seed, 0.5).x).toBeCloseTo(5, 6);
	});

	it('maps a shared corner identically regardless of which edge supplied it', () => {
		const corner = new Vector2(4, 8);
		const fromEdge1 = insetPoint2D(corner.clone(), seed, 0.3);
		const fromEdge2 = insetPoint2D(corner.clone(), seed, 0.3);
		expect(fromEdge1.distanceTo(fromEdge2)).toBeCloseTo(0, 9);
	});
});

describe('insetIntermediates2D', () => {
	const edge = new Vector2(10, 0);
	const seed = new Vector2(0, 0);

	it('returns `divisions` points ordered inset -> edge', () => {
		const inter = insetIntermediates2D(edge, seed, 0.5, 3);
		expect(inter).toHaveLength(3);
		expect(inter[0].x).toBeCloseTo(5 + (10 - 5) * (1 / 4), 6);
		expect(inter[1].x).toBeCloseTo(5 + (10 - 5) * (2 / 4), 6);
		expect(inter[2].x).toBeCloseTo(5 + (10 - 5) * (3 / 4), 6);
		expect(inter[0].x).toBeLessThan(inter[1].x);
		expect(inter[1].x).toBeLessThan(inter[2].x);
	});

	it('returns an empty array for 0 divisions', () => {
		expect(insetIntermediates2D(edge, seed, 0.5, 0)).toEqual([]);
	});
});
