import type { Vector3 } from 'three';

export type LayoutItem = {
	width: number;
	height: number;
	left: number; // bounds.left offset relative to band origin
	top: number; // bounds.top offset relative to band origin
	alignedYOffset: number; // vertical-alignment shift (0 for top-align)
};

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
};

export type PageRect = { x: number; y: number; width: number; height: number };

export type PageLayoutResult = {
	origins: Vector3[];
	rotations: number[]; // per-item rotation in degrees (0 or 90), parallel to origins
	pages: PageRect[];
	overflow?: { itemIndex: number; requiredScale: number };
};

export type PageLayoutFn = (items: LayoutItem[], geom: PageGeom) => PageLayoutResult;
