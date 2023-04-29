import { writable } from 'svelte/store';
import type {
	TabStyle,
	StrutConfig,
	LevelSetConfig,
	ZCurveConfig,
	RenderConfig,
	BandSetConfig,
	RadialShapeConfig
} from './rotated-shape';
import type { PatternConfig } from './cut-pattern';
import { Vector3 } from 'three';
import { rad } from './util';

const defaultZCurveConfig: ZCurveConfig = {
	type: 'ZCurveConfig',
	curves: [
		{
			type: 'BezierConfig',
			points: [
				{ type: 'PointConfig', x: 100, y: -20 },
				{ type: 'PointConfig', x: 150, y: -10 },
				{ type: 'PointConfig', x: 150, y: 40 },
				{ type: 'PointConfig', x: 100, y: 50 }
			]
		},
		// {
		// 	type: 'BezierConfig',
		// 	points: [
		// 		{ type: 'PointConfig', x: 100, y: 50 },
		// 		{ type: 'PointConfig', x: 100, y: 60 },
		// 		{ type: 'PointConfig', x: 100, y: 90 },
		// 		{ type: 'PointConfig', x: 0, y: 100 }
		// 	]
		// }
	]
};
export const curveConfig = writable<ZCurveConfig>(defaultZCurveConfig);
export const blankCurveConfig = writable<ZCurveConfig>({ type: 'ZCurveConfig', curves: [] });

const symmetryNumber = 5;
const a0 = (Math.PI * 2) / symmetryNumber;
const radius = 100;
const defaultRadialShapeConfig: RadialShapeConfig = {
	type: 'RadialShapeConfig',
	symmetry: 'radial',
	symmetryNumber: symmetryNumber,
	divisions: 20,
	curves: [
		{
			type: 'BezierConfig',
			points: [
				{ type: 'PointConfig', x: 0, y: radius },
				{
					type: 'PointConfig',
					x: -Math.sin(a0 / 6) * radius * 1.5,
					y: Math.cos(a0 / 6) * radius * 1.5
				},
				{
					type: 'PointConfig',
					x: -Math.sin((a0 * 5) / 6) * radius * 1.5,
					y: Math.cos((a0 * 5) / 6) * radius * 1.5
				},
				{ type: 'PointConfig', x: -Math.sin(a0) * radius, y: Math.cos(a0) * radius }
			]
		}
	]
};

export const radialShapeConfig = writable<RadialShapeConfig>(defaultRadialShapeConfig);

const defaultLevelSetConfig: LevelSetConfig = {
	zCurveSampleMethod: 'arcLength',
	levelPrototypeSampleMethod: { byDivisions: 'whole', dividePer: 'shape' },
	levels: 10,
	levelOffset: {
		x: 0,
		y: 0,
		z: 0,
		rotX: rad(0),
		rotY: rad(0),
		rotZ: rad(0),
		scaleX: 1,
		scaleY: 1
	}
};
export const levelConfig = writable<LevelSetConfig>(defaultLevelSetConfig);

export const initTabStyle = (style: TabStyle['style']): TabStyle => {
	const defaultTabStyles: { [key: string]: TabStyle } = {
		full: { style: 'full', direction: 'lesser' },
		trapezoid: { style: 'trapezoid', direction: 'both', width: { style: 'fixed', value: 5 } },
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
	console.debug('initializing tab style', defaultTabStyles[style]);
	return defaultTabStyles[style];
};

const defaultBandConfig: BandSetConfig = {
	bandStyle: 'helical-right',
	offsetBy: 0,
	tabStyle: initTabStyle('multi-facet-full')
};

export const bandConfig = writable<BandSetConfig>(defaultBandConfig);

const defaultStrutConfig: StrutConfig = {
	tiling: 'helical-right',
	orientation: 'inside',
	radiate: 'orthogonal',
	width: 5
};

export const strutConfig = writable<StrutConfig>(defaultStrutConfig);

const defaultRenderConfig: RenderConfig = {
	ranges: {
		rangeStyle: 'slice',
		bandStart: 0,
		bandCount: 1,
		facetStart: 0,
		facetCount: undefined,
		levelStart: 0,
		levelCount: 1,
		strutStart: 0,
		strutCount: 11
	},
	show: {
		tabs: false,
		levels: false,
		bands: true,
		edges: true,
		patterns: true,
		struts: true
	}
};

export const renderConfig = writable<RenderConfig>(defaultRenderConfig);

const defaultPatternConfig: PatternConfig = {
	showTabs: true,
	projectionType: 'outlined',
	axis: 'z',
	origin: new Vector3(0, 0, 0),
	direction: new Vector3(0, 1, 0),
	offset: new Vector3(0, 0, 0)
};
export const patternConfig = writable<PatternConfig>(defaultPatternConfig);

const defaultPatternViewConfig = {
	width: 400,
	height: 400,
	zoom: 0.4,
	centerOffset: {
		x: 0,
		y: 0
	}
};

export type PatternViewConfig = {
	width: number;
	height: number;
	zoom: number;
	centerOffset: {
		x: number;
		y: number;
	};
};

export const patternViewConfig = writable<PatternViewConfig>(defaultPatternViewConfig);
