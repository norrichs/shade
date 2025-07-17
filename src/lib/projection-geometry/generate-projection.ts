import type { Band, BandOrientation, BezierConfig, Facet, Point3 } from '$lib/types';
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
	ProjectionConfig,
	ProjectionEdge,
	ProjectorConfig,
	SurfaceConfig,
	TransformConfig,
	Tube,
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
		translate: t = { x: 0, y: 0, z: 0 },
		rotate: r = { x: 0, y: 0, z: 0 }
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
	console.debug('generateEdge');
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
	// console.debug('Map Points From Triangle', { reverse });
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
	// console.debug('Map points to Triangle', { reverse });
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
							console.debug('missing intersections', {
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
		})
	};

	return projection;
};

const generateProjectionBands = (sections: Vector3[][], orientation: BandOrientation) => {
	const bands: Band[] = [];
	if (orientation === 0) {
		for (let s = 0; s < sections.length - 1; s++) {
			const facets: Facet[] = [];
			for (let f = 0; f < sections[s].length - 1; f++) {
				facets.push(
					{
						triangle: new Triangle(
							sections[s][f].clone(),
							sections[s][f + 1].clone(),
							sections[s + 1][f].clone()
						)
					},
					{
						triangle: new Triangle(
							sections[s + 1][f + 1].clone(),
							sections[s + 1][f].clone(),
							sections[s][f + 1].clone()
						)
					}
				);
			}
			bands.push({ orientation, facets, visible: true });
		}
	} else if (orientation === 1) {
		for (let f = 0; f < sections[0].length - 1; f++) {
			const facets: Facet[] = [];
			for (let s = 0; s < sections.length - 1; s++) {
				facets.push(
					{
						triangle: new Triangle(
							sections[s][f].clone(),
							sections[s][f + 1].clone(),
							sections[s + 1][f].clone()
						)
					},
					{
						triangle: new Triangle(
							sections[s + 1][f + 1].clone(),
							sections[s + 1][f].clone(),
							sections[s][f + 1].clone()
						)
					}
				);
			}
			bands.push({ orientation, facets, visible: true });
		}
	}
	return { bands, sections };
};

const combineSections = (edge0: ProjectionEdge, edge1: ProjectionEdge) => {
	const first = edge0.config.isDirectionMatched
		? edge0
		: { ...edge0, sections: edge0.sections.reverse() };
	const second = edge1.config.isDirectionMatched
		? edge1
		: { ...edge1, sections: edge1.sections.reverse() };

	return first.sections.map((section, i) => {
		return [
			...section.crossSectionPoints,
			...second.sections[i].crossSectionPoints.reverse().slice(1)
		];
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
	const sortedAndMapped = edgeMap.map(({ polygonIndex, edgeIndex }) => {
		return projection.polygons[polygonIndex].edges[edgeIndex];
	});
	return sortedAndMapped;
};

export const generateTubeBands = (
	projection: Projection,
	projectionConfig: ProjectionConfig<undefined, number, number, number>
): { tubes: Tube[] } => {
	const tubes: { bands: Band[]; sections: Vector3[][] }[] = [];
	const sortedEdges = sortEdges(projectionConfig, projection);
	const { orientation } = projectionConfig.bandConfig;

	for (let i = 0; i < sortedEdges.length; i += 2) {
		const { bands, sections } = generateProjectionBands(
			combineSections(sortedEdges[i], sortedEdges[i + 1]),
			orientation
		);
		tubes[i / 2] = { bands, sections };
	}

	return { tubes };
};

const normalizePoints = (points: Vector2[]) => {
	let xMax = 0;
	points.forEach((p) => {
		if (p.x > xMax) {
			xMax = p.x;
		}
	});
	return points.map((p) => p.set(p.x / xMax, p.y));
};

export const makeProjection = (projectionConfig: BaseProjectionConfig) => {
	const preparedProjectionConfig = prepareProjectionConfig(projectionConfig);

	const { projectorConfig, surfaceConfig } = preparedProjectionConfig;

	const surface = generateSurface(surfaceConfig);

	const polyhedron = generatePolyhedron(projectorConfig);
	const projection = generateProjection({
		surface,
		projector: polyhedron,
		projectionConfig: preparedProjectionConfig
	});
	const { tubes } = generateTubeBands(projection, projectionConfig);

	return { projection, polyhedron, tubes, surface };
};
