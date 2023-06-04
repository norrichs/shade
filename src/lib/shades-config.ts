import type { CutoutConfig, PatternConfig, PatternViewConfig } from './cut-pattern';
import { AUTO_PERSIST_KEY } from './persistable';
import type {
	BandConfig,
	CurveSampleMethod,
	DepthCurveConfig,
	LevelConfig,
	ShapeConfig,
	RenderConfig,
	ShadesConfig,
	StrutConfig,
	TabStyle,
	ZCurveConfig
} from './generate-shape';
import { rad } from './util';

const defaultZCurveConfig: ZCurveConfig = {
	type: 'ZCurveConfig',
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
	depthCurveBaseline: 10,
	curves: [
		{
			type: 'BezierConfig',
			points: [
				{ type: 'PointConfig2', x: 10, y: -100 },
				{ type: 'PointConfig2', x: 10, y: -75 },
				{ type: 'PointConfig2', x: 10, y: 75 },
				{ type: 'PointConfig2', x: 10, y: 100 }
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
	zCurveSampleMethod: { method: 'divideCurvePath', divisions: 10 },
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
  console.debug("initTabStyle", style)
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
	tabStyle: initTabStyle('multi-facet-full')
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
		bandCount: undefined,
		facetStart: 0,
		facetCount: undefined,
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
	showPattern: { band: 'outlined', strut: 'none', level: 'none' },
	cutouts: defaultCutoutConfig[1],
	axis: 'z',
	origin: { type: 'PointConfig2', x: 0, y: 0 },
	direction: { type: 'PointConfig2', x: 0, y: 1 },
	offset: { type: 'PointConfig2', x: 0, y: 0 },
	showTabs: true
};

export const defaultPatternViewConfig: PatternViewConfig = {
	width: 400,
	height: 400,
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
		shapeConfig: generateDefaultShapeConfig(6, { method: 'divideCurvePath', divisions: 5 }),
		levelConfig: {
			...defaultLevelConfig,
			levels: getLevels(defaultLevelConfig.zCurveSampleMethod, defaultZCurveConfig.curves.length)
		},
		zCurveConfig: defaultZCurveConfig,
		depthCurveConfig: defaultDepthCurveConfig,
		bandConfig: defaultBandConfig,
		strutConfig: defaultStrutConfig,
		renderConfig: defaultRenderConfig,
		cutoutConfig: defaultCutoutConfig[1],
		patternConfig: defaultPatternConfig,
		patternViewConfig: defaultPatternViewConfig
	};
	return config;
};
