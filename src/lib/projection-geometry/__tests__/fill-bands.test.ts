import { describe, it, expect } from '@jest/globals';
import { Triangle, Vector3 } from 'three';
import type { Section } from '../types';
import {
	isDegenerateTriangle,
	outerBorderPolyline,
	FILL_DEGENERATE_EPSILON
} from '../fill-bands';

describe('isDegenerateTriangle', () => {
	it('is false for a normal triangle', () => {
		const t = new Triangle(new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0));
		expect(isDegenerateTriangle(t)).toBe(false);
	});

	it('is true when two vertices coincide', () => {
		const c = new Vector3(2, 2, 2);
		const t = new Triangle(new Vector3(1, 0, 0), c.clone(), c.clone());
		expect(isDegenerateTriangle(t)).toBe(true);
	});

	it('respects the epsilon', () => {
		const t = new Triangle(
			new Vector3(0, 0, 0),
			new Vector3(FILL_DEGENERATE_EPSILON / 2, 0, 0),
			new Vector3(0, 1, 0)
		);
		expect(isDegenerateTriangle(t)).toBe(true);
	});
});

describe('outerBorderPolyline', () => {
	// 3 sections, each a 3-point column [first, mid, last].
	const sections: Section[] = [
		{ points: [new Vector3(0, 0, 0), new Vector3(0.5, 0, 0), new Vector3(1, 0, 0)] },
		{ points: [new Vector3(0, 1, 0), new Vector3(0.5, 1, 0), new Vector3(1, 1, 0)] },
		{ points: [new Vector3(0, 2, 0), new Vector3(0.5, 2, 0), new Vector3(1, 2, 0)] }
	];

	it('reads the first-band outer border (points[0] of each section)', () => {
		const edge = outerBorderPolyline(sections, 'first');
		expect(edge.map((v) => v.toArray())).toEqual([
			[0, 0, 0],
			[0, 1, 0],
			[0, 2, 0]
		]);
	});

	it('reads the last-band outer border (points[last] of each section)', () => {
		const edge = outerBorderPolyline(sections, 'last');
		expect(edge.map((v) => v.toArray())).toEqual([
			[1, 0, 0],
			[1, 1, 0],
			[1, 2, 0]
		]);
	});

	it('returns clones, not aliases', () => {
		const edge = outerBorderPolyline(sections, 'first');
		expect(edge[0]).not.toBe(sections[0].points[0]);
	});
});
