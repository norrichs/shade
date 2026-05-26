import { CurvePath, Vector2, Vector3 } from 'three';
import type { CrossSectionConfig, CrossSectionScaling, ProjectionEdge } from '$lib/projection-geometry/types';
import type { BezierConfig, ProjectionCurveSampleMethod } from '$lib/types';
import { getCubicBezierCurvePath } from '$lib/util';

type EdgeSection = ProjectionEdge['sections'][number];

const getManualPoints = (curvePath: CurvePath<Vector2>, divisionsArray: number[]): Vector2[] => {
	if (divisionsArray.some((d) => d < 0 || d > 1)) {
		throw new Error('getManualPoints, divisions must be between 0 and 1');
	}
	return divisionsArray.map((d) => curvePath.getPoint(d));
};

const getPoints = (
	curveConfigs: BezierConfig[],
	sampleMethod: ProjectionCurveSampleMethod
): Vector2[] => {
	const curvePath = getCubicBezierCurvePath(curveConfigs);
	return sampleMethod.method === 'manualDivisions'
		? getManualPoints(curvePath, sampleMethod.divisionsArray)
		: curvePath.getSpacedPoints(sampleMethod.divisions);
};

const getCrossSectionScale = (
	crossSectionScaling: CrossSectionScaling,
	edgeWidth?: number
): { xScale: number; yScale: number } => {
	let xScale: number;
	if (crossSectionScaling.width === 'curve') {
		xScale = edgeWidth ?? 50;
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

export function applyCrossSectionsToEdge(
	edgePoints: Vector3[],
	curvePoints: Vector3[],
	normals: Vector3[],
	crossSectionConfig: CrossSectionConfig
): EdgeSection[] {
	const definitionPoints = getPoints(
		crossSectionConfig.curves,
		crossSectionConfig.sampleMethod
	);
	const xMax = definitionPoints.reduce((max, p) => Math.max(max, p.x), 0);
	const normalizedPoints = definitionPoints.map((p) => p.clone().set(p.x / xMax, p.y));

	const xDirection = new Vector3();
	const yDirection = new Vector3();

	return edgePoints.map((edgePoint, i): EdgeSection => {
		const curvePoint = curvePoints[i];
		const normal = normals[i];

		if (crossSectionConfig.shouldSkewCurve) {
			xDirection.copy(curvePoint).sub(edgePoint).normalize();
		} else {
			const edgeToCurve = new Vector3().copy(curvePoint).sub(edgePoint);
			const normalComponent = normal.clone().multiplyScalar(edgeToCurve.dot(normal));
			xDirection.copy(edgeToCurve).sub(normalComponent).normalize();
		}
		yDirection.copy(normal).normalize();

		const baseScalingLength = edgePoint.distanceTo(curvePoint);
		const { xScale, yScale } = getCrossSectionScale(
			crossSectionConfig.scaling,
			baseScalingLength
		);

		const crossSectionPoints = normalizedPoints.map((p) =>
			edgePoint
				.clone()
				.addScaledVector(xDirection, (p.x - crossSectionConfig.center.x) * xScale)
				.addScaledVector(yDirection, (p.y - crossSectionConfig.center.y) * yScale)
		);

		return {
			intersections: { edge: edgePoint.clone(), curve: curvePoint.clone() },
			crossSectionPoints
		};
	});
}
