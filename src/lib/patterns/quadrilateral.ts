import type {
	ArcPathSegment,
	BezierPathSegment,
	LinePathSegment,
	MovePathSegment,
	PathSegment
} from '$lib/cut-pattern/cut-pattern.types';
import type { Point } from '$lib/patterns/flower-of-life.types';
import { closestPoint, getLength } from './utils';
import { logger, type SVGLoggerDirectionalLine } from '../../components/svg-logger/logger';
import type { Band, Facet } from '$lib/generate-shape';
import type { Vector3 } from 'three';
import type { TiledPatternSubConfig } from '$lib/shades-config';
import { Shape, LineSegment, Point as PointShape } from './shapes';
import { CubicBezierSegment } from './shapes/CubicBezierSegment';

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
export const svgBeziers = (points: Point[], isClosed = false) => {
	const path = `${points.reduce((acc, point, i) => {
		if (i > 0 && i < points.length - 2) {
			return acc.concat(
				`C ${point.x} ${point.y} ${points[i + 1].x} ${points[i + 1].y} ${points[i + 2].x} ${
					points[i + 2].y
				}`
			);
		} else if (i === 0) {
			return `M ${point.x} ${point.y}`;
		} else {
			return acc.concat();
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
export const transformPatternByQuad = <T extends HexPattern | CarnationPattern>(
	pattern: T,
	quad: Quadrilateral
): T => {
	const tx = getQuadrilateralTransformMatrix(quad);
	const p0 = { x: pattern[0][1] || 0, y: pattern[0][2] || 0 };
	const transformedSegments: T = pattern.map((segment) => {
		if (segment[0] === 'L' || segment[0] === 'M') {
			const newCoord = transformPointByQuadrilateralTransform(
				{ x: segment[1], y: segment[2] },
				tx,
				quad.p0
			);
			const mapped: MovePathSegment | LinePathSegment = [segment[0], newCoord.x, newCoord.y];
			return mapped;
		} else if (segment[0] === 'C') {
			const newP0 = transformPointByQuadrilateralTransform(
				{ x: segment[1] - p0.x, y: segment[2] - p0.y },
				tx,
				quad.p0
			);
			const newP1 = transformPointByQuadrilateralTransform(
				{ x: segment[3] - p0.x, y: segment[4] - p0.y },
				tx,
				quad.p0
			);
			const newP2 = transformPointByQuadrilateralTransform(
				{ x: segment[5] - p0.x, y: segment[6] - p0.y },
				tx,
				quad.p0
			);
			const mapped: BezierPathSegment = ['C', newP0.x, newP0.y, newP1.x, newP1.y, newP2.x, newP2.y];
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
	}) as T;
	return transformedSegments;
};

// export const extractShapesFromMappedCarnationPatterns = (
// 	mappedPatterns: CarnationPattern[],
// 	containingQuads: Quadrilateral[],
// 	config: TiledPatternSubConfig[]
// ) => {
// 	const fillEnd = config.find((cfg) => cfg.type === 'filledEndSize')?.value as number;
// 	const shapes: { outline: PathSegment[]; holes: InsettablePolygon[] } = { outline: [], holes: [] };
// 	shapes.outline = getOutline(containingQuads);

// 	mappedPatterns.forEach((mp, i) => {
// 		const getInner = () => (i < fillEnd ? 'interior' : 'insettable');
// 		const getOuter = () => (i < fillEnd ? 'edge' : 'permeable');
// 		const q = containingQuads[i];
// 		if (i === 0) {
// 			shapes.holes.push({
// 				perimeter: { isPerimeter: true, index: 0 },
// 				segments: [
// 					{ variant: getInner(), p0: pointFrom(mp[0]), p1: pointFrom(mp[1]) },
// 					{ variant: getOuter(), p0: pointFrom(mp[1]), p1: { ...q.p0 } },
// 					{ variant: getOuter(), p0: { ...q.p0 }, p1: pointFrom(mp[0]) }
// 				]
// 			});
// 			shapes.holes.push({
// 				perimeter: { isPerimeter: true, index: 1 },
// 				segments: [
// 					{ variant: getInner(), p0: pointFrom(mp[1]), p1: pointFrom(mp[2]) },
// 					{ variant: getInner(), p0: pointFrom(mp[2]), p1: pointFrom(mp[3]) },
// 					{ variant: getOuter(), p0: pointFrom(mp[3]), p1: pointFrom(mp[1]) }
// 				]
// 			});
// 			shapes.holes.push({
// 				perimeter: { isPerimeter: true, index: 2 },
// 				segments: [
// 					{ variant: getInner(), p0: pointFrom(mp[3]), p1: pointFrom(mp[4]) },
// 					{ variant: getOuter(), p0: pointFrom(mp[4]), p1: { ...q.p1 } },
// 					{ variant: getOuter(), p0: { ...q.p1 }, p1: pointFrom(mp[3]) }
// 				]
// 			});
// 		} else if (i === mappedPatterns.length - 1) {
// 			shapes.holes.push({
// 				perimeter: { isPerimeter: true, index: 5 + i },
// 				segments: [
// 					{ variant: getOuter(), p0: pointFrom(mp[17]), p1: { ...q.p3 } },
// 					{ variant: getOuter(), p0: { ...q.p3 }, p1: pointFrom(mp[11]) },
// 					{ variant: getInner(), p0: pointFrom(mp[11]), p1: pointFrom(mp[12]) },
// 					{ variant: getInner(), p0: pointFrom(mp[12]), p1: pointFrom(mp[17]) }
// 				]
// 			});
// 			shapes.holes.push({
// 				perimeter: { isPerimeter: true, index: 4 + i },
// 				segments: [
// 					{ variant: getInner(), p0: pointFrom(mp[17]), p1: pointFrom(mp[12]) },
// 					{ variant: getInner(), p0: pointFrom(mp[12]), p1: pointFrom(mp[13]) },
// 					{ variant: getInner(), p0: pointFrom(mp[13]), p1: pointFrom(mp[14]) },
// 					{ variant: getInner(), p0: pointFrom(mp[14]), p1: pointFrom(mp[19]) },
// 					{ variant: getOuter(), p0: pointFrom(mp[19]), p1: pointFrom(mp[17]) }
// 				]
// 			});
// 			shapes.holes.push({
// 				perimeter: { isPerimeter: true, index: 3 + i },
// 				segments: [
// 					{ variant: getInner(), p0: pointFrom(mp[14]), p1: pointFrom(mp[15]) },
// 					{ variant: getInner(), p0: pointFrom(mp[19]), p1: pointFrom(mp[14]) },
// 					{ variant: getOuter(), p0: { ...q.p2 }, p1: pointFrom(mp[19]) },
// 					{ variant: getOuter(), p0: pointFrom(mp[15]), p1: { ...q.p2 } }
// 				]
// 			});
// 		}
// 		if (i < mappedPatterns.length - 1) {
// 			shapes.holes.push({
// 				perimeter: { isPerimeter: true, index: mappedPatterns.length * 2 + 3 - i },
// 				segments: [
// 					{ variant: getInner(), p0: pointFrom(mp[11]), p1: pointFrom(mp[12]) },
// 					{ variant: getInner(), p0: pointFrom(mp[12]), p1: pointFrom(mp[17]) },
// 					{ variant: getInner(), p0: pointFrom(mp[17]), p1: pointFrom(mappedPatterns[i + 1][0]) },
// 					{ variant: getOuter(), p0: pointFrom(mappedPatterns[i + 1][0]), p1: { ...q.p3 } },
// 					{ variant: getOuter(), p0: { ...q.p3 }, p1: pointFrom(mp[11]) }
// 				]
// 			});
// 			shapes.holes.push({
// 				perimeter: { isPerimeter: false, index: -1 },
// 				segments: [
// 					{ variant: getInner(), p0: pointFrom(mp[12]), p1: pointFrom(mp[13]) },
// 					{ variant: getInner(), p0: pointFrom(mp[13]), p1: pointFrom(mp[14]) },
// 					{ variant: getInner(), p0: pointFrom(mp[14]), p1: pointFrom(mp[19]) },
// 					{ variant: getInner(), p0: pointFrom(mp[19]), p1: pointFrom(mappedPatterns[i + 1][2]) },
// 					{ variant: getInner(), p0: pointFrom(mappedPatterns[i + 1][2]), p1: pointFrom(mp[17]) },
// 					{ variant: getInner(), p0: pointFrom(mp[17]), p1: pointFrom(mp[12]) }
// 				]
// 			});

// 			shapes.holes.push({
// 				perimeter: { isPerimeter: true, index: 3 + i },
// 				segments: [
// 					{ variant: getInner(), p0: pointFrom(mp[14]), p1: pointFrom(mp[15]) },
// 					{ variant: getOuter(), p0: pointFrom(mp[15]), p1: { ...q.p2 } },
// 					{ variant: getOuter(), p0: { ...q.p2 }, p1: pointFrom(mappedPatterns[i + 1][4]) },
// 					{ variant: getInner(), p0: pointFrom(mappedPatterns[i + 1][4]), p1: pointFrom(mp[19]) },
// 					{ variant: getInner(), p0: pointFrom(mp[19]), p1: pointFrom(mp[14]) }
// 				]
// 			});
// 		}
// 		shapes.holes.push({
// 			perimeter: { isPerimeter: false, index: -1 },
// 			segments: [
// 				{ variant: getInner(), p0: pointFrom(mp[0]), p1: pointFrom(mp[1]) },
// 				{ variant: getInner(), p0: pointFrom(mp[1]), p1: pointFrom(mp[2]) },
// 				{ variant: getInner(), p0: pointFrom(mp[2]), p1: pointFrom(mp[13]) },
// 				{ variant: getInner(), p0: pointFrom(mp[13]), p1: pointFrom(mp[12]) },
// 				{ variant: getInner(), p0: pointFrom(mp[12]), p1: pointFrom(mp[11]) },
// 				{ variant: getInner(), p0: pointFrom(mp[11]), p1: pointFrom(mp[0]) }
// 			]
// 		});
// 		shapes.holes.push({
// 			perimeter: { isPerimeter: false, index: -1 },
// 			segments: [
// 				{ variant: getInner(), p0: pointFrom(mp[2]), p1: pointFrom(mp[3]) },
// 				{ variant: getInner(), p0: pointFrom(mp[3]), p1: pointFrom(mp[4]) },
// 				{ variant: getInner(), p0: pointFrom(mp[4]), p1: pointFrom(mp[15]) },
// 				{ variant: getInner(), p0: pointFrom(mp[15]), p1: pointFrom(mp[14]) },
// 				{ variant: getInner(), p0: pointFrom(mp[14]), p1: pointFrom(mp[13]) },
// 				{ variant: getInner(), p0: pointFrom(mp[13]), p1: pointFrom(mp[2]) }
// 			]
// 		});
// 	});
// 	return shapes;
// };

export const extractShapesFromMappedCarnationPatterns = (
	mappedPatterns: CarnationPattern[],
	containingQuads: Quadrilateral[],
	config?: TiledPatternSubConfig[]
) => {
	const shapes: Shape[] = [];

	mappedPatterns.forEach((q, i) => {
		if (i === 0) {
			shapes.push(
				new Shape({
					isPermeable: false,
					segments: [
						new LineSegment([q[0][1], q[0][2], q[2][5], q[2][6]], false, true),
						new CubicBezierSegment(
							[q[2][5], q[2][6], q[2][3], q[2][4], q[2][1], q[2][2], q[1][5], q[1][6]],
							false,
							false
						),
						new CubicBezierSegment(
							[q[1][5], q[1][6], q[1][3], q[1][4], q[1][1], q[1][2], q[0][1], q[0][2]],
							false,
							false
						)
					]
				}),
				new Shape({
					isPermeable: false,
					segments: [
						new LineSegment([q[2][5], q[2][6], q[4][5], q[4][6]], false, true),
						new CubicBezierSegment(
							[q[4][5], q[4][6], q[4][3], q[4][4], q[4][1], q[4][2], q[3][5], q[3][6]],
							false,
							false
						),
						new CubicBezierSegment(
							[q[3][5], q[3][6], q[3][3], q[3][4], q[3][1], q[3][2], q[2][5], q[2][6]],
							false,
							false
						)
					]
				})
			);
		} else if (i === mappedPatterns.length - 1) {
			shapes.push(
				new Shape({
					isPermeable: true,
					segments: [
						new CubicBezierSegment(
							[q[6][5], q[6][6], q[7][1], q[7][2], q[7][3], q[7][4], q[7][5], q[7][6]],
							false,
							false
						),
						new LineSegment([q[7][5], q[7][6], q[5][1], q[5][2]], true, true),
						new CubicBezierSegment(
							[q[5][1], q[5][2], q[6][1], q[6][2], q[6][3], q[6][4], q[6][5], q[6][6]],
							false,
							false
						)
					]
				}),
				new Shape({
					isPermeable: true,
					segments: [
						new CubicBezierSegment(
							[q[8][5], q[8][6], q[9][1], q[9][2], q[9][3], q[9][4], q[9][5], q[9][6]],
							false,
							false
						),
						new LineSegment([q[9][5], q[9][6], q[7][5], q[7][6]], true, true),
						new CubicBezierSegment(
							[q[7][5], q[7][6], q[8][1], q[8][2], q[8][3], q[8][4], q[8][5], q[8][6]],
							false,
							false
						)
					]
				})
			);
		}
		if (i > 0) {
			const pQ = mappedPatterns[i - 1];
			shapes.push(
				new Shape({
					isPermeable: false,
					segments: [
						new CubicBezierSegment(
							[pQ[5][1], pQ[5][2], pQ[6][1], pQ[6][2], pQ[6][3], pQ[6][4], pQ[6][5], pQ[6][6]],
							false,
							false
						),
						new CubicBezierSegment(
							[pQ[6][5], pQ[6][6], pQ[7][1], pQ[7][2], pQ[7][3], pQ[7][4], pQ[7][5], pQ[7][6]],
							false,
							false
						),
						new CubicBezierSegment(
							[q[2][5], q[2][6], q[2][3], q[2][4], q[2][1], q[2][2], q[1][5], q[1][6]],
							false,
							false
						),
						new CubicBezierSegment(
							[q[1][5], q[1][6], q[1][3], q[1][4], q[1][1], q[1][2], q[0][1], q[0][2]],
							false,
							false
						)
					]
				}),
				new Shape({
					isPermeable: false,
					segments: [
						new CubicBezierSegment(
							[pQ[7][5], pQ[7][6], pQ[8][1], pQ[8][2], pQ[8][3], pQ[8][4], pQ[8][5], pQ[8][6]],
							false,
							false
						),
						new CubicBezierSegment(
							[pQ[8][5], pQ[8][6], pQ[9][1], pQ[9][2], pQ[9][3], pQ[9][4], pQ[9][5], pQ[9][6]],
							false,
							false
						),
						new CubicBezierSegment(
							[q[4][5], q[4][6], q[4][3], q[4][4], q[4][1], q[4][2], q[3][5], q[3][6]],
							false,
							false
						),
						new CubicBezierSegment(
							[q[3][5], q[3][6], q[3][3], q[3][4], q[3][1], q[3][2], q[2][5], q[2][6]],
							false,
							false
						)
					]
				})
			);
		}
		shapes.push(
			new Shape({
				isPermeable: false,
				segments: [
					new CubicBezierSegment(
						[q[1][5], q[1][6], q[2][1], q[2][2], q[2][3], q[2][4], q[2][5], q[2][6]],
						false,
						false
					),
					new CubicBezierSegment(
						[q[2][5], q[2][6], q[3][1], q[3][2], q[3][3], q[3][4], q[3][5], q[3][6]],
						false,
						false
					),
					new CubicBezierSegment(
						[q[8][5], q[8][6], q[8][3], q[8][4], q[8][1], q[8][2], q[7][5], q[7][6]],
						false,
						false
					),
					new CubicBezierSegment(
						[q[7][5], q[7][6], q[7][3], q[7][4], q[7][1], q[7][2], q[6][5], q[6][6]],
						false,
						false
					)
				]
			}),

			new Shape({
				isPermeable: true,
				segments: [
					new CubicBezierSegment(
						[q[0][1], q[0][2], q[1][1], q[1][2], q[1][3], q[1][4], q[1][5], q[1][6]],
						false,
						false
					),
					new CubicBezierSegment(
						[q[6][5], q[6][6], q[6][3], q[6][4], q[6][1], q[6][2], q[5][1], q[5][2]],
						false,
						false
					),
					new LineSegment([q[5][1], q[5][2], q[0][1], q[0][2]], false, true)
				]
			}),
			new Shape({
				isPermeable: true,
				segments: [
					new CubicBezierSegment(
						[q[3][5], q[3][6], q[4][1], q[4][2], q[4][3], q[4][4], q[4][5], q[4][6]],
						false,
						false
					),
					new LineSegment([q[4][5], q[4][6], q[9][5], q[9][6]], false, true),
					new CubicBezierSegment(
						[q[9][5], q[9][6], q[9][3], q[9][4], q[9][1], q[9][2], q[3][5], q[3][6]],
						false,
						false
					)
				]
			})
		);
	});

	console.debug('shapes', shapes);
	// shapes.map((shape) => shape.offsetShape(-10));
	return shapes;
};

export const extractShapesFromMappedHexPatterns = (
	mappedPatterns: HexPattern[],
	containingQuads: Quadrilateral[],
	config: TiledPatternSubConfig[]
) => {
	const fillEnd = config.find((cfg) => cfg.type === 'filledEndSize')?.value as number;
	const shapes: { outline: PathSegment[]; holes: InsettablePolygon[] } = { outline: [], holes: [] };
	shapes.outline = getOutline(containingQuads);

	mappedPatterns.forEach((mp, i) => {
		const getInner = () => (i < fillEnd ? 'interior' : 'insettable');
		const getOuter = () => (i < fillEnd ? 'edge' : 'permeable');
		const q = containingQuads[i];
		if (i === 0) {
			shapes.holes.push({
				perimeter: { isPerimeter: true, index: 0 },
				segments: [
					{ variant: getInner(), p0: pointFrom(mp[0]), p1: pointFrom(mp[1]) },
					{ variant: getOuter(), p0: pointFrom(mp[1]), p1: { ...q.p0 } },
					{ variant: getOuter(), p0: { ...q.p0 }, p1: pointFrom(mp[0]) }
				]
			});
			shapes.holes.push({
				perimeter: { isPerimeter: true, index: 1 },
				segments: [
					{ variant: getInner(), p0: pointFrom(mp[1]), p1: pointFrom(mp[2]) },
					{ variant: getInner(), p0: pointFrom(mp[2]), p1: pointFrom(mp[3]) },
					{ variant: getOuter(), p0: pointFrom(mp[3]), p1: pointFrom(mp[1]) }
				]
			});
			shapes.holes.push({
				perimeter: { isPerimeter: true, index: 2 },
				segments: [
					{ variant: getInner(), p0: pointFrom(mp[3]), p1: pointFrom(mp[4]) },
					{ variant: getOuter(), p0: pointFrom(mp[4]), p1: { ...q.p1 } },
					{ variant: getOuter(), p0: { ...q.p1 }, p1: pointFrom(mp[3]) }
				]
			});
		} else if (i === mappedPatterns.length - 1) {
			shapes.holes.push({
				perimeter: { isPerimeter: true, index: 5 + i },
				segments: [
					{ variant: getOuter(), p0: pointFrom(mp[17]), p1: { ...q.p3 } },
					{ variant: getOuter(), p0: { ...q.p3 }, p1: pointFrom(mp[11]) },
					{ variant: getInner(), p0: pointFrom(mp[11]), p1: pointFrom(mp[12]) },
					{ variant: getInner(), p0: pointFrom(mp[12]), p1: pointFrom(mp[17]) }
				]
			});
			shapes.holes.push({
				perimeter: { isPerimeter: true, index: 4 + i },
				segments: [
					{ variant: getInner(), p0: pointFrom(mp[17]), p1: pointFrom(mp[12]) },
					{ variant: getInner(), p0: pointFrom(mp[12]), p1: pointFrom(mp[13]) },
					{ variant: getInner(), p0: pointFrom(mp[13]), p1: pointFrom(mp[14]) },
					{ variant: getInner(), p0: pointFrom(mp[14]), p1: pointFrom(mp[19]) },
					{ variant: getOuter(), p0: pointFrom(mp[19]), p1: pointFrom(mp[17]) }
				]
			});
			shapes.holes.push({
				perimeter: { isPerimeter: true, index: 3 + i },
				segments: [
					{ variant: getInner(), p0: pointFrom(mp[14]), p1: pointFrom(mp[15]) },
					{ variant: getInner(), p0: pointFrom(mp[19]), p1: pointFrom(mp[14]) },
					{ variant: getOuter(), p0: { ...q.p2 }, p1: pointFrom(mp[19]) },
					{ variant: getOuter(), p0: pointFrom(mp[15]), p1: { ...q.p2 } }
				]
			});
		}
		if (i < mappedPatterns.length - 1) {
			shapes.holes.push({
				perimeter: { isPerimeter: true, index: mappedPatterns.length * 2 + 3 - i },
				segments: [
					{ variant: getInner(), p0: pointFrom(mp[11]), p1: pointFrom(mp[12]) },
					{ variant: getInner(), p0: pointFrom(mp[12]), p1: pointFrom(mp[17]) },
					{ variant: getInner(), p0: pointFrom(mp[17]), p1: pointFrom(mappedPatterns[i + 1][0]) },
					{ variant: getOuter(), p0: pointFrom(mappedPatterns[i + 1][0]), p1: { ...q.p3 } },
					{ variant: getOuter(), p0: { ...q.p3 }, p1: pointFrom(mp[11]) }
				]
			});
			shapes.holes.push({
				perimeter: { isPerimeter: false, index: -1 },
				segments: [
					{ variant: getInner(), p0: pointFrom(mp[12]), p1: pointFrom(mp[13]) },
					{ variant: getInner(), p0: pointFrom(mp[13]), p1: pointFrom(mp[14]) },
					{ variant: getInner(), p0: pointFrom(mp[14]), p1: pointFrom(mp[19]) },
					{ variant: getInner(), p0: pointFrom(mp[19]), p1: pointFrom(mappedPatterns[i + 1][2]) },
					{ variant: getInner(), p0: pointFrom(mappedPatterns[i + 1][2]), p1: pointFrom(mp[17]) },
					{ variant: getInner(), p0: pointFrom(mp[17]), p1: pointFrom(mp[12]) }
				]
			});

			shapes.holes.push({
				perimeter: { isPerimeter: true, index: 3 + i },
				segments: [
					{ variant: getInner(), p0: pointFrom(mp[14]), p1: pointFrom(mp[15]) },
					{ variant: getOuter(), p0: pointFrom(mp[15]), p1: { ...q.p2 } },
					{ variant: getOuter(), p0: { ...q.p2 }, p1: pointFrom(mappedPatterns[i + 1][4]) },
					{ variant: getInner(), p0: pointFrom(mappedPatterns[i + 1][4]), p1: pointFrom(mp[19]) },
					{ variant: getInner(), p0: pointFrom(mp[19]), p1: pointFrom(mp[14]) }
				]
			});
		}
		shapes.holes.push({
			perimeter: { isPerimeter: false, index: -1 },
			segments: [
				{ variant: getInner(), p0: pointFrom(mp[0]), p1: pointFrom(mp[1]) },
				{ variant: getInner(), p0: pointFrom(mp[1]), p1: pointFrom(mp[2]) },
				{ variant: getInner(), p0: pointFrom(mp[2]), p1: pointFrom(mp[13]) },
				{ variant: getInner(), p0: pointFrom(mp[13]), p1: pointFrom(mp[12]) },
				{ variant: getInner(), p0: pointFrom(mp[12]), p1: pointFrom(mp[11]) },
				{ variant: getInner(), p0: pointFrom(mp[11]), p1: pointFrom(mp[0]) }
			]
		});
		shapes.holes.push({
			perimeter: { isPerimeter: false, index: -1 },
			segments: [
				{ variant: getInner(), p0: pointFrom(mp[2]), p1: pointFrom(mp[3]) },
				{ variant: getInner(), p0: pointFrom(mp[3]), p1: pointFrom(mp[4]) },
				{ variant: getInner(), p0: pointFrom(mp[4]), p1: pointFrom(mp[15]) },
				{ variant: getInner(), p0: pointFrom(mp[15]), p1: pointFrom(mp[14]) },
				{ variant: getInner(), p0: pointFrom(mp[14]), p1: pointFrom(mp[13]) },
				{ variant: getInner(), p0: pointFrom(mp[13]), p1: pointFrom(mp[2]) }
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

export type CarnationPattern = [
	MovePathSegment,
	BezierPathSegment,
	BezierPathSegment,
	BezierPathSegment,
	BezierPathSegment,
	MovePathSegment,
	BezierPathSegment,
	BezierPathSegment,
	BezierPathSegment,
	BezierPathSegment
];

export const generateCarnationPattern = (size?: number, strength?: number): CarnationPattern => {
	const w = (size || 1) / 4;
	const h = (size || 1) / 2;
	const s = !!strength && strength > 0 && strength < 1 ? strength : 0.5;

	return [
		['M', 0, 0],
		['C', 0, h * s, w - w * s, h, w, h],
		['C', w + w * s, h, 2 * w, h * s, 2 * w, 0],
		['C', 2 * w, h * s, 3 * w - w * s, h, 3 * w, h],
		['C', 3 * w + w * s, h, 4 * w, h * s, 4 * w, 0],
		['M', 0, 2 * h],
		['C', w * s, h + h, w, h + h * s, w, h],
		['C', w, h + h * s, 2 * w - w * s, h + h, 2 * w, 2 * h],
		['C', 2 * w + w * s, 2 * h, 3 * w, h + h * s, 3 * w, h],
		['C', 3 * w, h + h * s, 4 * w - w * s, 2 * h, 4 * w, 2 * h]
	];
};

type SegmentVariant = 'insettable' | 'permeable' | 'edge' | 'interior';
type InsettableSegment = {
	[key: string]: Point | SegmentVariant;
	p0: Point;
	p1: Point;
	variant: SegmentVariant;
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
	if (segment.variant === 'permeable') {
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

export const getIntersectionOfLines = (
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
	if (
		!matchPoint &&
		!polygon.segments.some((seg) => seg.variant === 'permeable' || seg.variant === 'edge')
	) {
		throw new Error('getMatchingSegmentIndices');
	}

	let pointKey: 'p0' | 'p1' = 'p0';
	const segmentIndex = polygon.segments.findIndex((segment, i, segments) => {
		// looking for a point on insettable segment or interior, if the polygon is static
		if (segment.variant === 'permeable' || segment.variant === 'interior') {
			return false;
		}
		// that matches with one of the other segment points that are not insettable, if not matching a known point
		if (!matchPoint) {
			for (let j = 0; j < segments.length; j++) {
				if (
					(i !== j && segments[j].variant === 'permeable') ||
					segments[j].variant === 'interior'
				) {
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
	tabs?: {
		appendTab: 'left' | 'right' | 'both' | false;
		width: number;
		insetWidth: number;
		tabVariant: 'extend' | 'inset' | false;
	},
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
			polygon.segments[segmentIndex].variant === 'insettable' &&
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
	if (tabs) {
		const doLeftTab = tabs.appendTab === 'both' || tabs.appendTab === 'left';
		const doRightTab = tabs.appendTab === 'both' || tabs.appendTab === 'right';

		const left = getTabStuff(outlineIndices, outlineBandPoints, traced, 'left', tabs);

		const right = getTabStuff(outlineIndices, outlineBandPoints, traced, 'right', tabs);

		let leftIndexCounter = 0;
		let rightIndexCounter = 0;
		traced.forEach((point, i) => {
			retraced.push(point);
			if (
				doLeftTab &&
				i === left.indices[leftIndexCounter * 2] &&
				leftIndexCounter < left.offsetSegments.length
			) {
				retraced.push(
					left.offsetSegments[leftIndexCounter].p0,
					left.offsetSegments[leftIndexCounter].p1
				);
				leftIndexCounter += 1;
			}
			if (
				doRightTab &&
				i === right.indices[rightIndexCounter * 2] &&
				rightIndexCounter < right.offsetSegments.length
			) {
				retraced.push(
					right.offsetSegments[rightIndexCounter].p0,
					right.offsetSegments[rightIndexCounter].p1
				);
				rightIndexCounter += 1;
			}
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

const getTabStuff = (
	outlineIndices: number[],
	outlinePoints: Point[],
	traced: Point[],
	direction: 'left' | 'right',
	tabs: any
) => {
	const { width, insetWidth, tabVariant } = tabs;

	const indices =
		direction === 'left'
			? outlineIndices.slice(5, outlinePoints.length / 2 + 1)
			: outlineIndices.slice(outlinePoints.length / 2 + 5).concat(outlineIndices[0]);
	const points =
		direction === 'left'
			? outlinePoints.slice(5, outlinePoints.length / 2 + 1)
			: outlinePoints.slice(outlinePoints.length / 2 + 5).concat(outlinePoints[0]);
	const segments: {
		index: number;
		segment: InsettableSegment;
		partner0: InsettableSegment;
		partner1: InsettableSegment;
	}[] = [];

	for (let i = 0; i < points.length / 2; i++) {
		segments.push({
			index: indices[i * 2],
			segment: { variant: 'insettable', p0: points[i * 2], p1: points[i * 2 + 1] },
			partner0: {
				variant: 'permeable',
				p0: traced[indices[i * 2]],
				p1: traced[indices[i * 2] - 1]
			},
			partner1: {
				variant: 'permeable',
				p0: traced[(indices[i * 2] + 1) % traced.length],
				p1: traced[(indices[i * 2] + 2) % traced.length]
			}
		});
	}

	const offsetSegments = segments.map((seg) => {
		const offsetSegment = getOffsetLine(seg.segment, seg.partner0, -1 * width);
		if (tabVariant === 'inset') {
			return getInsetLine(offsetSegment, [insetWidth]);
		}
		return {
			...offsetSegment,
			p0: getIntersectionOfLines(
				{ p0: offsetSegment.p0, p1: offsetSegment.p1 },
				{ p0: seg.partner0.p0, p1: seg.partner0.p1 }
			),
			p1: getIntersectionOfLines(
				{ p0: offsetSegment.p0, p1: offsetSegment.p1 },
				{ p0: seg.partner1.p0, p1: seg.partner1.p1 }
			)
		};
	});

	return { indices, offsetSegments };
};
