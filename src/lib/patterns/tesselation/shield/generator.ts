import type {
	Band,
	GridVariant,
	LinePathSegment,
	MovePathSegment,
	PathSegment
} from '$lib/types';
import { translatePS } from '../../utils';
import type { TiledPatternSpec } from '../../spec-types';

export type ShieldGeneratorProps = {
	size: number;
	rows: number;
	columns: number;
	variant: GridVariant;
	sideOrientation: Band['sideOrientation'];
};

const scaleSegment = <S extends MovePathSegment | LinePathSegment>(
	seg: S,
	w: number,
	h: number
): S => [seg[0], (seg[1] || 0) * w, (seg[2] || 0) * h] as S;

const invertGroup = (
	segments: (MovePathSegment | LinePathSegment)[],
	maxX: number
): (MovePathSegment | LinePathSegment)[] =>
	segments
		.slice()
		.reverse()
		.map(
			(seg) =>
				[seg[0] === 'M' ? 'L' : 'M', maxX - (seg[1] || 0), seg[2] || 0] as
					| MovePathSegment
					| LinePathSegment
		);

const buildUnit = (
	spec: TiledPatternSpec,
	w: number,
	h: number,
	invert: boolean
): {
	start: PathSegment[];
	middle: PathSegment[];
	end: PathSegment[];
} => {
	const start = spec.unit.start.map((s) =>
		scaleSegment(s as MovePathSegment | LinePathSegment, w, h)
	);
	const middle = spec.unit.middle.map((s) =>
		scaleSegment(s as MovePathSegment | LinePathSegment, w, h)
	);
	const end = spec.unit.end.map((s) =>
		scaleSegment(s as MovePathSegment | LinePathSegment, w, h)
	);

	if (invert) {
		const maxX = 1;
		return {
			start: invertGroup(start as (MovePathSegment | LinePathSegment)[], maxX),
			middle: invertGroup(middle as (MovePathSegment | LinePathSegment)[], maxX),
			end: invertGroup(end as (MovePathSegment | LinePathSegment)[], maxX)
		};
	}

	return { start, middle, end };
};

export const generateShieldTesselationTile = (
	spec: TiledPatternSpec,
	props: ShieldGeneratorProps
): PathSegment[] => {
	const { size, columns } = props;
	let { rows } = props;
	const invert = false;
	rows = 1;
	const row = size / rows;
	const col = size / columns;

	const w = col / spec.unit.width;
	const h = row / spec.unit.height;

	const startSegments: PathSegment[] = [];
	const middleSegments: PathSegment[] = [];
	const endSegments: PathSegment[] = [];

	for (let c = 0; c < columns; c++) {
		for (let r = 0; r < rows; r++) {
			const unit = buildUnit(spec, w, h, invert);
			if (r > 0 && r < rows - 1) {
				middleSegments.push(
					...translatePS(unit.start, col * c, row * r),
					...translatePS(unit.middle, col * c, row * r),
					...translatePS(unit.end, col * c, row * r)
				);
				continue;
			}
			if (rows === 1) {
				startSegments.push(...translatePS(unit.start, col * c, row * r));
				endSegments.push(...translatePS(unit.end, col * c, row * r));
			} else if (r === 0) {
				middleSegments.push(...translatePS(unit.end, col * c, row * r));
				startSegments.push(...translatePS(unit.start, col * c, row * r));
			} else if (r === rows - 1) {
				middleSegments.push(...translatePS(unit.start, col * c, row * r));
				endSegments.push(...translatePS(unit.end, col * c, row * r));
			}
			middleSegments.push(...translatePS(unit.middle, col * c, row * r));
		}
	}
	const segments = [...startSegments, ...middleSegments, ...endSegments];
	return segments;
};
