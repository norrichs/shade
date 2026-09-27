import { describe, it, expect } from '@jest/globals';
import { flattenPath } from '../path-contours';

describe('flattenPath', () => {
	it('splits runs and closes on Z', () => {
		const runs = flattenPath([
			['M', 0, 0],
			['L', 1, 0],
			['L', 1, 1],
			['Z'],
			['M', 5, 5],
			['L', 6, 5]
		]);
		expect(runs).toHaveLength(2);
		expect(runs[0][runs[0].length - 1]).toEqual({ x: 0, y: 0 });
		expect(runs[1]).toEqual([
			{ x: 5, y: 5 },
			{ x: 6, y: 5 }
		]);
	});

	it('samples cubics and ends on the endpoint', () => {
		const [run] = flattenPath([
			['M', 0, 0],
			['C', 0, 1, 1, 1, 1, 0]
		]);
		expect(run.length).toBeGreaterThan(2);
		expect(run[run.length - 1]).toEqual({ x: 1, y: 0 });
	});
});
