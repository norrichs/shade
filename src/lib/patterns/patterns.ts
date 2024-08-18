import {
	type PathSegment,
	type PatternedPattern,
	type HexPattern,
	type MovePathSegment,
	type Quadrilateral,
	type Point,
	type LinePathSegment,
	isMovePathSegment,
	isLinePathSegment
} from '$lib/types';
import { svgPathStringFromSegments } from './flower-of-life';
import { transformPatternByQuad } from './quadrilateral';
import {
	getAngle,
	getDirection,
	getLength,
	getMidPoint,
	getQuadWidth,
	rotatePoint,
	translatePS
} from './utils';

export const generateAuxetic = ({
	size,
	rows,
	columns
}: {
	size: number;
	rows: number;
	columns: number;
}): PathSegment[] => {
	const unit = size;
	const w = unit / 2 / columns;
	const h = unit / 4 / rows;
	const colW = unit / columns;
	const rowH = unit / rows;

	const units: PathSegment[] = [];
	const stems: PathSegment[] = [];

	for (let row = 0; row < rows; row++) {
		const leftToRight: PathSegment[] = [];
		const rightToLeft: PathSegment[] = [];
		const down: PathSegment[] = [];
		const up: PathSegment[] = [];
		down.push(['L', unit, row * rowH + 3.5 * h]);
		up.push(['L', 0, row * rowH + 0.5 * h]);

		for (let col = 0; col < columns; col++) {
			leftToRight.push(
				['L', col * colW + w, row * rowH + 1.5 * h],
				['L', col * colW + 2 * w, row * rowH + 0.5 * h]
			);

			rightToLeft.push(
				['L', (columns - 1 - col) * colW + w, row * rowH + 2.5 * h],
				['L', (columns - 1 - col) * colW + 0, row * rowH + 3.5 * h]
			);
			const insideStems: PathSegment[] =
				col < columns - 1
					? [
							['M', col * colW + colW, row * rowH + 0.5 * h],
							['L', col * colW + colW, row * rowH + 3.5 * h]
					  ]
					: [];

			stems.push(
				...insideStems,
				['M', col * colW + w, row * rowH],
				['L', col * colW + w, row * rowH + 1.5 * h],
				['M', col * colW + w, row * rowH + 2.5 * h],
				['L', col * colW + w, row * rowH + 4 * h]
			);
		}

		units.push(['M', 0, row * rowH + 0.5 * h], ...leftToRight, ...down, ...rightToLeft, ...up);
	}
	units.push(...stems);
	return units;
};

export const generateCarnation = ({
	size = 1,
	variant = 0,
	rows = 1,
	columns = 1
}: {
	size: number;
	rows: number;
	columns: number;
	variant: 0 | 1;
}): PathSegment[] => {
	const row = size / rows;
	const col = size / columns;
	const w = col / 4;
	const h = row / 2;

	let unitPattern: PathSegment[];
	if (variant === 1) {
		unitPattern = [
			['M', 0, h],
			['C', 0, h - h / 2, w, h, w, 0],
			['C', w, h, 2 * w, h / 2, 2 * w, h],
			['C', 2 * w, h / 2, 3 * w, h, 3 * w, 0],
			['C', 3 * w, h, col, h / 2, col, h],
			['M', 0, h],
			['C', 0, row, w, row - h / 2, w, row],
			['C', w, row - h / 2, 2 * w, row, 2 * w, h],
			['C', 2 * w, row, 3 * w, row - h / 2, 3 * w, row],
			['C', 3 * w, row - h / 2, col, row, col, h]
		];
	} else {
		unitPattern = [
			['M', 0, h],
			['Q', w, h, w, 0],
			['Q', w, h, 2 * w, h],
			['Q', 3 * w, h, 3 * w, 0],
			['Q', 3 * w, h, col, h],
			['M', 0, h],
			['Q', 0, row, w, row],
			['Q', 2 * w, row, 2 * w, h],
			['Q', 2 * w, row, 3 * w, row],
			['Q', col, row, col, h]
		];
	}
	const patternSegments: PathSegment[] = [];

	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < columns; c++) {
			patternSegments.push(...translatePS(unitPattern, col * c, row * r));
		}
	}

	return patternSegments;
};

