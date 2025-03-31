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
	GlobuleConfig,
	ShapeConfig,
	SilhouetteConfig,
	SpineCurveConfig,
	StrutConfig,
	TabStyle,
	SuperGlobuleConfig,
	SubGlobuleConfig,
	GlobulePatternConfig,
	RecombinatoryRecurrence
} from '$lib/types';
import { rad } from './util';
import { GENERAL_CONFIG, generateTempId, GLOBULE_CONFIG, SUPER_GLOBULE_CONFIG } from './id-handler';
import { degToRad } from './patterns/utils';
import { defaultProjectionConfig } from './projection-geometry/configs';

const defaultSilhouetteConfig = (): SilhouetteConfig => ({
	type: 'SilhouetteConfig',
	curves: [
		{
			type: 'BezierConfig',
			points: [
				{ type: 'PointConfig2', x: 50, y: -50 },
				{ type: 'PointConfig2', x: 150, y: -50 },
				{ type: 'PointConfig2', x: 150, y: -50 },
				{ type: 'PointConfig2', x: 150, y: 0 }
			]
		}
	]
});

const defaultSilhouetteConfigV2: SilhouetteConfig = {
	type: 'SilhouetteConfig',
	curves: [
		{
			type: 'BezierConfig',
			points: [
				{ type: 'PointConfig2', x: 50, y: -20 },
				{ type: 'PointConfig2', x: 150, y: -20 },
				{ type: 'PointConfig2', x: 150, y: 50 },
				{ type: 'PointConfig2', x: 50, y: 50 }
			]
		}
	]
};

const defaultDepthCurveConfig = (): DepthCurveConfig => ({
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
});

const defaultSpineCurveConfig = (): SpineCurveConfig => ({
	type: 'SpineCurveConfig',
	id: generateTempId('cfg'),
	angle: 0,
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
});

export const generateDefaultAsymmetricShapeConfig = (
	sampleMethod: CurveSampleMethod
): ShapeConfig => {
	return {
		type: 'ShapeConfig',
		symmetry: 'asymmetric',
		symmetryNumber: 1,
		sampleMethod,
		curves: [
			{
				type: 'BezierConfig',
				points: [
					{ type: 'PointConfig2', x: 100, y: 100 },
					{ type: 'PointConfig2', x: 100, y: 50 },
					{ type: 'PointConfig2', x: 100, y: -50 },
					{ type: 'PointConfig2', x: 100, y: -100 }
				]
			},
			{
				type: 'BezierConfig',
				points: [
					{ type: 'PointConfig2', x: 100, y: -100 },
					{ type: 'PointConfig2', x: 50, y: -100 },
					{ type: 'PointConfig2', x: -50, y: -100 },
					{ type: 'PointConfig2', x: -100, y: -100 }
				]
			},
			{
				type: 'BezierConfig',
				points: [
					{ type: 'PointConfig2', x: -100, y: -100 },
					{ type: 'PointConfig2', x: -100, y: -50 },
					{ type: 'PointConfig2', x: -100, y: 50 },
					{ type: 'PointConfig2', x: -100, y: 100 }
				]
			},
			{
				type: 'BezierConfig',
				points: [
					{ type: 'PointConfig2', x: -100, y: 100 },
					{ type: 'PointConfig2', x: -50, y: 100 },
					{ type: 'PointConfig2', x: 50, y: 100 },
					{ type: 'PointConfig2', x: 100, y: 100 }
				]
			}
		]
	};
};

