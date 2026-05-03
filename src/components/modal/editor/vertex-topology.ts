import type {
	TiledPatternSpec,
	UnitDefinition,
	IndexPair,
	AdjustmentRules
} from '$lib/patterns/spec-types';
import type { Vertex } from './segment-vertices';
import { flatIndexes } from './vertex-addressing';

export type Group = 'start' | 'middle' | 'end';

export const groupBaseIndex = (unit: UnitDefinition, group: Group): number => {
	if (group === 'start') return 0;
	if (group === 'middle') return unit.start.length;
	return unit.start.length + unit.middle.length;
};

const groupEndIndex = (unit: UnitDefinition, group: Group): number => {
	if (group === 'start') return unit.start.length;
	if (group === 'middle') return unit.start.length + unit.middle.length;
	return unit.start.length + unit.middle.length + unit.end.length;
};

const shiftIndex = (idx: number, threshold: number, delta: number): number =>
	idx >= threshold ? idx + delta : idx;

const shiftPair = (pair: IndexPair, threshold: number, delta: number): IndexPair => ({
	source: shiftIndex(pair.source, threshold, delta),
	target: shiftIndex(pair.target, threshold, delta)
});

export const shiftRulesForInsertion = (
	rules: AdjustmentRules,
	threshold: number,
	delta: number
): AdjustmentRules => ({
	withinBand: rules.withinBand.map((p) => shiftPair(p, threshold, delta)),
	acrossBands: rules.acrossBands.map((p) => shiftPair(p, threshold, delta)),
	partner: {
		startEnd: rules.partner.startEnd.map((p) => shiftPair(p, threshold, delta)),
		endEnd: rules.partner.endEnd.map((p) => shiftPair(p, threshold, delta))
	},
	skipRemove: rules.skipRemove.map((i) => shiftIndex(i, threshold, delta))
});

export const shiftRulesForRemoval = (
	rules: AdjustmentRules,
	removedIndices: Set<number>
): AdjustmentRules => {
	const sortedRemoved = [...removedIndices].sort((a, b) => a - b);
	const shift = (idx: number): number => {
		let count = 0;
		for (const r of sortedRemoved) {
			if (r < idx) count++;
			else break;
		}
		return idx - count;
	};
	const dropPair = (p: IndexPair): boolean =>
		removedIndices.has(p.source) || removedIndices.has(p.target);
	const filterAndShift = (pairs: IndexPair[]): IndexPair[] =>
		pairs
			.filter((p) => !dropPair(p))
			.map((p) => ({ source: shift(p.source), target: shift(p.target) }));

	const result: AdjustmentRules = {
		withinBand: filterAndShift(rules.withinBand),
		acrossBands: filterAndShift(rules.acrossBands),
		partner: {
			startEnd: filterAndShift(rules.partner.startEnd),
			endEnd: filterAndShift(rules.partner.endEnd)
		},
		skipRemove: rules.skipRemove.filter((i) => !removedIndices.has(i)).map(shift)
	};

	if (process.env.NODE_ENV === 'development') {
		const droppedRules = [
			...rules.withinBand.filter(dropPair),
			...rules.acrossBands.filter(dropPair),
			...rules.partner.startEnd.filter(dropPair),
			...rules.partner.endEnd.filter(dropPair)
		];
		const droppedSkip = rules.skipRemove.filter((i) => removedIndices.has(i));
		if (droppedRules.length > 0 || droppedSkip.length > 0) {
			console.warn('[vertex-topology] removed vertex caused orphaned rules to be dropped', {
				droppedRules,
				droppedSkip,
				removedIndices: [...removedIndices]
			});
		}
	}

	return result;
};

export const removeVertex = (spec: TiledPatternSpec, vertex: Vertex): TiledPatternSpec => {
	const removed = new Set(flatIndexes(spec.unit, vertex));
	const removeFromGroup = (group: Group): UnitDefinition[Group] => {
		const base = groupBaseIndex(spec.unit, group);
		return spec.unit[group].filter((_, i) => !removed.has(base + i));
	};
	const unit: UnitDefinition = {
		width: spec.unit.width,
		height: spec.unit.height,
		start: removeFromGroup('start'),
		middle: removeFromGroup('middle'),
		end: removeFromGroup('end')
	};
	const adjustments = shiftRulesForRemoval(spec.adjustments, removed);
	return { ...spec, unit, adjustments };
};

export const addVertex = (
	spec: TiledPatternSpec,
	group: Group,
	x: number,
	y: number
): TiledPatternSpec => {
	const unit: UnitDefinition = {
		width: spec.unit.width,
		height: spec.unit.height,
		start: [...spec.unit.start],
		middle: [...spec.unit.middle],
		end: [...spec.unit.end]
	};
	const shiftThreshold = groupEndIndex(spec.unit, group);
	const newSegments: UnitDefinition['start'] = [
		['M', x, y],
		['L', x, y]
	];
	unit[group] = [...unit[group], ...newSegments];

	const adjustments = shiftRulesForInsertion(spec.adjustments, shiftThreshold, 2);

	return { ...spec, unit, adjustments };
};
