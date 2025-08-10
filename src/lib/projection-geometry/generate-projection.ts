import type {
	Band,
	FacetOrientation,
	BezierConfig,
	Facet,
	Point3,
	FacetEdgeMeta
} from '$lib/types';
import { average, getCubicBezierCurvePath, getIntersectionOfLines, getVector3 } from '$lib/util';
import {
	Matrix4,
	Mesh,
	Object3D,
	Raycaster,
	SphereGeometry,
	Triangle,
	Vector2,
	Vector3
} from 'three';
import type {
	BaseProjectionConfig,
	CrossSectionConfig,
	CrossSectionScaling,
	Edge,
	EdgeConfig,
	EdgeCurveConfig,
	Polygon,
	PolygonConfig,
	Polyhedron,
	PolyhedronConfig,
	Projection,
	ProjectionAddress,
	ProjectionAddress_Band,
	ProjectionAddress_FacetEdge,
	ProjectionAddress_Tube,
	ProjectionConfig,
	ProjectionEdge,
	ProjectorConfig,
	Section,
	SurfaceConfig,
	TransformConfig,
	TriangleEdge,
	Tube,
	TubePartnerAddresses,
	VerticesConfig
} from './types';
import { materials } from '../../components/three-renderer-v2/materials';
import { getLength } from '$lib/patterns/utils';

const SHOULD_SKEW_CURVE = true;

export const preparePolygonConfig = (
	polygonConfig: PolygonConfig<undefined, number, number, number>,
	vertices: VerticesConfig,
	edgeCurves: EdgeCurveConfig[],
	crossSectionCurves: CrossSectionConfig[]
) => {
	return {
		...polygonConfig,
		edges: polygonConfig.edges.map(
			(edge: EdgeConfig<undefined, number, number, number>, i: number) => {
				const { vertex1, widthCurve, heightCurve, crossSectionCurve } = edge;
				const vertex0 =
					typeof edge.vertex0 === 'number'
						? edge.vertex0
						: polygonConfig.edges[(i + polygonConfig.edges.length - 1) % polygonConfig.edges.length]
								.vertex1;

				const v = [vertex0, vertex1];

				const backfilled: EdgeConfig<Point3, Point3, EdgeCurveConfig, CrossSectionConfig> = {
					...edge,
					vertex0: vertices[v[0]],
					vertex1: vertices[v[1]],
					widthCurve: edgeCurves[widthCurve],
					heightCurve: heightCurve ? edgeCurves[heightCurve] : undefined,
					crossSectionCurve: crossSectionCurves[crossSectionCurve]
				};
				return backfilled;
			}
		)
	};
};

export const prepareProjectionConfig = (
	config: BaseProjectionConfig
): ProjectionConfig<Point3, Point3, EdgeCurveConfig, CrossSectionConfig> => {
	const { vertices, edgeCurves, crossSectionCurves } = config.projectorConfig.polyhedron;

	if (config.projectorConfig.polyhedron.transform === 'inherit') {
		config.projectorConfig.polyhedron.transform = config.meta.transform;
	}
	if (config.surfaceConfig.transform === 'inherit') {
		config.surfaceConfig.transform = config.meta.transform;
	}

	const polygons: PolygonConfig<Point3, Point3, EdgeCurveConfig, CrossSectionConfig>[] =
		config.projectorConfig.polyhedron.polygons.map((polygon) =>
			preparePolygonConfig(polygon, vertices, edgeCurves, crossSectionCurves)
		);
	const polyhedron: PolyhedronConfig<Point3, Point3, EdgeCurveConfig, CrossSectionConfig> = {
		...config.projectorConfig.polyhedron,
		polygons
	};
	const projectorConfig: ProjectorConfig<Point3, Point3, EdgeCurveConfig, CrossSectionConfig> = {
		...config.projectorConfig,
		polyhedron
	};

	return { ...config, projectorConfig };
};

