import { Object3D, Raycaster, Vector3 } from 'three';
import type { Facet, FacetEdgeMeta } from '$lib/types';
import type {
	CrossSectionConfig,
	EdgeConfig,
	EdgeCurveConfig,
	GlobuleAddress,
	GlobuleAddress_Tube,
	ProjectionEdge,
	Section,
	SurfaceConfig,
	TriangleEdge,
	Tube
} from '$lib/projection-geometry/types';
import type { VoronoiConfig, VoronoiResult } from './types';
import { generateSeeds } from './generate-seeds';
import { toUV, fromUVToDirection } from './uv-mapping';
import { computeVoronoi, lloydRelax } from './compute-voronoi';
import {
	computeVoronoiSpherical,
	lloydRelaxSpherical,
	toLonLat,
	fromLonLat
} from './compute-voronoi-spherical';
import { applyCrossSectionsToEdge } from './apply-cross-sections';
import {
	generateSurface,
	generateProjectionBands,
	getEdge,
	getEdgeMatchedTriangles
} from '$lib/projection-geometry/generate-projection';

const CURVE_OFFSET_FACTOR = 0.3;

function getSurfaceCenter(surfaceConfig: SurfaceConfig): Vector3 {
	if (surfaceConfig.type === 'GlobuleConfig') {
		return new Vector3(0, 0, 0);
	}
	const c = surfaceConfig.center;
	return new Vector3(c.x, c.y, c.z);
}

function createSurfaceIntersector(
	surface: Object3D,
	center: Vector3
): (direction: Vector3) => Vector3 | null {
	const raycaster = new Raycaster(undefined, undefined, undefined, 2000);
	return (direction: Vector3): Vector3 | null => {
		raycaster.set(center, direction.clone().normalize());
		const hits = raycaster.intersectObject(surface, true);
		return hits.length > 0 ? hits[0].point.clone() : null;
	};
}

function combineSections(edge0: ProjectionEdge, edge1: ProjectionEdge): Section[] {
	const first = edge0.config.isDirectionMatched
		? edge0
		: { ...edge0, sections: edge0.sections.slice().reverse() };
	const second = edge1.config.isDirectionMatched
		? edge1
		: { ...edge1, sections: edge1.sections.slice().reverse() };

	return first.sections.map((section, i): Section => {
		const comboSection = {
			points: [
				...section.crossSectionPoints,
				...second.sections[i].crossSectionPoints.slice().reverse().slice(1)
			]
		};
		return !edge1.config.isDirectionMatched
			? comboSection
			: { ...comboSection, points: comboSection.points.slice().reverse() };
	});
}

function makeDummyEdgeConfig(
	crossSectionConfig: CrossSectionConfig
): EdgeConfig<{ x: number; y: number; z: number }, { x: number; y: number; z: number }, EdgeCurveConfig, CrossSectionConfig> {
	return {
		vertex0: { x: 0, y: 0, z: 0 },
		vertex1: { x: 0, y: 0, z: 0 },
		isDirectionMatched: true,
		widthCurve: { curves: [], sampleMethod: { method: 'divideCurvePath', divisions: 1 } },
		crossSectionCurve: crossSectionConfig
	};
}

function sampleEdgeAsDirections(
	v0: [number, number],
	v1: [number, number],
	divisions: number,
	coordToDirection: CoordToDirection
): Vector3[] {
	const dir0 = coordToDirection(v0[0], v0[1]).normalize();
	const dir1 = coordToDirection(v1[0], v1[1]).normalize();
	const directions: Vector3[] = [];
	for (let i = 0; i <= divisions; i++) {
		const t = i / divisions;
		const dir = slerp(dir0, dir1, t);
		directions.push(dir);
	}
	return directions;
}

function slerp(a: Vector3, b: Vector3, t: number): Vector3 {
	const dot = Math.max(-1, Math.min(1, a.dot(b)));
	const omega = Math.acos(dot);
	if (omega < 1e-10) {
		return a.clone().lerp(b, t);
	}
	const sinOmega = Math.sin(omega);
	const sa = Math.sin((1 - t) * omega) / sinOmega;
	const sb = Math.sin(t * omega) / sinOmega;
	return new Vector3(
		sa * a.x + sb * b.x,
		sa * a.y + sb * b.y,
		sa * a.z + sb * b.z
	);
}

