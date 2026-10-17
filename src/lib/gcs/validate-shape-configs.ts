import type { ShapeConfig } from '$lib/types';
import { effectiveGcsLevels, gcsLabel } from './gcs-placement';

export type GcsError = { index: number | null; message: string };
export type GcsValidation = {
	isValid: boolean;
	errors: GcsError[];
	levels: number[];
	bandCount: number;
};

/**
 * Pure validation of a globule's cross-section list. The caller supplies each
 * GCS's prototype vertex count (keeps this free of `generate-shape` imports).
 */
export function validateShapeConfigs(
	shapeConfigs: ShapeConfig[],
	vertexCounts: number[],
	divisions: number
): GcsValidation {
	const n = shapeConfigs.length;
	const levels = effectiveGcsLevels(shapeConfigs, divisions);
	const listErrors: GcsError[] = [];
	const itemErrors: GcsError[] = [];

	const primaries = shapeConfigs.reduce<number[]>(
		(acc, s, i) => (s.isPrimary ? [...acc, i] : acc),
		[]
	);
	const primaryIndex = n === 1 ? 0 : primaries.length === 1 ? primaries[0] : 0;
	const bandCount = n === 0 ? 0 : (vertexCounts[primaryIndex] ?? 0);

	if (n === 1) {
		if (vertexCounts[0] === 0)
			itemErrors.push({ index: 0, message: `${gcsLabel(0)} has no points` });
	} else {
		if (primaries.length !== 1) {
			listErrors.push({ index: null, message: 'Exactly one cross section must be primary' });
		}
		if (n > divisions + 1) {
			listErrors.push({
				index: null,
				message: `More cross sections (${n}) than silhouette levels (${divisions + 1})`
			});
		}
		for (let i = 0; i < n; i++) {
			const label = gcsLabel(i);
			const pinned = shapeConfigs[i].level;
			if (pinned != null && (!Number.isInteger(pinned) || pinned < 0 || pinned > divisions)) {
				itemErrors.push({
					index: i,
					message: `${label}: level ${pinned} is outside 0–${divisions}`
				});
			}
			const count = vertexCounts[i];
			if (count === 0) {
				itemErrors.push({ index: i, message: `${label} has no points` });
			} else if (primaries.length === 1 && count !== bandCount) {
				itemErrors.push({
					index: i,
					message: `${label} has ${count} points; primary has ${bandCount}`
				});
			}
			if (i > 0 && levels[i] <= levels[i - 1]) {
				itemErrors.push({
					index: i,
					message: `${label}: level ${levels[i]} must be above previous cross section (level ${levels[i - 1]})`
				});
			}
		}
	}

	const errors = [...listErrors, ...itemErrors];
	return { isValid: errors.length === 0, errors, levels, bandCount };
}