const getMatrix4 = (
	{
		scale: s = { x: 1, y: 1, z: 1 },
		// rotate: r = { x: 0, y: 0, z: 0 }
		translate: t = { x: 0, y: 0, z: 0 }
	}: TransformConfig,
	matrix?: Matrix4
) => {
	const resultMatrix = matrix?.clone() || new Matrix4();
	resultMatrix.set(s.x, 0, 0, t.x, 0, s.y, 0, t.y, 0, 0, s.z, t.z, 0, 0, 0, 1);
	return resultMatrix;
};

export const generateSphereMesh = ({ radius }: SurfaceConfig) => {
	const sphereGeometry = new SphereGeometry(radius, 100, 100);
	const sphereMesh = new Mesh(sphereGeometry, materials.default);
	return sphereMesh;
};

export const generateSurface = (cfg: SurfaceConfig) => {
	if (cfg.transform === 'inherit') {
		throw new Error('generateSurface - surface transform should not be "inherit"');
	}

	const surface = new Object3D();
	if (cfg.type === 'SphereConfig') {
		const sphereMesh = generateSphereMesh(cfg);
		surface.add(sphereMesh);
	}
	const transformMatrix = getMatrix4(cfg.transform);
	surface.applyMatrix4(transformMatrix);
	surface.updateMatrixWorld(true);

	return surface;
};

export const generatePolyhedron = (
	projectorConfig: ProjectorConfig<Point3, Point3, EdgeCurveConfig, CrossSectionConfig>
) => {
	const projectorTransform = projectorConfig.polyhedron.transform;
	if (projectorTransform === 'inherit') {
		throw new Error("generatePolyhedron - transform should not be 'inherit'");
	}
	const polyhedron: Polyhedron = {
		polygons: projectorConfig.polyhedron.polygons.map((polygon) => {
			return {
				edges: polygon.edges.map((edgeConfig) => {
					const center = getPolygonCenter(polygon);
					const { edgePoints, curvePoints } = generateEdge({
						edgeConfig,
						center,
						transformConfig: projectorTransform
					});
					return { edgePoints, curvePoints, config: edgeConfig };
				})
			};
		})
	};
	return polyhedron;
};

export const getPolygonCenter = (
	polygon: PolygonConfig<Point3, Point3, EdgeCurveConfig, CrossSectionConfig>
): Vector3 => {
	const xArr: number[] = [];
	const yArr: number[] = [];
	const zArr: number[] = [];
	polygon.edges.forEach((edge: EdgeConfig<Point3, Point3, EdgeCurveConfig, CrossSectionConfig>) => {
		const { x, y, z } = edge.vertex1;
		xArr.push(x);
		yArr.push(y);
		zArr.push(z);
	});
	return new Vector3(average(xArr), average(yArr), average(zArr));
};

const generateEdge = ({
	edgeConfig: { vertex0, vertex1, widthCurve, isDirectionMatched },
	center: originalCenter,
	transformConfig
}: {
	edgeConfig: EdgeConfig<Point3, Point3, EdgeCurveConfig, CrossSectionConfig>;
	center: Vector3;
	transformConfig: TransformConfig;
}) => {
	// const tx = {
	// 	scale: new Vector3(1.5, 1.5, 1),
	// 	translate: new Vector3(0, 0, 0)
	// };
	// const transformMatrix: [
	// 	number,
	// 	number,
	// 	number,
	// 	number,
	// 	number,
	// 	number,
	// 	number,
	// 	number,
	// 	number,
	// 	number,
	// 	number,
	// 	number,
	// 	number,
	// 	number,
	// 	number,
	// 	number
	// ] = [
	// 	tx.scale.x,
	// 	0,
	// 	0,
	// 	tx.translate.x,
	// 	0,
	// 	tx.scale.y,
	// 	0,
	// 	tx.translate.y,
	// 	0,
	// 	0,
	// 	tx.scale.z,
	// 	tx.translate.z,
	// 	0,
	// 	0,
	// 	0,
	// 	1
	// 	];

	// const matrix = new Matrix4();

	const transformMatrix = getMatrix4(transformConfig);
	// matrix.set(...transformMatrix);

	const { divisions } = widthCurve.sampleMethod;
	const [v0, v1] = getVector3([vertex0, vertex1]) as Vector3[];
	v0.applyMatrix4(transformMatrix);
	v1.applyMatrix4(transformMatrix);
	const center = originalCenter.clone().applyMatrix4(transformMatrix);

	const edgePoints = [];

	for (let i = 0; i <= divisions; i++) {
		edgePoints.push(v0.clone().lerp(v1, i / divisions));
	}

	const definitionPoints = getPoints(widthCurve.curves, divisions);
	const curvePoints = mapPointsToTriangle(
		{ a: v0, b: v1, c: center },
		definitionPoints,
		isDirectionMatched
	);

	// const curvePoints = isDirectionMatched

	return { edgePoints, curvePoints };
};

