import { logger } from '../../components/svg-logger/logger';
import type {
	ArcPathSegment,
	MovePathSegment,
	PathSegment,
	PatternedBandConfig
} from '$lib/cut-pattern/cut-pattern.types';
import { flatten_convert } from '$lib/flatten/flatten';
import {
	getArcParams,
	getCenteringTransform,
	type ArcParams,
	parseArcSegments,
	svgFullEllipseArcFromParams,
	isArcPathSegments,
	svgArcFromParams,
	getIntersectionsOfLineAndEllipse,
	type ArcPathSegments,
	svgArcWedgeFromParams
} from './ellipse';
import {
	type Triangle,
	type Circle,
	type Ellipse,
	type Point,
	type FlowerOfLifeConfig,
	type FlowerOfLifeTriangle,
	type PatternMode,
	type BandTesselationConfig,
	type TrianglePatternMode,
	type MatchedFlowerOfLifeConfig,
	isFlowerOfLifePathSegments,
	type FlowerOfLifePathSegments
} from './flower-of-life.types';
import {
	closestPoint,
	generateUnitTriangle,
	getAngle,
	getInsetAlongEdgeFromVertex,
	getInsetToOppositEdgeFromVertex,
	getLength,
	getMidPoint,
	getPointsInsetFromPoints,
	getTriangleHeight,
	getTriangleSkewX,
	radToDeg,
	rotatePoint,
	roundPathSegments,
	scaleXY,
	skewXPoint
} from './utils';

const UNIT_SIZE = 100;

const unitTriangle = generateUnitTriangle(UNIT_SIZE);
const unitTriangleHeight = getTriangleHeight(unitTriangle, 'c');

export const unitCircle: Circle = { x: 0, y: 0, r: UNIT_SIZE };

const transformCircle = (
	circle: Circle,
	skewAngle: number,
	rotationAngle: number,
	scaleX: number,
	scaleY: number
): Ellipse => {
	if (skewAngle === 0) {
		// TODO - instead of replacing, just skip the skew algo
		skewAngle = 0.000000000001;
	}
	// skew must be applied to an already scaled  ellipse?

	const P: Point = skewXPoint(
		{ x: circle.x, y: circle.y },
		{ x: circle.x, y: circle.y + circle.r * scaleY },
		skewAngle
	);
	const Q: Point = { x: circle.x + circle.r * scaleX, y: circle.y };
	const A: number = P.y * P.y + Q.y * Q.y;
	const B: number = -2 * (P.x * P.y + Q.x * Q.y);
	const C: number = P.x * P.x + Q.x * Q.x;
	const F: number = -Math.pow(P.x * Q.y - Q.x * P.y, 2);
	const beta: number = (C - A) / B;

	const mValues: [number, number] = [
		beta + Math.sqrt(beta * beta + 1),
		beta - Math.sqrt(beta * beta + 1)
	];
	const xValues = mValues.map((m) => {
		return [Math.sqrt(-F / (A + B * m + C * m * m)), -1 * Math.sqrt(-F / (A + B * m + C * m * m))];
	});
	const axes = [
		{
			m: mValues[0],
			length: 0,
			rotation: 0,
			p1: { x: xValues[0][0], y: mValues[0] * xValues[0][0] },
			p2: { x: xValues[0][1], y: mValues[0] * xValues[0][1] }
		},
		{
			m: mValues[1],
			length: 0,
			rotation: 0,
			p1: { x: xValues[1][0], y: mValues[1] * xValues[1][0] },
			p2: { x: xValues[1][1], y: mValues[1] * xValues[1][1] }
		}
	];
	const lengths = axes.map((axis) => getLength(axis.p1, axis.p2));
	axes[0].length = lengths[0];
	axes[1].length = lengths[1];

	const major = axes[lengths.findIndex((l) => l === Math.max(...lengths))];
	const minor = axes[lengths.findIndex((l) => l === Math.min(...lengths))];
	const rotation = getAngle(major.p2, major.p1) + rotationAngle;
	const ellipse = {
		r0: major.length / 2,
		r1: minor.length / 2,
		center: { x: 0, y: 0 },
		rotation: radToDeg(rotation)
	};
	return ellipse;
};

