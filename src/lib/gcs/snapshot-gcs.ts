import { Vector2, Vector3 } from 'three';
import type { GlobuleConfig, ShapeConfig } from '#lib/types.js';
import type { ImportedMeshNormalize } from '#lib/projection-geometry/types.js';
import { normalizeMatrix } from '#lib/mesh-import/normalize.js';
import { generateSilhouette } from '#lib/generate-shape.js';
import { silhouetteLevelSamples } from '#lib/generate-level.js';
import { sliceMeshAtZ } from './slice-mesh';
import { largestLoop, resampleByArcLength, signedArea, startIndexedLoop } from './outline';
import { shapeConfigFromPoints } from './shape-from-points';

/**
 * Silhouette levels narrower than this fraction of the widest level don't set
 * xMin, so a silhouette tapering to a pole doesn't blow every other slice up.
 */
export const X_MIN_THRESHOLD = 0.05;

/** Second-largest outline area at or above this fraction of the largest → warn of switching. */
const SIMILAR_AREA_RATIO = 0.8;

export type SnapshotInput = {
	globule: GlobuleConfig;
	mesh: { positions: Float32Array; index: Uint32Array };
	normalize: ImportedMeshNormalize;
	bandCount: number;
};

export type SnapshotResult =
	{ ok: true; shapeConfigs: ShapeConfig[]; warnings: string[] } | { ok: false; errors: string[] };

const fittedPositions = (positions: Float32Array, normalize: ImportedMeshNormalize) => {
	const matrix = normalizeMatrix(normalize);
	const out = new Float32Array(positions.length);
	const v = new Vector3();
	for (let i = 0; i < positions.length; i += 3) {
		v.set(positions[i], positions[i + 1], positions[i + 2]).applyMatrix4(matrix);
		out[i] = v.x;
		out[i + 1] = v.y;
		out[i + 2] = v.z;
	}
	return out;
};

const pipelineWarnings = (globule: GlobuleConfig): string[] => {
	const warnings: string[] = [];
	if (globule.levelConfig.silhouetteSampleMethod.method === 'preserveAspectRatio') {
		warnings.push(
			'Preserve aspect ratio sampling: generated rings will not sit exactly on the slice planes.'
		);
	}
	const { depthCurveBaseline, curves } = globule.depthCurveConfig;
	if (curves.some((curve) => curve.points.some((p) => p.x !== depthCurveBaseline))) {
		warnings.push('The depth curve is not neutral: generated rings will not match the slices.');
	}
	const offsetsNeutral = globule.levelConfig.levelOffsets.every(
		(o) =>
			o.x === 0 &&
			o.y === 0 &&
			o.z === 0 &&
			o.rotX === 0 &&
			o.rotY === 0 &&
			o.rotZ === 0 &&
			o.scaleX === 1 &&
			o.scaleY === 1
	);
	if (!offsetsNeutral) {
		warnings.push(
			'Level offsets are not neutral: generated rings will not match the slices (rotation adds twist).'
		);
	}
	return warnings;
};

/**
 * Slices the model at each silhouette level and writes one asymmetric GCS per
 * level (spec: docs/superpowers/specs/2026-10-17-globule-from-model-design.md).
 * The silhouette's y range maps onto the model's height; slice points are scaled
 * by silhouette height ÷ model height and by 100 / xMin, so the generator's
 * `p / 200 · 2x` puts each ring at `k · x / xMin` times the model outline.
 */
export function snapshotGcsFromModel({
	globule,
	mesh,
	normalize,
	bandCount
}: SnapshotInput): SnapshotResult {
	if (!Number.isInteger(bandCount) || bandCount < 3) {
		return { ok: false, errors: ['Bands must be a whole number of at least 3.'] };
	}

	const positions = fittedPositions(mesh.positions, normalize);
	let zMin = Infinity;
	let zMax = -Infinity;
	for (let i = 2; i < positions.length; i += 3) {
		zMin = Math.min(zMin, positions[i]);
		zMax = Math.max(zMax, positions[i]);
	}
	if (!(zMax > zMin)) return { ok: false, errors: ['The model has no height to slice.'] };

	const samples = silhouetteLevelSamples(
		generateSilhouette(globule.silhouetteConfig),
		globule.levelConfig.silhouetteSampleMethod
	);
	const ys = samples.map((s) => s.y);
	const yMin = Math.min(...ys);
	const yMax = Math.max(...ys);
	if (!(yMax > yMin)) return { ok: false, errors: ['The silhouette has no height.'] };
	const k = (yMax - yMin) / (zMax - zMin);

	const xMax = Math.max(...samples.map((s) => s.x));
	const eligible = samples.map((s) => xMax > 0 && s.x >= X_MIN_THRESHOLD * xMax);
	if (!eligible.some(Boolean)) {
		return { ok: false, errors: ['The silhouette has no width to scale slices by.'] };
	}
	const xMin = Math.min(...samples.filter((_, i) => eligible[i]).map((s) => s.x));
	const scale = (k * 100) / xMin;

	const epsilon = 1e-4 * (zMax - zMin);
	const planeZ = (y: number) =>
		Math.min(
			Math.max(zMin + ((y - yMin) / (yMax - yMin)) * (zMax - zMin), zMin + epsilon),
			zMax - epsilon
		);

	const errors: string[] = [];
	const warnings: string[] = [];
	const sliced: (Vector2[] | undefined)[] = samples.map((sample, i) => {
		if (sample.x <= 0) return undefined;
		const { loops, openChains } = sliceMeshAtZ(positions, mesh.index, planeZ(sample.y));
		if (loops.length === 0) {
			if (eligible[i]) {
				errors.push(
					openChains > 0
						? `Level ${i}: the slice does not close (is the model watertight, without non-manifold edges?).`
						: `Level ${i}: the slice plane misses the model.`
				);
			}
			return undefined;
		}
		// Stray open parts (decals, open bases) don't block a level that has a closed outline.
		if (openChains > 0) {
			warnings.push(
				`Level ${i}: ignored ${openChains} open edge chain${openChains === 1 ? '' : 's'}.`
			);
		}
		if (loops.length > 1) {
			warnings.push(`Level ${i}: kept the largest of ${loops.length} outlines.`);
			const [first, second] = loops.map((loop) => Math.abs(signedArea(loop))).sort((a, b) => b - a);
			if (second >= SIMILAR_AREA_RATIO * first) {
				warnings.push(
					`Level ${i}: the two largest outlines are similar in size; the kept one may switch between levels.`
				);
			}
		}
		return resampleByArcLength(startIndexedLoop(largestLoop(loops)), bandCount).map((p) =>
			p.multiplyScalar(scale)
		);
	});
	if (errors.length > 0) return { ok: false, errors };

	const nearestSliced = (i: number): Vector2[] => {
		for (let d = 1; d < samples.length; d++) {
			const below = sliced[i - d];
			if (below) return below;
			const above = sliced[i + d];
			if (above) return above;
		}
		throw new Error('unreachable: an eligible level was sliced');
	};

	const firstId = Math.max(0, ...globule.shapeConfigs.map((s) => s.id ?? 0)) + 1;
	const shapeConfigs = samples.map((_, i) =>
		shapeConfigFromPoints(sliced[i] ?? nearestSliced(i), {
			id: firstId + i,
			level: i,
			isPrimary: i === 0
		})
	);
	return { ok: true, shapeConfigs, warnings: [...pipelineWarnings(globule), ...warnings] };
}
