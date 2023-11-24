import type { BandStyle, BezierConfig, PointConfig2, TabStyle } from '$lib/generate-shape';
import type { Triangle } from 'three';
import type { Vector2, Vector3 } from 'three';

export type PatternViewConfig = {
	width: number;
	height: number;
	zoom: number;
	centerOffset: {
		x: number;
		y: number;
	};
};
type PatternStyle = 'faceted' | 'outlined' | 'patterned' | 'none';

type PatternShowConfig = {
	[key: string]: PatternStyle;
	band: PatternStyle;
	strut: PatternStyle;
	level: PatternStyle;
};

type TilePattern =
	| { type: 'each-facet' }
	| { type: 'each-rectangle' }
	| {
			type: 'alternating-facet';
			nthBand: number;
			startBand: number;
			nthFacet: number;
			startFacet: number;
	  }
	| { type: 'mapped' }
	| {
			type: 'alternating-band';
			nthBand: number;
	  };

type CircleConfig = {
	[key: string]: 'CircleConfig' | PointConfig2 | number;
	type: 'CircleConfig';
	center: PointConfig2;
	radius: number;
};

type PathConfig = {
	[key: string]: 'PathConfig' | BezierConfig[];
	type: 'PathConfig';
	curves: BezierConfig[];
};

type HoleGeometryConfig = CircleConfig | PathConfig;

type HoleConfigTriangle = {
	type: 'HoleConfigTriangle';
	corners: [PointConfig2, PointConfig2, PointConfig2];
	geometry: HoleGeometryConfig[];
};

type HoleConfigSquare = {
	type: 'HoleConfigSquare';
	corners: [PointConfig2, PointConfig2, PointConfig2, PointConfig2];
	geometry: HoleGeometryConfig[];
};

type HoleConfigBand = {
	type: 'HoleConfigBand';
	locate: {
		[key: string]:
			| 0
			| 1
			| 2
			| 3
			| 4
			| 5
			| 6
			| 7
			| 8
			| 9
			| number
			| 'relative-width'
			| 'absolute'
			| 'relative-length';
		skipEnds: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
		everyNth: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
		centered: number;
		scale: 'relative-width' | 'absolute' | 'relative-length';
	};
	geometry: HoleGeometryConfig[];
};

export type CutoutConfig = {
	tilePattern: TilePattern;
	holeConfigs: HoleConfigTriangle[][] | HoleConfigSquare[][] | HoleConfigBand[][];
};

export type EdgeConfig = { lead: TrianglePoint; follow: TrianglePoint };

export type PatternConfig = {
	[key: string]: PatternShowConfig | CutoutConfig | Axis | PointConfig2 | boolean | undefined;
	showPattern: PatternShowConfig;
	axis: Axis;
	origin: PointConfig2;
	direction: PointConfig2;
	offset: PointConfig2;
	showTabs: boolean;
	// patternedConfig: PatternedPatternConfig;
};

export type TabPattern =
	| FullTabPattern
	| TrapTabPattern
	| MultiFacetFullTabPattern
	| MultiFacetTrapTabPattern;

export type FacetPattern = {
	svgPath: string;
	triangle: Triangle;
	tab?: TabPattern;
};

export type PatternedPattern = {
	svgPath: string;
	svgTransform?: string;
	triangle: Triangle;
	tab?: TabPattern;
};

export type FullTabPattern = {
	style: 'full';
	svgPath: string;
	triangle: Triangle;
};

export type TrapTabPattern = {
	style: 'trapezoid';
	svgPath: string;
	triangle: Triangle;
};

export type MultiFacetTrapTabPattern = {
	style: 'multi-facet-trapezoid';
	svgPath: string;
	triangle1: Triangle;
	triangle2: Triangle;
};
export type MultiFacetFullTabPattern = {
	style: 'multi-facet-full';
	svgPath: string;
	triangle1: Triangle;
	triangle2: Triangle;
};

export type OutlinePattern = {
	tab?: {
		style: TabStyle['style'];
	};
	outline: {
		svgPath: string;
		points: Vector3[];
	};
	scoring?: (
		| {
				svgPath: string;
				points: Vector3[];
		  }
		| undefined
	)[];
	cutouts?: {
		svgPath: string;
		points?: Vector3[];
	}[];
};

export type LevelPattern = {
	outline: {
		svgPath: string;
		points: Vector2[];
	};
};

export type Pattern =
	| FacetedBandPattern
	| OutlinedBandPattern
	| LevelSetPattern
	| PatternedBandPattern;

export type Flag = 0 | 1;

export type PathSegment = MovePathSegment | LinePathSegment | ArcPathSegment | ReturnPathSegment | BezierPathSegment;

export type MovePathSegment = ['M', number, number];
export type LinePathSegment = ['L', number, number];
export type ArcPathSegment = ['A', number, number, number, Flag, Flag, number, number];
export type BezierPathSegment = ['C', number, number, number, number, number, number];
export type ReturnPathSegment = ['Z'];

export type PatternName = 'flower-of-life-1';
export type PatternedBandConfig = {
	range?: [number, number];
	pattern: {
		name: PatternName;
	};
};

export type FacetedBandPattern = { projectionType: 'faceted'; bands: { facets: FacetPattern[] }[] };
export type OutlinedBandPattern = { projectionType: 'outlined'; bands: OutlinePattern[] };
export type PatternedBandPattern = {
	projectionType: 'patterned';
	bands: {
		facets: PatternedPattern[];
		svgPath: string;
		id?: string;
	}[];
};
export type LevelSetPattern = { projectionType: 'outlined'; levels: LevelPattern[] };
export type FacetedStrutPattern = {
	projectionType: 'faceted';
	struts: { facets: FacetPattern[] }[];
};
export type OutlinedStrutPattern = { projectionType: 'outlined'; struts: OutlinePattern[] };

export type Axis = 'z' | 'x' | 'y';

export type TrianglePoint = 'a' | 'b' | 'c';
export type TriangleSide = 'ab' | 'ac' | 'bc';

export type AlignTrianglesConfig = {
	isEven: boolean;
	isTabOnGreaterSide: boolean;
	lead: {
		vec: Vector3;
		p: TrianglePoint;
	}; // front point of prevTriangle to be aligned against
	follow: {
		vec: Vector3;
		p: TrianglePoint;
	}; // back point of prevTriangle to be aligned against
};
export type FlatStripConfig = {
	bandStyle: BandStyle;
	origin?: Vector3;
	direction?: Vector3;
};
