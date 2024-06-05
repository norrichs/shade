import { AUTO_PERSIST_KEY } from './persistable';
import type {
	CutoutConfig,
	PatternConfig,
	PatternViewConfig,
	TiledPatternConfig,
	BandConfig,
	CurveSampleMethod,
	DepthCurveConfig,
	LevelConfig,
	RenderConfig,
	ShadesConfig,
	ShapeConfig,
	SilhouetteConfig,
	SpineCurveConfig,
	StrutConfig,
	TabStyle
} from '$lib/types';
import { rad } from './util';

const defaultSilhouetteConfig: SilhouetteConfig = {
	type: 'SilhouetteConfig',
	curves: [
		{
			type: 'BezierConfig',
			points: [
				{ type: 'PointConfig2', x: 50, y: -20 },
				{ type: 'PointConfig2', x: 150, y: -20 },
				{ type: 'PointConfig2', x: 150, y: 50 },
				{ type: 'PointConfig2', x: 150, y: 100 }
			]
		}
	]
};

const defaultDepthCurveConfig: DepthCurveConfig = {
	type: 'DepthCurveConfig',
	depthCurveBaseline: 100,
	curves: [
		{
			type: 'BezierConfig',
			points: [
				{ type: 'PointConfig2', x: 100, y: -100 },
				{ type: 'PointConfig2', x: 100, y: -75 },
				{ type: 'PointConfig2', x: 100, y: 75 },
				{ type: 'PointConfig2', x: 100, y: 100 }
			]
		}
	]
};

const defaultSpineCurveConfig: SpineCurveConfig = {
	type: 'SpineCurveConfig',
	curves: [
		{
			type: 'BezierConfig',
			points: [
				{ type: 'PointConfig2', x: 0, y: -100 },
				{ type: 'PointConfig2', x: 0, y: -75 },
				{ type: 'PointConfig2', x: 0, y: 75 },
				{ type: 'PointConfig2', x: 0, y: 100 }
			]
		}
	]
};

export const generateDefaultShapeConfig = (
	symmetryNumber: number,
	sampleMethod: CurveSampleMethod
): ShapeConfig => {
	const segmentAngle = (Math.PI * 2) / symmetryNumber;
	return {
		type: 'ShapeConfig',
		symmetry: 'radial',
		symmetryNumber,
		sampleMethod,
		curves: [
			{
				type: 'BezierConfig',
				points: [
					{ type: 'PointConfig2', x: 0, y: 100 },
					{
						type: 'PointConfig2',
						x: -Math.sin(segmentAngle / 6) * 100 * 1.5,
						y: Math.cos(segmentAngle / 6) * 100 * 1.5
					},
					{
						type: 'PointConfig2',
						x: -Math.sin((segmentAngle * 5) / 6) * 100 * 1.5,
						y: Math.cos((segmentAngle * 5) / 6) * 100 * 1.5
					},
					{
						type: 'PointConfig2',
						x: -Math.sin(segmentAngle) * 100,
						y: Math.cos(segmentAngle) * 100
					}
				]
			}
		]
	};
};

const defaultLevelConfig: LevelConfig = {
	type: 'LevelConfig',
	silhouetteSampleMethod: { method: 'preserveAspectRatio', divisions: 10 },
	// move below into shapeConfig
	levelPrototypeSampleMethod: { byDivisions: 'whole', dividePer: 'curve' },
	// levels: 30,
	levelOffset: {
		x: 0,
		y: 0,
		z: 0,
		rotX: rad(0),
		rotY: rad(0),
		rotZ: rad(0),
		scaleX: 1,
		scaleY: 1,
		depth: 1
	}
};

export const initTabStyle = (style: TabStyle['style']): TabStyle => {
	const defaultTabStyles: { [key: string]: TabStyle } = {
		full: { style: 'full', direction: 'lesser' },
		trapezoid: { style: 'trapezoid', direction: 'lesser', width: { style: 'fixed', value: 5 } },
		'multi-facet-full': {
			style: 'multi-facet-full',
			direction: 'both',
			directionMulti: 1,
			footprint: 'strut'
		},
		'multi-facet-trapezoid': {
			style: 'multi-facet-trapezoid',
			direction: 'both',
			directionMulti: 1,
			footprint: 'strut',
			width: { style: 'fixed', value: 5 }
		}
	};
	return defaultTabStyles[style];
};

