import type { PageLayoutConfig } from '$lib/types';
import { flexWrapPageLayout, PAGE_STACK_GAP } from './flex-wrap';
import type { PageGeom, PageLayoutFn } from './types';

// Only 'flex-wrap' is implemented so far; 'skyline' is registered in a later task.
// Typed loosely (string-keyed) so the not-yet-complete map still satisfies the
// widened PageLayoutConfig['algorithm'] union without a placeholder entry.
export const PAGE_LAYOUT_ALGORITHMS: Record<string, PageLayoutFn> = {
	'flex-wrap': flexWrapPageLayout
};

export const buildPageGeom = (cfg: PageLayoutConfig): PageGeom => {
	const s = cfg.pageScale;
	const pageWidth = cfg.pageSize.width * s;
	const pageHeight = cfg.pageSize.height * s;
	const marginPx = cfg.margin * s;
	return {
		pageScale: s,
		pageWidth,
		pageHeight,
		contentWidth: pageWidth - 2 * marginPx,
		contentHeight: pageHeight - 2 * marginPx,
		marginPx,
		pageGap: PAGE_STACK_GAP,
		gap: cfg.gap,
		reorderWindow: cfg.reorderWindow,
		allowRotation: cfg.allowRotation
	};
};
