import { describe, it, expect } from '@jest/globals';
import { raySegment, segmentsIntersect, rotate, segmentsOf } from '../segments';

describe('segments', () => {
	it('intersects a ray with a segment', () => {
		const t = raySegment({ x: 0, y: 0 }, { x: 0, y: 1 }, { a: { x: -1, y: 5 }, b: { x: 1, y: 5 } });
		expect(t).toBeCloseTo(5, 9);
	});
	it('misses a segment behind, beside, or parallel to the ray', () => {
		expect(raySegment({ x: 0, y: 0 }, { x: 0, y: 1 }, { a: { x: -1, y: -5 }, b: { x: 1, y: -5 } })).toBeNull();
		expect(raySegment({ x: 0, y: 0 }, { x: 0, y: 1 }, { a: { x: 2, y: 5 }, b: { x: 3, y: 5 } })).toBeNull();
		expect(raySegment({ x: 0, y: 0 }, { x: 0, y: 1 }, { a: { x: 1, y: 0 }, b: { x: 1, y: 5 } })).toBeNull();
	});
	it('detects crossing segments', () => {
		expect(segmentsIntersect({ a: { x: 0, y: 0 }, b: { x: 2, y: 2 } }, { a: { x: 0, y: 2 }, b: { x: 2, y: 0 } })).toBe(true);
		expect(segmentsIntersect({ a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }, { a: { x: 0, y: 1 }, b: { x: 1, y: 1 } })).toBe(false);
	});
	it('rotates counter-clockwise in math orientation', () => {
		const r = rotate({ x: 1, y: 0 }, 90);
		expect(r.x).toBeCloseTo(0, 9);
		expect(r.y).toBeCloseTo(1, 9);
	});
	it('turns polylines into segments', () => {
		expect(segmentsOf([[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]])).toHaveLength(2);
	});
});
