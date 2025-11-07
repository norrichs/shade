import type {
	Band,
	FacetOrientation,
	BezierConfig,
	Facet,
	Point3,
	FacetEdgeMeta,
	TrianglePoint,
	SuperGlobule
} from '$lib/types';
import { average, getCubicBezierCurvePath, getIntersectionOfLines, getVector3 } from '$lib/util';
import {
	CapsuleGeometry,
	CurvePath,
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
	CapsuleConfig,
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
	ProjectionAddress_Facet,
	ProjectionAddress_Tube,
	ProjectionConfig,
	ProjectionCurveSampleMethod,
	ProjectionEdge,
	ProjectorConfig,
	Section,
	SurfaceConfig,
	TransformConfig,
	TriangleEdge,
	Tube,
	VerticesConfig
} from './types';
import { materials } from '../../components/three-renderer/materials';
import { getLength } from '$lib/patterns/utils';
import {
	corrected,
	getTrianglePointAsKVFromTriangleEdge,
	getTrianglePointFromTriangleEdge
} from '$lib/cut-pattern/generate-pattern';

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

export const generateCapsuleMesh = ({ radius, height, capSegments, radialSegments, heightSegments }: CapsuleConfig) => {
	const capsuleGeometry = new CapsuleGeometry(radius, height, capSegments,radialSegments);
	const capsuleMesh = new Mesh(capsuleGeometry, materials.default);
	return capsuleMesh;
};

