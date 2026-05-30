import { describe, it, expect } from '@jest/globals';
import { Triangle, Vector3 } from 'three';
import type { Band } from '$lib/types';
import { getFlatStripV2 } from '../generate-cut-pattern';

const allFinite = (t: Triangle): boolean =>
	[t.a, t.b, t.c].every((v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z));

describe('getFlatStripV2 with degenerate fill facets', () => {
	// Fan band: real (P0,P1,C), degenerate (P1,C,C), real (P1,P2,C), degenerate (P2,C,C).
	const P0 = new Vector3(0, 0, 0);
	const P1 = new Vector3(1, 0, 0);
	const P2 = new Vector3(2, 0, 0);
	const C = new Vector3(1, -1, 0);
	const band: Band = {
		orientation: 'axial-right',
		isFill: true,
		facets: [
			{ triangle: new Triangle(P0.clone(), P1.clone(), C.clone()), orientation: 'axial-right' },
			{
				triangle: new Triangle(P1.clone(), C.clone(), C.clone()),
				orientation: 'axial-right',
				isDegenerate: true
			},
			{ triangle: new Triangle(P1.clone(), P2.clone(), C.clone()), orientation: 'axial-right' },
			{
				triangle: new Triangle(P2.clone(), C.clone(), C.clone()),
				orientation: 'axial-right',
				isDegenerate: true
			}
		]
	};

	it('produces only finite coordinates (no NaN)', () => {
		const flat = getFlatStripV2(band, { bandStyle: 'helical-right' });
		expect(flat.facets).toHaveLength(4);
		for (const f of flat.facets) {
			expect(allFinite(f.triangle)).toBe(true);
		}
	});

	it('degenerate facet is placed on the shared base edge (not fully collapsed)', () => {
		// For axial-right odd facet (i=1), the base points are p0='b', p1='c'.
		// The guard places: Triangle(base.v0, base.v1, base.v1).
		// Without the guard the three vertices all collapse to the same point.
		// Verify that at least two distinct points exist in the degenerate facet's flat triangle.
		const flat = getFlatStripV2(band, { bandStyle: 'helical-right' });
		const degFacet = flat.facets[1]; // first degenerate (index 1)
		const { a, b, c } = degFacet.triangle;
		// b and c should be coincident (guard produces v1, v1 for p1, p2)
		expect(b.distanceTo(c)).toBeCloseTo(0, 5);
		// a should NOT be coincident with b (otherwise vertices are all the same point)
		expect(a.distanceTo(b)).toBeGreaterThan(1e-4);
	});

	it('leaves a normal band finite', () => {
		const normal: Band = {
			orientation: 'axial-right',
			facets: [
				{ triangle: new Triangle(P0.clone(), P1.clone(), C.clone()), orientation: 'axial-right' },
				{ triangle: new Triangle(P1.clone(), C.clone(), P2.clone()), orientation: 'axial-right' }
			]
		};
		const flat = getFlatStripV2(normal, { bandStyle: 'helical-right' });
		for (const f of flat.facets) expect(allFinite(f.triangle)).toBe(true);
	});
});
