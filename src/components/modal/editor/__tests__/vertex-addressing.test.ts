import {
	flatIndex,
	flatIndexes,
	findVertexByFlatIndex,
	computeConnections,
	addRuleForPairing,
	removeRulesForPairing
} from '../vertex-addressing';
import { computeVertices } from '../segment-vertices';
import type { UnitDefinition, IndexPair } from '$lib/patterns/spec-types';

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
		start: [['M', 0, 0], ['L', 1, 1]],
		middle: [['M', 2, 2], ['L', 3, 3], ['M', 4, 4]],
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
			start: [['M', 0, 0], ['L', 0, 0]]
		});
		const vertices = computeVertices(unit);
		expect(flatIndexes(unit, vertices[0])).toEqual([0, 1]);
	});
});

describe('findVertexByFlatIndex', () => {
	const unit = makeUnit({
		start: [['M', 0, 0], ['L', 1, 1], ['M', 1, 1]]
	});
	const vertices = computeVertices(unit);

	it('finds vertex containing the flat index', () => {
		const v0 = findVertexByFlatIndex(unit, vertices, 0);
		expect(v0?.x).toBe(0);

		const v1 = findVertexByFlatIndex(unit, vertices, 1);
		expect(v1?.x).toBe(1);

		const v2 = findVertexByFlatIndex(unit, vertices, 2);
		expect(v2?.x).toBe(1);
	});

	it('returns undefined for out-of-range index', () => {
		expect(findVertexByFlatIndex(unit, vertices, 99)).toBeUndefined();
	});
});

describe('computeConnections', () => {
	it('groups rules by (sourceVertex, targetVertex)', () => {
		const unit = makeUnit({
			start: [['M', 0, 0], ['L', 0, 0], ['M', 5, 5], ['L', 5, 5]]
		});
		const vertices = computeVertices(unit);
		const rules: IndexPair[] = [
			{ source: 2, target: 0 },
			{ source: 3, target: 1 }
		];
		const connections = computeConnections(rules, unit, vertices);
		expect(connections).toHaveLength(1);
		expect(connections[0].sourceVertex.x).toBe(5);
		expect(connections[0].targetVertex.x).toBe(0);
		expect(connections[0].rules).toEqual(rules);
	});
});

describe('addRuleForPairing', () => {
	it('appends one rule per matched ref pair', () => {
		const unit = makeUnit({
			start: [['M', 0, 0], ['L', 0, 0], ['M', 5, 5], ['L', 5, 5]]
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
			start: [['M', 0, 0], ['M', 5, 5]]
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
