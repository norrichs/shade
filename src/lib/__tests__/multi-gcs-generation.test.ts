import { describe, it, expect } from '@jest/globals';
import type { Vector3 } from 'three';

import { generateGlobuleTube } from '../generate-shape';
import { generateDefaultGlobuleConfig, generateDefaultRadialShapeConfig } from '../shades-config';
import type { GlobuleConfig, ShapeConfig } from '../types';

const radial = (sides: number, divisions: number): ShapeConfig =>
	generateDefaultRadialShapeConfig(sides, { method: 'divideSide', divisions });

const withShapes = (shapeConfigs: ShapeConfig[], config = generateDefaultGlobuleConfig()) => {
	const next: GlobuleConfig = structuredClone(config);
	next.shapeConfigs = shapeConfigs;
	return next;
};

type Sectionish = { points: Vector3[] };

const pts = (section: Sectionish) => section.points.map((p) => p.toArray().slice(0, 3));

const expectSectionsClose = (a: number[][], b: number[][]) => {
	expect(a).toHaveLength(b.length);
	a.forEach((p, i) => p.forEach((c, j) => expect(c).toBeCloseTo(b[i][j], 9)));
};

/** Size/position-independent radial profile of a section. */
const profile = (s: Sectionish) => {
	const ps = s.points.slice(0, -1);
	const cx = ps.reduce((sum, p) => sum + p.x, 0) / ps.length;
	const cy = ps.reduce((sum, p) => sum + p.y, 0) / ps.length;
	const r = ps.map((p) => Math.hypot(p.x - cx, p.y - cy));
	const max = Math.max(...r);
	return r.map((v) => v / max);
};

/** The default silhouette closes to a pole at both ends; open it so end sections carry shape. */
const openEnded = () => {
	const config = generateDefaultGlobuleConfig();
	const points = config.silhouetteConfig.curves[0].points;
	points[0].x = 30;
	points[points.length - 1].x = 30;
	return config;
};

describe('multi-GCS generation', () => {
	const A: ShapeConfig = { ...radial(5, 6), isPrimary: true };
	const B: ShapeConfig = radial(6, 5);

	it('5x6 to 6x5', () => {
		const base = openEnded();
		const tube = generateGlobuleTube(withShapes([A, B], base));
		tube.sections.forEach((s) => expect(s.points).toHaveLength(31));

		const aOnly = generateGlobuleTube(withShapes([A], base));
		const bOnly = generateGlobuleTube(withShapes([{ ...B, isPrimary: true }], base));
		// Guard against a vacuous comparison: the two single-GCS ends really differ.
		const last0 = aOnly.sections.length - 1;
		expect(profile(aOnly.sections[last0])).not.toEqual(profile(bOnly.sections[last0]));
		expectSectionsClose(pts(tube.sections[0]), pts(aOnly.sections[0]));
		const last = tube.sections.length - 1;
		expectSectionsClose(pts(tube.sections[last]), pts(bOnly.sections[last]));
	});

	it('invalid throws', () => {
		const mismatch = radial(6, 6); // 36 points
		expect(() => generateGlobuleTube(withShapes([A, mismatch]))).toThrow(
			'B has 36 points; primary has 30'
		);
	});

	it('preserveAspectRatio blends', () => {
		const base = generateDefaultGlobuleConfig();
		base.levelConfig.silhouetteSampleMethod = { method: 'preserveAspectRatio', divisions: 12 };
		let tube: ReturnType<typeof generateGlobuleTube> | undefined;
		expect(() => {
			tube = generateGlobuleTube(withShapes([A, B], base));
		}).not.toThrow();
		const sections = tube!.sections;
		sections.forEach((s) => expect(s.points).toHaveLength(31));

		// Ends may collapse to a pole; compare the first and last non-degenerate sections.
		const open = sections.filter((s) => profile(s).every(Number.isFinite));
		const pf = profile(open[0]);
		const pl = profile(open[open.length - 1]);
		const diff = Math.max(...pf.map((v, i) => Math.abs(v - pl[i])));
		expect(diff).toBeGreaterThan(1e-3);
	});
});
