import type { Vector3 } from 'three';

export type LayoutItem = {
	width: number;
	height: number;
	left: number; // bounds.left offset relative to band origin
	top: number; // bounds.top offset relative to band origin
	alignedYOffset: number; // vertical-alignment shift (0 for top-align)
};

/** A reserved rect at the content box's top-right corner, pattern units. */
export type KeepOut = { width: number; height: number };

export type PageGeom = {
	pageScale: number; // pattern-units per mm (for requiredScale computation)
	pageWidth: number; // full page, pattern units
	pageHeight: number;
	contentWidth: number; // page minus 2× margin
	contentHeight: number;
	marginPx: number; // margin in pattern units
	pageGap: number; // vertical gap between stacked pages, pattern units
	gap: number; // spacing between items, pattern units
	reorderWindow: number; // skyline lookahead window (>= 1)
	allowRotation: boolean; // skyline: permit 90° rotation
	// Top-right registration-mark square every algorithm keeps clear (plus `gap`)
	// on every page; absent when marks are off.
	keepOut?: KeepOut;
};

export type PageRect = { x: number; y: number; width: number; height: number };

export type PageLayoutResult = {
	origins: Vector3[];
	rotations: number[]; // per-item rotation in degrees; any multiple of the nest rotation step (skyline: 0 or 90), parallel to origins
	pages: PageRect[];
	utilisation?: number[]; // nest only: per-page fraction of content cells covered, in [0,1]
	overflow?: { itemIndex: number; requiredScale: number };
};

export type PageLayoutFn = (items: LayoutItem[], geom: PageGeom) => PageLayoutResult;
