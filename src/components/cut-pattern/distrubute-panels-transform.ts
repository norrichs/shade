import { getOtherTrianglePointsFromTrianglePoint } from '$lib/cut-pattern/generate-pattern';
import { getBandTrianglePoints } from '$lib/projection-geometry/generate-projection';
import type { GlobuleAddress_Facet } from '$lib/projection-geometry/types';
import type { ProjectionPanelPattern, TrianglePoint, TubePanelPattern } from '$lib/types';
import { Triangle, Vector3 } from 'three';
import { radToDeg } from 'three/src/math/MathUtils.js';

export type ProjectionDistribution = {
	tubes: {
		bands: {
			panels: {
				x: number;
				y: number;
				angle: number;
			}[];
		}[];
	}[];
};

export type DistributionConfig =
	| { type: 'none' }
	| { type: 'contiguous'; offset: number }
	| { type: 'spaced' };

export const getDistribution = (
	pattern: ProjectionPanelPattern | { tubes: never[] },
	config: DistributionConfig
): null | ProjectionDistribution => {
	if (pattern.tubes.length === 0) return null;
	switch (config.type) {
		case 'contiguous':
			return getContiguousDistribution(pattern.tubes);
		case 'spaced':
		default:
			return getSpacedDistribution(pattern.tubes);
	}
};

const getContiguousDistribution = (tubes: TubePanelPattern[]) => {
	return {
		tubes: tubes.map((tube) => ({
			bands: tube.bands.map((band) => {
				const bandTrianglePoints = getBandTrianglePoints(band.orientation);

				let leadingEdge: { anchor: Vector3; angle: number } = {
					anchor: new Vector3(0, 0, 0),
					angle: 0
				};
				const axis = new Vector3(-1, 0, 0);
				return {
					panels: band.panels.map((panel, p) => {
						const { triangle: t } = panel;
						const { base, second, outer } = bandTrianglePoints[p % 2];

						const baseVector = t[base.p0].clone().addScaledVector(t[base.p1], -1);
						const baseAngle = baseVector.angleTo(axis);

						const diffAngle = leadingEdge.angle - baseAngle;

						const newPanel = {
							...panel,
							triangle: transformTriangle({
								triangle: t,
								point: p % 2 === 0 ? base.p1 : base.p0,
								anchor: leadingEdge.anchor,
								angle: diffAngle
							})
						};
						const secondVector = t[second.p1].clone().addScaledVector(t[second.p0], -1);
						const secondAngle = secondVector.angleTo(axis);

						leadingEdge = {
							anchor: newPanel.triangle[p % 2 === 0 ? second.p1 : second.p0],
							angle: secondAngle
						};

						const xOffset = newPanel.triangle.a.x - panel.triangle.a.x;
						const yOffset = newPanel.triangle.a.y - panel.triangle.a.y;

						return { x: xOffset, y: yOffset, angle: radToDeg(diffAngle) };
					})
				};
			})
		}))
	};
};

const transformTriangle = ({
	triangle,
	point,
	anchor,
	angle
}: {
	triangle: Triangle;
	point: TrianglePoint;
	anchor: Vector3;
	angle: number;
}) => {
	// translate all points
	const { a, b, c } = triangle;
	const translationVector = anchor.clone().addScaledVector(triangle[point], -1);

	const newTriangle = new Triangle(
		a.clone().addScaledVector(translationVector, 1),
		b.clone().addScaledVector(translationVector, 1),
		c.clone().addScaledVector(translationVector, 1)
	);

	//rotate the triangle
	const otherPoints = getOtherTrianglePointsFromTrianglePoint(point, 'triangle-order');
	otherPoints.forEach((otherPoint) => {
		const edgeVector = triangle[otherPoint].clone().addScaledVector(triangle[point], -1);
		edgeVector.applyAxisAngle(new Vector3(0, 0, 1), angle);
		newTriangle[otherPoint] = triangle[point].clone().addScaledVector(edgeVector, 1);
	});

	return newTriangle;
};

const getSpacedDistribution = (tubes: TubePanelPattern[]) => {
	return {
		tubes: tubes.map((tube) => ({
			bands: tube.bands.map((band) => {
				const bandWidth = 0;
				let yOffset = 0;
				return {
					panels: band.panels.map((panel, p) => {
						const xOffset = p % 2 === 0 ? 0 : bandWidth;
						const { a, b, c } = panel.triangle;
						yOffset += 10 + Math.max(Math.abs(a.y), Math.abs(b.y), Math.abs(c.y));
						return { x: xOffset, y: yOffset, angle: 0 };
					})
				};
			})
		}))
	};
};

export const getTransform = (
	distribution: null | ProjectionDistribution,
	address: GlobuleAddress_Facet
): string => {
	const panelDistribution =
		distribution?.tubes[address.tube].bands[address.band].panels[address.facet];
	if (panelDistribution) {
		const { x, y, angle } = panelDistribution;
		return `translate(${x}, ${y}) rotate(${angle})`;
	}
	return '';
};
