import type { TransformConfig } from '$lib/projection-geometry/types';
import type {
	GridVariant,
	PathSegment,
	CutPattern,
	Point,
	SkipEdges,
	TiledPatternConfig,
	TubeCutPattern,
	BandCutPattern,
	Band,
	MovePathSegment,
	LinePathSegment
} from '$lib/types';
import { isSameAddress } from '$lib/util';
import { getAngle, rotatePS, transformPS, transformPSWithConfig, translatePS } from './utils';

type Props = {
	size: number;
	rows: number;
	columns: number;
	variant: GridVariant;
	sideOrientation: Band['sideOrientation'];
};

const START_SEGMENTS = 14;
const END_SEGMENTS = 14;
const MIDDLE_SEGMENTS = 52;

const generateUnit = (
	edge = false,
	w: number,
	h: number,
	invert: boolean
): { start: PathSegment[]; middle: PathSegment[]; end: PathSegment[] } => {
	const unitDef = {
		start: [
			['M', 0, 0], //0
			['L', 10 * w, 2 * h],
			['M', 10 * w, 2 * h],
			['L', 14 * w, 0], // 3
			['M', 14 * w, 0],
			['L', 19 * w, h], // 5
			['M', 19 * w, 1 * h],
			['L', 23 * w, -1 * h],
			['M', 23 * w, -1 * h],
			['L', 28 * w, 0 * h],
			['M', 28 * w, 0 * h],
			['L', 32 * w, -2 * h],
			['M', 32 * w, -2 * h],
			['L', 42 * w, 0 * h] // 13
		] as (MovePathSegment | LinePathSegment)[],
		middle: [
			// verticals 1
			['M', 0, 0], // 14
			['L', 2 * w, 6 * h],
			['M', 10 * w, 2 * h],
			['L', 11 * w, 5 * h],
			['M', 19 * w, 1 * h],
			['L', 21 * w, 7 * h],
			['M', 28 * w, 0 * h],
			['L', 29 * w, 3 * h],

			// verticals 2
			['M', -2 * w, 8 * h], // 22  (8)
			['L', 0 * w, 14 * h],
			['M', 7 * w, 7 * h],
			['L', 8 * w, 10 * h],
			['M', 34 * w, 4 * h],
			['L', 35 * w, 7 * h],
			['M', 42 * w, 0 * h],
			['L', 44 * w, 6 * h],

			// verticals 3

			['M', 13 * w, 11 * h],
			['L', 14 * w, 14 * h], // 31
			['M', 21 * w, 7 * h],
			['L', 23 * w, 13 * h], // 33
			['M', 31 * w, 9 * h],
			['L', 32 * w, 12 * h], // 35
			['M', 40 * w, 8 * h],
			['L', 42 * w, 14 * h], // 37

			// horizontal 1
			['M', -2 * w, 8 * h], // 24
			['L', 2 * w, 6 * h],
			['M', 2 * w, 6 * h],
			['L', 7 * w, 7 * h],
			['M', 7 * w, 7 * h],
			['L', 11 * w, 5 * h],
			['M', 11 * w, 5 * h],
			['L', 21 * w, 7 * h],
			['M', 21 * w, 7 * h],
			['L', 31 * w, 9 * h],
			['M', 31 * w, 9 * h],
			['L', 35 * w, 7 * h],
			['M', 35 * w, 7 * h],
			['L', 40 * w, 8 * h],
			['M', 40 * w, 8 * h],
			['L', 44 * w, 6 * h], // 39

			// horizontal 2
			['M', 0 * w, 14 * h], // 40
			['L', 8 * w, 10 * h],
			['M', 8 * w, 10 * h],
			['L', 13 * w, 11 * h],
			['M', 13 * w, 11 * h],
			['L', 21 * w, 7 * h],
			['M', 21 * w, 7 * h],
			['L', 29 * w, 3 * h],
			['M', 29 * w, 3 * h],
			['L', 34 * w, 4 * h],
			['M', 34 * w, 4 * h],
			['L', 42 * w, 0 * h] // 51
		] as (MovePathSegment | LinePathSegment)[],
		end: [
			['M', 0, 14 * h], // 52 -> 66
			['L', 10 * w, 16 * h],
			['M', 10 * w, 16 * h],
			['L', 14 * w, 14 * h],
			['M', 14 * w, 14 * h],
			['L', 19 * w, 15 * h],
			['M', 19 * w, 15 * h],
			['L', 23 * w, 13 * h],
			['M', 23 * w, 13 * h],
			['L', 28 * w, 14 * h],
			['M', 28 * w, 14 * h],
			['L', 32 * w, 12 * h],
			['M', 32 * w, 12 * h],
			['L', 42 * w, 14 * h] // 79
		] as (MovePathSegment | LinePathSegment)[]
	};

	// const unitDefPoints: { start: Point[]; middle: Point[]; end: Point[] } = {
	// 	start: [
	// 		{ x: 0, y: 0 }, //0
	// 		{ x: 10 * w, y: 2 * h },
	// 		{ x: 10 * w, y: 2 * h },
	// 		{ x: 14 * w, y: 0 }, // 3
	// 		{ x: 14 * w, y: 0 },
	// 		{ x: 19 * w, y: h }, // 5
	// 		{ x: 19 * w, y: 1 * h },
	// 		{ x: 23 * w, y: -1 * h },
	// 		{ x: 23 * w, y: -1 * h },
	// 		{ x: 28 * w, y: 0 * h },
	// 		{ x: 28 * w, y: 0 * h },
	// 		{ x: 32 * w, y: -2 * h },
	// 		{ x: 32 * w, y: -2 * h },
	// 		{ x: 42 * w, y: 0 * h } // 13
	// 	],
	// 	middle: [
	// 		// verticals 1
	// 		{ x: 0, y: 0 }, // 14
	// 		{ x: 2 * w, y: 6 * h },
	// 		{ x: 10 * w, y: 2 * h },
	// 		{ x: 11 * w, y: 5 * h },
	// 		{ x: 19 * w, y: 1 * h },
	// 		{ x: 21 * w, y: 7 * h },
	// 		{ x: 28 * w, y: 0 * h },
	// 		{ x: 29 * w, y: 3 * h },

	// 		// verticals 2
	// 		{ x: -2 * w, y: 8 * h }, // 22  (8)
	// 		{ x: 0 * w, y: 14 * h },
	// 		{ x: 7 * w, y: 7 * h },
	// 		{ x: 8 * w, y: 10 * h },
	// 		{ x: 34 * w, y: 4 * h },
	// 		{ x: 35 * w, y: 7 * h },
	// 		{ x: 42 * w, y: 0 * h },
	// 		{ x: 44 * w, y: 6 * h },

	// 		// verticals 3

	// 		{ x: 13 * w, y: 11 * h },
	// 		{ x: 14 * w, y: 14 * h }, // 31
	// 		{ x: 21 * w, y: 7 * h },
	// 		{ x: 23 * w, y: 13 * h }, // 33
	// 		{ x: 31 * w, y: 9 * h },
	// 		{ x: 32 * w, y: 12 * h }, // 35
	// 		{ x: 40 * w, y: 8 * h },
	// 		{ x: 42 * w, y: 14 * h }, // 37

	// 		// horizontal 1
	// 		{ x: -2 * w, y: 8 * h }, // 24
	// 		{ x: 2 * w, y: 6 * h },
	// 		{ x: 2 * w, y: 6 * h },
	// 		{ x: 7 * w, y: 7 * h },
	// 		{ x: 7 * w, y: 7 * h },
	// 		{ x: 11 * w, y: 5 * h },
	// 		{ x: 11 * w, y: 5 * h },
	// 		{ x: 21 * w, y: 7 * h },
	// 		{ x: 21 * w, y: 7 * h },
	// 		{ x: 31 * w, y: 9 * h },
	// 		{ x: 31 * w, y: 9 * h },
	// 		{ x: 35 * w, y: 7 * h },
	// 		{ x: 35 * w, y: 7 * h },
	// 		{ x: 40 * w, y: 8 * h },
	// 		{ x: 40 * w, y: 8 * h },
	// 		{ x: 44 * w, y: 6 * h }, // 39

	// 		// horizontal 2
	// 		{ x: 0 * w, y: 14 * h }, // 40
	// 		{ x: 8 * w, y: 10 * h },
	// 		{ x: 8 * w, y: 10 * h },
	// 		{ x: 13 * w, y: 11 * h },
	// 		{ x: 13 * w, y: 11 * h },
	// 		{ x: 21 * w, y: 7 * h },
	// 		{ x: 21 * w, y: 7 * h },
	// 		{ x: 29 * w, y: 3 * h },
	// 		{ x: 29 * w, y: 3 * h },
	// 		{ x: 34 * w, y: 4 * h },
	// 		{ x: 34 * w, y: 4 * h },
	// 		{ x: 42 * w, y: 0 * h } // 51
	// 	],
	// 	end: [
	// 		{ x: 0, y: 14 * h }, // 52 -> 66
	// 		{ x: 10 * w, y: 16 * h },
	// 		{ x: 10 * w, y: 16 * h },
	// 		{ x: 14 * w, y: 14 * h },
	// 		{ x: 14 * w, y: 14 * h },
	// 		{ x: 19 * w, y: 15 * h },
	// 		{ x: 19 * w, y: 15 * h },
	// 		{ x: 23 * w, y: 13 * h },
	// 		{ x: 23 * w, y: 13 * h },
	// 		{ x: 28 * w, y: 14 * h },
	// 		{ x: 28 * w, y: 14 * h },
	// 		{ x: 32 * w, y: 12 * h },
	// 		{ x: 32 * w, y: 12 * h },
	// 		{ x: 42 * w, y: 14 * h } // 79
	// 	]
	// }

	if (invert) {
		const maxX = 1;
		// Math.max(
		// 	...unitDef.start.map((seg) => seg[1] || 0),
		// 	...unitDef.middle.map((seg) => seg[1] || 0),
		// 	...unitDef.end.map((seg) => seg[1] || 0)
		// );
		unitDef.start = unitDef.start
			.reverse()
			.map(
				(seg) =>
					[seg[0] === 'M' ? 'L' : 'M', maxX - (seg[1] || 0), seg[2]] as
						| MovePathSegment
						| LinePathSegment
			);
		unitDef.middle = unitDef.middle
			.reverse()
			.map(
				(seg) =>
					[seg[0] === 'M' ? 'L' : 'M', maxX - (seg[1] || 0), seg[2]] as
						| MovePathSegment
						| LinePathSegment
			);
		unitDef.end = unitDef.end
			.reverse()
			.map(
				(seg) =>
					[seg[0] === 'M' ? 'L' : 'M', maxX - (seg[1] || 0), seg[2]] as
						| MovePathSegment
						| LinePathSegment
			);
	}

	if (unitDef.start.length !== START_SEGMENTS || unitDef.end.length !== END_SEGMENTS) {
		throw new Error('shield tesselation definition is bad');
	}
	return unitDef;
};

