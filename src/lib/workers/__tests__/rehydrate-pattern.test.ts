import { Triangle, Vector3 } from 'three';
import { rehydrateDeep, rehydratePatternResult } from '../rehydrate-pattern';
import type { PatternGenerationResult } from '$lib/cut-pattern/run-pattern-generation';

/** Simulate a structured-clone round trip: prototypes are lost, own props remain. */
const roundTrip = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe('rehydrateDeep', () => {
	it('rebuilds {x,y,z} objects as Vector3', () => {
		const out = rehydrateDeep(roundTrip({ center: new Vector3(1, 2, 3) }));
		expect(out.center).toBeInstanceOf(Vector3);
		expect(out.center.toArray()).toEqual([1, 2, 3]);
	});

	it('rebuilds {a,b,c} of vectors as Triangle', () => {
		const tri = new Triangle(new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0));
		const out = rehydrateDeep(roundTrip({ triangle: tri }));
		expect(out.triangle).toBeInstanceOf(Triangle);
		expect(out.triangle.getArea()).toBeCloseTo(0.5);
	});

	it('keeps a quadrilateral as a plain object with Vector3 corners', () => {
		const quad = { a: new Vector3(), b: new Vector3(1, 0, 0), c: new Vector3(1, 1, 0), d: new Vector3(0, 1, 0) };
		const out = rehydrateDeep(roundTrip({ quad }));
		expect(out.quad).not.toBeInstanceOf(Triangle);
		expect(out.quad.d).toBeInstanceOf(Vector3);
		expect(out.quad.d.clone().sub(out.quad.a).length()).toBe(1);
	});

	it('leaves 2D points and path segments untouched', () => {
		const input = {
			tagAnchorPoint: { x: 1, y: 2 },
			path: [
				['M', 0, 0],
				['L', 1, 1]
			],
			label: 'x'
		};
		const out = rehydrateDeep(roundTrip(input));
		expect(out).toEqual(input);
		expect(out.tagAnchorPoint).not.toBeInstanceOf(Vector3);
	});

	it('does not convert objects that carry extra keys', () => {
		const out = rehydrateDeep(roundTrip({ p: { x: 1, y: 2, z: 3, w: 4 } }));
		expect(out.p).not.toBeInstanceOf(Vector3);
	});

	it('walks arrays and nested tuples', () => {
		const tris: [Triangle, Triangle] = [
			new Triangle(new Vector3(), new Vector3(1, 0, 0), new Vector3(0, 1, 0)),
			new Triangle(new Vector3(), new Vector3(2, 0, 0), new Vector3(0, 2, 0))
		];
		const out = rehydrateDeep(roundTrip({ facets: [{ triangles: tris }] }));
		expect(out.facets[0].triangles[1]).toBeInstanceOf(Triangle);
		expect(out.facets[0].triangles[1].getArea()).toBeCloseTo(2);
	});

	it('is idempotent on already-live objects', () => {
		const live = { v: new Vector3(1, 1, 1) };
		expect(rehydrateDeep(live).v).toBe(live.v);
	});
});

describe('rehydratePatternResult', () => {
	it('rehydrates bounds centers and facet triangles across every variant', () => {
		const band = {
			id: 'b',
			bounds: { left: 0, top: 0, width: 1, height: 1, center: new Vector3(0.5, 0.5, 0) },
			facets: [
				{
					label: 'f',
					path: [['M', 0, 0]],
					triangle: new Triangle(new Vector3(), new Vector3(1, 0, 0), new Vector3(0, 1, 0))
				}
			]
		};
		const result = roundTrip({
			superGlobulePattern: { type: 'SuperGlobulePattern', superGlobuleConfigId: 'c', bandPatterns: [band] },
			projectionPattern: undefined,
			globuleTubePattern: null,
			surfaceProjectionPattern: undefined,
			voronoiPattern: {
				type: 'SuperGlobuleProjectionCutPattern',
				superGlobuleConfigId: 'c',
				projectionCutPattern: { address: { globule: 0 }, tubes: [{ bands: [band] }] }
			},
			voronoiSurfacePattern: undefined
		}) as unknown as PatternGenerationResult;

		const out = rehydratePatternResult(result) as unknown as {
			superGlobulePattern: { bandPatterns: typeof band[] };
			voronoiPattern: { projectionCutPattern: { tubes: { bands: typeof band[] }[] } };
		};
		expect(out.superGlobulePattern.bandPatterns[0].bounds.center).toBeInstanceOf(Vector3);
		const vb = out.voronoiPattern.projectionCutPattern.tubes[0].bands[0];
		expect(vb.facets[0].triangle).toBeInstanceOf(Triangle);
		expect(vb.facets[0].path).toEqual([['M', 0, 0]]);
	});
});
