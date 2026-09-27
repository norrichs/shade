import type { PathSegment } from '$lib/types';
import type { PageRect } from '$lib/cut-pattern/page-layout/types';
import type { GeometryType } from '$lib/cut-pattern/post-process-types';
import type { LbProject } from './types';
import { resolveLayer, type LayerMap } from './layers';

/** One exported drawable, already in page space (pattern units), M/L/C/Z only. */
export type ExportShape = { geometry: GeometryType; segments: PathSegment[] };

const centre = (segs: PathSegment[]) => {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const s of segs) {
		for (let i = 1; i + 1 < s.length; i += 2) {
			minX = Math.min(minX, s[i] as number);
			maxX = Math.max(maxX, s[i] as number);
			minY = Math.min(minY, s[i + 1] as number);
			maxY = Math.max(maxY, s[i + 1] as number);
		}
	}
	return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
};

const pageOf = (p: { x: number; y: number }, pages: PageRect[]) => {
	const hit = pages.findIndex(
		(r) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height
	);
	if (hit >= 0) return hit;
	let best = 0;
	let bestD = Infinity;
	pages.forEach((r, i) => {
		const d = Math.hypot(p.x - (r.x + r.width / 2), p.y - (r.y + r.height / 2));
		if (d < bestD) {
			bestD = d;
			best = i;
		}
	});
	return best;
};

/**
 * Page-space drawables → a LightBurn project in mm, Y up, one Group per page.
 * The page rect comes from layout data rather than the DOM, so DOM
 * `page-outline` shapes are skipped.
 */
export const buildLbProject = (args: {
	shapes: ExportShape[];
	pages: PageRect[];
	pageScale: number;
	layerMap?: LayerMap;
}): LbProject => {
	const { shapes, pages, pageScale, layerMap } = args;
	const minX = Math.min(...pages.map((p) => p.x));
	const maxY = Math.max(...pages.map((p) => p.y + p.height));
	const X = (x: number) => (x - minX) / pageScale;
	const Y = (y: number) => (maxY - y) / pageScale;
	const toMm = (segs: PathSegment[]): PathSegment[] =>
		segs.map((s): PathSegment => {
			switch (s[0]) {
				case 'M':
					return ['M', X(s[1]), Y(s[2])];
				case 'L':
					return ['L', X(s[1]), Y(s[2])];
				case 'C':
					return ['C', X(s[1]), Y(s[2]), X(s[3]), Y(s[4]), X(s[5]), Y(s[6])];
				case 'Z':
					return s;
				default:
					throw new Error(`buildLbProject: expected M/L/C/Z, got ${s[0]}`);
			}
		});

	const project: LbProject = {
		pages: pages.map((r) => ({
			shapes: [
				{
					kind: 'rect',
					cutIndex: resolveLayer('page-outline', layerMap).index,
					x: X(r.x),
					y: Y(r.y + r.height),
					width: r.width / pageScale,
					height: r.height / pageScale
				}
			]
		}))
	};
	for (const shape of shapes) {
		if (shape.geometry === 'page-outline' || shape.segments.length === 0) continue;
		project.pages[pageOf(centre(shape.segments), pages)].shapes.push({
			kind: 'path',
			cutIndex: resolveLayer(shape.geometry, layerMap).index,
			segments: toMm(shape.segments)
		});
	}
	return project;
};
