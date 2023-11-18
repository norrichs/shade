import type {
	ArcPathSegment,
	LinePathSegment,
	MovePathSegment,
	PathSegment,
	ReturnPathSegment
} from '$lib/cut-pattern/cut-pattern.types';
import type { Point } from '$lib/patterns/flower-of-life.types';
import { closestPoint, getLength } from './utils';
import { logger, type SVGLoggerDirectionalLine } from '../../components/svg-logger/logger';
import type { Band, Facet } from '$lib/generate-shape';
import type { Vector3 } from 'three';

export type Quadrilateral = {
	p0: Point;
	p1: Point;
	p2: Point;
	p3: Point;
};

export type QuadrilateralTransformMatrix = {
	u: Point;
	v: Point;
	w: Point;
};

export const getQuadrilateralTransformMatrix = (
	quad: Quadrilateral
): QuadrilateralTransformMatrix => {
	const u = addScaled(quad.p1, quad.p0, -1);
	const v = addScaled(quad.p3, quad.p0, -1);
	const sum = addScaled(u, v, 1);
	const normalizedP2 = addScaled(quad.p2, quad.p0, -1);
	const w = addScaled(normalizedP2, sum, -1);
	return { u, v, w };
};

// SVG path functions
export const svgQuad = (q: Quadrilateral) => {
	return `M ${q.p0.x} ${q.p0.y} L ${q.p1.x} ${q.p1.y} L ${q.p2.x} ${q.p2.y} L ${q.p3.x} ${q.p3.y} Z`;
};
export const svgLines = (points: Point[], isClosed = false) => {
	const path = `${points.reduce((acc, point, i) => {
		if (i > 0) {
			return acc.concat(`L ${point.x} ${point.y}`);
		} else {
			return `M ${point.x} ${point.y}`;
		}
	}, '')} ${isClosed ? 'Z' : ''}`;
	return path;
};

// Utils
export const addScaled = (p0: Point, p1: Point, scale: number) => {
	return { x: p0.x + scale * p1.x, y: p0.y + scale * p1.y };
};
export const multiply = (p0: Point, tx: QuadrilateralTransformMatrix): Point => {
	const { x, y } = p0;
	const { u, v, w } = tx;
	return {
		x: u.x * x + v.x * y + w.x * x * y,
		y: u.y * x + v.y * y + w.y * x * y
	};
};

export const transformShapeByQuadrilateralTransform = (
	shape: Point[],
	tx: QuadrilateralTransformMatrix,
	anchor: Point = { x: 0, y: 0 }
) => {
	let result = shape.map((p) => addScaled(p, shape[0], -1));
	result = result.map((p) => multiply(p, tx));
	result = result.map((p) => addScaled(p, anchor, 1));
	return result;
};

export const transformPointByQuadrilateralTransform = (
	p: Point,
	tx: QuadrilateralTransformMatrix,
	anchor: Point = { x: 0, y: 0 }
) => {
	// let result = addScaled(p, anchor, -1);
	let result = multiply(p, tx);
	result = addScaled(result, anchor, 1);
	return result;
};

