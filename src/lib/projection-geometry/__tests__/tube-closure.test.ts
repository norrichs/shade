import { Vector3 } from 'three';
import type { Section } from '$lib/projection-geometry/types';
import { CLOSURE_RATIO, isSectionClosed, isTubeClosed } from '../tube-closure';

/** A unit square. Closed form repeats the first point; open form does not. */
const square = (closed: boolean): Section => {
	const pts = [
		new Vector3(0, 0, 0),
		new Vector3(1, 0, 0),
		new Vector3(1, 1, 0),
		new Vector3(0, 1, 0)
	];
	return { points: closed ? [...pts, pts[0].clone()] : pts };
};

describe('isSectionClosed', () => {
	it('is true when the last point repeats the first', () => {
		expect(isSectionClosed(square(true))).toBe(true);
	});

	it('is false when the profile leaves an uncovered wedge', () => {
		expect(isSectionClosed(square(false))).toBe(false);
	});

	it('tolerates a gap well inside the relative threshold', () => {
		const s = square(true);
		// mean spacing is 1, so anything below 0.01 closes
		s.points[s.points.length - 1] = new Vector3(0.001, 0, 0);
		expect(isSectionClosed(s)).toBe(true);
	});

	it('rejects a gap just outside the relative threshold', () => {
		const s = square(true);
		s.points[s.points.length - 1] = new Vector3(CLOSURE_RATIO * 2, 0, 0);
		expect(isSectionClosed(s)).toBe(false);
	});

	it('scales with the model: the same shape 1000x larger still closes', () => {
		const s = square(true);
		s.points = s.points.map((p) => p.clone().multiplyScalar(1000));
		expect(isSectionClosed(s)).toBe(true);
	});

	it('scales with the model: a proportional gap fails at any scale', () => {
		const big = square(false);
		big.points = big.points.map((p) => p.clone().multiplyScalar(1000));
		expect(isSectionClosed(big)).toBe(false);
	});

	it('is false for a degenerate section with fewer than three points', () => {
		expect(isSectionClosed({ points: [new Vector3(), new Vector3()] })).toBe(false);
	});

	it('is false when every point is identical (zero mean spacing)', () => {
		expect(isSectionClosed({ points: [new Vector3(), new Vector3(), new Vector3()] })).toBe(false);
	});
});

describe('isTubeClosed', () => {
	it('is true when every section closes', () => {
		expect(isTubeClosed([square(true), square(true), square(true)])).toBe(true);
	});

	it('is false when any section is open — conservative on disagreement', () => {
		expect(isTubeClosed([square(true), square(false), square(true)])).toBe(false);
	});

	it('is false for an empty section list', () => {
		expect(isTubeClosed([])).toBe(false);
	});
});