export const generateFlowerOfLifeTriangle = (
	flowerConfig: FlowerOfLifeConfig,
	anchor: Point,
	reflected = false
): FlowerOfLifeTriangle | undefined => {
	let scaleX = 0;
	let scaleY = 0;
	let rotation = 0;
	let skewX = 0;
	const mode: PatternMode = flowerConfig.mode || 'contained';
	if (flowerConfig.type === 'matched') {
		console.error('Matched flower of life triangle stub');
		// Generate config values based on the given triangle, then run the generate functions
		return undefined;
	}
	scaleX = scaleX ? scaleX : flowerConfig.scaleX || 1;
	scaleY = scaleY ? scaleY : flowerConfig.scaleY || 1;
	rotation = rotation ? rotation : flowerConfig.rotation || 0;
	skewX = skewX ? skewX : flowerConfig.skewX || 0;

	const t = unitTriangle;
	const sideLength = getLength(unitTriangle.a, unitTriangle.b);
	// calculate unitWidth from flowerConfig.width and a composite scale
	const unitWidth = 10;
	const width = flowerConfig.width || unitWidth;

	const insetAlongEdge = getInsetAlongEdgeFromVertex(sideLength, width);
	const insetToOppositeEdge = getInsetToOppositEdgeFromVertex(sideLength, width);
	const [ab1, ab2] = getPointsInsetFromPoints(t.b, t.a, insetAlongEdge);
	const [bc1, bc2] = getPointsInsetFromPoints(t.c, t.b, insetAlongEdge);
	const [ac1, ac2] = getPointsInsetFromPoints(t.a, t.c, insetAlongEdge);

	const edgeEllipseAnchors: { [key: string]: Point } = { ab1, ab2, bc1, bc2, ac1, ac2 };

	const innerEllipseAnchors: { [key: string]: Point } = {
		a: {
			x: t.a.x + insetToOppositeEdge * Math.cos(Math.PI / 6),
			y: t.a.y + insetToOppositeEdge * Math.sin(Math.PI / 6)
		},
		b: {
			x: t.b.x - insetToOppositeEdge * Math.cos(Math.PI / 6),
			y: t.b.y + insetToOppositeEdge * Math.sin(Math.PI / 6)
		},
		c: { x: t.c.x, y: unitTriangle.c.y - insetToOppositeEdge }
	};

	// const triangle: Triangle = {
	// 	a: { ...t.a },
	// 	b: { ...t.b },
	// 	// b: scaleXY({ ...t.b }, { ...t.a }, scaleX, scaleY),
	// 	c: { ...t.c }
	// };
	const triangle = structuredClone(t);
	const offset: Point = { x: anchor.x - triangle.a.x, y: anchor.y - triangle.a.y };

	const offsetPoint = (point: Point, offset: Point) => {
		return {
			x: point.x + offset.x,
			y: point.y + offset.y
		};
	};

	triangle.a = offsetPoint(triangle.a, offset);
	triangle.b = offsetPoint(triangle.b, offset);
	triangle.c = offsetPoint(triangle.c, offset);

	triangle.c = skewXPoint(getMidPoint(triangle.a, triangle.b), triangle.c, skewX);

	triangle.b = scaleXY({ ...triangle.b }, triangle.a, scaleX, scaleY);
	triangle.c = scaleXY({ ...triangle.c }, { ...triangle.a }, scaleX, scaleY);

	// triangle.c = rotatePoint(triangle.a, triangle.c, rotation + (reflected ? (Math.PI * 2) / 3 : 0));
	// triangle.b = rotatePoint(triangle.a, triangle.b, rotation + (reflected ? (Math.PI * 2) / 3 : 0));
	triangle.c = rotatePoint(anchor, triangle.c, -rotation);
	triangle.b = rotatePoint(anchor, triangle.b, -rotation);

	// if (reflected) {
	// 	const swap = {...triangle.b}
	// 	triangle.b = { ...triangle.c }
	// 	triangle.c = swap;

	// }
	Object.keys(edgeEllipseAnchors).forEach((key) => {
		edgeEllipseAnchors[key] = rotatePoint(
			triangle.a,
			offsetPoint(
				scaleXY(
					skewXPoint(triangle.a, edgeEllipseAnchors[key], flowerConfig.skewX || 0),
					t.a,
					scaleX,
					scaleY
				),
				offset
			),
			(flowerConfig.rotation || 0) + (reflected ? (Math.PI * 2) / 3 : 0)
		);
	});
	Object.keys(innerEllipseAnchors).forEach((key) => {
		innerEllipseAnchors[key] = rotatePoint(
			triangle.a,
			offsetPoint(
				scaleXY(
					skewXPoint(triangle.a, innerEllipseAnchors[key], flowerConfig.skewX || 0),
					t.a,
					scaleX,
					scaleY
				),
				offset
			),
			(flowerConfig.rotation || 0) + (reflected ? (Math.PI * 2) / 3 : 0)
		);
	});

	// Ellipses

	const layoutEllipse = transformCircle(unitCircle, skewX, rotation, scaleX, scaleY);
	const edgeCircle = { ...unitCircle, r: unitCircle.r - width / 2 };
	const edgeEllipse = transformCircle(edgeCircle, skewX, rotation, scaleX, scaleY);
	const innerCircle = { ...unitCircle, r: unitCircle.r + width / 2 };
	const innerEllipse = transformCircle(innerCircle, skewX, rotation, scaleX, scaleY);

	const flowerOfLifeTriangle = {
		reflected,
		triangle,
		ab: {
			mode,
			layout: {
				ellipse: layoutEllipse,
				p1: triangle.b,
				p2: triangle.a
			},
			edge: {
				ellipse: edgeEllipse,
				p1: edgeEllipseAnchors.ab1,
				p2: edgeEllipseAnchors.ab2
			},
			inner: {
				ellipse: innerEllipse,
				p1: innerEllipseAnchors.b,
				p2: innerEllipseAnchors.a
			}
		},
		bc: {
			mode,
			layout: {
				ellipse: layoutEllipse,
				p1: triangle.c,
				p2: triangle.b
			},
			edge: {
				ellipse: edgeEllipse,
				p1: edgeEllipseAnchors.bc1,
				p2: edgeEllipseAnchors.bc2
			},
			inner: {
				ellipse: innerEllipse,
				p1: innerEllipseAnchors.c,
				p2: innerEllipseAnchors.b
			}
		},
		ac: {
			mode,
			layout: {
				ellipse: layoutEllipse,
				p1: triangle.a,
				p2: triangle.c
			},
			edge: {
				ellipse: edgeEllipse,
				p1: edgeEllipseAnchors.ac1,
				p2: edgeEllipseAnchors.ac2
			},
			inner: {
				ellipse: innerEllipse,
				p1: innerEllipseAnchors.a,
				p2: innerEllipseAnchors.c
			}
		}
	};
	// console.log('flower', flowerOfLifeTriangle);
	return flowerOfLifeTriangle;
};

