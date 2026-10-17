import {
	flatIndex,
	flatIndexes,
	addRuleForPairing,
	removeRulesForPairing
} from '../vertex-addressing';
import { computeVertices } from '../segment-vertices';
import type { UnitDefinition, IndexPair } from '#lib/patterns/spec-types.js';

const makeUnit = (overrides: Partial<UnitDefinition> = {}): UnitDefinition => ({
	width: 42,
	height: 14,
	start: [],
	middle: [],
	end: [],
	...overrides
});

describe('flatIndex', () => {
	const unit = makeUnit({
		start: [
			['M', 0, 0],
			['L', 1, 1]
		],
		middle: [
			['M', 2, 2],
			['L', 3, 3],
			['M', 4, 4]
		],
		end: [['L', 5, 5]]
	});

	it('returns ref.index for start group', () => {
		expect(flatIndex(unit, { group: 'start', index: 0 })).toBe(0);
		expect(flatIndex(unit, { group: 'start', index: 1 })).toBe(1);
	});

	it('offsets by start.length for middle group', () => {
		expect(flatIndex(unit, { group: 'middle', index: 0 })).toBe(2);
		expect(flatIndex(unit, { group: 'middle', index: 2 })).toBe(4);
	});

	it('offsets by start.length + middle.length for end group', () => {
		expect(flatIndex(unit, { group: 'end', index: 0 })).toBe(5);
	});
});

describe('flatIndexes', () => {
	it('maps each ref to its flat index', () => {
		const unit = makeUnit({
			start: [
				['M', 0, 0],
				['L', 0, 0]
			]
		});
		const vertices = computeVertices(unit);
		expect(flatIndexes(unit, vertices[0])).toEqual([0, 1]);
	});
});

describe('addRuleForPairing', () => {
	it('appends one rule per matched ref pair', () => {
		const unit = makeUnit({
			start: [
				['M', 0, 0],
				['L', 0, 0],
				['M', 5, 5],
				['L', 5, 5]
			]
		});
		const vertices = computeVertices(unit);
		const targetVertex = vertices.find((v) => v.x === 0)!;
		const sourceVertex = vertices.find((v) => v.x === 5)!;

		const rules = addRuleForPairing([], unit, targetVertex, sourceVertex);
		expect(rules).toEqual([
			{ source: 2, target: 0 },
			{ source: 3, target: 1 }
		]);
	});
});

describe('removeRulesForPairing', () => {
	it('removes rules between two vertices', () => {
		const unit = makeUnit({
			start: [
				['M', 0, 0],
				['M', 5, 5]
			]
		});
		const vertices = computeVertices(unit);
		const targetVertex = vertices.find((v) => v.x === 0)!;
		const sourceVertex = vertices.find((v) => v.x === 5)!;

		const rules: IndexPair[] = [
			{ source: 1, target: 0 },
			{ source: 0, target: 1 }
		];
		const remaining = removeRulesForPairing(rules, unit, targetVertex, sourceVertex);
		expect(remaining).toEqual([{ source: 0, target: 1 }]);
	});
});
