import type { PathSegment, Point, FlowerOfLifeTriangle } from '$lib/types';
import { unitCircle } from '../flower-of-life';
import {
	getInsetAlongEdgeFromVertex,
	getInsetToOppositEdgeFromVertex,
	getPointsInsetFromPoints,
	generateUnitTriangle
} from '../utils';

export const generateUnitFlowerOfLifeTriangle = (config: {
	width?: number;
	unitSize?: number;
}): FlowerOfLifeTriangle | undefined => {
	const unitSize =
		typeof config.unitSize === 'number' && config.unitSize > 0 ? config.unitSize : 100;
	const width =
		typeof config.width === 'number' && config.width >= 0 && config.width < unitSize / 3
			? config.width
			: 1;

	const t = generateUnitTriangle(unitSize);

	const insetAlongEdge = getInsetAlongEdgeFromVertex(unitSize, width);
	const insetToOppositeEdge = getInsetToOppositEdgeFromVertex(unitSize, width);
	const [ab1, ab2] = getPointsInsetFromPoints(t.b, t.a, insetAlongEdge);
	const [bc1, bc2] = getPointsInsetFromPoints(t.c, t.b, insetAlongEdge);
	const [ac1, ac2] = getPointsInsetFromPoints(t.a, t.c, insetAlongEdge);

	const cEdgeAnchors: { [key: string]: Point } = { ab1, ab2, bc1, bc2, ac1, ac2 };

	const cInnerAnchors: { [key: string]: Point } = {
		a: {
			x: t.a.x + insetToOppositeEdge * Math.cos(Math.PI / 6),
			y: t.a.y + insetToOppositeEdge * Math.sin(Math.PI / 6)
		},
		b: {
			x: t.b.x - insetToOppositeEdge * Math.cos(Math.PI / 6),
			y: t.b.y + insetToOppositeEdge * Math.sin(Math.PI / 6)
		},
		c: { x: t.c.x, y: t.c.y - insetToOppositeEdge }
	};

	// Ellipses
	const cEdge = { r0: unitCircle.r - width / 2, r1: unitCircle.r - width / 2, rotation: 0 };
	const cInner = { r0: unitCircle.r + width / 2, r1: unitCircle.r + width / 2, rotation: 0 };

	const flowerOfLifeTriangle: FlowerOfLifeTriangle = {
		triangle: t,
		ab: {
			edge: { ellipse: cEdge, p1: cEdgeAnchors.ab1, p2: cEdgeAnchors.ab2 },
			inner: { ellipse: cInner, p1: cInnerAnchors.b, p2: cInnerAnchors.a }
		},
		bc: {
			edge: { ellipse: cEdge, p1: cEdgeAnchors.bc1, p2: cEdgeAnchors.bc2 },
			inner: { ellipse: cInner, p1: cInnerAnchors.c, p2: cInnerAnchors.b }
		},
		ac: {
			edge: { ellipse: cEdge, p1: cEdgeAnchors.ac1, p2: cEdgeAnchors.ac2 },
			inner: { ellipse: cEdge, p1: cInnerAnchors.a, p2: cInnerAnchors.c }
		},
		svgPath: '',
		segments: []
	};
	const { svgPath, segments } = segmentsFromFlowerPatternParams(flowerOfLifeTriangle);
	flowerOfLifeTriangle.svgPath = svgPath;
	flowerOfLifeTriangle.segments = segments;

	return flowerOfLifeTriangle;
};

const segmentsFromFlowerPatternParams = (config: FlowerOfLifeTriangle) => {
	const { triangle, ab, bc, ac } = config;
	const t = triangle;
	const outerR = config.ab.edge.ellipse.r0;
	const innerR = config.ab.inner.ellipse.r0;

	const svgPath = `
			M ${t.a.x} ${t.a.y}
			L ${ab.edge.p2.x} ${ab.edge.p2.y}
			A ${outerR} ${outerR} 0 0 0 ${ab.edge.p1.x} ${ab.edge.p1.y}

			L ${t.b.x} ${t.b.y}
			L ${bc.edge.p2.x} ${bc.edge.p2.y}
			A ${outerR} ${outerR} 0 0 0 ${bc.edge.p1.x} ${bc.edge.p1.y}

			L ${t.c.x} ${t.c.y}
			L ${ac.edge.p2.x} ${ac.edge.p2.y}
			A ${outerR} ${outerR} 0 0 0 ${ac.edge.p1.x} ${ac.edge.p1.y}

			L ${t.a.x} ${t.a.y}
      Z

			M ${ab.inner.p2.x} ${ab.inner.p2.y}
			A ${innerR} ${innerR} 0 0 0 ${ab.inner.p1.x} ${ab.inner.p1.y}
			A ${innerR} ${innerR} 0 0 0 ${bc.inner.p1.x} ${bc.inner.p1.y}
			A ${innerR} ${innerR} 0 0 0 ${ac.inner.p1.x} ${ac.inner.p1.y}
      Z
		`;
	const segments: PathSegment[] = [
		['M', t.a.x, t.a.y],
		['L', ab.edge.p2.x, ab.edge.p2.y],
		['A', outerR, outerR, 0, 0, 0, ab.edge.p1.x, ab.edge.p1.y],
		['L', t.b.x, t.b.y],
		['L', bc.edge.p2.x, bc.edge.p2.y],
		['A', outerR, outerR, 0, 0, 0, bc.edge.p1.x, bc.edge.p1.y],
		['L', t.c.x, t.c.y],
		['L', ac.edge.p2.x, ac.edge.p2.y],
		['A', outerR, outerR, 0, 0, 0, ac.edge.p1.x, ac.edge.p1.y],
		['L', t.a.x, t.a.y],
		['Z'],
		['M', ab.inner.p2.x, ab.inner.p2.y],
		['A', innerR, innerR, 0, 0, 0, ab.inner.p1.x, ab.inner.p1.y],
		['A', innerR, innerR, 0, 0, 0, bc.inner.p1.x, bc.inner.p1.y],
		['A', innerR, innerR, 0, 0, 0, ac.inner.p1.x, ac.inner.p1.y],
		['Z']
	];

	return { svgPath, segments };
};
