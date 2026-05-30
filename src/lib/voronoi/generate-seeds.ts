import { Vector3 } from 'three';
import type {
	SeedMethod,
	CenterProjectionSeedMethod,
	AreaWeightedSeedMethod,
	SurfaceTriangle
} from './types';

export const AREA_SCALE = 1000;

export type AreaTableEntry = {
	keyStart: number;
	width: number;
	triangle: SurfaceTriangle;
};

export function triangleArea(triangle: SurfaceTriangle): number {
	const [a, b, c] = triangle;
	const ab = b.clone().sub(a);
	const ac = c.clone().sub(a);
	return ab.cross(ac).length() / 2;
}

export function buildAreaTable(triangles: SurfaceTriangle[]): {
	entries: AreaTableEntry[];
	totalArea: number;
} {
	const entries: AreaTableEntry[] = [];
	let cumulative = 0;
	for (const triangle of triangles) {
		const width = Math.max(1, Math.floor(triangleArea(triangle) * AREA_SCALE));
		entries.push({ keyStart: cumulative, width, triangle });
		cumulative += width;
	}
	return { entries, totalArea: cumulative };
}

type SurfaceIntersector = (direction: Vector3) => Vector3 | null;

function mulberry32(seed: number): () => number {
	let s = seed | 0;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function randomUnitVector(random: () => number): Vector3 {
	const theta = random() * Math.PI * 2;
	const z = random() * 2 - 1;
	const r = Math.sqrt(1 - z * z);
	return new Vector3(r * Math.cos(theta), r * Math.sin(theta), z);
}

function generateCenterProjectionSeeds(
	method: CenterProjectionSeedMethod,
	center: Vector3,
	intersect: SurfaceIntersector
): Vector3[] {
	const random = mulberry32(method.seed);
	const seeds: Vector3[] = [];

	let attempts = 0;
	const maxAttempts = method.pointCount * 10;

	while (seeds.length < method.pointCount && attempts < maxAttempts) {
		const direction = randomUnitVector(random);
		const point = intersect(direction);
		if (point) {
			seeds.push(point);
		}
		attempts++;
	}

	return seeds;
}

function findEntry(entries: AreaTableEntry[], r: number): AreaTableEntry {
	let lo = 0;
	let hi = entries.length - 1;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		const entry = entries[mid];
		if (r < entry.keyStart) {
			hi = mid - 1;
		} else if (r >= entry.keyStart + entry.width) {
			lo = mid + 1;
		} else {
			return entry;
		}
	}
	return entries[lo];
}

function barycentricPoint(triangle: SurfaceTriangle, t: number): Vector3 {
	const [a, b, c] = triangle;
	let u = t;
	let v = (t * 7919) % 1;
	if (u + v > 1) {
		u = 1 - u;
		v = 1 - v;
	}
	return a.clone().addScaledVector(b.clone().sub(a), u).addScaledVector(c.clone().sub(a), v);
}

export function generateAreaWeightedSeeds(
	method: AreaWeightedSeedMethod,
	surfaceTriangles: SurfaceTriangle[]
): Vector3[] {
	if (surfaceTriangles.length === 0) return [];
	const { entries, totalArea } = buildAreaTable(surfaceTriangles);
	const random = mulberry32(method.seed);
	const seeds: Vector3[] = [];
	for (let i = 0; i < method.pointCount; i++) {
		const r = Math.floor(random() * totalArea);
		const entry = findEntry(entries, r);
		const t = (r - entry.keyStart) / entry.width;
		seeds.push(barycentricPoint(entry.triangle, t));
	}
	return seeds;
}

export function generateSeeds(
	method: SeedMethod,
	center: Vector3,
	intersect: SurfaceIntersector,
	surfaceTriangles: SurfaceTriangle[]
): Vector3[] {
	switch (method.type) {
		case 'centerProjection':
			return generateCenterProjectionSeeds(method, center, intersect);
		case 'areaWeighted':
			return generateAreaWeightedSeeds(method, surfaceTriangles);
		default:
			throw new Error(`Unknown seed method: ${(method as SeedMethod).type}`);
	}
}
