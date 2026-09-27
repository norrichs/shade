import type { PathSegment } from '$lib/types';

/** Millimetres, Y up (LightBurn's frame). Paths contain only M, L, C, Z. */
export type LbPathShape = { kind: 'path'; cutIndex: number; segments: PathSegment[] };
/** `x`, `y` are the MIN corner in mm, Y up. The writer centres it for LightBurn. */
export type LbRectShape = {
	kind: 'rect';
	cutIndex: number;
	x: number;
	y: number;
	width: number;
	height: number;
};
export type LbShape = LbPathShape | LbRectShape;
/** One page = one LightBurn Group; its page rect is one of its shapes. */
export type LbPage = { shapes: LbShape[] };
export type LbProject = { pages: LbPage[] };