export const generateDefaultRadialShapeConfig = (
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

const defaultLevelConfig = (): LevelConfig => ({
	type: 'LevelConfig',
	// id: generateTempId(GENERAL_CONFIG),
	silhouetteSampleMethod: { method: 'preserveAspectRatio', divisions: 10 },
	levelPrototypeSampleMethod: 'curve',
	levelCount: 30,
	levelOffsets: [
		{
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
	]
});

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

const defaultBandConfig = (): BandConfig => ({
	type: 'BandConfig',
	bandStyle: 'helical-right',
	offsetBy: 0,
	tabStyle: initTabStyle('trapezoid')
});

const defaultStrutConfig = (): StrutConfig => ({
	type: 'StrutConfig',
	tiling: 'helical-right',
	orientation: 'inside',
	radiate: 'hybrid',
	width: 5
});

const defaultRenderConfig = (): RenderConfig => ({
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
});

export const tiledPatternConfigs: { [key: string]: TiledPatternConfig } = {
	'tiledHexPattern-1': {
		type: 'tiledHexPattern-1',
		tiling: 'quadrilateral',
		config: {
			rowCount: 1,
			columnCount: 1,
			dynamicStroke: 'quadWidth',
			dynamicStrokeEasing: 'linear',
			dynamicStrokeMin: 1,
			dynamicStrokeMax: 3,
			endsMatched: false,
			endsTrimmed: true,
			endLooped: 0
		}
	},
	'tiledGridPattern-0': {
		type: 'tiledGridPattern-0',
		tiling: 'quadrilateral',
		config: {
			rowCount: 1,
			columnCount: 1,
			dynamicStroke: 'quadWidth',
			dynamicStrokeEasing: 'linear',
			dynamicStrokeMin: 1,
			dynamicStrokeMax: 3,
			endsMatched: false,
			endsTrimmed: true,
			endLooped: 0,
			variant: 'rect'
		}
	},
	tiledShieldTesselationPattern: {
		type: 'tiledShieldTesselationPattern',
		tiling: 'quadrilateral',
		config: {
			rowCount: 1,
			columnCount: 1,
			dynamicStroke: 'quadWidth',
			dynamicStrokeEasing: 'linear',
			dynamicStrokeMin: 1,
			dynamicStrokeMax: 1,
			endsMatched: false,
			endsTrimmed: true,
			endLooped: 0,
			variant: 'rect',
			aspectRatio: 4582.575695 / 7937.253933,
			skipEdges: 'not-last'
		}
	},
	'tiledTriStarPattern-1': {
		type: 'tiledTriStarPattern-1',
		tiling: 'quadrilateral',
		config: {
			rowCount: 1,
			columnCount: 1,
			dynamicStroke: 'quadWidth',
			dynamicStrokeEasing: 'linear',
			dynamicStrokeMin: 1,
			dynamicStrokeMax: 3,
			endsMatched: false,
			endsTrimmed: false,
			endLooped: 0
		}
	},
	'tiledBoxPattern-0': {
		type: 'tiledBoxPattern-0',
		tiling: 'quadrilateral',
		config: {
			rowCount: 1,
			columnCount: 1,
			dynamicStroke: 'quadWidth',
			dynamicStrokeEasing: 'linear',
			dynamicStrokeMin: 1,
			dynamicStrokeMax: 3,
			endsMatched: false,
			endsTrimmed: false,
			endLooped: 0
		}
	},
	'tiledBowtiePattern-0': {
		type: 'tiledBowtiePattern-0',
		tiling: 'quadrilateral',
		config: {
			rowCount: 1,
			columnCount: 1,
			dynamicStroke: 'quadWidth',
			dynamicStrokeEasing: 'linear',
			dynamicStrokeMin: 1,
			dynamicStrokeMax: 3,
			endsMatched: false,
			endsTrimmed: false,
			endLooped: 0
		}
	},
	'tiledCarnationPattern-0': {
		type: 'tiledCarnationPattern-0',
		tiling: 'quadrilateral',
		config: {
			rowCount: 1,
			columnCount: 1,
			dynamicStroke: 'quadWidth',
			dynamicStrokeEasing: 'linear',
			dynamicStrokeMin: 1,
			dynamicStrokeMax: 3,
			endsMatched: false,
			endsTrimmed: false,
			endLooped: 0
		}
	},
	'tiledCarnationPattern-1': {
		type: 'tiledCarnationPattern-1',
		tiling: 'quadrilateral',
		config: {
			rowCount: 1,
			columnCount: 1,
			dynamicStroke: 'quadWidth',
			dynamicStrokeEasing: 'linear',
			dynamicStrokeMin: 1,
			dynamicStrokeMax: 3,
			endsMatched: false,
			endsTrimmed: false,
			endLooped: 0
		}
	},
	'bandedBranchedPattern-0': {
		type: 'bandedBranchedPattern-0',
		tiling: 'band',
		config: {
			dynamicStroke: 'quadWidth',
			dynamicStrokeEasing: 'linear',
			dynamicStrokeMin: 1,
			dynamicStrokeMax: 5,
			endsMatched: false,
			endsTrimmed: false,
			endLooped: 0
		}
	}
};

const defaultTiledPatternConfig = (): TiledPatternConfig => ({
	...tiledPatternConfigs['tiledBoxPattern-0'],
	labels: {
		scale: 0.1,
		angle: 0
	}
});
const defaultCutoutConfig = (): CutoutConfig[] => [
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

export const defaultPatternConfig = (): PatternConfig => ({
	showPattern: { band: 'patterned', strut: 'none', level: 'none' },
	cutouts: defaultCutoutConfig()[1],
	axis: 'z',
	pixelScale: { value: 1, unit: 'mm' },
	page: { height: 300, width: 300, unit: 'mm' },
	origin: { type: 'PointConfig2', x: 0, y: 0 },
	direction: { type: 'PointConfig2', x: 0, y: 1 },
	offset: { type: 'PointConfig2', x: 0, y: 0 },
	showTabs: true
});

export const defaultPatternViewConfig = (): PatternViewConfig => ({
	showQuads: false,
	width: 800,
	height: 600,
	zoom: -1,
	centerOffset: {
		x: 0,
		y: 0
	},
	showLabels: false
});

export const getLevels = (sampleMethod: CurveSampleMethod, curveCount: number) => {
	if (sampleMethod.method === 'divideCurve') {
		return sampleMethod.divisions * curveCount + 1;
	}
	return sampleMethod.divisions + 1;
};

export const generateDefaultGlobuleConfig = (): GlobuleConfig => {
	const config: GlobuleConfig = {
		type: 'GlobuleConfig',
		id: generateTempId(GLOBULE_CONFIG),
		name: 'New Globule',
		shapeConfig: generateDefaultAsymmetricShapeConfig({ method: 'divideCurve', divisions: 1 }),
		levelConfig: defaultLevelConfig(),
		silhouetteConfig: defaultSilhouetteConfig(),
		depthCurveConfig: defaultDepthCurveConfig(),
		spineCurveConfigs: [defaultSpineCurveConfig()],
		bandConfig: defaultBandConfig(),
		strutConfig: defaultStrutConfig(),
		renderConfig: defaultRenderConfig()
	};
	config.levelConfig.levelCount = getLevels(
		config.levelConfig.silhouetteSampleMethod,
		config.silhouetteConfig.curves.length
	);
	return config;
};

const defaultSubGlobuleConfig = (cfg?: Partial<SubGlobuleConfig>): SubGlobuleConfig => {
	const subglob: SubGlobuleConfig = {
		type: 'SubGlobuleConfig',
		id: generateTempId('sub'),
		name: 'Default Sub Globule',
		transforms: [],
		globuleConfig: generateDefaultGlobuleConfig()
	};
	return { ...subglob, ...cfg };
};

export const generateSubGlobuleConfigWrapper = (globule: GlobuleConfig) => {
	return defaultSubGlobuleConfig({
		globuleConfig: globule
	});
};

export const generateSuperGlobuleConfigWrapper = (globule: GlobuleConfig) => {
	const superGlobuleConfig: SuperGlobuleConfig = {
		type: 'SuperGlobuleConfig',
		id: generateTempId(SUPER_GLOBULE_CONFIG),
		name: 'Default Super Globule',
		subGlobuleConfigs: [generateSubGlobuleConfigWrapper(globule)],
		projectionConfigs: []
	};
	console.debug('generatedDefaultSuperGlobuleConfigWrapper', { superGlobuleConfig });
	return superGlobuleConfig;
};

export const generateDefaultSuperGlobuleConfig = (): SuperGlobuleConfig => {
	const base = defaultSubGlobuleConfig();
	const defaultRecurrence: RecombinatoryRecurrence[] = [
		{ multiplier: 0, ghost: false, recombines: undefined },
		{ multiplier: 1, ghost: false, recombines: undefined }
	];

	const superGlobuleConfig: SuperGlobuleConfig = {
		type: 'SuperGlobuleConfig',
		id: generateTempId(SUPER_GLOBULE_CONFIG),
		name: 'Default Super Globule',
		subGlobuleConfigs: [
			base,
			defaultSubGlobuleConfig({
				globuleConfig: base.globuleConfig,
				transforms: [
					{
						recurs: [{ multiplier: 1 }],
						rotate: {
							axis: { x: 0, y: 0, z: 1 },
							anchor: { x: 0, y: 0, z: 0 },
							angle: degToRad(60)
						}
					},
					{
						recurs: [{ multiplier: 1 }],
						translate: { x: 0, y: -150, z: 0 }
					},
					{
						recurs: [{ multiplier: 1 }],
						rotate: {
							axis: { x: 1, y: 0, z: 0 },
							anchor: { x: 0, y: 75, z: 0 },
							angle: degToRad(-109.5)
						}
					},
					{
						recurs: defaultRecurrence,
						rotate: {
							axis: { x: 0, y: 0, z: 1 },
							anchor: { x: 0, y: 0, z: 0 },
							angle: degToRad(120)
						}
					}
				]
			})
		],
		projectionConfigs: [defaultProjectionConfig]
	};
	console.debug('generatedDefaultSuperGlobuleConfig', { superGlobuleConfig });
	return superGlobuleConfig;
};

export const generateDefaultGlobulePatternConfig = (): GlobulePatternConfig => {
	const globulePatternConfig: GlobulePatternConfig = {
		type: 'GlobulePatternConfig',
		id: generateTempId('cfg'),
		name: 'Default Globule Pattern Config',
		cutoutConfig: defaultCutoutConfig()[1],
		patternConfig: defaultPatternConfig(),
		patternViewConfig: defaultPatternViewConfig(),
		tiledPatternConfig: defaultTiledPatternConfig()
	};
	return globulePatternConfig;
};
