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
import { computeAdaptiveEdgeDivisions } from './edge-divisions';
import { generateSeeds } from './generate-seeds';
import { extractSurfaceTriangles } from './extract-surface-triangles';
import { toUV, fromUVToDirection } from './uv-mapping';
import { computeVoronoi, lloydRelax } from './compute-voronoi';
import {
	computeVoronoiSpherical,
	lloydRelaxSpherical,
	toLonLat,
	fromLonLat
} from './compute-voronoi-spherical';
import { applyCrossSectionsToEdge } from './apply-cross-sections';
import { edgeArcLength, type CoordToDirection } from './edge-sampling';
import { projectEdgesOntoSurface, type EdgeProjection } from './project-edges-onto-surface';
import type { EdgeInsets } from './inset-types';
import { computeEdgeInsetsCenterOut } from './inset-center-out';
import { computeEdgeInsetsLocalProjection } from './local-projection';
import {
	generateSurface,
	generateProjectionBands,
	getEdge,
	getEdgeMatchedTriangles
} from '$lib/projection-geometry/generate-projection';
import {
	buildFillBand,
	outerBorderPolyline,
	reindexBandAddresses
} from '$lib/projection-geometry/fill-bands';
import type { Band } from '$lib/types';

const DEFAULT_CURVE_OFFSET_FACTOR = 0.3;

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
): EdgeConfig<
	{ x: number; y: number; z: number },
	{ x: number; y: number; z: number },
	EdgeCurveConfig,
	CrossSectionConfig
