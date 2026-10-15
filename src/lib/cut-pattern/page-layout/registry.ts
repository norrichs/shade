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

/**
 * The editor's number input can hand over a negative, cleared (null) or huge
 * value; clamp to [0, 180] and fall back to the 15° default when not finite.
 */
const clampRotationStep = (x: unknown): number =>
	typeof x === 'number' && Number.isFinite(x) ? Math.min(180, Math.max(0, x)) : 15;

export const buildNestGeom = (cfg: PageLayoutConfig): NestGeom => ({
	...buildPageGeom(cfg),
	rotationStep: clampRotationStep(cfg.rotationStep),
	cellMm: NEST_CELL_MM
});

/** Whether a nest with this (clamped) rotation step can turn a piece onto its side. */
export const nestAllowsQuarterTurn = (rotationStep: number): boolean =>
	rotationStep > 0 && 90 % rotationStep === 0;
