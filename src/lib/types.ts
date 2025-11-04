import type { Vector2, Vector3, Triangle as ThreeTriangle, Object3D } from 'three';
import type {
	BaseProjectionConfig,
	Polyhedron,
	Projection,
	ProjectionAddress_Band,
	ProjectionAddress_Facet,
	ProjectionAddress_FacetEdge,
	ProjectionAddress_Projection,
	ProjectionAddress_Tube,
	TriangleEdge,
	Tube
} from './projection-geometry/types';
import type { PanelHoleConfig } from './cut-pattern/generate-pattern';
import type { DistributionConfig } from '../components/cut-pattern/distrubute-panels';
import type { ProjectionRange } from './projection-geometry/filters';

export type PatternViewConfig = {
	showQuads: boolean;
	showTriangles: boolean;
	showLabels: boolean;
	width: number;
	height: number;
	zoom: number;
	centerOffset: {
		x: number;
		y: number;
	};
	range: ProjectionRange;
};
export type PatternStyle = 'faceted' | 'outlined' | 'patterned' | 'none' | 'layered';

export type PatternShowConfig = {
	[key: string]: PatternStyle;
	band: PatternStyle;
	strut: PatternStyle;
	level: PatternStyle;
};

export type TilePattern =
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

export type DynamicPathCollection = { [key: string]: DynamicPath };
export type DynamicPath = { width: number; path: PathSegment[]; svgPath: string }[];

export type PatternGenerator = UnitPatternGenerator | BandPatternGenerator;

export type UnitPatternGenerator = {
	getPattern: (
		rows: number,
		columns: number,
		quadBand?: Quadrilateral[],
		variant?: TiledPatternVariant
	) => PathSegment[];
	tagAnchor?: any;
	adjustAfterMapping?: (
		patternBand: PathSegment[][],
		quadBand: Quadrilateral[],
		tiledPatternConfig: TiledPatternConfig
	) => PathSegment[][];
	adjustAfterTiling?: any;
};
export type BandPatternGenerator = {
	getPattern: (rows: number, columns: number, quadBand?: Quadrilateral[]) => DynamicPathCollection;
	tagAnchor?: any;
	adjustAfterMapping?: any;
	adjustAfterTiling?: any;
};

export type CircleConfig = {
	[key: string]: 'CircleConfig' | PointConfig2 | number;
	type: 'CircleConfig';
	center: PointConfig2;
	radius: number;
};

export type PathConfig = {
	[key: string]: 'PathConfig' | BezierConfig[];
	type: 'PathConfig';
	curves: BezierConfig[];
};

export type HoleGeometryConfig = CircleConfig | PathConfig;

export type HoleConfigTriangle = {
	type: 'HoleConfigTriangle';
	corners: [PointConfig2, PointConfig2, PointConfig2];
	geometry: HoleGeometryConfig[];
};

export type HoleConfigSquare = {
	type: 'HoleConfigSquare';
	corners: [PointConfig2, PointConfig2, PointConfig2, PointConfig2];
	geometry: HoleGeometryConfig[];
};