export const mapPointsFromTriangle = (
	triangle: { a: Vector2; b: Vector2; c: Vector2 },
	points: Vector2[],
	reverse?: boolean
) => {
	const { a, b, c } = triangle;
	const mappedPoints = reverse
		? points.reverse().map((point) => {
				const int = getIntersectionOfLines({ p0: c, p1: point }, { p0: a, p1: b });
				if (!int) {
					throw new Error('no intersection!');
				}
				return {
					x: getLength(int, point) / getLength(int, c),
					y: getLength(a, int) / getLength(a, b)
				};
		  })
		: points.map((point) => {
				const int = getIntersectionOfLines({ p0: c, p1: point }, { p0: a, p1: b });
				if (!int) {
					throw new Error('no intersection!');
				}
				return {
					x: getLength(int, point) / getLength(int, c),
					y: getLength(a, b) / getLength(a, int)
				};
		  });
	return mappedPoints;
};

export const mapPointsToTriangle = <V extends Vector2 | Vector3>(
	triangle: { a: V; b: V; c: V },
	points: Vector2[],
	reverse?: boolean
): V[] => {
	const { a, b, c } = triangle;
	const mappedPoints = reverse
		? (points.map((point) => {
				// @ts-expect-error ts cant' figure out that lerp works for vector2 or vector3
				const pointOnLeg0 = a.clone().lerp(c, point.x);
				// @ts-expect-error ts cant' figure out that lerp works for vector2 or vector3
				const pointOnLeg1 = b.clone().lerp(c, point.x);
				// @ts-expect-error ts cant' figure out that lerp works for vector2 or vector3
				return pointOnLeg0.clone().lerp(pointOnLeg1, point.y);
		  }) as V[])
		: (points.reverse().map((point) => {
				// @ts-expect-error ts cant' figure out that lerp works for vector2 or vector3
				const pointOnLeg0 = b.clone().lerp(c, point.x);
				// @ts-expect-error ts cant' figure out that lerp works for vector2 or vector3
				const pointOnLeg1 = a.clone().lerp(c, point.x);
				// @ts-expect-error ts cant' figure out that lerp works for vector2 or vector3
				return pointOnLeg0.clone().lerp(pointOnLeg1, point.y);
		  }) as V[]);
	return mappedPoints;
};

export const getPoints = (curveConfigs: BezierConfig[], divisions: number): Vector2[] => {
	const curvePath = getCubicBezierCurvePath(curveConfigs);
	const vectors = curvePath.getSpacedPoints(divisions);
	return vectors;
};

