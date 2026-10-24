import { Vector3 } from 'three';
import type { PageGeom, PageLayoutResult, PageRect } from '../types';
import type { NestShape, Pt, Raster } from './types';
import {
	areaOf,
	coarsenRaster,
	dilateRaster,
	nestAngles,
	rasterizeConvex,
	rotateAbout
} from './raster';
import { Grid } from './grid';
import { keepOutFitFactor } from '../registration-mark';

export type NestGeom = PageGeom & { rotationStep: number; cellMm: number };
export const NEST_CELL_MM = 1;
const NEST_MAX_CELLS = 250_000;
const NEST_COARSE = 4;

const EPS = 1e-6;

const nestCellSize = (g: NestGeom): number =>
	Math.max(g.cellMm * g.pageScale, Math.sqrt((g.contentWidth * g.contentHeight) / NEST_MAX_CELLS));

type Prepared = {
	fine: Raster[];
	coarse: Raster[];
	bbox: { w: number; h: number }[];
	/** Fewest dilated cells over all angles: a page with fewer free cells cannot fit it. */
	need: number;
};
type Pos = { gx: number; gy: number };
type Hit = Pos & { a: number };

const bboxOf = (pts: Pt[]) => {
	if (pts.length === 0) return { w: 0, h: 0 };
	let x0 = Infinity,
		y0 = Infinity,
		x1 = -Infinity,
		y1 = -Infinity;
	for (const p of pts) {
		x0 = Math.min(x0, p.x);
		x1 = Math.max(x1, p.x);
		y0 = Math.min(y0, p.y);
		y1 = Math.max(y1, p.y);
	}
	return { w: x1 - x0, h: y1 - y0 };
};

/** Slide up, then left, one cell at a time, until neither moves. */
const compact = (grid: Grid, r: Raster, p: Pos): Pos => {
	let { gx, gy } = p;
	for (let moved = true; moved;) {
		moved = false;
		while (grid.fits(r, gx, gy - 1)) {
			gy--;
			moved = true;
		}
		while (grid.fits(r, gx - 1, gy)) {
			gx--;
			moved = true;
		}
	}
	return { gx, gy };
};

/** First coarse fit in row-major order, mapped to fine cells and compacted. */
const searchCoarse = (grid: Grid, coarseGrid: Grid, fine: Raster, coarse: Raster): Pos | null => {
	for (let GY = 0; GY + coarse.h <= coarseGrid.H; GY++)
		for (let GX = 0; GX + coarse.w <= coarseGrid.W; GX++)
			if (coarseGrid.fits(coarse, GX, GY))
				return compact(grid, fine, { gx: GX * NEST_COARSE, gy: GY * NEST_COARSE });
	return null;
};

/**
 * Cheap fine scan limited to placements that reach the right/bottom partial coarse
 * block (which coarse treats as busy), rows then columns, then compacted. It does NOT
 * cover every fit coarse misses: fits at fine offsets that are not 4-aligned, next to
 * partly occupied blocks, are found only by the exhaustive `searchFine`.
 */
const searchEdge = (grid: Grid, fine: Raster): Pos | null => {
	const Wu = Math.floor(grid.W / NEST_COARSE) * NEST_COARSE;
	const Hu = Math.floor(grid.H / NEST_COARSE) * NEST_COARSE;
	const edgeX = Math.max(0, Wu - fine.w + 1);
	for (let gy = 0; gy + fine.h <= grid.H; gy++)
		for (let gx = gy + fine.h > Hu ? 0 : edgeX; gx + fine.w <= grid.W; gx++)
			if (grid.fits(fine, gx, gy)) return compact(grid, fine, { gx, gy });
	return null;
};

/** Exhaustive fine scan, rows then columns. */
const searchFine = (grid: Grid, fine: Raster): Pos | null => {
	for (let gy = 0; gy + fine.h <= grid.H; gy++)
		for (let gx = 0; gx + fine.w <= grid.W; gx++) if (grid.fits(fine, gx, gy)) return { gx, gy };
	return null;
};

