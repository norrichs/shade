import type { ShapeConfig } from '$lib/types';

/** 'A', 'B', ... for a GCS index. */
export const gcsLabel = (index: number): string => String.fromCharCode(65 + index);

/**
 * Silhouette level for each GCS. Unpinned levels are spread evenly between
 * their pinned neighbours; the first defaults to 0 and the last to `divisions`.
 * A null or undefined level means auto (JSON patches can only write null).
 * A single GCS always sits at level 0. No validation.
 */
export function effectiveGcsLevels(
	shapeConfigs: { level?: ShapeConfig['level'] | null }[],
	divisions: number
): number[] {
	const n = shapeConfigs.length;
	if (n === 0) return [];
	if (n === 1) return [0];

	const p: (number | undefined)[] = shapeConfigs.map((s) => s.level ?? undefined);
	if (p[0] === undefined) p[0] = 0;
	if (p[n - 1] === undefined) p[n - 1] = divisions;

	let a = 0;
	for (let i = 1; i < n; i++) {
		if (p[i] === undefined) continue;
		for (let k = 1; k < i - a; k++) {
			p[a + k] = Math.round(
				(p[a] as number) + (((p[i] as number) - (p[a] as number)) * k) / (i - a)
			);
		}
		a = i;
	}
	return p as number[];
}