export const getCrossSectionScale = (
	crossSectionScaling: CrossSectionScaling,
	edgeWidth?: number
) => {
	let xScale: number;
	if (crossSectionScaling.width === 'curve') {
		if (!edgeWidth) {
			console.error('getCrossSectionScale, missing edgeWidth, reverting to height or 50');
			xScale = typeof crossSectionScaling.height === 'number' ? crossSectionScaling.height : 50;
		} else {
			xScale = edgeWidth;
		}
	} else {
		xScale = crossSectionScaling.width;
	}

	let yScale: number;
	if (crossSectionScaling.height === 'matchWidth') {
		yScale = xScale;
	} else if (crossSectionScaling.height === 'curve') {
		yScale = 1;
	} else {
		yScale = crossSectionScaling.height;
	}
	return { xScale, yScale };
};

type GenerateProjectionProps = {
	surface: Object3D;
	projector: Polyhedron;
	projectionConfig: ProjectionConfig<Point3, Point3, EdgeCurveConfig, CrossSectionConfig>;
};

export const generateProjection = ({
	surface,
	projector,
	projectionConfig
}: GenerateProjectionProps) => {
	const center = getVector3(projectionConfig.surfaceConfig.center) as Vector3;

	const projection: Projection = {
		polygons: projector.polygons.map((polygon: Polygon, p) => {
			return {
				edges: polygon.edges.map((edge: Edge, e) => {
					const crossSectionConfig =
						projectionConfig.projectorConfig.polyhedron.polygons[p].edges[e].crossSectionCurve;
					const crossSectionDefinitionPoints = normalizePoints(
						getPoints(crossSectionConfig.curves, crossSectionConfig.sampleMethod.divisions)
					);
					const sectionGeometry = edge.edgePoints.map((p, i) => {
						const c = edge.curvePoints[i];
						const int = { edge: new Vector3(), curve: new Vector3() };

						const yDirection = center.clone().addScaledVector(p, 1).normalize();
						const curveDirection = center.clone().addScaledVector(c, 1).normalize();

						const edgeRaycaster = new Raycaster(center, yDirection, undefined, 2000);
						const curveRaycaster = new Raycaster(center, curveDirection, undefined, 2000);
						const edgeIntersections = edgeRaycaster.intersectObject(surface, true);
						const curveIntersections = curveRaycaster.intersectObject(surface, true);

						if (!edgeIntersections[0] || !curveIntersections[0]) {
							console.error('missing intersections', {
								edgeIntersections,
								curveIntersections,
								i,
								edgePoints: edge.edgePoints,
								curvePoints: edge.curvePoints
							});
							throw new Error('no intersection found');
						}

						int.edge = edgeIntersections[0].point.clone();
						int.curve = curveIntersections[0].point.clone();
						const edgeRay = edgeRaycaster.ray;

						let xDirection: Vector3;
						let baseScalingLength: number;
						if (SHOULD_SKEW_CURVE) {
							xDirection = int.curve.clone().addScaledVector(int.edge, -1).normalize();
							baseScalingLength = int.edge.distanceTo(int.curve);
						} else {
							const nearestPoint = new Vector3();
							edgeRay.closestPointToPoint(int.curve, nearestPoint);
							xDirection = int.curve.clone().addScaledVector(nearestPoint, -1).normalize();
							baseScalingLength = edgeRay.distanceToPoint(int.curve);
						}

						const { xScale, yScale } = getCrossSectionScale(
							crossSectionConfig.scaling,
							baseScalingLength
						);

						const crossSectionPoints = crossSectionDefinitionPoints.map((p) =>
							int.edge
								.clone()
								.addScaledVector(xDirection, (p.x - crossSectionConfig.center.x) * xScale)
								.addScaledVector(yDirection, (p.y - crossSectionConfig.center.y) * yScale)
						);

						return { intersections: int, crossSectionPoints };
					});
					return { sections: sectionGeometry, config: edge.config };
				})
			};
		}),
		address: { projection: 0 }
	};

	return projection;
};