export const svgTX = (tx: QuadrilateralTransformMatrix, anchor: Point) => {
	const seg1 = addScaled(anchor, tx.u, 1);
	const seg2 = addScaled(anchor, tx.v, 1);
	const sum = addScaled(anchor, addScaled(tx.u, tx.v, 1), 1);
	const end = addScaled(sum, tx.w, 1);
	return `
	M ${anchor.x} ${anchor.y}
	L ${seg1.x} ${seg1.y}
	M ${anchor.x} ${anchor.y}
	L ${seg2.x} ${seg2.y}
	M ${sum.x} ${sum.y}
	L ${end.x} ${end.y}
	`;
};
export const transformPatternByQuad = (pattern: HexPattern, quad: Quadrilateral): HexPattern => {
	const tx = getQuadrilateralTransformMatrix(quad);
	const p0 = { x: pattern[0][1] || 0, y: pattern[0][2] || 0 };
	const transformedSegments: HexPattern = pattern.map((segment) => {
		if (segment[0] === 'L' || segment[0] === 'M') {
			const newCoord = transformPointByQuadrilateralTransform(
				{ x: segment[1], y: segment[2] },
				tx,
				quad.p0
			);
			const mapped: MovePathSegment | LinePathSegment = [segment[0], newCoord.x, newCoord.y];
			return mapped;
		} else if (segment[0] === 'A') {
			const newCoord = transformPointByQuadrilateralTransform(
				{ x: segment[6] - p0.x, y: segment[7] - p0.y },
				tx,
				quad.p0
			);
			const mapped: ArcPathSegment = [...segment];
			mapped[6] = newCoord.x;
			mapped[7] = newCoord.y;
			return mapped;
		} else {
			return segment;
		}
	}) as HexPattern;
	return transformedSegments;
};