function matchTubeEnds(tubes: Tube[]): void {
	const endFacets: Facet[] = [];
	tubes.forEach((tube) =>
		tube.bands.forEach((band) =>
			band.facets.forEach((facet, f, facets) => {
				if (f === 0 || f === facets.length - 1) {
					endFacets.push(facet);
				}
			})
		)
	);

	tubes.forEach((tube, t) =>
		tube.bands.forEach((band, b) => {
			const firstFacet = band.facets[0];
			const lastFacet = band.facets[band.facets.length - 1];

			if (!firstFacet.address || !lastFacet.address) return;

			if (hasNoPartner(firstFacet)) {
				const match = findPartner(
					firstFacet,
					endFacets,
					getEdge('base', 'even', firstFacet.orientation)
				);
				if (match && match.partner.address) {
					const newMeta: { [key: string]: FacetEdgeMeta } = {};
					newMeta[match.edge] = { partner: { ...match.partner.address, edge: match.partnerEdge } };
					// @ts-expect-error: partial meta assignment
					firstFacet.meta = firstFacet.meta ? { ...firstFacet.meta, ...newMeta } : newMeta;
				}
			}

			if (hasNoPartner(lastFacet)) {
				const match = findPartner(
					lastFacet,
					endFacets,
					getEdge('base', 'even', lastFacet.orientation)
				);
				if (match && match.partner.address) {
					const newMeta: { [key: string]: FacetEdgeMeta } = {};
					newMeta[match.edge] = { partner: { ...match.partner.address, edge: match.partnerEdge } };
					// @ts-expect-error: partial meta assignment
					lastFacet.meta = lastFacet.meta ? { ...lastFacet.meta, ...newMeta } : newMeta;
				}
			}
		})
	);
}

function findPartner(
	facet0: Facet,
	facets: Facet[],
	edgeToMatch: TriangleEdge
): { partner: Facet; partnerEdge: TriangleEdge; edge: TriangleEdge } | null {
	for (const facet of facets) {
		if (
			facet0.address &&
			facet.address &&
			facet0.address.tube !== facet.address.tube
		) {
			const match = getEdgeMatchedTriangles(facet0.triangle, facet.triangle, edgeToMatch);
			if (match) {
				return { partner: facet, partnerEdge: match.t1, edge: match.t0 };
			}
		}
	}
	return null;
}

function hasNoPartner(facet: Facet): boolean {
	return !facet.meta?.ab?.partner && !facet.meta?.ac?.partner && !facet.meta?.bc?.partner;
}

function matchFacets(tubes: Tube[]): void {
	tubes.forEach((tube) => {
		tube.bands.forEach((band) => {
			band.facets.forEach((facet, f) => {
				if (!facet.address) return;

				const edgeMeta = { ab: {}, bc: {}, ac: {} } as NonNullable<Facet['meta']>;

				for (const edge of ['ab', 'bc', 'ac'] as const) {
					if (facet.meta?.[edge]?.partner) {
						edgeMeta[edge].partner = { ...facet.meta[edge].partner };
					}
				}

				// Sequential within-band partners
				if (f > 0) {
					const prev = band.facets[f - 1];
					if (prev.address) {
						const match = getEdgeMatchedTriangles(facet.triangle, prev.triangle);
						if (match && !edgeMeta[match.t0].partner) {
							edgeMeta[match.t0].partner = { ...prev.address, edge: match.t1 };
						}
					}
				}
				if (f < band.facets.length - 1) {
					const next = band.facets[f + 1];
					if (next.address) {
						const match = getEdgeMatchedTriangles(facet.triangle, next.triangle);
						if (match && !edgeMeta[match.t0].partner) {
							edgeMeta[match.t0].partner = { ...next.address, edge: match.t1 };
						}
					}
				}

				facet.meta = edgeMeta;
			});
		});
	});

	// Cross-band partners within same tube
	tubes.forEach((tube) => {
		if (tube.bands.length < 2) return;
		for (let i = 0; i < tube.bands.length; i++) {
			for (let j = i + 1; j < tube.bands.length; j++) {
				const bandA = tube.bands[i];
				const bandB = tube.bands[j];
				for (const facetA of bandA.facets) {
					if (!facetA.address) continue;
					for (const facetB of bandB.facets) {
						if (!facetB.address) continue;
						const match = getEdgeMatchedTriangles(facetA.triangle, facetB.triangle);
						if (match) {
							if (facetA.meta && !facetA.meta[match.t0].partner) {
								facetA.meta[match.t0].partner = { ...facetB.address, edge: match.t1 };
							}
							if (facetB.meta && !facetB.meta[match.t1].partner) {
								facetB.meta[match.t1].partner = { ...facetA.address, edge: match.t0 };
							}
						}
					}
				}
			}
		}
	});
}

