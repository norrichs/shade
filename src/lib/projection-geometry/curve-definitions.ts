import type { BezierConfig, CurveSampleMethod } from "$lib/types";
import type { CrossSectionConfig, EdgeCurveConfig } from "./types";

export const asymmetricEdgeCurve: BezierConfig[] = [
	{
		type: 'BezierConfig',
		points: [
			{ type: 'PointConfig2', x: 0.1, y: 0 },
			{ type: 'PointConfig2', x: 0.1, y: 0 },
			{ type: 'PointConfig2', x: 0.7, y: 1 },
			{ type: 'PointConfig2', x: 0.7, y: 1 }
		]
	}
];

export const secondEdgeCurve: BezierConfig[] = [
	{
		type: 'BezierConfig',
		points: [
			{ type: 'PointConfig2', x: 0.75, y: 0 },
			{ type: 'PointConfig2', x: 0.6, y: 0.4 },
			{ type: 'PointConfig2', x: 0.6, y: 0.6 },
			{ type: 'PointConfig2', x: 0.75, y: 1 }
		]
	}
];

export const defaultEdgeCurve: BezierConfig[] = [
	{
		type: 'BezierConfig',
		points: [
			{ type: 'PointConfig2', x: 0.6, y: 0 },
			{ type: 'PointConfig2', x: 0.5, y: 0.1 },
			{ type: 'PointConfig2', x: 0.5, y: 0.2 },
			{ type: 'PointConfig2', x: 0.3, y: 0.4 }
		]
	},
	{
		type: 'BezierConfig',
		points: [
			{ type: 'PointConfig2', x: 0.3, y: 0.4 },
			{ type: 'PointConfig2', x: 0.2, y: 0.5 },
			{ type: 'PointConfig2', x: 0.2, y: 0.5 },
			{ type: 'PointConfig2', x: 0.3, y: 0.6 }
		]
	},
	{
		type: 'BezierConfig',
		points: [
			{ type: 'PointConfig2', x: 0.3, y: 0.6 },
			{ type: 'PointConfig2', x: 0.5, y: 0.8 },
			{ type: 'PointConfig2', x: 0.5, y: 0.9 },
			{ type: 'PointConfig2', x: 0.6, y: 1 }
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
	scaling: { width: 'curve', height: 880 },
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
