import type { BezierConfig, CurveSampleMethod } from '#lib/types.js';
import type { CrossSectionConfig, EdgeCurveConfig } from './types';

const secondEdgeCurve: BezierConfig[] = [
	{
		type: 'BezierConfig',
		points: [
			{ type: 'PointConfig2', x: 0.5, y: 0 },
			{ type: 'PointConfig2', x: 0.2, y: 0.5 },
			{ type: 'PointConfig2', x: 0.2, y: 0.5 },
			{ type: 'PointConfig2', x: 0.5, y: 1 }
		]
	}
];

export const defaultCrossSection: CrossSectionConfig = {
	curves: [
		{
			type: 'BezierConfig',
			points: [
				{ type: 'PointConfig2', x: 0, y: 0 },
				{ type: 'PointConfig2', x: 0.5, y: 0 },
				{ type: 'PointConfig2', x: 0.5, y: 1 },
				{ type: 'PointConfig2', x: 0, y: 1 }
			]
		}
	],
	center: { x: 0, y: 0.5 },
	sampleMethod: { method: 'divideCurvePath', divisions: 3 }, //{ method: 'manualDivisions', divisions: 5, divisionsArray: [0.15, 0.3, 0.45, 0.65] },
	scaling: { width: 'curve', height: 250 },
	shouldSkewCurve: false
};

const defaultEdgeSampleMethod: CurveSampleMethod = { method: 'divideCurvePath', divisions: 4 };
export const defaultEdgeCurveConfig: EdgeCurveConfig = {
	curves: secondEdgeCurve,
	sampleMethod: defaultEdgeSampleMethod
};

export const secondEdgeCurveConfig: EdgeCurveConfig = {
	curves: secondEdgeCurve,
	sampleMethod: defaultEdgeSampleMethod //{ method: 'manualDivisions', divisions: 5, divisionsArray: [0.25, 0.5, 0.75, 0.9] }
};

export const defaultEdgeConfig = {
	vertex0: undefined,
	widthCurve: 0,
	crossSectionCurve: 0,
	isDirectionMatched: true
};
