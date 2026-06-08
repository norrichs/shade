import { Vector3 } from 'three';
import { slerp, edgeArcLength, sampleEdgeAsDirections } from '../edge-sampling';

const coordToDirection = (a: number, _b: number): Vector3 =>
	new Vector3(Math.cos(a), Math.sin(a), 0);

describe('slerp', () => {
	it('returns endpoints at t=0 and t=1', () => {
		const a = new Vector3(1, 0, 0);
		const b = new Vector3(0, 1, 0);
		expect(slerp(a, b, 0).distanceTo(a)).toBeCloseTo(0, 6);
		expect(slerp(a, b, 1).distanceTo(b)).toBeCloseTo(0, 6);
	});

	it('returns the midpoint direction at t=0.5', () => {
		const mid = slerp(new Vector3(1, 0, 0), new Vector3(0, 1, 0), 0.5);
		expect(mid.x).toBeCloseTo(Math.SQRT1_2, 5);
		expect(mid.y).toBeCloseTo(Math.SQRT1_2, 5);
	});
});

describe('edgeArcLength', () => {
	it('is the angle between the two endpoint directions', () => {
		expect(edgeArcLength([0, 0], [Math.PI / 2, 0], coordToDirection)).toBeCloseTo(Math.PI / 2, 5);
	});
});

describe('sampleEdgeAsDirections', () => {
	it('returns divisions+1 unit directions including both endpoints', () => {
		const dirs = sampleEdgeAsDirections([0, 0], [Math.PI / 2, 0], 4, coordToDirection);
		expect(dirs).toHaveLength(5);
		dirs.forEach((d) => expect(d.length()).toBeCloseTo(1, 6));
		expect(dirs[0].x).toBeCloseTo(1, 5);
		expect(dirs[4].y).toBeCloseTo(1, 5);
	});
});