export const generateSurface = (cfg: SurfaceConfig) => {
	if (cfg.transform === 'inherit') {
		throw new Error('generateSurface - surface transform should not be "inherit"');
	}

	const surface = new Object3D();
	if (cfg.type === 'SphereConfig') {
		const sphereMesh = generateSphereMesh(cfg);
		surface.add(sphereMesh);
	} else if (cfg.type === 'CapsuleConfig') {
		const capsuleMesh = generateCapsuleMesh(cfg);
		surface.add(capsuleMesh);
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
	const transformMatrix = getMatrix4(transformConfig);

	const { divisions } = widthCurve.sampleMethod;
	const [v0, v1] = getVector3([vertex0, vertex1]) as Vector3[];
	v0.applyMatrix4(transformMatrix);
	v1.applyMatrix4(transformMatrix);
	const center = originalCenter.clone().applyMatrix4(transformMatrix);

	const edgePoints = [];

	for (let i = 0; i <= divisions; i++) {
		edgePoints.push(v0.clone().lerp(v1, i / divisions));
	}

	const definitionPoints = getPoints(widthCurve.curves, widthCurve.sampleMethod);
	const curvePoints = mapPointsToTriangle(
		{ a: v0, b: v1, c: center },
		definitionPoints,
		isDirectionMatched
	);

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

const MANUAL_EDGE_DIVISIONS = [0.18, 0.38, 0.65];

const getManualPoints = (curvePath: CurvePath<Vector2>, divisionsArray: number[]): Vector2[] => {
	if (divisionsArray.some((d) => d <= 0 || d >= 1)) {
		throw new Error('getManualPoints, divisions must be between 0 and 1');
	}
	const vectors = [0, ...divisionsArray, 1].map((t) => {
		return curvePath.getPointAt(t);
	});
	return vectors;
};

export const getPoints = (
	curveConfigs: BezierConfig[],
	sampleMethod: ProjectionCurveSampleMethod
): Vector2[] => {
	const curvePath = getCubicBezierCurvePath(curveConfigs);
	const vectors =
		sampleMethod.method === 'manualDivisions'
			? getManualPoints(curvePath, sampleMethod.divisionsArray)
			: curvePath.getSpacedPoints(sampleMethod.divisions);
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
						getPoints(crossSectionConfig.curves, crossSectionConfig.sampleMethod)
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
						if (crossSectionConfig.shouldSkewCurve) {
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
	pairOrientation = 'axial-right'
}: {
	sections: Section[];
	sectionIndex: number;
	pointIndex: number;
	bandAddress: ProjectionAddress_Band;
	facetCount: number;
	pairOrientation: FacetOrientation;
}): [Facet, Facet] => {
	switch (pairOrientation) {
		case 'axial-left':
			return [
				{
					triangle: new Triangle(
						sections[sectionIndex].points[pointIndex].clone(),
						sections[sectionIndex].points[pointIndex + 1].clone(),
						sections[sectionIndex + 1].points[pointIndex + 1].clone()
					),
					address: { ...bandAddress, facet: facetCount },
					orientation: pairOrientation
				},
				{
					triangle: new Triangle(
						sections[sectionIndex + 1].points[pointIndex + 1].clone(),
						sections[sectionIndex + 1].points[pointIndex].clone(),
						sections[sectionIndex].points[pointIndex].clone()
					),
					address: { ...bandAddress, facet: facetCount + 1 },
					orientation: pairOrientation
				}
			];
		case 'circumferential':
		case 'axial-right':
		default:
			return [
				{
					triangle: new Triangle(
						sections[sectionIndex].points[pointIndex].clone(),
						sections[sectionIndex].points[pointIndex + 1].clone(),
						sections[sectionIndex + 1].points[pointIndex].clone()
					),
					address: { ...bandAddress, facet: facetCount },
					orientation: pairOrientation
				},
				{
					triangle: new Triangle(
						sections[sectionIndex + 1].points[pointIndex + 1].clone(),
						sections[sectionIndex + 1].points[pointIndex].clone(),
						sections[sectionIndex].points[pointIndex + 1].clone()
					),
					address: { ...bandAddress, facet: facetCount + 1 },
					orientation: pairOrientation
				}
			];
	}
};

const generateProjectionBands = (
	sections: Section[],
	projectOrientation: FacetOrientation,
	tubeAddress: ProjectionAddress_Tube,
	tubeSymmetry?: 'lateral' | 'axial'
) => {
	const sectionLength = sections[0].points.length;
	const bands: Band[] = [];
	if (tubeSymmetry === 'lateral' && projectOrientation !== 'circumferential') {
		for (let f = 0; f < sectionLength - 1; f++) {
			const reflectedOrientation =
				projectOrientation === 'axial-right' ? 'axial-left' : 'axial-right';
			const bandOrientation = f < sectionLength / 2 - 1 ? projectOrientation : reflectedOrientation;

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
						pairOrientation: bandOrientation
					})
				);
			}
			bands.push({ orientation: bandOrientation, facets, visible: true, address: bandAddress });
		}
	} else if (projectOrientation === 'circumferential') {
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
						facetCount: facets.length,
						pairOrientation: projectOrientation
					})
				);
			}
			bands.push({ orientation: projectOrientation, facets, visible: true });
		}
	} else {
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
						pairOrientation: projectOrientation
					})
				);
			}
			bands.push({ orientation: projectOrientation, facets, visible: true });
		}
	}
	return bands;
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
	if (sortedAndMapped.length % 2 !== 0) {
		console.error({sortedAndMapped, projectionConfig, projection})
		throw new Error('sortedEdges length must be even');
	}
	return sortedAndMapped;
};

export const generateTubeBands = (
	projection: Projection,
	projectionConfig: ProjectionConfig<undefined, number, number, number>,
	projectionAddress: ProjectionAddress
): { tubes: Tube[] } => {
	const tubes: Omit<Tube, 'partners'>[] = [];
	const sortedEdges = sortEdges(projectionConfig, projection);

	const { orientation, tubeSymmetry } = projectionConfig.bandConfig;

	for (let i = 0; i < sortedEdges.length; i += 2) {
		const tubeAddress = { ...projectionAddress, tube: i / 2 };

		// Assign tube addresses to the edges
		sortedEdges[i].tubeAddress = tubeAddress;
		sortedEdges[i + 1].tubeAddress = tubeAddress;
		
		const sections = combineSections(sortedEdges[i], sortedEdges[i + 1]);
		const bands = generateProjectionBands(sections, orientation, tubeAddress, tubeSymmetry);
		const tube = {
			bands,
			sections,
			orientation,
			tubeSymmetry,
			address: tubeAddress
		};

		tubes[i / 2] = tube;
	}
	// matchTubeEnds(tubes);
	// matchFacets(tubes);
	return { tubes: tubes as Tube[] };
};