const defaultBandConfig: BandConfig = {
	type: 'BandConfig',
	bandStyle: 'helical-right',
	offsetBy: 0,
	tabStyle: initTabStyle('trapezoid')
};

const defaultStrutConfig: StrutConfig = {
	type: 'StrutConfig',
	tiling: 'helical-right',
	orientation: 'inside',
	radiate: 'hybrid',
	width: 5
};

const defaultRenderConfig: RenderConfig = {
	type: 'RenderConfig',
	ranges: {
		rangeStyle: 'slice',
		bandStart: 0,
		bandCount: 0,
		facetStart: 0,
		facetCount: 0,
		levelStart: 0,
		levelCount: 1,
		strutStart: 0,
		strutCount: 0
	},
	show: {
		tabs: false,
		levels: false,
		bands: true,
		edges: false,
		patterns: true,
		struts: true
	}
};

export const tiledPatternConfigs: { [key: string]: TiledPatternConfig } = {
	// 'tiledHexPattern-0': {
	// 	type: 'tiledHexPattern-0',
	// 	tiling: 'quadrilateral',
	// 	unitPattern: 'tiledHexPattern-0',
	// 	config: [
	// 		{ type: 'width', valueType: 'number', value: 2, min: 0, max: 10, step: 0.1 },
	// 		{ type: 'insetWidth', valueType: 'number', value: 10, min: 0, max: 50, step: 0.1 },
	// 		{
	// 			type: 'appendTab',
	// 			valueType: 'named',
	// 			value: 'both',
	// 			options: [{ none: false }, 'left', 'right', 'both']
	// 		},
	// 		{
	// 			type: 'tabVariant',
	// 			valueType: 'named',
	// 			value: 'extend',
	// 			options: [{ none: false }, 'extend', 'inset']
	// 		},
	// 		{ type: 'adjustBandBoundary', valueType: 'boolean', value: true },
	// 		{ type: 'filledEndSize', valueType: 'number', value: 0, min: 0, max: 5, step: 1 }
	// 	]
	// },
	'tiledHexPattern-1': {
		type: 'tiledHexPattern-1',
		tiling: 'quadrilateral',
		unitPattern: 'tiledHexPattern-1',
		config: {
			adjustBandBoundary: { type: 'adjustBandBoundary', valueType: 'boolean', value: true },
			filledEndSize: {
				type: 'filledEndSize',
				valueType: 'number',
				value: 0,
				min: 0,
				max: 5,
				step: 1
			},
			dynamicStroke: {
				type: 'dynamicStroke',
				valueType: 'named',
				value: 'quadWidth',
				options: ['quadWidth', 'quadHeight']
			},
			dynamicStrokeEasing: {
				type: 'dynamicStrokeEasing',
				valueType: 'named',
				value: 'linear',
				options: ['linear', 'bezier']
			},
			dynamicStrokeMin: {
				type: 'dynamicStrokeMin',
				valueType: 'number',
				value: 1,
				min: 0,
				max: 20,
				step: 0.1
			},
			dynamicStrokeMax: {
				type: 'dynamicStrokeMax',
				valueType: 'number',
				value: 3,
				min: 0,
				max: 20,
				step: 0.1
			}
		}
	},
	'tiledBoxPattern-0': {
		type: 'tiledBoxPattern-0',
		tiling: 'quadrilateral',
		unitPattern: 'tiledBoxPattern-0',
		config: {
			rowCount: { type: 'rowCount', valueType: 'number', value: 1, min: 1, max: 5, step: 1 },
			columnCount: { type: 'columnCount', valueType: 'number', value: 3, min: 1, max: 6, step: 1 }
		}
	},
	'tiledBowtiePattern-0': {
		type: 'tiledBowtiePattern-0',
		tiling: 'quadrilateral',
		unitPattern: 'tiledBowtiePattern-0',
		config: {
			rowCount: { type: 'rowCount', valueType: 'number', value: 3, min: 1, max: 5, step: 1 },
			columnCount: { type: 'columnCount', valueType: 'number', value: 3, min: 1, max: 6, step: 1 },
			dynamicStroke: {
				type: 'dynamicStroke',
				valueType: 'named',
				value: 'quadWidth',
				options: ['quadWidth', 'quadHeight']
			},
			dynamicStrokeEasing: {
				type: 'dynamicStrokeEasing',
				valueType: 'named',
				value: 'linear',
				options: ['linear', 'bezier']
			},
			dynamicStrokeMin: {
				type: 'dynamicStrokeMin',
				valueType: 'number',
				value: 1,
				min: 0,
				max: 20,
				step: 0.1
			},
			dynamicStrokeMax: {
				type: 'dynamicStrokeMax',
				valueType: 'number',
				value: 3,
				min: 0,
				max: 20,
				step: 0.1
			}
		}
	}
};

