import type { PathSegment } from '#lib/types.js';
import type { KeepOut, PageRect } from './types';

/** Side of the square "+" registration mark, millimetres. */
export const REGISTRATION_MARK_MM = 10;

/**
 * Smallest factor the page (content box and keep-out, both mm-based) must be
 * scaled by for a w×h box to fit a fresh page — beside the top-right keep-out
 * or below it. `gap` is pattern units and does not scale. ≤ 1 means it fits now.
 * Without a keep-out this is the plain content-box ratio.
 */
export const keepOutFitFactor = (
	w: number,
	h: number,
	contentWidth: number,
	contentHeight: number,
	keepOut: KeepOut | undefined,
	gap: number
): number => {
	const plain = Math.max(w / contentWidth, h / contentHeight);
	if (!keepOut) return plain;
	const besideW = contentWidth - keepOut.width;
	const belowH = contentHeight - keepOut.height;
	const beside = besideW > 0 ? Math.max((w + gap) / besideW, h / contentHeight) : Infinity;
	const below = belowH > 0 ? Math.max(w / contentWidth, (h + gap) / belowH) : Infinity;
	return Math.max(plain, Math.min(beside, below));
};

/** The mark's square, page space: tucked into the content box's top-right corner. */
export const registrationMarkRect = (page: PageRect, marginPx: number, size: number): PageRect => ({
	x: page.x + page.width - marginPx - size,
	y: page.y + marginPx,
	width: size,
	height: size
});

/** A "+" spanning the mark's square. */
export const registrationMarkPath = (r: PageRect): PathSegment[] => {
	const cx = r.x + r.width / 2;
	const cy = r.y + r.height / 2;
	return [
		['M', r.x, cy],
		['L', r.x + r.width, cy],
		['M', cx, r.y],
		['L', cx, r.y + r.height]
	];
};