export const extractShapesFromMappedHexPatterns = (
	mappedPatterns: HexPattern[],
	containingQuads: Quadrilateral[]
) => {
	const shapes: { outline: PathSegment[]; holes: InsettablePolygon[] } = { outline: [], holes: [] };
	shapes.outline = getOutline(containingQuads);

	mappedPatterns.forEach((mp, i) => {
		const q = containingQuads[i];
		if (i === 0) {
			shapes.holes.push({
				perimeter: { isPerimeter: true, index: 0 },
				segments: [
					{ insettable: true, p0: pointFrom(mp[0]), p1: pointFrom(mp[1]) },
					{ insettable: false, p0: pointFrom(mp[1]), p1: { ...q.p0 } },
					{ insettable: false, p0: { ...q.p0 }, p1: pointFrom(mp[0]) }
				]
			});
			shapes.holes.push({
				perimeter: { isPerimeter: true, index: 1 },
				segments: [
					{ insettable: true, p0: pointFrom(mp[1]), p1: pointFrom(mp[2]) },
					{ insettable: true, p0: pointFrom(mp[2]), p1: pointFrom(mp[3]) },
					{ insettable: false, p0: pointFrom(mp[3]), p1: pointFrom(mp[1]) }
				]
			});
			shapes.holes.push({
				perimeter: { isPerimeter: true, index: 2 },
				segments: [
					{ insettable: true, p0: pointFrom(mp[3]), p1: pointFrom(mp[4]) },
					{ insettable: false, p0: pointFrom(mp[4]), p1: { ...q.p1 } },
					{ insettable: false, p0: { ...q.p1 }, p1: pointFrom(mp[3]) }
				]
			});
		} else if (i === mappedPatterns.length - 1) {
			shapes.holes.push({
				perimeter: { isPerimeter: true, index: 5 + i },
				segments: [
					{ insettable: false, p0: pointFrom(mp[17]), p1: { ...q.p3 } },
					{ insettable: false, p0: { ...q.p3 }, p1: pointFrom(mp[11]) },
					{ insettable: true, p0: pointFrom(mp[11]), p1: pointFrom(mp[12]) },
					{ insettable: true, p0: pointFrom(mp[12]), p1: pointFrom(mp[17]) }
				]
			});
			shapes.holes.push({
				perimeter: { isPerimeter: true, index: 4 + i },
				segments: [
					{ insettable: true, p0: pointFrom(mp[17]), p1: pointFrom(mp[12]) },
					{ insettable: true, p0: pointFrom(mp[12]), p1: pointFrom(mp[13]) },
					{ insettable: true, p0: pointFrom(mp[13]), p1: pointFrom(mp[14]) },
					{ insettable: true, p0: pointFrom(mp[14]), p1: pointFrom(mp[19]) },
					{ insettable: false, p0: pointFrom(mp[19]), p1: pointFrom(mp[17]) }
				]
			});
			shapes.holes.push({
				perimeter: { isPerimeter: true, index: 3 + i },
				segments: [
					{ insettable: true, p0: pointFrom(mp[14]), p1: pointFrom(mp[15]) },
					{ insettable: true, p0: pointFrom(mp[19]), p1: pointFrom(mp[14]) },
					{ insettable: false, p0: { ...q.p2 }, p1: pointFrom(mp[19]) },
					{ insettable: false, p0: pointFrom(mp[15]), p1: { ...q.p2 } }
				]
			});
		}
		if (i < mappedPatterns.length - 1) {
			shapes.holes.push({
				perimeter: { isPerimeter: true, index: mappedPatterns.length * 2 + 3 - i },
				segments: [
					{ insettable: true, p0: pointFrom(mp[11]), p1: pointFrom(mp[12]) },
					{ insettable: true, p0: pointFrom(mp[12]), p1: pointFrom(mp[17]) },
					{ insettable: true, p0: pointFrom(mp[17]), p1: pointFrom(mappedPatterns[i + 1][0]) },
					{ insettable: false, p0: pointFrom(mappedPatterns[i + 1][0]), p1: { ...q.p3 } },
					{ insettable: false, p0: { ...q.p3 }, p1: pointFrom(mp[11]) }
				]
			});
			shapes.holes.push({
				perimeter: { isPerimeter: false, index: -1 },
				segments: [
					{ insettable: true, p0: pointFrom(mp[12]), p1: pointFrom(mp[13]) },
					{ insettable: true, p0: pointFrom(mp[13]), p1: pointFrom(mp[14]) },
					{ insettable: true, p0: pointFrom(mp[14]), p1: pointFrom(mp[19]) },
					{ insettable: true, p0: pointFrom(mp[19]), p1: pointFrom(mappedPatterns[i + 1][2]) },
					{ insettable: true, p0: pointFrom(mappedPatterns[i + 1][2]), p1: pointFrom(mp[17]) },
					{ insettable: true, p0: pointFrom(mp[17]), p1: pointFrom(mp[12]) }
				]
			});

			shapes.holes.push({
				perimeter: { isPerimeter: true, index: 3 + i },
				segments: [
					{ insettable: true, p0: pointFrom(mp[14]), p1: pointFrom(mp[15]) },
					{ insettable: false, p0: pointFrom(mp[15]), p1: { ...q.p2 } },
					{ insettable: false, p0: { ...q.p2 }, p1: pointFrom(mappedPatterns[i + 1][4]) },
					{ insettable: true, p0: pointFrom(mappedPatterns[i + 1][4]), p1: pointFrom(mp[19]) },
					{ insettable: true, p0: pointFrom(mp[19]), p1: pointFrom(mp[14]) }
				]
			});
		}
		shapes.holes.push({
			perimeter: { isPerimeter: false, index: -1 },
			segments: [
				{ insettable: true, p0: pointFrom(mp[0]), p1: pointFrom(mp[1]) },
				{ insettable: true, p0: pointFrom(mp[1]), p1: pointFrom(mp[2]) },
				{ insettable: true, p0: pointFrom(mp[2]), p1: pointFrom(mp[13]) },
				{ insettable: true, p0: pointFrom(mp[13]), p1: pointFrom(mp[12]) },
				{ insettable: true, p0: pointFrom(mp[12]), p1: pointFrom(mp[11]) },
				{ insettable: true, p0: pointFrom(mp[11]), p1: pointFrom(mp[0]) }
			]
		});
		shapes.holes.push({
			perimeter: { isPerimeter: false, index: -1 },
			segments: [
				{ insettable: true, p0: pointFrom(mp[2]), p1: pointFrom(mp[3]) },
				{ insettable: true, p0: pointFrom(mp[3]), p1: pointFrom(mp[4]) },
				{ insettable: true, p0: pointFrom(mp[4]), p1: pointFrom(mp[15]) },
				{ insettable: true, p0: pointFrom(mp[15]), p1: pointFrom(mp[14]) },
				{ insettable: true, p0: pointFrom(mp[14]), p1: pointFrom(mp[13]) },
				{ insettable: true, p0: pointFrom(mp[13]), p1: pointFrom(mp[2]) }
			]
		});
	});
	return shapes;
};

