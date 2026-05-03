import type { IndexPair, UnitDefinition } from '$lib/patterns/spec-types';
import type { Vertex, VertexRef } from './segment-vertices';

export const flatIndex = (unit: UnitDefinition, ref: VertexRef): number => {
	if (ref.group === 'start') return ref.index;
	if (ref.group === 'middle') return unit.start.length + ref.index;
	return unit.start.length + unit.middle.length + ref.index;
};

export const flatIndexes = (unit: UnitDefinition, vertex: Vertex): number[] =>
	vertex.refs.map((ref) => flatIndex(unit, ref));

export const findVertexByFlatIndex = (
	unit: UnitDefinition,
	vertices: Vertex[],
	index: number
): Vertex | undefined => vertices.find((v) => flatIndexes(unit, v).includes(index));

export type Connection = {
	sourceVertex: Vertex;
	targetVertex: Vertex;
	rules: IndexPair[];
};

export const computeConnections = (
	rules: IndexPair[],
	unit: UnitDefinition,
	vertices: Vertex[]
): Connection[] => {
	const byKey = new Map<string, Connection>();
	for (const rule of rules) {
		const sourceVertex = findVertexByFlatIndex(unit, vertices, rule.source);
		const targetVertex = findVertexByFlatIndex(unit, vertices, rule.target);
		if (!sourceVertex || !targetVertex) continue;
		const key = `${sourceVertex.x}::${sourceVertex.y}->${targetVertex.x}::${targetVertex.y}`;
		const existing = byKey.get(key);
		if (existing) {
			existing.rules.push(rule);
		} else {
			byKey.set(key, { sourceVertex, targetVertex, rules: [rule] });
		}
	}
	return Array.from(byKey.values());
};

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