const matchFacets = (tubes: Tube[]) => {
	tubes.forEach((tube) => {
		tube.bands.forEach((band) => {
			band.facets.forEach((facet) => {
				if (!facet.address) throw Error('facet does not have address');
				const edges = getFacetEdgeMeta(facet.address, tubes);
				facet.meta = edges;
			});
		});
	});
};

const EDGE_MAP: { [key: string]: { [key: string]: { [key: string]: TriangleEdge } } } = {
	'axial-right': {
		even: {
			base: 'ab',
			second: 'bc',
			outer: 'ac'
		},
		odd: {
			base: 'bc',
			second: 'ab',
			outer: 'ac'
		}
	},
	circumferential: {
		even: {
			base: 'ac',
			second: 'bc',
			outer: 'ab'
		},
		odd: {
			base: 'bc',
			second: 'ac',
			outer: 'ab'
		}
	},
	'axial-left': {
		even: {
			base: 'ab',
			second: 'ac',
			outer: 'bc'
		},
		odd: {
			base: 'ac',
			second: 'ab',
			outer: 'bc'
		}
	}
};
export const getEdge = (
	edgeType: 'base' | 'second' | 'outer',
	parity: 'odd' | 'even' | number,
	orientation: FacetOrientation
) => {
	const p = typeof parity === 'number' ? (parity % 2 === 0 ? 'even' : 'odd') : parity;
	return EDGE_MAP[orientation][p][edgeType];
};

export const getBandTriangleEdges = (orientation: FacetOrientation) => {
	const { even, odd } = EDGE_MAP[orientation];
	return [
		{ base: even.base, second: even.second, outer: even.outer },
		{ base: odd.base, second: odd.second, outer: odd.outer }
	];
};

export const getBandTrianglePoints = (orientation: FacetOrientation) => {
	const { even, odd } = EDGE_MAP[orientation];
	return [
		{
			base: getTrianglePointAsKVFromTriangleEdge(even.base, 'triangle-order'),
			second: getTrianglePointAsKVFromTriangleEdge(even.second, 'triangle-order'),
			outer: getTrianglePointAsKVFromTriangleEdge(even.outer, 'triangle-order')
		},
		{
			base: getTrianglePointAsKVFromTriangleEdge(odd.base, 'triangle-order'),
			second: getTrianglePointAsKVFromTriangleEdge(odd.second, 'triangle-order'),
			outer: getTrianglePointAsKVFromTriangleEdge(odd.outer, 'triangle-order')
		}
	];
};

