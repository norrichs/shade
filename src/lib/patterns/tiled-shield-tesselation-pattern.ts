import type {
	GridVariant,
	PathSegment,
	CutPattern,
	Point,
	SkipEdges,
	TiledPatternConfig
} from '$lib/types';
import { getAngle, rotatePS, translatePS } from './utils';

type Props = {
	size: number;
	rows: number;
	columns: number;
	variant: GridVariant;
};

const START_SEGMENTS = 14;
const END_SEGMENTS = 14;
const MIDDLE_SEGMENTS = 52;

const generateUnit = (
	edge = false,
	w: number,
	h: number
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
		] as PathSegment[],
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
		] as PathSegment[],
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
		] as PathSegment[]
	};

	if (unitDef.start.length !== START_SEGMENTS || unitDef.end.length !== END_SEGMENTS) {
		throw new Error('shield tesselation definition is bad');
	}
	return unitDef;
};

export const generateShieldTesselationTile = ({ size, rows, columns }: Props): PathSegment[] => {
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
			const unit = generateUnit(c === columns - 1, w, h);
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

export const adjustShieldTesselationAfterTiling = (
	bands: { facets: CutPattern[]; id: string; tagAnchorPoint: Point }[],
	tiledPatternConfig: TiledPatternConfig
) => {
	const {
		config: { endLooped, rowCount: rows = 1, columnCount: columns = 1 }
	} = tiledPatternConfig;

	const newBands = structuredClone(bands);
	const adjacentPaths = [];
	for (let b = 0; b < bands.length; b++) {
		const band = bands[b];

		const prevBandPaths = bands[(bands.length + b - 1) % bands.length].facets.map(
			(facet: CutPattern, f) => {
				const { path, quad } = facet;
				const referenceQuad = band.facets[f].quad;
				if (!quad || !referenceQuad) throw new Error('missing quad');

				const offset = { x: referenceQuad.a.x - quad.b.x, y: referenceQuad.a.y - quad.b.y };
				const angle = getAngle(referenceQuad.a, referenceQuad.d) - getAngle(quad.b, quad.c);

				let newPath = translatePS(window.structuredClone(path), offset.x, offset.y);
				newPath = rotatePS(newPath, angle, referenceQuad.a);

				return newPath;
			}
		);
		adjacentPaths.push(prevBandPaths);

		for (let f = 0; f < band.facets.length; f++) {
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
			if (f < band.facets.length - 1 || endLooped) {
				replaceInPlace({
					targetIndices: [...targetIndices.end],
					sourceIndices: [...sourceIndices.start],
					target: newBands[b].facets[f].path,
					source: nextPath
				});
			}

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

	return { bands: newBands, adjacentBands: adjacentPaths };
	// return newBands
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
		console.error('!!!!!!!!!');

		throw new Error('replaceInPlace error');
	}
	for (let i = 0; i < targetIndices.length; i++) {
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
