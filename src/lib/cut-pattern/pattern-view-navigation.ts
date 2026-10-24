import type { PageRect } from '#lib/cut-pattern/page-layout/types.js';

// CSS px per page unit. The inner pattern svg is sized in page units
// (`6000mm`) inside an outer svg whose viewBox is in px, so one pattern unit
// spans this many outer viewBox units.
const PX_PER_UNIT: Record<string, number> = { mm: 96 / 25.4, cm: 96 / 2.54, in: 96 };

export const ZOOM_MIN = -3;
export const ZOOM_MAX = 3;

export const clampZoom = (zoom: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));

/**
 * The zoom at which `targetWidth` pattern units exactly fill the viewer's
 * width. The outer viewBox is `viewWidth * 10^-zoom` px wide (CutPatternSvg),
 * so solve `viewWidth * 10^-zoom = targetWidth * pxPerUnit` for zoom.
 */
export const zoomToFitWidth = (targetWidth: number, viewWidth: number, unit: string) => {
	const pxPerUnit = PX_PER_UNIT[unit] ?? PX_PER_UNIT.mm;
	return clampZoom(-Math.log10((targetWidth * pxPerUnit) / viewWidth));
};

/**
 * The page the view is "on": the one whose rect holds the view's top-left
 * corner, else the one whose top-left is nearest to it.
 */
export const currentPageIndex = (pages: PageRect[], offset: { x: number; y: number }) => {
	if (pages.length === 0) return -1;
	const containing = pages.findIndex(
		(p) =>
			offset.x >= p.x && offset.x < p.x + p.width && offset.y >= p.y && offset.y < p.y + p.height
	);
	if (containing >= 0) return containing;
	let best = 0;
	let bestDistance = Infinity;
	pages.forEach((p, i) => {
		const d = Math.hypot(p.x - offset.x, p.y - offset.y);
		if (d < bestDistance) {
			bestDistance = d;
			best = i;
		}
	});
	return best;
};

/** The index one page before (-1) or after (+1) the current one, clamped. */
export const steppedPageIndex = (
	pages: PageRect[],
	offset: { x: number; y: number },
	step: -1 | 1
) => {
	const current = currentPageIndex(pages, offset);
	if (current < 0) return -1;
	return Math.min(pages.length - 1, Math.max(0, current + step));
};

/**
 * Zoom about a fixed point: the pattern point `anchor` stays under the cursor
 * while the zoom changes by `deltaZoom`. Visible extent scales by
 * `10^-deltaZoom`, so the offset-to-anchor distance does too.
 */
export const zoomAboutPoint = (
	offset: { x: number; y: number },
	anchor: { x: number; y: number },
	deltaZoom: number
) => {
	const f = Math.pow(10, -deltaZoom);
	return {
		x: anchor.x - (anchor.x - offset.x) * f,
		y: anchor.y - (anchor.y - offset.y) * f
	};
};
