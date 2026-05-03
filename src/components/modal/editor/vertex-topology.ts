import type {
	TiledPatternSpec,
	UnitDefinition,
	IndexPair,
	AdjustmentRules
} from '$lib/patterns/spec-types';

export type Group = 'start' | 'middle' | 'end';

const groupBaseIndex = (unit: UnitDefinition, group: Group): number => {
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
	// When appending to 'start', middle and end indices shift up by 2.
	// When appending to 'middle' or 'end', no existing rule indices are displaced
	// (the appended segments take new positions beyond the current end of those groups).
	const shiftThreshold =
		group === 'start'
			? groupEndIndex(spec.unit, 'start')
			: groupEndIndex(spec.unit, 'end') + 2; // beyond any existing index → nothing shifts
	const newSegments: UnitDefinition['start'] = [
		['M', x, y],
		['L', x, y]
	];
	unit[group] = [...unit[group], ...newSegments];

	const adjustments = shiftRulesForInsertion(spec.adjustments, shiftThreshold, 2);

	return { ...spec, unit, adjustments };
};

// Re-export groupBaseIndex for use by removeVertex (Task B2)
export { groupBaseIndex };
