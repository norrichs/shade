import {
	Mesh,
	Object3D,
	SphereGeometry,
	PlaneGeometry,
	MeshBasicMaterial,
	DoubleSide,
	Triangle,
	Vector3
} from 'three';
import type { VoronoiConfig } from '../types';
import type { GlobuleAddress } from '$lib/projection-geometry/types';
import type { Band, Facet, FacetOrientation } from '$lib/types';

// Mock generate-projection to avoid Svelte store transitive deps
jest.mock('$lib/projection-geometry/generate-projection', () => {
	const {
		SphereGeometry,
		MeshBasicMaterial,
		DoubleSide: DS,
		Mesh,
		Object3D,
		Triangle,
		Vector3
	} = require('three');

	return {
		generateSurface: jest.fn(() => {
			const surface = new Object3D();
			const geometry = new SphereGeometry(400, 32, 32);
			const material = new MeshBasicMaterial({ side: DS });
			const mesh = new Mesh(geometry, material);
			surface.add(mesh);
			surface.updateMatrixWorld(true);
			return surface;
		}),

		generateProjectionBands: jest.fn(
			(
				sections: { points: Vector3[] }[],
				orientation: FacetOrientation,
				tubeAddress: { globule: number; tube: number },
				_tubeSymmetry?: string
			): Band[] => {
				const bands: Band[] = [];
				const pointsPerSection = sections[0].points.length;

				for (let f = 0; f < pointsPerSection - 1; f++) {
					const bandAddress = { ...tubeAddress, band: bands.length };
					const facets: Facet[] = [];

					for (let s = 0; s < sections.length - 1; s++) {
						const p0 = sections[s].points[f];
						const p1 = sections[s].points[f + 1];
						const p2 = sections[s + 1].points[f];
						const p3 = sections[s + 1].points[f + 1];

						facets.push({
							triangle: new Triangle(p0.clone(), p1.clone(), p2.clone()),
							address: { ...bandAddress, facet: facets.length },
							orientation
						});
						facets.push({
							triangle: new Triangle(p3.clone(), p2.clone(), p1.clone()),
							address: { ...bandAddress, facet: facets.length },
							orientation
						});
					}

					bands.push({ orientation, facets, visible: true, address: bandAddress });
				}

				return bands;
			}
		),

		getEdge: jest.fn((edgeType: string, parity: string | number, orientation: string) => {
			const EDGE_MAP: Record<string, Record<string, Record<string, string>>> = {
				'axial-right': {
					even: { base: 'ab', second: 'bc', outer: 'ac' },
					odd: { base: 'bc', second: 'ab', outer: 'ac' }
				},
				'axial-left': {
					even: { base: 'ab', second: 'ac', outer: 'bc' },
					odd: { base: 'ac', second: 'ab', outer: 'bc' }
				},
				circumferential: {
					even: { base: 'ac', second: 'bc', outer: 'ab' },
					odd: { base: 'bc', second: 'ac', outer: 'ab' }
				}
			};
			const p = typeof parity === 'number' ? (parity % 2 === 0 ? 'even' : 'odd') : parity;
			return EDGE_MAP[orientation]?.[p]?.[edgeType] ?? 'ab';
		}),

		getEdgeMatchedTriangles: jest.fn(
			(t0: typeof Triangle.prototype, t1: typeof Triangle.prototype, _edgeToMatch?: string) => {
				const PRECISION = 1 / 10_000;
				const isSame = (v0: Vector3, v1: Vector3) =>
					Math.abs(v0.x - v1.x) < PRECISION &&
					Math.abs(v0.y - v1.y) < PRECISION &&
					Math.abs(v0.z - v1.z) < PRECISION;

				const matched = ['', ''];
				const t0Points = ['a', 'b', 'c'] as const;

				for (const side0 of t0Points) {
					for (const side1 of t0Points) {
						if (isSame(t0[side0], t1[side1])) {
							matched[0] += side0;
							matched[1] += side1;
						}
					}
				}

				if (matched[0].length !== 2 || matched[1].length !== 2) return false;

				const normalize = (edge: string) => {
					const [a, b] = edge.split('');
					return a < b ? edge : b + a;
				};
				return { t0: normalize(matched[0]), t1: normalize(matched[1]) };
			}
		)
	};
});

// Also mock materials (transitive dep)
jest.mock('../../../components/three-renderer/materials', () => ({
	materials: {
		default: {}
	}
}));

