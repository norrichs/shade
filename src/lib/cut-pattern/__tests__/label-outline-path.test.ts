import { buildLabelOutlinePath } from '../label-outline-path';

describe('buildLabelOutlinePath', () => {
	test('returns a closed path starting with M and ending with Z', () => {
		const path = buildLabelOutlinePath({
			measuredWidth: 100,
			measuredHeight: 30,
			radius: 5,
			padding: 10,
			stemLength: 20,
			stemWidth: 4
		});
		expect(path[0][0]).toBe('M');
		expect(path[path.length - 1][0]).toBe('Z');
	});

	test('stem tip is at (0, 0)', () => {
		const path = buildLabelOutlinePath({
			measuredWidth: 100,
			measuredHeight: 30,
			radius: 5,
			padding: 10,
			stemLength: 20,
			stemWidth: 4
		});
		expect(path[0]).toEqual(['M', 0, 0]);
	});

	test('stem base sides are at internal x = ±stemWidth/2', () => {
		const path = buildLabelOutlinePath({
			measuredWidth: 100,
			measuredHeight: 30,
			radius: 5,
			padding: 10,
			stemLength: 20,
			stemWidth: 6
		});
		expect(path[1]).toEqual(['L', 3, 0]);
	});

	test('body height equals measuredHeight + 2*padding', () => {
		const path = buildLabelOutlinePath({
			measuredWidth: 100,
			measuredHeight: 30,
			radius: 5,
			padding: 10,
			stemLength: 20,
			stemWidth: 4
		});
		// One of the L segments lands at y = stemLength + bodyHeight = 20 + 50 = 70.
		const hasBottomEdge = path.some((s) => {
			if (s[0] === 'L') return Math.abs((s[2] as number) - 70) < 0.001;
			return false;
		});
		expect(hasBottomEdge).toBe(true);
	});
});