type CoordToDirection = (a: number, b: number) => Vector3;

function computeVoronoiFromSeeds(
	seeds3d: Vector3[],
	center: Vector3,
	config: VoronoiConfig
): { voronoiResult: VoronoiResult; relaxedSeeds: [number, number][]; coordToDirection: CoordToDirection } {
	const method = config.voronoiMethod ?? 'spherical';

	if (method === 'spherical') {
		const seedsLonLat = seeds3d.map((p) => toLonLat(p, center));
		const relaxedSeeds = lloydRelaxSpherical(seedsLonLat, config.seedConfig.relaxationIterations);
		const voronoiResult = computeVoronoiSpherical(relaxedSeeds);
		return { voronoiResult, relaxedSeeds, coordToDirection: fromLonLat };
	} else {
		const seedsUV = seeds3d.map((p) => toUV(p, center));
		const relaxedSeeds = lloydRelax(seedsUV, config.seedConfig.relaxationIterations);
		const voronoiResult = computeVoronoi(relaxedSeeds);
		return { voronoiResult, relaxedSeeds, coordToDirection: fromUVToDirection };
	}
}

export function makeVoronoi(
	config: VoronoiConfig,
	address: GlobuleAddress,
	surfaceConfig: SurfaceConfig
): { tubes: Tube[]; surfaceProjectionTubes: Tube[]; surface: Object3D } {
	const resolvedSurfaceConfig =
		surfaceConfig.transform === 'inherit'
			? ({ ...surfaceConfig, transform: config.meta.transform } as SurfaceConfig)
			: surfaceConfig;

	const surface = generateSurface(resolvedSurfaceConfig);
	const center = getSurfaceCenter(surfaceConfig);
	const intersect = createSurfaceIntersector(surface, center);

	// Step 1: Generate seeds on surface
	const seeds3d = generateSeeds(config.seedConfig.seedMethod, center, intersect);

	// Steps 2-4: Branch on voronoi method
	const { voronoiResult, relaxedSeeds, coordToDirection } = computeVoronoiFromSeeds(
		seeds3d,
		center,
		config
	);

	// Step 5: Process each Voronoi edge into tube geometry
	const tubes: Tube[] = [];
	const surfaceProjectionTubes: Tube[] = [];
	const crossSectionConfig = config.crossSectionConfig;
	const dummyEdgeConfig = makeDummyEdgeConfig(crossSectionConfig);

	const normalRaycaster = new Raycaster(undefined, undefined, undefined, 2000);

	for (const voronoiEdge of voronoiResult.edges) {
		const [cellIdxA, cellIdxB] = voronoiEdge.cellIndices;
		const cellCenterA = relaxedSeeds[cellIdxA];
		const cellCenterB = relaxedSeeds[cellIdxB];

		// Sample directions along the great circle arc between edge vertices
		const edgeDirections = sampleEdgeAsDirections(
			voronoiEdge.vertices[0],
			voronoiEdge.vertices[1],
			config.edgeDivisions,
			coordToDirection
		);

		// Map each direction to 3D surface point, compute normals and curve offsets
		const edgePoints3d: Vector3[] = [];
		const curvePointsA: Vector3[] = [];
		const curvePointsB: Vector3[] = [];
		const normals: Vector3[] = [];

		for (const dir of edgeDirections) {
			const point3d = intersect(dir);
			if (!point3d) continue;

			edgePoints3d.push(point3d);

			// Compute surface normal at this point
			normalRaycaster.set(center, dir.clone().normalize());
			const hits = normalRaycaster.intersectObject(surface, true);
			let normal: Vector3;
			if (hits.length > 0 && hits[0].face) {
				normal = hits[0].face.normal
					.clone()
					.transformDirection(hits[0].object.matrixWorld)
					.normalize();
			} else {
				normal = dir.clone().normalize();
			}
			normals.push(normal);

			// Compute curve offset points toward each adjacent cell center
			const dirA = coordToDirection(cellCenterA[0], cellCenterA[1]);
			const cellPoint3dA = intersect(dirA);
			const dirB = coordToDirection(cellCenterB[0], cellCenterB[1]);
			const cellPoint3dB = intersect(dirB);

			if (cellPoint3dA) {
				const offsetA = cellPoint3dA.clone().sub(point3d).normalize();
				const curveDistA = point3d.distanceTo(cellPoint3dA) * CURVE_OFFSET_FACTOR;
				curvePointsA.push(point3d.clone().addScaledVector(offsetA, curveDistA));
			} else {
				curvePointsA.push(point3d.clone());
			}

			if (cellPoint3dB) {
				const offsetB = cellPoint3dB.clone().sub(point3d).normalize();
				const curveDistB = point3d.distanceTo(cellPoint3dB) * CURVE_OFFSET_FACTOR;
				curvePointsB.push(point3d.clone().addScaledVector(offsetB, curveDistB));
			} else {
				curvePointsB.push(point3d.clone());
			}
		}

		if (edgePoints3d.length < 2) continue;

		// Apply cross-sections for each side of the edge
		const sectionsA = applyCrossSectionsToEdge(
			edgePoints3d,
			curvePointsA,
			normals,
			crossSectionConfig
		);
		const sectionsB = applyCrossSectionsToEdge(
			edgePoints3d,
			curvePointsB,
			normals,
			crossSectionConfig
		);

		const projEdgeA: ProjectionEdge = {
			config: dummyEdgeConfig,
			sections: sectionsA
		};
		const projEdgeB: ProjectionEdge = {
			config: dummyEdgeConfig,
			sections: sectionsB
		};

		// Combine sections from both sides
		const combinedSections = combineSections(projEdgeA, projEdgeB);

		const tubeIndex = tubes.length;
		const tubeAddress: GlobuleAddress_Tube = { ...address, tube: tubeIndex };

		const bands = generateProjectionBands(
			combinedSections,
			config.bandConfig.orientation,
			tubeAddress,
			config.bandConfig.tubeSymmetry
		);

		const tube: Tube = {
			bands,
			sections: combinedSections,
			orientation: config.bandConfig.orientation,
			address: tubeAddress
		};

		tubes.push(tube);

		// Surface projection: flat 3-point sections [curveA, edge, curveB]
		const spTubeAddress: GlobuleAddress_Tube = { ...address, tube: surfaceProjectionTubes.length };
		const spSections: Section[] = edgePoints3d.map((edgePoint, idx): Section => ({
			points: [
				curvePointsA[idx].clone(),
				edgePoint.clone(),
				curvePointsB[idx].clone()
			]
		}));

		const spCenter = getSurfaceCenter(surfaceConfig);
		const p0 = spSections[0].points[0];
		const p1 = spSections[0].points[1];
		const p2 = spSections[1].points[0];
		const testV1 = new Vector3().subVectors(p1, p0);
		const testV2 = new Vector3().subVectors(p2, p0);
		const testNormal = new Vector3().crossVectors(testV1, testV2);
		const centroid = new Vector3().addVectors(p0, p1).add(p2).divideScalar(3);
		const toFacet = new Vector3().subVectors(centroid, spCenter);
		if (testNormal.dot(toFacet) < 0) {
			spSections.forEach((s) => s.points.reverse());
		}

		const spBands = generateProjectionBands(spSections, 'axial-right', spTubeAddress);
		surfaceProjectionTubes.push({
			bands: spBands,
			sections: spSections,
			orientation: 'axial-right',
			address: spTubeAddress
		});
	}

	// Partner matching
	try {
		matchTubeEnds(tubes);
		matchFacets(tubes);
	} catch (error) {
		console.error('Voronoi partner matching error:', error);
	}

	try {
		matchTubeEnds(surfaceProjectionTubes);
		matchFacets(surfaceProjectionTubes);
	} catch (error) {
		console.error('Voronoi surface projection partner matching error:', error);
	}

	return { tubes, surfaceProjectionTubes, surface };
}
