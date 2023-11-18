import type { PathSegment } from '$lib/cut-pattern/cut-pattern';
import type {
	ArcPathSegment,
	LinePathSegment,
	MovePathSegment,
	ReturnPathSegment
} from '$lib/cut-pattern/cut-pattern.types';

export interface Circle {
	x: number;
	y: number;
	r: number;
}
export interface Point {
	x: number;
	y: number;
}
export interface Triangle {
	[key: string]: Point;
	a: Point;
	b: Point;
	c: Point;
}
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

export const isFlowerOfLifePathSegments = (
	segments: FlowerOfLifePathSegments | PathSegment[]
): segments is FlowerOfLifePathSegments => {
	const res =
		Array.isArray(segments) &&
		Array.isArray(segments) &&
		segments.map((s) => s[0]).join('') === 'MLALLALLALZMAAAZ';
	if (!res) {
		console.error(
			Array.isArray(segments),
			Array.isArray(segments),
			segments.map((s) => s[0]).join('') === 'MLALLALLALZMAAAZ'
		);
	}
	return res;
};
