/**
 * Helpers for editing a surface / polyhedron `TransformConfig`.
 *
 * `transform` is typed `TransformConfig | 'inherit'`. `prepareProjectionConfig`
 * resolves `'inherit'` to the projection-level `meta.transform`
 * (`generate-projection.ts:112-117`) — but that is the hardcoded identity
 * constant `flattenedDefaultTransform` (`configs.ts:55`), it has no editor
 * anywhere in the app, and nothing in the codebase ever assigns it. So
 * `'inherit'` does not mean "follows something"; it means "pinned to identity,
 * with the Translate/Scale controls hidden because there is no object to bind
 * to".
 *
 * Materialising it gives those panels something editable while rendering
 * identically, since the seed is the same identity the resolution produced.
 */
import type { TransformConfig } from '$lib/projection-geometry/types';

export const identityTransform = (): TransformConfig => ({
	translate: { x: 0, y: 0, z: 0 },
	scale: { x: 1, y: 1, z: 1 },
	rotate: { x: 0, y: 0, z: 0 }
});

/**
 * Return the transform unchanged, or a fresh identity when it is `'inherit'`.
 * Never returns the same object twice for `'inherit'`, so callers can assign the
 * result without aliasing one transform across several configs.
 */
export const materializeTransform = (
	transform: TransformConfig | 'inherit' | undefined
): TransformConfig => (!transform || transform === 'inherit' ? identityTransform() : transform);

export const isInheritedTransform = (transform: TransformConfig | 'inherit' | undefined): boolean =>
	!transform || transform === 'inherit';
