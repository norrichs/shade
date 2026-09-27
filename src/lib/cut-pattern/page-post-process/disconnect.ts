import type { Disconnect, PlacedBand, Pt } from '../post-process-types';
import type { PageRect } from '../page-layout/types';
import { pointInPolygon } from '../path-contours';
import { isFinitePt, raySegment, rectEdges, rotate, segmentsOf, type Seg } from './segments';

export const DISCONNECT_CONE_DEG = 30;
export const DISCONNECT_STEP_DEG = 2;
const MIN_T = 1e-6;

type Obstacle = { bandId: string; segs: Seg[]; polys: Pt[][] };

const inside = (p: Pt, r: PageRect) =>
	p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

const closed = (poly: Pt[]) =>
	poly.length > 3 &&
	poly[0].x === poly[poly.length - 1].x &&
	poly[0].y === poly[poly.length - 1].y;

/**
 * Straight cuts from each band end to whatever it meets first within a cone
 * around its outward axis: another band's outline, or the page edge. The
 * shortest hit wins, so edge bands reach the edge and interior bands reach
 * their neighbour.
 *
 * A band's own outline is not an obstacle: the end is the outline's extreme
 * point along the axis, and every ray in the ±30° cone has a positive
 * component along the axis, so it can never re-enter its own band.
 */
export const computeDisconnects = (
	bands: PlacedBand[],
	pages: PageRect[],
	dedupeDistance: number
): Disconnect[] => {
	const out: Disconnect[] = [];

	pages.forEach((page, p) => {
		const onPage = bands.filter((b) => b.page === p);
		const obstacles: Obstacle[] = onPage.map((b) => ({
			bandId: b.bandId,
			segs: segmentsOf(b.outlines),
			polys: b.outlines.filter(closed)
		}));
		const edges = rectEdges(page);

		for (const band of onPage) {
			if (!band.ends) continue;
			for (const end of [band.ends.start, band.ends.end]) {
				const o = end.point;
				if (!isFinitePt(o) || !isFinitePt(end.outward) || !inside(o, page)) continue;
				const buried = obstacles.some(
					(ob) => ob.bandId !== band.bandId && ob.polys.some((poly) => pointInPolygon(o, poly))
				);
				if (buried) continue;

				let best: { t: number; dir: Pt; toBand: string | null } | null = null;
				for (
					let deg = -DISCONNECT_CONE_DEG;
					deg <= DISCONNECT_CONE_DEG + 1e-9;
					deg += DISCONNECT_STEP_DEG
				) {
					const dir = rotate(end.outward, deg);
					let rayT = Infinity;
					let rayTo: string | null = null;
					for (const ob of obstacles) {
						if (ob.bandId === band.bandId) continue;
						for (const s of ob.segs) {
							const t = raySegment(o, dir, s);
							if (t !== null && t > MIN_T && t < rayT) {
								rayT = t;
								rayTo = ob.bandId;
							}
						}
					}
					for (const s of edges) {
						const t = raySegment(o, dir, s);
						if (t !== null && t > MIN_T && t < rayT) {
							rayT = t;
							rayTo = null;
						}
					}
					if (Number.isFinite(rayT) && (!best || rayT < best.t)) best = { t: rayT, dir, toBand: rayTo };
				}
				if (!best) continue;
				out.push({
					page: p,
					a: o,
					b: { x: o.x + best.dir.x * best.t, y: o.y + best.dir.y * best.t },
					fromBand: band.bandId,
					toBand: best.toBand
				});
			}
		}
	});

	return dedupe(out, dedupeDistance);
};

const len = (d: Disconnect) => Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y);
const near = (p: Pt, q: Pt, r: number) => Math.hypot(p.x - q.x, p.y - q.y) <= r;

/** Two neighbours reaching for each other produce two near-identical cuts; keep the shorter. */
const dedupe = (all: Disconnect[], r: number): Disconnect[] => {
	const dropped = new Set<number>();
	for (let i = 0; i < all.length; i += 1) {
		for (let j = i + 1; j < all.length; j += 1) {
			if (dropped.has(i) || dropped.has(j)) continue;
			const a = all[i];
			const b = all[j];
			if (a.page !== b.page || a.toBand !== b.fromBand || b.toBand !== a.fromBand) continue;
			if (!near(a.a, b.b, r) || !near(a.b, b.a, r)) continue;
			dropped.add(len(a) <= len(b) ? j : i);
		}
	}
	return all.filter((_, i) => !dropped.has(i));
};