// Mock generate-pattern (transitive dep of generate-projection)
jest.mock('$lib/cut-pattern/generate-pattern', () => ({
	corrected: jest.fn((e: string) => e),
	getTrianglePointAsKVFromTriangleEdge: jest.fn(),
	getTrianglePointFromTriangleEdge: jest.fn()
}));

// Mock stores
jest.mock('$lib/stores/superGlobuleStores', () => ({}));
jest.mock('$lib/stores/selectionStores', () => ({}));

import { makeVoronoi, matchFacets } from '../generate-voronoi';
import * as geodesicModule from '../geodesic/geodesic-voronoi';
import {
	generateSurface,
	generateProjectionBands
} from '$lib/projection-geometry/generate-projection';
import { OPENING } from '$lib/types';

const testSurfaceConfig = {
	type: 'SphereConfig' as const,
	radius: 400,
	center: { x: 0.001, y: 0.001, z: 0.001 },
	transform: {
		translate: { x: 0, y: 0, z: 0 },
		scale: { x: 1, y: 1, z: 1 },
		rotate: { x: 0, y: 0, z: 0 }
	}
};

const makeTestConfig = (): VoronoiConfig => ({
	type: 'VoronoiConfig',
	meta: {
		transform: {
			translate: { x: 0, y: 0, z: 0 },
			scale: { x: 1, y: 1, z: 1 },
			rotate: { x: 0, y: 0, z: 0 }
		}
	},
	seedConfig: {
		type: 'VoronoiSeedConfig',
		seedMethod: {
			type: 'centerProjection',
			pointCount: 8,
			seed: 42
		},
		relaxationIterations: 3
	},
	crossSectionConfig: {
		curves: [
			{
				type: 'BezierConfig',
				points: [
					{ type: 'PointConfig2', x: 0, y: 0 },
					{ type: 'PointConfig2', x: 0.33, y: 0 },
					{ type: 'PointConfig2', x: 0.66, y: 0 },
					{ type: 'PointConfig2', x: 1, y: 0 }
				]
			}
		],
		center: { x: 0.5, y: 0 },
		sampleMethod: { method: 'divideCurvePath', divisions: 3 },
		scaling: { width: 5, height: 5 },
		shouldSkewCurve: false
	},
	bandConfig: {
		orientation: 'axial-right',
		tubeSymmetry: 'lateral'
	},
	edgeDivisions: [4, 4],
	curveOffsetFactor: 0.3,
	surfaceProjectionDivisions: 0,
	voronoiMethod: 'spherical',
	insetMethod: 'centerOut'
});

