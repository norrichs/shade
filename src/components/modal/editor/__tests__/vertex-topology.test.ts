import { addVertex, removeVertex, shiftRulesForRemoval } from '../vertex-topology';
import type { TiledPatternSpec } from '$lib/patterns/spec-types';
import { computeVertices } from '../segment-vertices';
import { defaultShieldSpec } from '$lib/patterns/tesselation/shield';

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

	it('shifts end indices by +2 when inserting in middle', () => {
		const spec = makeSpec();
		const next = addVertex(spec, 'middle', 9, 9);
		expect(next.unit.middle).toHaveLength(4);
		// Threshold = start.length + middle.length = 4. Indices >= 4 shift by +2.
		// Original withinBand source=5 (end[1]) -> 7; skipRemove [4] (end[0]) -> [6].
		expect(next.adjustments.withinBand).toEqual([{ source: 7, target: 0 }]);
		expect(next.adjustments.skipRemove).toEqual([6]);
	});

	it('shifts nothing when inserting in end', () => {
		const spec = makeSpec();
		const next = addVertex(spec, 'end', 12, 12);
		expect(next.unit.end).toHaveLength(4);
		expect(next.adjustments.withinBand).toEqual([{ source: 5, target: 0 }]);
		expect(next.adjustments.skipRemove).toEqual([4]);
	});
});

describe('shiftRulesForRemoval', () => {
	it('removes pairs that touch any removed index and shifts the rest down', () => {
		const removed = new Set([2, 3]);
		const result = shiftRulesForRemoval(
			{
				withinBand: [
					{ source: 0, target: 1 }, // keep, no shift
					{ source: 4, target: 0 }, // keep, source shifts to 2
					{ source: 2, target: 0 }, // drop (touches removed)
					{ source: 0, target: 3 }  // drop
				],
				acrossBands: [],
				partner: { startEnd: [], endEnd: [] },
				skipRemove: [0, 2, 5]
			},
			removed
		);
		expect(result.withinBand).toEqual([
			{ source: 0, target: 1 },
			{ source: 2, target: 0 }
		]);
		expect(result.skipRemove).toEqual([0, 3]);
	});
});

describe('removeVertex', () => {
	it('removes the M+L pair at coincident M+L vertex', () => {
		const spec: TiledPatternSpec = {
			id: 't',
			name: 'T',
			algorithm: 'shield-tesselation',
			builtIn: false,
			unit: {
				width: 42,
				height: 14,
				start: [
					['M', 0, 0],
					['L', 5, 5],
					['M', 5, 5],
					['L', 10, 10]
				],
				middle: [],
				end: []
			},
			adjustments: {
				withinBand: [],
				acrossBands: [],
				partner: { startEnd: [], endEnd: [] },
				skipRemove: []
			}
		};
		const vertex = computeVertices(spec.unit).find((v) => v.x === 5)!;
		const next = removeVertex(spec, vertex);
		expect(next.unit.start).toEqual([
			['M', 0, 0],
			['L', 10, 10]
		]);
	});

	it('drops rules referencing a removed index and shifts the rest', () => {
		const spec: TiledPatternSpec = {
			id: 't',
			name: 'T',
			algorithm: 'shield-tesselation',
			builtIn: false,
			unit: {
				width: 42,
				height: 14,
				start: [
					['M', 0, 0],
					['L', 5, 5],
					['M', 5, 5],
					['L', 10, 10]
				],
				middle: [],
				end: []
			},
			adjustments: {
				withinBand: [
					{ source: 3, target: 0 }, // index 3 = vertex (10,10), keep, source shifts to 1
					{ source: 1, target: 0 }  // index 1 = removed, drop
				],
				acrossBands: [],
				partner: { startEnd: [], endEnd: [] },
				skipRemove: [3, 2] // 3 = (10,10) keep→1; 2 = removed, drop
			}
		};
		const vertex = computeVertices(spec.unit).find((v) => v.x === 5)!;
		const next = removeVertex(spec, vertex);
		expect(next.adjustments.withinBand).toEqual([{ source: 1, target: 0 }]);
		expect(next.adjustments.skipRemove).toEqual([1]);
	});
});

describe('topology round-trip', () => {
	it('add then remove of same vertex restores the spec exactly', () => {
		const before = defaultShieldSpec;
		const added = addVertex(before, 'middle', 99, 99);
		const newVertex = computeVertices(added.unit).find((v) => v.x === 99 && v.y === 99)!;
		const restored = removeVertex(added, newVertex);
		expect(restored.unit).toEqual(before.unit);
		expect(restored.adjustments).toEqual(before.adjustments);
	});
});