export const generateMatchedFlowerOfLifeTesselation = (
	config: BandTesselationConfig
): (FlowerOfLifeTriangle | undefined)[] => {
	const tesselation: FlowerOfLifeTriangle[] = [];

	for (let i = 0; i < config.tiles.length; i++) {
		const row = config.tiles[i];

		const config0Mode: TrianglePatternMode = {
			ab: i === 0 ? 'contained' : 'contributing',
			ac: 'contained',
			bc: 'contributing'
		};

		const config1Mode: TrianglePatternMode = {
			ab: i === config.tiles.length - 1 ? 'contained' : 'contributing',
			ac: 'contained',
			bc: 'contributing'
		};
		const f0 = generateMatchedFlowerOfLifeTriangle(row[0], config0Mode, true);

		tesselation.push(f0);
	}

	return tesselation;
};

const deriveConfigFromBandTriangle = (
	config: FlowerOfLifeConfig,
	isPrimary: boolean
): FlowerOfLifeConfig => {
	if (config.type !== 'matched') {
		throw new Error('can only derive specified config from matched');
	}
	const derivedConfig: FlowerOfLifeConfig = {
		type: 'specified',
		anchor: config.triangle.a,
		width: config.width,
		rotation: getAngle(config.triangle.a, config.triangle.b) + (isPrimary ? 0 : Math.PI),
		scaleY: getTriangleHeight(config.triangle, 'c') / unitTriangleHeight,
		scaleX: getLength(config.triangle.a, config.triangle.b) / UNIT_SIZE,
		skewX: getTriangleSkewX(config.triangle, 'c', false),
		mode: undefined
	};

	return derivedConfig;
};

const generateMatchedFlowerOfLifeTriangle = (
	config: FlowerOfLifeConfig,
	mode: { ab: PatternMode; bc: PatternMode; ac: PatternMode },
	isPrimary: boolean,
	isAlt = false
): FlowerOfLifeTriangle => {
	if (config.type !== 'matched') {
		throw new Error("Tesselation config is not 'matched'");
	}

	const ellipse: Ellipse = {
		r0: 100,
		r1: 100,
		rotation: 0
	};
	const derivedConfig = deriveConfigFromBandTriangle(config, isPrimary);
	const flowerOfLifeTriangle = generateFlowerOfLifeTriangle(
		derivedConfig,
		config.triangle.a,
		false
	);

	return flowerOfLifeTriangle;
};

