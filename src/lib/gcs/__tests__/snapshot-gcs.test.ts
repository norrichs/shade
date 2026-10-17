import { describe, it, expect } from '@jest/globals';

import { snapshotGcsFromModel, X_MIN_THRESHOLD, type SnapshotInput } from '../snapshot-gcs';
import { silhouetteLevelSamples } from '../../generate-level';
import {
	generateGlobuleTube,
	generateSilhouette,
	validateGlobuleShapeConfigs
} from '../../generate-shape';
import { generateDefaultGlobuleConfig } from '../../shades-config';
import type { GlobuleConfig, ShapeConfig } from '../../types';
import type { ImportedMeshNormalize } from '../../projection-geometry/types';
import {
	coneMesh,
	cylinderMesh,
	cylinderWithOpenStripMesh,
	openTubeMesh,
	twoCylindersMesh,
	type TestMesh
} from './mesh-fixtures';

const identity: ImportedMeshNormalize = {
	upAxis: '+z',
	targetSize: 20,
	offset: { x: 0, y: 0, z: 0 },
	scale: 1
};

/** The default silhouette closes to a pole at both ends; open it so end sections carry shape. */
const openEnded = (): GlobuleConfig => {
	const config = generateDefaultGlobuleConfig();
	const points = config.silhouetteConfig.curves[0].points;
	points[0].x = 30;
	points[points.length - 1].x = 30;
	return config;
};

const withDivisions = (config: GlobuleConfig, divisions: number): GlobuleConfig => {
	config.levelConfig.silhouetteSampleMethod = { method: 'divideCurve', divisions };
	return config;
};

const run = (globule: GlobuleConfig, mesh: TestMesh, bandCount = 48) =>
	snapshotGcsFromModel({ globule, mesh, normalize: identity, bandCount } satisfies SnapshotInput);

const snapshotOk = (globule: GlobuleConfig, mesh: TestMesh, bandCount = 48) => {
	const result = run(globule, mesh, bandCount);
	if (!result.ok) throw new Error(result.errors.join('; '));
	return result;
};

const withShapes = (globule: GlobuleConfig, shapeConfigs: ShapeConfig[]): GlobuleConfig => ({
	...structuredClone(globule),
	shapeConfigs
});

const samplesOf = (globule: GlobuleConfig) =>
	silhouetteLevelSamples(
		generateSilhouette(globule.silhouetteConfig),
		globule.levelConfig.silhouetteSampleMethod
	);

/** Mean XY distance from the globule axis of each generated ring. */
const ringRadii = (globule: GlobuleConfig) =>
	generateGlobuleTube(globule).sections.map((s) => {
		const ring = s.points.slice(0, -1);
		return ring.reduce((sum, p) => sum + Math.hypot(p.x, p.y), 0) / ring.length;
	});

const span = (values: number[]) => Math.max(...values) - Math.min(...values);

const flipSilhouette = (globule: GlobuleConfig): GlobuleConfig => {
	const next = structuredClone(globule);
	next.silhouetteConfig.curves = next.silhouetteConfig.curves
		.reverse()
		.map((curve) => ({ ...curve, points: [...curve.points].reverse() as typeof curve.points }));
	return next;
};