/** Best angle by (gy + h, gx) lexicographic, lower better; ties keep the earlier angle. */
const bestOver = (prep: Prepared, find: (a: number) => Pos | null): Hit | null => {
	let best: Hit | null = null;
	let bestBottom = Infinity;
	for (let a = 0; a < prep.fine.length; a++) {
		const p = find(a);
		if (!p) continue;
		const bottom = p.gy + prep.fine[a].h;
		if (!best || bottom < bestBottom || (bottom === bestBottom && p.gx < best.gx)) {
			best = { ...p, a };
			bestBottom = bottom;
		}
	}
	return best;
};

/** Per-angle scale-up factor needed for the undilated bbox to fit the content box beside or below the keep-out. */
const fitFactor = (
	prep: Prepared,
	cw: number,
	ch: number,
	keepOut?: PageGeom['keepOut'],
	gap = 0
) => prep.bbox.map((b) => keepOutFitFactor(b.w, b.h, cw, ch, keepOut, gap));

export const nestPageLayout = (shapes: NestShape[], geom: NestGeom): PageLayoutResult => {
	const {
		pageScale,
		pageWidth,
		pageHeight,
		contentWidth,
		contentHeight,
		marginPx,
		pageGap,
		gap,
		keepOut
	} = geom;
	const cell = nestCellSize(geom);
	// Each piece is dilated by k cells, so two non-overlapping dilated rasters keep
	// ≥ 2k cells between the real pieces; the +1 covers rasterisation rounding and
	// the lattice disk in dilateRaster falling up to ~0.4 cell short of a true disk.
	const k = Math.ceil(gap / 2 / cell) + 1;
	const CW = Math.ceil(contentWidth / cell);
	const CH = Math.ceil(contentHeight / cell);
	const W = CW + 2 * k;
	const H = CH + 2 * k;
	const angles = nestAngles(geom.rotationStep);

	const prepared: Prepared[] = shapes.map((s) => {
		const out: Prepared = { fine: [], coarse: [], bbox: [], need: 0 };
		for (const theta of angles) {
			const polys = s.polygons.map((p) => rotateAbout(p, theta, s.pivot));
			const fine = dilateRaster(rasterizeConvex(polys, cell), k);
			out.fine.push(fine);
			out.coarse.push(coarsenRaster(fine, NEST_COARSE));
			out.bbox.push(bboxOf(polys.flat()));
		}
		out.need = Math.min(...out.fine.map((r) => areaOf(r.rows)));
		return out;
	});
	const hasGeom = (i: number) => prepared[i].fine[0].h > 0;

	// Overflow pre-check: the worst factor among shapes that fit at no angle.
	let worst = -1;
	let factor = 0;
	prepared.forEach((p, i) => {
		if (!hasGeom(i)) return;
		const f = Math.min(...fitFactor(p, contentWidth, contentHeight, keepOut, gap));
		if (f <= 1 + EPS) return;
		if (f > factor) {
			factor = f;
			worst = i;
		}
	});
	if (worst >= 0) {
		return {
			origins: [],
			rotations: [],
			pages: [],
			overflow: { itemIndex: worst, requiredScale: pageScale * factor }
		};
	}

	const order = shapes
		.map((_, i) => i)
		.sort((a, b) => prepared[b].fine[0].area - prepared[a].fine[0].area || a - b);

	const origins: Vector3[] = new Array(shapes.length);
	const rotations: number[] = new Array(shapes.length).fill(0);
	const pages: PageRect[] = [];
	type PageState = { grid: Grid; coarse: Grid; used: number };
	const state: PageState[] = [];
	// The keep-out in grid cells, dilated by k like every piece so the two stay
	// ≥ 2k cells apart. Content cell (0, 0) is grid (k, k); the far side runs into
	// the ring. Not counted in `used`, so utilisation stays about the pieces.
	const keepOutStamp: { r: Raster; gx: number } | null = (() => {
		if (!keepOut) return null;
		const gx = Math.max(0, Math.floor((contentWidth - keepOut.width) / cell));
		const h = Math.min(H, Math.ceil(keepOut.height / cell) + 2 * k);
		const w = W - gx;
		if (w <= 0 || h <= 0) return null;
		const rows = Array.from({ length: h }, (): [number, number][] => [[0, w]]);
		return { r: { w, h, rows, ox: 0, oy: 0, area: w * h }, gx };
	})();
	const newPage = () => {
		pages.push({
			x: 0,
			y: pages.length * (pageHeight + pageGap),
			width: pageWidth,
			height: pageHeight
		});
		const grid = new Grid(W, H);
		if (keepOutStamp) grid.place(keepOutStamp.r, keepOutStamp.gx, 0);
		state.push({ grid, coarse: grid.coarsen(NEST_COARSE), used: 0 });
	};
	newPage();

	// Coarse, then the cheap edge-band fine scan. Earlier pages stop there for speed and
	// may miss fits at non-4-aligned interior offsets; the last open page and a fresh
	// page also get the exhaustive fine scan, so nothing that fits the newest page spills.
	const search = (prep: Prepared, pg: PageState, exhaustive = false) =>
		bestOver(prep, (a) => searchCoarse(pg.grid, pg.coarse, prep.fine[a], prep.coarse[a])) ??
		bestOver(prep, (a) => searchEdge(pg.grid, prep.fine[a])) ??
		(exhaustive ? bestOver(prep, (a) => searchFine(pg.grid, prep.fine[a])) : null);

	for (const i of order) {
		const s = shapes[i];
		if (!hasGeom(i)) {
			origins[i] = new Vector3(marginPx, pages[pages.length - 1].y + marginPx, 0);
			continue;
		}
		const prep = prepared[i];
		// First fit across all open pages, in page order, so later (smaller) pieces
		// backfill gaps left on earlier pages. A page whose free cells cannot hold the
		// piece's dilated raster at any angle is skipped without searching.
		let p = -1;
		let hit: Hit | null = null;
		for (let q = 0; q < state.length && !hit; q++) {
			if (W * H - state[q].grid.filled < prep.need) continue;
			hit = search(prep, state[q], q === state.length - 1);
			if (hit) p = q;
		}
		if (!hit) {
			// Never spill from an empty page: fall back onto it instead. An empty last
			// page already got the exhaustive search above (or was skipped because it
			// cannot hold the piece), so only a freshly opened page is searched again.
			if (state[state.length - 1].used > 0) {
				newPage();
				hit = search(prep, state[state.length - 1], true);
			}
			p = state.length - 1;
			hit ??= fallbackHit(prep, contentWidth, contentHeight);
		}
		const pg = state[p];
		const r = prep.fine[hit.a];
		const X0 = marginPx - k * cell;
		const Y0 = pages[p].y + marginPx - k * cell;
		origins[i] = new Vector3(
			X0 + (hit.gx - r.ox) * cell - s.pivot.x,
			Y0 + (hit.gy - r.oy) * cell - s.pivot.y,
			0
		);
		rotations[i] = angles[hit.a];
		pg.used += r.area;
		pg.grid.place(r, hit.gx, hit.gy);
		pg.coarse = pg.grid.coarsen(NEST_COARSE);
	}

	return {
		origins,
		rotations,
		pages,
		utilisation: state.map((pg) => Math.min(1, pg.used / (CW * CH)))
	};
};

/**
 * Only reached when a piece passes the bbox overflow pre-check but its dilated raster
 * cannot fit an empty grid (rounding): (0,0) at the best-fitting angle, clipped. Never throws.
 */
const fallbackHit = (prep: Prepared, cw: number, ch: number): Hit => {
	const fs = fitFactor(prep, cw, ch);
	return { gx: 0, gy: 0, a: fs.indexOf(Math.min(...fs)) };
};
