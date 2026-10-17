import type { PanelVariant, PathSegment } from '#lib/types.js';

type Props = {
	size: number;
	variant: PanelVariant;
};

const generateUnit = (
	w: number,
	h: number,
	variant: PanelVariant
): { start: PathSegment[]; end: PathSegment[] } => {
	switch (variant) {
		case 'triangle-1':
			return unitTriangle(w, h, 'triangle-1');
		case 'triangle-0':
		default:
			return unitTriangle(w, h, 'triangle-0');
	}
};

const unitTriangle = (
	w: number,
	h: number,
	subVariant: 'triangle-0' | 'triangle-1'
): { start: PathSegment[]; end: PathSegment[] } => {
	return subVariant === 'triangle-0'
		? {
				start: [['M', 0, 0], ['L', 0, h], ['L', w, h], ['Z']],
				end: [['M', 0, 0], ['L', w, h], ['L', w, 0], ['Z']]
			}
		: {
				start: [['M', 0, 0], ['L', 0, h], ['L', w, 0], ['Z']],
				end: [['M', 0, w], ['L', 0, h], ['L', w, h], ['Z']]
			};
};

export const generatePanelPattern = ({ size, variant }: Props): PathSegment[] => {
	const unit = generateUnit(size, size, variant);
	return [...unit.start, ...unit.end];
};

export const adjustPanelPatternAfterTiling = (patternBand: PathSegment[][]): PathSegment[][] => {
	return patternBand;
};