export type HexPattern = [
	MovePathSegment,
	LinePathSegment,
	LinePathSegment,
	LinePathSegment,
	LinePathSegment,

	MovePathSegment,
	LinePathSegment,
	MovePathSegment,
	LinePathSegment,
	MovePathSegment,
	LinePathSegment,

	MovePathSegment,
	LinePathSegment,
	LinePathSegment,
	LinePathSegment,
	LinePathSegment,

	MovePathSegment,
	LinePathSegment,
	MovePathSegment,
	LinePathSegment
];

export const generateHexPattern = (size: number): HexPattern => {
	const unit = size / 3;
	const h = size / 4;
	const segments: HexPattern = [
		['M', 0, unit / 2],
		['L', h, 0],
		['L', 2 * h, unit / 2],
		['L', 3 * h, 0],
		['L', 4 * h, unit / 2],

		['M', 0, unit / 2],
		['L', 0, (3 * unit) / 2],

		['M', 2 * h, unit / 2],
		['L', 2 * h, (3 * unit) / 2],

		['M', 4 * h, unit / 2],
		['L', 4 * h, (3 * unit) / 2],

		['M', 0, (3 * unit) / 2],
		['L', h, 2 * unit],
		['L', 2 * h, (3 * unit) / 2],
		['L', 3 * h, 2 * unit],
		['L', 4 * h, (3 * unit) / 2],

		['M', h, 2 * unit],
		['L', h, 3 * unit],

		['M', 3 * h, 2 * unit],
		['L', 3 * h, 3 * unit]
	];
	return segments;
};

type InsettableSegment = {
	[key: string]: Point | boolean;
	p0: Point;
	p1: Point;
	insettable: boolean;
};
type Perimeter = { isPerimeter: boolean; index: number };

type InsettablePolygon = {
	perimeter: Perimeter;
	segments: InsettableSegment[];
};

export const pointFrom = (seg: PathSegment): Point => {
	if (seg[0] === 'M' || seg[0] === 'L') {
		return { x: seg[1], y: seg[2] };
	} else if (seg[0] === 'A') {
		return { x: seg[6], y: seg[7] };
	} else {
		return { x: 1000, y: 1000 };
	}
};

export const svgPathStringFromInsettablePolygon = (poly: InsettablePolygon) => {
	return poly.segments
		.map((seg, i) => {
			if (i === 0) {
				return `M ${seg.p0.x} ${seg.p0.y}`;
			}
			return `L ${seg.p0.x} ${seg.p0.y}`;
		})
		.join('')
		.concat(' Z');
};

export const getInsetPolygon = (poly: InsettablePolygon, inset = 10): InsettablePolygon => {
	const insetPoly: InsettablePolygon = {
		...poly,
		segments: poly.segments.map((seg, i, segs) => {
			let prev = segs[(segs.length + i - 1) % segs.length];
			let next = segs[(i + 1) % segs.length];
			const insetSeg = getOffsetLine(seg, prev, inset);
			prev = getOffsetLine(prev, seg, inset);
			next = getOffsetLine(next, seg, inset);

			const curr: InsettableSegment = {
				...seg,
				p0: getIntersectionOfLines(insetSeg, next),
				p1: getIntersectionOfLines(insetSeg, prev)
			};
			if (isNaN(curr.p0.x)) {
				console.error('-------------------NaN', seg, insetSeg, curr);
			}
			return curr;
		})
	};

	return insetPoly;
};