// Output
export const svgTriangle = (t: Triangle) =>
	`M ${t.a.x} ${t.a.y} L ${t.b.x} ${t.b.y} L ${t.c.x} ${t.c.y} z`;

export const svgEllipse = (
	e: Ellipse,
	anchors: { p1: Point; p2: Point },
	section: 'major' | 'minor' | 'whole',
	adjustment?: number,
	reflected = false
): string => {
	const location = {
		p1: reflected ? anchors.p2 : anchors.p1,
		p2: reflected ? anchors.p1 : anchors.p2
	};
	if (section === 'minor') {
		const path = `M ${location.p1.x} ${location.p1.y} A ${e.r0} ${e.r1} ${e.rotation} 0 1 ${location.p2.x} ${location.p2.y} z`;
		return path;
	}
	if (section === 'major') {
		return `M ${location.p1.x} ${location.p1.y} A ${e.r0} ${e.r1} ${e.rotation} 1 1 ${location.p2.x} ${location.p2.y} z`;
	}
	return `M ${location.p1.x} ${location.p1.y} 
              A ${e.r0} ${e.r1} ${e.rotation + (adjustment || 0)} 0 1 ${location.p2.x} ${
		location.p2.y
	} 
              A ${e.r0} ${e.r1} ${e.rotation + (adjustment || 0)} 1 1 ${location.p1.x} ${
		location.p1.y
	} z`;
};

export const svgArcTriangle = (
	e: Ellipse,
	vertices: Triangle,
	section: 'major' | 'minor' | 'whole',
	reflected: boolean
): string => {
	return `
				M ${vertices.b.x} ${vertices.b.y} 
				A ${e.r0} ${e.r1} ${e.rotation} 0 ${reflected ? 0 : 1} ${vertices.a.x} ${vertices.a.y}
				A ${e.r0} ${e.r1} ${e.rotation} 0 ${reflected ? 0 : 1} ${vertices.c.x} ${vertices.c.y}
				A ${e.r0} ${e.r1} ${e.rotation} 0 ${reflected ? 0 : 1} ${vertices.b.x} ${vertices.b.y} z
			`;
};

export const svgUnitFlowerOfLife = (config?: FlowerOfLifeTriangle, size = 100, width = 10) => {
	if (config) {
		const t = structuredClone(config.triangle);
		const { ab, bc, ac } = config;
		const outerR = config.ab.edge.ellipse.r0;
		const innerR = config.ab.inner.ellipse.r0;
		const svg = `
			M ${t.a.x} ${t.a.y}
			L ${ab.edge.p2.x} ${ab.edge.p2.y}
			A ${outerR} ${outerR} 0 0 0 ${ab.edge.p1.x} ${ab.edge.p1.y}

			L ${t.b.x} ${t.b.y}
			L ${bc.edge.p2.x} ${bc.edge.p2.y}
			A ${outerR} ${outerR} 0 0 0 ${bc.edge.p1.x} ${bc.edge.p1.y}

			L ${t.c.x} ${t.c.y}
			L ${ac.edge.p2.x} ${ac.edge.p2.y}
			A ${outerR} ${outerR} 0 0 0 ${ac.edge.p1.x} ${ac.edge.p1.y}

			L ${t.a.x} ${t.a.y} z

			M ${ab.inner.p2.x} ${ab.inner.p2.y}
			A ${innerR} ${innerR} 0 0 0 ${ab.inner.p1.x} ${ab.inner.p1.y}
			A ${innerR} ${innerR} 0 0 0 ${bc.inner.p1.x} ${bc.inner.p1.y}
			A ${innerR} ${innerR} 0 0 0 ${ac.inner.p1.x} ${ac.inner.p1.y} z
		`;
		return svg;
	}
	const t = {
		a: { x: 0, y: 0 },
		b: { x: size, y: 0 },
		c: { x: size / 2, y: Math.sqrt(size ** 2 - (size / 2) ** 2) }
	};

	return `
	M ${t.a.x} ${t.a.y} L ${t.b.x} ${t.b.y} L ${t.c.x} ${t.c.y} L ${t.a.x} ${t.a.y}
	A ${size} ${size} 0 0 0 ${t.b.x} ${t.b.y}
	A ${size} ${size} 0 0 0 ${t.c.x} ${t.c.y}
	A ${size} ${size} 0 0 0 ${t.a.x} ${t.a.y}
	`;
};