> {
	return {
		vertex0: { x: 0, y: 0, z: 0 },
		vertex1: { x: 0, y: 0, z: 0 },
		isDirectionMatched: true,
		widthCurve: { curves: [], sampleMethod: { method: 'divideCurvePath', divisions: 1 } },
		crossSectionCurve: crossSectionConfig
	};
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
		if (facet0.address && facet.address && facet0.address.tube !== facet.address.tube) {
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
				if (facet.isDegenerate) return; // synthetic fill facet — never partner-matched
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

function computeVoronoiFromSeeds(
	seeds3d: Vector3[],
	center: Vector3,
	config: VoronoiConfig
): {
	voronoiResult: VoronoiResult;
	relaxedSeeds: [number, number][];
	coordToDirection: CoordToDirection;
} {
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
	const surfaceTriangles = extractSurfaceTriangles(surface);
	const seeds3d = generateSeeds(config.seedConfig.seedMethod, center, intersect, surfaceTriangles);

	// Steps 2-4: Branch on voronoi method
	const { voronoiResult, relaxedSeeds, coordToDirection } = computeVoronoiFromSeeds(
		seeds3d,
		center,
		config
	);

	// Step 5: Process each Voronoi edge into tube geometry
	const tubes: Tube[] = [];
	const surfaceProjectionTubes: Tube[] = [];
	// For fillAll: which cell each spTube's first/last outer band borders.
	const spFillMeta: { firstCell: number; lastCell: number }[] = [];
	const crossSectionConfig = config.crossSectionConfig;
	const curveOffsetFactor = config.curveOffsetFactor ?? DEFAULT_CURVE_OFFSET_FACTOR;
	const dummyEdgeConfig = makeDummyEdgeConfig(crossSectionConfig);

	// Adaptive divisions: divide each edge by a count interpolated between the
	// configured [min, max] according to the edge's arc length relative to the
	// shortest and longest edges.
	const edgeLengths = voronoiResult.edges.map((e) =>
		edgeArcLength(e.vertices[0], e.vertices[1], coordToDirection)
	);
	const edgeDivisionCounts = computeAdaptiveEdgeDivisions(edgeLengths, config.edgeDivisions);

	const edgeProjections: EdgeProjection[] = projectEdgesOntoSurface({
		edges: voronoiResult.edges,
		edgeDivisionCounts,
		coordToDirection,
		center,
		surface,
		intersect
	});

	const seedPoints3d = relaxedSeeds.map((seed) => intersect(coordToDirection(seed[0], seed[1])));

	const edgeInsets: EdgeInsets[] =
		config.insetMethod === 'localProjection'
			? computeEdgeInsetsLocalProjection({
					edges: voronoiResult.edges,
					edgeProjections,
					relaxedSeeds,
					seedPoints3d,
					coordToDirection,
					surface,
					surfaceCenter: center,
					curveOffsetFactor,
					surfaceProjectionDivisions: config.surfaceProjectionDivisions ?? 0
				})
			: computeEdgeInsetsCenterOut({
					edges: voronoiResult.edges,
					edgeProjections,
					relaxedSeeds,
					coordToDirection,
					center,
					intersect,
					curveOffsetFactor,
					surfaceProjectionDivisions: config.surfaceProjectionDivisions ?? 0
				});

	for (let edgeIndex = 0; edgeIndex < voronoiResult.edges.length; edgeIndex++) {
		const voronoiEdge = voronoiResult.edges[edgeIndex];
		const [cellIdxA, cellIdxB] = voronoiEdge.cellIndices;

		const { edgePoints3d, normals } = edgeProjections[edgeIndex];
		const { curvePointsA, curvePointsB, divsA, divsB } = edgeInsets[edgeIndex];

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

		// Surface projection: [curveA, ...divA, edge, ...divB, curveB]
		const spTubeAddress: GlobuleAddress_Tube = { ...address, tube: surfaceProjectionTubes.length };
		const spSections: Section[] = edgePoints3d.map((edgePoint, idx): Section => {
			const cA = curvePointsA[idx];
			const cB = curvePointsB[idx];
			return {
				points: [cA.clone(), ...divsA[idx], edgePoint.clone(), ...divsB[idx], cB.clone()]
			};
		});

		const spCenter = getSurfaceCenter(surfaceConfig);
		const p0 = spSections[0].points[0];
		const p1 = spSections[0].points[1];
		const p2 = spSections[1].points[0];
		const testV1 = new Vector3().subVectors(p1, p0);
		const testV2 = new Vector3().subVectors(p2, p0);
		const testNormal = new Vector3().crossVectors(testV1, testV2);
		const centroid = new Vector3().addVectors(p0, p1).add(p2).divideScalar(3);
		const toFacet = new Vector3().subVectors(centroid, spCenter);
		const spReversed = testNormal.dot(toFacet) < 0;
		if (spReversed) {
			spSections.forEach((s) => s.points.reverse());
		}

		const spBands = generateProjectionBands(spSections, 'axial-right', spTubeAddress);
		surfaceProjectionTubes.push({
			bands: spBands,
			sections: spSections,
			orientation: 'axial-right',
			address: spTubeAddress
		});
		// After winding, band 0 = spSections.points[0]; if reversed that is cell B.
		spFillMeta.push({
			firstCell: spReversed ? cellIdxB : cellIdxA,
			lastCell: spReversed ? cellIdxA : cellIdxB
		});
	}

	// Partner matching
	try {
		matchTubeEnds(tubes);
		matchFacets(tubes);
	} catch (error) {
		console.error('Voronoi partner matching error:', error);
	}

	// Interior fill bands (fillAll). One fill band per outer (open-space-bordering) band of each
	// spTube, sharing one per-cell center (the cell seed ray-cast onto the surface). Built before
	// partner matching so fill bands are addressed and partnered as first-class bands.
	if (config.fillAll) {
		const averageOf = (pts: Vector3[]): Vector3 =>
			pts.reduce((acc, p) => acc.add(p.clone()), new Vector3()).divideScalar(pts.length);

		// Per-cell apex: ray-cast the seed direction onto the surface.
		const cellApex: (Vector3 | undefined)[] = relaxedSeeds.map((seed) => {
			const hit = intersect(coordToDirection(seed[0], seed[1]));
			if (!hit) console.warn('fillAll: cell seed ray missed surface; using averaged border point');
			return hit ?? undefined;
		});

		surfaceProjectionTubes.forEach((tube, t) => {
			const meta = spFillMeta[t];
			const firstEdge = outerBorderPolyline(tube.sections, 'first');
			const lastEdge = outerBorderPolyline(tube.sections, 'last');
			const firstApex =
				cellApex[meta.firstCell] ?? (firstEdge.length ? averageOf(firstEdge) : undefined);
			const lastApex =
				cellApex[meta.lastCell] ?? (lastEdge.length ? averageOf(lastEdge) : undefined);

			const newBands: Band[] = [];
			if (firstApex && firstEdge.length >= 2) {
				newBands.push(
					buildFillBand({
						borderEdge: firstEdge,
						center: firstApex,
						address: { ...tube.address, band: 0 },
						projCenter: center
					})
				);
			}
			newBands.push(...tube.bands);
			if (lastApex && lastEdge.length >= 2) {
				newBands.push(
					buildFillBand({
						borderEdge: lastEdge,
						center: lastApex,
						address: { ...tube.address, band: 0 },
						projCenter: center
					})
				);
			}
			tube.bands = newBands;
			reindexBandAddresses(tube.bands, tube.address);
		});
	}

	try {
		matchTubeEnds(surfaceProjectionTubes);
		matchFacets(surfaceProjectionTubes);
	} catch (error) {
		console.error('Voronoi surface projection partner matching error:', error);
	}

	return { tubes, surfaceProjectionTubes, surface };
}
