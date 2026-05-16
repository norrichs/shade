import type { Band, GridVariant, PathSegment } from '$lib/types';
import { translatePS } from '../../utils';
import type { TiledPatternSpec } from '../../spec-types';
import { scaleSegment } from './helpers';

export type TesselationGeneratorProps = {
	size: number;
	rows: number;
	columns: number;
	variant?: GridVariant;
	sideOrientation: Band['sideOrientation'];
};

type BuiltUnit = {
	start: PathSegment[];
	middle: PathSegment[];
	end: PathSegment[];
	firstColumn: PathSegment[];
	lastColumn: PathSegment[];
};

const buildUnit = (spec: TiledPatternSpec, w: number, h: number): BuiltUnit => ({
	start: spec.unit.start.map((s) => scaleSegment(s, w, h)),
	middle: spec.unit.middle.map((s) => scaleSegment(s, w, h)),
	end: spec.unit.end.map((s) => scaleSegment(s, w, h)),
	firstColumn: (spec.unit.firstColumn ?? []).map((s) => scaleSegment(s, w, h)),
	lastColumn: (spec.unit.lastColumn ?? []).map((s) => scaleSegment(s, w, h))
});

export const generateTesselationTile = (
	spec: TiledPatternSpec,
	props: TesselationGeneratorProps
): PathSegment[] => {
	const { size, rows, columns } = props;
	const row = size / rows;
	const col = size / columns;
	const w = col / spec.unit.width;
	const h = row / spec.unit.height;

	const unit = buildUnit(spec, w, h);

	const startSegments: PathSegment[] = [];
	const middleSegments: PathSegment[] = [];
	const endSegments: PathSegment[] = [];
	const extraSegments: PathSegment[] = [];

	for (let c = 0; c < columns; c++) {
		for (let r = 0; r < rows; r++) {
			const tx = col * c;
			const ty = row * r;

			if (r > 0 && r < rows - 1) {
				middleSegments.push(
					...translatePS(unit.start, tx, ty),
					...translatePS(unit.middle, tx, ty),
					...translatePS(unit.end, tx, ty)
				);
			} else if (rows === 1) {
				startSegments.push(...translatePS(unit.start, tx, ty));
				endSegments.push(...translatePS(unit.end, tx, ty));
				middleSegments.push(...translatePS(unit.middle, tx, ty));
			} else if (r === 0) {
				middleSegments.push(...translatePS(unit.end, tx, ty));
				startSegments.push(...translatePS(unit.start, tx, ty));
				middleSegments.push(...translatePS(unit.middle, tx, ty));
			} else if (r === rows - 1) {
				middleSegments.push(...translatePS(unit.start, tx, ty));
				endSegments.push(...translatePS(unit.end, tx, ty));
				middleSegments.push(...translatePS(unit.middle, tx, ty));
			}

			if (c === 0 && unit.firstColumn.length > 0) {
				extraSegments.push(...translatePS(unit.firstColumn, tx, ty));
			}
			if (c === columns - 1 && unit.lastColumn.length > 0) {
				extraSegments.push(...translatePS(unit.lastColumn, tx, ty));
			}
		}
	}

	return [...startSegments, ...middleSegments, ...endSegments, ...extraSegments];
};
