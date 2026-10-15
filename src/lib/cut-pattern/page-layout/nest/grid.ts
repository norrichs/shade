import type { Raster } from './types';

/** Occupancy grid with per-row prefix sums for O(spans) fit tests. */
export class Grid {
	occ: Uint8Array;
	pre: Int32Array;
	/** Occupied cell count, kept current by rebuildRow. */
	filled = 0;
	constructor(
		readonly W: number,
		readonly H: number
	) {
		this.occ = new Uint8Array(W * H);
		this.pre = new Int32Array(H * (W + 1));
	}

	fits(r: Raster, gx: number, gy: number): boolean {
		if (gy < 0 || gx < 0 || gy + r.h > this.H || gx + r.w > this.W) return false;
		const S = this.W + 1;
		for (let i = 0; i < r.h; i++) {
			const row = r.rows[i];
			if (row.length === 0) continue;
			const base = (gy + i) * S + gx;
			for (const [a, b] of row) if (this.pre[base + b] - this.pre[base + a] !== 0) return false;
		}
		return true;
	}

	/** Mark the raster's cells; anything outside the grid is clipped. */
	place(r: Raster, gx: number, gy: number) {
		for (let i = 0; i < r.h; i++) {
			const row = r.rows[i];
			const y = gy + i;
			if (row.length === 0 || y < 0 || y >= this.H) continue;
			for (const [a, b] of row) {
				const x0 = Math.max(0, gx + a);
				const x1 = Math.min(this.W, gx + b);
				if (x1 > x0) this.occ.fill(1, y * this.W + x0, y * this.W + x1);
			}
			this.rebuildRow(y);
		}
	}

	rebuildRow(y: number) {
		const S = this.W + 1;
		const before = this.pre[y * S + this.W];
		let acc = 0;
		this.pre[y * S] = 0;
		for (let x = 0; x < this.W; x++) {
			acc += this.occ[y * this.W + x];
			this.pre[y * S + x + 1] = acc;
		}
		this.filled += acc - before;
	}

	/**
	 * c×c block reduction. A block that runs past W/H counts as busy, so a coarse
	 * fit at (GX, GY) implies a fine fit at (GX·c, GY·c) for the coarsened raster.
	 */
	coarsen(c: number): Grid {
		const cw = Math.ceil(this.W / c);
		const ch = Math.ceil(this.H / c);
		const g = new Grid(cw, ch);
		for (let Y = 0; Y < ch; Y++) {
			for (let X = 0; X < cw; X++) {
				let busy = (X + 1) * c > this.W || (Y + 1) * c > this.H;
				for (let y = Y * c; !busy && y < (Y + 1) * c; y++)
					for (let x = X * c; !busy && x < (X + 1) * c; x++) busy = this.occ[y * this.W + x] === 1;
				if (busy) g.occ[Y * cw + X] = 1;
			}
			g.rebuildRow(Y);
		}
		return g;
	}
}