const generateFacetPair = ({
	sections,
	sectionIndex,
	pointIndex,
	bandAddress,
	facetCount,
	pairOrientation = 'cOverA'
}: {
	sections: Section[];
	sectionIndex: number;
	pointIndex: number;
	bandAddress: ProjectionAddress_Band;
	facetCount: number;
	pairOrientation?: 'cOverB' | 'cOverA';
}): [Facet, Facet] => {
	if (pairOrientation === 'cOverB') {
		console.debug({ sectionIndex, pointIndex, pairOrientation });
		return [
			{
				triangle: new Triangle(
					sections[sectionIndex].points[pointIndex].clone(),
					sections[sectionIndex].points[pointIndex + 1].clone(),
					sections[sectionIndex + 1].points[pointIndex + 1].clone()
				),
				address: { ...bandAddress, facet: facetCount },
				pairOrientation
			},
			{
				triangle: new Triangle(
					sections[sectionIndex + 1].points[pointIndex + 1].clone(),
					sections[sectionIndex + 1].points[pointIndex].clone(),
					sections[sectionIndex].points[pointIndex].clone()
				),
				address: { ...bandAddress, facet: facetCount + 1 },
				pairOrientation
			}
		];
	}
	console.debug({ sectionIndex, pointIndex, pairOrientation });
	return [
		{
			triangle: new Triangle(
				sections[sectionIndex].points[pointIndex].clone(),
				sections[sectionIndex].points[pointIndex + 1].clone(),
				sections[sectionIndex + 1].points[pointIndex].clone()
			),
			address: { ...bandAddress, facet: facetCount },
			pairOrientation
		},
		{
			triangle: new Triangle(
				sections[sectionIndex + 1].points[pointIndex + 1].clone(),
				sections[sectionIndex + 1].points[pointIndex].clone(),
				sections[sectionIndex].points[pointIndex + 1].clone()
			),
			address: { ...bandAddress, facet: facetCount + 1 },
			pairOrientation
		}
	];
};

const generateProjectionBands = (
	sections: Section[],
	orientation: FacetOrientation, // 0 === circumferential, 1 = longitudinal
	tubeAddress: ProjectionAddress_Tube,
	tubeSymmetry = { axial: false, lateral: false }
) => {
	if (orientation == -1) throw Error('orientation -1 not allowed for projectionbands');
	console.debug('generateProjectionBands', { orientation, sections });
	const sectionLength = sections[0].points.length;
	const bands: Band[] = [];
	if (orientation === 0) {
		for (let s = 0; s < sections.length - 1; s++) {
			const bandAddress = { ...tubeAddress, band: bands.length };
			const facets: Facet[] = [];
			for (let f = 0; f < sectionLength - 1; f++) {
				facets.push(
					...generateFacetPair({
						sections,
						sectionIndex: s,
						pointIndex: f,
						bandAddress,
						facetCount: facets.length
					})
				);
			}
			bands.push({ orientation, facets, visible: true });
		}
	} else if (orientation === 1 && tubeSymmetry) {
		console.debug('TUBESYMMETRY', sectionLength, sections.length);
		const { axial, lateral } = tubeSymmetry;
		for (let f = 0; f < sectionLength - 1; f++) {
			const bandAddress = { ...tubeAddress, band: bands.length };
			const facets: Facet[] = [];
			for (let s = 0; s < sections.length - 1; s++) {
				facets.push(
					...generateFacetPair({
						sections,
						sectionIndex: s,
						pointIndex: f,
						bandAddress,
						facetCount: facets.length,
						pairOrientation: lateral && f < sectionLength / 2 - 1 ? 'cOverB' : 'cOverA'
					})
				);
			}
			bands.push({ orientation, facets, visible: true });
		}
	} else if (orientation === 1) {
		for (let f = 0; f < sectionLength - 1; f++) {
			const bandAddress = { ...tubeAddress, band: bands.length };
			const facets: Facet[] = [];
			for (let s = 0; s < sections.length - 1; s++) {
				facets.push(
					...generateFacetPair({
						sections,
						sectionIndex: s,
						pointIndex: f,
						bandAddress,
						facetCount: facets.length
					})
				);
			}
			bands.push({ orientation, facets, visible: true });
		}
	}
	return { bands, sections };
};

