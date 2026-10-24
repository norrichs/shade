import type { PageLayoutConfig } from '#lib/types.js';
import { flexWrapPageLayout, PAGE_STACK_GAP } from './flex-wrap';
import { skylinePageLayout } from './skyline';
import { NEST_CELL_MM, type NestGeom } from './nest/nest';
import { REGISTRATION_MARK_MM } from './registration-mark';
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
		allowRotation: cfg.allowRotation,
		...(cfg.registrationMark
			? { keepOut: { width: REGISTRATION_MARK_MM * s, height: REGISTRATION_MARK_MM * s } }
			: {})
	};
};

/**
 * The editor's number input can hand over a negative, cleared (null) or huge
 * value: ≤ 0 means no rotation, positive steps clamp to [1, 180] (a sub-degree
 * step would multiply the angle count without bound), non-finite falls back to 15°.
 */
const clampRotationStep = (x: unknown): number => {
	if (typeof x !== 'number' || !Number.isFinite(x)) return 15;
	if (x <= 0) return 0;
	return Math.min(180, Math.max(1, x));
};

export const buildNestGeom = (cfg: PageLayoutConfig): NestGeom => ({
	...buildPageGeom(cfg),
	rotationStep: clampRotationStep(cfg.rotationStep),
	cellMm: NEST_CELL_MM
});

/** Whether a nest with this (clamped) rotation step can turn a piece onto its side. */
export const nestAllowsQuarterTurn = (rotationStep: number): boolean =>
	rotationStep > 0 && 90 % rotationStep === 0;
