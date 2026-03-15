import type {
	Band,
	FacetOrientation,
	BezierConfig,
	Facet,
	Point3,
	FacetEdgeMeta,
	TrianglePoint,
	SuperGlobule,
	GlobuleConfig
} from '$lib/types';
import {
	average,
	concatAddress,
	getCubicBezierCurvePath,
	getIntersectionOfLines,
	getVector3
} from '$lib/util';
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
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
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
	GlobuleAddress,
	GlobuleAddress_Band,
	GlobuleAddress_Facet,
	GlobuleAddress_Tube,
	ProjectionConfig,
	ProjectionCurveSampleMethod,
	ProjectionEdge,
	ProjectorConfig,
	Section,
	SphereConfig,
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
import { generateGlobuleTube, generateGlobuleData } from '$lib/generate-shape';
import { collateGlobuleTubeGeometry } from './collate-geometry';
import { auditSides, auditSurfaceProjectionSides } from './audit';

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

export const getMatrix4 = (
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

export const generateSphereMesh = ({ radius }: SphereConfig) => {
	const sphereGeometry = new SphereGeometry(radius, 100, 100);
	const sphereMesh = new Mesh(sphereGeometry, materials.default);
	return sphereMesh;
};

export const generateGlobuleMesh = (config: GlobuleConfig) => {
	const tube = generateGlobuleTube(config);
	const geometries = collateGlobuleTubeGeometry([tube], {
		any: true,
		bands: true,
		facets: false,
		sections: false
	});

	const globuleMesh = new Object3D();

	// Add band geometries as meshes
	if (geometries.bands) {
		geometries.bands.forEach((bandGeometry) => {
			const bandMesh = new Mesh(bandGeometry, materials.default);
			globuleMesh.add(bandMesh);
		});
	}

	return globuleMesh;
};

export const generateCapsuleMesh = ({
	radius,
	height,
	capSegments,
	radialSegments,
	heightSegments
}: CapsuleConfig) => {
	const capsuleGeometry = new CapsuleGeometry(radius, height, capSegments, radialSegments);
	const capsuleMesh = new Mesh(capsuleGeometry, materials.default);
	return capsuleMesh;
};

/**
 * Applies BVH (Bounding Volume Hierarchy) acceleration to all meshes in an Object3D.
 * This dramatically speeds up ray-mesh intersection tests by using spatial acceleration.
 *
 * @param object - The Object3D to optimize (can contain nested meshes)
 */
const optimizeSurfaceForRaycasting = (object: Object3D): void => {
	let meshCount = 0;
	let totalVertices = 0;

	object.traverse((child) => {
		if (child instanceof Mesh && child.geometry) {
			// Check if BVH is already computed
			if (!(child.geometry as any).boundsTree) {
				try {
					// Compute BVH for this geometry
					(child.geometry as any).computeBoundsTree = computeBoundsTree.bind(child.geometry);
					(child.geometry as any).disposeBoundsTree = disposeBoundsTree.bind(child.geometry);
					(child.geometry as any).computeBoundsTree();

					// Replace raycast method with accelerated version
					child.raycast = acceleratedRaycast;

					meshCount++;
					totalVertices += child.geometry.attributes.position?.count || 0;
				} catch (error) {
					console.warn('Failed to compute BVH for mesh:', error);
				}
			}
		}
	});

	if (meshCount > 0) {
	}
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
	} else if (cfg.type === 'GlobuleConfig') {
		const globuleMesh = generateGlobuleMesh(cfg);
		surface.add(globuleMesh);

		// Add end cap meshes if present
		const globuleData = generateGlobuleData(cfg);
		if (globuleData.endCaps) {
			if (globuleData.endCaps.topCap) {
				surface.add(globuleData.endCaps.topCap.mesh);
			}
			if (globuleData.endCaps.bottomCap) {
				surface.add(globuleData.endCaps.bottomCap.mesh);
			}
		}
	}
	const transformMatrix = getMatrix4(cfg.transform);
	surface.applyMatrix4(transformMatrix);
	surface.updateMatrixWorld(true);

	// Apply BVH acceleration for fast ray tracing
	optimizeSurfaceForRaycasting(surface);

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
	const startTime = performance.now();

	// Get center based on surface config type
	let center: Vector3;
	if (projectionConfig.surfaceConfig.type === 'GlobuleConfig') {
		// For GlobuleConfig, use origin as center
		center = new Vector3(0, 0, 0);
	} else {
		center = getVector3(projectionConfig.surfaceConfig.center) as Vector3;
	}

	// Create raycasters once and reuse them for all points (optimization)
	const edgeRaycaster = new Raycaster(undefined, undefined, undefined, 2000);
	const curveRaycaster = new Raycaster(undefined, undefined, undefined, 2000);
	const yDirection = new Vector3();
	const curveDirection = new Vector3();

	// Object pool for temporary Vector3 calculations (optimization)
	const xDirection = new Vector3();
	const nearestPoint = new Vector3();
	const tempVec = new Vector3();

	// Cache for cross-section definition points (optimization)
	// Many edges share the same cross-section config, so cache the normalized points
	const crossSectionCache = new Map<CrossSectionConfig, Vector2[]>();

	const getCachedCrossSectionPoints = (config: CrossSectionConfig): Vector2[] => {
		let cached = crossSectionCache.get(config);
		if (!cached) {
			cached = normalizePoints(getPoints(config.curves, config.sampleMethod));
			crossSectionCache.set(config, cached);
		}
		return cached;
	};

	const projection: Projection = {
		polygons: projector.polygons.map((polygon: Polygon, p) => {
			return {
				edges: polygon.edges.map((edge: Edge, e) => {
					const crossSectionConfig =
						projectionConfig.projectorConfig.polyhedron.polygons[p].edges[e].crossSectionCurve;
					const crossSectionDefinitionPoints = getCachedCrossSectionPoints(crossSectionConfig);
					const sectionGeometry = edge.edgePoints.map((p, i) => {
						const c = edge.curvePoints[i];
						const int = { edge: new Vector3(), curve: new Vector3() };

						// Reuse Vector3 objects and raycasters instead of creating new ones
						yDirection.copy(center).addScaledVector(p, 1).normalize();
						curveDirection.copy(center).addScaledVector(c, 1).normalize();

						edgeRaycaster.set(center, yDirection);
						curveRaycaster.set(center, curveDirection);
						const edgeIntersections = edgeRaycaster.intersectObject(surface, true);
						const curveIntersections = curveRaycaster.intersectObject(surface, true);

						if (!edgeIntersections[0] || !curveIntersections[0]) {
							const missingInfo = [];
							if (!edgeIntersections[0]) missingInfo.push('edge intersection');
							if (!curveIntersections[0]) missingInfo.push('curve intersection');

							console.error('missing intersections', {
								missing: missingInfo,
								edgeIntersections,
								curveIntersections,
								pointIndex: i,
								polygonIndex: p,
								edgeIndex: e,
								totalEdgePoints: edge.edgePoints.length,
								edgePoints: edge.edgePoints,
								curvePoints: edge.curvePoints
							});

							throw new Error(
								`No intersection found at polygon ${p}, edge ${e}, point ${i}/${edge.edgePoints.length}. ` +
									`Missing: ${missingInfo.join(', ')}. ` +
									`This usually indicates gaps in the surface geometry (typically at start/end of globule). ` +
									`Try adjusting silhouette curves or enabling end caps.`
							);
						}

						int.edge = edgeIntersections[0].point.clone();
						int.curve = curveIntersections[0].point.clone();
						const edgeRay = edgeRaycaster.ray;

						let baseScalingLength: number;
						if (crossSectionConfig.shouldSkewCurve) {
							// Reuse xDirection vector instead of creating new one
							xDirection.copy(int.curve).addScaledVector(int.edge, -1).normalize();
							baseScalingLength = int.edge.distanceTo(int.curve);
						} else {
							// Reuse nearestPoint vector instead of creating new one
							edgeRay.closestPointToPoint(int.curve, nearestPoint);
							xDirection.copy(int.curve).addScaledVector(nearestPoint, -1).normalize();
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
		address: { globule: 0 }
	};

	const endTime = performance.now();
	const elapsedSeconds = (endTime - startTime) / 1000;
	const totalEdges = projection.polygons.reduce((sum, p) => sum + p.edges.length, 0);
	const cacheHitRate =
		crossSectionCache.size > 0
			? (((totalEdges - crossSectionCache.size) / totalEdges) * 100).toFixed(1)
			: '0.0';
	console.log(
		`--------------------------------generateProjection completed in ${elapsedSeconds.toFixed(
			3
		)}s ` +
			`(${totalEdges} edges, ${crossSectionCache.size} unique cross-sections, ${cacheHitRate}% cache hits)` +
			`--------------------------------`
	);

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
	bandAddress: GlobuleAddress_Band;
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

export const generateProjectionBands = (
	sections: Section[],
	projectOrientation: FacetOrientation,
	tubeAddress: GlobuleAddress_Tube,
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
		console.error({ sortedAndMapped, projectionConfig, projection });
		throw new Error('sortedEdges length must be even');
	}
	return sortedAndMapped;
};

export const generateTubeBands = (
	projection: Projection,
	projectionConfig: ProjectionConfig<undefined, number, number, number>,
	projectionAddress: GlobuleAddress
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
	try {
		matchTubeEnds(tubes);
		matchFacets(tubes);
	} catch (error) {
		console.error('error matching tube ends or facets', error);
	}

	const bandAddressesByOrientation: {
		axialLeft: string[];
		axialRight: string[];
		circumferential: string[];
	} = tubes.reduce(
		(acc, tube) => {
			tube.bands.forEach((band) => {
				switch (band.facets[0].orientation) {
					case 'axial-left':
						acc.axialLeft.push(concatAddress(band.address as GlobuleAddress));
						break;
					case 'axial-right':
						acc.axialRight.push(concatAddress(band.address as GlobuleAddress));
						break;
					case 'circumferential':
						acc.circumferential.push(concatAddress(band.address as GlobuleAddress));
						break;
				}
			});
			return acc;
		},
		{ axialLeft: [] as string[], axialRight: [] as string[], circumferential: [] as string[] }
	);

	return { tubes: tubes as Tube[] };
};

const matchFacets = (tubes: Tube[]) => {
	tubes.forEach((tube, tubeIndex) => {
		tube.bands.forEach((band, bandIndex) => {
			band.facets.forEach((facet, facetIndex) => {
				if (!facet.address) {
					throw Error(
						`facet does not have address at tube:${tubeIndex}, band:${bandIndex}, facet:${facetIndex}`
					);
				}
				try {
					const edges = getFacetEdgeMeta(facet.address, tubes);
					facet.meta = edges;
				} catch (error) {
					console.error(
						`getFacetEdgeMeta failed at tube:${tubeIndex}, band:${bandIndex}, facet:${facetIndex}`,
						error
					);
					throw error;
				}
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

const getFacetEdgeMeta = (address: GlobuleAddress_Facet, tubes: Tube[]): Facet['meta'] => {
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
		if (!facet.meta) {
			throw Error(
				`end facet should already have end partner in meta at tube:${address.tube}, band:${address.band}, facet:${f}`
			);
		}
		if (!facet.meta[base]) {
			console.error('First facet meta mismatch:', {
				address,
				base,
				second,
				outer,
				orientation,
				metaKeys: Object.keys(facet.meta),
				meta: facet.meta
			});
			throw Error(
				`first facet meta missing expected edge '${base}' at tube:${address.tube}, band:${address.band}. Has keys: ${Object.keys(facet.meta).join(', ')}`
			);
		}
		edgeMeta[base].partner = { ...facet.meta[base].partner };
		edgeMeta[second].partner = { ...address, facet: f + 1, edge: second };
		edgeMeta[outer].partner = { ...address, band: partnerBand, facet: partnerFacet, edge: pOuter };
	} else if (isLastFacet) {
		if (!facet.meta) {
			throw Error(
				`end facet should already have end partner in meta at tube:${address.tube}, band:${address.band}, facet:${f}`
			);
		}
		if (!facet.meta[second]) {
			console.error('Last facet meta mismatch:', {
				address,
				base,
				second,
				outer,
				orientation,
				metaKeys: Object.keys(facet.meta),
				meta: facet.meta
			});
			throw Error(
				`last facet meta missing expected edge '${second}' at tube:${address.tube}, band:${address.band}. Has keys: ${Object.keys(facet.meta).join(', ')}`
			);
		}
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

			if (!firstFacet.address || !lastFacet.address) {
				throw Error(
					`facets without address at tube:${t}, band:${b} (first: ${!!firstFacet.address}, last: ${!!lastFacet.address})`
				);
			}

			if (hasNoPartner(firstFacet)) {
				try {
					const { edge, partnerEdge, partner } = findPartner(
						firstFacet,
						endFacets,
						getEdge('base', 'even', firstFacet.orientation)
					);

					if (!partner.address) {
						throw Error(
							`partner facet without address when matching firstFacet at tube:${t}, band:${b}`
						);
					}
					const newMeta: { [key: string]: FacetEdgeMeta } = {};
					newMeta[edge] = {
						partner: { ...partner.address, edge: partnerEdge }
					};
					// @ts-expect-error: meta property may be missing or have an incompatible type, but we want to assign it here
					firstFacet.meta = firstFacet.meta ? { ...firstFacet.meta, ...newMeta } : newMeta;
				} catch (error) {
					console.error(`matchTubeEnds failed for firstFacet at tube:${t}, band:${b}`, error);
					throw error;
				}
			}

			if (hasNoPartner(lastFacet)) {
				try {
					const { edge, partnerEdge, partner } = findPartner(
						lastFacet,
						endFacets,
						getEdge('base', 'even', lastFacet.orientation)
					);
					if (!partner.address) {
						throw Error(
							`partner facet without address when matching lastFacet at tube:${t}, band:${b}`
						);
					}
					const newMeta: { [key: string]: FacetEdgeMeta } = {};
					newMeta[edge] = {
						partner: { ...partner.address, edge: partnerEdge }
					};
					// @ts-expect-error: meta property may be missing or have an incompatible type, but we want to assign it here
					lastFacet.meta = lastFacet.meta ? { ...lastFacet.meta, ...newMeta } : newMeta;
				} catch (error) {
					console.error(`matchTubeEnds failed for lastFacet at tube:${t}, band:${b}`, error);
					throw error;
				}
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
	const addressStr = facet0.address
		? `tube:${facet0.address.tube}, band:${facet0.address.band}, facet:${facet0.address.facet}`
		: 'no address';
	console.error('findPartner failed:', {
		facet0Address: addressStr,
		edgeToMatch,
		totalEndFacets: facets.length,
		facet0Triangle: {
			a: facet0.triangle.a.toArray(),
			b: facet0.triangle.b.toArray(),
			c: facet0.triangle.c.toArray()
		}
	});
	throw Error(`failed to find partner for facet at ${addressStr}, edge: ${edgeToMatch}`);
};

const hasNoPartner = (facet: Facet) =>
	!facet.meta?.ab?.partner && !facet.meta?.ac?.partner && !facet.meta?.bc?.partner;

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

/**
 * Generate bands from the surface projection geometry (edge + curve intersection points).
 * Each polyhedron edge produces one band (one tube with one band).
 */
export const generateSurfaceProjectionBands = (
	projection: Projection,
	projectionConfig: ProjectionConfig<undefined, number, number, number>,
	projectionAddress: GlobuleAddress
): { tubes: Tube[] } => {
	const tubes: Tube[] = [];
	let tubeCounter = 0;

	// Build edge map for cross-edge partner matching
	const { polygons } = projectionConfig.projectorConfig.polyhedron;
	const edgeMap: { polygonIndex: number; edgeIndex: number; vertices: [number, number] }[] = [];
	polygons.forEach((p, polygonIndex) =>
		p.edges.forEach((edge, edgeIndex) => {
			const v1 = edge.vertex1;
			const v0 = p.edges[(edgeIndex + p.edges.length - 1) % p.edges.length].vertex1;
			const vertices: [number, number] = v0 < v1 ? [v0, v1] : [v1, v0];
			edgeMap.push({ polygonIndex, edgeIndex, vertices });
		})
	);

	// Map from (polygonIndex, edgeIndex) to tube index for partner matching
	const edgeToTubeIndex = new Map<string, number>();

	// Derive projection center for winding check
	const projCenter = projectionConfig.surfaceConfig.type === 'GlobuleConfig'
		? new Vector3(0, 0, 0)
		: getVector3(projectionConfig.surfaceConfig.center) as Vector3;

	projection.polygons.forEach((polygon, polygonIndex) => {
		polygon.edges.forEach((edge, edgeIndex) => {
			if (edge.sections.length < 2) return;

			const tubeAddress: GlobuleAddress_Tube = { ...projectionAddress, tube: tubeCounter };

			// Determine point order by checking if default [edge, curve] produces outward-facing triangles.
			// The first even facet (axial-right) is: (s0.p0, s0.p1, s1.p0) = (edge0, curve0, edge1).
			// Its normal = (curve0 - edge0) × (edge1 - edge0). If this points away from center, keep order.
			const e0 = edge.sections[0].intersections.edge;
			const c0 = edge.sections[0].intersections.curve;
			const e1 = edge.sections[1].intersections.edge;
			const v1 = new Vector3().subVectors(c0, e0);
			const v2 = new Vector3().subVectors(e1, e0);
			const testNormal = new Vector3().crossVectors(v1, v2);
			const centroid = new Vector3().addVectors(e0, c0).add(e1).divideScalar(3);
			const toFacet = new Vector3().subVectors(centroid, projCenter);
			const shouldSwap = testNormal.dot(toFacet) < 0;

			// Build sections with corrected point order
			const sections: Section[] = edge.sections.map((section) => ({
				points: shouldSwap
					? [section.intersections.curve.clone(), section.intersections.edge.clone()]
					: [section.intersections.edge.clone(), section.intersections.curve.clone()]
			}));

			// Generate bands (2 points per section = 1 band)
			const bands = generateProjectionBands(sections, 'axial-right', tubeAddress);

			const tube: Tube = {
				bands,
				sections,
				orientation: 'axial-right',
				address: tubeAddress
			};

			edgeToTubeIndex.set(`${polygonIndex}-${edgeIndex}`, tubeCounter);
			tubes[tubeCounter] = tube;
			tubeCounter++;
		});
	});

	try {
		// Step 1: Cross-polyhedron-edge partners (outer edges of paired edges)
		matchCrossEdgePartners(tubes, edgeMap, edgeToTubeIndex, projection);

		// Step 2: Polygon-vertex partners (tube ends at polygon vertices)
		matchSurfaceProjectionTubeEnds(tubes, projection, edgeToTubeIndex);

		// Step 3: Within-band sequential partners (base/second edges)
		matchSurfaceProjectionFacets(tubes);
	} catch (error) {
		console.error('error matching surface projection partners', error);
	}

	return { tubes };
};

/**
 * Match facets across paired polyhedron edges (they share the 'edge' intersection points).
 * Pre-populates the outer edge (ac) meta on matching facets.
 */
const matchCrossEdgePartners = (
	tubes: Tube[],
	edgeMap: { polygonIndex: number; edgeIndex: number; vertices: [number, number] }[],
	edgeToTubeIndex: Map<string, number>,
	projection: Projection
) => {
	// Sort edge map to find pairs (consecutive entries with same vertices)
	const sorted = [...edgeMap].sort(({ vertices: a }, { vertices: b }) => {
		if (a[0] !== b[0]) return a[0] - b[0];
		return a[1] - b[1];
	});

	for (let i = 0; i < sorted.length - 1; i += 2) {
		const e0 = sorted[i];
		const e1 = sorted[i + 1];
		if (e0.vertices[0] !== e1.vertices[0] || e0.vertices[1] !== e1.vertices[1]) {
			continue; // not a pair
		}

		const tubeIdx0 = edgeToTubeIndex.get(`${e0.polygonIndex}-${e0.edgeIndex}`);
		const tubeIdx1 = edgeToTubeIndex.get(`${e1.polygonIndex}-${e1.edgeIndex}`);
		if (tubeIdx0 === undefined || tubeIdx1 === undefined) continue;

		const tube0 = tubes[tubeIdx0];
		const tube1 = tubes[tubeIdx1];
		if (!tube0 || !tube1) continue;

		// Each tube has exactly 1 band. Match facets by shared edge-side vertices.
		const band0 = tube0.bands[0];
		const band1 = tube1.bands[0];
		if (!band0 || !band1) continue;

		// For axial-right with [edge, curve] sections:
		// The 'ac' edge (outer) connects edge-side vertices between consecutive sections
		// Paired edges share the same edge intersection points, so their ac edges should match
		for (const facet0 of band0.facets) {
			for (const facet1 of band1.facets) {
				if (!facet0.address || !facet1.address) continue;
				const match = getEdgeMatchedTriangles(facet0.triangle, facet1.triangle, 'ac');
				if (match) {
					const newMeta0: { [key: string]: FacetEdgeMeta } = {};
					newMeta0[match.t0] = { partner: { ...facet1.address, edge: match.t1 } };
					facet0.meta = facet0.meta ? { ...facet0.meta, ...newMeta0 } : newMeta0;

					const newMeta1: { [key: string]: FacetEdgeMeta } = {};
					newMeta1[match.t1] = { partner: { ...facet0.address, edge: match.t0 } };
					facet1.meta = facet1.meta ? { ...facet1.meta, ...newMeta1 } : newMeta1;
					break;
				}
			}
		}
	}
};

/**
 * Match end facets at polygon vertices where adjacent edges meet.
 * At a polygon vertex, the last section of edge e shares the edge intersection
 * point with the first section of edge (e+1) % edges.length.
 *
 * These triangles share only a single vertex (not an edge), so we use
 * single-vertex proximity matching instead of getEdgeMatchedTriangles.
 */
const matchSurfaceProjectionTubeEnds = (
	tubes: Tube[],
	projection: Projection,
	edgeToTubeIndex: Map<string, number>
) => {
	projection.polygons.forEach((polygon, polygonIndex) => {
		const edgeCount = polygon.edges.length;
		for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex++) {
			const nextEdgeIndex = (edgeIndex + 1) % edgeCount;

			const tubeIdx = edgeToTubeIndex.get(`${polygonIndex}-${edgeIndex}`);
			const nextTubeIdx = edgeToTubeIndex.get(`${polygonIndex}-${nextEdgeIndex}`);
			if (tubeIdx === undefined || nextTubeIdx === undefined) continue;

			const tube = tubes[tubeIdx];
			const nextTube = tubes[nextTubeIdx];
			if (!tube || !nextTube) continue;

			const band = tube.bands[0];
			const nextBand = nextTube.bands[0];
			if (!band || !nextBand || band.facets.length === 0 || nextBand.facets.length === 0) continue;

			// Last facet(s) of current edge, first facet(s) of next edge
			const endFacets = [band.facets[band.facets.length - 1], band.facets[band.facets.length - 2]].filter(Boolean);
			const startFacets = [nextBand.facets[0], nextBand.facets[1]].filter(Boolean);

			for (const endFacet of endFacets) {
				if (!endFacet.address) continue;
				for (const startFacet of startFacets) {
					if (!startFacet.address) continue;

					// Try edge matching first (two shared vertices)
					const edgeMatch = getEdgeMatchedTriangles(endFacet.triangle, startFacet.triangle);
					if (edgeMatch) {
						const newMeta0: { [key: string]: FacetEdgeMeta } = {};
						newMeta0[edgeMatch.t0] = { partner: { ...startFacet.address, edge: edgeMatch.t1 } };
						endFacet.meta = endFacet.meta ? { ...endFacet.meta, ...newMeta0 } : newMeta0;

						const newMeta1: { [key: string]: FacetEdgeMeta } = {};
						newMeta1[edgeMatch.t1] = { partner: { ...endFacet.address, edge: edgeMatch.t0 } };
						startFacet.meta = startFacet.meta ? { ...startFacet.meta, ...newMeta1 } : newMeta1;
						break;
					}

					// Fall back to single-vertex matching (polygon vertices share one point)
					const vertexMatch = getVertexMatchedTriangles(endFacet.triangle, startFacet.triangle);
					if (vertexMatch) {
						const newMeta0: { [key: string]: FacetEdgeMeta } = {};
						newMeta0[vertexMatch.t0] = { partner: { ...startFacet.address, edge: vertexMatch.t1 } };
						endFacet.meta = endFacet.meta ? { ...endFacet.meta, ...newMeta0 } : newMeta0;

						const newMeta1: { [key: string]: FacetEdgeMeta } = {};
						newMeta1[vertexMatch.t1] = { partner: { ...endFacet.address, edge: vertexMatch.t0 } };
						startFacet.meta = startFacet.meta ? { ...startFacet.meta, ...newMeta1 } : newMeta1;
						break;
					}
				}
			}
		}
	});
};

/**
 * Find a single shared vertex between two triangles.
 * Returns the edges containing that vertex for both triangles.
 * Used for polygon-vertex matching where adjacent edges share only one point.
 */
const getVertexMatchedTriangles = (
	t0: Triangle,
	t1: Triangle,
	precision = 1 / 10_000
): { t0: TriangleEdge; t1: TriangleEdge } | false => {
	const t0Points = ['a', 'b', 'c'] as TrianglePoint[];
	const t1Points = ['a', 'b', 'c'] as TrianglePoint[];

	for (const p0 of t0Points) {
		for (const p1 of t1Points) {
			if (isSameVector3(t0[p0], t1[p1], precision)) {
				// Found shared vertex. Return an edge containing this vertex for each triangle.
				// Pick the edge where this vertex is first (e.g., 'a' → 'ab', 'b' → 'bc', 'c' → 'ac')
				const edgeFor = (p: TrianglePoint): TriangleEdge => {
					switch (p) {
						case 'a': return 'ab';
						case 'b': return 'bc';
						case 'c': return 'ac';
					}
				};
				return { t0: edgeFor(p0), t1: edgeFor(p1) };
			}
		}
	}
	return false;
};

/**
 * Fill in sequential within-band partners (base/second edges).
 * Preserves any pre-populated meta (from cross-edge or tube-end matching).
 * Unlike getFacetEdgeMeta, this doesn't compute outer-edge partners
 * (which would self-reference with bandCount=1).
 */
const matchSurfaceProjectionFacets = (tubes: Tube[]) => {
	tubes.forEach((tube) => {
		tube.bands.forEach((band) => {
			const facetCount = band.facets.length;
			band.facets.forEach((facet, f) => {
				if (!facet.address) return;

				const address = facet.address;
				const { orientation } = facet;
				const base = getEdge('base', f, orientation);
				const second = getEdge('second', f, orientation);
				const outer = getEdge('outer', f, orientation);

				const edgeMeta = { ab: {}, bc: {}, ac: {} } as Facet['meta'];
				if (!edgeMeta) return;

				const isFirstFacet = f === 0;
				const isLastFacet = f === facetCount - 1;

				if (isFirstFacet) {
					// base partner comes from pre-populated meta (tube ends)
					if (facet.meta?.[base]?.partner) {
						edgeMeta[base].partner = { ...facet.meta[base].partner };
					}
					edgeMeta[second].partner = { ...address, facet: f + 1, edge: second };
				} else if (isLastFacet) {
					edgeMeta[base].partner = { ...address, facet: f - 1, edge: base };
					// second partner comes from pre-populated meta (tube ends)
					if (facet.meta?.[second]?.partner) {
						edgeMeta[second].partner = { ...facet.meta[second].partner };
					}
				} else {
					edgeMeta[base].partner = { ...address, facet: f - 1, edge: base };
					edgeMeta[second].partner = { ...address, facet: f + 1, edge: second };
				}

				// outer partner comes from pre-populated meta (cross-edge matching)
				if (facet.meta?.[outer]?.partner) {
					edgeMeta[outer].partner = { ...facet.meta[outer].partner };
				}

				facet.meta = edgeMeta;
			});
		});
	});
};

export const makeProjection = (projectionConfig: BaseProjectionConfig, address: GlobuleAddress) => {

	// const globuleConfig = generateDefaultGlobuleConfig();
	// projectionConfig.surfaceConfig = {
	// 	...globuleConfig,
	// 	type: 'GlobuleConfig',
	// 	transform: 'inherit'
	// };

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

	auditSides(tubes);

	const { tubes: surfaceProjectionTubes } = generateSurfaceProjectionBands(
		projection, projectionConfig, address
	);
	const auditCenter = preparedProjectionConfig.surfaceConfig.type === 'GlobuleConfig'
		? new Vector3(0, 0, 0)
		: getVector3(preparedProjectionConfig.surfaceConfig.center) as Vector3;
	auditSurfaceProjectionSides(surfaceProjectionTubes, auditCenter);

	return { projection, polyhedron, tubes, surfaceProjectionTubes, surface };
};

export const printProjectionAddress = (
	a: GlobuleAddress | null | undefined,
	config?: { hideGlobule?: boolean; hideTube?: boolean }
) => {
	if (!a) return '---';
	const globule = config?.hideGlobule ? '' : `g${a.globule}`;
	const tube = config?.hideTube ? '' : 'tube' in a ? `t${a.tube}` : '';
	const band = 'band' in a ? `b${a.band}` : '';
	const facet = 'facet' in a ? `f${a.facet}` : '';
	const edge = 'edge' in a ? `-${corrected(a.edge)}` : '';

	return globule + tube + band + facet + edge;
};

export const getSections = (
	tubeAddress: GlobuleAddress_Tube,
	projections: SuperGlobule['projections']
): Section[] => {
	const projection = projections[tubeAddress.globule].projection;

	// Find all edges with matching tubeAddress
	const matchingEdges = [];
	for (const polygon of projection.polygons) {
		for (const edge of polygon.edges) {
			if (
				edge.tubeAddress?.tube === tubeAddress.tube &&
				edge.tubeAddress?.globule === tubeAddress.globule
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
	address: GlobuleAddress_Tube,
	projections: SuperGlobule['projections'],
	sectionIndex?: number
): string => {
	const sections = getSections(address, projections);

	const tube = projections[address.globule].tubes[address.tube];
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