const combineSections = (edge0: ProjectionEdge, edge1: ProjectionEdge): Section[] => {
	const first = edge0.config.isDirectionMatched
		? edge0
		: { ...edge0, sections: edge0.sections.reverse() };
	const second = edge1.config.isDirectionMatched
		? edge1
		: { ...edge1, sections: edge1.sections.reverse() };

	return first.sections.map((section, i): Section => {
		const comboSection = {
			points: [
				...section.crossSectionPoints,
				...second.sections[i].crossSectionPoints.reverse().slice(1)
			]
		};
		return !edge1.config.isDirectionMatched
			? comboSection
			: { ...comboSection, points: comboSection.points.reverse() };
	});
};

const sortEdges = (
	projectionConfig: ProjectionConfig<undefined, number, number, number>,
	projection: Projection
) => {
	const { polygons } = projectionConfig.projectorConfig.polyhedron;

	const edgeMap: { polygonIndex: number; edgeIndex: number; vertices: [number, number] }[] = [];

	polygons.forEach((p, polygonIndex) =>
		p.edges.forEach((edge, edgeIndex) => {
			const v1 = edge.vertex1;
			const v0 = p.edges[(edgeIndex + p.edges.length - 1) % p.edges.length].vertex1;

			// we don't care what order these are in, we just want them to be consistent
			const vertices: [number, number] = v0 < v1 ? [v0, v1] : [v1, v0];

			edgeMap.push({ polygonIndex, edgeIndex, vertices });
		})
	);
	edgeMap.sort(({ vertices: a }, { vertices: b }) => {
		if (a[0] < b[0]) {
			return -1;
		} else if (a[0] > b[0]) {
			return 1;
		} else if (a[1] < b[1]) {
			return -1;
		} else if (a[1] > b[1]) {
			return 1;
		} else {
			return 0;
		}
	});
	const sortedAndMapped: ProjectionEdge[] = edgeMap.map(({ polygonIndex, edgeIndex }) => {
		return projection.polygons[polygonIndex].edges[edgeIndex];
	});
	return sortedAndMapped;
};

export const generateTubeBands = (
	projection: Projection,
	projectionConfig: ProjectionConfig<undefined, number, number, number>,
	projectionAddress: ProjectionAddress
): { tubes: Tube[] } => {
	const tubes: Omit<Tube, 'partners'>[] = [];
	const sortedEdges = sortEdges(projectionConfig, projection);
	const { orientation } = projectionConfig.bandConfig;

	for (let i = 0; i < sortedEdges.length; i += 2) {
		const tubeAddress = { ...projectionAddress, tube: i / 2 };
		const { bands, sections } = generateProjectionBands(
			combineSections(sortedEdges[i], sortedEdges[i + 1]),
			orientation,
			tubeAddress
		);
		const tube = {
			bands,
			sections,
			orientation,
			address: tubeAddress
		};

		tubes[i / 2] = tube;
	}
	matchTubeEnds(tubes);
	return { tubes: tubes as Tube[] };
};

