import type { IndexPair, UnitDefinition } from '#lib/patterns/spec-types.js';
import type { Vertex, VertexRef } from './segment-vertices';

export const flatIndex = (unit: UnitDefinition, ref: VertexRef): number => {
	if (ref.group === 'start') return ref.index;
	if (ref.group === 'middle') return unit.start.length + ref.index;
	return unit.start.length + unit.middle.length + ref.index;
};

export const flatIndexes = (unit: UnitDefinition, vertex: Vertex): number[] =>
	vertex.refs.map((ref) => flatIndex(unit, ref));

export const addRuleForPairing = (
	rules: IndexPair[],
	unit: UnitDefinition,
	targetVertex: Vertex,
	sourceVertex: Vertex
): IndexPair[] => {
	const targetIdxs = flatIndexes(unit, targetVertex);
	const sourceIdxs = flatIndexes(unit, sourceVertex);
	const n = Math.min(targetIdxs.length, sourceIdxs.length);
	const newRules: IndexPair[] = [];
	for (let i = 0; i < n; i++) {
		newRules.push({ source: sourceIdxs[i], target: targetIdxs[i] });
	}
	return [...rules, ...newRules];
};

export const removeRulesForPairing = (
	rules: IndexPair[],
	unit: UnitDefinition,
	targetVertex: Vertex,
	sourceVertex: Vertex
): IndexPair[] => {
	const targetIdxs = new Set(flatIndexes(unit, targetVertex));
	const sourceIdxs = new Set(flatIndexes(unit, sourceVertex));
	return rules.filter((r) => !(targetIdxs.has(r.target) && sourceIdxs.has(r.source)));
};