const getInsetLine = (
	segment: InsettableSegment | { p0: Point; p1: Point },
	insets: [number] | [number, number]
) => {
	const { p0, p1 } = segment;
	const l = getLength(p0, p1);
	const unit = { x: (p1.x - p0.x) / l, y: (p1.y - p0.y) / l };

	const i0 = insets[0];
	const i1 = insets.length === 2 ? insets[1] : insets[0];
	const newSegment = {
		...segment,
		p0: { x: p0.x + unit.x * i0, y: p0.y + unit.y * i0 },
		p1: { x: p1.x - unit.x * i1, y: p1.y - unit.y * i1 }
	};
	return newSegment;
};

const getOffsetLine = (
	segment: InsettableSegment,
	partner: InsettableSegment,
	insetWidth: number
): InsettableSegment => {
	const { p0, p1 } = segment;
	if (!segment.insettable) {
		return { ...segment, p0: { ...p0 }, p1: { ...p1 } };
	}
	const extraLinearPoint: Point = isSamePoint(p0, partner.p0)
		? partner.p1
		: isSamePoint(p0, partner.p1)
		? partner.p0
		: partner.p1;
	const m = getSlope(p0, p1);
	const b = p0.y - m * p0.x;

	const dX = p1.x - p0.x;
	const dY = p1.y - p0.y;
	const length = getLength(p0, p1);
	const offset = { x: (dY * insetWidth) / length, y: -(dX * insetWidth) / length };

	let direction: number;
	let extraLinearDirection: number;
	let offsetDirection: number;
	if (Number.isFinite(m)) {
		extraLinearDirection = extraLinearPoint.y > m * extraLinearPoint.x + b ? 1 : -1;
		const offsetPoint = addScaled(p0, offset, 1);
		offsetDirection = offsetPoint.y > m * offsetPoint.x + b ? 1 : -1;
		direction = offsetDirection * extraLinearDirection * (insetWidth >= 0 ? 1 : -1);
	} else {
		extraLinearDirection = extraLinearPoint.x > p0.x ? 1 : -1;
		offsetDirection = offset.x > p0.x ? 1 : -1;
		direction = offsetDirection * extraLinearDirection * (insetWidth >= 0 ? 1 : -1);
	}

	const result = {
		...segment,
		p0: addScaled(p0, offset, direction),
		p1: addScaled(p1, offset, direction)
	};
	return result;
};

const getSamePoint = (
	point: Point,
	poly: InsettablePolygon
): { segmentIndex: number; pointKey: string } | false => {
	let matching: { segmentIndex: number; pointKey: string } | false = false;
	poly.segments.forEach((seg, i) => {
		const match = isSamePoint(point, seg.p0) ? 'p0' : isSamePoint(point, seg.p1) ? 'p1' : '';
		if (match) {
			matching = { segmentIndex: i, pointKey: match };
		}
	});
	return matching;
};
const isSamePoint = (p0: Point, p1: Point, precision?: number) => {
	if (!precision) {
		return p0.x === p1.x && p0.y === p1.y;
	}
	return Math.abs(p0.x - p1.x) <= precision && Math.abs(p0.y - p1.y) <= precision;
};
const getSlope = (p0: Point, p1: Point) => {
	return (p1.y - p0.y) / (p1.x - p0.x);
};

const getIntersectionOfLines = (
	l1: { p0: Point; p1: Point },
	l2: { p0: Point; p1: Point }
): Point => {
	let b1, b2, x, y: number;

	const m1 = getSlope(l1.p0, l1.p1);
	const m2 = getSlope(l2.p0, l2.p1);
	if (m1 === m2) {
		throw new Error('lines are parallel, no intersection');
	} else if (!Number.isFinite(m1)) {
		x = l1.p1.x;
		b2 = l2.p1.y - m2 * l2.p1.x;
		y = m2 * x + b2;
	} else if (!Number.isFinite(m2)) {
		x = l2.p1.x;
		b1 = l1.p1.y - m1 * l1.p1.x;
		y = m1 * x + b1;
	} else {
		b1 = l1.p1.y - m1 * l1.p1.x;
		b2 = l2.p1.y - m2 * l2.p1.x;
		x = (b2 - b1) / (m1 - m2);
		y = m1 * x + b1;
	}
	if (!Number.isFinite(x) || !Number.isFinite(y)) {
		console.error('--------- Infinite', x, y, m1, m2, b1, b2);
	}
	return { x, y };
};