const matchTubeEnds = (tubes: Tube[]) => {
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

	tubes.forEach((tube) =>
		tube.bands.forEach((band) => {
			const firstFacet = band.facets[0];
			const lastFacet = band.facets[band.facets.length - 1];

			if (!firstFacet.address || !lastFacet.address)
				throw Error('facets without address when they should');
			if (hasNoPartner(firstFacet)) {
				const { edge, partnerEdge, partner } = findPartner(firstFacet, endFacets);
				if (!partner.address) throw Error('facets without address when they should');
				const newMeta: { [key: string]: FacetEdgeMeta } = {};
				newMeta[edge] = {
					address: { ...firstFacet.address, edge },
					partner: { ...partner.address, edge: partnerEdge }
				};
				// @ts-expect-error: meta property may be missing or have an incompatible type, but we want to assign it here
				firstFacet.meta = firstFacet.meta ? { ...firstFacet.meta, ...newMeta } : newMeta;
			}
			if (hasNoPartner(lastFacet)) {
				const { edge, partnerEdge, partner } = findPartner(lastFacet, endFacets);
				if (!partner.address) throw Error('facets without address when they should');
				const newMeta: { [key: string]: FacetEdgeMeta } = {};
				newMeta[edge] = {
					address: { ...lastFacet.address, edge },
					partner: { ...partner.address, edge: partnerEdge }
				};
				// @ts-expect-error: meta property may be missing or have an incompatible type, but we want to assign it here
				lastFacet.meta = lastFacet.meta ? { ...lastFacet.meta, ...newMeta } : newMeta;
			}
		})
	);
	console.debug({ endFacets });
};

const findPartner = (facet0: Facet, facets: Facet[]) => {
	for (const facet of facets) {
		const match = getEdgeMatchedTriangles(facet0.triangle, facet.triangle);
		if (match) {
			return { partner: facet, partnerEdge: match.t1, edge: match.t0 };
		}
	}
	throw Error('failed to find partner for facet');
};

const hasNoPartner = (facet: Facet) =>
	!facet.meta?.ab.partner && !facet.meta?.ac.partner && !facet.meta?.bc.partner;

// const getPartnerTubes = ({
// 	tubeAddress,
// 	tubes
// }: {
// 	tubeAddress: ProjectionAddress_Tube;
// 	tubes: Omit<Tube, 'partners'>[];
// }): TubePartnerAddresses => {
// 	const tube = tubes[tubeAddress.tube];
// 	const otherTubes = tubes.toSpliced(tubeAddress.tube, 1);

// 	const partners: { [key: string]: ProjectionAddress_FacetEdge[] } = {
// 		startStart: [],
// 		startEnd: [],
// 		endStart: [],
// 		endEnd: []
// 	};

// 	const lastBand = tubes[0].bands.length - 1;
// 	const lastFacet = tubes[0].bands[0].facets.length - 1;
// 	const tubeEnds = {
// 		startStart: tube.bands[0].facets[0].triangle,
// 		startEnd: tube.bands[0].facets[lastFacet].triangle,
// 		endStart: tube.bands[lastBand].facets[0].triangle,
// 		endEnd: tube.bands[lastBand].facets[lastFacet].triangle
// 	};

// 	const endMapper: { [key: string]: [number, number] } = {
// 		startStart: [0, 0],
// 		startEnd: [0, lastFacet],
// 		endStart: [lastBand, 0],
// 		endEnd: [lastBand, lastFacet]
// 	};

// 	Object.entries(tubeEnds).forEach(([key, triangle0]) => {
// 		otherTubes.forEach((otherTube) => {
// 			const otherTubeEnds = {
// 				startStart: otherTube.bands[0].facets[0].triangle,
// 				startEnd: otherTube.bands[0].facets[lastFacet].triangle,
// 				endStart: otherTube.bands[lastBand].facets[0].triangle,
// 				endEnd: otherTube.bands[lastBand].facets[lastFacet].triangle
// 			};
// 			Object.entries(otherTubeEnds).forEach(([otherKey, triangle1]) => {
// 				const matched = getEdgeMatchedTriangles(triangle0, triangle1);
// 				if (matched) {
// 					partners[key].push(
// 						{
// 							...tube.address,
// 							band: endMapper[key][0],
// 							facet: endMapper[key][1],
// 							edge: matched.t0
// 						},
// 						{
// 							...otherTube.address,
// 							band: endMapper[otherKey][0],
// 							facet: endMapper[otherKey][1],
// 							edge: matched.t1
// 						}
// 					);
// 				}
// 			});
// 		});
// 	});
// 	console.debug({ partners });

