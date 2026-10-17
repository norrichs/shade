import {
	type Point,
	type LinePathSegment,
	type MovePathSegment,
	type PathSegment,
	type Band,
	type Facet,
	type Quadrilateral,
	type QuadrilateralTransformMatrix,
	isMovePathSegment,
	isLinePathSegment,
	isQuadraticBezierPathSegment,
	isCubicBezierPathSegment
} from '#lib/types.js';
import type { Vector3 } from 'three';

export const getQuadrilateralTransformMatrix = (
	quad: Quadrilateral
): QuadrilateralTransformMatrix => {
	const u = quad.b.clone().sub(quad.a);
	const v = quad.d.clone().sub(quad.a);
	const sum = u.clone().add(v);
	const normalizedP2 = quad.c.clone().sub(quad.a);
	const w = normalizedP2.clone().sub(sum);
	return { u, v, w };
};

// SVG path functions
export const svgQuad = (q: Quadrilateral) => {
	return `M ${q.a.x} ${q.a.y} L ${q.b.x} ${q.b.y} L ${q.c.x} ${q.c.y} L ${q.d.x} ${q.d.y} Z`;
};
export const svgTriangle = (t: { a: Point; b: Point; c: Point }) =>
	`M ${t.a.x} ${t.a.y} L ${t.b.x} ${t.b.y} L ${t.c.x} ${t.c.y} z`;

// Utils
const addScaled = (p0: Point, p1: Point, scale: number) => {
	return { x: p0.x + scale * p1.x, y: p0.y + scale * p1.y };
};
const multiply = (p0: Point, tx: QuadrilateralTransformMatrix): Point => {
	const { x, y } = p0;
	const { u, v, w } = tx;
	return {
		x: u.x * x + v.x * y + w.x * x * y,
		y: u.y * x + v.y * y + w.y * x * y
	};
};

export const transformPointByQuadrilateralTransform = (
	p: Point,
	tx: QuadrilateralTransformMatrix,
	anchor: Point | Vector3 = { x: 0, y: 0 }
) => {
	// let result = addScaled(p, anchor, -1);
	let result = multiply(p, tx);
	result = addScaled(result, { x: anchor.x, y: anchor.y }, 1);
	return result;
};

export const transformPatternByQuad = (
	pattern: PathSegment[],
	quad: Quadrilateral
): PathSegment[] => {
	const tx = getQuadrilateralTransformMatrix(quad);
	// const p0 = { x: pattern[0][1] || 0, y: pattern[0][2] || 0 };
	const transformedSegments: PathSegment[] = pattern.map((segment) => {
		if (isMovePathSegment(segment) || isLinePathSegment(segment)) {
			const newCoord = transformPointByQuadrilateralTransform(
				{ x: segment[1], y: segment[2] },
				tx,
				quad.a
			);
			const mapped: MovePathSegment | LinePathSegment = [segment[0], newCoord.x, newCoord.y];
			return mapped;
		} else if (isQuadraticBezierPathSegment(segment)) {
			const { x: x0, y: y0 } = transformPointByQuadrilateralTransform(
				{ x: segment[1], y: segment[2] },
				tx,
				quad.a
			);
			const { x: x1, y: y1 } = transformPointByQuadrilateralTransform(
				{ x: segment[3], y: segment[4] },
				tx,
				quad.a
			);
			return ['Q', x0, y0, x1, y1];
		} else if (isCubicBezierPathSegment(segment)) {
			const { x: x0, y: y0 } = transformPointByQuadrilateralTransform(
				{ x: segment[1], y: segment[2] },
				tx,
				quad.a
			);
			const { x: x1, y: y1 } = transformPointByQuadrilateralTransform(
				{ x: segment[3], y: segment[4] },
				tx,
				quad.a
			);
			const { x: x2, y: y2 } = transformPointByQuadrilateralTransform(
				{ x: segment[5], y: segment[6] },
				tx,
				quad.a
			);
			return ['C', x0, y0, x1, y1, x2, y2];
		} else {
			return segment;
		}
	});
	return transformedSegments;
};

// const getSamePoint = (
// 	point: Point,
// 	poly: InsettablePolygon
// ): { segmentIndex: number; pointKey: string } | false => {
// 	let matching: { segmentIndex: number; pointKey: string } | false = false;
// 	poly.segments.forEach((seg, i) => {
// 		const match = isSamePoint(point, seg.p0) ? 'p0' : isSamePoint(point, seg.p1) ? 'p1' : '';
// 		if (match) {
// 			matching = { segmentIndex: i, pointKey: match };
// 		}
// 	});
// 	return matching;
// };

export const getQuadrilaterals = (
	band: Band,
	scale = 1,
	sideOrientation: Band['sideOrientation'] = 'inside'
): Quadrilateral[] => {
	const facets: Facet[] = band.facets;
	const quads: Quadrilateral[] = [];
	facets.forEach((facet, i) => {
		if (i % 2 === 1) {
			const quad =
				band.orientation === 'axial-right'
					? {
							a: facets[i - 1].triangle.a.clone(),
							b: facets[i - 1].triangle.b.clone(),
							c: facet.triangle.a.clone(),
							d: facets[i - 1].triangle.c.clone()
						}
					: {
							a: facets[i - 1].triangle.a.clone(),
							b: facets[i - 1].triangle.b.clone(),
							c: facets[i - 1].triangle.c.clone(),
							d: facet.triangle.b.clone()
						};

			if (scale && scale !== 1) {
				quad.a.multiplyScalar(scale);
				quad.b.multiplyScalar(scale);
				quad.c.multiplyScalar(scale);
				quad.d.multiplyScalar(scale);
			}
			// TODO - at the adjustment phase, for inside bands, adjacent bands are either (next) or (need to adjust the quad segments used as reference)
			if (sideOrientation === 'inside') {
				quad.a.x = -quad.a.x;
				quad.b.x = -quad.b.x;
				quad.c.x = -quad.c.x;
				quad.d.x = -quad.d.x;
			}
			quads.push(quad);
		}
	});
	if (sideOrientation === 'inside') {
		const allX = quads.map((quad) => [quad.a.x, quad.b.x, quad.c.x, quad.d.x]).flat();
		const minX = Math.min(...allX);
		const shiftedQuads = quads.map((quad) => {
			quad.a.set(quad.a.x - minX, quad.a.y, quad.a.z);
			quad.b.set(quad.b.x - minX, quad.b.y, quad.b.z);
			quad.c.set(quad.c.x - minX, quad.c.y, quad.c.z);
			quad.d.set(quad.d.x - minX, quad.d.y, quad.d.z);
			return quad;
		});
		return shiftedQuads;
	}

	return quads;
};
