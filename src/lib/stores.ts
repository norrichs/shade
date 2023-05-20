import { writable } from 'svelte/store';
import { setLocal, getLocal, getPersistedConfig, AUTO_PERSIST_KEY } from './storage';
import type {
	TabStyle,
	StrutConfig,
	LevelSetConfig,
	ZCurveConfig,
	DepthCurveConfig,
	RenderConfig,
	BandSetConfig,
	RadialShapeConfig,
	RotatedShapeGeometryConfig
} from './rotated-shape';
import type { PatternConfig, PatternViewConfig } from './cut-pattern';
import { Vector3 } from 'three';
import { rad } from './util';

const persistable = <T>(defaultInit: T, name: keyof RotatedShapeGeometryConfig) => {
	const init = getPersistedConfig(name) || defaultInit

	const { subscribe, set, update } = writable<T>(init)

	return {
		subscribe,
		update: function (value: T) {
			update(value => value);
			const persistObj = getLocal(AUTO_PERSIST_KEY)
			persistObj[name] = value;
			setLocal(AUTO_PERSIST_KEY, persistObj)
		},
		set: (value: T) => {
			const persistObj = getLocal(AUTO_PERSIST_KEY) || {}
			persistObj[name] = value;
			setLocal(AUTO_PERSIST_KEY, persistObj)
			set(value);
		},
		reset: () => {
			console.debug("setting default")
			set(defaultInit)
		}
	}
}

export const resetStore = () => {
	levelConfig.reset();
}




export const spreadConfigToStores = (config: RotatedShapeGeometryConfig) => {
	if (config.levelConfig) {
		levelConfig.set(config.levelConfig)
	}
	if (config.bandConfig) {
		bandConfig.set(config.bandConfig)
	}
	if (config.depthCurveConfig) {
		depthCurveConfig.set(config.depthCurveConfig)
	}
	if (config.shapeConfig) {
		radialShapeConfig.set(config.shapeConfig)
	}
	if (config.strutConfig) {
		strutConfig.set(config.strutConfig)
	}
	if (config.zCurveConfig) {
		curveConfig.set(config.zCurveConfig)
	}
}



const defaultZCurveConfig: ZCurveConfig = {
	type: 'ZCurveConfig',
	curves: [
		{
			type: 'BezierConfig',
			points: [
				{ type: 'PointConfig', x: 50, y: -20 },
				{ type: 'PointConfig', x: 150, y: -20 },
				{ type: 'PointConfig', x: 150, y: 50 },
				{ type: 'PointConfig', x: 150, y: 100 }
			]
		},
		// {
		// 	type: 'BezierConfig',
		// 	points: [
		// 		{ type: 'PointConfig', x: 150, y: 100 },
		// 		{ type: 'PointConfig', x: 100, y: 60 },
		// 		{ type: 'PointConfig', x: 100, y: 90 },
		// 		{ type: 'PointConfig', x: 20, y: 100 }
		// 	]
		// }
	]
};
export const curveConfig = persistable<ZCurveConfig>(defaultZCurveConfig, "zCurveConfig");
export const blankCurveConfig = writable<ZCurveConfig>({ type: 'ZCurveConfig', curves: [] });

const defaultDepthCurveConfig: DepthCurveConfig = {
	type: 'DepthCurveConfig',
	depthCurveBaseline: 10,
	curves: [
		{
			type: 'BezierConfig',
			points: [
				{ type: 'PointConfig', x: 10, y: -100 },
				{ type: 'PointConfig', x: 10, y: -75 },
				{ type: 'PointConfig', x: 10, y: 75 },
				{ type: 'PointConfig', x: 10, y: 100 }
			]
		}
	]
};
export const depthCurveConfig = persistable<DepthCurveConfig>(defaultDepthCurveConfig, "depthCurveConfig");

const symmetryNumber = 6;
const a0 = (Math.PI * 2) / symmetryNumber;
const radius = 100;
const defaultRadialShapeConfig: RadialShapeConfig = {
	type: 'RadialShapeConfig',
	symmetry: 'radial',
	symmetryNumber: symmetryNumber,
	divisions: 5,
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

export const radialShapeConfig = persistable<RadialShapeConfig>(defaultRadialShapeConfig, "shapeConfig");

const defaultLevelSetConfig: LevelSetConfig = {
	zCurveSampleMethod: 'arcLength',
	levelPrototypeSampleMethod: { byDivisions: 'whole', dividePer: 'curve' },
	levels: 30,
	levelOffset: {
		x: 0,
		y: 0,
		z: 0,
		rotX: rad(0),
		rotY: rad(0),
		rotZ: rad(0),
		scaleX: 1,
		scaleY: 1,
		depth: 1,
	}
};
export const levelConfig = persistable<LevelSetConfig>(defaultLevelSetConfig, "levelSetConfig");

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

const defaultBandConfig: BandSetConfig = {
	bandStyle: 'helical-right',
	offsetBy: 0,
	tabStyle: initTabStyle('multi-facet-full')
};

export const bandConfig = persistable<BandSetConfig>(defaultBandConfig, "bandConfig");

const defaultStrutConfig: StrutConfig = {
	tiling: 'helical-right',
	orientation: 'inside',
	radiate: 'hybrid',
	width: 5
};

export const strutConfig = persistable<StrutConfig>(defaultStrutConfig, "strutConfig");

const defaultRenderConfig: RenderConfig = {
	ranges: {
		rangeStyle: 'slice',
		bandStart: 0,
		bandCount: undefined,
		facetStart: 0,
		facetCount: undefined,
		levelStart: 0,
		levelCount: 1,
		strutStart: 0,
		strutCount: undefined
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

export const renderConfig = persistable<RenderConfig>(defaultRenderConfig, "renderConfig");

const defaultPatternConfig: PatternConfig = {
	showPattern: {band: "none", strut: "faceted", level: "none"},
	axis: 'z',
	origin: new Vector3(0, 0, 0),
	direction: new Vector3(0, 1, 0),
	offset: new Vector3(0, 0, 0),
	showTabs: true,
};
export const patternConfig = writable<PatternConfig>(defaultPatternConfig);

const defaultPatternViewConfig: PatternViewConfig = {
	width: 400,
	height: 400,
	zoom: 0.2,
	centerOffset: {
		x: 0,
		y: 0
	}
};



export const patternViewConfig = writable<PatternViewConfig>(defaultPatternViewConfig);
