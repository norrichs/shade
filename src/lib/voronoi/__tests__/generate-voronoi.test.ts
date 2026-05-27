import { Mesh, Object3D, SphereGeometry, MeshBasicMaterial, DoubleSide, Triangle, Vector3 } from 'three';
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

		getEdge: jest.fn(
			(edgeType: string, parity: string | number, orientation: string) => {
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
				const p =
					typeof parity === 'number'
						? parity % 2 === 0
							? 'even'
							: 'odd'
						: parity;
				return EDGE_MAP[orientation]?.[p]?.[edgeType] ?? 'ab';
			}
		),

		getEdgeMatchedTriangles: jest.fn(
			(
				t0: typeof Triangle.prototype,
				t1: typeof Triangle.prototype,
				_edgeToMatch?: string
			) => {
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

import { makeVoronoi } from '../generate-voronoi';

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
	edgeDivisions: 4,
	curveOffsetFactor: 0.3,
	surfaceProjectionDivisions: 0,
	voronoiMethod: 'spherical'
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
});
