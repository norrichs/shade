import { flexWrapPageLayout } from '../flex-wrap';
import { skylinePageLayout } from '../skyline';
import { nestPageLayout, type NestGeom } from '../nest/nest';
import { rect } from '../nest/__tests__/fixtures';
import { buildPageGeom } from '../registry';
import {
	keepOutFitFactor,
	registrationMarkPath,
	registrationMarkRect,
	REGISTRATION_MARK_MM
} from '../registration-mark';
import type { LayoutItem, PageGeom, PageLayoutResult } from '../types';
import type { PageLayoutConfig } from '#lib/types.js';

const item = (width: number, height: number): LayoutItem => ({
	width,
	height,
	left: 0,
	top: 0,
	alignedYOffset: 0
});

const KO = { width: 60, height: 60 };
const geom = (over: Partial<PageGeom> = {}): PageGeom => ({
	pageScale: 1,
	pageWidth: 300,
	pageHeight: 300,
	contentWidth: 300,
	contentHeight: 300,
	marginPx: 0,
	pageGap: 50,
	gap: 5,
	reorderWindow: 8,
	allowRotation: false,
	keepOut: KO,
	...over
});

type Box = { x: number; y: number; w: number; h: number; page: number };

/** Unrotated item boxes in page-local coordinates (left = top = 0, marginPx = 0). */
const boxes = (r: PageLayoutResult, items: { w: number; h: number }[], g: PageGeom): Box[] =>
	r.origins.map((o, i) => {
		const page = Math.round(o.y / (g.pageHeight + g.pageGap) - 0.4999);
		return { x: o.x, y: o.y - page * (g.pageHeight + g.pageGap), ...items[i], page };
	});

/** Strict overlap with the keep-out grown by `pad` on its left and bottom. */
const hitsKeepOut = (b: Box, g: PageGeom, pad: number) => {
	const x0 = g.contentWidth - g.keepOut!.width - pad;
	const y1 = g.keepOut!.height + pad;
	const EPS = 1e-6;
	return b.x + b.w > x0 + EPS && b.y < y1 - EPS;
};

describe('keepOutFitFactor', () => {
	it('is the plain content ratio without a keep-out', () => {
		expect(keepOutFitFactor(150, 600, 300, 300, undefined, 5)).toBeCloseTo(2);
	});

	it('fits beside the keep-out when narrow enough', () => {
		expect(keepOutFitFactor(235, 300, 300, 300, KO, 5)).toBeLessThanOrEqual(1);
		expect(keepOutFitFactor(236, 300, 300, 300, KO, 5)).toBeGreaterThan(1);
	});

	it('fits below the keep-out when short enough', () => {
		expect(keepOutFitFactor(300, 235, 300, 300, KO, 5)).toBeLessThanOrEqual(1);
		expect(keepOutFitFactor(300, 236, 300, 300, KO, 5)).toBeGreaterThan(1);
	});

	it('returns a factor at which the box does fit', () => {
		// Fits the bare content box but neither beside nor below the mark.
		const f = keepOutFitFactor(280, 280, 300, 300, KO, 5);
		expect(f).toBeGreaterThan(1);
		const k = { width: KO.width * f, height: KO.height * f };
		expect(keepOutFitFactor(280, 280, 300 * f, 300 * f, k, 5)).toBeCloseTo(1);
	});
});

describe('registration mark geometry', () => {
	it('sits in the top-right corner of the content box, on every page', () => {
		const page = { x: 0, y: 350, width: 300, height: 300 };
		expect(registrationMarkRect(page, 12, 10)).toEqual({ x: 278, y: 362, width: 10, height: 10 });
	});

	it('is a "+" spanning its square', () => {
		expect(registrationMarkPath({ x: 0, y: 0, width: 10, height: 10 })).toEqual([
			['M', 0, 5],
			['L', 10, 5],
			['M', 5, 0],
			['L', 5, 10]
		]);
	});

	it('buildPageGeom reserves a 10mm keep-out only when marks are on', () => {
		const cfg = {
			pageSize: { width: 300, height: 300 },
			pageScale: 2,
			margin: 10,
			gap: 0,
			displayUnit: 'mm',
			algorithm: 'skyline',
			reorderWindow: 8,
			allowRotation: false,
			keepConnected: 0,
			rotationStep: 15,
			registrationMark: true
		} satisfies PageLayoutConfig;
		const size = REGISTRATION_MARK_MM * 2;
		expect(buildPageGeom(cfg).keepOut).toEqual({ width: size, height: size });
		expect(buildPageGeom({ ...cfg, registrationMark: false }).keepOut).toBeUndefined();
	});
});

describe.each([
	['flex-wrap', flexWrapPageLayout],
	['skyline', skylinePageLayout]
])('%s keeps the registration mark clear', (_, layout) => {
	it('packs many small items around it on every page', () => {
		const sizes = Array.from({ length: 120 }, (_, i) => ({
			w: 20 + (i % 5) * 7,
			h: 25 + (i % 3) * 9
		}));
		const g = geom();
		const r = layout(
			sizes.map((s) => item(s.w, s.h)),
			g
		);
		expect(r.overflow).toBeUndefined();
		expect(r.pages.length).toBeGreaterThan(1);
		const bs = boxes(r, sizes, g);
		expect(bs.filter((b) => hitsKeepOut(b, g, g.gap))).toEqual([]);
		// The top row still uses the space left of the mark.
		expect(bs.some((b) => b.page === 0 && b.y === 0)).toBe(true);
	});

	it('drops an item too wide to sit beside it below it', () => {
		const sizes = [{ w: 280, h: 100 }];
		const g = geom();
		const r = layout([item(280, 100)], g);
		const [b] = boxes(r, sizes, g);
		expect(b.y).toBeGreaterThanOrEqual(KO.height + g.gap - 1e-9);
	});

	it('reports overflow for an item that fits neither beside nor below it', () => {
		const g = geom();
		const r = layout([item(280, 280)], g);
		expect(r.overflow?.itemIndex).toBe(0);
		expect(r.overflow!.requiredScale).toBeGreaterThan(1);
	});

	it('leaves layout untouched without a keep-out', () => {
		const r = layout([item(280, 280)], geom({ keepOut: undefined }));
		expect(r.overflow).toBeUndefined();
		expect(r.origins[0].y).toBe(0);
	});
});

describe('nest keeps the registration mark clear', () => {
	const ng = (over: Partial<NestGeom> = {}): NestGeom => ({
		...geom(),
		rotationStep: 0,
		cellMm: 1,
		...over
	});

	it('packs many small squares around it', () => {
		const g = ng();
		const shapes = Array.from({ length: 80 }, () => rect(20, 20));
		const r = nestPageLayout(shapes, g);
		expect(r.overflow).toBeUndefined();
		const bs = boxes(
			r,
			shapes.map(() => ({ w: 20, h: 20 })),
			g
		);
		expect(bs.filter((b) => hitsKeepOut(b, g, 0))).toEqual([]);
		expect(bs.some((b) => b.page === 0 && b.y < KO.height)).toBe(true);
	});

	it('reports overflow for a piece that fits neither beside nor below it', () => {
		const r = nestPageLayout([rect(280, 280)], ng());
		expect(r.overflow?.itemIndex).toBe(0);
	});
});
