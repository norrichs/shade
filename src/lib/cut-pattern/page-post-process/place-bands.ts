import type { PathSegment } from '$lib/types';
import type { PageRect } from '../page-layout/types';
import type { BandContourIndex } from '../contour-index';
import type { Placement, PlacedBand, Pt, TaggedPath } from '../post-process-types';
import { flattenPath } from '../path-contours';

export const rotateDirection = (v: Pt, deg: number): Pt => {
	if (!deg) return v;
	const r = (deg * Math.PI) / 180;
	return { x: v.x * Math.cos(r) - v.y * Math.sin(r), y: v.x * Math.sin(r) + v.y * Math.cos(r) };
};

/**
 * Band-local → page space, exactly as `bandTransform(origin, rotation, pivot)`
 * renders it: `translate(origin) rotate(rotation pivot)`, i.e. rotate about the
 * pivot, then translate.
 */
export const toPageSpace = (p: Pt, pl: Placement): Pt => {
	if (!pl.rotation) return { x: p.x + pl.origin.x, y: p.y + pl.origin.y };
	const d = rotateDirection({ x: p.x - pl.pivot.x, y: p.y - pl.pivot.y }, pl.rotation);
	return { x: pl.origin.x + pl.pivot.x + d.x, y: pl.origin.y + pl.pivot.y + d.y };
};

/**
 * One prepared band in page space. Outlines come from the RAW merged path's
 * outline contours — closed, and present even when stage 2 drops or gaps the
 * outline, because the band still occupies that paper. Holes are only those
 * stage 2 kept.
 */
export const placeBand = (args: {
	bandId: string;
	placement: Placement;
	raw: PathSegment[];
	index: BandContourIndex;
	pieces: TaggedPath[];
	pages: PageRect[];
}): PlacedBand => {
	const { bandId, placement, raw, index, pieces, pages } = args;
	const move = (runs: Pt[][]) => runs.map((run) => run.map((p) => toPageSpace(p, placement)));
	const outlines = move(
		index.contours
			.filter((c) => c.kind === 'outline')
			.flatMap((c) => flattenPath(raw.slice(c.start, c.end)))
	);
	const holes = move(pieces.filter((p) => p.geometry === 'pattern-hole').flatMap((p) => flattenPath(p.segments)));

	const pts = outlines.flat();
	const cx = pts.length ? (Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2 : NaN;
	const cy = pts.length ? (Math.min(...pts.map((p) => p.y)) + Math.max(...pts.map((p) => p.y))) / 2 : NaN;
	let page = pages.findIndex(
		(r) => cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height
	);
	if (page < 0) page = -1;

	const ends = index.ends && {
		start: {
			point: toPageSpace(index.ends.start.point, placement),
			outward: rotateDirection(index.ends.start.outward, placement.rotation)
		},
		end: {
			point: toPageSpace(index.ends.end.point, placement),
			outward: rotateDirection(index.ends.end.outward, placement.rotation)
		}
	};
	return { bandId, page, outlines, holes, ends };
};
