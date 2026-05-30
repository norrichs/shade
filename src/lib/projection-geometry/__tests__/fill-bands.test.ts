import { describe, it, expect } from '@jest/globals';
import { Triangle, Vector3 } from 'three';
import type { Band } from '$lib/types';
import type { Section } from '../types';
import {
	isDegenerateTriangle,
	outerBorderPolyline,
	FILL_DEGENERATE_EPSILON,
	buildFillBand,
	reindexBandAddresses
} from '../fill-bands';

describe('isDegenerateTriangle', () => {
	it('is false for a normal triangle', () => {
		const t = new Triangle(new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0));
		expect(isDegenerateTriangle(t)).toBe(false);
	});

	it('is true when two vertices coincide', () => {
		const c = new Vector3(2, 2, 2);
		const t = new Triangle(new Vector3(1, 0, 0), c.clone(), c.clone());
		expect(isDegenerateTriangle(t)).toBe(true);
	});

	it('respects the epsilon', () => {
		const t = new Triangle(
			new Vector3(0, 0, 0),
			new Vector3(FILL_DEGENERATE_EPSILON / 2, 0, 0),
			new Vector3(0, 1, 0)
		);
		expect(isDegenerateTriangle(t)).toBe(true);
	});
});

describe('outerBorderPolyline', () => {
	// 3 sections, each a 3-point column [first, mid, last].
	const sections: Section[] = [
		{ points: [new Vector3(0, 0, 0), new Vector3(0.5, 0, 0), new Vector3(1, 0, 0)] },
		{ points: [new Vector3(0, 1, 0), new Vector3(0.5, 1, 0), new Vector3(1, 1, 0)] },
		{ points: [new Vector3(0, 2, 0), new Vector3(0.5, 2, 0), new Vector3(1, 2, 0)] }
	];

	it('reads the first-band outer border (points[0] of each section)', () => {
		const edge = outerBorderPolyline(sections, 'first');
		expect(edge.map((v) => v.toArray())).toEqual([
			[0, 0, 0],
			[0, 1, 0],
			[0, 2, 0]
		]);
	});

	it('reads the last-band outer border (points[last] of each section)', () => {
		const edge = outerBorderPolyline(sections, 'last');
		expect(edge.map((v) => v.toArray())).toEqual([
			[1, 0, 0],
			[1, 1, 0],
			[1, 2, 0]
		]);
	});

	it('returns clones, not aliases', () => {
		const edge = outerBorderPolyline(sections, 'first');
		expect(edge[0]).not.toBe(sections[0].points[0]);
	});
});

