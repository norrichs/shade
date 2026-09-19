import { Triangle, Vector3 } from 'three';
import type { PatternGenerationResult } from '$lib/cut-pattern/run-pattern-generation';

/**
 * Pattern results cross `postMessage`, which keeps own properties but drops
 * prototypes: every `Vector3` comes back as `{x, y, z}` and every `Triangle` as
 * `{a, b, c}`. Consumers on the main thread (panel distribution, registration
 * marks, quad rendering) call Three.js methods on these, so rebuild them.
 *
 * The walk is structural rather than schema driven so it covers cut patterns,
 * panel patterns, hinges, tabs and partner facets alike:
 *  - an object whose only keys are numeric `x`, `y`, `z` becomes a `Vector3`
 *  - an object whose only keys are `a`, `b`, `c`, each Vector3-like, becomes a `Triangle`
 *  - `PathSegment[]` arrays (`[['M', x, y], ...]`) are the bulk of the payload and
 *    contain nothing to rebuild, so they are skipped without descending.
 */

type Vec3Like = { x: number; y: number; z: number };

const isVec3Like = (v: unknown): v is Vec3Like => {
	if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
	const o = v as Record<string, unknown>;
	const keys = Object.keys(o);
	return (
		keys.length === 3 &&
		typeof o.x === 'number' &&
		typeof o.y === 'number' &&
		typeof o.z === 'number'
	);
};

const isTriangleLike = (v: unknown): v is { a: Vec3Like; b: Vec3Like; c: Vec3Like } => {
	if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
	const o = v as Record<string, unknown>;
	const keys = Object.keys(o);
	return (
		keys.length === 3 &&
		(isVec3Like(o.a) || o.a instanceof Vector3) &&
		(isVec3Like(o.b) || o.b instanceof Vector3) &&
		(isVec3Like(o.c) || o.c instanceof Vector3)
	);
};

const isPathSegmentArray = (v: unknown[]): boolean =>
	v.length > 0 && Array.isArray(v[0]) && typeof (v[0] as unknown[])[0] === 'string';

const toVector3 = (v: Vec3Like | Vector3) =>
	v instanceof Vector3 ? v : new Vector3(v.x, v.y, v.z);

export const rehydrateDeep = <T>(value: T): T => {
	if (value === null || typeof value !== 'object') return value;
	if (value instanceof Vector3 || value instanceof Triangle) return value;

	if (Array.isArray(value)) {
		if (isPathSegmentArray(value)) return value;
		for (let i = 0; i < value.length; i++) value[i] = rehydrateDeep(value[i]);
		return value;
	}

	if (isVec3Like(value)) return toVector3(value) as unknown as T;
	if (isTriangleLike(value)) {
		return new Triangle(toVector3(value.a), toVector3(value.b), toVector3(value.c)) as unknown as T;
	}

	const o = value as Record<string, unknown>;
	for (const key of Object.keys(o)) {
		const child = o[key];
		if (child !== null && typeof child === 'object') o[key] = rehydrateDeep(child);
	}
	return value;
};

export const rehydratePatternResult = (result: PatternGenerationResult): PatternGenerationResult =>
	rehydrateDeep(result);