const adjustCarnation = (tiledBands: { facets: PatternedPattern[] }[]) => {
	console.debug('-------- adjustCarnation');
	const patternPrototype = generateCarnation({ variant: 1, size: 1, rows: 1, columns: 1 });
	const addendaPrototype = [
		['M', patternPrototype[3][5], patternPrototype[3][6]] as MovePathSegment,
		patternPrototype[4],
		['M', patternPrototype[8][5], patternPrototype[8][6]] as MovePathSegment,
		patternPrototype[9]
	];
	const adjusted = tiledBands.map((band, bandIndex, bands) => ({
		...band,
		facets: band.facets.map((facet, facetIndex) => {
			console.debug(
				'    original facet path',
				bandIndex,
				facetIndex,
				window.structuredClone(facet.path)
			);
			const addendaFacet0 = window.structuredClone(
				bands[(bandIndex + bands.length - 1) % bands.length].facets[facetIndex]
			);

			if (facet.quad && addendaFacet0.quad) {
				const offset = {
					x: facet.quad.p0.x - addendaFacet0.quad.p1.x,
					y: facet.quad?.p0.y - addendaFacet0.quad?.p1.y
				};
				const offsetAngle =
					getAngle(facet.quad.p0, facet.quad.p3) -
					getAngle(addendaFacet0.quad.p1, addendaFacet0.quad.p2);
				const anchorPoint = {
					x: addendaFacet0.quad.p1.x + offset.x,
					y: addendaFacet0.quad.p1.y + offset.y
				};
				addendaFacet0.quad = {
					p0: rotatePoint(
						anchorPoint,
						{ x: addendaFacet0.quad.p0.x + offset.x, y: addendaFacet0.quad.p0.y + offset.y },
						offsetAngle
					),
					p1: anchorPoint,
					p2: rotatePoint(
						anchorPoint,
						{ x: addendaFacet0.quad.p2.x + offset.x, y: addendaFacet0.quad.p2.y + offset.y },
						offsetAngle
					),
					p3: rotatePoint(
						anchorPoint,
						{ x: addendaFacet0.quad.p3.x + offset.x, y: addendaFacet0.quad.p3.y + offset.y },
						offsetAngle
					)
				};
			}

			// addendaPath0 =
			const addenda0 = {
				quad: addendaFacet0.quad,
				quadWidth: addendaFacet0.quadWidth,
				path: transformPatternByQuad(addendaPrototype, addendaFacet0.quad)
			};
			// const addendaFacet1 = bands[(bandIndex + bands.length + 1) % bands.length].facets[facetIndex];
			// const addenda1 = {
			// 	quad: addendaFacet1.quad,
			// 	quadWidth: addendaFacet1.quadWidth,
			// 	path: addendaFacet1.path
			// };

			return { ...facet, addenda: [addenda0] };
		})
	}));
	console.debug('-------- adjustCarnation adjusted', adjusted);
	return adjusted;
};

const generateHexPattern = (
	rows: 1 | 2 | 3,
	columns: 1 | 2 | 3 | 4 | 5,
	{ size }: { variant?: 0 | 1; size: number }
) => {
	const row = size / rows;
	const col = size / columns;
	// const unit = size / 3;
	const h = row / 3;
	const w = col / 2;

	const unitPattern: PathSegment[] = [
		['M', 0, h],
		['L', w, 0.5 * h],
		['L', col, h],

		['M', 0, 2 * h],
		['L', w, 2.5 * h],
		['L', col, 2 * h],

		// Top segment
		['M', w, 0],
		['L', w, 0.5 * h],

		// Bottom segment
		['M', w, 2.5 * h],
		['L', w, row],

		// Center segments
		['M', 0, h],
		['L', 0, 2 * h]
	];

	const patternSegments: PathSegment[] = [];

	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < columns; c++) {
			patternSegments.push(...translatePS(unitPattern, col * c, row * r));
		}
		patternSegments.push(
			...translatePS(
				[
					['M', col, h],
					['L', col, 2 * h]
				],
				col * (columns - 1),
				row * r
			)
		);
	}

	return patternSegments;
};
// const generateHexPattern = (
// 	rows: 1 | 2 | 3,
// 	columns: 1 | 2 | 3 | 4 | 5,
// 	{ variant, size }: { variant: 0 | 1; size: number }
// ): HexPattern => {
// 	const unit = size / 3;
// 	const h = size / 4;
// 	const segments: { [key: number]: HexPattern } = {
// 		0: [
// 			['M', 0, unit / 2],
// 			['L', h, 0],
// 			['L', 2 * h, unit / 2],
// 			['L', 3 * h, 0],
// 			['L', 4 * h, unit / 2],

