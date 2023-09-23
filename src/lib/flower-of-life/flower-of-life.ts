import type {
	Triangle,
	Circle,
	Ellipse,
	Point,
	FlowerOfLifeConfig,
	FlowerOfLifeTriangle,
	PatternMode,
	BandTesselationConfig,
	TrianglePatternMode,
	MatchedFlowerOfLifeConfig
} from './flower-of-life.types';
import {
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
	// console.debug('getSkewedCircle', circle, skewAngle);
	// skew must be applied to an already scaled  ellipse?

	const P: Point = skewXPoint(
		{ x: circle.x, y: circle.y },
		{ x: circle.x, y: circle.y + circle.r * scaleY },
		skewAngle
	);
	// console.debug('  P', P);
	const Q: Point = { x: circle.x + circle.r * scaleX, y: circle.y };
	// console.debug('  Q', Q);
	const A: number = P.y * P.y + Q.y * Q.y;
	const B: number = -2 * (P.x * P.y + Q.x * Q.y);
	const C: number = P.x * P.x + Q.x * Q.x;
	const F: number = -Math.pow(P.x * Q.y - Q.x * P.y, 2);
	const beta: number = (C - A) / B;
	// console.debug('  A', A);
	// console.debug('  B', B);
	// console.debug('  C', C);
	// console.debug('  F', F);
	// console.debug('  beta', beta);

	const mValues: [number, number] = [
		beta + Math.sqrt(beta * beta + 1),
		beta - Math.sqrt(beta * beta + 1)
	];
	const xValues = mValues.map((m) => {
		return [Math.sqrt(-F / (A + B * m + C * m * m)), -1 * Math.sqrt(-F / (A + B * m + C * m * m))];
	});
	// console.debug('  xValues', xValues);
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
	// console.debug('  axes', axes);
	const lengths = axes.map((axis) => getLength(axis.p1, axis.p2));
	axes[0].length = lengths[0];
	axes[1].length = lengths[1];

	const major = axes[lengths.findIndex((l) => l === Math.max(...lengths))];
	const minor = axes[lengths.findIndex((l) => l === Math.min(...lengths))];
	// console.debug('major', major, 'minor', minor, scaleX, scaleY);
	const rotation = getAngle(major.p2, major.p1) + rotationAngle;
	const ellipse = {
		r0: major.length / 2, //Math.sqrt(Math.pow((major.p2.y - major.p1.y) * scaleY, 2) + Math.pow((major.p2.x - major.p1.x) * scaleX, 2)) / 2,
		r1: minor.length / 2, //Math.sqrt(Math.pow((minor.p2.y - minor.p1.y) * scaleY, 2) + Math.pow((minor.p2.x - minor.p1.x) * scaleX, 2)) / 2,
		center: { x: 0, y: 0 },
		rotation: radToDeg(rotation)
	};
	// console.debug('ellipse', ellipse);
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
	// console.debug('layoutEllipse', layoutEllipse);

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

export const generateUnitFlowerOfLifeTriangle = (
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


	triangle.c = rotatePoint(anchor, triangle.c, -rotation);
	triangle.b = rotatePoint(anchor, triangle.b, -rotation);


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
	// console.debug('layoutEllipse', layoutEllipse);

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
		// const f1 = generateMatchedFlowerOfLifeTriangle(row[1], config1Mode, false);


		tesselation.push(
			f0
			// f1
		);
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
	if (isAlt) {
		derivedConfig.skewX = -0.36;
	}

	const flowerOfLifeTriangle = generateFlowerOfLifeTriangle(
		derivedConfig,
		config.triangle.a,
		false
	);

	return flowerOfLifeTriangle;
};

export const generateFlowerOfLifeTesselation = (
	flowerConfig: FlowerOfLifeConfig,
	width = 1,
	height = 1
): (FlowerOfLifeTriangle | undefined)[] => {
	const tesselation: FlowerOfLifeTriangle[] = [];
	let unitIndex = 0;
	for (let row = 0; row < height; row++) {
		for (let col = 0; col < width; col++) {
			let anchor = flowerConfig.anchor || { x: 0, y: 0 };
			if (col === 0 && row === 0) {
				const unit = generateFlowerOfLifeTriangle(flowerConfig, anchor, unitIndex % 2 === 1);
				if (unit) {
					console.debug(unitIndex, 'unit', unit);
					tesselation.push(unit);
				}
			} else {
				unitIndex++;
				anchor =
					col === 0
						? {
								x: tesselation[tesselation.length - width].triangle.c.x,
								y: tesselation[tesselation.length - width].triangle.c.y
						  }
						: {
								x: tesselation[tesselation.length - 1].triangle.c.x,
								y: tesselation[tesselation.length - 1].triangle.c.y
						  };
				if (flowerConfig.type === 'specified') {
					const contextualScaleY = (flowerConfig.scaleY || 1) * (col % 2 === 0 ? 1 : -1);
					const config: FlowerOfLifeConfig = { ...flowerConfig, scaleY: contextualScaleY };
					const unit = generateFlowerOfLifeTriangle(config, anchor, unitIndex % 2 === 1);
					if (unit) {
						tesselation.push(unit);
					}
				} else if (flowerConfig.type === 'matched') {
					console.debug('--- triangle row', row, 'col', col);
				}
			}
		}
	}
	return tesselation;
};

// Output
export const svgTriangle = (t: Triangle) =>
	`M ${t.a.x} ${t.a.y} L ${t.b.x} ${t.b.y} L ${t.c.x} ${t.c.y} z`;

// const svgMarker = (p: Point, type?: 'circle' | 'cross') => arcCircle({ ...p, r: 2 });
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
		console.debug('svgEllipse - minor - reflected', reflected, path);
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
		// M ${ t.a.x } ${ t.a.y } L ${ t.b.x } ${ t.b.y } L ${ t.c.x } ${ t.c.y } L ${ t.a.x } ${ t.a.y }
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

export const svgTransformFromMatchedTriangle = (
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

export type PathSegment =
	| ['M', number, number]
	| ['L', number, number]
	| ['A', number, number, number, number, number, number, number]
	| ['Z'];
type PatternedBandConfig = {
	range?: [number, number];
};

export const generateFlowerOfLifeOutlinedBand = (
	facets: PathSegment[][],
	config?: PatternedBandConfig
): string => {
	const pathSeq: PathSegment[] = [];
	const cutoutSeq: PathSegment[] = [];
	console.debug(facets);

	const start =
		config?.range && config.range[0] > 0 && config.range[0] < facets[0].length - 1
			? config.range[0]
			: 0;
	const end =
		config?.range && config.range[1] > start && config.range[1] < facets[0].length - 1
			? config.range[1]
			: facets.length - 1;

	console.debug('generateFlowerOfLifeOutlinedBand', start, end, config);
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

	const svgPathString = svgPathStringFromSegments(pathSeq)
	return svgPathString;
};

export const svgPathStringFromSegments = (segments: PathSegment[]) =>
	segments.map((segment) => segment.join(' ')).join('\n');
