import type { Band, BandOrientation, BezierConfig, Facet, Point3 } from '$lib/types';
import { average, getCubicBezierCurvePath, getVector3 } from '$lib/util';
import { Ray, Sphere, SphereGeometry, Triangle, Vector2, Vector3 } from 'three';
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
	Tube
} from './types';

export const prepareProjectionConfig = (
	config: BaseProjectionConfig
): ProjectionConfig<Point3, Point3, EdgeCurveConfig, CrossSectionConfig> => {
	const { vertices, edgeCurves, crossSectionCurves } = config.projectorConfig.polyhedron;

	const polygons: PolygonConfig<Point3, Point3, EdgeCurveConfig, CrossSectionConfig>[] =
		config.projectorConfig.polyhedron.polygons.map((polygon) => {
			const backfilledPolygon = {
				...polygon,
				edges: polygon.edges.map(
					(edge: EdgeConfig<undefined, number, number, number>, i: number) => {
						const { vertex1, widthCurve, heightCurve, crossSectionCurve } = edge;
						const vertex0 =
							typeof edge.vertex0 === 'number'
								? edge.vertex0
								: polygon.edges[(i + polygon.edges.length - 1) % polygon.edges.length].vertex1;

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
			return backfilledPolygon;
		});
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

export const generateSphereInstance = ({ radius, center: { x, y, z } }: SurfaceConfig) => {
	const sphereGeometry = new SphereGeometry(radius, 100, 50);
	const sphere = new Sphere(new Vector3(x, y, z), radius);
	return { sphereGeometry, sphere };
};

export const generatePolyhedron = (
	projectorConfig: ProjectorConfig<Point3, Point3, EdgeCurveConfig, CrossSectionConfig>
) => {
	const polyhedron: Polyhedron = {
		polygons: projectorConfig.polyhedron.polygons.map((polygon) => {
			return {
				edges: polygon.edges.map((edgeConfig) => {
					const center = getPolygonCenter(polygon);
					const { edgePoints, curvePoints } = generateEdge({ edgeConfig, center });
					return { edgePoints, curvePoints, config: edgeConfig };
				})
			};
		})
	};
	return polyhedron;
};

// export const getPolyhedronPoints = (projectorConfig: ProjectorConfig): Vector3[] => {
// 	const points = new Array<Vector3>();

// 	projectorConfig.polyhedron.polygons.forEach((polygon) => {
// 		polygon.edges.forEach((edgeConfig) => {
// 			const center = getPolygonCenter(polygon);
// 			const { edgePoints, curvePoints } = generateEdge({ projectorConfig, edgeConfig, center });
// 			points.push(...collateEdgePoints(edgePoints, curvePoints));
// 		});
// 	});

// 	return points;
// };

const getPolygonCenter = (
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
	// projectorConfig,
	edgeConfig: { vertex0, vertex1, widthCurve, isDirectionMatched },
	center
}: {
	// projectorConfig: ProjectorConfig<Point3, Point3, EdgeCurveConfig, CrossSectionConfig>;
	edgeConfig: EdgeConfig<Point3, Point3, EdgeCurveConfig, CrossSectionConfig>;
	center: Vector3;
}) => {
	const { divisions } = widthCurve.sampleMethod;
	const [v0, v1] = getVector3([vertex0, vertex1]) as Vector3[];
	const edgePoints = [];

	for (let i = 0; i <= divisions; i++) {
		edgePoints.push(v0.clone().lerp(v1, i / divisions));
	}

	const curveDefinitionPoints = getPoints(widthCurve.curves, divisions);

	const curvePoints = isDirectionMatched
		? curveDefinitionPoints.map((point) => {
				const pointOnLeg0 = v0.clone().lerp(center, point.x);
				const pointOnLeg1 = v1.clone().lerp(center, point.x);
				return pointOnLeg0.clone().lerp(pointOnLeg1, point.y);
		  })
		: curveDefinitionPoints.reverse().map((point) => {
				const pointOnLeg0 = v1.clone().lerp(center, point.x);
				const pointOnLeg1 = v0.clone().lerp(center, point.x);
				return pointOnLeg0.clone().lerp(pointOnLeg1, point.y);
		  });
	return { edgePoints, curvePoints };
};

const getPoints = (curveConfigs: BezierConfig[], divisions: number): Vector2[] => {
	const curvePath = getCubicBezierCurvePath(curveConfigs);
	const vectors = curvePath.getSpacedPoints(divisions);
	return vectors;
};

const getCrossSectionScale = (crossSectionScaling: CrossSectionScaling, edgeWidth: number) => {
	let xScale: number;
	if (crossSectionScaling.width === 'curve') {
		xScale = edgeWidth;
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
	surface: Sphere;
	projector: Polyhedron;
	projectionConfig: ProjectionConfig<Point3, Point3, EdgeCurveConfig, CrossSectionConfig>;
};

export const generateProjection = ({
	surface,
	projector,
	projectionConfig
}: GenerateProjectionProps) => {
	const center = getVector3(projectionConfig.surfaceConfig.center) as Vector3;
	// const { crossSectionConfig } = projectionConfig.projectorConfig;
	// const crossSectionDefinitionPoints = normalizePoints(
	// 	getPoints(crossSectionConfig.curves, crossSectionConfig.sampleMethod.divisions)
	// );

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

						const edgeRay = new Ray(center, yDirection);
						const curveRay = new Ray(center, curveDirection);

						edgeRay.intersectSphere(surface, int.edge);
						curveRay.intersectSphere(surface, int.curve);

						const shouldSkewCurve = true;

						let xDirection: Vector3;
						let baseScalingLength: number;
						if (shouldSkewCurve) {
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

	console.debug('combineSections', first.sections.length, first, second.sections.length, second);

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

	const { sphereGeometry: surfaceGeometry, sphere } = generateSphereInstance(surfaceConfig);

	const polyhedron = generatePolyhedron(projectorConfig);
	const projection = generateProjection({
		surface: sphere,
		projector: polyhedron,
		projectionConfig: preparedProjectionConfig
	});
	const { tubes } = generateTubeBands(projection, projectionConfig);

	return { projection, polyhedron, tubes, surfaceGeometry };
};
