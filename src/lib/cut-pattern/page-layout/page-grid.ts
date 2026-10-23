import type { PageGeom } from './types';

/**
 * Top-left corner of page `idx`. Pages flow in rows like a wrapping flex row:
 * left to right, `pageGap` apart, starting a new row once the next page would
 * pass `wrapWidth`. A row always holds at least one page; no `wrapWidth`
 * stacks them in a single column.
 */
export const pageOrigin = (
	idx: number,
	{ pageWidth, pageHeight, pageGap, wrapWidth }: PageGeom
): { x: number; y: number } => {
	const perRow =
		wrapWidth !== undefined && wrapWidth > 0
			? Math.max(1, Math.floor((wrapWidth + pageGap) / (pageWidth + pageGap)))
			: 1;
	return {
		x: (idx % perRow) * (pageWidth + pageGap),
		y: Math.floor(idx / perRow) * (pageHeight + pageGap)
	};
};
