import type { Band, GridVariant, PathSegment } from '$lib/types';
import { translatePS } from '../../utils';
import type { TiledPatternSpec } from '../../spec-types';
import { scaleSegment } from './helpers';
import { layoutTesselation, unitCounts } from './layout';

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

	// The adjuster expands spec indices through this same layout, so the path is
	// assembled from it rather than from its own ordering.
	const layout = layoutTesselation(unitCounts(spec.unit), rows, columns);
	const segments: PathSegment[] = layout.blocks.flatMap(({ group, row: r, column: c }) =>
		translatePS(unit[group], col * c, row * r)
	);

	const extraSegments: PathSegment[] = [];
	for (let c = 0; c < columns; c++) {
		for (let r = 0; r < rows; r++) {
			const tx = col * c;
			const ty = row * r;
			if (c === 0 && unit.firstColumn.length > 0) {
				extraSegments.push(...translatePS(unit.firstColumn, tx, ty));
			}
			if (c === columns - 1 && unit.lastColumn.length > 0) {
				extraSegments.push(...translatePS(unit.lastColumn, tx, ty));
			}
		}
	}

	return [...segments, ...extraSegments];
};
