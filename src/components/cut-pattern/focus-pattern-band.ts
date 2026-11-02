/**
 * Pan the pattern pane onto a band without changing zoom.
 *
 * The pane's visible window is the scroll container; the pattern's user space is
 * the inner `#pattern-svg`, whose viewBox starts at `patternViewConfig.
 * centerOffset` (CutPatternSvg). Moving that offset by d pattern units moves the
 * content by d × (screen px per unit), which the inner svg's screen CTM gives
 * directly — so this works at any zoom, scroll position and page unit.
 */

type Rect = { left: number; top: number; right: number; bottom: number };

const unionRects = (rects: Rect[]): Rect =>
	rects.reduce((u, r) => ({
		left: Math.min(u.left, r.left),
		top: Math.min(u.top, r.top),
		right: Math.max(u.right, r.right),
		bottom: Math.max(u.bottom, r.bottom)
	}));

/** Elements drawing the band `key` (all its pieces), in one post-process group. */
export const bandElements = (container: ParentNode, key: string): Element[] => {
	const all = Array.from(container.querySelectorAll(`[data-band-key="${key}"]`));
	if (all.length === 0) return [];
	// With several post-process groups every band is drawn once per group; focus
	// the first group's copy.
	const group = all[0].closest('.post-process-group');
	return group ? all.filter((el) => el.closest('.post-process-group') === group) : all;
};

/**
 * The offset that centres the band in the visible window, or null when the band
 * is not drawn, or is already fully visible (then the view is left alone).
 */
export const focusOffsetForBand = (
	container: HTMLElement,
	key: string,
	offset: { x: number; y: number }
): { x: number; y: number } | null => {
	const els = bandElements(container, key);
	if (els.length === 0) return null;
	const inner = container.querySelector<SVGSVGElement>('#pattern-svg');
	const scale = inner?.getScreenCTM()?.a;
	if (!scale) return null;

	const band = unionRects(els.map((el) => el.getBoundingClientRect()));
	const view = container.getBoundingClientRect();
	// clientWidth/Height exclude the scrollbars.
	const visible = {
		left: view.left,
		top: view.top,
		right: view.left + container.clientWidth,
		bottom: view.top + container.clientHeight
	};
	const fits =
		band.left >= visible.left &&
		band.right <= visible.right &&
		band.top >= visible.top &&
		band.bottom <= visible.bottom;
	if (fits) return null;

	const dx = (band.left + band.right) / 2 - (visible.left + visible.right) / 2;
	const dy = (band.top + band.bottom) / 2 - (visible.top + visible.bottom) / 2;
	return { x: offset.x + dx / scale, y: offset.y + dy / scale };
};
