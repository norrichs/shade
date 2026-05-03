import { addVertex } from '../vertex-topology';
import type { TiledPatternSpec } from '$lib/patterns/spec-types';

const makeSpec = (): TiledPatternSpec => ({
	id: 'test',
	name: 'Test',
	algorithm: 'shield-tesselation',
	builtIn: false,
	unit: {
		width: 42,
		height: 14,
		start: [
			['M', 0, 0],
			['L', 1, 1]
		],
		middle: [
			['M', 5, 5],
			['L', 6, 6]
		],
		end: [
			['M', 10, 10],
			['L', 11, 11]
		]
	},
	adjustments: {
		withinBand: [{ source: 5, target: 0 }],
		acrossBands: [],
		partner: { startEnd: [], endEnd: [] },
		skipRemove: [4]
	}
});

describe('addVertex', () => {
	it('inserts M+L pair at end of start group at given coordinate', () => {
		const spec = makeSpec();
		const next = addVertex(spec, 'start', 7, 8);
		expect(next.unit.start).toEqual([
			['M', 0, 0],
			['L', 1, 1],
			['M', 7, 8],
			['L', 7, 8]
		]);
		expect(next.unit.middle).toEqual(spec.unit.middle);
		expect(next.unit.end).toEqual(spec.unit.end);
	});

	it('shifts middle and end rule indices by +2 when inserting in start', () => {
		const spec = makeSpec();
		const next = addVertex(spec, 'start', 7, 8);
		// Original index 5 was the second vertex of middle group (start=2, middle index 1 within).
		// After +2 in start, index 5 becomes 7.
		expect(next.adjustments.withinBand).toEqual([{ source: 7, target: 0 }]);
		expect(next.adjustments.skipRemove).toEqual([6]);
	});

	it('shifts only end indices when inserting in middle', () => {
		const spec = makeSpec();
		const next = addVertex(spec, 'middle', 9, 9);
		expect(next.unit.middle).toHaveLength(4);
		// withinBand source=5 was middle[1] which is at flat 5 → unchanged inside middle but pushed because we appended
		// Inserting at end of middle pushes nothing (end gets shifted by +2 because middle.length grew).
		// Original index 5 (middle[1]) stays 5; original index 4 (middle[0]) stays 4.
		// Original skipRemove [4] (middle[0]) stays [4].
		expect(next.adjustments.withinBand).toEqual([{ source: 5, target: 0 }]);
		expect(next.adjustments.skipRemove).toEqual([4]);
	});

	it('shifts nothing when inserting in end', () => {
		const spec = makeSpec();
		const next = addVertex(spec, 'end', 12, 12);
		expect(next.unit.end).toHaveLength(4);
		expect(next.adjustments.withinBand).toEqual([{ source: 5, target: 0 }]);
		expect(next.adjustments.skipRemove).toEqual([4]);
	});
});