const defaultTiledPatternConfig: TiledPatternConfig = tiledPatternConfigs['tiledBowtiePattern-0'];

const defaultCutoutConfig: CutoutConfig[] = [
	{
		tilePattern: { type: 'each-facet' },
		holeConfigs: [
			[
				{
					type: 'HoleConfigTriangle',
					corners: [
						{ type: 'PointConfig2', x: 0, y: 0 },
						{ type: 'PointConfig2', x: 10, y: 0 },
						{ type: 'PointConfig2', x: 5, y: 8.66 }
					],
					geometry: [
						{ type: 'CircleConfig', center: { type: 'PointConfig2', x: 5, y: 2.89 }, radius: 2 }
					]
				}
			]
		]
	},
	{
		tilePattern: { type: 'alternating-band', nthBand: 1 },
		holeConfigs: [
			[
				{
					type: 'HoleConfigBand',
					locate: {
						skipEnds: 3,
						everyNth: 1,
						centered: 0,
						scale: 'absolute'
					},
					geometry: [
						{ type: 'CircleConfig', center: { type: 'PointConfig2', x: 0, y: 0 }, radius: 6 }
					]
				}
			]
		]
	}
];

export const defaultPatternConfig: PatternConfig = {
	showPattern: { band: 'patterned', strut: 'none', level: 'none' },
	cutouts: defaultCutoutConfig[1],
	axis: 'z',
	pixelScale: { value: 1, unit: 'cm' },
	origin: { type: 'PointConfig2', x: 0, y: 0 },
	direction: { type: 'PointConfig2', x: 0, y: 1 },
	offset: { type: 'PointConfig2', x: 0, y: 0 },
	showTabs: true
};

export const defaultPatternViewConfig: PatternViewConfig = {
	width: 800,
	height: 600,
	zoom: 0.2,
	centerOffset: {
		x: 0,
		y: 0
	}
};

export const getLevels = (sampleMethod: CurveSampleMethod, curveCount: number) => {
	if (sampleMethod.method === 'divideCurve') {
		return sampleMethod.divisions * curveCount + 1;
	}
	return sampleMethod.divisions + 1;
};

export const generateDefaultConfig = (): ShadesConfig => {
	const config: ShadesConfig = {
		id: AUTO_PERSIST_KEY,
		name: '',
		shapeConfig: generateDefaultShapeConfig(4, { method: 'divideCurve', divisions: 2 }),
		levelConfig: {
			...defaultLevelConfig,
			levels: getLevels(
				defaultLevelConfig.silhouetteSampleMethod,
				defaultSilhouetteConfig.curves.length
			)
		},
		silhouetteConfig: defaultSilhouetteConfig,
		depthCurveConfig: defaultDepthCurveConfig,
		spineCurveConfig: defaultSpineCurveConfig,
		bandConfig: defaultBandConfig,
		strutConfig: defaultStrutConfig,
		renderConfig: defaultRenderConfig,
		cutoutConfig: defaultCutoutConfig[1],
		patternConfig: defaultPatternConfig,
		patternViewConfig: defaultPatternViewConfig,
		tiledPatternConfig: defaultTiledPatternConfig
	};
	return config;
};