const getFacetEdgeMeta = (address: ProjectionAddress_Facet, tubes: Tube[]): Facet['meta'] => {
	const tube = tubes[address.tube];
	const bandCount = tube.bands.length;
	const band = tube.bands[address.band];
	const facetCount = band.facets.length;

	const edgeMeta = { ab: {}, bc: {}, ac: {} } as Facet['meta'];
	if (!edgeMeta) throw Error('stupid error');

	const f = address.facet;
	const b = address.band;

	const isFirstFacet = f === 0;
	const isLastFacet = f === facetCount - 1;
	const facet = band.facets[f];
	const { orientation } = facet;

	const isEven = f % 2 === 0;

	const bandOffset = (orientation === 'axial-left' ? -1 : 1) * (isEven ? -1 : 1);
	const partnerBand = (b + bandOffset + bandCount) % bandCount;
	const partnerBandOrientation = tube.bands[partnerBand].orientation;

	const facetOffset = (isEven ? 1 : -1) * (partnerBandOrientation === orientation ? 1 : 0);
	const partnerFacet = f + facetOffset;

	const base = getEdge('base', f, orientation);
	const second = getEdge('second', f, orientation);
	const outer = getEdge('outer', f, orientation);

	// const pBase = getEdge('base', f, partnerBandOrientation);
	// const pSecond = getEdge('second', f, partnerBandOrientation);
	const pOuter = getEdge('outer', f, partnerBandOrientation);

	if (isFirstFacet) {
		if (!facet.meta) throw Error('end facet should already have end partner in meta');
		edgeMeta[base].partner = { ...facet.meta[base].partner };
		edgeMeta[second].partner = { ...address, facet: f + 1, edge: second };
		edgeMeta[outer].partner = { ...address, band: partnerBand, facet: partnerFacet, edge: pOuter };
	} else if (isLastFacet) {
		if (!facet.meta) throw Error('end facet should already have end partner in meta');
		edgeMeta[second].partner = { ...facet.meta[second].partner };
		edgeMeta[base].partner = { ...address, facet: f - 1, edge: base };
		edgeMeta[outer].partner = { ...address, band: partnerBand, facet: partnerFacet, edge: pOuter };
	} else {
		edgeMeta[base].partner = { ...address, facet: f - 1, edge: base };
		edgeMeta[second].partner = { ...address, facet: f + 1, edge: second };
		edgeMeta[outer].partner = { ...address, band: partnerBand, facet: partnerFacet, edge: pOuter };
	}
	if (!edgeMeta.ab.partner) {
		throw Error('missing partner ab');
	}
	if (!edgeMeta.bc.partner) {
		throw Error('missing partner bc');
	}
	if (!edgeMeta.ac.partner) {
		throw Error('missing partner ac');
	}
	return edgeMeta;
};

// WARNING -
// matchTubeEnds is configured for axial facet orientation only.
// Circumferential orientation will need to match first and last bands rather than the first and last facets of each band
// TODO: create new matchTubeEnds function for circumferential orientation only

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
	tubes.forEach((tube, t) =>
		tube.bands.forEach((band, b) => {
			const firstFacet = band.facets[0];
			const lastFacet = band.facets[band.facets.length - 1];

			if (!firstFacet.address || !lastFacet.address)
				throw Error('facets without address when they should');
			if (hasNoPartner(firstFacet)) {
				const { edge, partnerEdge, partner } = findPartner(
					firstFacet,
					endFacets,
					getEdge('base', 'even', firstFacet.orientation)
				);

				if (!partner.address) throw Error('facets without address when they should');
				const newMeta: { [key: string]: FacetEdgeMeta } = {};
				newMeta[edge] = {
					// address: { ...firstFacet.address, edge },
					partner: { ...partner.address, edge: partnerEdge }
				};
				// @ts-expect-error: meta property may be missing or have an incompatible type, but we want to assign it here
				firstFacet.meta = firstFacet.meta ? { ...firstFacet.meta, ...newMeta } : newMeta;
			}
			if (hasNoPartner(lastFacet)) {
				const { edge, partnerEdge, partner } = findPartner(
					lastFacet,
					endFacets,
					getEdge('base', 'even', lastFacet.orientation)
				);
				if (!partner.address) throw Error('facets without address when they should');
				const newMeta: { [key: string]: FacetEdgeMeta } = {};
				newMeta[edge] = {
					// address: { ...lastFacet.address, edge },
					partner: { ...partner.address, edge: partnerEdge }
				};
				// @ts-expect-error: meta property may be missing or have an incompatible type, but we want to assign it here
				lastFacet.meta = lastFacet.meta ? { ...lastFacet.meta, ...newMeta } : newMeta;
			}
		})
	);
};

const findPartner = (facet0: Facet, facets: Facet[], edgeToMatch: TriangleEdge) => {
	for (const facet of facets) {
		const match =
			facet0.address &&
			facet.address &&
			facet0.address.tube !== facet.address.tube &&
			getEdgeMatchedTriangles(facet0.triangle, facet.triangle, edgeToMatch);
		if (match) {
			return { partner: facet, partnerEdge: match.t1, edge: match.t0 };
		}
	}
	throw Error('failed to find partner for facet');
};