export const getQuadrilaterals = (band: Band): Quadrilateral[] => {
	const facets: Facet[] = band.facets;
	const quads: Quadrilateral[] = [];
	facets.forEach((facet, i) => {
		if (i % 2 === 1 && i < facets.length) {
			quads.push({
				p0: pointFromVector3(facets[i - 1].triangle.a),
				p1: pointFromVector3(facets[i - 1].triangle.b),
				p3: pointFromVector3(facets[i - 1].triangle.c),
				p2: pointFromVector3(facet.triangle.a)
			});
		}
	});
	return quads;
};

export const getOutline = (quads: Quadrilateral[]) => {
	const outline: PathSegment[] = [];
	for (let i = 0; i < quads.length; i++) {
		const q = quads[i];
		if (i === 0) {
			outline.push(['M', q.p0.x, q.p0.y], ['L', q.p3.x, q.p3.y]);
		} else {
			outline.push(['L', q.p3.x, q.p3.y]);
		}
	}
	for (let i = quads.length - 1; i >= 0; i--) {
		const q = quads[i];
		if (i === quads.length - 1) {
			outline.push(['L', q.p2.x, q.p2.y], ['L', q.p1.x, q.p1.y]);
		} else if (i === 0) {
			outline.push(['L', q.p1.x, q.p1.y], ['L', q.p0.x, q.p0.y]);
		} else {
			outline.push(['L', q.p1.x, q.p1.y]);
		}
	}
	outline.push(['Z']);
	return outline;
};

const pointFromVector3 = (p: Vector3) => {
	return { x: p.x, y: p.y };
};

// returns indices for the segment and the point of that segment
// in a polygon that match a given point.  If no point is given,
// returns the first found insettable segment point indices that matches
// one of the polygons non-insettable segment
const getMatchingSegmentIndices = (
	polygon: InsettablePolygon,
	matchPoint?: Point
): { segmentIndex: number; pointKey: 'p0' | 'p1' } => {
	if (!matchPoint && !polygon.segments.some((seg) => !seg.insettable)) {
		throw new Error('getMatchingSegmentIndices');
	}

	let pointKey: 'p0' | 'p1' = 'p0';
	const segmentIndex = polygon.segments.findIndex((segment, i, segments) => {
		// looking for a point on insettable segment
		if (!segment.insettable) {
			return false;
		}
		// that matches with one of the other segment points that are not insettable, if not matching a known point
		if (!matchPoint) {
			for (let j = 0; j < segments.length; j++) {
				if (i !== j && !segments[j].insettable) {
					if (
						isSamePoint(segment.p0, segments[j].p0, 0.0000000001) ||
						isSamePoint(segment.p0, segments[j].p1, 0.0000000001)
					) {
						// segment.p0 is starting point
						pointKey = 'p0';
						return true;
					} else if (
						isSamePoint(segment.p1, segments[j].p0, 0.0000000001) ||
						isSamePoint(segment.p1, segments[j].p1, 0.0000000001)
					) {
						// segment.p1 is starting point
						pointKey = 'p1';
						return true;
					}
				}
			}
		} else {
			// else, that matches a given point
			if (isSamePoint(matchPoint, segment.p0, 0.0000000001)) {
				pointKey = 'p0';
				return true;
			} else if (isSamePoint(matchPoint, segment.p1, 0.0000000001)) {
				pointKey = 'p1';
				return true;
			}
		}
	});
	return { segmentIndex, pointKey };
};

