import type { PageRect } from '$lib/cut-pattern/page-layout/types';

export type ExportFrame = {
	width: string;
	height: string;
	viewBox: string;
	/** Wrap all exported content in a `<g>` with this transform: maps pattern units to mm. */
	contentTransform: string;
	widthMm: number;
	heightMm: number;
};

const round = (n: number) => {
	const r = Math.round(n * 1e6) / 1e6;
	return r === 0 ? 0 : r;
};

/**
 * Root attributes that make the exported SVG's user unit one millimetre, so any
 * importer sizes it correctly whatever its DPI setting or viewBox handling.
 */
export const exportFrame = (pages: PageRect[], pageScale: number): ExportFrame => {
	if (pages.length === 0) throw new Error('exportFrame: no pages to export');
	if (!(pageScale > 0)) throw new Error(`exportFrame: invalid pageScale ${pageScale}`);
	const minX = Math.min(...pages.map((p) => p.x));
	const minY = Math.min(...pages.map((p) => p.y));
	const maxX = Math.max(...pages.map((p) => p.x + p.width));
	const maxY = Math.max(...pages.map((p) => p.y + p.height));
	const widthMm = round((maxX - minX) / pageScale);
	const heightMm = round((maxY - minY) / pageScale);
	return {
		width: `${widthMm}mm`,
		height: `${heightMm}mm`,
		viewBox: `0 0 ${widthMm} ${heightMm}`,
		contentTransform: `scale(${round(1 / pageScale)}) translate(${round(-minX)} ${round(-minY)})`,
		widthMm,
		heightMm
	};
};