describe('snapshotGcsFromModel', () => {
	it('scales slices by the proportion factor and x / xMin', () => {
		const globule = openEnded();
		const { shapeConfigs, warnings } = snapshotOk(globule, cylinderMesh(5, 20, 48));
		expect(warnings).toEqual([]);

		const samples = samplesOf(globule);
		const xs = samples.map((s) => s.x);
		const k = span(samples.map((s) => s.y)) / 20;
		const xMin = Math.min(...xs.filter((x) => x >= X_MIN_THRESHOLD * Math.max(...xs)));
		ringRadii(withShapes(globule, shapeConfigs)).forEach((radius, i) => {
			const expected = (5 * k * samples[i].x) / xMin;
			expect(radius / expected).toBeCloseTo(1, 2);
		});
	});

	it('writes one pinned GCS per level with level 0 primary', () => {
		const globule = openEnded();
		const divisions = globule.levelConfig.silhouetteSampleMethod.divisions;
		const { shapeConfigs } = snapshotOk(globule, cylinderMesh());
		expect(shapeConfigs).toHaveLength(divisions + 1);
		expect(shapeConfigs.map((s) => s.level)).toEqual(
			Array.from({ length: divisions + 1 }, (_, i) => i)
		);
		expect(shapeConfigs.filter((s) => s.isPrimary)).toEqual([shapeConfigs[0]]);
		expect(new Set(shapeConfigs.map((s) => s.id)).size).toBe(divisions + 1);
		expect(validateGlobuleShapeConfigs(withShapes(globule, shapeConfigs)).errors).toEqual([]);
	});

	it('slices in the direction the silhouette runs', () => {
		// Cone apex is +Z. Ring radius relative to silhouette x tracks the cone's width.
		const relativeEnds = (globule: GlobuleConfig) => {
			const { shapeConfigs } = snapshotOk(globule, coneMesh(5, 20, 48));
			const radii = ringRadii(withShapes(globule, shapeConfigs));
			const xs = samplesOf(globule).map((s) => s.x);
			return [radii[0] / xs[0], radii[radii.length - 1] / xs[xs.length - 1]];
		};
		const [first, last] = relativeEnds(openEnded());
		const [flippedFirst, flippedLast] = relativeEnds(flipSilhouette(openEnded()));
		expect(Math.sign(first - last)).toBe(-Math.sign(flippedFirst - flippedLast));
	});

	it('ignores near-pole levels when choosing xMin', () => {
		// Find a sampling of the default (pole-to-pole) silhouette with a level in (0, threshold).
		const globule = [10, 20, 40, 80, 160]
			.map((d) => withDivisions(generateDefaultGlobuleConfig(), d))
			.find((g) => {
				const xs = samplesOf(g).map((s) => s.x);
				const max = Math.max(...xs);
				return xs.some((x) => x > 0 && x < X_MIN_THRESHOLD * max);
			});
		expect(globule).toBeDefined();
		const g = globule!;
		const samples = samplesOf(g);
		const xs = samples.map((s) => s.x);
		const xMax = Math.max(...xs);
		const xMin = Math.min(...xs.filter((x) => x >= X_MIN_THRESHOLD * xMax));
		const k = span(samples.map((s) => s.y)) / 20;

		const { shapeConfigs } = snapshotOk(g, cylinderMesh(5, 20, 48));
		const radii = ringRadii(withShapes(g, shapeConfigs));
		const reference = xs.indexOf(xMin);
		expect(radii[reference] / (5 * k)).toBeCloseTo(1, 2);
		radii.forEach((r) => expect(r).toBeLessThanOrEqual(((5 * k * xMax) / xMin) * 1.001));
	});

	it('copies the neighbouring slice into x = 0 pole levels', () => {
		const globule = generateDefaultGlobuleConfig();
		const xs = samplesOf(globule).map((s) => s.x);
		expect(xs[0]).toBe(0);
		const result = run(globule, coneMesh(5, 20, 48));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const last = xs.length - 1;
		expect(result.shapeConfigs[0].curves).toEqual(result.shapeConfigs[1].curves);
		expect(result.shapeConfigs[last].curves).toEqual(result.shapeConfigs[last - 1].curves);
		expect(result.shapeConfigs[0].level).toBe(0);
	});

	it('keeps the largest of several outlines and warns', () => {
		const result = run(openEnded(), twoCylindersMesh());
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.warnings.some((w) => /kept the largest of 2 outlines/.test(w))).toBe(true);
	});

	it('keeps a closed outline when a stray open part also crosses the level', () => {
		const result = run(openEnded(), cylinderWithOpenStripMesh());
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.warnings.some((w) => /ignored 1 open edge chain/.test(w))).toBe(true);
	});

	it('warns when the two largest outlines are similar in size', () => {
		const result = run(openEnded(), twoCylindersMesh(3, 3.1));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.warnings.some((w) => /similar in size/.test(w))).toBe(true);
	});

	it('fails on an open mesh, naming the level', () => {
		const result = run(openEnded(), openTubeMesh());
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors.some((e) => /^Level \d+/.test(e))).toBe(true);
	});

	it('rejects fewer than 3 bands', () => {
		expect(run(openEnded(), cylinderMesh(), 2).ok).toBe(false);
	});

	it('re-snapshots cleanly after silhouette divisions change', () => {
		const globule = withDivisions(openEnded(), 6);
		const first = snapshotOk(globule, cylinderMesh());
		const edited = withDivisions(withShapes(globule, first.shapeConfigs), 10);
		const second = snapshotOk(edited, cylinderMesh());
		expect(second.shapeConfigs).toHaveLength(11);
		expect(validateGlobuleShapeConfigs(withShapes(edited, second.shapeConfigs)).errors).toEqual([]);
	});

	it('warns for preserveAspectRatio sampling', () => {
		const globule = openEnded();
		globule.levelConfig.silhouetteSampleMethod = { method: 'preserveAspectRatio', divisions: 10 };
		const { warnings } = snapshotOk(globule, cylinderMesh());
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toMatch(/preserve aspect ratio/i);
	});

	it('warns for a non-neutral depth curve', () => {
		const globule = openEnded();
		globule.depthCurveConfig.curves[0].points[1].x = 150;
		const { warnings } = snapshotOk(globule, cylinderMesh());
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toMatch(/depth/i);
	});
});