const hasNoPartner = (facet: Facet) =>
	!facet.meta?.ab.partner && !facet.meta?.ac.partner && !facet.meta?.bc.partner;

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
	edgeToMatch?: TriangleEdge | undefined,
	precision = 1 / 10_000
): { t0: TriangleEdge; t1: TriangleEdge } | false => {
	const matched = ['', ''];

	const t0Points = edgeToMatch
		? getTrianglePointFromTriangleEdge(edgeToMatch, 'triangle-order')
		: (['a', 'b', 'c'] as TrianglePoint[]);

	t0Points.forEach((side0) => {
		(['a', 'b', 'c'] as TrianglePoint[]).forEach((side1) => {
			if (isSameVector3(t0[side0], t1[side1], precision)) {
				matched[0] += side0;
				matched[1] += side1;
			}
		});
	});

	return matched[0].length === 2 && matched[1].length === 2
		? { t0: matched[0] as TriangleEdge, t1: matched[1] as TriangleEdge }
		: false;
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
	config?: { hideProjection?: boolean; hideTube?: boolean }
) => {
	if (!a) return '---';
	const projection = config?.hideProjection ? '' : `p${a.projection}`;
	const tube = config?.hideTube ? '' : 'tube' in a ? `t${a.tube}` : '';
	const band = 'band' in a ? `b${a.band}` : '';
	const facet = 'facet' in a ? `f${a.facet}` : '';
	const edge = 'edge' in a ? `-${corrected(a.edge)}` : '';

	return projection + tube + band + facet + edge;
};

export const getSections = (
	tubeAddress: ProjectionAddress_Tube,
	projections: SuperGlobule['projections']
): Section[] => {
	const projection = projections[tubeAddress.projection].projection;

	// Find all edges with matching tubeAddress
	const matchingEdges = [];
	for (const polygon of projection.polygons) {
		for (const edge of polygon.edges) {
			if (
				edge.tubeAddress?.tube === tubeAddress.tube &&
				edge.tubeAddress?.projection === tubeAddress.projection
			) {
				matchingEdges.push(edge);
			}
		}
	}

	if (matchingEdges.length === 0) {
		return [];
	}

	// Get number of sections (all matching edges should have the same number)
	const numSections = matchingEdges[0].sections.length;

	// For each section index, concatenate crossSectionPoints from all matching edges
	const sections: Section[] = [];
	for (let sectionIndex = 0; sectionIndex < numSections; sectionIndex++) {
		const points = [];
		for (const edge of matchingEdges) {
			points.push(...edge.sections[sectionIndex].crossSectionPoints);
		}
		sections.push({ points });
	}

	return sections;
};

const Z_AXIS = new Vector3(0, 0, 1);
export const getCrossSectionPath = (
	address: ProjectionAddress_Tube,
	projections: SuperGlobule['projections'],
	sectionIndex?: number
): string => {
	const sections = getSections(address, projections);

	const tube = projections[address.projection].tubes[address.tube];
	if (!sectionIndex) sectionIndex = Math.ceil(tube.bands[0].facets.length / 4);
	if (
		sectionIndex !== undefined &&
		(sectionIndex < 0 || sectionIndex > tube.bands[0].facets.length / 2 + 1)
	)
		throw Error(`Invalid section index: ${sectionIndex}`);

	const vectors = sections[sectionIndex].points;

	const middle = vectors.length / 2;
	const relativeVectors = vectors.map((v) => v.clone().addScaledVector(vectors[0], -1));
	const referenceVector = relativeVectors[middle];
	const params = relativeVectors.map((v, i) => {
		const angle = v.angleTo(referenceVector);
		const length = v.length();
		return { angle: i < middle ? angle : -angle, length };
	});

	const newReferenceVector = new Vector3(0, params[middle].length, 0);
	const pathVectors = params.map((p, i) => {
		if (i === 0) return new Vector3(0, 0, 0);
		if (i === middle) return newReferenceVector.clone();
		return newReferenceVector.clone().applyAxisAngle(Z_AXIS, p.angle).setLength(p.length);
	});

	const path =
		pathVectors.reduce((path, v) => {
			return path + `L ${v.x} ${v.y}`;
		}, `M 0 0`) + `Z`;

	return path;
};
