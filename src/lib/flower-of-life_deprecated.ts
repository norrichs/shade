import { Vector2, Triangle, CircleGeometry } from 'three';
import { getPathFromPoints } from './util';

export type FlowerOfLifeConfig = {
	mode?: PatternMode;
	width?: number;
	frequency?: PatternFrequency;
	edge?: {
		ab?: EdgeType;
		bc?: EdgeType;
		ac?: EdgeType;
	};
}
type PatternMode = 'layout' | 'contained' | 'contributing';
type PatternFrequency = 1 | 2 | 3;
type EdgeType = 'open' | 'closed';

interface TriangleVertices {
	a: Vector2;
	b: Vector2;
	c: Vector2;
}

type FlowerOfLifeLayout = {
	a: Vector2;
	b: Vector2;
	c: Vector2;
	ab?: Vector2;
	bc?: Vector2;
	ac?: Vector2;
	aab?: Vector2;
	abb?: Vector2;
	bbc?: Vector2;
	bcc?: Vector2;
	aac?: Vector2;
	acc?: Vector2;
};

type FlowerOfLifePattern =
	| {
			mode: 'layout';
			triangle: string;
			circles: { x: number; y: number; r: number }[];
	  }
	| {
			mode: 'contained';
			triangle: string;
			circles?: { x: number; y: number; r: number }[];
			holes: string[];
	  };

export type DeformedFlowerOfLifePattern = FlowerOfLifePattern & {
	scale: { x: number; y: number };
	rotation: number;
	skewX: number;
};

const configDefaults: FlowerOfLifeConfig = {
	mode: 'contained',
	width: 0.5,
	frequency: 2,
	edge: { ab: 'open', bc: 'open', ac: 'open' }
};