export const generateShieldTesselationTile = ({
	size,
	rows,
	columns,
	sideOrientation
}: Props): PathSegment[] => {
	const invert = false;
	// sideOrientation === 'inside';
	rows = 1;
	const row = size / rows;
	const col = size / columns;
	const h = row / 14;
	const w = col / 42;

	const startSegments: PathSegment[] = [];
	const middleSegments: PathSegment[] = [];
	const endSegments: PathSegment[] = [];

	for (let c = 0; c < columns; c++) {
		for (let r = 0; r < rows; r++) {
			const unit = generateUnit(c === columns - 1, w, h, invert);
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

const DEBUG_METADATA = true;

export const adjustShieldTesselationAfterTiling = (
	bands: BandCutPattern[],
	tiledPatternConfig: TiledPatternConfig,
	tubes: TubeCutPattern[]
) => {
	const {
		config: { endLooped, endsMatched, rowCount: rows = 1, columnCount: columns = 1 }
	} = tiledPatternConfig;

	const newBands = structuredClone(bands);
	for (let b = 0; b < bands.length; b++) {
		const band = bands[b];

		const prevBandPaths = bands[(bands.length + b - 1) % bands.length].facets.map(
			(facet: CutPattern, f) => {
				const { path, quad } = facet;
				const referenceQuad = band.facets[f].quad;
				if (!quad || !referenceQuad) throw new Error('missing quad');

				const offset = { x: referenceQuad.a.x - quad.b.x, y: referenceQuad.a.y - quad.b.y };
				const angle = getAngle(referenceQuad.a, referenceQuad.d) - getAngle(quad.b, quad.c);

				let newPath = translatePS(structuredClone(path), offset.x, offset.y);
				newPath = rotatePS(newPath, angle, referenceQuad.a);

				return newPath;
			}
		);

		for (let f = 0; f < band.facets.length; f++) {
			if (DEBUG_METADATA) {
				newBands[b].facets[f].meta = {
					originalPath: structuredClone(band.facets[f].path),
					prevBandPath: prevBandPaths[f]
				};
			}

			// TODO - if `endsMatched`, and  f === band.facets.length - 1 || f === 0 is true, nextPath should be the `endPartnerBand` facet, not the next facet
			const nextPath = band.facets[(f + 1) % band.facets.length].path;

			const sourceIndices = {
				start: retarget([1, 2, 5, 6, 7, 8, 7, 11, 12, 11], rows, columns),
				left: retarget([36, 36, 29, 29, 29], rows, columns)
				// remove:
				// left: retarget([36, 36, 29, 53, 29], rows, columns)
			};

			const targetIndices = {
				end: retarget([67, 68, 71, 72, 73, 74, 33, 77, 78, 35], rows, columns),
				right: retarget([22, 38, 15, 39, 40], rows, columns),
				remove: retarget([22, 23, 38, 39], rows, columns)
				// right: retarget([22, 38, 15, 39, 40], rows, columns)
			};

			const doEndMatching = true; //band.address.tube === 0 && band.address.band === 2;
			// TODO: do both end partners
			// TODO: fix translation.  The translation config works for SVG transform, but not our translatePS.  They should be 1:1
			if (doEndMatching && endsMatched && (f === 0 || f === band.facets.length - 1)) {
				const partner = getTransformedPartnerCutPattern(
					band as BandCutPattern,
					f,
					tubes,
					tiledPatternConfig.config.endsMatched
				);
				if (!partner) throw new Error('missing partner path');
				newBands[b].meta = {
					...newBands[b].meta,
					...(f === 0
						? { translatedStartPartnerFacet: partner }
						: { translatedEndPartnerFacet: partner })
				} as BandCutPattern['meta'];

				replaceInPlace({
					sourceIndices: retarget(
						[...(Number(partner.label) === 0 ? [6, 5, 2, 1] : [73, 74, 77, 78])],
						rows,
						columns
					),
					targetIndices: retarget(
						[...(f === 0 ? [7, 8, 11, 12] : [72, 71, 68, 67])],
						rows,
						columns
					),
					target: newBands[b].facets[f].path,
					source: partner.path
				});
			}

			// swap points between adjacent facets in the same band
			if (f < band.facets.length - 1 || endLooped) {
				replaceInPlace({
					targetIndices: [...targetIndices.end],
					sourceIndices: [...sourceIndices.start],
					target: newBands[b].facets[f].path,
					source: nextPath
				});
			}
			// swap points between adjacent facets in adjacent bands
			// TODO: we maybe also need to swap a few points betwee target.left and source.right

			replaceInPlace({
				targetIndices: [...targetIndices.right],
				sourceIndices: [...sourceIndices.left],
				target: newBands[b].facets[f].path,
				source: prevBandPaths[f]
			});

			const shouldRemove = evaluateSkipEdge(
				tiledPatternConfig.config.skipEdges || 'none',
				f,
				band.facets.length - 1
			);

			if (shouldRemove) {
				removeInPlace({ indices: [...targetIndices.remove], target: newBands[b].facets[f].path });
			}
		}
	}
	return newBands;
};

const retarget = (indices: number[], rows: number, columns: number) => {
	const retargeted = indices.flatMap((index, i) => {
		const result: number[] = [];

		if (index < START_SEGMENTS && columns > 1) {
			for (let c = 0; c < columns; c++) {
				result.push(index + c * START_SEGMENTS);
			}
			return result;
		}
		if (index >= START_SEGMENTS + MIDDLE_SEGMENTS && columns > 1) {
			const localIndex = index - START_SEGMENTS - MIDDLE_SEGMENTS;
			const entryPoint = START_SEGMENTS * columns + MIDDLE_SEGMENTS * rows * columns;
			for (let c = 0; c < columns; c++) {
				result.push(entryPoint + localIndex + c * END_SEGMENTS);
			}
			return result;
		}
		if (
			index >= START_SEGMENTS &&
			index < START_SEGMENTS + MIDDLE_SEGMENTS &&
			(columns > 1 || rows > 1)
		) {
			const entryPoint = START_SEGMENTS * columns + MIDDLE_SEGMENTS * (rows - 1) * columns;
			for (let c = 0; c < columns; c++) {
				result.push(entryPoint + index + c * MIDDLE_SEGMENTS);
			}
			return result;
		}
		return index;
	});
	return retargeted;
};

const replaceInPlace = ({
	targetIndices,
	sourceIndices,
	target,
	source
}: {
	targetIndices: number[];
	sourceIndices: number[];
	target: PathSegment[];
	source: PathSegment[];
}) => {
	if (targetIndices.length !== sourceIndices.length) {
		console.error({ targetIndices, sourceIndices });
		throw new Error('replaceInPlace error');
	}
	for (let i = 0; i < targetIndices.length; i++) {
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-expect-error Intentional: we may write a loosely-typed 3-tuple here; callers only use M/L segments.
		target[targetIndices[i]] = [
			target[targetIndices[i]][0],
			source[sourceIndices[i]][1],
			source[sourceIndices[i]][2]
		];
	}
};

const evaluateSkipEdge = (skip: SkipEdges, index: number, limit: number) => {
	switch (skip) {
		case 'not-both':
			return index > 0 && index < limit;
		case 'not-first':
			return index > 0;
		case 'not-last':
			return index < limit;
		case 'all':
			return true;
		default:
			return false;
	}
};

const removeInPlace = ({ indices, target }: { indices: number[]; target: PathSegment[] }) => {
	const sortedIndices = indices.sort().reverse();
	for (const index of indices) {
		target.splice(index, 1);
	}
};

const getTransformedPartnerCutPattern = (
	band: BandCutPattern,
	f: number,
	tubes: TubeCutPattern[],
	endsMatched: boolean
): CutPattern | undefined => {
	if (!endsMatched || !band.meta || (f !== 0 && f !== band.facets.length - 1)) return undefined;

	const partnerAddress = f === 0 ? band.meta.startPartnerBand : band.meta.endPartnerBand;
	const transform: TransformConfig | undefined =
		f === 0 ? band.meta.startPartnerTransform : band.meta.endPartnerTransform;
	const partnerBand = tubes[partnerAddress.tube].bands[partnerAddress.band];
	if (!partnerBand.meta) return undefined;
	const partnerFacetIndex = isSameAddress(partnerBand.meta.startPartnerBand, band.address)
		? 0
		: partnerBand.facets.length - 1;
	const partnerFacet: CutPattern = partnerBand.facets[partnerFacetIndex];
	const partnerPath = structuredClone(partnerFacet.path);
	const transformedPartnerPath = transform ? newTransformPS(partnerPath, transform) : partnerPath;

	return { path: transformedPartnerPath, label: `${partnerFacetIndex}` };
};

const newTransformPS = (path: PathSegment[], transform: TransformConfig) => {
	const {
		translate: { x: translateX, y: translateY },
		rotate: { z: theta }
	} = transform;
	const thetaRad = (theta * Math.PI) / 180;
	const cos = Math.cos(thetaRad);
	const sin = Math.sin(thetaRad);

	// Equivalent to SVG: `matrix(cos sin -sin cos translateX translateY)`
	// which is equivalent to transform-list: `translate(translateX, translateY) rotate(theta)`
	// (SVG applies transform lists right-to-left).
	const transformPoint = (x: number, y: number): [number, number] => {
		const x2 = cos * x - sin * y + translateX;
		const y2 = sin * x + cos * y + translateY;
		return [x2, y2];
	};

	const transformed: PathSegment[] = path.map((seg) => {
		switch (seg[0]) {
			case 'M': {
				const [x, y] = transformPoint(seg[1], seg[2]);
				return ['M', x, y];
			}
			case 'L': {
				const [x, y] = transformPoint(seg[1], seg[2]);
				return ['L', x, y];
			}
			case 'Q': {
				const [cx, cy] = transformPoint(seg[1], seg[2]);
				const [x, y] = transformPoint(seg[3], seg[4]);
				return ['Q', cx, cy, x, y];
			}
			case 'C': {
				const [c1x, c1y] = transformPoint(seg[1], seg[2]);
				const [c2x, c2y] = transformPoint(seg[3], seg[4]);
				const [x, y] = transformPoint(seg[5], seg[6]);
				return ['C', c1x, c1y, c2x, c2y, x, y];
			}
			case 'A': {
				// Arc radii are unchanged for pure rotation+translation; endpoint is transformed.
				// Arc x-axis-rotation is expressed in degrees and rotates with the shape.
				const [x, y] = transformPoint(seg[6], seg[7]);
				const xAxisRotation = seg[3] + theta;
				return ['A', seg[1], seg[2], xAxisRotation, seg[4], seg[5], x, y];
			}
			case 'Z':
				return ['Z'];
			default:
				return seg;
		}
	});

	return transformed;
};