export const getTransformStringFromTriangle = (
	config: MatchedFlowerOfLifeConfig,
	isPrimary: boolean
): string => {
	const d = deriveConfigFromBandTriangle(config, isPrimary);
	if (d.type === 'matched') {
		return '';
	}
	return `
		translate(${d.anchor?.x || 0} ${d.anchor?.y || 0}) 
		rotate(${d.rotation ? radToDeg(d.rotation) : 0})
		skewX(${d.skewX ? -radToDeg(d.skewX) : 0})	
		scale(${d.scaleX || 1} -${d.scaleY || 1})
	`;
};

export const generateFlowerOfLife1BandPattern = (
	facets: PathSegment[][],
	config?: PatternedBandConfig
): string => {
	const pathSeq: PathSegment[] = [];
	const cutoutSeq: PathSegment[] = [];

	const start =
		config?.range && config.range[0] > 0 && config.range[0] < facets[0].length - 1
			? config.range[0]
			: 0;
	const end =
		config?.range && config.range[1] > start && config.range[1] < facets[0].length - 1
			? config.range[1]
			: facets.length - 1;

	// Start inner
	cutoutSeq.push(
		facets[start][11],
		facets[start][12],
		facets[start][13],
		facets[start][14],
		facets[start][15]
	);
	// Start facet
	if (start % 2 === 0) {
		//outline
		const startSegment = ['M', facets[start][6][1], facets[start][6][2]] as PathSegment;
		pathSeq.push(
			startSegment,
			facets[start][7],
			facets[start][8],
			facets[start][9],
			facets[start][1],
			facets[start][2],
			facets[start][3]
		);
	} else {
		// leading almond
		cutoutSeq.push(
			['M', facets[start][1][1], facets[start][1][2]] as PathSegment,
			facets[start][2],
			facets[start + 1][2],
			['Z']
		);
		// outline
		const startSegment = ['M', facets[start][3][1], facets[start][3][2]] as PathSegment;
		pathSeq.push(
			startSegment,
			facets[start][4],
			facets[start][5],
			facets[start][6],
			facets[start][7],
			facets[start][8],
			facets[start][9]
		);
	}
	// Odd facets
	for (let i = start + (start % 2) + 1; i < end; i += 2) {
		// inner triangle
		cutoutSeq.push(facets[i][11], facets[i][12], facets[i][13], facets[i][14], facets[i][15]);
		// trailing almond
		cutoutSeq.push(
			['M', facets[i][4][1], facets[i][4][2]] as PathSegment,
			facets[i][5],
			facets[i - 1][5],
			['Z']
		);
		// leading almond
		cutoutSeq.push(
			['M', facets[i][1][1], facets[i][1][2]] as PathSegment,
			facets[i][2],
			facets[i + 1][2],
			['Z']
		);
		// outline
		pathSeq.push(facets[i][7], facets[i][8], facets[i][9]);
	}
	// End facet
	if (end % 2 === 0) {
		// inner

		// outline
		pathSeq.push(
			facets[end][4],
			facets[end][5],
			facets[end][6],
			facets[end][7],
			facets[end][8],
			facets[end][9]
		);
	} else {
		// inner triangle
		cutoutSeq.push(
			facets[end][11],
			facets[end][12],
			facets[end][13],
			facets[end][14],
			facets[end][15]
		);
		// trailing almond
		cutoutSeq.push(
			['M', facets[end][4][1], facets[end][4][2]] as PathSegment,
			facets[end][5],
			facets[end - 1][5],
			['Z']
		);
		// outline
		pathSeq.push(
			facets[end][7],
			facets[end][8],
			facets[end][9],
			facets[end][1],
			facets[end][2],
			facets[end][3]
		);
	}
	// Even facets
	for (let i = end - ((end + 1) % 2) - 1; i > start; i -= 2) {
		// inner triangle
		cutoutSeq.push(facets[i][11], facets[i][12], facets[i][13], facets[i][14], facets[i][15]);
		// outline
		pathSeq.push(facets[i][7], facets[i][8], facets[i][9]);
	}
	pathSeq.push(['Z'], ...cutoutSeq);

	const svgPathString = svgPathStringFromSegments(pathSeq);
	return svgPathString;
};

