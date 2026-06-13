import { Vector3 } from 'three';
import { collectRenderedPoints } from '../collect-rendered-points';
import type { SuperGlobule } from '../types';

// Minimal facet/band/tube shapes — collectRenderedPoints only reads
// facet.triangle.{a,b,c}, so the rest of the structure is irrelevant here.
const facet = (n: number) => ({
	triangle: { a: new Vector3(n, 0, 0), b: new Vector3(0, n, 0), c: new Vector3(0, 0, n) }
});
const tube = (...ns: number[]) => ({ bands: [{ facets: ns.map(facet) }] });

const sg = (over: Partial<SuperGlobule>): SuperGlobule =>
	({ type: 'SuperGlobule', projections: [], ...over }) as unknown as SuperGlobule;

describe('collectRenderedPoints', () => {
	test('voronoiSurface reads voronoiResult.surfaceProjectionTubes', () => {
		const model = sg({
			voronoiResult: {
				tubes: [tube(1)],
				surfaceProjectionTubes: [tube(5, 6)],
				surface: {} as never
			} as never
		});
		const pts = collectRenderedPoints(model, 'voronoiSurface');
		// two facets × three triangle points
		expect(pts).toHaveLength(6);
		expect(pts.map((p) => p.x)).toContain(5);
		expect(pts.map((p) => p.x)).toContain(6);
		// must NOT include the (non-surface) voronoi tubes point (x=1)
		expect(pts.map((p) => p.x)).not.toContain(1);
	});

	test('projection reads projections[0].tubes', () => {
		const model = sg({
			projections: [{ tubes: [tube(2)], surfaceProjectionTubes: [] } as never]
		});
		const pts = collectRenderedPoints(model, 'projection');
		expect(pts).toHaveLength(3);
		expect(pts[0]).toBeInstanceOf(Vector3);
	});

	test('returns empty when the active source has no geometry (caller falls back)', () => {
		const model = sg({ projections: [] });
		expect(collectRenderedPoints(model, 'voronoi')).toHaveLength(0);
		expect(collectRenderedPoints(model, 'projection')).toHaveLength(0);
	});
});