const midPoint = (p1: Vector2, p2: Vector2): Vector2 => {
	return new Vector2((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
};


// reflect opposite around line segment p1 -> p2
const reflected = (p1: Vector2, p2: Vector2, opposite: Vector2): Vector2 => {
	const mid = midPoint(p1, p2);
	const midToOpposite = opposite.clone().addScaledVector(mid, -1);
	return mid.addScaledVector(midToOpposite, -1);
};

// Implement this so that it can take ANY triangle and output TriangleVertices, not just a Triangle with z === 0
const getTriangleVerticesFromTriangle = (t: Triangle): TriangleVertices => {
	if (t.a.z !== 0 || t.b.z !== 0 || t.c.z !== 0) {
		throw new Error('input triangle is not 2d ready');
	}
	return {
		a: new Vector2(t.a.x, t.a.y),
		b: new Vector2(t.b.x, t.b.y),
		c: new Vector2(t.c.x, t.c.y)
	};
};
const arcCircle = (c: [number, number, number]): string => {
	const [x, y, r] = c;
	return `M ${x + r} ${y}
          A ${r} ${r} 0 0 0 ${x - r} ${y}
          A ${r} ${r} 0 0 0 ${x + r} ${y}
          z 
  `;
};

interface Circle { x: number; y: number; r: number; }

const intersectCircles = (c1: Vector2, c2: Vector2, r: number): [Vector2, Vector2] => {
	console.debug("intersectCircles", c1, c2, r)
	const vec = c2.clone().addScaledVector(c1, -1)
	console.debug("vec", vec)
	const d = vec.length() / 2;
	console.debug(d, r)
	const a = Math.acos(d / r)
	console.debug("d, a", d, a)
	vec.setLength(r)
	return [vec.clone().rotateAround(c1, a), vec.rotateAround(c1, -a)]
}


// const skew = (angle: number, )

const generateFlowerOfLifeHoles = (centers: FlowerOfLifeLayout, config: FlowerOfLifeConfig) => {
	console.debug('generateFlowerOfLifeHoles stub');
	console.debug("a to b dist", centers.a.distanceTo(centers.b))
	const radius = centers.a.distanceTo(centers.b) / (config.frequency || 1);
	
	const width = config.width || radius / 10;
	const innerRadius = radius - width / 2;
	console.debug("radius", radius, "innerRadius", innerRadius)
	const outerRadius = radius + width / 2;

	// intersect a & bc
	if (centers.a && centers.bc) {
		const [ip1, ip2] = intersectCircles(centers.a, centers.bc, innerRadius)
		const almond = `M ${ip1.x} ${ip1.y} 
										A ${innerRadius} ${innerRadius} 0 0 0 ${ip2.x} ${ip2.y}
										A ${innerRadius} ${innerRadius} 0 0 0 ${ip1.x} ${ip1.y}
										z`
		console.debug("Almond -", almond)
		return [almond]
	}
	

	// return Object.values(centers).map((c) => arcCircle([c.x, c.y, radius]));
};	


const generateFlowerOfLifePattern = (
	configParam: FlowerOfLifeConfig,
	triangle: TriangleVertices | Triangle
): FlowerOfLifePattern => {
	const config = { ...configDefaults, ...configParam };

	const centers: FlowerOfLifeLayout =
		triangle instanceof Triangle
			? getTriangleVerticesFromTriangle(triangle)
			: { a: triangle.a.clone(), b: triangle.b.clone(), c: triangle.c.clone() };

	centers.ab = midPoint(centers.a, centers.b);
	centers.ac = midPoint(centers.a, centers.c);
	centers.bc = midPoint(centers.b, centers.c);

	if (config.frequency && config.frequency >= 2) {
		centers.aab = reflected(centers.a, centers.ab, centers.ac);
		centers.abb = reflected(centers.b, centers.ab, centers.bc);
		centers.aac = reflected(centers.a, centers.ac, centers.ab);
		centers.acc = reflected(centers.c, centers.ac, centers.bc);
		centers.bbc = reflected(centers.b, centers.bc, centers.ab);
		centers.bcc = reflected(centers.c, centers.bc, centers.ac);
	}
	console.debug('config.mode', config.mode);
	const r = centers.ab.distanceTo(centers.a);
	if (config.mode === 'layout') {
		return {
			mode: 'layout',
			triangle: getPathFromPoints([centers.a, centers.b, centers.c]),
			circles: Object.values(centers).map((c) => ({ x: c.x, y: c.y, r }))
		};
	}
	return {
		mode: 'contained',
		triangle: getPathFromPoints([centers.a, centers.b, centers.c]),
		circles: Object.values(centers).map((c) => ({ x: c.x, y: c.y, r })),
		holes: generateFlowerOfLifeHoles(centers, config)
	};
};
const unitTriangle: TriangleVertices = {
	a: new Vector2(0, 0),
	b: new Vector2(10, 0),
	c: new Vector2(5, 8.66025403784439)
};
const unitFlowerOfLifePattern = generateFlowerOfLifePattern(configDefaults, unitTriangle);
console.debug("UNIT FLOWER OF LIFE PATTERN")



// New algo
//  params config and a triangle
//  return unit flower pattern and transform params

export const flowerOfLife = (
	configParam: FlowerOfLifeConfig,
	triangleParam: TriangleVertices | Triangle
): DeformedFlowerOfLifePattern => {
	console.debug('flowerOfLife configParams', configParam);
	const config = { ...configDefaults, ...configParam };
	const triangle: FlowerOfLifeLayout =
		triangleParam instanceof Triangle
			? getTriangleVerticesFromTriangle(triangleParam)
			: { a: triangleParam.a.clone(), b: triangleParam.b.clone(), c: triangleParam.c.clone() };

	console.debug('flowerOfLife', config, triangle);

	const AB = triangle.b.clone().addScaledVector(triangle.a, -1);
	const AC = triangle.c.clone().addScaledVector(triangle.a, -1);
	const angleA = Math.abs(AB.angle() - AC.angle());
	console.debug('angleA', angleA);
	const scaleX = triangle.a.distanceTo(triangle.b);
	const scaleY = triangle.a.distanceTo(triangle.c) * Math.sin(angleA);
	const rotation = (AB.angle() * 180) / Math.PI;

	const mid = AB.clone().setLength(AB.length() / 2);
	const midC = triangle.c.clone().addScaledVector(mid, -1);
	console.debug(
		'mid',
		mid,
		'midC',
		midC,
		(mid.angle() * 180) / Math.PI,
		(midC.angle() * 180) / Math.PI
	);
	const skewX = ((Math.abs(mid.angle() - midC.angle()) * 180) / Math.PI) % 90;

	return {
		...unitFlowerOfLifePattern,
		scale: { x: scaleX, y: scaleY },
		rotation,
		skewX
	};
};