// 			['M', 0, unit / 2],
// 			['L', 0, (3 * unit) / 2],

// 			['M', 2 * h, unit / 2],
// 			['L', 2 * h, (3 * unit) / 2],

// 			['M', 4 * h, unit / 2],
// 			['L', 4 * h, (3 * unit) / 2],

// 			['M', 0, (3 * unit) / 2],
// 			['L', h, 2 * unit],
// 			['L', 2 * h, (3 * unit) / 2],
// 			['L', 3 * h, 2 * unit],
// 			['L', 4 * h, (3 * unit) / 2],

// 			['M', h, 2 * unit],
// 			['L', h, 3 * unit],

// 			['M', 3 * h, 2 * unit],
// 			['L', 3 * h, 3 * unit]
// 		],
// 		1: [
// 			['M', 0, unit],
// 			['L', h, 0.5 * unit],
// 			['L', 2 * h, unit],
// 			['L', 3 * h, 0.5 * unit],
// 			['L', 4 * h, unit],

// 			['L', 4 * h, 2 * unit],
// 			['L', 3 * h, 2.5 * unit],
// 			['L', 2 * h, 2 * unit],
// 			['L', h, 2.5 * unit],
// 			['L', 0, 2 * unit],
// 			['L', 0, unit],
// 			['Z'],

// 			// Center segment
// 			['M', 2 * h, unit],
// 			['L', 2 * h, 2 * unit],

// 			// Top segments
// 			['M', h, 0.5 * unit],
// 			['L', h, 0],

// 			['M', 3 * h, 0.5 * unit],
// 			['L', 3 * h, 0],

// 			// Bottom segments
// 			['M', h, 2.5 * unit],
// 			['L', h, 3 * unit],

// 			['M', 3 * h, 2.5 * unit],
// 			['L', 3 * h, 3 * unit]
// 		]
// 	};
// 	return segments[variant];
// };

export const generateBoxPattern = ({
	size = 1,
	height = 1,
	width = 2
}: {
	size?: number;
	height?: 1 | 2 | 3 | 4 | 5 | 6;
	width?: 1 | 2 | 3 | 4 | 5 | 6;
}) => {
	const rowHeight = size / height;
	const columnWidth = size / width;
	const v = rowHeight / 6;
	const h = columnWidth / 2;
	const segments: PathSegment[] = [];
	for (let row = 0; row < height; row++) {
		for (let col = 0; col < width; col++) {
			const r = rowHeight * row;
			const c = columnWidth * col;
			segments.push(
				...([
					['M', c + 0, r + v],
					['L', c + h, r + 0],
					['L', c + h, r + 2 * v],
					['L', c + 0, r + 3 * v],
					['Z'],
					['M', c + h, r + 0],
					['L', c + 2 * h, r + v],
					['L', c + 2 * h, r + 3 * v],
					['L', c + h, r + 2 * v],
					['Z'],
					['M', c + 0, r + 3 * v],
					['L', c + h, r + 2 * v],
					['L', c + 2 * h, r + 3 * v],
					['L', c + h, r + 4 * v],
					['Z'],
					['M', c + 0, r + 3 * v],
					['L', c + h, r + 4 * v],
					['L', c + h, r + 6 * v],
					['L', c + 0, r + 5 * v],
					['Z'],
					['M', c + h, r + 4 * v],
					['L', c + 2 * h, r + 3 * v],
					['L', c + 2 * h, r + 5 * v],
					['L', c + h, r + 6 * v],
					['Z']
				] as PathSegment[])
			);
		}
	}

	return segments;
};

const straightenEndSegments = (
	thisFacet: PathSegment[],
	prevFacet: PathSegment[],
	thisSegmentsIndices: number[][],
	prevSegmentsIndices: number[][]
) => {
	console.debug('adjust stub 1', thisFacet, prevFacet, thisSegmentsIndices, prevSegmentsIndices);
	if (
		thisSegmentsIndices.length !== prevSegmentsIndices.length ||
		thisSegmentsIndices.length === 0
	) {
		console.error();
		return thisFacet;
	}

	const output = window.structuredClone(thisFacet);

	return output;
};