export const svgPathStringFromSegments = (segments: PathSegment[]) =>
	segments
		.map((segment) =>
			segment
				.map((elem) => {
					if (typeof elem === 'string') {
						return elem;
					} else {
						return `${elem}`;
					}
				})
				.join(' ')
		)
		.join('\n');

export const processFlowerOfLife1PatternTransforms = ({
	svgPath,
	svgTransform,
	width
}: {
	svgPath: string;
	svgTransform: string;
	width: number;
}): PathSegment[] => {
	console.debug('*** processing...');
	// Transform unit geometry to path segments
	const txSegments = flatten_convert(svgPath, svgTransform);
	if (!isFlowerOfLifePathSegments(txSegments)) {
		throw new Error(svgPath + ' is not a flower of life pattern path');
	}

	console.debug(
		'  transformed prototype',
		txSegments.map((seg) => roundPathSegments(seg))
	);

	// Gather Arcs and Lines for this facet.
	// At this point, arcs have not diverged to inner and outer versions
	const txArcs: [MovePathSegment, ArcPathSegment][] = [];
	const txLines: [Point, Point][] = [];
	txSegments.forEach((segment, i, segs) => {
		if (segment[0] === 'A' && [2, 5, 8].includes(i)) {
			const p0: Point = {
				x: segs[i - 1][segs[i - 1].length - 2] as number,
				y: segs[i - 1][segs[i - 1].length - 1] as number
			};
			const p1: Point = { x: segs[i + 1][1] as number, y: segs[i + 1][2] as number };
			const prev: MovePathSegment = ['M', p0.x, p0.y];
			txArcs.push([prev, segment]);
			txLines.push([p0, p1]);
		}
	});

	const triangle: Triangle = {
		a: { x: txSegments[0][1], y: txSegments[0][2] },
		b: { x: txSegments[4][1], y: txSegments[4][2] },
		c: { x: txSegments[7][1], y: txSegments[7][2] }
	};

	logger.update((prev) => {
		prev.debug.push(svgTriangle(triangle));
		return prev;
	});

	const medianLines: [Point, Point][] = [
		[triangle.a, getMidPoint(triangle.b, triangle.c)],
		[triangle.b, getMidPoint(triangle.a, triangle.c)],
		[triangle.c, getMidPoint(triangle.a, triangle.b)]
	];
	console.debug('medianLines', medianLines);

	const txArcParams = txArcs.map((arc) => getArcParams(arc));

	// Calculate reduced and centered ellipses and lines

	// const getCentered = (arcs: ArcParams[], lines?: [Point, Point][]): { arcs: ArcParams[], lines?: [Point, Point][] } => {

	// }

	const centeringTransforms = txArcParams.map((arc) => {
		const ct = getCenteringTransform(arc);
		return ct;
	});
	const cLines = {
		outer: txLines.map((line, i) => {
			const ct = centeringTransforms[i];
			return getTransformedPoints(
				line,
				`rotate(${ct.rotationDegrees}) translate(${ct.translate.x}, ${ct.translate.y})`
			);
		}),
		inner: medianLines.map((line, i) => {
			const ct = centeringTransforms[i];
			return getTransformedPoints(
				line,
				`rotate(${ct.rotationDegrees}) translate(${ct.translate.x}, ${ct.translate.y})`
			);
		})
	};
	console.debug('cLines', cLines);

	const cArcs = txArcParams.map((arc, i) => {
		const ct = centeringTransforms[i];
		const segments = flatten_convert(
			svgArcFromParams(arc),
			`rotate(${ct.rotationDegrees}) translate(${ct.translate.x}, ${ct.translate.y})`
		);
		if (!isArcPathSegments(segments)) {
			throw new Error('incorrect segments output');
		}
		const arcParams = parseArcSegments(segments);
		return arcParams;
	});
	logger.update((prev) => {
		prev.debug.push(...cArcs.map((c) => svgArcFromParams(c)));
		return prev;
	});
	//////////////////////////////////
	// diverge arc radii by 1/2 width
	const rArcs: { inner: ArcParams[]; outer: ArcParams[] } = {
		inner: cArcs.map((cArc) => ({
			...cArc,
			r0: cArc.r0 - width / 2,
			r1: cArc.r1 - width / 2
		})),
		outer: cArcs.map((cArc) => ({
			...cArc,
			r0: cArc.r0 + width / 2,
			r1: cArc.r1 + width / 2
		}))
	};

	// recenter
	const reducedCenteringTransforms = {
		inner: rArcs.inner.map((rArc) => {
			const ct = getCenteringTransform(rArc);
			return ct;
		}),
		outer: rArcs.outer.map((rArc) => {
			const ct = getCenteringTransform(rArc);
			return ct;
		})
	};
	const recenteredReducedArcs = {
		inner: rArcs.inner.map((rArc, i) => {
			const rct = reducedCenteringTransforms.inner[i];
			const segments = flatten_convert(
				svgArcFromParams(rArc),
				`rotate(${rct.rotationDegrees}) translate(${rct.translate.x}, ${rct.translate.y})`
			);
			if (!isArcPathSegments(segments)) {
				throw new Error('incorrect segments output');
			}
			const arcParams = parseArcSegments(segments);
			return arcParams;
		}),
		outer: rArcs.outer.map((rArc, i) => {
			const rct = reducedCenteringTransforms.outer[i];
			const segments = flatten_convert(
				svgArcFromParams(rArc),
				`rotate(${rct.rotationDegrees}) translate(${rct.translate.x}, ${rct.translate.y})`
			);
			if (!isArcPathSegments(segments)) {
				throw new Error('incorrect segments output');
			}
			const arcParams = parseArcSegments(segments);
			return arcParams;
		})
	};
	// logger.update((prev) => {
	// 	prev.debug.push(...recenteredReducedArcs.inner.map(c => svgArcFromParams(c)))
	// 	prev.debug.push(...recenteredReducedArcs.outer.map(c => svgArcFromParams(c)))
	// 	return prev
	// })
	// Calculate intersections
	console.debug('Get some intersecctions! cLines', cLines);

	const intersections = {
		inner: recenteredReducedArcs.inner.map((rrArc, i) => {
			const result = getIntersectionsOfLineAndEllipse(
				{ a: rrArc.r0, b: rrArc.r1 },
				cLines.inner[i][0],
				cLines.inner[i][1]
			);
			if (isNaN(result[0].x) || isNaN(result[0].y) || isNaN(result[1].x) || isNaN(result[1].y)) {
				throw new Error('missing intersection');
			}
			return result;
		}),
		outer: recenteredReducedArcs.outer.map((rrArc, i) => {
			const result = getIntersectionsOfLineAndEllipse(
				{ a: rrArc.r0, b: rrArc.r1 },
				cLines.outer[i][0],
				cLines.outer[i][1]
			);
			if (isNaN(result[0].x) || isNaN(result[0].y) || isNaN(result[1].x) || isNaN(result[1].y)) {
				throw new Error('missing intersection');
			}
			return result;
		})
	};

	// Modify reduced arcs with intersections
	const intersectedArcs = {
		inner: recenteredReducedArcs.inner.map((rrArc, i) => {
			const newP0 = closestPoint(rrArc.p0, [intersections.inner[i][0], intersections.inner[i][1]]);
			const newP1 = closestPoint(rrArc.p1, [intersections.inner[i][0], intersections.inner[i][1]]);
			return {
				...rrArc,
				p0: newP0,
				p1: newP1
				// p0: intersections[i][0],
				// p1: intersections[i][1]
			};
		}),
		outer: recenteredReducedArcs.outer.map((rrArc, i) => {
			const newP0 = closestPoint(rrArc.p0, [intersections.outer[i][0], intersections.outer[i][1]]);
			const newP1 = closestPoint(rrArc.p1, [intersections.outer[i][0], intersections.outer[i][1]]);
			return {
				...rrArc,
				p0: newP0,
				p1: newP1
				// p0: intersections[i][0],
				// p1: intersections[i][1]
			};
		})
	};
	logger.update((prev) => {
		prev.debug.push(...intersectedArcs.inner.map((c) => svgArcWedgeFromParams(c)));
		prev.debug.push(...intersectedArcs.outer.map((c) => svgArcWedgeFromParams(c)));
		return prev;
	});
	// For debugging - intersected arcs by segment
	// const instersectedArcsSegments = recenteredReducedArcSegments.map((rrArc, i) => {
	// 	const A = [...rrArc[1]];
	// 	A[A.length - 2] = intersectedArcs[i].p1.x;
	// 	A[A.length - 1] = intersectedArcs[i].p1.y;
	// 	return [['M', intersectedArcs[i].p0.x, intersectedArcs[i].p0.y], A];
	// });
	// console.debug(
	// 	'intersected',
	// 	instersectedArcsSegments.flat().map((seg) => roundPathSegments(seg))
	// );

	// Restore arcs and lines to translated and rotated locations

	// TODO - instead of centering, then reducing, then recentering, we should reduce, then center

	const restoringTransforms: string[] = centeringTransforms.map(
		(ctx) =>
			`translate(${-ctx.translate.x}, ${-ctx.translate.y}) 
			 rotate(${-ctx.rotationDegrees})`
	);
	const newArcs: { inner: ArcPathSegments[]; outer: ArcPathSegments[] } = {
		inner: intersectedArcs.inner.map((arc, i) => {
			const intersectedArcSVG = svgArcFromParams(arc);
			const restoredReducedArc = flatten_convert(intersectedArcSVG, restoringTransforms[i]);
			if (!isArcPathSegments(restoredReducedArc)) {
				throw new Error('Restored reduced arc is not ArcPathSegments');
			}
			return restoredReducedArc;
		}),
		outer: intersectedArcs.outer.map((arc, i) => {
			const intersectedArcSVG = svgArcFromParams(arc);
			const restoredReducedArc = flatten_convert(intersectedArcSVG, restoringTransforms[i]);
			if (!isArcPathSegments(restoredReducedArc)) {
				throw new Error('Restored reduced arc is not ArcPathSegments');
			}
			return restoredReducedArc;
		})
	};

	const integratedSegments: FlowerOfLifePathSegments = [...txSegments];
	// Outer arcs
	integratedSegments[1] = ['L', newArcs.outer[0][0][1], newArcs.outer[0][0][2]]; //p0  // Sometimes p0 and p1 get mixed up
	integratedSegments[2][1] = newArcs.outer[0][1][1]; //r0
	integratedSegments[2][2] = newArcs.outer[0][1][2]; //r1
	integratedSegments[2][6] = newArcs.outer[0][1][6]; //p1.x
	integratedSegments[2][7] = newArcs.outer[0][1][7]; //p1.y

	integratedSegments[4] = ['L', newArcs.outer[1][0][1], newArcs.outer[1][0][2]]; //p0
	integratedSegments[5][1] = newArcs.outer[1][1][1]; //r0
	integratedSegments[5][2] = newArcs.outer[1][1][2]; //r1
	integratedSegments[5][6] = newArcs.outer[1][1][6]; //p1.x
	integratedSegments[5][7] = newArcs.outer[1][1][7]; //p1.y

	integratedSegments[7] = ['L', newArcs.outer[2][0][1], newArcs.outer[2][0][2]]; //p0
	integratedSegments[8][1] = newArcs.outer[2][1][1]; //r0
	integratedSegments[8][2] = newArcs.outer[2][1][2]; //r1
	integratedSegments[8][6] = newArcs.outer[2][1][6]; //p1.x
	integratedSegments[8][7] = newArcs.outer[2][1][7]; //p1.y

	// Inner arcs
	integratedSegments[11] = ['M', newArcs.inner[0][0][1], newArcs.inner[0][0][2]]; // p0
	integratedSegments[12][1] = newArcs.inner[0][1][1]; // r0
	integratedSegments[12][2] = newArcs.inner[0][1][2]; // r1
	integratedSegments[12][6] = newArcs.inner[0][1][6]; // p1.x
	integratedSegments[12][7] = newArcs.inner[0][1][7]; // p1.y

	integratedSegments[13][1] = newArcs.inner[1][1][1]; // r0
	integratedSegments[13][2] = newArcs.inner[1][1][2]; // r1
	integratedSegments[13][6] = newArcs.inner[1][1][6]; // p1.x
	integratedSegments[13][7] = newArcs.inner[1][1][7]; // p1.y

	integratedSegments[14][1] = newArcs.inner[2][1][1]; // r0
	integratedSegments[14][2] = newArcs.inner[2][1][2]; // r1
	integratedSegments[14][6] = newArcs.inner[2][1][6]; // p1.x
	integratedSegments[14][7] = newArcs.inner[2][1][7]; // p1.y

	console.debug(
		'  with inset',
		integratedSegments.map((seg) => roundPathSegments(seg))
	);

	return integratedSegments;
};

const getTransformedPoints = (points: [Point, Point], transform: string) => {
	const l = flatten_convert(
		`M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`,
		transform
	);
	return [
		{ x: l[0][1] || 0, y: l[0][2] || 0 },
		{ x: l[1][1] || 0, y: l[1][2] || 0 }
	];
};