describe('buildFillBand', () => {
	// Perimeter on the z=1 plane, center below it so outward (= away from origin projCenter) is +z.
	const P0 = new Vector3(-1, -1, 1);
	const P1 = new Vector3(1, -1, 1);
	const P2 = new Vector3(1, 1, 1);
	const center = new Vector3(0, 0, 1);
	const projCenter = new Vector3(0, 0, 0);
	const address = { globule: 0, tube: 3, band: 0 };

	it('produces alternating real and degenerate facets, 2 per segment', () => {
		const band = buildFillBand({ borderEdge: [P0, P1, P2], center, address, projCenter });
		// 2 segments → 4 facets
		expect(band.facets).toHaveLength(4);
		// Geometric reality matches the explicit tag.
		expect(isDegenerateTriangle(band.facets[0].triangle)).toBe(false);
		expect(isDegenerateTriangle(band.facets[1].triangle)).toBe(true);
		expect(isDegenerateTriangle(band.facets[2].triangle)).toBe(false);
		expect(isDegenerateTriangle(band.facets[3].triangle)).toBe(true);
	});

	it('tags degenerate facets explicitly and leaves real facets untagged', () => {
		const band = buildFillBand({ borderEdge: [P0, P1, P2], center, address, projCenter });
		expect(band.facets[0].isDegenerate).toBeFalsy();
		expect(band.facets[1].isDegenerate).toBe(true);
		expect(band.facets[2].isDegenerate).toBeFalsy();
		expect(band.facets[3].isDegenerate).toBe(true);
	});

	it('marks the band isFill and uses axial-right orientation', () => {
		const band = buildFillBand({ borderEdge: [P0, P1, P2], center, address, projCenter });
		expect(band.isFill).toBe(true);
		expect(band.orientation).toBe('axial-right');
		expect(band.facets[0].orientation).toBe('axial-right');
	});

	it('real facets include the center as the third vertex', () => {
		const band = buildFillBand({ borderEdge: [P0, P1, P2], center, address, projCenter });
		expect(band.facets[0].triangle.c.toArray()).toEqual(center.toArray());
	});

	it('assigns sequential facet addresses', () => {
		const band = buildFillBand({ borderEdge: [P0, P1, P2], center, address, projCenter });
		expect(band.facets[0].address).toEqual({ ...address, facet: 0 });
		expect(band.facets[3].address).toEqual({ ...address, facet: 3 });
	});

	it('winds real-facet normals outward (away from projCenter)', () => {
		const band = buildFillBand({ borderEdge: [P0, P1, P2], center, address, projCenter });
		const t = band.facets[0].triangle;
		const normal = new Vector3()
			.subVectors(t.b, t.a)
			.cross(new Vector3().subVectors(t.c, t.a));
		const facetCentroid = new Vector3().addVectors(t.a, t.b).add(t.c).divideScalar(3);
		const toFacet = new Vector3().subVectors(facetCentroid, projCenter);
		expect(normal.dot(toFacet)).toBeGreaterThan(0);
	});

	it('reverses the polyline so the fan winds outward regardless of input order', () => {
		// Same geometry as the outward case, but with the perimeter listed in the
		// opposite order so the *unreversed* first facet would face inward (dot < 0).
		const Q0 = new Vector3(1, 1, 1);
		const Q1 = new Vector3(1, -1, 1);
		const Q2 = new Vector3(-1, -1, 1);
		const c = new Vector3(0, 0, 1);
		const pc = new Vector3(0, 0, 0);
		const addr = { globule: 0, tube: 3, band: 0 };

		const band = buildFillBand({ borderEdge: [Q0, Q1, Q2], center: c, address: addr, projCenter: pc });

		// First real facet must wind outward after the internal reversal.
		const t = band.facets[0].triangle;
		const normal = new Vector3()
			.subVectors(t.b, t.a)
			.cross(new Vector3().subVectors(t.c, t.a));
		const facetCentroid = new Vector3().addVectors(t.a, t.b).add(t.c).divideScalar(3);
		const toFacet = new Vector3().subVectors(facetCentroid, pc);
		expect(normal.dot(toFacet)).toBeGreaterThan(0);

		// Proof of reversal: the first real facet's first vertex is the LAST input point.
		expect(t.a.toArray()).toEqual(Q2.toArray());
	});
});

describe('reindexBandAddresses', () => {
	it('renumbers each band and its facets to match array position', () => {
		const tubeAddress = { globule: 0, tube: 2 };
		const mk = (): Band => ({
			orientation: 'axial-right',
			facets: [
				{
					triangle: new Triangle(new Vector3(), new Vector3(1, 0, 0), new Vector3(0, 1, 0)),
					orientation: 'axial-right',
					address: { ...tubeAddress, band: 99, facet: 0 }
				}
			],
			address: { ...tubeAddress, band: 99 }
		});
		const bands = [mk(), mk(), mk()];
		reindexBandAddresses(bands, tubeAddress);
		expect(bands[0].address).toEqual({ ...tubeAddress, band: 0 });
		expect(bands[2].address).toEqual({ ...tubeAddress, band: 2 });
		expect(bands[2].facets[0].address).toEqual({ ...tubeAddress, band: 2, facet: 0 });
	});
});