export type PatternGenerator = UnitPatternGenerator | BandPatternGenerator;

export type UnitPatternGenerator = {
	getPattern: (
		rows: 1 | 2 | 3,
		columns: 1 | 2 | 3 | 4 | 5,
		quadBand?: Quadrilateral[]
	) => PathSegment[];
	tagAnchor?: any;
	adjustAfterTiling?: any;
};
export type BandPatternGenerator = {
	getPattern: (
		rows: 1 | 2 | 3,
		columns: 1 | 2 | 3 | 4 | 5,
		quadBand?: Quadrilateral[]
	) => DynamicPathCollection;
	tagAnchor?: any;
	adjustAfterTiling?: any;
};

export const patterns: { [key: string]: PatternGenerator } = {
	'tiledHexPattern-1': {
		getPattern: (rows: 1 | 2 | 3, columns: 1 | 2 | 3 | 4 | 5) =>
			generateHexPattern(rows, columns, { variant: 1, size: 1 }),
		tagAnchor: { facetIndex: 0, segmentIndex: 15 },
		adjustAfterTiling: (facets: [HexPattern, HexPattern]) =>
			straightenEndSegments(
				facets[0],
				facets[1],
				[
					[5, 6],
					[7, 8]
				],
				[
					[20, 21],
					[22, 23]
				]
			) as HexPattern
	},
	'tiledBoxPattern-0': {
		getPattern: (rows: 1 | 2 | 3, columns: 1 | 2 | 3 | 4 | 5) =>
			generateBoxPattern({ size: 1, height: rows, width: columns }),
		adjustAfterTiling: (facets: PatternedPattern) => facets,
		tagAnchor: { facetIndex: 0, segmentIndex: -1 }
	},
	'tiledBowtiePattern-0': {
		getPattern: (rows: 1 | 2 | 3, columns: 1 | 2 | 3 | 4 | 5) =>
			generateAuxetic({ size: 1, rows, columns }),
		tagAnchor: { facetIndex: 0, segmentIndex: -1 }
	},
	'tiledCarnationPattern-0': {
		getPattern: (rows: 1 | 2 | 3, columns: 1 | 2 | 3 | 4 | 5) =>
			generateCarnation({ size: 1, rows, columns, variant: 0 }),
		tagAnchor: { facetIndex: 0, segmentIndex: 5 },
		adjustAfterTiling: (tiledBands: { facets: PatternedPattern[] }[]) => {
			return adjustCarnation(tiledBands);
		}
	},
	'tiledCarnationPattern-1': {
		getPattern: (rows: 1 | 2 | 3, columns: 1 | 2 | 3 | 4 | 5) =>
			generateCarnation({ size: 1, rows, columns, variant: 1 }),
		tagAnchor: { facetIndex: 0, segmentIndex: 5 },
		adjustAfterTiling: (tiledBands: { facets: PatternedPattern[] }[]) => {
			console.debug('adjust after tiling - carnation 1');
			return adjustCarnation(tiledBands);
		}
	},
	'bandedBranchedPattern-0': {
		getPattern: (rows: 1 | 2 | 3, columns: 1 | 2 | 3 | 4 | 5, quadBand?: Quadrilateral[]) => {
			if (!quadBand) {
				throw new Error('quadBand Required for bandedBranchPattern-0');
			}
			console.debug('patterns.ts - return generateBranched');
			return generateBranched(quadBand, { rows, columns, variant: 0 });
		},
		tagAnchor: { facetIndex: 0, segmentIndex: 5 },
		adjustAfterTiling: (tiledBands: { facets: PatternedPattern[] }[]) => {
			return adjustCarnation(tiledBands);
		}
	}
};

// export const generateBranched = (
// 	quadBand: Quadrilateral[],
// 	config: { rows: number; columns: number; variant: number }
// ): PathSegment[] => {
// 	const left: PathSegment[] = [];
// 	const right: PathSegment[] = [];
// 	const center: PathSegment[] = [];

