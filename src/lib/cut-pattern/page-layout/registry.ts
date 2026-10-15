import type { PageLayoutConfig } from '$lib/types';
import { flexWrapPageLayout, PAGE_STACK_GAP } from './flex-wrap';
import { skylinePageLayout } from './skyline';
import { NEST_CELL_MM, type NestGeom } from './nest/nest';
import type { PageGeom, PageLayoutFn } from './types';

export const PAGE_LAYOUT_ALGORITHMS: Record<
	Exclude<PageLayoutConfig['algorithm'], 'nest'>,
	PageLayoutFn
> = {
	'flex-wrap': flexWrapPageLayout,
	skyline: skylinePageLayout
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

export const buildNestGeom = (cfg: PageLayoutConfig): NestGeom => ({
	...buildPageGeom(cfg),
	rotationStep: cfg.rotationStep ?? 15,
	cellMm: NEST_CELL_MM
});
