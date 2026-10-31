import type { PageRect } from './types';

type Pt = { x: number; y: number };

/**
 * The page a band sits on, from its page-space centre: the page containing the
 * point, else the nearest one (a centre exactly in a gap). -1 only when there
 * are no pages.
 */
export const pageOfPoint = (p: Pt, pages: PageRect[]): number => {
	let best = -1;
	let bestDist = Infinity;
	pages.forEach((r, i) => {
		const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.width));
		const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.height));
		const d = dx * dx + dy * dy;
		if (d < bestDist) {
			best = i;
			bestDist = d;
		}
	});
	return best;
};