// 	quadBand.forEach((quad, i) => {
// 		const pm0 = getMidPoint(quad.p0, quad.p1);
// 		const pm1 = getMidPoint(quad.p2, quad.p3);
// 		if (i === 0) {
// 			left.push(['M', quad.p0.x, quad.p0.y], ['L', quad.p3.x, quad.p3.y]);
// 			right.push(
// 				['L', quad.p0.x, quad.p0.y],
// 				['L', quad.p1.x, quad.p1.y],
// 				['L', quad.p2.x, quad.p2.y]
// 			);
// 			center.push(['M', pm0.x, pm0.y]);
// 		} else if (i === quadBand.length - 1) {
// 			left.push(['L', quad.p3.x, quad.p3.y], ['L', quad.p2.x, quad.p2.y]);
// 			right.push(['L', quad.p1.x, quad.p1.y]);
// 		} else {
// 			left.push(['M', quad.p0.x, quad.p0.y], ['L', quad.p3.x, quad.p3.y]);
// 			right.push(['L', quad.p1.x, quad.p1.y], ['M', quad.p2.x, quad.p2.y]);
// 		}
// 	});
// 	const outline = [...left, ...right.reverse()];

// 	const segments: PathSegment[] = [];
// 	quadBand.forEach((quad) => {
// 		segments.push(
// 			['M', quad.p0.x, quad.p0.y],
// 			['L', quad.p1.x, quad.p1.y],
// 			['L', quad.p2.x, quad.p2.y],
// 			['L', quad.p3.x, quad.p3.y],
// 			['L', quad.p0.x, quad.p0.y]
// 		);
// 	});
// 	return outline;
// };

export type DynamicPathCollection = { [key: string]: DynamicPath };
export type DynamicPath = { width: number; path: PathSegment[]; svgPath: string }[];

export const generateBranched = (
	quadBand: Quadrilateral[],
	config: { rows: number; columns: number; variant: number; minWidth?: number; maxWidth?: number }
): DynamicPathCollection => {
	const { rows, columns, variant } = config;
	const minWidth = config.maxWidth || 1;
	const maxWidth = config.maxWidth || 2;
	const outlineWidth = maxWidth;

	const getOutline = (): DynamicPath => {
		const left: PathSegment[][] = [];
		const right: PathSegment[][] = [];

		quadBand.forEach((quad, i) => {
			if (i === 0) {
				left.push([
					['M', quad.p2.x, quad.p2.y],
					['L', quad.p1.x, quad.p1.y],
					['L', quad.p0.x, quad.p0.y],
					['L', quad.p3.x, quad.p3.y]
				]);
			} else if (i === quadBand.length - 1) {
				right.push([
					['M', quad.p0.x, quad.p0.y],
					['L', quad.p3.x, quad.p3.y],
					['L', quad.p2.x, quad.p2.y],
					['L', quad.p1.x, quad.p1.y]
				]);
			} else {
				left.push([
					['M', quad.p0.x, quad.p0.y],
					['L', quad.p3.x, quad.p3.y]
				]);
				right.push([
					['M', quad.p2.x, quad.p2.y],
					['L', quad.p1.x, quad.p1.y]
				]);
			}
		});
		return [...left, ...right.reverse()].map((path) => {
			return { path, svgPath: '', width: maxWidth };
		});
	};

	const outline: DynamicPath = getOutline();

	const stubbyOutline = outline.map((section, i) => {
		if (
			section.path.length === 2 &&
			isMovePathSegment(section.path[0]) &&
			isLinePathSegment(section.path[1])
		) {
			const { p0, p1 } = shortenLine(
				{ x: section.path[0][1], y: section.path[0][2] },
				{ x: section.path[1][1], y: section.path[1][2] },
				section.width / 2
			);
			const path: PathSegment[] = [
				['M', p0.x, p0.y],
				['L', p1.x, p1.y]
			];
			return {
				...section,
				path,
				svgPath: svgPathStringFromSegments(path)
			};
		} else if (
			section.path.length === 4 &&
			isMovePathSegment(section.path[0]) &&
			isLinePathSegment(section.path[1]) &&
			isLinePathSegment(section.path[2]) &&
			isLinePathSegment(section.path[3])
		) {
			const sec0 = shortenLine(
				{ x: section.path[0][1], y: section.path[0][2] },
				{ x: section.path[1][1], y: section.path[1][2] },
				section.width / 2
			);
			const sec1 = shortenLine(
				{ x: section.path[2][1], y: section.path[2][2] },
				{ x: section.path[3][1], y: section.path[3][2] },
				section.width / 2
			);
			const path: PathSegment[] = [
				['M', sec0.p0.x, sec0.p0.y],
				section.path[1],
				section.path[2],
				['L', sec1.p1.x, sec1.p1.y]
			];
			return { ...section, path, svgPath: svgPathStringFromSegments(path) };
		}
		return { ...section, svgPath: svgPathStringFromSegments(section.path) };
	});
	const outlineShape: DynamicPath = [
		{
			width: outline[0].width,
			path: [],
			svgPath: ''
		}
	];
	outline.forEach((dPath, i) => {
		if (i === 0) {
			outlineShape[0].path.push(...dPath.path);
		} else {
			outlineShape[0].path.push(...dPath.path.slice(1));
		}
		outlineShape[0].svgPath = svgPathStringFromSegments(outlineShape[0].path);
	});
	const midPoints: { point: Point; quadWidth: number }[] = [];
	quadBand.forEach((quad, i) => {
		if (i === 0) {
			midPoints.push({ point: getMidPoint(quad.p0, quad.p1), quadWidth: 0 });
		}
		midPoints.push({ point: getMidPoint(quad.p2, quad.p3), quadWidth: getQuadWidth(quad) });
	});
	const minQuadWidth = Math.min(...midPoints.map((mp) => mp.quadWidth));
	const maxQuadWidth = Math.max(...midPoints.map((mp) => mp.quadWidth));
	const midLine: DynamicPath = [];
	midPoints.forEach((facet, i, facets) => {
		if (i > 0) {
			midLine.push({
				path: [
					['M', facets[i - 1].point.x, facets[i - 1].point.y],
					['L', facet.point.x, facet.point.y]
				],
				width:
					((facet.quadWidth - minQuadWidth) / (maxQuadWidth - minQuadWidth)) * maxWidth + minWidth,
				svgPath: svgPathStringFromSegments([
					['M', facets[i - 1].point.x, facets[i - 1].point.y],
					['L', facet.point.x, facet.point.y]
				])
			});
		}
	});

	const branches = midLine.map((midlineSegment, i) => {
		const branch = { ...midlineSegment };
		branch.path = [
			branch.path[0],
			['L', quadBand[i].p3.x, quadBand[i].p3.y],
			branch.path[0],
			['L', quadBand[i].p2.x, quadBand[i].p2.y]
		];
		branch.svgPath = svgPathStringFromSegments(branch.path);
		branch.width = branch.width / 4;
		return branch;
	});

	return { outline: stubbyOutline, outlineShape, midLine, branches };
};

