import { generateSilhouette } from '$lib/generate-shape';
import type { GlobuleConfig } from '$lib/types';
import { gcsLabel } from './gcs-placement';
import type { GcsValidation } from './validate-shape-configs';

export type GcsMarker = {
	label: string;
	level: number;
	t: number;
	isPrimary: boolean;
	invalid: boolean;
	point: { x: number; y: number };
};

/**
 * Where each cross section sits on the silhouette curve. Plain objects only, so
 * the result is safe to hold in runes. Empty for a single cross section.
 */
export function gcsMarkers(globule: GlobuleConfig, validation: GcsValidation): GcsMarker[] {
	const { shapeConfigs } = globule;
	if (shapeConfigs.length <= 1) return [];
	const { method, divisions } = globule.levelConfig.silhouetteSampleMethod;
	const silhouette = generateSilhouette(globule.silhouetteConfig);
	const invalidIndices = new Set(validation.errors.map((e) => e.index));
	// Same sampling rule as generateRawLevels.
	const sample = (t: number) =>
		method === 'divideCurve' ? silhouette.getPoint(t) : silhouette.getPointAt(t);

	return shapeConfigs.flatMap((shape, i) => {
		const level = validation.levels[i];
		// An invalid list can leave a level missing or NaN; there is nowhere to draw it.
		if (!Number.isFinite(level)) return [];
		const t = level / divisions;
		const p = sample(t);
		return [
			{
				label: gcsLabel(i),
				level,
				t,
				isPrimary: !!shape.isPrimary,
				invalid: invalidIndices.has(i),
				point: { x: p.x, y: p.y }
			}
		];
	});
}