// 	Object.values(partners).forEach((partner) => {
// 		if (partner.length !== 2) throw Error('partner length not 2');
// 	});
// 	return partners as TubePartnerAddresses;
// };

const normalizePoints = (points: Vector2[]) => {
	let xMax = 0;
	points.forEach((p) => {
		if (p.x > xMax) {
			xMax = p.x;
		}
	});
	return points.map((p) => p.set(p.x / xMax, p.y));
};

export const getEdgeMatchedTriangles = (
	t0: Triangle,
	t1: Triangle,
	precision = 1 / 10_000
): { t0: TriangleEdge; t1: TriangleEdge } | false => {
	const matched = ['', ''];
	if (isSameVector3(t0.a, t1.a, precision)) {
		matched[0] += 'a';
		matched[1] += 'a';
	}
	if (isSameVector3(t0.a, t1.b, precision)) {
		matched[0] += 'a';
		matched[1] += 'b';
	}
	if (isSameVector3(t0.a, t1.c, precision)) {
		matched[0] += 'a';
		matched[1] += 'c';
	}
	if (isSameVector3(t0.b, t1.a, precision)) {
		matched[0] += 'b';
		matched[1] += 'a';
	}
	if (isSameVector3(t0.b, t1.b, precision)) {
		matched[0] += 'b';
		matched[1] += 'b';
	}
	if (isSameVector3(t0.b, t1.c, precision)) {
		matched[0] += 'b';
		matched[1] += 'c';
	}
	if (isSameVector3(t0.c, t1.a, precision)) {
		matched[0] += 'c';
		matched[1] += 'a';
	}
	if (isSameVector3(t0.c, t1.b, precision)) {
		matched[0] += 'c';
		matched[1] += 'b';
	}
	if (isSameVector3(t0.c, t1.c, precision)) {
		matched[0] += 'c';
		matched[1] += 'c';
	}

	const result =
		matched[0].length === 2 && matched[1].length === 2
			? { t0: matched[0] as TriangleEdge, t1: matched[1] as TriangleEdge }
			: false;
	return result;

	// const remap = (m: string) => {
	// 	if (m === 'ba') return 'ab' as TriangleEdge;
	// 	if (m === 'cb') return 'bc' as TriangleEdge;
	// 	if (m === 'ca') return 'ac' as TriangleEdge;
	// 	return m as TriangleEdge;
	// };
	// return result === false ? result : { t0: remap(result.t0), t1: remap(result.t1) };
};

export const isSameVector3 = (v0: Vector3, v1: Vector3, precision = 1 / 10_000) => {
	return (
		Math.abs(v0.x - v1.x) < precision &&
		Math.abs(v0.y - v1.y) < precision &&
		Math.abs(v0.z - v1.z) < precision
	);
};

export const makeProjection = (
	projectionConfig: BaseProjectionConfig,
	address: ProjectionAddress
) => {
	const preparedProjectionConfig = prepareProjectionConfig(projectionConfig);

	const { projectorConfig, surfaceConfig } = preparedProjectionConfig;

	const surface = generateSurface(surfaceConfig);

	const polyhedron = generatePolyhedron(projectorConfig);
	const projection = generateProjection({
		surface,
		projector: polyhedron,
		projectionConfig: preparedProjectionConfig
	});
	const { tubes } = generateTubeBands(projection, projectionConfig, address);

	return { projection, polyhedron, tubes, surface };
};

export const printProjectionAddress = (
	a: ProjectionAddress | null | undefined,
	config?: { hideProjection?: boolean }
) => {
	if (!a) return '---';
	const showProjection = !config?.hideProjection;
	return `${showProjection ? `p${a.projection}` : ''}${'tube' in a ? `t${a.tube}` : ''}${
		'band' in a ? `b${a.band}` : ''
	}${'facet' in a ? `f${a.facet}` : ''}${'edge' in a ? `-${a.edge}` : ''}`;
};
