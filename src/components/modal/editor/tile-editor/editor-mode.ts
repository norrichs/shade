import type { UnitDefinition } from '$lib/patterns/spec-types';

export type EditorMode =
	| 'unit'
	| 'withinBand'
	| 'acrossBands'
	| 'partnerStart'
	| 'partnerEnd'
	| 'skipRemove';

export const ruleModes: EditorMode[] = ['withinBand', 'acrossBands', 'partnerStart', 'partnerEnd'];

export const isRuleMode = (mode: EditorMode): boolean => (ruleModes as EditorMode[]).includes(mode);

export type Point = { x: number; y: number };

export const ghostTransform = (mode: EditorMode, unit: UnitDefinition, p: Point): Point => {
	switch (mode) {
		case 'withinBand':
			return { x: p.x + unit.width, y: p.y };
		case 'acrossBands':
			return { x: p.x, y: p.y - unit.height };
		case 'partnerStart':
			return { x: -p.x, y: p.y };
		case 'partnerEnd':
			return { x: 2 * unit.width - p.x, y: p.y };
		default:
			return p;
	}
};

export const ghostSvgTransform = (mode: EditorMode, unit: UnitDefinition): string => {
	switch (mode) {
		case 'withinBand':
			return `translate(${unit.width}, 0)`;
		case 'acrossBands':
			return `translate(0, ${-unit.height})`;
		case 'partnerStart':
			return `scale(-1, 1)`;
		case 'partnerEnd':
			return `translate(${2 * unit.width}, 0) scale(-1, 1)`;
		default:
			return '';
	}
};

export const ruleArrayKey: Record<
	'withinBand' | 'acrossBands' | 'partnerStart' | 'partnerEnd',
	'withinBand' | 'acrossBands' | 'partner.startEnd' | 'partner.endEnd'
> = {
	withinBand: 'withinBand',
	acrossBands: 'acrossBands',
	partnerStart: 'partner.startEnd',
	partnerEnd: 'partner.endEnd'
};
