import { Vector3 } from 'three';

export const GAP_BETWEEN_BANDS = 20;
export const ROW_GAP = GAP_BETWEEN_BANDS;

export type WrapInput = {
	width: number;
	height: number;
	alignedYOffset: number;
	/**
	 * The box's left/top offset relative to the band origin (i.e. `bounds.left`/
	 * `bounds.top`). Origins are shifted by `-left`/`-top` so the *content* edges
	 * pack at a consistent gap even when boxes are offset asymmetrically — e.g.
	 * an external label that extends past the geometry on one side. Default 0.
	 */
	left?: number;
	top?: number;
};
export type WrapOpts = {
	gap?: number;
	rowGap?: number;
	lineWrap?: boolean;
	wrapWidth?: number;
};

export const computeWrappedOrigins = (bands: WrapInput[], opts: WrapOpts = {}): Vector3[] => {
	const gap = opts.gap ?? GAP_BETWEEN_BANDS;
	const rowGap = opts.rowGap ?? ROW_GAP;
	const lineWrap = opts.lineWrap ?? false;
	const wrapWidth = opts.wrapWidth ?? Infinity;

	let x = 0;
	let rowY = 0;
	let rowMaxHeight = 0;

	return bands.map(({ width, height, alignedYOffset, left = 0, top = 0 }) => {
		if (lineWrap && x > 0 && x + width > wrapWidth) {
			rowY += rowMaxHeight + rowGap;
			x = 0;
			rowMaxHeight = 0;
		}
		// Shift by -left/-top so the box's content edge — not the band origin —
		// lands at the running cursor, keeping inter-band gaps uniform.
		const origin = new Vector3(x - left, rowY + alignedYOffset - top, 0);
		x += width + gap;
		rowMaxHeight = Math.max(rowMaxHeight, height);
		return origin;
	});
};
