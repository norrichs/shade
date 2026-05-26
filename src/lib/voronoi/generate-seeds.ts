import { Vector3 } from 'three';
import type { SeedMethod, CenterProjectionSeedMethod } from './types';

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

export function generateSeeds(
	method: SeedMethod,
	center: Vector3,
	intersect: SurfaceIntersector
): Vector3[] {
	switch (method.type) {
		case 'centerProjection':
			return generateCenterProjectionSeeds(method, center, intersect);
		default:
			throw new Error(`Unknown seed method: ${(method as SeedMethod).type}`);
	}
}
