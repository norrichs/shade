import { Triangle, Vector3 } from 'three';
import type { Band, Facet } from '$lib/types';
import type { Section, Tube } from '$lib/projection-geometry/types';
import { matchGlobuleTubeFacets, pruneOuterPartnersOutsideSet } from '../generate-projection';

const square = (closed: boolean): Section => {
	const pts = [
		new Vector3(0, 0, 0),
		new Vector3(1, 0, 0),
		new Vector3(1, 1, 0),
		new Vector3(0, 1, 0)
	];
	return { points: closed ? [...pts, pts[0].clone()] : pts };
};

/**
 * Triangles are irrelevant to meta assignment — only counts, orientation,
 * address and `isDegenerate` matter — so they are placeholders here.
 */
const makeTube = (bandCount: number, facetsPerBand: number, closed: boolean): Tube => {
	const bands: Band[] = [];
	for (let b = 0; b < bandCount; b++) {
		const facets: Facet[] = [];
		for (let f = 0; f < facetsPerBand; f++) {
			facets.push({
				triangle: new Triangle(new Vector3(), new Vector3(1, 0, 0), new Vector3(0, 1, 0)),
				address: { globule: 0, tube: 0, band: b, facet: f },
				orientation: 'axial-right'
			});
		}
		bands.push({ orientation: 'axial-right', facets, visible: true });
	}
	return {
		bands,
		sections: [square(closed), square(closed)],
		orientation: 'axial-right',
		address: { globule: 0, tube: 0 }
	};
};

// For 'axial-right' (EDGE_MAP in generate-projection.ts): even facets use base
// 'ab', second 'bc'; odd use base 'bc', second 'ab'. Both parities use outer 'ac'.
//
// Band step direction, which drives every wrap expectation below:
//   bandOffset = (orientation === 'axial-left' ? -1 : 1) * (isEven ? -1 : 1)
// so for 'axial-right', EVEN facets step -1 and ODD facets step +1.
const OUTER = 'ac';

describe('matchGlobuleTubeFacets — closed tube', () => {
	it('gives every facet an outer partner, wrapping at both ends', () => {
		const tube = makeTube(4, 6, true);
		matchGlobuleTubeFacets(tube);
		tube.bands.forEach((band) => {
			band.facets.forEach((facet) => {
				expect(facet.meta?.[OUTER]?.partner).toBeDefined();
			});
		});
		// even facets step -1, so band 0's wrap backward lands on band 3
		expect(tube.bands[0].facets[0].meta?.[OUTER]?.partner?.band).toBe(3);
		// odd facets step +1, so band 3's wrap forward lands on band 0
		expect(tube.bands[3].facets[1].meta?.[OUTER]?.partner?.band).toBe(0);
	});

	it('omits base on the first facet and second on the last facet of each band', () => {
		const tube = makeTube(3, 6, true);
		matchGlobuleTubeFacets(tube);
		tube.bands.forEach((band) => {
			// facet 0 is even -> base 'ab'; facet 5 is odd -> second 'ab'
			expect(band.facets[0].meta?.ab).toBeUndefined();
			expect(band.facets[5].meta?.ab).toBeUndefined();
		});
	});

	it('links interior facets to their neighbours within the band', () => {
		const tube = makeTube(2, 6, true);
		matchGlobuleTubeFacets(tube);
		const facet = tube.bands[0].facets[2]; // even: base 'ab', second 'bc'
		expect(facet.meta?.ab?.partner?.facet).toBe(1);
		expect(facet.meta?.bc?.partner?.facet).toBe(3);
		expect(facet.meta?.ab?.partner?.band).toBe(0);
	});
});

describe('matchGlobuleTubeFacets — open tube', () => {
	it('omits the outer partner where the step would wrap past the ends', () => {
		const tube = makeTube(4, 6, false);
		matchGlobuleTubeFacets(tube);
		// even facets step -1, so band 0 would go to -1
		expect(tube.bands[0].facets[0].meta?.[OUTER]).toBeUndefined();
		// odd facets step +1, so band 3 would go to 4
		expect(tube.bands[3].facets[1].meta?.[OUTER]).toBeUndefined();
	});

	it('leaves the in-range neighbours of those same bands intact', () => {
		const tube = makeTube(4, 6, false);
		matchGlobuleTubeFacets(tube);
		// band 0's odd facets step +1 to band 1 — in range
		expect(tube.bands[0].facets[1].meta?.[OUTER]?.partner?.band).toBe(1);
		// band 3's even facets step -1 to band 2 — in range
		expect(tube.bands[3].facets[0].meta?.[OUTER]?.partner?.band).toBe(2);
	});

	it('still links interior bands across the seam', () => {
		const tube = makeTube(4, 6, false);
		matchGlobuleTubeFacets(tube);
		expect(tube.bands[1].facets[0].meta?.[OUTER]?.partner?.band).toBe(0);
		expect(tube.bands[2].facets[1].meta?.[OUTER]?.partner?.band).toBe(3);
	});
});

describe('matchGlobuleTubeFacets — degenerate facets', () => {
	it('skips them and leaves their meta untouched', () => {
		const tube = makeTube(2, 6, true);
		tube.bands[0].facets[0].isDegenerate = true;
		tube.bands[0].facets[0].meta = undefined;
		matchGlobuleTubeFacets(tube);
		expect(tube.bands[0].facets[0].meta).toBeUndefined();
		expect(tube.bands[0].facets[1].meta).toBeDefined();
	});
});

describe('pruneOuterPartnersOutsideSet', () => {
	it('drops outer partners pointing at bands that were filtered out', () => {
		const tube = makeTube(5, 6, true);
		matchGlobuleTubeFacets(tube);
		const rendered = tube.bands.slice(1, 4); // bands 1, 2, 3 survive
		pruneOuterPartnersOutsideSet(rendered);
		// band 1's even facets step -1 to band 0, which is gone
		expect(rendered[0].facets[0].meta?.[OUTER]).toBeUndefined();
		// band 3's odd facets step +1 to band 4, which is gone
		expect(rendered[2].facets[1].meta?.[OUTER]).toBeUndefined();
	});

	it('keeps outer partners pointing inside the rendered set', () => {
		const tube = makeTube(5, 6, true);
		matchGlobuleTubeFacets(tube);
		const rendered = tube.bands.slice(1, 4);
		pruneOuterPartnersOutsideSet(rendered);
		// band 1's odd facets step +1 to band 2
		expect(rendered[0].facets[1].meta?.[OUTER]?.partner?.band).toBe(2);
		// band 2's even facets step -1 to band 1
		expect(rendered[1].facets[0].meta?.[OUTER]?.partner?.band).toBe(1);
	});

	it('leaves base and second partners alone', () => {
		const tube = makeTube(5, 6, true);
		matchGlobuleTubeFacets(tube);
		const rendered = tube.bands.slice(1, 4);
		pruneOuterPartnersOutsideSet(rendered);
		expect(rendered[0].facets[2].meta?.ab?.partner?.facet).toBe(1);
		expect(rendered[0].facets[2].meta?.bc?.partner?.facet).toBe(3);
	});

	it('is a no-op when every band is rendered', () => {
		const tube = makeTube(4, 6, true);
		matchGlobuleTubeFacets(tube);
		pruneOuterPartnersOutsideSet(tube.bands);
		tube.bands.forEach((band) =>
			band.facets.forEach((facet) => expect(facet.meta?.[OUTER]).toBeDefined())
		);
	});
});