export type HoleConfigBand = {
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

export type PixelScale = { value: number; unit: 'cm' | 'inch' | 'mm' };
export type PageSize = { height: number; width: number; unit: 'cm' | 'inch' | 'mm' };

export type PatternConfig = {
	[key: string]:
		| PatternShowConfig
		| CutoutConfig
		| Axis
		| PointConfig2
		| boolean
		| undefined
		| PixelScale
		| PageSize;
	showPattern: PatternShowConfig;
	axis: Axis;
	origin: PointConfig2;
	direction: PointConfig2;
	offset: PointConfig2;
	showTabs: boolean;
	pixelScale: PixelScale;
	page: PageSize;
	// patternedConfig: CutPatternConfig;
};

export type TabPattern =
	| FullTabPattern
	| TrapTabPattern
	| MultiFacetFullTabPattern
	| MultiFacetTrapTabPattern;

export type FacetPattern = {
	svgPath: string;
	triangle: ThreeTriangle;
	tab?: TabPattern;
};

export type CutPattern = {
	path: PathSegment[];
	svgPath?: string;
	strokeWidth?: number;
	quadWidth?: number;
	svgTransform?: string;
	triangle?: ThreeTriangle;
	triangles?: [ThreeTriangle, ThreeTriangle];
	quad?: Quadrilateral;
	tab?: TabPattern;
	addenda?: Omit<CutPattern, 'addenda'>[];
	label: string;
};

export type FullTabPattern = {
	style: 'full';
	svgPath: string;
	triangle: ThreeTriangle;
};

export type TrapTabPattern = {
	style: 'trapezoid';
	svgPath: string;
	triangle: ThreeTriangle;
};

export type MultiFacetTrapTabPattern = {
	style: 'multi-facet-trapezoid';
	svgPath: string;
	triangle1: ThreeTriangle;
	triangle2: ThreeTriangle;
};
export type MultiFacetFullTabPattern = {
	style: 'multi-facet-full';
	svgPath: string;
	triangle1: ThreeTriangle;
	triangle2: ThreeTriangle;
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
	| BandCutPatternPattern;

export type Flag = 0 | 1;

export type PathSegment =
	| MovePathSegment
	| LinePathSegment
	| ArcPathSegment
	| ReturnPathSegment
	| CubicBezierPathSegment
	| QuadraticBezierPathSegment;

export type MovePathSegment = ['M', number, number];
export type LinePathSegment = ['L', number, number];
export type ArcPathSegment = ['A', number, number, number, Flag, Flag, number, number];
export type ReturnPathSegment = ['Z'];
export type CubicBezierPathSegment = ['C', number, number, number, number, number, number];
export type QuadraticBezierPathSegment = ['Q', number, number, number, number];

export const isMovePathSegment = (seg: PathSegment): seg is MovePathSegment =>
	seg[0] === 'M' && seg.length === 3;
export const isLinePathSegment = (seg: PathSegment): seg is LinePathSegment =>
	seg[0] === 'L' && seg.length === 3;
export const isArcPathSegment = (seg: PathSegment): seg is ArcPathSegment =>
	seg[0] === 'A' && seg.length === 8;
export const isCubicBezierPathSegment = (seg: PathSegment): seg is CubicBezierPathSegment =>
	seg[0] === 'C' && seg.length === 7;
export const isQuadraticBezierPathSegment = (seg: PathSegment): seg is QuadraticBezierPathSegment =>
	seg[0] === 'Q' && seg.length === 5;
export const isReturnPathSegment = (seg: PathSegment): seg is ReturnPathSegment =>
	seg[0] === 'Z' && seg.length === 1;

export type PatternName = 'flower-of-life-1';
export type BandCutPatternConfig = {
	range?: [number, number];
	pattern: {
		name: PatternName;
	};
};

export type Patterns = {
	band: BandPattern;
	strut: OutlinedStrutPattern | FacetedStrutPattern | NullBandPattern;
	level: LevelSetPattern | NullBandPattern;
};

export type BandPattern = (
	| OutlinedBandPattern
	| FacetedBandPattern
	| BandCutPatternPattern
	| NullBandPattern
) & { meta?: { minLength?: number; maxLength?: number } };

export type BandCutPattern = {
	facets: CutPattern[];
	svgPath?: string;
	id: string;
	tagAnchorPoint: Point;
	tagAngle?: number;
	projectionType: 'patterned';
	address: ProjectionAddress_Band;
	meta?: {
		startPartnerBand: ProjectionAddress_Band;
		endPartnerBand: ProjectionAddress_Band;
	}
};

export type TubeCutPattern = {
	projectionType: 'patterned';
	address: ProjectionAddress_Tube;
	bands: BandCutPattern[];
}

export type ProjectionCutPattern = {
	address: ProjectionAddress_Projection;
	tubes: TubeCutPattern[]
}




export type ProjectionPanelPattern = {
	tubes: TubePanelPattern[];
	address: ProjectionAddress_Projection;
};
export type TubePanelPattern = {
	address: ProjectionAddress_Tube;
	bands: BandPanelPattern[];
};
export type BandPanelPattern = {
	address: ProjectionAddress_Band;
	orientation: FacetOrientation;
	panels: PanelPattern[];
	bounds?: {
		left: number;
		top: number;
		width: number;
		height: number;
		center: Vector3;
	};
};

export type Crease = 'valley' | 'mountain';
export type PanelEdgeMeta = {
	cutAngle: number;
	crease: Crease;
	partner: ProjectionAddress_FacetEdge;
	label?: string;
	holes?: { location: Vector3, holeDiameter: number, headDiameter: number }[];
};

export type BoundingBox = {
	left: number;
	top: number;
	width: number;
	height: number;
};

export type HingePattern = {
	address: ProjectionAddress_FacetEdge;
	partnerAddress: ProjectionAddress_FacetEdge;
	edge: TriangleEdge;
	bounds: BoundingBox;
	pattern: {
		partnerBackFaceTriangle: ThreeTriangle;
		backfFaceTriangle: ThreeTriangle;
		registrationPoint: Vector3;
		outline: Vector3[],
		hinge: [Vector3, Vector3],
		holes: { location: Vector3, holeDiameter: number, headDiameter: number, nutDiameter: number }[]
	};
};

export type PanelPattern = {
	path: PathSegment[];
	tiling: 'triangle';
	svgPath: string;
	triangle: ThreeTriangle;
	address: ProjectionAddress_Facet;
	meta: {
		insetTriangle?: ThreeTriangle;
		backFaceTriangle?: ThreeTriangle;
		frontFaceRegistrationPoints?: { ab: Vector3, bc: Vector3, ac: Vector3 };
		backFaceRegistrationPoints?: { ab: Vector3, bc: Vector3, ac: Vector3 };
		hingePatterns?: HingePattern[]
		edges: { ab: PanelEdgeMeta; bc: PanelEdgeMeta; ac: PanelEdgeMeta };
	};
};

export type PanelBase = { p0: TrianglePoint; p1: TrianglePoint; v0: Vector3; v1: Vector3 };

export type NullBandPattern = { projectionType: 'none' };
export type FacetedBandPattern = { projectionType: 'faceted'; bands: { facets: FacetPattern[] }[] };
export type OutlinedBandPattern = { projectionType: 'outlined'; bands: OutlinePattern[] };
export type BandCutPatternPattern = {
	projectionType: 'patterned';
	bands: BandCutPattern[];
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
	pixelScale?: PixelScale;
};

// type TiledPatternSubconfigType = 'rowCount' | 'columnCount';

// export type TiledPatternSubConfig =
// 	| { type: 'width'; valueType: 'number'; value: number; min: number; max: number; step: number }
// 	| {
// 			type: 'insetWidth';
// 			valueType: 'number';
// 			value: number;
// 			min: number;
// 			max: number;
// 			step: number;
// 	  }
// 	| {
// 			type: 'appendTab';
// 			valueType: 'named';
// 			value: string;
// 			options: [{ none: false }, 'left', 'right', 'both'];
// 	  }
// 	| { type: 'adjustBandBoundary'; valueType: 'boolean'; value: boolean }
// 	| {
// 			type: 'tabVariant';
// 			valueType: 'named';
// 			value: string;
// 			options: [{ none: false }, 'extend', 'inset'];
// 	  }
// 	| {
// 			type: 'filledEndSize';
// 			valueType: 'number';
// 			value: number;
// 			min: number;
// 			max: number;
// 			step: number;
// 	  }
// 	| {
// 			type: TiledPatternSubconfigType;
// 			valueType: 'number';
// 			value: number;
// 			min: number;
// 			max: number;
// 			step: number;
// 	  }
// 	| {
// 			type: TiledPatternSubconfigType;
// 			valueType: 'number';
// 			value: number;
// 			min: number;
// 			max: number;
// 			step: number;
// 	  }
// 	| {
// 			type: 'dynamicStroke';
// 			valueType: 'named';
// 			value: string;
// 			options: ['quadWidth', 'quadHeight'];
// 	  }
// 	| {
// 			type: 'dynamicStrokeEasing';
// 			valueType: 'named';
// 			value: string;
// 			options: ['linear', 'bezier'];
// 	  }
// 	| {
// 			type: 'dynamicStrokeMin';
// 			valueType: 'number';
// 			value: number;
// 			min: number;
// 			max: number;
// 			step: number;
// 	  }
// 	| {
// 			type: 'dynamicStrokeMax';
// 			valueType: 'number';
// 			value: number;
// 			min: number;
// 			max: number;
// 			step: number;
// 	  }
// 	| { type: 'doAddenda'; valueType: 'boolean'; value: boolean };

export type TiledPattern =
	| 'tiledHexPattern-1'
	| 'tiledGridPattern-0'
	| 'tiledPanelPattern-0'
	| 'tiledBoxPattern-0'
	| 'tiledBowtiePattern-0'
	| 'tiledCarnationPattern-0'
	| 'tiledCarnationPattern-1'
	| 'tiledTriStarPattern-1'
	| 'tiledShieldTesselationPattern'
	| 'bandedBranchedPattern-0';

export type TilingBasis = 'quadrilateral' | 'band' | 'triangle';
export type DynamicStrokeBasis = 'quadWidth' | 'quadHeight' | 'ranked';
export type SkipEdges = 'all' | 'not-both' | 'not-first' | 'not-last' | 'none';

export type TiledPatternConfig = {
	type: TiledPattern;
	tiling: TilingBasis;
	labels?: {
		scale: number;
		angle: number;
	};
	config: {
		rowCount?: number;
		columnCount?: number;
		dynamicStroke: DynamicStrokeBasis;
		dynamicStrokeEasing: 'linear';
		dynamicStrokeMin: number;
		dynamicStrokeMax: number;
		endsMatched: boolean;
		endsTrimmed: boolean;
		endLooped: number;
		variant?: GridVariant;
		aspectRatio?: number;
		skipEdges?: SkipEdges;
		distributePanels?: boolean;
		distributionOffset?: number;
		scaleConfig: PatternScale,
		panelHoleConfig?: PanelHoleConfig;
		distributionConfig?: DistributionConfig;
	};
};

export type GridVariant = 'rect' | 'triangle-0' | 'triangle-1';
export type PanelVariant = 'triangle-0' | 'triangle-1';
export type ShieldTesselationVariant = 'rect';

export type TiledPatternVariant = undefined | GridVariant | ShieldTesselationVariant;

export type Level = {
	center: Vector3;
	level: number;
	vertices: Vector3[];
};

export type LevelPrototype = {
	center: Vector2;
	vertices: Vector2[];
};

export type LevelOffset = {
	id?: number;
	x: number;
	y: number;
	z: number;
	rotX: number;
	rotY: number;
	rotZ: number;
	scaleX: number;
	scaleY: number;
	depth: number;
};

export type LevelConfig = {
	// silhouetteConfig: SilhouetteConfig,
	type: 'LevelConfig';
	id?: number;
	silhouetteSampleMethod: CurveSampleMethod;
	levelPrototypeSampleMethod: 'shape' | 'curve';
	levelCount?: number;
	baseRadius?: number;
	levelOffsets: LevelOffset[];
	height?: number;
};

export type FacetTab = FullTab | TrapTab | MultiFacetFullTab | MultiFacetTrapTab;

export type TabFootprint = { triangle: ThreeTriangle; free: 'a' | 'b' | 'c' };
export type TabFootprintInvert = { triangle: ThreeTriangle; free: 'ab' | 'ac' | 'bc' };

export type FullTab = {
	style: 'full';
	footprint: TabFootprint;
	direction: TabDirection;
	outer: { a: Vector3; b: Vector3; c: Vector3 };
	scored?: { a: Vector3; b: Vector3 };
};
export type TrapTab = {
	style: 'trapezoid';
	footprint: TabFootprint;
	direction: TabDirection;
	outer: { a: Vector3; b: Vector3; c: Vector3; d: Vector3 };
	scored?: { a: Vector3; b: Vector3 };
};

export type MultiFacetFullTab = {
	style: 'multi-facet-full';
	footprint: [TabFootprint, TabFootprintInvert];
	direction: TabDirection;
	outer: { a: Vector3; b: Vector3; c: Vector3; d: Vector3 };
	scored?: { a: Vector3; b: Vector3 };
};

export type MultiFacetTrapTab = {
	style: 'multi-facet-trapezoid';
	footprint: [TabFootprint, TabFootprintInvert];
	direction: TabDirection;
	outer: { a: Vector3; b: Vector3; c: Vector3; d: Vector3 };
	scored?: { a: Vector3; b: Vector3 };
	width: number;
	inset?: number;
};

// TODO - remove all FacetTab[] = a facet can only have a single attached tab

export type FacetEdgeMeta = {
	// address: ProjectionAddress_FacetEdge;
	partner: ProjectionAddress_FacetEdge;
};

export type Facet = {
	// firstFacet: { [key: string]: FacetEdgeMeta };
	triangle: ThreeTriangle;
	address?: ProjectionAddress_Facet;
	meta?: {
		ab: FacetEdgeMeta;
		bc: FacetEdgeMeta;
		ac: FacetEdgeMeta;
	};
	orientation: FacetOrientation;
	tab?: FacetTab; // | FacetTab[];
};

export type FacetOrientation = 'circumferential' | 'axial-right' | 'axial-left';

/* 
Triangle layout diagram
orientation 'circumferential' (0)
        _________ _________
			/c\b     a/c\b     a/
		/		 \	  /    \    /
	/a     b\c/a     b\c/
	--------- ---------

orientation 'axial-right' (1)

								_________ 
							/c\b     a/
						/		 \	  /
					/a     b\c/
        _________ 
			/c\b     a/
		/		 \	  /
	/a     b\c/
	--------- 
orientation 'axial-left' (-1)
	_________ 
	\b     a/c\
		\	  /    \
		\c/a     b\
				_________
			\b     a/c\
				\	  /    \
				\c/a     b\
					---------

*/

export type GlobulePoints = {
	type: 'GlobulePoints';
	globuleConfigId: number;
	points: Vector3[];
};

type BandSelection = string;

export type Band = {
	facets: Facet[];
	orientation: FacetOrientation;
	endTab?: FacetTab;
	selected?: BandSelection;
	visible?: boolean;
	address?: GeometryAddress<BandAddressed> | ProjectionAddress_Band;
};
export type BezierConfig = {
	[key: string]: PointConfig2[] | string;
	type: 'BezierConfig';
	points: [PointConfig2, PointConfig2, PointConfig2, PointConfig2];
};

export type PointConfig2 = {
	type: 'PointConfig2';
	x: number;
	y: number;
	pointType?: 'smooth' | 'angled';
};

export type PointConfig3 = {
	type: 'PointConfig2';
	x: number;
	y: number;
	z: number;
	pointType?: 'smooth' | 'angled';
};

export type LineConfig = {
	type: 'LineConfig';
	points: [PointConfig2, PointConfig2];
};

export type CurveConfig = SilhouetteConfig | ShapeConfig | DepthCurveConfig | SpineCurveConfig;

export type CurveConfigType = CurveConfig['type'];

export type SilhouetteConfig = {
	type: 'SilhouetteConfig';
	id?: number;
	curves: BezierConfig[];
};

export type DepthCurveConfig = {
	type: 'DepthCurveConfig';
	id?: number;
	depthCurveBaseline: number;
	curves: BezierConfig[];
};

export type SpineCurveConfig = {
	type: 'SpineCurveConfig';
	id?: Id;
	angle: number;
	curves: BezierConfig[];
};

export type CurveSampleMethod =
	| { method: 'divideCurvePath'; divisions: number }
	| { method: 'divideCurve'; divisions: number }
	| { method: 'preserveAspectRatio'; divisions: number }
	| { method: 'spineCurve'; divisions: number };

export type CurveSampleMethodMethod = CurveSampleMethod['method'];

export const isCurveSampleMethodMethod = (m: string): m is CurveSampleMethodMethod =>
	['divideCurvePath', 'divideCurve', 'preserveAspectRatio', 'spineCurve'].includes(m);

export type ShapeConfig = {
	type: 'ShapeConfig';
	id?: number;
	// divisions: number;
	sampleMethod: CurveSampleMethod;
	symmetry: 'asymmetric' | 'radial' | 'lateral' | 'radial-lateral';
	symmetryNumber: number;
	curves: BezierConfig[];
};

export type Validation = {
	isValid: boolean;
	msg: string[];
};

export type Strut = {
	tiling: Tiling;
	orientation: StrutOrientation;
	radiate: RadiateOrientation;
	facets: Facet[];
};

export type StrutConfig = {
	type: 'StrutConfig';
	id?: number;
	tiling: Tiling;
	orientation: StrutOrientation;
	radiate: RadiateOrientation;
	width: number;
};

export type Tiling = BandStyle;
export type StrutOrientation = 'inside' | 'outside' | 'half';
export type RadiateOrientation = 'level' | 'orthogonal' | 'hybrid';

export type GeometryConfig =
	| ShapeConfig
	| LevelConfig
	| SilhouetteConfig
	| DepthCurveConfig
	| SpineCurveConfig
	| BandConfig
	| StrutConfig
	| RenderConfig;

export type GeometryConfigType = GeometryConfig['type'];
export type Id = TempId | number;
export type GlobuleConfigType = 'GlobuleConfig' | 'SuperGlobuleConfig';
// SUPER
export type SuperGlobuleConfig = {
	type: 'SuperGlobuleConfig';
	id: Id;
	name?: string;
	subGlobuleConfigs: SubGlobuleConfig[];
	projectionConfigs: BaseProjectionConfig[];
};

export type SuperGlobule = {
	type: 'SuperGlobule';
	superGlobuleConfigId: Id;
	name?: string;
	subGlobules: SubGlobule[];
	projections: {
		projection: Projection;
		polyhedron: Polyhedron;
		tubes: Tube[];
		surface: Object3D;
	}[];
};

export type SuperGlobuleGeometry =
	| {
			type: 'SuperGlobuleGeometry';
			variant: 'Globule';
			superGlobuleConfigId: Id;
			name?: string;
			subGlobules: GlobuleGeometry[];
	  }
	| {
			type: 'SuperGlobuleGeometry';
			variant: 'Band';
			superGlobuleConfigId: Id;
			name?: string;
			subGlobules: BandGeometry[][];
	  };

// SUB
export type SubGlobuleConfig = {
	type: 'SubGlobuleConfig';
	id: Id;
	name?: string;
	globuleConfig: GlobuleConfig;
	transforms: ChainableTransform[];
};

export type SubGlobule = {
	type: 'SubGlobule';
	subGlobuleConfigId: Id;
	name?: string;
	data: Globule[];
};

export type SubGlobuleGeometry = {
	type: 'SubGlobuleGeometry';
	subGlobuleConfigId: Id;
	name?: string;
	recurrence: number;
	globuleGeometry: GlobuleGeometry;
};

// GLOBULE
export type Globule = {
	type: 'Globule';
	coord: GlobuleConfigCoordinates;
	coordStack: GlobuleConfigCoordinates[];
	address: GeometryAddress<undefined>;
	subGlobuleConfigId: Id;
	globuleConfigId: Id;
	name?: string;
	recurrence?: number;
	visible: boolean;
	recombination?: Recombination;
	transformChain?: GlobuleTransform[];
	data: GlobuleData;
};

export type GlobuleData = {
	levels: Level[];
	bands: Band[];
	struts?: Strut[];
};

export type GlobuleGeometry = {
	type: 'GlobuleGeometry';
	globuleConfigId: Id;
	subGlobuleConfigId?: Id;
	subGlobuleRecurrence?: number;
	name?: string;
	points: Vector3[];
};
export type BandGeometry = {
	type: 'BandGeometry';
	coord: BandConfigCoordinates;
	coordStack: GlobuleConfigCoordinates[];
	address: GeometryAddress<number>;
	globuleConfigId: Id;
	subGlobuleConfigId: Id;
	globuleIndex: number;
	bandIndex: number;
	name?: string;
	points: Vector3[];
};

// number array allows for arbitrary, and repeating application of transforms
export type Recurrence = RecombinatoryRecurrence[];

export type GlobuleAddressed = undefined;
export type BandAddressed = number;

export type GeometryAddress<T extends GlobuleAddressed | BandAddressed> = {
	s: number;
	g: GlobuleAddress;
	b: T;
};

export type GlobuleAddress = number[]; // where array position indicates transform index and arrayitem value indicates recurrence index

export type GlobuleConfigCoordinates = { s: number; t: number; r: number };
export type BandConfigCoordinates = GlobuleConfigCoordinates & { b: number };
export type BandEnd = 'start' | 'end';
export type BandMapping = {
	originJoin: BandEnd;
	partnerJoin: BandEnd;
	originIndex: number;
	partnerAddress: GeometryAddress<number>;
};

export type Recombination = {
	bandMap: BandMapping[];
};

export type RecombinatoryRecurrence = {
	multiplier: number;
	ghost?: boolean;
	recombines?: Recombination;
};

export type Plane = [Point3, Point3, Point3];

export type GlobuleTransformTranslate = { translate: Point3 };
export type GlobuleTransformRotate = { rotate: GlobuleRotate };
export type GlobuleTransformReflect = { reflect: GlobuleReflect };
export type GlobuleTransformScale = { scale: GlobuleScale };

export type GlobuleTransform =
	| GlobuleTransformTranslate
	| GlobuleTransformRotate
	| GlobuleTransformReflect
	| GlobuleTransformScale;

export type ChainableTransform = {
	recurs: Recurrence;
} & GlobuleTransform;

export type GlobuleReflect = { anchor: Point3; normal: Point3 };
export type GlobuleScale = { anchor: Point3; scaleValue: number };
export type GlobuleRotate = { angle: number; anchor: Point3; axis: Point3 };

export type GlobuleConfig = {
	[key: string]:
		| ShapeConfig
		| LevelConfig
		| SilhouetteConfig
		| DepthCurveConfig
		| SpineCurveConfig[]
		| BandConfig
		| StrutConfig
		| RenderConfig
		| string
		| number
		| boolean
		| undefined;

	type: 'GlobuleConfig';
	id: Id;
	name?: string;
	isModified?: boolean;
	shapeConfig: ShapeConfig;
	levelConfig: LevelConfig;
	silhouetteConfig: SilhouetteConfig;
	depthCurveConfig: DepthCurveConfig;
	spineCurveConfigs: SpineCurveConfig[];
	bandConfig: BandConfig;
	strutConfig: StrutConfig;
	renderConfig: RenderConfig;
};

export type GlobulePatternConfig = {
	// [key: string]: CutoutConfig | PatternConfig | PatternViewConfig | TiledPatternConfig;
	type: 'GlobulePatternConfig';
	id: Id;
	name?: string;
	cutoutConfig: CutoutConfig;
	patternConfig: PatternConfig;
	patternViewConfig: PatternViewConfig;
	tiledPatternConfig: TiledPatternConfig;
};

export type TabConfig = {
	lead: TrianglePoint;
	follow: TrianglePoint;
};
export type TabWidth = { style: 'fixed'; value: number } | { style: 'fraction'; value: number };
export type BandStyle = 'circumference' | 'helical-left' | 'helical-right';
export type TabScore = 0.5 | 0.75 | 0.9;
export type StripSide = 'greater' | 'lesser';
export type TabDirection = StripSide | 'both';
// TODO - add a direction setting which will result in tabs on both sides
export type TabStyle =
	| { style: 'full'; direction: TabDirection; scored?: TabScore } // for circumference bands, left and right are relative to rotation direction
	| {
			style: 'trapezoid';
			direction: TabDirection;
			width: TabWidth;
			inset?: number;
			scored?: TabScore;
	  }
	| {
			style: 'multi-facet-full';
			direction: TabDirection;
			directionMulti: -1 | 1;
			footprint: 'strut' | 'band';
			scored?: TabScore;
	  }
	| {
			style: 'multi-facet-trapezoid';
			direction: TabDirection;
			directionMulti: -1 | 1;
			footprint: 'strut' | 'band';
			width: TabWidth;
			inset?: number;
			scored?: TabScore;
	  };

export type BandConfig = {
	type: 'BandConfig';
	id?: number;
	bandStyle: BandStyle;
	offsetBy: -2 | -1 | 0 | 1 | 2;
	tabStyle: TabStyle;
};

export type RenderRange = {
	[key: string]: number | string | undefined;
	rangeStyle: 'slice';
	bandStart: number;
	bandCount?: number;
	facetStart: number;
	facetCount?: number;
	levelStart: number;
	levelCount?: number;
	strutStart: number;
	strutCount?: number;
};

export type RenderConfig = {
	type: 'RenderConfig';
	id?: number;
	ranges: RenderRange;
	show: {
		[key: string]: boolean;
		tabs: boolean;
		levels: boolean;
		bands: boolean;
		patterns: boolean;
		edges: boolean;
	};
};

export type Strip = Band | Strut;

export type Intersector = { dimension: 'x'; value: number } | { dimension: 'y'; value: number };

// Flower of Life
export interface Circle {
	x: number;
	y: number;
	r: number;
}
export type Point = {
	x: number;
	y: number;
};

export type Point3 = {
	x: number;
	y: number;
	z: number;
};
export type Triangle = {
	[key: string]: Point;
	a: Point;
	b: Point;
	c: Point;
};

export type Ellipse = {
	r0: number;
	r1: number;
	center?: Point;
	rotation: number;
};

export interface EllipseSegment {
	ellipse: Ellipse;
	p1: Point;
	p2: Point;
}

// interface FlowerOfLifeBand {
// 	mode: PatternMode;
// 	facets: FlowerOfLifeTriangle[];
// 	svgBand: string;
// }

export type PatternMode = 'layout' | 'contained' | 'contributing' | 'autoband';

export interface TrianglePatternMode {
	ab: PatternMode;
	bc: PatternMode;
	ac: PatternMode;
}
export type FlowerOfLifeConfig =
	| {
			type: 'matched';
			triangle: Triangle;
			width: number;
			mode?: PatternMode;
			anchor?: Point;
	  }
	| {
			type: 'specified';
			anchor?: Point;
			width: number;
			skewX?: number;
			rotation?: number;
			scaleX?: number;
			scaleY?: number;
			mode?: PatternMode | { ab?: PatternMode; bc?: PatternMode; ac?: PatternMode };
	  };
export type MatchedFlowerOfLifeConfig = {
	type: 'matched';
	triangle: Triangle;
	width: number;
	mode?: PatternMode;
	anchor?: Point;
};
export type BandTesselationConfig = {
	type: 'matched';
	mode: PatternMode;
	tiles: [MatchedFlowerOfLifeConfig, MatchedFlowerOfLifeConfig][];
};

export interface FlowerOfLifeTriangle {
	triangle: Triangle;
	ab: {
		mode?: PatternMode;
		layout?: EllipseSegment;
		edge: EllipseSegment;
		inner: EllipseSegment;
	};
	bc: {
		mode?: PatternMode;
		layout?: EllipseSegment;
		edge: EllipseSegment;
		inner: EllipseSegment;
	};
	ac: {
		mode?: PatternMode;
		layout?: EllipseSegment;
		edge: EllipseSegment;
		inner: EllipseSegment;
	};
	containedSVG?: string;
	layoutSVG?: string;
	reflected?: boolean;
	svgPath?: string;
	segments?: PathSegment[];
}

export type FlowerOfLifePathSegments = [
	MovePathSegment,

	LinePathSegment,
	ArcPathSegment,
	LinePathSegment,

	LinePathSegment,
	ArcPathSegment,
	LinePathSegment,

	LinePathSegment,
	ArcPathSegment,
	LinePathSegment,

	ReturnPathSegment,

	MovePathSegment,
	ArcPathSegment,
	ArcPathSegment,
	ArcPathSegment,
	ReturnPathSegment
];

// Quadrilaterals

export type Quadrilateral = {
	a: Vector3;
	b: Vector3;
	c: Vector3;
	d: Vector3;
}

/*
	Quadrilateral diagram:
	
	d ------- c
	|         |
	|         |
	|         |
	a ------- b

*/

/* 
Triangle layout diagram:
    	    d________c
				/c\b     a/
			/		 \	  /
		/a     b\c/
	a---------b
*/
export type QuadrilateralTransformMatrix = {
	u: Vector3;
	v: Vector3;
	w: Vector3;
};

export type HexPattern =
	| [
			MovePathSegment,
			LinePathSegment,
			LinePathSegment,
			LinePathSegment,
			LinePathSegment,

			MovePathSegment,
			LinePathSegment,
			MovePathSegment,
			LinePathSegment,
			MovePathSegment,
			LinePathSegment,

			MovePathSegment,
			LinePathSegment,
			LinePathSegment,
			LinePathSegment,
			LinePathSegment,

			MovePathSegment,
			LinePathSegment,
			MovePathSegment,
			LinePathSegment
	  ]
	| [
			MovePathSegment,
			LinePathSegment,
			LinePathSegment,
			LinePathSegment,
			LinePathSegment,

			LinePathSegment,
			LinePathSegment,
			LinePathSegment,
			LinePathSegment,
			LinePathSegment,
			LinePathSegment,
			ReturnPathSegment,

			MovePathSegment,
			LinePathSegment,

			MovePathSegment,
			LinePathSegment,
			MovePathSegment,
			LinePathSegment,

			MovePathSegment,
			LinePathSegment,
			MovePathSegment,
			LinePathSegment
	  ];

export type SegmentVariant = 'insettable' | 'permeable' | 'edge' | 'interior';
export type InsettableSegment = {
	[key: string]: Point | SegmentVariant;
	p0: Point;
	p1: Point;
	variant: SegmentVariant;
};
export type Perimeter = { isPerimeter: boolean; index: number };

export type InsettablePolygon = {
	perimeter: Perimeter;
	segments: InsettableSegment[];
};

export type FlowerOfLifePattern = {
	triangle: Triangle;
};

export type TempIdPrefix = 'sup' | 'sub' | 'glb' | 'cfg';
export type TempId = string;

/////////////////////////////////

export type SelectBarOption = { name: string; value?: unknown };

export type ScaleUnit = 'in' | 'mm' | 'px';
export type PatternScale = {
	unit: ScaleUnit;
	secondary?: {
		unit: ScaleUnit;
		quantity: number;
	};
	unitPerSvgUnit: number;
	quantity: number;
};