describe('makeVoronoi', () => {
	it('returns tubes and surface', () => {
		const address: GlobuleAddress = { globule: 0 };
		const result = makeVoronoi(makeTestConfig(), address, testSurfaceConfig);
		expect(result.tubes).toBeDefined();
		expect(result.surface).toBeDefined();
		expect(Array.isArray(result.tubes)).toBe(true);
	});

	it('generates at least one tube', () => {
		const address: GlobuleAddress = { globule: 0 };
		const result = makeVoronoi(makeTestConfig(), address, testSurfaceConfig);
		expect(result.tubes.length).toBeGreaterThan(0);
	});

	it('each tube has bands with facets', () => {
		const address: GlobuleAddress = { globule: 0 };
		const result = makeVoronoi(makeTestConfig(), address, testSurfaceConfig);
		result.tubes.forEach((tube) => {
			expect(tube.bands.length).toBeGreaterThan(0);
			tube.bands.forEach((band) => {
				expect(band.facets.length).toBeGreaterThan(0);
			});
		});
	});

	it('each tube has sections with points', () => {
		const address: GlobuleAddress = { globule: 0 };
		const result = makeVoronoi(makeTestConfig(), address, testSurfaceConfig);
		result.tubes.forEach((tube) => {
			expect(tube.sections.length).toBeGreaterThan(0);
			tube.sections.forEach((section) => {
				expect(section.points.length).toBeGreaterThan(0);
			});
		});
	});

	it('facets have triangle geometry', () => {
		const address: GlobuleAddress = { globule: 0 };
		const result = makeVoronoi(makeTestConfig(), address, testSurfaceConfig);
		const facet = result.tubes[0].bands[0].facets[0];
		expect(facet.triangle).toBeDefined();
		expect(facet.triangle.a).toBeDefined();
		expect(facet.triangle.b).toBeDefined();
		expect(facet.triangle.c).toBeDefined();
	});

	it('generates tubes with insetMethod localProjection', () => {
		const address: GlobuleAddress = { globule: 0 };
		const config: VoronoiConfig = { ...makeTestConfig(), insetMethod: 'localProjection' };
		const result = makeVoronoi(config, address, testSurfaceConfig);
		expect(result.tubes.length).toBeGreaterThan(0);
		result.tubes.forEach((tube) => {
			tube.bands.forEach((band) => expect(band.facets.length).toBeGreaterThan(0));
		});
	});

	// Regression: a surfaceProjection section's profile (cA -> divA -> edge -> divB -> cB) must not
	// fold back on itself. A fold-back makes generateProjectionBands emit overlapping bands
	// (z-fighting), which happens at surfaceProjectionDivisions >= 2 when the cA-side division list
	// is reversed. We measure the turn between consecutive profile segments: a benign bend (e.g. the
	// ~95deg kink at the edge centerline) keeps the direction dot well above -0.5, whereas the
	// reversal bug produces a ~180deg fold-back with a dot of -1. Threshold -0.5 (no turn sharper
	// than 120deg) separates the two with large margin in both directions.
	it('surfaceProjection sections do not fold back (no band overlap with divisions)', () => {
		const address: GlobuleAddress = { globule: 0 };
		const config: VoronoiConfig = { ...makeTestConfig(), surfaceProjectionDivisions: 3 };
		const result = makeVoronoi(config, address, testSurfaceConfig);

		expect(result.surfaceProjectionTubes.length).toBeGreaterThan(0);

		result.surfaceProjectionTubes.forEach((tube) => {
			tube.sections.forEach((section) => {
				const pts = section.points;
				for (let i = 2; i < pts.length; i++) {
					const a = pts[i - 1].clone().sub(pts[i - 2]);
					const b = pts[i].clone().sub(pts[i - 1]);
					if (a.lengthSq() < 1e-12 || b.lengthSq() < 1e-12) continue;
					const fold = a.normalize().dot(b.normalize());
					expect(fold).toBeGreaterThan(-0.5);
				}
			});
		});
	});

	it('generates tubes with insetMethod localProjection + curvedInset', () => {
		const address: GlobuleAddress = { globule: 0 };
		const config: VoronoiConfig = {
			...makeTestConfig(),
			insetMethod: 'localProjection',
			curvedInset: true
		};
		const result = makeVoronoi(config, address, testSurfaceConfig);
		expect(result.tubes.length).toBeGreaterThan(0);
		result.tubes.forEach((tube) => {
			tube.bands.forEach((band) => expect(band.facets.length).toBeGreaterThan(0));
		});
	});

	it('matchFacets does not throw on a degenerate facet with partial meta', () => {
		// Regression: degenerate (synthetic fill) facets carry partial meta from
		// matchTubeEnds and must be excluded from the cross-band pass. Previously the
		// cross-band pass dereferenced `facetB.meta[match.t1].partner` on a key the
		// partial meta lacked → "surface projection partner matching error".
		// facetA (band 0, non-degenerate) shares edge with facetB (band 1, degenerate).
		// Per the mocked getEdgeMatchedTriangles this matches facetA edge 'ab' to
		// facetB edge 'bc' — a key absent from facetB's partial meta {ab:{...}}.
		const facetA: Facet = {
			triangle: new Triangle(
				new Vector3(1, 0, 0),
				new Vector3(1, 1, 0),
				new Vector3(5, 5, 0)
			),
			address: { globule: 0, tube: 0, band: 0, facet: 0 },
			orientation: 'axial-right'
		};
		const facetB: Facet = {
			triangle: new Triangle(
				new Vector3(0, 0, 0),
				new Vector3(1, 0, 0),
				new Vector3(1, 1, 0)
			),
			address: { globule: 0, tube: 0, band: 1, facet: 0 },
			orientation: 'axial-right',
			isDegenerate: true,
			// Partial meta as matchTubeEnds would leave it (only the 'ab' key).
			meta: { ab: { partner: { globule: 0, tube: 9, band: 0, facet: 0, edge: 'ab' } } } as Facet['meta']
		};
		const tube = {
			bands: [
				{ orientation: 'axial-right', facets: [facetA], visible: true, address: { globule: 0, tube: 0, band: 0 } },
				{ orientation: 'axial-right', facets: [facetB], visible: true, address: { globule: 0, tube: 0, band: 1 } }
			],
			sections: [],
			orientation: 'axial-right' as const,
			address: { globule: 0, tube: 0 }
		} as unknown as Parameters<typeof matchFacets>[0][number];

		expect(() => matchFacets([tube])).not.toThrow();
	});

	it('generates tubes via the geodesic pipeline (center-free)', () => {
		const base = makeTestConfig();
		const config = {
			...base,
			voronoiMethod: 'geodesic' as const,
			insetMethod: 'localProjection' as const,
			seedConfig: {
				...base.seedConfig,
				seedMethod: { type: 'areaWeighted' as const, pointCount: 8, seed: 7 }
			}
		};
		// Spy proves the geodesic front-half is actually taken (not the center-based
		// fallthrough, which would also produce tubes and mask a regression).
		const spy = jest.spyOn(geodesicModule, 'generateGeodesicVoronoi');
		const result = makeVoronoi(config, { globule: 0 }, testSurfaceConfig);
		expect(spy).toHaveBeenCalledTimes(1);
		// One tube per geodesic boundary edge.
		const { edges } = spy.mock.results[0].value as { edges: unknown[] };
		expect(result.tubes.length).toBe(edges.length);
		expect(result.tubes.length).toBeGreaterThan(0);
		for (const tube of result.tubes) {
			expect(tube.bands.length).toBeGreaterThan(0);
			for (const band of tube.bands) expect(band.facets.length).toBeGreaterThan(0);
		}
		spy.mockRestore();
	});

	it('builds a one-sided tube for rim (opening-sentinel) edges', () => {
		// Open plane surface -> geodesic produces both cell-cell and rim edges.
		const openSurface = new Object3D();
		openSurface.add(
			new Mesh(new PlaneGeometry(800, 800, 6, 6), new MeshBasicMaterial({ side: DoubleSide }))
		);
		openSurface.updateMatrixWorld(true);
		(generateSurface as jest.Mock).mockReturnValueOnce(openSurface);

		const base = makeTestConfig();
		const config = {
			...base,
			voronoiMethod: 'geodesic' as const,
			insetMethod: 'localProjection' as const,
			seedConfig: {
				...base.seedConfig,
				seedMethod: { type: 'areaWeighted' as const, pointCount: 10, seed: 5 }
			}
		};

		(generateProjectionBands as jest.Mock).mockClear();
		const result = makeVoronoi(config, { globule: 0 }, testSurfaceConfig);

		expect(result.tubes.length).toBeGreaterThan(0);
		for (const tube of result.tubes) expect(tube.bands.length).toBeGreaterThan(0);

		// A symmetric (cell-cell) tube's combined section has 4 + (4-1) = 7 points;
		// a one-sided rim tube has exactly 4 (the raw cross-section profile).
		const sectionPointCounts = (generateProjectionBands as jest.Mock).mock.calls.map(
			(c: Parameters<typeof generateProjectionBands>) =>
				(c[0] as { points: unknown[] }[])[0]?.points.length
		);
		expect(sectionPointCounts).toContain(4); // one-sided rim tube
		expect(sectionPointCounts).toContain(7); // normal two-sided tube
	});

	// Same fold-back guard as above, but through the localProjection inset path — this is the
	// only coverage of localProjection's divsB-reversal + intermediate back-projection at
	// surfaceProjectionDivisions > 0.
	it('localProjection surfaceProjection sections do not fold back (with divisions)', () => {
		const address: GlobuleAddress = { globule: 0 };
		const config: VoronoiConfig = {
			...makeTestConfig(),
			insetMethod: 'localProjection',
			surfaceProjectionDivisions: 3
		};
		const result = makeVoronoi(config, address, testSurfaceConfig);

		expect(result.surfaceProjectionTubes.length).toBeGreaterThan(0);

		result.surfaceProjectionTubes.forEach((tube) => {
			tube.sections.forEach((section) => {
				const pts = section.points;
				for (let i = 2; i < pts.length; i++) {
					const a = pts[i - 1].clone().sub(pts[i - 2]);
					const b = pts[i].clone().sub(pts[i - 1]);
					if (a.lengthSq() < 1e-12 || b.lengthSq() < 1e-12) continue;
					const fold = a.normalize().dot(b.normalize());
					expect(fold).toBeGreaterThan(-0.5);
				}
			});
		});
	});
});
