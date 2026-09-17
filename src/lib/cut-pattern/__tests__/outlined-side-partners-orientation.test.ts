import { describe, it, expect, beforeAll } from '@jest/globals';
import { Triangle, Vector3 } from 'three';
import { generateSuperGlobule } from '$lib/generate-superglobule';
import {
	generateDefaultGlobulePatternConfig,
	generateDefaultSuperGlobuleConfig
} from '$lib/shades-config';
import { getQuadrilaterals } from '$lib/patterns/quadrilateral';
import { matchGlobuleTubeFacets } from '$lib/projection-geometry/generate-projection';
import type { Section, Tube } from '$lib/projection-geometry/types';
import type { Band, Facet, FacetOrientation, PipelineGates } from '$lib/types';
import { getFlatStripV2 } from '../generate-cut-pattern';
import { bandHasPartners, getOutlineEdges } from '../generate-outlined-pattern';
import { chooseMiddleQuadEdge, middleQuadEdgeIndices } from '../select-middle-quad-edge';

/**
 * A band's side (outer) edge is `ac` only on axial-right bands; on axial-left
 * bands it is `bc` (EDGE_MAP, generate-projection.ts), and `getQuadrilaterals`
 * puts the before (a→d) edge on the ODD facet. The default superglobule uses
 * `tubeSymmetry: 'lateral'`, so bands 0-2 of each tube are axial-right and 3-5
 * axial-left. Reading `ac` on an axial-left band finds a within-band partner
 * (the facet's base or second edge), so the band names itself as its own side
 * neighbour.
 */

const gates: PipelineGates = {
	globule: false,
	globuleTube: false,
	projection: true,
	voronoi: false
};

describe('outlined side partners follow band orientation (real default geometry)', () => {
	let tubes: Tube[];

	beforeAll(() => {
		const superGlobule = generateSuperGlobule(generateDefaultSuperGlobuleConfig(), gates);
		tubes = superGlobule.projections[0].tubes;
	});

	/** The band as `generateOutlinedTubePattern` hands it to `getOutlineEdges`. */
	const flatten = (band: Band) => {
		const pixelScale = generateDefaultGlobulePatternConfig().patternConfig.pixelScale;
		const flat = getFlatStripV2(band, { bandStyle: 'helical-right', pixelScale });
		return { flat, quads: getQuadrilaterals(flat, pixelScale.value || 1, flat.sideOrientation) };
	};

	it('every side edge names band - 1 (before) or band + 1 (after), never itself', () => {
		const orientations = new Set<FacetOrientation>();
		const problems: string[] = [];
		tubes.forEach((tube, t) => {
			const bandCount = tube.bands.length;
			tube.bands.forEach((band, b) => {
				orientations.add(band.orientation);
				const { flat, quads } = flatten(band);
				const expected = {
					before: (b - 1 + bandCount) % bandCount,
					after: (b + 1) % bandCount
				};
				for (const edge of getOutlineEdges(quads, flat)) {
					if (edge.side === 'end') continue;
					if (edge.partnerBand !== expected[edge.side]) {
						problems.push(
							`t${t}/b${b} ${band.orientation} ${edge.side} q${edge.quad}: ${edge.partnerBand} ≠ ${expected[edge.side]}`
						);
					}
				}
			});
		});
		expect([...orientations].sort()).toEqual(['axial-left', 'axial-right']);
		expect(problems.slice(0, 10)).toEqual([]);
	});

	it('middle-quad edge: tier 3 (higher partner band) decides on an axial-left band', () => {
		// Tube 0 band 3 is axial-left; neighbours are b2 (before) and b4 (after).
		// With no tabs on either edge and both edges partnered, tier 3 picks the
		// higher partner band: the after edge.
		const band = tubes[0].bands[3];
		expect(band.orientation).toBe('axial-left');
		const { flat, quads } = flatten(band);
		const edges = getOutlineEdges(quads, flat);
		const { beforeIndex, afterIndex } = middleQuadEdgeIndices(quads.length);
		expect([edges[beforeIndex].partnerBand, edges[afterIndex].partnerBand]).toEqual([2, 4]);
		expect(chooseMiddleQuadEdge(quads.length, edges, new Set())).toBe(afterIndex);
	});

	it('guard: axial-right band 1 still reads b0 before and b2 after', () => {
		const band = tubes[0].bands[1];
		expect(band.orientation).toBe('axial-right');
		const { flat, quads } = flatten(band);
		const edges = getOutlineEdges(quads, flat);
		const { beforeIndex, afterIndex } = middleQuadEdgeIndices(quads.length);
		expect([edges[beforeIndex].partnerBand, edges[afterIndex].partnerBand]).toEqual([0, 2]);
		expect(chooseMiddleQuadEdge(quads.length, edges, new Set())).toBe(afterIndex);
	});
});

describe('bandHasPartners on an open-rim tube, both orientations', () => {
	const section = (): Section => ({
		points: [0, 1, 2, 3].map((x) => new Vector3(x, 0, 0))
	});

	/** Open tube (non-closing sections) whose bands all have `orientation`. */
	const openTube = (orientation: FacetOrientation, bandCount = 3, facetsPerBand = 6): Tube => {
		const bands: Band[] = [];
		for (let b = 0; b < bandCount; b++) {
			const facets: Facet[] = [];
			for (let f = 0; f < facetsPerBand; f++) {
				facets.push({
					triangle: new Triangle(new Vector3(), new Vector3(1, 0, 0), new Vector3(0, 1, 0)),
					address: { globule: 0, tube: 0, band: b, facet: f },
					orientation
				});
			}
			bands.push({ orientation, facets, visible: true });
		}
		const tube: Tube = {
			bands,
			sections: [section(), section()],
			orientation,
			address: { globule: 0, tube: 0 }
		};
		matchGlobuleTubeFacets(tube);
		return tube;
	};

	it.each(['axial-right', 'axial-left'] as const)(
		'%s: the first band has no before partner, the last no after partner',
		(orientation) => {
			const { bands } = openTube(orientation);
			expect(bands.map(bandHasPartners)).toEqual([
				{ before: false, after: true },
				{ before: true, after: true },
				{ before: true, after: false }
			]);
		}
	);
});
