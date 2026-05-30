import { Vector3 } from 'three';
import { isDegenerateEdge, FAN_DEGENERATE_EPSILON } from '../fill-fan';

describe('isDegenerateEdge', () => {
	test('returns true for coincident points', () => {
		const p = new Vector3(1, 2, 3);
		expect(isDegenerateEdge(p, p.clone())).toBe(true);
	});
	test('returns true for points within epsilon', () => {
		const a = new Vector3(0, 0, 0);
		const b = new Vector3(FAN_DEGENERATE_EPSILON / 10, 0, 0);
		expect(isDegenerateEdge(a, b)).toBe(true);
	});
	test('returns false for clearly distinct points', () => {
		expect(isDegenerateEdge(new Vector3(0, 0, 0), new Vector3(1, 0, 0))).toBe(false);
	});
});