const shortenLine = (p0: Point, p1: Point, remove: number): { p0: Point; p1: Point } => {
	const lineLength = getLength(p0, p1);
	const newHalfLength = lineLength / 2 - remove;
	const mid = getMidPoint(p0, p1);

	if (lineLength <= remove * 2) {
		return { p0: mid, p1: mid };
	}
	const diff: Point = { x: p1.x - p0.x, y: p1.y - p0.y };
	// const dir = diff.x >= 0 && diff.y >= 0 ? 1 : -1;

	let shortened;

	if (diff.x === 0) {
		shortened = {
			p0: { x: mid.x, y: mid.y - newHalfLength },
			p1: { x: mid.x, y: mid.y + newHalfLength }
		};
	} else if (diff.y === 0) {
		shortened = {
			p0: { x: mid.x - newHalfLength, y: mid.y },
			p1: { x: mid.x - newHalfLength, y: mid.y }
		};
	} else {
		const yxRatio = diff.y / diff.x;
		const x = newHalfLength / Math.sqrt(1 + yxRatio ** 2);
		const newHalfDiff: Point = { x, y: x * yxRatio };

		shortened = {
			p0: { x: mid.x - newHalfDiff.x, y: mid.y - newHalfDiff.y },
			p1: { x: mid.x + newHalfDiff.x, y: mid.y + newHalfDiff.y }
		};
	}

	const originalDirection = getDirection(p0, p1);
	const shortenedDirection = getDirection(shortened.p0, shortened.p1);
	if (originalDirection !== shortenedDirection) {
		shortened = { p0: shortened.p1, p1: shortened.p0 };
	}

	return shortened;
	// a^2 + b^2 = c^2
	// a^2 + (a * ratio)^2 = c^2
	// a^2 + ratio^2 * a^2 = c^2
	// (1+ratio^2)^.5 * a = c
	// a = c / (1+ratio^2)^.5
	// b = a * ratio
};
