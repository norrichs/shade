import type { PathSegment } from '$lib/types';
import { CHAR_GAP } from '$lib/svg-text-metrics';
import type { PageRect } from '../page-layout/types';
import type { PageLabelConfig } from '../hole-drop-config';
import type { Disconnect, PageLabelResult, PlacedBand, Pt } from '../post-process-types';
import { pointInPolygon } from '../path-contours';
import { segmentsIntersect, segmentsOf, type Seg } from './segments';

/** The processed stroke-font dictionary (`svgTextDictionary`), narrowed to what is read here. */
export type GlyphDict = Record<string, { path: PathSegment[]; width: number }>;

export const PAGE_LABEL_HEIGHT_MM = 4;

type Box = { x: number; y: number; width: number; height: number };

export const composePageLabel = (
	cfg: PageLabelConfig | undefined,
	configName: string | undefined,
	pageIndex: number,
	pageCount: number
): string => {
	if (!cfg) return '';
	return [
		cfg.text.trim(),
		cfg.configName ? (configName?.trim() ?? '') : '',
		cfg.pageNumber ? `${pageIndex + 1} of ${pageCount}` : ''
	]
		.filter(Boolean)
		.join(' - ');
};

/** The stroke font has a fixed glyph set; any other character would crash `getChars`. */
export const sanitizeLabelText = (text: string, dict: GlyphDict): string =>
	[...text].map((c) => (dict[c] ? c : '?')).join('');

/**
 * Glyph-space bbox of `text` as SvgText lays it out with `offset: {x: 0, y: 0}`:
 * each glyph at `running - width / 2`, advancing by `width + CHAR_GAP`.
 */
export const measureText = (text: string, dict: GlyphDict) => {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	let running = 0;
	for (const c of [...text]) {
		const g = dict[c];
		if (!g) continue;
		running += g.width + CHAR_GAP;
		const dx = running - g.width / 2;
		for (const s of g.path) {
			for (let i = 1; i + 1 < s.length; i += 2) {
				const x = (s[i] as number) + dx;
				const y = s[i + 1] as number;
				minX = Math.min(minX, x);
				maxX = Math.max(maxX, x);
				minY = Math.min(minY, y);
				maxY = Math.max(maxY, y);
			}
		}
	}
	if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
	return { minX, minY, maxX, maxY };
};

const boxHits = (b: Box, obstacles: Seg[], solids: Pt[][]): boolean => {
	const corners = [
		{ x: b.x, y: b.y },
		{ x: b.x + b.width, y: b.y },
		{ x: b.x + b.width, y: b.y + b.height },
		{ x: b.x, y: b.y + b.height }
	];
	const edges: Seg[] = corners.map((a, i) => ({ a, b: corners[(i + 1) % 4] }));
	const inBox = (p: Pt) => p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
	for (const s of [...obstacles, ...segmentsOf(solids)]) {
		if (inBox(s.a) || inBox(s.b)) return true;
		if (edges.some((e) => segmentsIntersect(e, s))) return true;
	}
	const centre = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
	return solids.some((poly) => poly.length > 3 && pointInPolygon(centre, poly));
};

/**
 * First box position — scanning from the bottom-right of `content` leftwards,
 * then upwards — that touches no obstacle segment and sits in no solid.
 * Exact segment tests, not bboxes: a curved band's bbox covers the corner.
 * Returns the box's top-left, or null.
 */
export const placeBox = (args: {
	content: Box;
	width: number;
	height: number;
	obstacles: Seg[];
	solids: Pt[][];
}): Pt | null => {
	const { content, width, height, obstacles, solids } = args;
	if (!(width > 0) || !(height > 0) || width > content.width || height > content.height) return null;
	const stepX = width / 4;
	const stepY = height / 2;
	for (let y = content.y + content.height - height; y >= content.y - 1e-9; y -= stepY) {
		for (let x = content.x + content.width - width; x >= content.x - 1e-9; x -= stepX) {
			if (!boxHits({ x, y, width, height }, obstacles, solids)) return { x, y };
		}
	}
	return null;
};

export const buildPageLabels = (args: {
	pages: PageRect[];
	marginPx: number;
	pageScale: number;
	bands: PlacedBand[];
	disconnects: Disconnect[];
	config: PageLabelConfig | undefined;
	configName: string | undefined;
	dict: GlyphDict;
}): PageLabelResult[] => {
	const { pages, marginPx, pageScale, bands, disconnects, config, configName, dict } = args;
	const out: PageLabelResult[] = [];
	pages.forEach((page, p) => {
		const text = sanitizeLabelText(composePageLabel(config, configName, p, pages.length), dict);
		if (!text) return;
		const m = measureText(text, dict);
		const glyphH = m.maxY - m.minY || 1;
		const size = (PAGE_LABEL_HEIGHT_MM * pageScale) / glyphH;
		const clearance = size * 0.5;
		const width = (m.maxX - m.minX) * size + 2 * clearance;
		const height = glyphH * size + 2 * clearance;
		const onPage = bands.filter((b) => b.page === p);
		const at = placeBox({
			content: {
				x: page.x + marginPx,
				y: page.y + marginPx,
				width: page.width - 2 * marginPx,
				height: page.height - 2 * marginPx
			},
			width,
			height,
			obstacles: [
				...onPage.flatMap((b) => segmentsOf(b.holes)),
				...disconnects.filter((d) => d.page === p).map((d) => ({ a: d.a, b: d.b }))
			],
			solids: onPage.flatMap((b) => b.outlines)
		});
		if (!at) {
			out.push({ page: p, text, origin: { x: 0, y: 0 }, size, unplaced: true });
			return;
		}
		out.push({
			page: p,
			text,
			size,
			origin: { x: at.x + clearance - m.minX * size, y: at.y + clearance - m.minY * size }
		});
	});
	return out;
};