export const traceCombinedOutline = (
	holes: InsettablePolygon[],
	tabs?: { appendTab: boolean; direction: 'left' | 'right'; width: number; insetWidth: number },
	bandIndex?: number
) => {
	// Filter holes to only perimeter holes
	// Sort holes by index
	const perimeterHoles = holes
		.filter((polygon) => polygon.perimeter.isPerimeter)
		.sort((a, b) => a.perimeter.index - b.perimeter.index);

	if (perimeterHoles.length <= 0) {
		throw new Error('perimiterHoles is not valid, length: ' + perimeterHoles.length);
	}

	const traced: Point[] = [];

	const perimeterPoints = perimeterHoles.map((polygon) => {
		const points: Point[] = [];
		let { segmentIndex, pointKey } = getMatchingSegmentIndices(polygon);
		points.push(
			polygon.segments[segmentIndex][pointKey],
			polygon.segments[segmentIndex][pointKey === 'p0' ? 'p1' : 'p0']
		);
		polygon.segments.splice(segmentIndex, 1);
		({ segmentIndex, pointKey } = getMatchingSegmentIndices(polygon, points[1]));
		let counter = 0;
		while (
			segmentIndex >= 0 &&
			polygon.segments.length > 0 &&
			polygon.segments[segmentIndex].insettable &&
			counter < 10
		) {
			points.push(polygon.segments[segmentIndex][pointKey === 'p0' ? 'p1' : 'p0']);
			polygon.segments.splice(segmentIndex, 1);
			({ segmentIndex, pointKey } = getMatchingSegmentIndices(polygon, points[points.length - 1]));
			counter += 1;
		}
		return points;
	});
	const outlineIndices: number[] = [];
	let direction, nextDirection: boolean;
	perimeterPoints.forEach((current, i) => {
		if (i === 0 && i < perimeterPoints.length - 1) {
			const [thisEnd0, thisEnd1] = [current[0], current[current.length - 1]];
			const [nextEnd0, nextEnd1] = [
				perimeterPoints[i + 1][0],
				perimeterPoints[i + 1][perimeterPoints[i + 1].length - 1]
			];
			const closestThis = closestPoint(nextEnd0, [thisEnd0, thisEnd1]);
			const closestNext = closestPoint(closestThis, [nextEnd0, nextEnd1]);
			direction = !isSamePoint(thisEnd0, closestThis, 0.0000000001);
			nextDirection = isSamePoint(nextEnd0, closestNext, 0.0000000001);
			outlineIndices.push(0);
			if (direction) {
				traced.push(...current);
			} else {
				traced.push(...current.reverse());
			}
			outlineIndices.push(traced.length - 1);
		} else {
			direction = nextDirection;
			outlineIndices.push(traced.length);
			if (direction) {
				traced.push(...current);
			} else {
				traced.push(...current.reverse());
			}
			outlineIndices.push(traced.length - 1);
			if (i !== perimeterHoles.length - 1) {
				const [nextEnd0, nextEnd1] = [
					perimeterPoints[i + 1][0],
					perimeterPoints[i + 1][perimeterPoints[i + 1].length - 1]
				];
				const closestNext = closestPoint(traced[traced.length - 1], [nextEnd0, nextEnd1]);
				nextDirection = isSamePoint(nextEnd0, closestNext, 0.0000000001);
			}
		}
	});

	const outlineBandPoints = outlineIndices.map((index) => traced[index]);

	const retraced: Point[] = [];
	if (tabs?.appendTab) {
		const doLeftTab = true;
		const doRightTab = true
		const leftIndices = outlineIndices.slice(5, outlineBandPoints.length / 2 + 1);
		const leftPoints = outlineBandPoints.slice(5, outlineBandPoints.length / 2 + 1);
		const leftSegments: {
			index: number;
			segment: InsettableSegment;
			partner: InsettableSegment;
		}[] = [];
		for (let i = 0; i < leftPoints.length / 2; i++) {
			leftSegments.push({
				index: leftIndices[i * 2],
				segment: { insettable: true, p0: leftPoints[i * 2], p1: leftPoints[i * 2 + 1] },
				partner: {
					insettable: false,
					p0: traced[leftIndices[i * 2]],
					p1: traced[leftIndices[i * 2] - 1]
				}
			});
		}

		const leftOffsetSegments = leftSegments.map((seg) =>
			getInsetLine(getOffsetLine(seg.segment, seg.partner, -1 * tabs.width), [tabs.insetWidth])
		);


		const rightIndices = outlineIndices
			.slice(outlineBandPoints.length / 2 + 5)
			.concat(outlineIndices[0]);
		const rightPoints = outlineBandPoints
			.slice(outlineBandPoints.length / 2 + 5)
			.concat(outlineBandPoints[0]);
		const rightSegments: {
			index: number;
			segment: InsettableSegment;
			partner: InsettableSegment;
		}[] = [];
		for (let i = 0; i < rightPoints.length / 2; i++) {
			rightSegments.push({
				index: rightIndices[i * 2],
				segment: { insettable: true, p0: rightPoints[i * 2], p1: rightPoints[i * 2 + 1] },
				partner: {
					insettable: false,
					p0: traced[rightIndices[i * 2]],
					p1: traced[rightIndices[i * 2] - 1]
				}
			});
		}
		const rightOffsetSegments = rightSegments.map((seg) =>
			getInsetLine(getOffsetLine(seg.segment, seg.partner, -1 * tabs.width), [tabs.insetWidth])
		);


		let leftIndexCounter = 0;
		let rightIndexCounter = 0;
		traced.forEach((point, i) => {
			retraced.push(point);
			if (doLeftTab && i === leftIndices[leftIndexCounter * 2] && leftIndexCounter < leftOffsetSegments.length) {
				retraced.push(leftOffsetSegments[leftIndexCounter].p0, leftOffsetSegments[leftIndexCounter].p1);
				leftIndexCounter += 1;
			}
			if (doRightTab && i === rightIndices[rightIndexCounter * 2] && rightIndexCounter < rightOffsetSegments.length) {
				retraced.push(rightOffsetSegments[rightIndexCounter].p0, rightOffsetSegments[rightIndexCounter].p1);
				rightIndexCounter += 1;
			}
		});

		logger.update((prev) => {
			prev.debug.push(
				...leftSegments.map((seg) => {
					const dl: SVGLoggerDirectionalLine = {
						directionalLine: {
							points: [seg.segment.p0, seg.segment.p1],
							labels: [],
							label: `${Math.round(1000 * getLength(seg.segment.p0, seg.segment.p1)) / 1000}`,
							for: `patterned-band-pattern-${bandIndex}`
						}
					};
					return dl;
				}),
				...rightSegments.map((seg) => {
					const dl: SVGLoggerDirectionalLine = {
						directionalLine: {
							points: [seg.segment.p0, seg.segment.p1],
							labels: [],
							label: `${Math.round(1000 * getLength(seg.segment.p0, seg.segment.p1)) / 1000}`,
							for: `patterned-band-pattern-${bandIndex}`
						}
					};
					return dl;
				}),
				// ...leftOffsetSegments.map((seg) => {
				// 	return {
				// 		directionalLine: {
				// 			points: [seg.p0, seg.p1],
				// 			labels: [],
				// 			label: '',
				// 			for: `patterned-band-pattern-${bandIndex}`
				// 		}
				// 	};
				// })
			);
			return prev;
		});
	}


	
	const innerHoles = holes.filter((hole) => !hole.perimeter.isPerimeter);
	const tracedOutline: PathSegment[] = tabs?.appendTab
		? retraced.map((p, i) => {
				return [i === 0 ? 'M' : 'L', p.x, p.y] as MovePathSegment | LinePathSegment;
		  })
		: traced.map((p, i) => {
				return [i === 0 ? 'M' : 'L', p.x, p.y] as MovePathSegment | LinePathSegment;
		  });
	tracedOutline.push(['Z']);

	return { holes: innerHoles, outline: tracedOutline };
};
